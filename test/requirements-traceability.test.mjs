import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  requirementsBaselineObserverContributor,
  requirementsControlTraceabilityContributor,
  requirementsTraceabilityContributor,
} from "../src/requirements-traceability-contributor.mjs";
import { validateTraceabilityUpdate } from "../src/traceability-artifact-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../src/traceability-graph.mjs";

const readJson = async (relative) =>
  JSON.parse(await readFile(new URL(`../${relative}`, import.meta.url), "utf8"));

const readBytes = async (relative) =>
  readFile(new URL(`../${relative}`, import.meta.url));

const fixtures = await Promise.all([
  readJson("examples/artifacts/requirements-draft-001.json"),
  readJson("examples/artifacts/project-overview-draft-001.json"),
  readJson("examples/results/requirements-openspec.result.json"),
  readJson("examples/artifacts/requirements-change-set-001.json"),
  readJson("examples/artifacts/project-overview-change-set-draft-001.json"),
  readJson("examples/results/requirements-openspec-change-set.result.json"),
  readJson("examples/artifacts/requirements-baseline-001.json"),
  readJson("examples/artifacts/project-overview-baseline-001.json"),
  readJson("examples/results/architecture-establish-baseline.result.json"),
]);

const [
  requirementsDraft,
  overviewDraft,
  requirementsResult,
  requirementsChange,
  overviewChange,
  requirementsChangeResult,
  requirementsBaseline,
  overviewBaseline,
  architectureResult,
] = fixtures;

function entry(ref, value) {
  return { ref: structuredClone(ref), value: structuredClone(value) };
}

function requirementsContext({ change = false } = {}) {
  const result = change ? requirementsChangeResult : requirementsResult;
  return {
    graphId: "graph-auth",
    projectId: "auth-product",
    invocation: {
      module: {
        id: "requirements-gathering",
        version: "0.1.0",
        operation: "gather",
      },
    },
    moduleResult: structuredClone(result),
    loadedInputs: {},
    loadedOutputs: change
      ? {
          "requirements-change-set": [
            entry(result.outputs["requirements-change-set"][0], requirementsChange),
          ],
          "project-overview-change-set-draft": [
            entry(
              result.outputs["project-overview-change-set-draft"][0],
              overviewChange,
            ),
          ],
        }
      : {
          "requirements-draft": [
            entry(result.outputs["requirements-draft"][0], requirementsDraft),
          ],
          "project-overview-draft": [
            entry(result.outputs["project-overview-draft"][0], overviewDraft),
          ],
        },
  };
}

function baselineObserverContext() {
  const requirementsRef = {
    artifactId: "requirements-baseline-001",
    schema: "https://devrelay.dev/artifacts/requirements-baseline/v1",
    mediaType: "application/vnd.devrelay.requirements-baseline+json",
    digest: "sha256:64ca43ac7020da1f25d5ef4c66ad99bb7467b3b6943cab4beb66ca67b71db8cd",
    uri: "file:///workspace/.devrelay/artifacts/requirements-baseline-001.json",
  };
  const overviewRef = {
    artifactId: "project-overview-baseline-001",
    schema: "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    mediaType: "application/vnd.devrelay.project-overview-baseline+json",
    digest: "sha256:3bc5de2179172ac584fbc7178abd6764f0c4ed09aca3a1681158715734e60d24",
    uri: "file:///workspace/.devrelay/artifacts/project-overview-baseline-001.json",
  };
  return {
    graphId: "graph-auth",
    projectId: "auth-product",
    invocation: {
      module: {
        id: "architecture-design",
        version: "0.1.0",
        operation: "establish-baseline",
      },
    },
    moduleResult: structuredClone(architectureResult),
    loadedInputs: {
      "requirements-baseline": [entry(requirementsRef, requirementsBaseline)],
      "project-overview-baseline": [entry(overviewRef, overviewBaseline)],
    },
    loadedOutputs: {},
  };
}

function findNode(projected, kind, stableId) {
  return projected.nodes.find(
    (node) => node.kind === kind && node.stableId === stableId,
  );
}

function findEdge(projected, kind, sourceKind, sourceId, targetKind, targetId) {
  return projected.edges.find(
    (edge) =>
      edge.kind === kind &&
      edge.source.kind === sourceKind &&
      edge.source.stableId === sourceId &&
      edge.target.kind === targetKind &&
      edge.target.stableId === targetId,
  );
}

test("Requirements contributor projects the complete typed candidate deterministically", async () => {
  const context = requirementsContext();
  assert.equal(requirementsTraceabilityContributor.match(context), true);
  assert.equal(requirementsTraceabilityContributor.scope, "requirements/candidate");
  assert.equal(requirementsTraceabilityContributor.authority, "candidate");

  const first = await requirementsTraceabilityContributor.project(context);
  const second = await requirementsTraceabilityContributor.project(context);
  assert.deepEqual(first, second);
  assert.equal(first.horizon, "requirements");
  assert.equal(first.nodes.length, 18);
  assert.equal(first.edges.length, 36);
  assert.deepEqual(
    first.nodes,
    [...first.nodes].sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right), "en"),
    ),
  );

  const artifactNodes = first.nodes.filter(
    ({ kind }) => kind === "artifact-reference",
  );
  assert.equal(artifactNodes.length, 2);
  for (const artifactNode of artifactNodes) {
    assert.deepEqual(Object.keys(artifactNode.attributes), ["artifact"]);
    assert.equal(
      artifactNode.stableId,
      canonicalJsonDigest({
        schema: artifactNode.attributes.artifact.schema,
        artifactId: artifactNode.attributes.artifact.artifactId,
        digest: artifactNode.attributes.artifact.digest,
      }),
    );
  }

  const objective = findNode(
    first,
    "business-objective",
    "BO-AUTH-ACCESS-001",
  );
  assert.ok(objective);
  assert.deepEqual(objective.sourceLocators[0], {
    artifact: {
      artifactId: "requirements-draft-001",
      digest: requirementsResult.outputs["requirements-draft"][0].digest,
    },
    jsonPointer: "/requirements/businessObjectives/0",
    entityDigest: canonicalJsonDigest(
      requirementsDraft.requirements.businessObjectives[0],
    ),
  });

  assert.ok(
    findEdge(
      first,
      "realized-by",
      "business-objective",
      "BO-AUTH-ACCESS-001",
      "capability",
      "CAP-AUTH-SESSION-001",
    ),
  );
  assert.ok(
    findEdge(
      first,
      "specified-by",
      "capability",
      "CAP-AUTH-SESSION-001",
      "user-story",
      "US-AUTH-SESSION-001",
    ),
  );
  assert.ok(
    findEdge(
      first,
      "accepted-by",
      "user-story",
      "US-AUTH-SESSION-001",
      "acceptance-criterion",
      "AC-AUTH-001",
    ),
  );
  assert.ok(
    findEdge(
      first,
      "owned-by",
      "business-objective",
      "BO-AUTH-ACCESS-001",
      "stakeholder",
      "STK-AUTH-USERS-001",
    ),
  );
  assert.ok(
    findEdge(
      first,
      "performed-by",
      "user-story",
      "US-AUTH-SESSION-001",
      "user",
      "USR-AUTH-REGISTERED-001",
    ),
  );

  const projects = first.edges.find(({ kind }) => kind === "projects");
  assert.ok(projects);
  assert.equal(projects.source.kind, "artifact-reference");
  assert.equal(projects.target.kind, "artifact-reference");
  assert.equal(
    first.nodes.filter(({ kind }) => kind === "business-objective").length,
    requirementsDraft.requirements.businessObjectives.length,
  );
});

test("Requirements change projection uses replacement provenance and remains candidate", async () => {
  const context = requirementsContext({ change: true });
  const projected = await requirementsTraceabilityContributor.project(context);
  const objective = findNode(
    projected,
    "business-objective",
    "BO-AUTH-ACCESS-001",
  );
  assert.equal(
    objective.sourceLocators[0].jsonPointer,
    "/replacement/businessObjectives/0",
  );
  assert.equal(
    objective.sourceLocators[0].artifact.artifactId,
    "requirements-change-set-001",
  );
  assert.equal(requirementsTraceabilityContributor.authority, "candidate");
});

test("Requirements baseline observer projects approved facts without architecture ownership", async () => {
  const context = baselineObserverContext();
  assert.equal(requirementsBaselineObserverContributor.match(context), true);
  assert.equal(requirementsBaselineObserverContributor.authority, "approved");
  assert.equal(
    requirementsBaselineObserverContributor.scope,
    "requirements/baseline",
  );
  const projected = await requirementsBaselineObserverContributor.project(context);
  assert.ok(
    findNode(projected, "user-story", "US-AUTH-SESSION-001"),
  );
  assert.equal(
    findNode(projected, "user-story", "US-AUTH-SESSION-001")
      .sourceLocators[0].artifact.artifactId,
    "requirements-baseline-001",
  );
  assert.equal(
    projected.nodes.some(({ kind }) => kind.startsWith("architecture-")),
    false,
  );
});

test("Requirements control outcomes are explicit accounting-only projections", async () => {
  const context = {
    graphId: "graph-auth",
    projectId: "auth-product",
    invocation: {
      module: {
        id: "requirements-gathering",
        version: "0.1.0",
        operation: "gather",
      },
    },
    moduleResult: {
      status: "completed",
      outcome: "needs_clarification",
      outputs: { continuation: [{ artifactId: "continuation-001" }] },
    },
  };
  assert.equal(requirementsControlTraceabilityContributor.match(context), true);
  assert.deepEqual(
    await requirementsControlTraceabilityContributor.project(context),
    {
      horizon: "requirements",
      nodes: [],
      edges: [],
      reason:
        "RequirementsGathering outcome needs_clarification has no canonical requirements candidate to project.",
    },
  );
});


test("Requirements contributor produces a validator-clean update through the real graph service", async () => {
  const context = requirementsContext();
  context.invocation = {
    invocationId: requirementsResult.invocationId,
    module: {
      id: "requirements-gathering",
      version: "0.1.0",
      operation: "gather",
    },
  };
  context.loadedOutputs["requirements-draft"][0].bytes = await readBytes(
    "examples/artifacts/requirements-draft-001.json",
  );
  context.loadedOutputs["project-overview-draft"][0].bytes = await readBytes(
    "examples/artifacts/project-overview-draft-001.json",
  );

  const invocationFingerprint = canonicalJsonDigest(context.invocation);
  const service = createTraceabilityGraphService({
    graphId: context.graphId,
    projectId: context.projectId,
    store: createInMemoryTraceabilityStore(),
    contributors: [requirementsTraceabilityContributor],
  });
  const baseGraph = service.captureBase();
  const prepared = await service.prepare({
    ...context,
    baseGraph,
    invocationFingerprint,
  });

  assert.equal(validateTraceabilityUpdate(prepared.update), prepared.update);
  const validated = await service.validatePrepared({
    ...context,
    checkpoint: prepared.checkpoint,
    invocationFingerprint,
  });
  assert.deepEqual(validated.update, prepared.update);
  assert.deepEqual(
    validated.update.scopes.map(({ scope }) => scope),
    ["core/artifact-reference", "requirements/candidate"],
  );
  assert.equal(validated.update.nodeChanges.length, 18);
  assert.equal(validated.update.edgeChanges.length, 36);

  const merged = await service.mergePrepared(validated);
  assert.equal(merged.disposition, "merged");
  assert.equal(merged.snapshot.revision, 1);
  assert.equal(merged.snapshot.nodes.length, 18);
  assert.equal(merged.snapshot.edges.length, 36);
});
