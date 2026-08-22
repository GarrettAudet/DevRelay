import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../../../src/index.mjs";

const API = "devrelay.dev/v1alpha1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const out = "dogfood/ep-001-environment-preparation/final-conclusion";
const bytes = (p) => fs.readFileSync(path.join(root, p));
const json = (p) => JSON.parse(bytes(p));
const ref = (artifactId, digest, schema = "https://devrelay.dev/evidence/project-memory/v1", mediaType = "application/json") => ({ artifactId, schema, mediaType, digest, uri: `memory://devrelay/ep001/${encodeURIComponent(artifactId)}/${digest.slice(7)}` });
const source = (role, artifact) => ({ role, artifact });
const raw = (p, artifactId, schema, mediaType = "application/json") => { const rawBytes = bytes(p); return { value: JSON.parse(rawBytes), bytes: rawBytes, ref: ref(artifactId, api.sha256Digest(rawBytes), schema, mediaType) }; };
const writeJson = (p, value, newline = true) => { const target = path.join(root, p); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${api.canonicalJson(value)}${newline ? "\n" : ""}`, "utf8"); };
const writeBytes = (p, value) => { const target = path.join(root, p); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
const record = (id, category, statement, domain, authority, sourceRefs) => ({ id, category, statement, authority, status: "active", effectiveAt: "2026-08-22T18:00:00.000Z", domain, sourceRefs });

const baseValue = json("project/history/project-memory/1.0.1/project-memory-baseline.json");
const base = api.loadProjectMemoryArtifact(baseValue);
const baseSynopsis = api.renderCurrentSynopsis(baseValue);
assert.deepEqual(baseSynopsis.bytes, bytes("project/history/project-memory/1.0.1/CurrentSynopsis.md"));
const final = json("dogfood/ep-001-environment-preparation/final-acceptance/final-acceptance-summary.json");
const sv = raw("dogfood/ep-001-environment-preparation/final-acceptance/12-system-verification-result.json", final.systemVerification.artifactId, "https://devrelay.dev/artifacts/system-verification-result/v1");
const ba = raw("dogfood/ep-001-environment-preparation/final-acceptance/26-business-acceptance-record.json", final.businessAcceptance.artifactId, "https://devrelay.dev/artifacts/business-acceptance-record/v1");
const proof = raw("dogfood/ep-001-environment-preparation/final-acceptance/30-final-acceptance-proof.json", "DEVRELAY-EP001-SOURCE-RELEASE-ACCEPTANCE-001", "https://devrelay.dev/evidence/source-release-acceptance/v1");
const installed = raw("dogfood/ep-001-environment-preparation/windows-e2e/installed-package-verification-receipt.json", "EP001-WINDOWS-INSTALLED-PACKAGE-VERIFICATION", "https://devrelay.dev/evidence/windows-installed-package/v1");
const repair = raw("dogfood/ep-001-environment-preparation/integration-release-security-fix-1/integration-summary.json", "EP001-CODEQL-REPAIR-INTEGRATION", "https://devrelay.dev/evidence/change-integration/v1");
const roadmapSummary = json("dogfood/ep-001-environment-preparation/roadmap-resolution/roadmap-resolution-summary.json");
assert.equal(roadmapSummary.outcome, "promoted");
const roadmapProof = raw("dogfood/ep-001-environment-preparation/roadmap-resolution/roadmap-gate-promotion-proof.json", roadmapSummary.gateProof.artifactId, "https://devrelay.dev/evidence/roadmap-gate-promotion/v1");
const graphValue = json("dogfood/ep-001-environment-preparation/final-acceptance/29-business-acceptance-graph.json");
const graph = { value: graphValue, bytes: Buffer.from(api.canonicalJson(graphValue), "utf8"), ref: structuredClone(final.traceabilityGraph) };
assert.equal(api.sha256Digest(graph.bytes), graph.ref.digest);
const baseTraceValue = json("dogfood/pm-001-project-memory/final-conclusion/04-traceability-context-projection.json");
const baseTrace = api.loadProjectMemoryArtifact(baseTraceValue);
assert.deepEqual(baseTraceValue.graphCheckpoint, baseValue.graphCheckpoint);

const traceValue = api.withProjectMemoryContentDigest({ apiVersion: API, kind: "TraceabilityContextProjection", projectionId: "TCP-DEVRELAY-EP001-ACCEPTANCE-001", graphCheckpoint: graph.ref, graphVersion: graphValue.vocabulary.version, scope: ["acceptance", "environment-preparation", "project-memory"], lifecyclePosition: "business-acceptance", nodes: [{ id: ba.ref.artifactId, kind: "business-acceptance", label: "EP-001 accepted EnvironmentPreparation release candidate", sourceRefs: [source("business-acceptance", ba.ref)] }], edges: [], diagnostics: [] });
const trace = api.loadProjectMemoryArtifact(traceValue);
const artifacts = new Map([[base.ref.digest, base], [baseSynopsis.ref.digest, { ref: baseSynopsis.ref, bytes: baseSynopsis.bytes }], [baseTrace.ref.digest, baseTrace], [trace.ref.digest, trace]]);
let tick = 0;
const runtime = api.createProjectMemoryRuntime({ provider: null, monotonicNow: () => ++tick });
const bootstrap = api.createProjectMemoryContextBootstrap({ loadArtifact: async (artifact) => artifacts.get(artifact.digest), runtime, clock: () => "2026-08-22T18:05:00.000Z", monotonicNow: () => ++tick });
const initial = await bootstrap.load({ executionId: "EP001-FINAL-CONCLUSION-INITIAL-LOAD", operation: "load-context", projectId: "devrelay", sessionId: "SESSION-EP001-FINAL", taskId: "TASK-EP001-FINAL", workspaceId: "WORKSPACE-DEVRELAY", repositoryRevision: repair.value.finalCommit, moduleId: "business-acceptance", moduleInvocationId: "INV-EP001-FINAL-CONCLUSION", projectMemoryBaseline: base.ref, synopsisProjection: baseSynopsis.ref, traceabilityProjection: baseTrace.ref, query: "DevRelay EP-001 acceptance, environment readiness, and next action" });
assert.deepEqual(initial.receipt.loadOrder, ["current-synopsis", "project-memory-baseline", "traceability-context"]);

const accepted = record("MEM-DEVRELAY-EP001-ACCEPTANCE", "decision", "EP-001 EnvironmentPreparation is accepted for the controlled Windows source/library release, including deterministic profiles, capability-gated reversible effects, readiness receipts, drift blocking and recovery, provider-neutral adapter slots, telemetry, and installed-package Desktop proof.", "acceptance", "approved-project", [source("business-acceptance", ba.ref), source("installed-package-receipt", installed.ref), source("acceptance-proof", proof.ref)]);
const ready = record("MEM-DEVRELAY-STATUS-EP001-RELEASE-READY", "status", `EP-001 EnvironmentPreparation is construction-complete and accepted by ${ba.ref.artifactId}; SystemVerification covers 175 acceptance criteria and 46 NFRs with zero blocking traceability diagnostics.`, "acceptance", "validated-status", [source("business-acceptance", ba.ref), source("system-verification", sv.ref), source("repair-integration", repair.ref)]);
const next = record("MEM-DEVRELAY-NEXT-AFTER-EP001", "next-action", "Prioritize ReleasePreparation through the full current DevRelay circuit, using the accepted EnvironmentPreparation readiness receipts as a mandatory pre-execution boundary.", "roadmap", "approved-project", [source("business-acceptance", ba.ref), source("roadmap-gate", roadmapProof.ref), source("project-memory-baseline", base.ref)]);
const changes = [
  { changeId: "CHANGE-EP001-ACCEPTANCE-ADD", disposition: "add", qualitative: true, domain: "acceptance", proposedMemory: accepted, rationale: "Record the exact accepted EP-001 behavior as durable project direction.", sourceRefs: [source("business-acceptance", ba.ref)] },
  { changeId: "CHANGE-EP001-STATUS-ADD", disposition: "add", qualitative: false, domain: "acceptance", proposedMemory: ready, rationale: "Record the exact verified and accepted EP-001 status.", sourceRefs: [source("business-acceptance", ba.ref), source("system-verification", sv.ref)] },
  { changeId: "CHANGE-EP001-NEXT-REPLACE", disposition: "replace", qualitative: true, domain: "roadmap", targetMemoryId: "MEM-DEVRELAY-NEXT", proposedMemory: next, rationale: "Advance the approved sequence through the exact promoted ReleasePreparation roadmap initiative.", sourceRefs: [source("business-acceptance", ba.ref), source("roadmap-gate", roadmapProof.ref)] },
];
const candidateValue = api.createMemoryUpdateCandidate({ projectId: "devrelay", sessionId: "SESSION-EP001-FINAL", taskId: "TASK-EP001-FINAL", baseBaseline: base.ref, baseGraphCheckpoint: baseValue.graphCheckpoint, producerType: "main", changes, sourceRefs: [source("business-acceptance", ba.ref), source("acceptance-proof", proof.ref), source("roadmap-gate", roadmapProof.ref)] });
const candidate = api.loadProjectMemoryArtifact(candidateValue);
const routes = api.resolveMemoryChangeRoutes(candidateValue);
assert.deepEqual(routes.map(({ changeId, nextModule }) => [changeId, nextModule]), [["CHANGE-EP001-ACCEPTANCE-ADD", "project-memory-gate"], ["CHANGE-EP001-NEXT-REPLACE", "roadmap-management"], ["CHANGE-EP001-STATUS-ADD", "project-memory-gate"]]);
const contextReceipt = ref(initial.receipt.receiptId, api.canonicalJsonDigest(initial.receipt), "https://devrelay.dev/evidence/project-memory-context-load/v1");
const conclusionValue = api.createSessionConclusion({ projectId: "devrelay", sessionId: "SESSION-EP001-FINAL", taskId: "TASK-EP001-FINAL", producerType: "main", startingBaseline: base.ref, startingGraphCheckpoint: baseValue.graphCheckpoint, contextReceipt, completedArtifacts: [sv.ref, ba.ref, proof.ref, roadmapProof.ref], evidence: [installed.ref, repair.ref], pendingDecisions: [], memoryCandidate: candidate.ref });
const terminal = api.canonicalJsonDigest({ conclusion: conclusionValue.contentDigest, graph: graph.ref, acceptance: ba.ref });
const approvalValue = api.createProjectMemoryGateApproval({ candidate: candidateValue, candidateRef: candidate.ref, terminalCheckpointDigest: terminal, decisions: changes.map(({ changeId }) => ({ changeId, decision: "approve", rationale: "Standing owner authorization applies to the exact accepted EP-001 lifecycle outcome and previously approved module sequence." })) });
const providerValue = api.withProjectMemoryContentDigest({ apiVersion: API, kind: "MemoryProviderReceipt", receiptId: "MPR-DEVRELAY-EP001-NATIVE-EQUIVALENT-001", providerId: "devrelay.native-project-memory", providerVersion: "1.0.0", operation: "synchronize", namespace: "project/devrelay", configurationDigest: api.canonicalJsonDigest({ provider: "devrelay.native-project-memory", policy: "exact-baseline-equivalence" }), inputCheckpoints: [base.ref, candidate.ref], commandFingerprint: api.canonicalJsonDigest({ operation: "synchronize", baseline: base.ref, candidate: candidate.ref }), outcome: "native-equivalent", durationMs: 0, replayed: false, citations: [], outputDigest: api.canonicalJsonDigest(changes) });
const provider = api.loadProjectMemoryArtifact(providerValue);
let commits = 0;
let committed;
const coordinator = api.createProjectMemoryConclusionCoordinator({ commitAtomic: async ({ expectedBaseline, baseline, synopsis, proof: promotion }) => { assert.deepEqual(expectedBaseline, base.ref); commits += 1; committed = { baseline, synopsis, proof: promotion }; return { committed: true }; } });
const concludeInput = { conclusion: conclusionValue, candidate: candidateValue, candidateRef: candidate.ref, approval: approvalValue, baseBaseline: base.value, baseBaselineRef: base.ref, providerSyncReceipt: providerValue, providerSyncReceiptRef: provider.ref, resultGraphCheckpoint: graph.ref, sourceRefs: [source("business-acceptance", ba.ref), source("system-verification", sv.ref), source("provider-equivalence", provider.ref)] };
const concluded = await coordinator.conclude(concludeInput);
const replay = await coordinator.conclude(concludeInput);
assert.equal(concluded.outcome, "concluded");
assert.equal(replay.replayed, true);
assert.equal(commits, 1);
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === accepted.id && status === "active"), true);
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === ready.id && status === "active"), true);
assert.equal(committed.baseline.value.records.some(({ id, status }) => id === "MEM-DEVRELAY-NEXT" && status === "superseded"), true);

artifacts.set(committed.baseline.ref.digest, committed.baseline);
artifacts.set(committed.synopsis.ref.digest, { ref: committed.synopsis.ref, bytes: committed.synopsis.bytes });
const freshRequest = { executionId: "EP001-FRESH-TASK-AFTER-CONCLUDE", operation: "load-context", projectId: "devrelay", sessionId: "SESSION-EP001-NEXT", taskId: "TASK-EP001-NEXT", workspaceId: "WORKSPACE-DEVRELAY", repositoryRevision: repair.value.finalCommit, moduleId: "roadmap-management", moduleInvocationId: "INV-EP001-NEXT-ROADMAP", projectMemoryBaseline: committed.baseline.ref, synopsisProjection: committed.synopsis.ref, traceabilityProjection: trace.ref, query: "current DevRelay status and next prioritized work" };
const fresh = await bootstrap.load(freshRequest);
const freshReplay = await bootstrap.load(freshRequest);
assert.deepEqual(fresh.receipt.loadOrder, ["current-synopsis", "project-memory-baseline", "traceability-context"]);
assert.equal(freshReplay.replayed, true);
assert.equal(freshReplay.providerReceipt.value.outcome, "native-equivalent");
assert.equal(freshReplay.bundle.value.items.some(({ memoryId }) => memoryId === accepted.id), true);
const session = api.createProjectMemorySessionState({ projectId: "devrelay", sessionId: "SESSION-EP001-FINAL", taskId: "TASK-EP001-FINAL", status: "concluded", baseline: committed.baseline.ref, graphCheckpoint: graph.ref, lastCheckpointDigest: concluded.receipt.resultingCheckpointDigest, updatedAt: "2026-08-22T18:10:00.000Z" });

const outputs = [
  ["00-traceability-context-projection.json", traceValue], ["01-initial-context-load-receipt.json", initial.receipt], ["02-memory-update-candidate.json", candidateValue], ["03-memory-change-routes.json", { apiVersion: API, kind: "ProjectMemoryChangeRoutes", routes }], ["04-session-conclusion.json", conclusionValue], ["05-project-memory-gate-approval.json", approvalValue], ["06-provider-native-equivalence-receipt.json", providerValue], ["07-project-memory-baseline.json", committed.baseline.value], ["08-project-memory-gate-promotion-proof.json", committed.proof], ["09-conclude-receipt.json", concluded.receipt], ["10-project-memory-session-state.json", session], ["11-fresh-task-context-load-receipt.json", fresh.receipt], ["12-fresh-task-provider-receipt.json", fresh.providerReceipt.value], ["13-fresh-task-memory-context-bundle.json", fresh.bundle.value], ["14-fresh-task-replay-proof.json", { apiVersion: API, kind: "ProjectMemoryFreshTaskReplayProof", firstReplayed: fresh.replayed, replayed: freshReplay.replayed, replayProviderCalls: 0, loadOrder: fresh.receipt.loadOrder, baseline: committed.baseline.ref, synopsis: committed.synopsis.ref, graphCheckpoint: graph.ref, outcome: "pass" }],
];
for (const [name, value] of outputs) writeJson(`${out}/${name}`, value);
writeBytes(`${out}/CurrentSynopsis.md`, committed.synopsis.bytes);
writeJson("project/project-memory-baseline.json", committed.baseline.value, false);
writeBytes("project/CurrentSynopsis.md", committed.synopsis.bytes);
writeJson("project/project-memory-promotion.commit.json", committed.proof);
writeJson("project/project-memory-session-state.json", session);
writeJson("project/project-memory-context-load-receipt.json", fresh.receipt);
writeJson(`project/history/project-memory/${base.value.version}/project-memory-baseline.json`, base.value, false);
writeBytes(`project/history/project-memory/${base.value.version}/CurrentSynopsis.md`, baseSynopsis.bytes);
writeJson(`project/history/project-memory/${committed.baseline.value.version}/project-memory-baseline.json`, committed.baseline.value, false);
writeBytes(`project/history/project-memory/${committed.baseline.value.version}/CurrentSynopsis.md`, committed.synopsis.bytes);
const summary = { apiVersion: API, kind: "Ep001FinalConclusionSummary", baseBaseline: base.ref, candidate: candidate.ref, approval: api.loadProjectMemoryArtifact(approvalValue).ref, resultBaseline: committed.baseline.ref, synopsis: committed.synopsis.ref, concludeReceipt: api.loadProjectMemoryArtifact(concluded.receipt).ref, graphCheckpoint: graph.ref, atomicCommits: commits, replayAtomicCommits: 0, freshTaskLoadOrder: fresh.receipt.loadOrder, freshTaskReplayed: freshReplay.replayed, freshTaskProviderOutcome: freshReplay.providerReceipt.value.outcome, installedPackageEvidence: installed.ref, outcome: "pass" };
summary.summaryDigest = api.canonicalJsonDigest(summary);
writeJson(`${out}/final-conclusion-summary.json`, summary);
writeBytes(`${out}/CONCLUSION_DELTA.md`, Buffer.from(`# EP-001 /conclude delta\n\n- Add: \`${accepted.id}\`\n- Add: \`${ready.id}\`\n- Replace: \`MEM-DEVRELAY-NEXT\` -> \`${next.id}\`\n- Retain: all other active project-memory records\n- Reject: none\n- Result baseline: \`${committed.baseline.ref.digest}\`\n- Synopsis: \`${committed.synopsis.ref.digest}\`\n- Graph checkpoint: \`${graph.ref.digest}\`\n- Fresh-task load order: ${fresh.receipt.loadOrder.join(" -> ")}\n- Replay provider calls: 0\n`, "utf8"));
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
