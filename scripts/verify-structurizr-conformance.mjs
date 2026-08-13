import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { ensureStructurizrToolchain } from "./bootstrap-structurizr.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, "..");

const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export function structurizrJavaArgs({ warPath, tempDirectory }, args) {
  if (!tempDirectory) throw new TypeError("tempDirectory is required");
  return [`-Djava.io.tmpdir=${tempDirectory}`, "-jar", warPath, ...args];
}

function runStructurizr({ javaPath, warPath }, args, tempDirectory) {
  const result = spawnSync(
    javaPath,
    structurizrJavaArgs({ warPath, tempDirectory }, args),
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(
      `Structurizr ${args[0]} failed:\n${result.stderr || result.stdout}`,
    );
  }
}

function requireDevRelayId(entity, label) {
  const id = entity.properties?.["devrelay.id"];
  if (!id) {
    throw new Error(`Structurizr export omits devrelay.id for ${label}`);
  }
  return id;
}

function normalizedElement(entity, type, parentId) {
  const normalized = {
    id: requireDevRelayId(entity, `${type} ${entity.name}`),
    name: entity.name,
    type,
    description: entity.description,
  };
  if (parentId) normalized.parentId = parentId;
  if (entity.technology) normalized.technology = entity.technology;
  return normalized;
}

function normalizeStructurizrWorkspace(workspace) {
  const elements = [];
  const numericToDevRelay = new Map();
  const allStructurizrElements = [];

  for (const system of workspace.model?.softwareSystems ?? []) {
    const systemId = requireDevRelayId(
      system,
      `software system ${system.name}`,
    );
    const systemEntry = normalizedElement(system, "software-system");
    elements.push(systemEntry);
    numericToDevRelay.set(system.id, systemId);
    allStructurizrElements.push(system);
    for (const container of system.containers ?? []) {
      const containerId = requireDevRelayId(
        container,
        `container ${container.name}`,
      );
      elements.push(normalizedElement(container, "container", systemId));
      numericToDevRelay.set(container.id, containerId);
      allStructurizrElements.push(container);
      for (const component of container.components ?? []) {
        elements.push(normalizedElement(component, "component", containerId));
        numericToDevRelay.set(
          component.id,
          requireDevRelayId(component, `component ${component.name}`),
        );
        allStructurizrElements.push(component);
      }
    }
  }

  const relationships = [];
  const relationshipNumericToDevRelay = new Map();
  for (const source of allStructurizrElements) {
    for (const relation of source.relationships ?? []) {
      const id = requireDevRelayId(relation, "relationship");
      const sourceElementId = numericToDevRelay.get(relation.sourceId);
      const targetElementId = numericToDevRelay.get(relation.destinationId);
      if (!sourceElementId || !targetElementId) {
        throw new Error(
          `Structurizr relationship ${id} has an unmapped endpoint`,
        );
      }
      relationships.push({
        id,
        sourceElementId,
        targetElementId,
        description: relation.description,
      });
      relationshipNumericToDevRelay.set(relation.id, id);
    }
  }

  const normalizeView = (view, type, scopeNumericId) => {
    const scopeElementId = numericToDevRelay.get(scopeNumericId);
    if (!scopeElementId) {
      throw new Error(`Structurizr view ${view.key} has an unmapped scope`);
    }
    return {
      viewKey: view.key,
      type,
      scopeElementId,
      elementIds: (view.elements ?? [])
        .map(({ id }) => numericToDevRelay.get(id))
        .sort(),
      relationshipIds: (view.relationships ?? [])
        .map(({ id }) => relationshipNumericToDevRelay.get(id))
        .sort(),
    };
  };
  const views = [
    ...(workspace.views?.containerViews ?? []).map((view) =>
      normalizeView(view, "container", view.softwareSystemId),
    ),
    ...(workspace.views?.componentViews ?? []).map((view) =>
      normalizeView(view, "component", view.containerId),
    ),
  ];

  return {
    elements: elements.sort((left, right) => left.id.localeCompare(right.id)),
    relationships: relationships.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    views: views.sort((left, right) =>
      left.viewKey.localeCompare(right.viewKey),
    ),
  };
}

function normalizeDevRelayCandidate(candidate) {
  const model = candidate.sections.architectureModel.content;
  const diagrams = candidate.sections.diagrams.content;
  return {
    elements: model.elements
      .map((entity) => {
        const normalized = {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          description: entity.description,
        };
        if (entity.parentId) normalized.parentId = entity.parentId;
        if (entity.technology) normalized.technology = entity.technology;
        return normalized;
      })
      .sort((left, right) => left.id.localeCompare(right.id)),
    relationships: model.relationships
      .map(({ id, sourceElementId, targetElementId, description }) => ({
        id,
        sourceElementId,
        targetElementId,
        description,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    views: diagrams.views
      .map(
        ({ viewKey, type, scopeElementId, elementIds, relationshipIds }) => ({
          viewKey,
          type,
          scopeElementId,
          elementIds: [...elementIds].sort(),
          relationshipIds: [...relationshipIds].sort(),
        }),
      )
      .sort((left, right) => left.viewKey.localeCompare(right.viewKey)),
  };
}

export function createStructurizrConformanceProof({
  lock,
  workspaceBytes,
  candidateBytes,
  normalizedWorkspace,
  normalizedWorkspaceBytes,
}) {
  const proofMaterial = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "StructurizrConformanceProof",
    status: "pass",
    parser: {
      product: "Structurizr",
      version: lock.structurizr.version,
      artifactDigest: `sha256:${lock.structurizr.sha256}`,
      runtimeRequirement: { product: "Java", majorVersion: 21 },
    },
    inputs: {
      workspaceDigest: sha256(workspaceBytes),
      candidateDigest: sha256(candidateBytes),
    },
    export: {
      format: "json",
      normalization: "devrelay-c4-model/v1",
      normalizedModelDigest: sha256(normalizedWorkspaceBytes),
    },
    comparison: {
      elements: {
        count: normalizedWorkspace.elements.length,
        digest: canonicalJsonDigest(normalizedWorkspace.elements),
        match: true,
      },
      relationships: {
        count: normalizedWorkspace.relationships.length,
        digest: canonicalJsonDigest(normalizedWorkspace.relationships),
        match: true,
      },
      hierarchy: {
        digest: canonicalJsonDigest(
          normalizedWorkspace.elements.map(({ id, type, parentId }) => ({
            id,
            type,
            ...(parentId ? { parentId } : {}),
          })),
        ),
        match: true,
      },
      views: {
        count: normalizedWorkspace.views.length,
        digest: canonicalJsonDigest(normalizedWorkspace.views),
        match: true,
      },
    },
  };
  return Object.freeze({
    ...proofMaterial,
    contentDigest: canonicalJsonDigest(proofMaterial),
  });
}

export async function verifyStructurizrConformance({
  rootPath = defaultRoot,
  workspacePath,
  candidatePath,
  outputDirectory,
}) {
  if (!workspacePath || !candidatePath || !outputDirectory) {
    throw new TypeError(
      "workspacePath, candidatePath, and outputDirectory are required",
    );
  }
  const absoluteWorkspace = path.resolve(rootPath, workspacePath);
  const absoluteCandidate = path.resolve(rootPath, candidatePath);
  const absoluteOutput = path.resolve(rootPath, outputDirectory);
  await mkdir(absoluteOutput, { recursive: true });
  const exportedPath = path.join(absoluteOutput, "workspace.json");
  await rm(exportedPath, { force: true });

  const toolchain = await ensureStructurizrToolchain({ rootPath });
  const javaTempDirectory = await mkdtemp(
    path.join(absoluteOutput, ".structurizr-java-tmp-"),
  );
  try {
    runStructurizr(
      toolchain,
      ["validate", "-workspace", absoluteWorkspace],
      javaTempDirectory,
    );
    runStructurizr(
      toolchain,
      [
        "export",
        "-workspace",
        absoluteWorkspace,
        "-format",
        "json",
        "-output",
        absoluteOutput,
      ],
      javaTempDirectory,
    );

    const [workspaceBytes, candidateBytes, exportedBytes] = await Promise.all([
      readFile(absoluteWorkspace),
      readFile(absoluteCandidate),
      readFile(exportedPath),
    ]);
    const candidate = JSON.parse(candidateBytes);
    const exported = JSON.parse(exportedBytes);
    const expected = normalizeDevRelayCandidate(candidate);
    const actual = normalizeStructurizrWorkspace(exported);
    assert.deepEqual(
      actual,
      expected,
      "official Structurizr export diverges from the canonical DevRelay architecture",
    );

    const expectedBytes = Buffer.from(
      `${JSON.stringify(expected, null, 2)}\n`,
      "utf8",
    );
    const actualBytes = Buffer.from(
      `${JSON.stringify(actual, null, 2)}\n`,
      "utf8",
    );
    await Promise.all([
      writeFile(
        path.join(absoluteOutput, "normalized-devrelay.json"),
        expectedBytes,
      ),
      writeFile(
        path.join(absoluteOutput, "normalized-structurizr.json"),
        actualBytes,
      ),
    ]);

    return createStructurizrConformanceProof({
      lock: toolchain.lock,
      workspaceBytes,
      candidateBytes,
      normalizedWorkspace: actual,
      normalizedWorkspaceBytes: actualBytes,
    });
  } finally {
    await rm(javaTempDirectory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const proof = await verifyStructurizrConformance({
    workspacePath:
      process.argv[2] ??
      "dogfood/work-dependency-analysis/architecture-design/workspace.dsl",
    candidatePath:
      process.argv[3] ??
      "dogfood/work-dependency-analysis/architecture-design/architecture-change-set-draft.json",
    outputDirectory:
      process.argv[4] ?? ".devrelay/conformance/work-dependency-analysis",
  });
  console.log(JSON.stringify(proof, null, 2));
}
