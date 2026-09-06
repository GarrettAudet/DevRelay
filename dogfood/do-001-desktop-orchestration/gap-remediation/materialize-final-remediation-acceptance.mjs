import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import * as api from "../../../src/index.mjs";

const API = "devrelay.dev/v1alpha1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const output = path.join(root, "dogfood", "do-001-desktop-orchestration", "gap-remediation", "final-remediation");
const at = "2026-09-06T06:00:00.000Z";
const sessionId = "01a055ab-ea6d-77b1-a649-2263701a8f47";
const taskId = "ATT-DO001-MEMORY-FINAL-004";
const implementationCommit = "25f6897670797ff472db1f922344735d3c03dfb0";
const marker = "MEMORY-PROBE-20260906-B";
const canonicalBytes = (value, newline = true) => Buffer.from(`${api.canonicalJson(value)}${newline ? "\n" : ""}`, "utf8");
const seal = (value) => api.withProjectMemoryContentDigest(value);
const write = (name, value, newline = true) => {
  const target = path.join(output, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, canonicalBytes(value, newline));
};
const evidenceRef = (artifactId, value, schema) => {
  const digest = api.sha256Digest(canonicalBytes(value));
  return { artifactId, schema, mediaType: "application/json", digest, uri: `memory://devrelay/do-001-final-remediation/${artifactId}/${digest.slice(7)}.json` };
};
const source = (role, artifact) => ({ role, artifact });

execFileSync("git", ["cat-file", "-e", `${implementationCommit}^{commit}`], { cwd: root, windowsHide: true });

const verification = {
  apiVersion: API,
  kind: "CanonicalVerificationReceipt",
  receiptId: "DO001-FINAL-CANONICAL-VERIFY-001",
  command: "node scripts/verify.mjs",
  implementationCommit,
  outcome: "pass",
  exitCode: 0,
  testSummary: { tests: 1169, passed: 1167, failed: 0, skipped: 2, durationMs: 969743.3967 },
  staticSummary: { jsonFiles: 9662, javascriptModules: 926, lfOnlyTextFiles: 11282, downstreamOperationsWithProjectOverview: 20 },
  observedAt: at,
};
write("01-canonical-verification-receipt.json", verification);
const verificationRef = evidenceRef(verification.receiptId, verification, "https://devrelay.dev/evidence/canonical-verification/v1");

const review = {
  apiVersion: API,
  kind: "IndependentAdversarialReviewReceipt",
  receiptId: "DO001-FINAL-INDEPENDENT-REVIEW-001",
  desktopThreadId: "01a07529-5391-74f0-9ccc-3524838e8012",
  taskId: "ATT-DO001-REMEDIATION-REVIEW-001",
  worktree: "C:/Users/SC/.codex/worktrees/ec6f/DevRelay",
  subjectCommit: implementationCommit,
  reviewerIndependent: true,
  priorFindings: [
    { findingId: "P1-MEMORY-PLAN-PROVENANCE", disposition: "closed", evidence: "loader-branded bootstrap plus exact restart revalidation" },
    { findingId: "P1-REVIEW-SUBJECT-LINEAGE", disposition: "closed", evidence: "required subject digest plus exact task, run, implementer, reviewer, and receipt binding" },
  ],
  focusedTests: { tests: 9, passed: 9, failed: 0 },
  gitDiffCheck: "pass",
  disposition: "pass",
  blockingFindings: 0,
  authority: "observation-only",
  observedAt: at,
};
write("02-independent-adversarial-review-receipt.json", review);
const reviewRef = evidenceRef(review.receiptId, review, "https://devrelay.dev/evidence/independent-adversarial-review/v1");

const baseValue = JSON.parse(fs.readFileSync(path.join(root, "project", "project-memory-baseline.json"), "utf8"));
const base = api.loadProjectMemoryArtifact(baseValue);
assert.equal(baseValue.version, "1.0.5");
assert.equal(baseValue.records.some(({ id, status }) => id === "MEM-DEVRELAY-STATUS-DO001-RELEASE-READY-V2" && status === "active"), true);
assert.equal(baseValue.records.some(({ id, status }) => id === "MEM-DEVRELAY-MEMORY-LIVE-ACCEPTANCE" && status === "active"), true);

const statusMemory = {
  id: "MEM-DEVRELAY-STATUS-DO001-RELEASE-READY-V3",
  category: "status",
  statement: "DO-001 Desktop orchestration and persistent ProjectMemory are release-ready for DevRelay 0.11.0-rc.1: the final implementation passed 1,169 canonical tests with 1,167 passing, zero failures, and two intentional skips; independent adversarial review closed the memory-plan provenance and review-subject lineage findings with no remaining P0/P1 issue; the supported Desktop startup boundary remains AGENTS.md plus the managed task prompt, not an undeclared automatic plug-in hook.",
  authority: "validated-status",
  status: "active",
  effectiveAt: at,
  domain: "acceptance",
  sourceRefs: [source("canonical-verification", verificationRef), source("independent-adversarial-review", reviewRef)],
};
const probeMemory = {
  id: "MEM-DEVRELAY-MEMORY-FINAL-ACCEPTANCE",
  category: "decision",
  statement: `Final persistent memory marker ${marker}: a pristine ChatGPT Desktop task must recover this exact approved statement from ProjectMemory baseline 1.0.6 before substantive work, without receiving the statement in its prompt.`,
  authority: "approved-project",
  status: "active",
  effectiveAt: at,
  domain: "acceptance",
  sourceRefs: [source("canonical-verification", verificationRef), source("independent-adversarial-review", reviewRef)],
};
const changes = [
  { changeId: "CHANGE-DO001-FINAL-STATUS-REPLACE", disposition: "replace", qualitative: false, domain: "acceptance", targetMemoryId: "MEM-DEVRELAY-STATUS-DO001-RELEASE-READY-V2", proposedMemory: statusMemory, rationale: "Record the final verified implementation and the independent closure of both P1 lineage findings.", sourceRefs: statusMemory.sourceRefs },
  { changeId: "CHANGE-DO001-FINAL-PROBE-REPLACE", disposition: "replace", qualitative: false, domain: "acceptance", targetMemoryId: "MEM-DEVRELAY-MEMORY-LIVE-ACCEPTANCE", proposedMemory: probeMemory, rationale: "Require a new cross-task read-after-write test against the post-remediation baseline.", sourceRefs: probeMemory.sourceRefs },
];
const refs = [source("canonical-verification", verificationRef), source("independent-adversarial-review", reviewRef)];
const candidateValue = api.createMemoryUpdateCandidate({ projectId: "devrelay", sessionId, taskId, baseBaseline: base.ref, baseGraphCheckpoint: baseValue.graphCheckpoint, producerType: "main", changes, sourceRefs: refs });
const candidate = api.loadProjectMemoryArtifact(candidateValue);
const contextReceipt = JSON.parse(fs.readFileSync(path.join(root, "dogfood", "do-001-desktop-orchestration", "gap-remediation", "final-acceptance", "03-live-desktop-memory-acceptance-receipt.json"), "utf8")).bootstrapReceipt;
const conclusionValue = api.createSessionConclusion({ projectId: "devrelay", sessionId, taskId, producerType: "main", startingBaseline: base.ref, startingGraphCheckpoint: baseValue.graphCheckpoint, contextReceipt, completedArtifacts: [verificationRef, reviewRef], evidence: [verificationRef, reviewRef], pendingDecisions: [], memoryCandidate: candidate.ref });
const terminalCheckpointDigest = api.canonicalJsonDigest({ conclusion: conclusionValue.contentDigest, implementationCommit, verification: verificationRef, review: reviewRef });
const approvalValue = api.createProjectMemoryGateApproval({ candidate: candidateValue, candidateRef: candidate.ref, terminalCheckpointDigest, decisions: changes.map(({ changeId }) => ({ changeId, decision: "approve", rationale: "The owner approved all in-scope corrections and required complete persistent-memory implementation and testing." })) });
const providerValue = seal({ apiVersion: API, kind: "MemoryProviderReceipt", receiptId: "DO001-FINAL-MEMORY-NATIVE-EQUIVALENCE-001", providerId: "devrelay.native-project-memory", providerVersion: "1.0.0", operation: "synchronize", namespace: "project/devrelay", configurationDigest: api.canonicalJsonDigest({ provider: "devrelay.native-project-memory", policy: "exact-baseline-equivalence" }), inputCheckpoints: [base.ref, candidate.ref], commandFingerprint: api.canonicalJsonDigest({ operation: "synchronize", baseline: base.ref, candidate: candidate.ref }), outcome: "native-equivalent", durationMs: 0, replayed: false, citations: [], outputDigest: api.canonicalJsonDigest(changes) });
const provider = api.loadProjectMemoryArtifact(providerValue);
let committed;
let commitCount = 0;
const coordinator = api.createProjectMemoryConclusionCoordinator({ commitAtomic: async ({ expectedBaseline, baseline, synopsis, proof }) => {
  assert.deepEqual(expectedBaseline, base.ref);
  committed = { baseline, synopsis, proof };
  commitCount += 1;
  return { committed: true };
} });
const concludeInput = { conclusion: conclusionValue, candidate: candidateValue, candidateRef: candidate.ref, approval: approvalValue, baseBaseline: baseValue, baseBaselineRef: base.ref, providerSyncReceipt: providerValue, providerSyncReceiptRef: provider.ref, resultGraphCheckpoint: baseValue.graphCheckpoint, sourceRefs: [...refs, source("provider-equivalence", provider.ref)] };
const concluded = await coordinator.conclude(concludeInput);
const replayed = await coordinator.conclude(concludeInput);
assert.equal(commitCount, 1);
assert.equal(replayed.replayed, true);
assert.equal(committed.baseline.value.version, "1.0.6");
assert.equal(committed.synopsis.bytes.toString("utf8").includes(marker), true);

write("03-memory-update-candidate.json", candidateValue);
write("04-session-conclusion.json", conclusionValue);
write("05-project-memory-gate-approval.json", approvalValue);
write("06-provider-native-equivalence-receipt.json", providerValue);
write("07-project-memory-baseline.json", committed.baseline.value, false);
write("08-project-memory-gate-promotion-proof.json", committed.proof);
write("09-conclude-receipt.json", concluded.receipt);
fs.writeFileSync(path.join(output, "10-CurrentSynopsis.md"), committed.synopsis.bytes);

const history = path.join(root, "project", "history", "project-memory", committed.baseline.value.version);
fs.mkdirSync(history, { recursive: true });
fs.writeFileSync(path.join(history, "project-memory-baseline.json"), canonicalBytes(committed.baseline.value, false));
fs.writeFileSync(path.join(history, "CurrentSynopsis.md"), committed.synopsis.bytes);
fs.writeFileSync(path.join(root, "project", "project-memory-baseline.json"), canonicalBytes(committed.baseline.value, false));
fs.writeFileSync(path.join(root, "project", "CurrentSynopsis.md"), committed.synopsis.bytes);
fs.writeFileSync(path.join(root, "project", "project-memory-promotion.commit.json"), canonicalBytes(committed.proof));

process.stdout.write(`${JSON.stringify({ outcome: concluded.outcome, baseline: committed.baseline.ref, synopsis: committed.synopsis.ref, marker, verification: verification.testSummary, review: review.disposition }, null, 2)}\n`);
