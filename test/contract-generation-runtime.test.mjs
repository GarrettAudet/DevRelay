import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createJsonSchemaContractBundle } from "../src/contract-format-registry.mjs";
import {
  createContractGenerationRuntime,
  deriveContractGenerationRoute,
} from "../src/contract-generation-runtime.mjs";
import { promoteContractBaseline } from "../src/contract-gate.mjs";
import {
  contractBaselineTraceabilityContributor,
  contractCandidateTraceabilityContributor,
} from "../src/contract-traceability-contributor.mjs";

const ROOT = new URL("../", import.meta.url);

function loadedValue(value, schema, mediaType, artifactId) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    value,
    ref: {
      artifactId,
      schema,
      mediaType,
      digest: sha256Digest(bytes),
      uri: `memory://test/${artifactId}.json`,
    },
    bytes,
  };
}

async function loadedFile(path, schema, mediaType, artifactIdField) {
  const bytes = await readFile(new URL(path, ROOT));
  const value = JSON.parse(bytes);
  return {
    value,
    ref: {
      artifactId: value[artifactIdField],
      schema,
      mediaType,
      digest: sha256Digest(bytes),
      uri: `file:///test/${path}`,
    },
    bytes,
  };
}

function store() {
  const records = new Map();
  return {
    records,
    async get(key) {
      return records.get(key);
    },
    async put(key, value) {
      if (records.has(key)) throw new Error("immutable checkpoint collision");
      records.set(key, structuredClone(value));
    },
  };
}

async function inputs() {
  const architecture = await loadedFile(
    "project/history/architecture/architecture-baseline-devrelay-v1-work-item-verification-001/architecture-baseline.json",
    "https://devrelay.dev/artifacts/architecture-baseline/v1",
    "application/vnd.devrelay.architecture-baseline+json",
    "baselineId",
  );
  const projectOverview = await loadedFile(
    "project/history/1.5.0/project-overview-baseline.json",
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
    "baselineId",
  );
  const requiredInterfaceIntentIds = architecture.value.sections.interfaceIntent.content.interfaces
    .filter((entry) => entry.contractGeneration.required)
    .map(({ id }) => id)
    .sort();
  const state = loadedValue(
    {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ProjectContractState",
      stateId: "PCS-DEVRELAY-UNBASELINED",
      state: "unbaselined",
      architectureBaseline: architecture.ref,
      projectOverviewBaseline: projectOverview.ref,
      requiredInterfaceIntentIds,
    },
    "https://devrelay.dev/artifacts/project-contract-state/v1",
    "application/vnd.devrelay.project-contract-state+json",
    "PCS-DEVRELAY-UNBASELINED",
  );
  return { architecture, projectOverview, state, requiredInterfaceIntentIds };
}

async function executeInitial(executionId = "CG-TEST-001", generatorCounter) {
  const fixture = await inputs();
  const checkpoints = store();
  const producer = {
    id: "test.json-schema-generator",
    version: "0.1.0",
    async generate(request) {
      if (generatorCounter) generatorCounter.calls += 1;
      assert.equal("traceabilityGraph" in request, false);
      return createJsonSchemaContractBundle(request, this);
    },
  };
  const runtime = createContractGenerationRuntime({ generators: { "json-schema": producer } });
  const result = await runtime.execute({ executionId, ...fixture, checkpoints });
  return { fixture, checkpoints, runtime, result };
}

test("digest-valid ContractGeneration bytes reject a substituted parsed value before generation", async () => {
  const fixture = await inputs();
  fixture.state.value = { ...fixture.state.value, stateId: "PCS-SUBSTITUTED" };
  let calls = 0;
  const runtime = createContractGenerationRuntime({
    generators: {
      "json-schema": {
        id: "test.must-not-run",
        version: "0.1.0",
        async generate() {
          calls += 1;
        },
      },
    },
  });
  await assert.rejects(
    runtime.execute({ executionId: "CG-SUBSTITUTION", ...fixture, checkpoints: store() }),
    /parsed value does not match its exact raw bytes/,
  );
  assert.equal(calls, 0);
});

test("state routing selects two module operations and one Gate-only not-applicable branch", async () => {
  const fixture = await inputs();
  assert.deepEqual(
    deriveContractGenerationRoute({
      state: fixture.state.value,
      architectureBaseline: fixture.architecture.value,
    }),
    {
      kind: "module",
      operation: "establish-contracts",
      reasonCode: "CONTRACT_BASELINE_ABSENT",
      requiredInterfaceIntentIds: fixture.requiredInterfaceIntentIds,
    },
  );
  const architecture = structuredClone(fixture.architecture.value);
  for (const intent of architecture.sections.interfaceIntent.content.interfaces) {
    intent.contractGeneration = { required: false, suggestedKinds: [] };
  }
  const state = {
    ...fixture.state.value,
    stateId: "PCS-DEVRELAY-NOT-APPLICABLE",
    state: "not-applicable",
    requiredInterfaceIntentIds: [],
  };
  assert.equal(
    deriveContractGenerationRoute({ state, architectureBaseline: architecture }).branch,
    "approve-not-applicable",
  );
});

test("live JSON Schema path covers 34 exact intents and replays without generator invocation", async () => {
  const counter = { calls: 0 };
  const { fixture, checkpoints, runtime, result } = await executeInitial("CG-TEST-LIVE", counter);
  assert.equal(result.outcome, "generated");
  assert.equal(result.progressionAllowed, true);
  assert.equal(result.candidate.kind, "ContractDraftSet");
  assert.equal(result.candidate.contracts.length, 34);
  assert.deepEqual(result.candidate.requiredInterfaceIntentIds, fixture.requiredInterfaceIntentIds);
  assert.equal(counter.calls, 1);
  const replay = await runtime.execute({
    executionId: "CG-TEST-LIVE",
    ...fixture,
    checkpoints,
  });
  assert.equal(replay.replayed, true);
  assert.equal(counter.calls, 1);
  const receipt = await runtime.verifyCheckpointedExecution({
    executionId: result.executionId,
    executionFingerprint: result.executionFingerprint,
    checkpoints,
  });
  assert.equal(receipt.checkpoint.artifacts.validationSet.value.status, "pass");
  assert.ok(
    Object.values(receipt.checkpoint.nativeArtifacts).every(({ bytesBase64 }) =>
      Buffer.from(bytesBase64, "base64").toString("utf8").includes(
        "https://json-schema.org/draft/2020-12/schema",
      ),
    ),
  );
});

test("Core rejects malformed native schema bytes and never prepares a Gate candidate", async () => {
  const fixture = await inputs();
  const runtime = createContractGenerationRuntime({
    generators: {
      "json-schema": {
        id: "test.invalid-generator",
        version: "0.1.0",
        async generate(request) {
          const bundle = createJsonSchemaContractBundle(request, this);
          const schema = JSON.parse(Buffer.from(bundle.entries[0].bytesBase64, "base64"));
          schema.$schema = "https://json-schema.org/draft/2019-09/schema";
          bundle.entries[0].bytesBase64 = Buffer.from(canonicalJson(schema), "utf8").toString("base64");
          return bundle;
        },
      },
    },
  });
  const result = await runtime.execute({ executionId: "CG-TEST-INVALID", ...fixture, checkpoints: store() });
  assert.equal(result.outcome, "unable-to-proceed");
  assert.equal(result.progressionAllowed, false);
  assert.equal(result.candidate, undefined);
  assert.ok(result.diagnostics.some(({ code }) => code === "CG_UNSUPPORTED_JSON_SCHEMA_DIALECT"));
});

test("same execution identity with a changed generator binding fails before reinvocation", async () => {
  const counter = { calls: 0 };
  const { fixture, checkpoints } = await executeInitial("CG-TEST-BINDING-DRIFT", counter);
  const changed = { calls: 0 };
  const runtime = createContractGenerationRuntime({
    generators: {
      "json-schema": {
        id: "test.changed-generator",
        version: "0.2.0",
        async generate(request) {
          changed.calls += 1;
          return createJsonSchemaContractBundle(request, this);
        },
      },
    },
  });
  await assert.rejects(
    runtime.execute({ executionId: "CG-TEST-BINDING-DRIFT", ...fixture, checkpoints }),
    /checkpoint does not match the exact execution/,
  );
  assert.equal(changed.calls, 0);
});

test("ContractGate promotes only the exact replayed candidate and emits downstream ContractDisposition", async () => {
  const { fixture, checkpoints, runtime, result } = await executeInitial("CG-TEST-GATE");
  const receipt = await runtime.verifyCheckpointedExecution({
    executionId: result.executionId,
    executionFingerprint: result.executionFingerprint,
    checkpoints,
  });
  const review = loadedValue(
    { status: "pass", candidateDigest: result.candidateRef.digest },
    "https://devrelay.dev/evidence/contract-gate-review/v1",
    "application/json",
    "contract-gate-review-test",
  );
  const approvalValue = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractGateApproval",
    approvalId: "CGA-TEST-001",
    authority: "project-owner",
    decision: "approve",
    policyVersion: "contract-gate/0.1.0",
    candidate: result.candidateRef,
    breakingChangeApproved: false,
    requiredEvidence: [review.ref],
  };
  const approval = loadedValue(
    approvalValue,
    "https://devrelay.dev/evidence/contract-gate-approval/v1",
    "application/vnd.devrelay.contract-gate-approval+json",
    "CGA-TEST-001",
  );
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractBaseline",
    baselineId: "CB-DEVRELAY-TEST-001",
    version: "1.0.0",
    approvedCandidate: result.candidateRef,
    architectureBaseline: fixture.architecture.ref,
    projectOverviewBaseline: fixture.projectOverview.ref,
    contracts: result.candidate.contracts,
    contractsDigest: canonicalJsonDigest(result.candidate.contracts),
    approvalEvidence: [approval.ref],
    sourceRefs: result.candidate.sourceRefs,
  };
  const baselineLoaded = loadedValue(
    baseline,
    "https://devrelay.dev/artifacts/contract-baseline/v1",
    "application/vnd.devrelay.contract-baseline+json",
    baseline.baselineId,
  );
  const commit = await promoteContractBaseline({
    replayReceipt: receipt,
    baseline,
    baselineRef: baselineLoaded.ref,
    baselineBytes: baselineLoaded.bytes,
    approval,
    evidenceResolver: async (ref) => (ref.digest === review.ref.digest ? review : undefined),
  });
  assert.equal(commit.progressionAllowed, true);
  assert.equal(commit.baseline.contracts.length, 34);
  assert.equal(commit.contractDisposition.mode, "baseline");
  assert.equal(commit.contractDisposition.contractTargets.length, 34);
  await assert.rejects(
    promoteContractBaseline({
      replayReceipt: { ...receipt },
      baseline,
      baselineRef: baselineLoaded.ref,
      baselineBytes: baselineLoaded.bytes,
      approval,
      evidenceResolver: async () => review,
    }),
    /unforgeable checkpoint replay receipt/,
  );
});

test("candidate and approved traceability projections remain separate and forward-only", async () => {
  const { fixture, result } = await executeInitial("CG-TEST-TRACE");
  const candidateLoaded = loadedValue(
    result.candidate,
    "https://devrelay.dev/artifacts/contract-draft-set/v1",
    "application/vnd.devrelay.contract-draft-set+json",
    result.candidate.draftSetId,
  );
  const candidateProjection = await contractCandidateTraceabilityContributor.project({
    invocation: { module: { id: "contract-generation", version: "0.1.0", operation: "establish-contracts" } },
    moduleResult: { status: "completed", outcome: "generated" },
    loadedOutputs: { "contract-draft-set": [candidateLoaded] },
  });
  assert.equal(candidateProjection.nodes.length, 34);
  assert.ok(candidateProjection.edges.every(({ source, target }) => source.kind === "interface-intent" && target.kind === "contract"));
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractBaseline",
    baselineId: "CB-TRACE-001",
    version: "1.0.0",
    approvedCandidate: candidateLoaded.ref,
    architectureBaseline: fixture.architecture.ref,
    projectOverviewBaseline: fixture.projectOverview.ref,
    contracts: result.candidate.contracts,
    contractsDigest: canonicalJsonDigest(result.candidate.contracts),
    approvalEvidence: [fixture.state.ref],
    sourceRefs: result.candidate.sourceRefs,
  };
  const baselineLoaded = loadedValue(
    baseline,
    "https://devrelay.dev/artifacts/contract-baseline/v1",
    "application/vnd.devrelay.contract-baseline+json",
    baseline.baselineId,
  );
  const approvedProjection = await contractBaselineTraceabilityContributor.project({
    gate: { id: "contract-gate", outcome: "promoted" },
    loadedOutputs: { "contract-baseline": [baselineLoaded] },
  });
  assert.equal(approvedProjection.nodes.length, 34);
  assert.notDeepEqual(candidateProjection, approvedProjection);
});
