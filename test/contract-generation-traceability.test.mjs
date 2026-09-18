import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createLocalHostTraceabilityStore } from "../src/local-host-traceability.mjs";
import { publishLocalContractCandidateTrace, verifyLocalContractCandidateTrace } from "../src/local-contract-traceability.mjs";

import { architectureBaselineObserverContributor } from "../src/architecture-traceability-contributor.mjs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createJsonSchemaContractBundle } from "../src/contract-format-registry.mjs";
import { createContractGenerationRuntime } from "../src/contract-generation-runtime.mjs";
import { contractCandidateTraceabilityContributor, contractBaselineTraceabilityContributor } from "../src/contract-traceability-contributor.mjs";
import { prepareLocalContractGate } from "../src/local-contract-gate.mjs";
import { activateLocalContractGate, verifyLocalContractActivation, assertLocalContractCurrentState, localContractHeadId } from "../src/local-contract-activation.mjs";
import { requirementsBaselineObserverContributor } from "../src/requirements-traceability-contributor.mjs";
import {
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

test("trusted contract candidate projection validates and atomically merges over approved upstream facts", async t => {
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
  const executionCheckpoints = checkpoints();
  const execution = await runtime.execute({
    executionId: "CG-TRACE-001",
    state,
    architecture,
    projectOverview,
    checkpoints: executionCheckpoints,
  });
  const candidate = loadedValue(
    execution.candidate,
    "https://devrelay.dev/artifacts/contract-draft-set/v1",
    "application/vnd.devrelay.contract-draft-set+json",
    execution.candidate.draftSetId,
  );
  const directory = mkdtempSync(join(tmpdir(), "devrelay-contract-trace-"));
  let storage = createLocalHostStorage({ rootDirectory: directory });
  t.after(() => { storage.close(); rmSync(directory, { recursive: true, force: true }); });
  const makeService = () => createTraceabilityGraphService({
    graphId: "graph-contract-generation-test",
    projectId: "devrelay",
    store: createLocalHostTraceabilityStore({ storage, namespace: "contract-trace-graph", graphId: "graph-contract-generation-test" }),
    contributors: [
      requirementsBaselineObserverContributor,
      architectureBaselineObserverContributor,
      contractCandidateTraceabilityContributor,
      contractBaselineTraceabilityContributor,
    ],
  });
  let service = makeService();
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
  const receipt = await runtime.verifyCheckpointedExecution({ executionId: execution.executionId,
    executionFingerprint: execution.executionFingerprint, checkpoints: executionCheckpoints });
  const sources = [state, architecture, projectOverview];
  const request = { storage, namespace: "contract-trace-test", graph: service, replayReceipt: receipt,
    loadArtifact: ref => sources.find(entry => canonicalJsonDigest(entry.ref) === canonicalJsonDigest(ref))?.bytes };
  let preparedBeforeInterruption;
  await assert.rejects(publishLocalContractCandidateTrace({ ...request, graph: { ...service,
    mergePrepared(prepared) { preparedBeforeInterruption = prepared.checkpoint; throw new Error("fixture-before-contract-merge"); } } }), /fixture-before-contract-merge/);
  const published = await publishLocalContractCandidateTrace({ ...request, graph: { ...service,
    mergePrepared(prepared) {
      assert.deepEqual(prepared.checkpoint, preparedBeforeInterruption, "retry must reuse the exact prepared graph checkpoint");
      return service.mergePrepared(prepared);
    } } });
  assert.equal(published.scope, "candidate-contract-trace");
  assert.equal(published.lifecycleComplete, false);
  await assert.rejects(verifyLocalContractCandidateTrace({ ...request, record: { ...published, lifecycleComplete: true } }), /closed contract/);
  await assert.rejects(verifyLocalContractCandidateTrace({ ...request, record: { ...published, approved: true } }), /closed contract/);
  await assert.rejects(publishLocalContractCandidateTrace({ ...request, replayReceipt: { ...receipt },
    loadArtifact: () => { throw new Error("should reject before loading"); } }), /receipt/i);
  assert.deepEqual(await verifyLocalContractCandidateTrace({ ...request, record: published }), published);
  assert.deepEqual(await publishLocalContractCandidateTrace({ ...request, graph: { ...service,
    mergePrepared() { throw new Error("replay must not merge again"); } } }), published);
  const review = loadedValue({ fixtureOnly: true, candidate: execution.candidateRef }, "https://devrelay.dev/evidence/contract-gate-review/v1", "application/json", "contract-activation-review");
  const approval = loadedValue({ apiVersion: "devrelay.dev/v1alpha1", kind: "ContractGateApproval", approvalId: "CGA-TRACE-ACTIVATION",
    authority: "project-owner", decision: "approve", policyVersion: "contract-gate/0.1.0", candidate: execution.candidateRef,
    breakingChangeApproved: false, requiredEvidence: [review.ref] }, "https://devrelay.dev/evidence/contract-gate-approval/v1", "application/vnd.devrelay.contract-gate-approval+json", "CGA-TRACE-ACTIVATION");
  const baseline = loadedValue({ apiVersion: "devrelay.dev/v1alpha1", kind: "ContractBaseline", baselineId: "CB-TRACE-ACTIVATION", version: "1.0.0",
    approvedCandidate: execution.candidateRef, architectureBaseline: architecture.ref, projectOverviewBaseline: projectOverview.ref,
    contracts: execution.candidate.contracts, contractsDigest: canonicalJsonDigest(execution.candidate.contracts),
    approvalEvidence: [approval.ref], sourceRefs: execution.candidate.sourceRefs }, "https://devrelay.dev/artifacts/contract-baseline/v1", "application/vnd.devrelay.contract-baseline+json", "CB-TRACE-ACTIVATION");
  sources.push(review, approval, baseline);
  const gate = await prepareLocalContractGate({ replayReceipt: receipt, approvalRef: approval.ref, baselineRef: baseline.ref, loadArtifact: request.loadArtifact });
  const activationRequest = { ...request, record: gate };
  await assert.rejects(activateLocalContractGate({ ...activationRequest, replayReceipt: { ...receipt },
    loadArtifact: () => { throw new Error("invalid receipt must not load"); } }), /receipt/i);
  await assert.rejects(activateLocalContractGate({ ...activationRequest, graph: { ...service,
    async mergePrepared(prepared) { await service.mergePrepared(prepared); throw new Error("contract activation interrupted after merge"); }
  } }), /contract activation interrupted after merge/);
  assert.throws(() => assertLocalContractCurrentState({ storage, namespace: request.namespace, state: state.ref }), /recovery/);
  storage.close();
  storage = createLocalHostStorage({ rootDirectory: directory });
  service = makeService();
  activationRequest.storage = storage;
  activationRequest.graph = service;
  const activation = await activateLocalContractGate({ ...activationRequest, graph: { ...service,
    mergePrepared() { throw new Error("recovery must reuse approved merge"); } } });
  assert.equal(activation.scope, "approved-contract-state-activation");
  assert.equal(activation.lifecycleComplete, false);
  assert.deepEqual(await verifyLocalContractActivation(activationRequest), activation);
  const head = storage.readRun(localContractHeadId(request.namespace));
  assert.deepEqual(head.state.state, activation.state);
  assert.throws(() => assertLocalContractCurrentState({ storage, namespace: request.namespace, state: state.ref }), /stale/);
  assert.deepEqual(await activateLocalContractGate({ ...activationRequest, graph: { ...service,
    mergePrepared() { throw new Error("approved replay must not merge"); } } }), activation);
  assert.deepEqual(storage.readRun(localContractHeadId(request.namespace)), head);
});
