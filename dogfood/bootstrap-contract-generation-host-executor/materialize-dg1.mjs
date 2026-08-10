import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createJsonSchemaContractBundle } from "../../src/contract-format-registry.mjs";
import { createJsonSchemaContractHostGenerator } from "../../src/contract-generation-host-executor-adapter.mjs";
import { createContractGenerationRuntime } from "../../src/contract-generation-runtime.mjs";
import { selectRequiredContractGenerationIntents } from "../../src/contract-generation-intent-selection.mjs";

const source = process.argv[2];
if (!source) throw new Error("usage: node materialize-dg1.mjs <immutable-6ddd-continuation-directory>");
const output = new URL("./dg1-continuation/", import.meta.url);
fs.mkdirSync(output, { recursive: true });
const read = (name) => fs.readFileSync(path.join(source, name));
const json = (name) => JSON.parse(read(name));
const write = (name, bytes) => fs.writeFileSync(new URL(name, output), bytes);
const writeJson = (name, value) => write(name, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
const ref = (artifactId, schema, mediaType, bytes, name) => ({ artifactId, schema, mediaType, digest: sha256Digest(bytes), uri: `artifact://dg1-contract-generation/${name}` });

const sourceManifestBytes = read("evidence-manifest.json");
assert.equal(sha256Digest(sourceManifestBytes), "sha256:6dddece4148cee24389595e2d971993f859f62df2fb0fd4da9fc1f00416bd311");
const requirementsBytes = read("requirements-requirements-baseline.planning-evidence.json");
const overviewBytes = read("requirements-project-overview-baseline.planning-evidence.json");
const architectureBytes = read("architecture-architecture-change-set-draft.json");
const requirements = JSON.parse(requirementsBytes), overview = JSON.parse(overviewBytes), architecture = JSON.parse(architectureBytes);
const baseArchitectureBytes = fs.readFileSync(new URL("../../project/architecture-baseline.json", import.meta.url));
const baseArchitecture = JSON.parse(baseArchitectureBytes);
const contractBytes = fs.readFileSync(new URL("../../project/contract-baseline.json", import.meta.url));
const contract = JSON.parse(contractBytes);
const requirementsRef = ref(requirements.baselineId, "https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json", requirementsBytes, "requirements-baseline.json");
const overviewRef = ref(overview.baselineId, "https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json", overviewBytes, "project-overview-baseline.json");
const architectureRef = ref(architecture.changeSetId, "https://devrelay.dev/artifacts/architecture-change-set-draft/v1", "application/vnd.devrelay.architecture-change-set-draft+json", architectureBytes, "architecture-change-set-draft.json");
const baseArchitectureRef = ref(baseArchitecture.baselineId, "https://devrelay.dev/artifacts/architecture-baseline/v1", "application/vnd.devrelay.architecture-baseline+json", baseArchitectureBytes, "base-architecture-baseline.json");
const contractRef = ref(contract.baselineId, "https://devrelay.dev/artifacts/contract-baseline/v1", "application/vnd.devrelay.contract-baseline+json", contractBytes, "contract-baseline.json");
assert.equal(architecture.baseArchitectureBaseline.digest, sha256Digest(baseArchitectureBytes));
assert.equal(architecture.baseArchitectureBaseline.artifactId, baseArchitecture.baselineId);
const selectedIntents = selectRequiredContractGenerationIntents(architecture);
const intentIds = selectedIntents.map(({ id }) => id).sort();
assert.ok(intentIds.length > 0 && intentIds.length < architecture.sections.interfaceIntent.content.interfaces.length);
assert.deepEqual([...new Set(selectedIntents.map((item) => item.contractGeneration.suggestedKinds[0]))], ["json-schema"]);

const state = { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectContractState", stateId: "PCS-DG1-PREFIX-INTEGRITY-CONTRACT-CHANGE", state: "baselined", architectureBaseline: architectureRef, projectOverviewBaseline: overviewRef, contractBaseline: contractRef, requiredInterfaceIntentIds: intentIds };
const stateBytes = Buffer.from(canonicalJson(state));
const stateRef = ref(state.stateId, "https://devrelay.dev/artifacts/project-contract-state/v1", "application/vnd.devrelay.project-contract-state+json", stateBytes, "project-contract-state.json");
const bytesById = new Map([[architectureRef.artifactId, architectureBytes], [overviewRef.artifactId, overviewBytes], [contractRef.artifactId, contractBytes], [stateRef.artifactId, stateBytes]]);
const evidence = [];
const calls = { "json-schema-contract-generator": 0 };
const binding = { module: { id: "contract-generation", version: "0.1.0", operation: "generate-contract-change" }, step: "generate", plugin: { id: "json-schema-contract-generator", version: "0.1.0" }, config: { contractKind: "json-schema" }, grants: [] };
const generator = createJsonSchemaContractHostGenerator({
  binding,
  loadArtifact: async (artifact) => bytesById.get(artifact.artifactId),
  persistEvidence: async (value) => { evidence.push(value); return { digest: canonicalJsonDigest(value) }; },
  executeCapability: async (capabilityRequest) => {
    calls["json-schema-contract-generator"] += 1;
    const bundle = createJsonSchemaContractBundle(capabilityRequest.request, { id: binding.plugin.id, version: binding.plugin.version });
    return { apiVersion: "devrelay.dev/v1alpha1", kind: "ContractGenerationHostCapabilityResponse", binding: capabilityRequest.binding, requestId: capabilityRequest.request.requestId, bundle,
      nativeEvidence: bundle.entries.map((entry) => ({ contractId: entry.id, contentDigest: sha256Digest(Buffer.from(entry.bytesBase64, "base64")), schema: entry.schema, mediaType: entry.mediaType, sourceProvenance: { incrementId: "DGI-LIFECYCLE-RUN-REPORT-2026-08-10", sourceManifestDigest: sha256Digest(sourceManifestBytes), interfaceIntentId: entry.interfaceIntentId } })),
      executionIdentity: { executor: { id: "dg1-json-schema-fixture-host", version: "1" }, tool: { id: "devrelay-json-schema-generator", version: "0.1.0" }, model: { id: "bounded-fixture", version: "1" }, prompt: { digest: canonicalJsonDigest({ incrementId: "DGI-LIFECYCLE-RUN-REPORT-2026-08-10", requestDigest: capabilityRequest.requestDigest }) }, environment: { id: "node", version: process.version } },
      conformance: { maturity: "fixture-conformant", validator: "devrelay.json-schema-2020-12-validator@0.1.0", liveProviderExecuted: false }, diagnostics: [] };
  },
});
const checkpointsMap = new Map();
const checkpoints = { async get(key) { return checkpointsMap.get(key); }, async put(key, value) { if (checkpointsMap.has(key)) throw new Error("immutable checkpoint collision"); checkpointsMap.set(key, structuredClone(value)); } };
const runtime = createContractGenerationRuntime({ generators: { "json-schema": generator } });
const invocation = { executionId: "contract-generation-dg1-prefix-integrity-repair", state: { ref: stateRef, bytes: stateBytes, value: state }, architecture: { ref: architectureRef, bytes: architectureBytes, value: architecture }, projectOverview: { ref: overviewRef, bytes: overviewBytes, value: overview }, currentBaseline: { ref: contractRef, bytes: contractBytes, value: contract }, checkpoints };
const first = await runtime.execute(invocation);
const firstCalls = structuredClone(calls), firstBytes = Buffer.from(canonicalJson(first.candidate));
const replay = await runtime.execute(invocation), replayBytes = Buffer.from(canonicalJson(replay.candidate));
assert.equal(first.outcome, "generated"); assert.equal(first.candidate.kind, "ContractChangeSetDraft"); assert.equal(first.candidate.contracts.length, intentIds.length);
assert.deepEqual(calls, firstCalls); assert.equal(firstCalls["json-schema-contract-generator"], 1); assert.ok(firstBytes.equals(replayBytes));
const receipt = await runtime.verifyCheckpointedExecution({ executionId: first.executionId, executionFingerprint: first.executionFingerprint, checkpoints });
const checkpoint = receipt.checkpoint;
const files = new Map();
const emit = (name, value) => { const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); write(name, bytes); files.set(name, bytes); };
const emitCanonical = (name, value) => { const bytes = Buffer.from(canonicalJson(value)); write(name, bytes); files.set(name, bytes); };
emit("contract-generation-capability-gap.corrected.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "BootstrapCapabilityGapCorrection", correctionId: "BCGC-DG1-CONTRACT-GENERATION-ROUTE-B", status: "resolved-by-bounded-host-binding", supersedes: { manifestDigest: sha256Digest(sourceManifestBytes), capabilityGapDigest: "sha256:4325ec7b9a7d283905be4f62f69928ddcd5b42cce2e283ab8caf7b318b92f03c" }, authorityAnalysis: { human: "sha256:981ab4dd7472108506e20d2d65d7236a015c2c57816b3a1e07f2c95f6c0a75a2", machine: "sha256:a088dceb7c94cab1b69565e945588c35fd4e9816bce4b03a9d5b58a9da0989df", confidence: 0.99 }, selectionRule: "interface.contractGeneration.required === true", requiredInterfaceIntentCount: intentIds.length, requiredInterfaceIntentIds: intentIds, excludedInterfaceIntentCount: architecture.sections.interfaceIntent.content.interfaces.length - intentIds.length, correction: "The superseded selector read a nonexistent top-level required field and therefore selected every interface." });
emit("project-contract-state.json", state); emit("contract-generation.result.json", first); emitCanonical("contract-change-set-draft.json", first.candidate); emit("execution-checkpoint.json", checkpoint); emit("host-generator-evidence.json", evidence[0]);
emit("runtime-execution-proof.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DG1ContractGenerationHostExecutorProof", status: "pass", incrementId: "DGI-LIFECYCLE-RUN-REPORT-2026-08-10", correctedRequiredIntentCount: intentIds.length, sourceManifestDigest: sha256Digest(sourceManifestBytes), supersededCapabilityGapDigest: "sha256:4325ec7b9a7d283905be4f62f69928ddcd5b42cce2e283ab8caf7b318b92f03c", authorityAnalysis: { human: "sha256:981ab4dd7472108506e20d2d65d7236a015c2c57816b3a1e07f2c95f6c0a75a2", machine: "sha256:a088dceb7c94cab1b69565e945588c35fd4e9816bce4b03a9d5b58a9da0989df" }, savedProjectIntegrationReceipt: "sha256:86a907932a4c897a5ea5523038c6c0987ab27abc32d49fa68cb124b66244d489", operation: "generate-contract-change", binding, exactInputs: { requirementsBaseline: requirementsRef, projectOverviewBaseline: overviewRef, architectureChangeSetDraft: architectureRef, baseArchitectureBaseline: baseArchitectureRef, currentContractBaseline: contractRef }, firstExecutionCalls: firstCalls, checkpointCount: checkpointsMap.size, replayAdditionalCalls: { "json-schema-contract-generator": 0 }, identicalReplayBytes: true, terminalResultDigest: sha256Digest(firstBytes), replayResultDigest: sha256Digest(replayBytes), terminalArtifact: first.candidateRef, terminalArtifactRawDigest: sha256Digest(Buffer.from(canonicalJson(first.candidate))), maturity: { generator: "fixture-conformant", liveProviderConformance: false }, authority: { contractGateDecision: false, baselineMutation: false, traceabilityMerge: false, progressionBeyondContractGeneration: false } });
const handoff = { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkExecutionHandoff", handoffId: "WEH-DG1-CONTRACT-GENERATION-HOST-BINDING", status: "closed-awaiting-independent-verification", incrementId: "DGI-LIFECYCLE-RUN-REPORT-2026-08-10", sourceLineage: { supersedesManifest: sha256Digest(sourceManifestBytes), supersedesCapabilityGap: "sha256:4325ec7b9a7d283905be4f62f69928ddcd5b42cce2e283ab8caf7b318b92f03c", authorityAnalysisHuman: "sha256:981ab4dd7472108506e20d2d65d7236a015c2c57816b3a1e07f2c95f6c0a75a2", authorityAnalysisMachine: "sha256:a088dceb7c94cab1b69565e945588c35fd4e9816bce4b03a9d5b58a9da0989df", savedProjectIntegrationReceipt: "sha256:86a907932a4c897a5ea5523038c6c0987ab27abc32d49fa68cb124b66244d489" }, outcome: { operation: "generate-contract-change", requiredIntentCount: intentIds.length, candidate: first.candidateRef, checkpointReplayVerified: true, terminalBytesIdentical: true }, maturity: "fixture-conformant", assumptions: ["ArchitectureGate planning validation is task-local evidence and is not represented as baseline promotion."], residualRisks: ["No live provider conformance is claimed.", "ContractGate has not reviewed or promoted this candidate."], authorityProof: { gateDecision: false, graphMutation: false, baselinePromotion: false, completionMutation: false, prefixMutation: false, pbMutation: false, downstreamStarted: false } };
emit("work-execution-handoff.json", handoff);
const sourceFiles = [
  ["../../src/contract-generation-host-executor-adapter.mjs", "src/contract-generation-host-executor-adapter.mjs"],
  ["../../src/contract-generation-intent-selection.mjs", "src/contract-generation-intent-selection.mjs"],
  ["../../src/contract-generation-runtime.mjs", "src/contract-generation-runtime.mjs"],
  ["../../test/contract-generation-host-executor-adapter.test.mjs", "test/contract-generation-host-executor-adapter.test.mjs"],
  ["../../test/contract-generation-host-executor-dg1-continuation.test.mjs", "test/contract-generation-host-executor-dg1-continuation.test.mjs"],
  ["../../test/contract-generation-intent-selection.test.mjs", "test/contract-generation-intent-selection.test.mjs"],
  ["../../docs/contract-generation.md", "docs/contract-generation.md"],
  ["../../src/index.mjs", "src/index.mjs"],
  ["../../package.json", "package.json"],
  ["../../analysis/dg1-contract-generation-48-vs-57-authority-analysis.md", "analysis/dg1-contract-generation-48-vs-57-authority-analysis.md"],
  ["../../analysis/dg1-contract-generation-48-vs-57-authority-analysis.json", "analysis/dg1-contract-generation-48-vs-57-authority-analysis.json"],
  ["./materialize-dg1.mjs", "dogfood/bootstrap-contract-generation-host-executor/materialize-dg1.mjs"],
];
const entries = [...files.entries()].map(([name, bytes]) => ({ path: `dogfood/bootstrap-contract-generation-host-executor/dg1-continuation/${name}`, byteLength: bytes.length, sha256: sha256Digest(bytes) }));
for (const [relative, manifestPath] of sourceFiles) { const bytes = fs.readFileSync(new URL(relative, import.meta.url)); entries.push({ path: manifestPath, byteLength: bytes.length, sha256: sha256Digest(bytes) }); }
entries.sort((a, b) => a.path.localeCompare(b.path));
const manifest = { apiVersion: "devrelay.dev/v1alpha1", kind: "ContentAddressedEvidenceManifest", manifestId: "DG1-CONTRACT-GENERATION-HOST-BINDING-ROUTE-B-2026-08-10", lineage: { supersedesManifest: sha256Digest(sourceManifestBytes), supersedesCapabilityGap: "sha256:4325ec7b9a7d283905be4f62f69928ddcd5b42cce2e283ab8caf7b318b92f03c", authorityAnalysisHuman: "sha256:981ab4dd7472108506e20d2d65d7236a015c2c57816b3a1e07f2c95f6c0a75a2", authorityAnalysisMachine: "sha256:a088dceb7c94cab1b69565e945588c35fd4e9816bce4b03a9d5b58a9da0989df" }, entries };
writeJson("evidence-manifest.json", manifest);
process.stdout.write(`${JSON.stringify({ status: "pass", calls: firstCalls, replayAdditionalCalls: 0, candidate: first.candidateRef, manifestDigest: sha256Digest(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)) })}\n`);
