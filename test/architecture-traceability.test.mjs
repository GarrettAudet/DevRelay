import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import {
  architectureBaselineObserverContributor,
  architectureControlTraceabilityContributor,
  architectureTraceabilityContributor,
} from "../src/architecture-traceability-contributor.mjs";
import { requirementsBaselineObserverContributor } from "../src/requirements-traceability-contributor.mjs";
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
  readJson("examples/artifacts/architecture-draft-001.json"),
  readJson("examples/results/architecture-establish-baseline.result.json"),
  readJson("examples/invocations/architecture-establish-baseline.invocation.json"),
  readJson("examples/artifacts/architecture-change-set-draft-001.json"),
  readJson("examples/results/architecture-design-change.result.json"),
  readJson("examples/invocations/architecture-design-change.invocation.json"),
  readJson("examples/artifacts/requirements-baseline-001.json"),
  readJson("examples/artifacts/project-overview-baseline-001.json"),
]);

const [
  architectureDraft,
  architectureResult,
  architectureInvocation,
  architectureChange,
  architectureChangeResult,
  architectureChangeInvocation,
  requirementsBaseline,
  overviewBaseline,
] = fixtures;

function entry(ref, value) {
  return { ref: structuredClone(ref), value: structuredClone(value) };
}

function architectureContext({ change = false, candidate, candidateRef } = {}) {
  const result = change ? architectureChangeResult : architectureResult;
  const invocation = change
    ? architectureChangeInvocation
    : architectureInvocation;
  const value = candidate ?? (change ? architectureChange : architectureDraft);
  const outputPort = change
    ? "architecture-change-set-draft"
    : "architecture-draft";
  const outputRef = candidateRef ?? result.outputs[outputPort][0];
  const requirementsRef = invocation.inputs["requirements-baseline"][0];
  const overviewRef = invocation.inputs["project-overview-baseline"][0];
  return {
    graphId: "graph-auth",
    projectId: "auth-product",
    invocation: structuredClone(invocation),
    moduleResult: structuredClone(result),
    loadedInputs: {
      "requirements-baseline": [entry(requirementsRef, requirementsBaseline)],
      "project-overview-baseline": [entry(overviewRef, overviewBaseline)],
    },
    loadedOutputs: {
      [outputPort]: [entry(outputRef, value)],
    },
  };
}

function findNode(projected, kind, stableId) {
  return projected.nodes.find(
    (node) => node.kind === kind && node.stableId === stableId,
  );
}

function findEdges(projected, kind) {
  return projected.edges.filter((edge) => edge.kind === kind);
}

test("Architecture contributor projects exhaustive design traceability without direct AC claims", async () => {
  const context = architectureContext();
  assert.equal(architectureTraceabilityContributor.match(context), true);
  assert.equal(architectureTraceabilityContributor.scope, "architecture/candidate");
  assert.equal(architectureTraceabilityContributor.authority, "candidate");

  const first = await architectureTraceabilityContributor.project(context);
  const second = await architectureTraceabilityContributor.project(context);
  assert.deepEqual(first, second);
  assert.equal(first.horizon, "architecture");
  assert.equal(first.nodes.length, 13);
  assert.equal(first.edges.length, 54);
  assert.deepEqual(
    first.nodes,
    [...first.nodes].sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right), "en"),
    ),
  );

  for (const [kind, count] of Object.entries({
    "technical-design": 1,
    "architecture-element": 4,
    "architecture-relationship": 2,
    "architecture-view": 1,
    "interface-intent": 1,
    "architecture-constraint": 1,
    "decision-record": 1,
  })) {
    assert.equal(first.nodes.filter((node) => node.kind === kind).length, count);
  }

  const designed = findEdges(first, "designed-by");
  assert.equal(designed.length, 30);
  assert.equal(
    designed.every(
      ({ source }) =>
        source.authority === "approved" &&
        source.scope === "requirements/baseline",
    ),
    true,
  );
  assert.equal(
    designed.some(({ source }) => source.kind === "acceptance-criterion"),
    false,
  );
  assert.ok(
    designed.some(
      ({ source, target }) =>
        source.kind === "user-story" &&
        source.stableId === "US-AUTH-SESSION-001" &&
        target.kind === "decision-record" &&
        target.stableId === "ADR-AUTH-001",
    ),
  );

  const decisionEdge = designed.find(
    ({ source, target }) =>
      source.stableId === "US-AUTH-SESSION-001" &&
      target.stableId === "ADR-AUTH-001",
  );
  assert.ok(
    decisionEdge.sourceLocators.some(
      ({ jsonPointer }) => jsonPointer === "/traceability/2/targets/9",
    ),
  );
  assert.ok(
    decisionEdge.sourceLocators.some(({ jsonPointer }) =>
      jsonPointer.endsWith("/sourceRequirementIds/2"),
    ),
  );

  assert.equal(findEdges(first, "derived-from").length, 1);
  assert.equal(findEdges(first, "source-endpoint").length, 2);
  assert.equal(findEdges(first, "target-endpoint").length, 2);
  assert.equal(findEdges(first, "affects").length, 4);
});

test("Architecture change projection includes typed change targets", async () => {
  const projected = await architectureTraceabilityContributor.project(
    architectureContext({ change: true }),
  );
  assert.ok(
    findNode(projected, "architecture-change", "CHG-AUTH-RATE-LIMIT"),
  );
  assert.equal(
    findEdges(projected, "designed-by").filter(
      ({ target }) =>
        target.kind === "architecture-change" &&
        target.stableId === "CHG-AUTH-RATE-LIMIT",
    ).length,
    3,
  );
  assert.equal(
    findNode(projected, "architecture-change", "CHG-AUTH-RATE-LIMIT")
      .sourceLocators[0].jsonPointer,
    "/changes/elementChanges/0",
  );
});

test("Architecture change projection ignores historical citations absent from the current requirements baseline", async () => {
  const candidate = structuredClone(architectureChange);
  candidate.sections.architectureModel.content.elements[0].sourceRequirementIds.push(
    "US-HISTORICAL-RETIRED-001",
  );
  const candidateRef = {
    ...architectureChangeResult.outputs["architecture-change-set-draft"][0],
    artifactId: "architecture-change-set-with-historical-citation-001",
    digest: canonicalJsonDigest(candidate),
    uri: "memory://fixtures/architecture-change-set-with-historical-citation-001.json",
  };

  const projected = await architectureTraceabilityContributor.project(
    architectureContext({ change: true, candidate, candidateRef }),
  );
  assert.equal(
    findEdges(projected, "designed-by").some(
      ({ source: edgeSource }) =>
        edgeSource.stableId === "US-HISTORICAL-RETIRED-001",
    ),
    false,
  );
});

test("Architecture contributor resolves attached sections and uses attachment provenance", async () => {
  const candidate = structuredClone(architectureDraft);
  const model = candidate.sections.architectureModel.content;
  const attachmentRef = {
    artifactId: "architecture-model-attached-001",
    schema: "https://devrelay.dev/artifacts/architecture-model/v1",
    mediaType: "application/vnd.devrelay.architecture-model+json",
    digest: canonicalJsonDigest(model),
    uri: "file:///workspace/.devrelay/artifacts/architecture-model-attached-001.json",
  };
  candidate.sections.architectureModel = {
    mode: "attached",
    contentId: model.modelId,
    artifact: attachmentRef,
  };
  const candidateRef = {
    ...architectureResult.outputs["architecture-draft"][0],
    artifactId: "architecture-draft-attached-001",
    digest: canonicalJsonDigest(candidate),
    uri: "file:///workspace/.devrelay/artifacts/architecture-draft-attached-001.json",
  };
  const context = architectureContext({ candidate, candidateRef });
  let resolutions = 0;
  context.resolveArtifact = async (ref) => {
    resolutions += 1;
    assert.deepEqual(ref, attachmentRef);
    return {
      ref: structuredClone(attachmentRef),
      bytes: Buffer.from(canonicalJson(model), "utf8"),
      value: structuredClone(model),
    };
  };

  const projected = await architectureTraceabilityContributor.project(context);
  assert.equal(resolutions, 1);
  const element = findNode(projected, "architecture-element", "EL-AUTH-SERVICE");
  assert.equal(
    element.sourceLocators[0].artifact.artifactId,
    "architecture-model-attached-001",
  );
  assert.equal(element.sourceLocators[0].jsonPointer, "/elements/1");
  assert.equal(
    projected.nodes.filter(({ kind }) => kind === "artifact-reference").length,
    3,
  );
  assert.ok(
    findEdges(projected, "contains").some(
      ({ source, target }) =>
        source.kind === "artifact-reference" &&
        source.stableId ===
          canonicalJsonDigest({
            schema: candidateRef.schema,
            artifactId: candidateRef.artifactId,
            digest: candidateRef.digest,
          }) &&
        target.kind === "artifact-reference" &&
        target.stableId ===
          canonicalJsonDigest({
            schema: attachmentRef.schema,
            artifactId: attachmentRef.artifactId,
            digest: attachmentRef.digest,
          }),
    ),
  );

  const missingResolver = architectureContext({ candidate, candidateRef });
  await assert.rejects(
    architectureTraceabilityContributor.project(missingResolver),
    /requires context\.resolveArtifact/,
  );
});

test("No-architecture-impact remains covered through a stable disposition node", async () => {
  const candidate = structuredClone(architectureDraft);
  const requirementId = candidate.traceability[0].requirementId;
  candidate.traceability[0].disposition = "no-architecture-impact";
  candidate.traceability[0].targets = [];
  const stripCitation = (value) => {
    if (Array.isArray(value)) {
      value.forEach(stripCitation);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === "sourceRequirementIds" && Array.isArray(child)) {
          value[key] = child.filter((id) => id !== requirementId);
        } else {
          stripCitation(child);
        }
      }
    }
  };
  stripCitation(candidate.sections);
  const candidateRef = {
    ...architectureResult.outputs["architecture-draft"][0],
    artifactId: "architecture-no-impact-001",
    digest: canonicalJsonDigest(candidate),
    uri: "file:///workspace/.devrelay/artifacts/architecture-no-impact-001.json",
  };
  const projected = await architectureTraceabilityContributor.project(
    architectureContext({ candidate, candidateRef }),
  );
  const dispositionId = `NO-ARCHITECTURE-IMPACT-${requirementId}`;
  assert.ok(findNode(projected, "architecture-change", dispositionId));
  assert.ok(
    findEdges(projected, "designed-by").some(
      ({ source, target }) =>
        source.stableId === requirementId &&
        target.stableId === dispositionId,
    ),
  );
});

test("Approved baseline observer and Architecture contributor coalesce exact artifact references", async () => {
  const context = architectureContext();
  const [requirementsProjection, architectureProjection] = await Promise.all([
    requirementsBaselineObserverContributor.project(context),
    architectureTraceabilityContributor.project(context),
  ]);
  const baselineRef = context.loadedInputs["requirements-baseline"][0].ref;
  const stableId = canonicalJsonDigest({
    schema: baselineRef.schema,
    artifactId: baselineRef.artifactId,
    digest: baselineRef.digest,
  });
  const requirementsNode = findNode(
    requirementsProjection,
    "artifact-reference",
    stableId,
  );
  const architectureNode = findNode(
    architectureProjection,
    "artifact-reference",
    stableId,
  );
  assert.deepEqual(requirementsNode, architectureNode);
});

test("Architecture control outcomes are explicit accounting-only projections", async () => {
  const context = {
    invocation: {
      module: {
        id: "architecture-design",
        version: "0.1.0",
        operation: "design-change",
      },
    },
    moduleResult: {
      status: "completed",
      outcome: "needs_clarification",
      outputs: { continuation: [{ artifactId: "architecture-continuation-001" }] },
    },
  };
  assert.equal(architectureControlTraceabilityContributor.match(context), true);
  assert.deepEqual(await architectureControlTraceabilityContributor.project(context), {
    horizon: "architecture",
    nodes: [],
    edges: [],
    reason:
      "ArchitectureDesign outcome needs_clarification has no canonical architecture candidate to project.",
  });
});


test("Architecture and approved requirements projections validate together through the real graph service", async () => {
  const candidate = structuredClone(architectureDraft);
  const model = candidate.sections.architectureModel.content;
  const attachmentRef = {
    artifactId: "architecture-model-service-attached-001",
    schema: "https://devrelay.dev/artifacts/architecture-model/v1",
    mediaType: "application/vnd.devrelay.architecture-model+json",
    digest: canonicalJsonDigest(model),
    uri: "file:///workspace/.devrelay/artifacts/architecture-model-service-attached-001.json",
  };
  candidate.sections.architectureModel = {
    mode: "attached",
    contentId: model.modelId,
    artifact: attachmentRef,
  };
  const candidateRef = {
    ...architectureResult.outputs["architecture-draft"][0],
    artifactId: "architecture-draft-service-attached-001",
    digest: canonicalJsonDigest(candidate),
    uri: "file:///workspace/.devrelay/artifacts/architecture-draft-service-attached-001.json",
  };
  const context = architectureContext({ candidate, candidateRef });
  context.resolveArtifact = async (ref) => {
    assert.deepEqual(ref, attachmentRef);
    return {
      ref: structuredClone(attachmentRef),
      bytes: Buffer.from(canonicalJson(model), "utf8"),
      value: structuredClone(model),
    };
  };
  context.loadedInputs["requirements-baseline"][0].bytes = await readBytes(
    "examples/artifacts/requirements-baseline-001.json",
  );
  context.loadedInputs["project-overview-baseline"][0].bytes = await readBytes(
    "examples/artifacts/project-overview-baseline-001.json",
  );
  context.loadedOutputs["architecture-draft"][0].bytes = Buffer.from(
    canonicalJson(candidate),
    "utf8",
  );

  const invocationFingerprint = canonicalJsonDigest(context.invocation);
  const service = createTraceabilityGraphService({
    graphId: context.graphId,
    projectId: context.projectId,
    store: createInMemoryTraceabilityStore(),
    contributors: [
      requirementsBaselineObserverContributor,
      architectureTraceabilityContributor,
    ],
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
    [
      "architecture/candidate",
      "core/artifact-reference",
      "requirements/baseline",
    ],
  );

  const baselineRef = context.loadedInputs["requirements-baseline"][0].ref;
  assert.equal(
    validated.update.nodeChanges.filter(
      ({ node }) =>
        node.kind === "artifact-reference" &&
        node.attributes.artifact.artifactId === baselineRef.artifactId &&
        node.attributes.artifact.digest === baselineRef.digest,
    ).length,
    1,
  );
  assert.equal(
    validated.update.edgeChanges.filter(
      ({ edge }) => edge.kind === "designed-by",
    ).length,
    30,
  );
  assert.ok(
    validated.update.sourceArtifacts.some(
      ({ artifactId, digest }) =>
        artifactId === attachmentRef.artifactId && digest === attachmentRef.digest,
    ),
  );
  const attachedElement = validated.update.nodeChanges.find(
    ({ node }) =>
      node.kind === "architecture-element" &&
      node.stableId === "EL-AUTH-SERVICE",
  );
  assert.equal(
    attachedElement.node.sourceLocators[0].artifact.artifactId,
    attachmentRef.artifactId,
  );
  assert.equal(attachedElement.node.sourceLocators[0].jsonPointer, "/elements/1");

  const merged = await service.mergePrepared(validated);
  assert.equal(merged.disposition, "merged");
  assert.equal(merged.snapshot.horizon, "architecture");
  assert.deepEqual(
    merged.diagnostics.filter(
      ({ code, subjectId }) =>
        code === "TG_ORPHAN_REQUIREMENT" &&
        merged.snapshot.nodes.find(({ nodeId }) => nodeId === subjectId)?.kind ===
          "acceptance-criterion",
    ),
    [],
  );
  assert.equal(
    merged.snapshot.nodes.filter(
      ({ kind }) => kind === "artifact-reference",
    ).length,
    4,
  );
});

test("Approved architecture baseline projection ignores historical citations absent from the current requirements baseline", async () => {
  const [baseline, requirements] = await Promise.all([
    readJson("dogfood/work-dependency-analysis/architecture-design/architecture-baseline.json"),
    readJson("project/requirements-baseline.json"),
  ]);
  const currentRequirementIds = new Set(
    [
      "businessObjectives",
      "successMetrics",
      "stakeholders",
      "users",
      "capabilities",
      "userJourneys",
      "userStories",
      "acceptanceCriteria",
      "nonFunctionalRequirements",
      "constraints",
    ].flatMap((field) =>
      (requirements.requirements[field] ?? []).map(({ id }) => id),
    ),
  );
  const citedRequirementIds = new Set();
  const collectCitations = (value) => {
    if (Array.isArray(value)) {
      for (const child of value) collectCitations(child);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "sourceRequirementIds" && Array.isArray(child)) {
        for (const id of child) citedRequirementIds.add(id);
      } else {
        collectCitations(child);
      }
    }
  };
  collectCitations(baseline.sections);
  const staleRequirementIds = new Set(
    [...citedRequirementIds].filter((id) => !currentRequirementIds.has(id)),
  );
  assert.ok(staleRequirementIds.size > 0);

  const context = {
    graphId: "devrelay/work-breakdown",
    projectId: "devrelay",
    invocation: {
      module: {
        id: "work-breakdown",
        version: "0.1.0",
        operation: "decompose-change",
      },
    },
    moduleResult: { status: "completed", outcome: "decomposed" },
    loadedInputs: {
      "requirements-baseline": [entry(baseline.requirementsBaseline, requirements)],
      "architecture-baseline": [
        entry(
          {
            artifactId: baseline.baselineId,
            schema: "https://devrelay.dev/artifacts/architecture-baseline/v1",
            mediaType: "application/vnd.devrelay.architecture-baseline+json",
            digest: canonicalJsonDigest(baseline),
            uri: "memory://fixtures/architecture-baseline-wda.json",
          },
          baseline,
        ),
      ],
    },
  };
  assert.equal(architectureBaselineObserverContributor.match(context), true);
  const projected = await architectureBaselineObserverContributor.project(context);
  const designedBy = findEdges(projected, "designed-by");
  assert.equal(
    designedBy.some(({ source }) => staleRequirementIds.has(source.stableId)),
    false,
  );
  assert.equal(
    designedBy.some(({ source }) => currentRequirementIds.has(source.stableId)),
    true,
  );
});
