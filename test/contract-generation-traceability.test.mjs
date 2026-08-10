import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { architectureBaselineObserverContributor } from "../src/architecture-traceability-contributor.mjs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createJsonSchemaContractBundle } from "../src/contract-format-registry.mjs";
import { createContractGenerationRuntime } from "../src/contract-generation-runtime.mjs";
import { contractCandidateTraceabilityContributor } from "../src/contract-traceability-contributor.mjs";
import { requirementsBaselineObserverContributor } from "../src/requirements-traceability-contributor.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../src/traceability-graph.mjs";

const ROOT = new URL("../", import.meta.url);

async function loadedFile(path, schema, mediaType, idField) {
  const bytes = await readFile(new URL(path, ROOT));
  const value = JSON.parse(bytes);
  return {
    value,
    ref: {
      artifactId: value[idField],
      schema,
      mediaType,
      digest: sha256Digest(bytes),
      uri: `file:///test/${path}`,
    },
    bytes,
  };
}

function loadedValue(value, schema, mediaType, artifactId) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    value,
    ref: { artifactId, schema, mediaType, digest: sha256Digest(bytes), uri: `memory://test/${artifactId}.json` },
    bytes,
  };
}

function checkpoints() {
  const entries = new Map();
  return {
    async get(key) { return entries.get(key); },
    async put(key, value) {
      if (entries.has(key)) throw new Error("immutable checkpoint collision");
      entries.set(key, structuredClone(value));
    },
  };
}

test("trusted contract candidate projection validates and atomically merges over approved upstream facts", async () => {
  const requirements = await loadedFile(
    "project/history/1.5.0/requirements-baseline.json",
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
    "baselineId",
  );
  const projectOverview = await loadedFile(
    "project/history/1.5.0/project-overview-baseline.json",
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
    "baselineId",
  );
  const architecture = await loadedFile(
    "project/history/architecture/architecture-baseline-devrelay-v1-work-item-verification-001/architecture-baseline.json",
    "https://devrelay.dev/artifacts/architecture-baseline/v1",
    "application/vnd.devrelay.architecture-baseline+json",
    "baselineId",
  );
  requirements.ref = structuredClone(architecture.value.requirementsBaseline);
  projectOverview.ref = structuredClone(architecture.value.projectOverviewBaseline);
  const requiredInterfaceIntentIds = architecture.value.sections.interfaceIntent.content.interfaces
    .filter(({ contractGeneration }) => contractGeneration.required)
    .map(({ id }) => id)
    .sort();
  const state = loadedValue(
    {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ProjectContractState",
      stateId: "PCS-TRACE-001",
      state: "unbaselined",
      architectureBaseline: architecture.ref,
      projectOverviewBaseline: projectOverview.ref,
      requiredInterfaceIntentIds,
    },
    "https://devrelay.dev/artifacts/project-contract-state/v1",
    "application/vnd.devrelay.project-contract-state+json",
    "PCS-TRACE-001",
  );
  const producer = {
    id: "test.trace-generator",
    version: "0.1.0",
    async generate(request) { return createJsonSchemaContractBundle(request, this); },
  };
  const runtime = createContractGenerationRuntime({ generators: { "json-schema": producer } });
  const execution = await runtime.execute({
    executionId: "CG-TRACE-001",
    state,
    architecture,
    projectOverview,
    checkpoints: checkpoints(),
  });
  const candidate = loadedValue(
    execution.candidate,
    "https://devrelay.dev/artifacts/contract-draft-set/v1",
    "application/vnd.devrelay.contract-draft-set+json",
    execution.candidate.draftSetId,
  );
  const service = createTraceabilityGraphService({
    graphId: "graph-contract-generation-test",
    projectId: "devrelay",
    store: createInMemoryTraceabilityStore(),
    contributors: [
      requirementsBaselineObserverContributor,
      architectureBaselineObserverContributor,
      contractCandidateTraceabilityContributor,
    ],
  });
  const upstreamInvocation = {
    invocationId: "seed-approved-upstream",
    module: { id: "work-breakdown", version: "0.1.0", operation: "establish-breakdown" },
  };
  const upstreamPrepared = await service.prepare({
    graphId: service.graphId,
    projectId: service.projectId,
    invocation: upstreamInvocation,
    invocationFingerprint: canonicalJsonDigest(upstreamInvocation),
    moduleResult: { invocationId: upstreamInvocation.invocationId, status: "completed", outcome: "decomposed", outputs: {}, evidence: [], diagnostics: [] },
    loadedInputs: {
      "requirements-baseline": [requirements],
      "project-overview-baseline": [projectOverview],
      "architecture-baseline": [architecture],
    },
    loadedOutputs: {},
    baseGraph: service.captureBase(),
  });
  await service.mergePrepared(upstreamPrepared);
  const invocation = {
    invocationId: "contract-generation-graph-test",
    module: { id: "contract-generation", version: "0.1.0", operation: "establish-contracts" },
  };
  const prepared = await service.prepare({
    graphId: service.graphId,
    projectId: service.projectId,
    invocation,
    invocationFingerprint: canonicalJsonDigest(invocation),
    moduleResult: {
      invocationId: invocation.invocationId,
      status: "completed",
      outcome: "generated",
      outputs: { "contract-draft-set": [candidate.ref] },
      evidence: [],
      diagnostics: [],
    },
    loadedInputs: {
      "project-contract-state": [state],
      "architecture-baseline": [architecture],
      "project-overview-baseline": [projectOverview],
    },
    loadedOutputs: { "contract-draft-set": [candidate] },
    baseGraph: service.captureBase(),
  });
  const merged = await service.mergePrepared(prepared);
  assert.equal(
    merged.snapshot.nodes.filter(
      ({ kind, authority, scope, state: nodeState }) =>
        kind === "contract" && authority === "candidate" && scope === "contracts/candidate" && nodeState === "active",
    ).length,
    34,
  );
  assert.equal(
    merged.snapshot.edges.filter(
      ({ kind, authority, scope, state: edgeState }) =>
        kind === "contracted-by" && authority === "candidate" && scope === "contracts/candidate" && edgeState === "active",
    ).length,
    34,
  );
});
