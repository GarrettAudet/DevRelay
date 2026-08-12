import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { CONTRACT_GENERATION_ARTIFACT_CONTRACTS, validateContractGenerationArtifact } from "../../src/contract-generation-artifact-validator.mjs";
import { createContractGenerationRuntime } from "../../src/contract-generation-runtime.mjs";
import { CONTRACT_GATE_APPROVAL_CONTRACT, promoteContractBaseline } from "../../src/contract-gate.mjs";
import { contractCandidateTraceabilityContributor } from "../../src/contract-traceability-contributor.mjs";
import { architectureBaselineObserverContributor } from "../../src/architecture-traceability-contributor.mjs";
import { requirementsBaselineObserverContributor } from "../../src/requirements-traceability-contributor.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../../src/traceability-graph.mjs";
import { validateWorkBreakdownArtifact } from "../../src/work-breakdown-artifact-validator.mjs";

const ROOT = new URL("../../", import.meta.url);
const OUTPUT = new URL("./contract-generation/", import.meta.url);
const APPROVED = new URL("./contract-generation/approved/", import.meta.url);
const PROJECT = new URL("../../project/", import.meta.url);
const NATIVE_BASE = new URL("../chatgpt-desktop-runtime/contract-generation/native/", import.meta.url);
const EXECUTION_ID = "contract-generation-list-runs-v1";

const contracts = Object.freeze({
  approval: CONTRACT_GATE_APPROVAL_CONTRACT,
  baseline: CONTRACT_GENERATION_ARTIFACT_CONTRACTS.ContractBaseline,
  disposition: { schema: "https://devrelay.dev/artifacts/contract-disposition/v1", mediaType: "application/vnd.devrelay.contract-disposition+json" },
  state: CONTRACT_GENERATION_ARTIFACT_CONTRACTS.ProjectContractState,
});

function document(value, artifactId, contract, url) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return { value, bytes, ref: { artifactId, schema: contract.schema, mediaType: contract.mediaType, digest: sha256Digest(bytes), uri: `devrelay://repository/${fileURLToPath(url).slice(fileURLToPath(ROOT).length).replaceAll("\\", "/")}` }, url };
}

async function load(relative, contract, idField) {
  const url = new URL(relative, ROOT);
  const bytes = await readFile(url);
  const value = JSON.parse(bytes);
  return { value, bytes, ref: { artifactId: value[idField], schema: contract.schema, mediaType: contract.mediaType, digest: sha256Digest(bytes), uri: "devrelay://repository/" + fileURLToPath(url).slice(fileURLToPath(ROOT).length).replaceAll("\\", "/") }, url };
}

async function exact(name, value, artifactId, contract, base = OUTPUT) {
  const loaded = document(value, artifactId, contract, new URL(name, base));
  await mkdir(dirname(fileURLToPath(loaded.url)), { recursive: true });
  await writeFile(loaded.url, loaded.bytes);
  return loaded;
}

async function replaceCurrent(loaded, currentUrl, historyUrl) {
  try {
    const prior = await readFile(currentUrl);
    if (prior.equals(loaded.bytes)) return;
    await mkdir(dirname(fileURLToPath(historyUrl)), { recursive: true });
    await writeFile(historyUrl, prior);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(fileURLToPath(currentUrl)), { recursive: true });
  const temporary = path.join(dirname(fileURLToPath(currentUrl)), `.${path.basename(fileURLToPath(currentUrl))}.${process.pid}.tmp`);
  await writeFile(temporary, loaded.bytes);
  await rename(temporary, currentUrl);
}

function checkpoints() {
  const values = new Map();
  return { async get(key) { return values.get(key); }, async put(key, value) { if (values.has(key)) throw new Error("checkpoint is immutable"); values.set(key, structuredClone(value)); } };
}

function listRunsContract(intent) {
  const id = { type: "string", minLength: 1, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" };
  const timestamp = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$" };
  const diagnostic = { type: "object", additionalProperties: false, required: ["code", "message", "severity"], properties: { code: id, message: { type: "string", minLength: 1 }, severity: { enum: ["info", "warning", "error"] }, runId: id } };
  const run = {
    type: "object",
    additionalProperties: false,
    required: ["runId", "revision", "lifecycleState", "checkpoint", "recoveryStatus", "createdAt", "updatedAt"],
    properties: {
      runId: id,
      revision: { type: "integer", minimum: 1 },
      lifecycleState: { enum: ["created", "active", "clarification-required", "gate-required", "completed", "unable-to-proceed", "failed"] },
      checkpoint: { anyOf: [{ type: "null" }, { type: "string", minLength: 1 }] },
      recoveryStatus: { enum: ["current", "recovered"] },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://devrelay.dev/generated/if-desktop-mcp-commands/v2",
    title: `${intent.name} contract`,
    description: intent.purpose,
    type: "object",
    additionalProperties: false,
    required: ["apiVersion", "interfaceIntentId", "inputs", "outputs"],
    properties: {
      apiVersion: { const: "devrelay.dev/v1alpha1" },
      interfaceIntentId: { const: intent.id },
      inputs: { $ref: "#/$defs/listRunsRequest" },
      outputs: { $ref: "#/$defs/listRunsResult" },
    },
    $defs: {
      listRunsRequest: { type: "object", additionalProperties: false, required: ["operation", "requestId"], properties: { operation: { const: "list-runs" }, requestId: id, limit: { type: "integer", minimum: 1, maximum: 100 }, cursor: { type: "string", minLength: 1, maxLength: 1024 } } },
      runSummary: run,
      listRunsResult: { type: "object", additionalProperties: false, required: ["requestId", "status", "runs", "diagnostics"], properties: { requestId: id, status: { const: "completed" }, runs: { type: "array", maxItems: 100, items: { $ref: "#/$defs/runSummary" } }, nextCursor: { type: "string", minLength: 1, maxLength: 1024 }, diagnostics: { type: "array", items: diagnostic } } },
    },
  };
}

async function priorNative(contractId) {
  return readFile(new URL(`${contractId.toLowerCase()}.schema.json`, NATIVE_BASE));
}

try {
  const existing = await readFile(new URL("contract-baseline.json", APPROVED));
  const current = await readFile(new URL("contract-baseline.json", PROJECT));
  if (existing.equals(current)) {
    process.stdout.write(`${JSON.stringify({ status: "CONTRACT_BASELINE_REPLAYED", baseline: sha256Digest(existing) }, null, 2)}\n`);
    process.exit(0);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const architecture = await load("project/architecture-baseline.json", { schema: "https://devrelay.dev/artifacts/architecture-baseline/v1", mediaType: "application/vnd.devrelay.architecture-baseline+json" }, "baselineId");
const overview = await load("project/project-overview-baseline.json", { schema: "https://devrelay.dev/artifacts/project-overview-baseline/v1", mediaType: "application/vnd.devrelay.project-overview-baseline+json" }, "baselineId");
const requirements = await load("project/requirements-baseline.json", { schema: "https://devrelay.dev/artifacts/requirements-baseline/v1", mediaType: "application/vnd.devrelay.requirements-baseline+json" }, "baselineId");
requirements.ref = structuredClone(architecture.value.requirementsBaseline);
overview.ref = structuredClone(architecture.value.projectOverviewBaseline);
const current = await load("project/contract-baseline.json", contracts.baseline, "baselineId");
const requiredIds = architecture.value.sections.interfaceIntent.content.interfaces.filter((entry) => entry.contractGeneration.required).map((entry) => entry.id).sort();

const state = await exact("project-contract-state.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectContractState", stateId: "PCS-DEVRELAY-LIST-RUNS-001", state: "baselined", architectureBaseline: architecture.ref, projectOverviewBaseline: overview.ref, requiredInterfaceIntentIds: requiredIds, contractBaseline: current.ref }, "PCS-DEVRELAY-LIST-RUNS-001", contracts.state);
validateContractGenerationArtifact(state.value, { ref: state.ref });

let generatorCalls = 0;
const generator = {
  id: "devrelay.desktop-json-schema-generator",
  version: "0.10.0",
  async generate(request) {
    generatorCalls += 1;
    const entries = [];
    for (const intent of request.interfaceIntents) {
      const contractId = `CT-${intent.id}`;
      const bytes = intent.id === "IF-DESKTOP-MCP-COMMANDS" ? Buffer.from(canonicalJson(listRunsContract(intent)), "utf8") : await priorNative(contractId);
      entries.push({ id: contractId, interfaceIntentId: intent.id, contractKind: "json-schema", schema: "https://json-schema.org/draft/2020-12/schema", mediaType: "application/schema+json", bytesBase64: bytes.toString("base64") });
    }
    const material = { requestId: request.requestId, producer: { id: this.id, version: this.version }, entries };
    return { apiVersion: "devrelay.dev/v1alpha1", kind: "GeneratedContractBundle", bundleId: `GCB-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`, ...material, diagnostics: [] };
  },
};

const store = checkpoints();
const runtime = createContractGenerationRuntime({ generators: { "json-schema": generator } });
const first = await runtime.execute({ executionId: EXECUTION_ID, state, architecture, projectOverview: overview, currentBaseline: current, checkpoints: store });
if (first.outcome !== "generated") {
  throw new Error("ContractGeneration failed: " + canonicalJson(first.diagnostics));
}
assert.equal(first.outcome, "generated");
const replay = await runtime.execute({ executionId: EXECUTION_ID, state, architecture, projectOverview: overview, currentBaseline: current, checkpoints: store });
assert.equal(replay.replayed, true);
assert.equal(generatorCalls, 1);
const receipt = await runtime.verifyCheckpointedExecution({ executionId: first.executionId, executionFingerprint: first.executionFingerprint, checkpoints: store });
const checkpoint = receipt.checkpoint;
const candidate = checkpoint.artifacts.candidate;
const changed = checkpoint.artifacts.canonicalDiff.value.changes.filter((entry) => entry.changeType !== "unchanged");
assert.deepEqual(changed.map((entry) => entry.contractId), ["CT-IF-DESKTOP-MCP-COMMANDS"]);

for (const [key, record] of Object.entries(checkpoint.artifacts)) {
  await exact(`${key}.json`, record.value, record.ref.artifactId, { schema: record.ref.schema, mediaType: record.ref.mediaType });
}
for (const [contractId, record] of Object.entries(checkpoint.nativeArtifacts)) {
  const url = new URL(`native/${contractId.toLowerCase()}.schema.json`, OUTPUT);
  await mkdir(dirname(fileURLToPath(url)), { recursive: true });
  await writeFile(url, Buffer.from(record.bytesBase64, "base64"));
}
const checkpointFile = await exact("execution-checkpoint.json", checkpoint, "CG-CHECKPOINT-LIST-RUNS-001", { schema: "https://devrelay.dev/evidence/contract-generation-execution-checkpoint/v1", mediaType: "application/json" });

const graphStore = createInMemoryTraceabilityStore();
const seed = createTraceabilityGraphService({ graphId: "devrelay/list-runs-contracts", projectId: "devrelay", store: graphStore, contributors: [requirementsBaselineObserverContributor, architectureBaselineObserverContributor] });
const seedInvocation = { invocationId: "list-runs-contract-upstream-seed", module: { id: "work-breakdown", version: "0.1.0", operation: "establish-breakdown" } };
const seeded = await seed.prepare({ invocation: seedInvocation, invocationFingerprint: canonicalJsonDigest(seedInvocation), moduleResult: { invocationId: seedInvocation.invocationId, status: "completed", outcome: "decomposed", outputs: {}, evidence: [], diagnostics: [] }, loadedInputs: { "requirements-baseline": [requirements], "project-overview-baseline": [overview], "architecture-baseline": [architecture] }, loadedOutputs: {}, baseGraph: seed.captureBase() });
await seed.mergePrepared(seeded);
const graph = createTraceabilityGraphService({ graphId: "devrelay/list-runs-contracts", projectId: "devrelay", store: graphStore, contributors: [contractCandidateTraceabilityContributor] });
const invocation = { invocationId: EXECUTION_ID, module: { id: "contract-generation", version: "0.1.0", operation: "generate-contract-change" } };
const moduleResult = { invocationId: EXECUTION_ID, status: "completed", outcome: "generated", outputs: { "contract-change-set-draft": [candidate.ref] }, evidence: [], diagnostics: [] };
const prepared = await graph.prepare({ invocation, invocationFingerprint: canonicalJsonDigest(invocation), moduleResult, loadedInputs: { "project-contract-state": [state], "architecture-baseline": [architecture], "project-overview-baseline": [overview], "current-contract-baseline": [current] }, loadedOutputs: { "contract-change-set-draft": [{ value: candidate.value, ref: candidate.ref, bytes: Buffer.from(candidate.bytesBase64, "base64") }] }, baseGraph: graph.captureBase() });
const merged = await graph.mergePrepared(prepared);
graph.assertApplied(prepared.updateRef);
const traceUpdate = await exact("traceability-update.json", prepared.update, prepared.updateRef.artifactId, { schema: prepared.updateRef.schema, mediaType: prepared.updateRef.mediaType });
await exact("traceability-merge-receipt.json", merged.receipt, merged.receiptRef.artifactId, { schema: merged.receiptRef.schema, mediaType: merged.receiptRef.mediaType });
await exact("traceability-graph-snapshot.json", merged.snapshot, merged.snapshotRef.artifactId, { schema: merged.snapshotRef.schema, mediaType: merged.snapshotRef.mediaType });

const review = await exact("contract-gate-review.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "ContractGateReview", reviewId: "CGR-LIST-RUNS-001", candidate: candidate.ref, checkpointDigest: checkpoint.checkpointDigest, checks: [{ id: "exact-interface-coverage", status: "pass" }, { id: "json-schema-2020-12-validation", status: "pass" }, { id: "single-authorized-contract-delta", status: "pass" }, { id: "zero-call-checkpoint-replay", status: "pass" }, { id: "candidate-traceability-merge", status: "pass" }], changedContractIds: changed.map((entry) => entry.contractId), decision: "approved-by-project-owner" }, "CGR-LIST-RUNS-001", { schema: "https://devrelay.dev/evidence/contract-gate-review/v1", mediaType: "application/json" });
const approval = await exact("contract-gate-owner-approval.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "ContractGateApproval", approvalId: "CGA-LIST-RUNS-001", authority: "project-owner", decision: "approve", policyVersion: "contract-gate/0.1.0", candidate: candidate.ref, breakingChangeApproved: true, requiredEvidence: [review.ref, checkpointFile.ref, traceUpdate.ref] }, "CGA-LIST-RUNS-001", contracts.approval, APPROVED);
const baselineValue = { apiVersion: "devrelay.dev/v1alpha1", kind: "ContractBaseline", baselineId: "CB-DEVRELAY-009", version: "1.8.0", approvedCandidate: candidate.ref, supersedes: current.ref, architectureBaseline: architecture.ref, projectOverviewBaseline: overview.ref, contracts: candidate.value.contracts, contractsDigest: canonicalJsonDigest(candidate.value.contracts), approvalEvidence: [approval.ref], sourceRefs: candidate.value.sourceRefs };
const baseline = document(baselineValue, baselineValue.baselineId, contracts.baseline, new URL("contract-baseline.json", APPROVED));
validateContractGenerationArtifact(baseline.value, { ref: baseline.ref });
const evidence = [review, checkpointFile, traceUpdate];
const commit = await promoteContractBaseline({ replayReceipt: receipt, baseline: baseline.value, baselineRef: baseline.ref, baselineBytes: baseline.bytes, approval, evidenceResolver: async (ref) => evidence.find((entry) => entry.ref.digest === ref.digest) });
assert.equal(commit.progressionAllowed, true);
const disposition = document(commit.contractDisposition, commit.contractDisposition.dispositionId, contracts.disposition, new URL("contract-disposition.json", APPROVED));
validateWorkBreakdownArtifact(disposition.value, { ref: disposition.ref });
const promotedStateValue = { ...state.value, stateId: "PCS-DEVRELAY-LIST-RUNS-BASELINED-001", contractBaseline: baseline.ref };
const promotedState = document(promotedStateValue, promotedStateValue.stateId, contracts.state, new URL("project-contract-state.json", APPROVED));
validateContractGenerationArtifact(promotedState.value, { ref: promotedState.ref });
const promotion = document({ apiVersion: "devrelay.dev/v1alpha1", kind: "ContractGatePromotionProof", promotionId: "CGP-LIST-RUNS-001", candidate: candidate.ref, approval: approval.ref, contractBaseline: baseline.ref, contractDisposition: disposition.ref, projectContractState: promotedState.ref, checkpointDigest: checkpoint.checkpointDigest, traceabilityUpdate: traceUpdate.ref, progressionAllowed: true, nextModule: "work-breakdown" }, "CGP-LIST-RUNS-001", { schema: "https://devrelay.dev/evidence/contract-gate-promotion/v1", mediaType: "application/json" }, new URL("contract-gate-promotion.json", APPROVED));

for (const artifact of [baseline, disposition, promotedState, promotion]) await exact(path.basename(fileURLToPath(artifact.url)), artifact.value, artifact.ref.artifactId, { schema: artifact.ref.schema, mediaType: artifact.ref.mediaType }, APPROVED);
const history = new URL(`history/contracts/${current.value.baselineId}/`, PROJECT);
await replaceCurrent(baseline, new URL("contract-baseline.json", PROJECT), new URL("contract-baseline.json", history));
await replaceCurrent(disposition, new URL("contract-disposition.json", PROJECT), new URL("contract-disposition.json", history));
await replaceCurrent(approval, new URL("contract-gate-owner-approval.json", PROJECT), new URL("contract-gate-owner-approval.json", history));
await replaceCurrent(promotedState, new URL("project-contract-state.json", PROJECT), new URL("project-contract-state.json", history));
await replaceCurrent(promotion, new URL("contract-promotion.commit.json", PROJECT), new URL("contract-promotion.commit.json", history));

process.stdout.write(`${JSON.stringify({ status: "CONTRACT_BASELINE_PROMOTED", candidate: candidate.ref.digest, baseline: baseline.ref.digest, changedContracts: changed.map((entry) => entry.contractId), traceabilityUpdate: traceUpdate.ref.digest, checkpoint: checkpoint.checkpointDigest, generatorCalls, nextModule: "work-breakdown" }, null, 2)}\n`);
