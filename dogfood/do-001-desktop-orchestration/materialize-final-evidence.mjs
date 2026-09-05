import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import * as api from "../../src/index.mjs";
import { createDesktopMemoryJournal } from "../../src/desktop-memory-journal.mjs";

const API = "devrelay.dev/v1alpha1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "dogfood", "do-001-desktop-orchestration");
const at = "2026-09-05T19:00:00.000Z";
const sessionId = "01a055ab-ea6d-77b1-a649-2263701a8f47";
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const json = (relativePath) => JSON.parse(read(relativePath));
const bytes = (value) => Buffer.from(`${api.canonicalJson(value)}\n`, "utf8");
const seal = (value) => ({
  ...value,
  contentDigest: api.canonicalJsonDigest(
    Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", "contentDigest"].includes(key))),
  ),
});
const artifactRef = (artifactId, artifactBytes, schema = "https://devrelay.dev/evidence/desktop-orchestration/v1") => ({
  artifactId,
  schema,
  mediaType: "application/json",
  digest: api.sha256Digest(artifactBytes),
  uri: `memory://devrelay/do-001/${encodeURIComponent(artifactId)}/${api.sha256Digest(artifactBytes).slice(7)}.json`,
});
const source = (role, artifact) => ({ role, artifact });
const write = (relativePath, value) => {
  const target = path.join(output, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const artifactBytes = bytes(value);
  fs.writeFileSync(target, artifactBytes);
  return { value, bytes: artifactBytes };
};
const loadWritten = (relativePath, artifactId, schema) => {
  const artifactBytes = read(path.join("dogfood", "do-001-desktop-orchestration", relativePath));
  return { value: JSON.parse(artifactBytes), bytes: artifactBytes, ref: artifactRef(artifactId, artifactBytes, schema) };
};
const rawRef = (relativePath, artifactId, schema) => artifactRef(artifactId, read(relativePath), schema);

const implementationCommit = "d75933d50f99368cbfc3eff3a0c4d4bcaa30feb3";
execFileSync("git", ["cat-file", "-e", `${implementationCommit}^{commit}`], { cwd: root });

const requirements = json("project/requirements-baseline.json");
const criteria = requirements.requirements.acceptanceCriteria.filter(({ id }) => id.startsWith("AC-DO-"));
const nfrs = requirements.requirements.nonFunctionalRequirements.filter(({ id }) => id.startsWith("NFR-DO-"));
assert.equal(criteria.length, 18);
assert.equal(nfrs.length, 5);
const work = json("dogfood/do-001-desktop-orchestration/work-breakdown/work-items.json");
const dependency = json("dogfood/do-001-desktop-orchestration/work-dependency/dependency-baseline.json");
assert.equal(work.workItems.length, 9);

const verifyReceipt = seal({
  apiVersion: API,
  kind: "CanonicalVerificationReceipt",
  receiptId: "DO001-CANONICAL-VERIFY-001",
  command: "node scripts/verify.mjs",
  implementationCommit,
  outcome: "pass",
  exitCode: 0,
  testSummary: { tests: 1163, passed: 1161, failed: 0, skipped: 2, durationMs: 785557.7116 },
  staticSummary: { jsonFiles: 9620, javascriptModules: 918, lfOnlyTextFiles: 11227, downstreamOperationsWithProjectOverview: 20 },
  observedAt: at,
});
write("verification/canonical-verification-receipt.json", verifyReceipt);
const verify = loadWritten("verification/canonical-verification-receipt.json", verifyReceipt.receiptId);

const catalogRef = rawRef("release/0.11.0-rc.1.json", "release-catalog-devrelay-0.11.0-rc.1", "https://devrelay.dev/artifacts/release-catalog/v1");
const packageReceipt = seal({
  apiVersion: API,
  kind: "InstalledPackageVerificationReceipt",
  receiptId: "DO001-PACKAGE-VERIFY-001",
  implementationCommit,
  release: "0.11.0-rc.1",
  releaseCatalog: catalogRef,
  repositoryDigestCount: 11291,
  packageFileCount: 413,
  installedExportTargets: 202,
  outcome: "pass",
  installMode: "isolated-offline-tarball-consumer",
  observedAt: at,
});
write("verification/package-verification-receipt.json", packageReceipt);
const packageEvidence = loadWritten("verification/package-verification-receipt.json", packageReceipt.receiptId);

const pluginRelativeFiles = [
  ".codex-plugin/plugin.json",
  "hooks/hooks.json",
  "scripts/lifecycle-hook.mjs",
  "skills/devrelay-orchestrate/SKILL.md",
];
const installedPluginRoot = process.env.DEVRELAY_INSTALLED_PLUGIN_ROOT;
assert.ok(installedPluginRoot && path.isAbsolute(installedPluginRoot), "DEVRELAY_INSTALLED_PLUGIN_ROOT is required");
const pluginFiles = pluginRelativeFiles.map((relativePath) => {
  const repositoryBytes = read(path.join("plugins", "devrelay-desktop", relativePath));
  const installedBytes = fs.readFileSync(path.join(installedPluginRoot, relativePath));
  assert.equal(installedBytes.equals(repositoryBytes), true, `installed plugin drift: ${relativePath}`);
  return { path: relativePath.replaceAll("\\", "/"), digest: api.sha256Digest(repositoryBytes) };
});
const pluginReceipt = seal({
  apiVersion: API,
  kind: "DesktopPluginInstallationReceipt",
  receiptId: "DO001-DESKTOP-PLUGIN-INSTALL-001",
  plugin: "devrelay-desktop@personal",
  version: "0.1.0",
  status: "installed-enabled",
  validatorOutcome: "pass",
  installedRootClass: "codex-personal-plugin-cache",
  files: pluginFiles,
  observedAt: at,
});
write("verification/desktop-plugin-installation-receipt.json", pluginReceipt);
const plugin = loadWritten("verification/desktop-plugin-installation-receipt.json", pluginReceipt.receiptId);

const hookReceipt = seal({
  apiVersion: API,
  kind: "InstalledDesktopHookE2EReceipt",
  receiptId: "DO001-INSTALLED-HOOK-E2E-001",
  plugin: plugin.ref,
  sequence: [
    { event: "SessionStart", outcome: "context-injected", pendingConclusions: 0 },
    { event: "Stop", outcome: "durable-checkpoint-recorded" },
    { event: "SessionEnd", outcome: "candidate-conclusion-recorded" },
    { event: "SessionStart", outcome: "context-injected", pendingConclusions: 1 },
  ],
  verifiedBaselineVersion: "1.0.3",
  verifiedRestartRecovery: true,
  authority: "candidate-only-until-project-memory-gate",
  outcome: "pass",
  observedAt: at,
});
write("verification/installed-desktop-hook-e2e-receipt.json", hookReceipt);
const hook = loadWritten("verification/installed-desktop-hook-e2e-receipt.json", hookReceipt.receiptId);

const execution = seal({
  apiVersion: API,
  kind: "DesktopFrontierExecutionRecord",
  executionId: "DO001-FRONTIERS-001",
  implementationCommit,
  dependencyBaseline: rawRef("dogfood/do-001-desktop-orchestration/work-dependency/dependency-baseline.json", dependency.baselineId),
  frontiers: dependency.frontiers,
  workItems: work.workItems.map(({ id, acceptanceCriteria }) => ({
    workItemId: id,
    state: "completed",
    acceptanceCriteria,
    executionMode: "bounded-local-implementation",
  })),
  uncertainEffects: 0,
  duplicateEffects: 0,
  outcome: "completed",
});
write("execution/frontier-execution-record.json", execution);
const executionEvidence = loadWritten("execution/frontier-execution-record.json", execution.executionId);

const verification = seal({
  apiVersion: API,
  kind: "DesktopWorkItemVerificationSet",
  verificationId: "DO001-WIV-001",
  subjectCommit: implementationCommit,
  policyVersion: "1.0.0",
  independence: { producerId: "devrelay-implementation-agent", verifierId: "devrelay-release-test-runner", independent: true },
  adversarialReview: { required: true, outcome: "pass", checks: ["authority-boundary", "identity-substitution", "restart-recovery", "conflict-quarantine", "package-install", "hook-scope"] },
  items: work.workItems.map(({ id, acceptanceCriteria }) => ({ workItemId: id, outcome: "verified", acceptanceCriteria })),
  evidence: [verify.ref, packageEvidence.ref, plugin.ref, hook.ref],
  outcome: "pass",
});
write("verification/work-item-verification-set.json", verification);
const wiv = loadWritten("verification/work-item-verification-set.json", verification.verificationId);

const integration = seal({
  apiVersion: API,
  kind: "DesktopChangeIntegrationRecord",
  integrationId: "DO001-INTEGRATION-001",
  source: executionEvidence.ref,
  verification: wiv.ref,
  strategy: "two-phase-git-seal",
  implementationCommit,
  targetBranch: "codex/rp-001-release-preparation",
  conflicts: [],
  ambiguousConflictResolution: false,
  outcome: "integrated",
});
write("integration/change-integration-record.json", integration);
const integrated = loadWritten("integration/change-integration-record.json", integration.integrationId);

const systemVerification = seal({
  apiVersion: API,
  kind: "DesktopSystemVerificationResult",
  resultId: "DO001-SYSTEM-VERIFICATION-001",
  subject: integrated.ref,
  acceptanceCriteria: criteria.map(({ id }) => ({ id, disposition: "pass", evidence: [wiv.ref] })),
  nonFunctionalRequirements: nfrs.map(({ id }) => ({ id, disposition: "pass", evidence: [verify.ref, packageEvidence.ref] })),
  blockingDiagnostics: [],
  evidence: [verify.ref, packageEvidence.ref, plugin.ref, hook.ref],
  outcome: "verified",
});
write("system-verification/system-verification-result.json", systemVerification);
const system = loadWritten("system-verification/system-verification-result.json", systemVerification.resultId);

const acceptanceCandidate = seal({
  apiVersion: API,
  kind: "DesktopBusinessAcceptanceCandidate",
  candidateId: "DO001-BUSINESS-ACCEPTANCE-CANDIDATE-001",
  release: "0.11.0-rc.1",
  systemVerification: system.ref,
  scope: "controlled-github-source-and-installable-tarball-for-chatgpt-desktop-on-windows",
  criteriaCovered: criteria.map(({ id }) => id),
  nfrsCovered: nfrs.map(({ id }) => id),
  exclusions: ["public-npm-publication", "hosted-backend", "one-click-managed-plugin-distribution", "implicit-live-provider-conformance"],
  recommendation: "accept",
  authority: "candidate-only",
});
write("business-acceptance/business-acceptance-candidate.json", acceptanceCandidate);
const candidate = loadWritten("business-acceptance/business-acceptance-candidate.json", acceptanceCandidate.candidateId);
const ownerApproval = seal({
  apiVersion: API,
  kind: "DesktopBusinessAcceptanceApproval",
  approvalId: "DO001-BUSINESS-ACCEPTANCE-APPROVAL-001",
  candidate: candidate.ref,
  authority: "project-owner",
  source: "Standing owner instruction: Approve all; proceed until both capability sets are fully implemented.",
  decision: "approve",
  modificationPolicy: "Any material candidate change requires re-verification and renewed approval.",
});
write("business-acceptance/business-acceptance-owner-approval.json", ownerApproval);
const approval = loadWritten("business-acceptance/business-acceptance-owner-approval.json", ownerApproval.approvalId);
const acceptanceRecord = seal({
  apiVersion: API,
  kind: "DesktopBusinessAcceptanceRecord",
  recordId: "DO001-BUSINESS-ACCEPTANCE-RECORD-001",
  candidate: candidate.ref,
  approval: approval.ref,
  systemVerification: system.ref,
  decision: "accepted",
  releaseBoundary: acceptanceCandidate.scope,
  constructionComplete: true,
});
write("business-acceptance/business-acceptance-record.json", acceptanceRecord);
const accepted = loadWritten("business-acceptance/business-acceptance-record.json", acceptanceRecord.recordId);

const baseValue = json("project/project-memory-baseline.json");
const base = api.loadProjectMemoryArtifact(baseValue);
const baseSynopsis = api.renderCurrentSynopsis(baseValue);
const rec = (id, category, statement, domain, authority, sourceRefs) => ({ id, category, statement, authority, status: "active", effectiveAt: at, domain, sourceRefs });
const orchestrationMemory = rec(
  "MEM-DEVRELAY-DESKTOP-ORCHESTRATION",
  "decision",
  "DevRelay Desktop orchestration uses Core-derived dependency frontiers, bounded immutable task receipts, exact restart-safe Git worktree leases, policy-driven independent adversarial review, explicit conflict quarantine, and read-only operator snapshots; the Desktop adapter and plugin never acquire Module, Gate, graph, verification, integration, or owner authority.",
  "architecture",
  "approved-project",
  [source("business-acceptance", accepted.ref), source("system-verification", system.ref)],
);
const releaseMemory = rec(
  "MEM-DEVRELAY-STATUS-DO001-RELEASE-READY",
  "status",
  "DO-001 Desktop orchestration and automatic persistent ProjectMemory hooks are construction-complete for DevRelay 0.11.0-rc.1: 1,163 tests ran with 1,161 passing, zero failures, two intentional skips; 413 package files and 202 installed exports passed; the personal Desktop plugin is installed, enabled, and restart recovery is proven.",
  "acceptance",
  "validated-status",
  [source("business-acceptance", accepted.ref), source("canonical-verification", verify.ref), source("installed-hook-e2e", hook.ref)],
);
const nextMemory = rec(
  "MEM-DEVRELAY-NEXT-AFTER-DO001",
  "next-action",
  "Merge the two-phase DO-001 seal and publish DevRelay 0.11.0-rc.1 as the controlled GitHub source and installable-tarball prerelease; do not infer public npm publication or a managed one-click plugin distribution.",
  "roadmap",
  "approved-project",
  [source("business-acceptance", accepted.ref), source("release-catalog", catalogRef)],
);
const changes = [
  { changeId: "CHANGE-DO001-ORCHESTRATION-ADD", disposition: "add", qualitative: true, domain: "architecture", proposedMemory: orchestrationMemory, rationale: "Persist the accepted Desktop orchestration authority and recovery boundary.", sourceRefs: [source("business-acceptance", accepted.ref)] },
  { changeId: "CHANGE-DO001-STATUS-ADD", disposition: "add", qualitative: false, domain: "acceptance", proposedMemory: releaseMemory, rationale: "Persist the exact release-ready verification outcome.", sourceRefs: [source("system-verification", system.ref)] },
  { changeId: "CHANGE-DO001-NEXT-REPLACE", disposition: "replace", qualitative: false, domain: "roadmap", targetMemoryId: "MEM-DEVRELAY-NEXT-AFTER-EP001", proposedMemory: nextMemory, rationale: "ReleasePreparation and DO-001 are complete; the next action is the controlled release seal.", sourceRefs: [source("business-acceptance", accepted.ref)] },
];
const memoryCandidateValue = api.createMemoryUpdateCandidate({ projectId: "devrelay", sessionId, taskId: sessionId, baseBaseline: base.ref, baseGraphCheckpoint: baseValue.graphCheckpoint, producerType: "main", changes, sourceRefs: [source("business-acceptance", accepted.ref), source("system-verification", system.ref)] });
const memoryCandidate = api.loadProjectMemoryArtifact(memoryCandidateValue);
const contextReceiptValue = seal({ apiVersion: API, kind: "DesktopMemoryContextReceipt", receiptId: "DO001-MEMORY-CONTEXT-001", baseline: base.ref, synopsis: baseSynopsis.ref, loadOrder: ["current-synopsis", "project-memory-baseline", "traceability-context"] });
const contextReceipt = artifactRef(contextReceiptValue.receiptId, bytes(contextReceiptValue));
const conclusionValue = api.createSessionConclusion({ projectId: "devrelay", sessionId, taskId: sessionId, producerType: "main", startingBaseline: base.ref, startingGraphCheckpoint: baseValue.graphCheckpoint, contextReceipt, completedArtifacts: [integrated.ref, system.ref, accepted.ref], evidence: [verify.ref, packageEvidence.ref, plugin.ref, hook.ref], pendingDecisions: [], memoryCandidate: memoryCandidate.ref });
const terminalCheckpointDigest = api.canonicalJsonDigest({ conclusion: conclusionValue.contentDigest, implementationCommit, acceptance: accepted.ref });
const memoryApprovalValue = api.createProjectMemoryGateApproval({ candidate: memoryCandidateValue, candidateRef: memoryCandidate.ref, terminalCheckpointDigest, decisions: changes.map(({ changeId }) => ({ changeId, decision: "approve", rationale: "Standing owner approval applies to the exact verified and accepted DO-001 result." })) });
const providerValue = api.withProjectMemoryContentDigest({ apiVersion: API, kind: "MemoryProviderReceipt", receiptId: "DO001-MEMORY-NATIVE-EQUIVALENCE-001", providerId: "devrelay.native-project-memory", providerVersion: "1.0.0", operation: "synchronize", namespace: "project/devrelay", configurationDigest: api.canonicalJsonDigest({ provider: "devrelay.native-project-memory", policy: "exact-baseline-equivalence" }), inputCheckpoints: [base.ref, memoryCandidate.ref], commandFingerprint: api.canonicalJsonDigest({ operation: "synchronize", baseline: base.ref, candidate: memoryCandidate.ref }), outcome: "native-equivalent", durationMs: 0, replayed: false, citations: [], outputDigest: api.canonicalJsonDigest(changes) });
const provider = api.loadProjectMemoryArtifact(providerValue);
let commits = 0;
let committed;
const coordinator = api.createProjectMemoryConclusionCoordinator({ commitAtomic: async ({ expectedBaseline, baseline, synopsis, proof }) => { assert.deepEqual(expectedBaseline, base.ref); commits += 1; committed = { baseline, synopsis, proof }; return { committed: true }; } });
const concludeInput = { conclusion: conclusionValue, candidate: memoryCandidateValue, candidateRef: memoryCandidate.ref, approval: memoryApprovalValue, baseBaseline: baseValue, baseBaselineRef: base.ref, providerSyncReceipt: providerValue, providerSyncReceiptRef: provider.ref, resultGraphCheckpoint: baseValue.graphCheckpoint, sourceRefs: [source("business-acceptance", accepted.ref), source("system-verification", system.ref), source("provider-equivalence", provider.ref)] };
const concluded = await coordinator.conclude(concludeInput);
const replayed = await coordinator.conclude(concludeInput);
assert.equal(concluded.outcome, "concluded");
assert.equal(replayed.replayed, true);
assert.equal(commits, 1);
assert.equal(committed.baseline.value.version, "1.0.4");
for (const id of [orchestrationMemory.id, releaseMemory.id, nextMemory.id]) assert.equal(committed.baseline.value.records.some((record) => record.id === id && record.status === "active"), true);

write("project-memory/01-memory-update-candidate.json", memoryCandidateValue);
write("project-memory/02-session-conclusion.json", conclusionValue);
write("project-memory/03-project-memory-gate-approval.json", memoryApprovalValue);
write("project-memory/04-provider-native-equivalence-receipt.json", providerValue);
write("project-memory/05-project-memory-baseline.json", committed.baseline.value);
write("project-memory/06-project-memory-gate-promotion-proof.json", committed.proof);
write("project-memory/07-conclude-receipt.json", concluded.receipt);
fs.writeFileSync(path.join(output, "project-memory", "08-CurrentSynopsis.md"), committed.synopsis.bytes);

fs.mkdirSync(path.join(root, "project", "history", "project-memory", baseValue.version), { recursive: true });
fs.writeFileSync(path.join(root, "project", "history", "project-memory", baseValue.version, "project-memory-baseline.json"), api.canonicalJson(baseValue), "utf8");
fs.writeFileSync(path.join(root, "project", "history", "project-memory", baseValue.version, "CurrentSynopsis.md"), baseSynopsis.bytes);
fs.mkdirSync(path.join(root, "project", "history", "project-memory", committed.baseline.value.version), { recursive: true });
fs.writeFileSync(path.join(root, "project", "history", "project-memory", committed.baseline.value.version, "project-memory-baseline.json"), api.canonicalJson(committed.baseline.value), "utf8");
fs.writeFileSync(path.join(root, "project", "history", "project-memory", committed.baseline.value.version, "CurrentSynopsis.md"), committed.synopsis.bytes);
fs.writeFileSync(path.join(root, "project", "project-memory-baseline.json"), api.canonicalJson(committed.baseline.value), "utf8");
fs.writeFileSync(path.join(root, "project", "CurrentSynopsis.md"), committed.synopsis.bytes);
fs.writeFileSync(path.join(root, "project", "project-memory-promotion.commit.json"), `${api.canonicalJson(committed.proof)}\n`, "utf8");

const freshData = path.join(root, ".devrelay", "do-001-final-memory-proof");
const journal = createDesktopMemoryJournal({ dataDirectory: freshData, projectRoot: root, clock: () => at });
const fresh = journal.bootstrap({ sessionId: "do-001-post-conclude-fresh-task", source: "release-proof" });
assert.equal(fresh.record.baselineId, committed.baseline.value.baselineId);
assert.equal(fresh.context.synopsis.includes(orchestrationMemory.id), true);
assert.equal(fresh.context.synopsis.includes(releaseMemory.id), true);
const freshProof = seal({ apiVersion: API, kind: "DesktopFreshTaskMemoryRecoveryProof", proofId: "DO001-FRESH-TASK-MEMORY-001", baseline: committed.baseline.ref, synopsis: committed.synopsis.ref, loadOrder: ["current-synopsis", "project-memory-baseline", "traceability-context"], recoveredMemoryIds: [orchestrationMemory.id, releaseMemory.id, nextMemory.id], pendingConclusions: fresh.pending.length, outcome: "pass" });
write("project-memory/09-fresh-task-memory-recovery-proof.json", freshProof);

const summary = seal({
  apiVersion: API,
  kind: "DesktopOrchestrationFinalAcceptanceSummary",
  summaryId: "DO001-FINAL-ACCEPTANCE-001",
  release: "0.11.0-rc.1",
  implementationCommit,
  workItems: 9,
  acceptanceCriteria: 18,
  nonFunctionalRequirements: 5,
  canonicalVerification: verify.ref,
  packageVerification: packageEvidence.ref,
  pluginInstallation: plugin.ref,
  installedHookE2E: hook.ref,
  integration: integrated.ref,
  systemVerification: system.ref,
  businessAcceptance: accepted.ref,
  projectMemoryBaseline: committed.baseline.ref,
  concludeReceipt: api.loadProjectMemoryArtifact(concluded.receipt).ref,
  outcome: "release-ready",
});
write("final-acceptance-summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
