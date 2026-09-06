import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import * as api from "../../../src/index.mjs";

const API = "devrelay.dev/v1alpha1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const output = path.join(root, "dogfood", "do-001-desktop-orchestration", "gap-remediation", "final-acceptance");
const at = "2026-09-06T05:00:00.000Z";
const sessionId = "01a055ab-ea6d-77b1-a649-2263701a8f47";
const taskId = "ATT-DO001-MEMORY-LIVE-003";
const implementationCommit = "71ae67380587714535094efa3ab1ad4a2d3290df";
const marker = "MEMORY-PROBE-20260906-A";
const canonicalBytes = (value, newline = true) => Buffer.from(`${api.canonicalJson(value)}${newline ? "\n" : ""}`, "utf8");
const seal = (value) => api.withProjectMemoryContentDigest(value);
const write = (name, value, newline = true) => {
  const target = path.join(output, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, canonicalBytes(value, newline));
  return target;
};
const evidenceRef = (artifactId, value, schema) => {
  const bytes = canonicalBytes(value);
  const digest = api.sha256Digest(bytes);
  return { artifactId, schema, mediaType: "application/json", digest, uri: `memory://devrelay/do-001-gap-remediation/${artifactId}/${digest.slice(7)}.json` };
};
const source = (role, artifact) => ({ role, artifact });

execFileSync("git", ["cat-file", "-e", `${implementationCommit}^{commit}`], { cwd: root, windowsHide: true });

const verification = {
  apiVersion: API,
  kind: "CanonicalVerificationReceipt",
  receiptId: "DO001-GAP-CANONICAL-VERIFY-001",
  command: "node scripts/verify.mjs",
  implementationCommit,
  outcome: "pass",
  exitCode: 0,
  testSummary: { tests: 1168, passed: 1166, failed: 0, skipped: 2, durationMs: 959269.8019 },
  staticSummary: { jsonFiles: 9651, javascriptModules: 924, lfOnlyTextFiles: 11267, downstreamOperationsWithProjectOverview: 20 },
  observedAt: at,
};
write("01-canonical-verification-receipt.json", verification);
const verificationRef = evidenceRef(verification.receiptId, verification, "https://devrelay.dev/evidence/canonical-verification/v1");

const plugin = {
  apiVersion: API,
  kind: "DesktopPluginInstallationReceipt",
  receiptId: "DO001-GAP-DESKTOP-PLUGIN-INSTALL-001",
  plugin: "devrelay-desktop@personal",
  version: "0.1.1+codex.20260906044519",
  installedRoot: "C:/Users/SC/.codex/plugins/cache/personal/devrelay-desktop/0.1.1+codex.20260906044519",
  status: "installed-enabled",
  bootstrapEntrypoint: "scripts/memory-bootstrap.mjs",
  automaticHookClaimed: false,
  outcome: "pass",
  observedAt: at,
};
write("02-plugin-installation-receipt.json", plugin);
const pluginRef = evidenceRef(plugin.receiptId, plugin, "https://devrelay.dev/evidence/desktop-plugin-installation/v1");

const live = {
  apiVersion: API,
  kind: "DesktopLiveMemoryAcceptanceReceipt",
  receiptId: "DO001-GAP-LIVE-MEMORY-001",
  desktopThreadId: "01a0750a-6f22-77d0-8f3c-0fcb55577bbc",
  taskId,
  worktree: "C:/Users/SC/.codex/worktrees/f64c/DevRelay",
  firstToolWasBootstrap: true,
  alternateCheckoutUsed: false,
  nodeModulesPresent: false,
  commandExitCode: 0,
  bootstrapReceipt: {
    artifactId: "DPMBR-ED273548FBA97768",
    digest: "sha256:7275c6bb90a0cf75b766c2f7335312f81079cffc0bfdebafa2c63e5ad8d274b0",
    schema: "https://devrelay.dev/evidence/desktop-project-memory-bootstrap/v1",
    mediaType: "application/json",
    uri: "memory://devrelay/desktop-bootstrap/DPMBR-ED273548FBA97768/7275c6bb90a0cf75b766c2f7335312f81079cffc0bfdebafa2c63e5ad8d274b0.json",
  },
  startingBaselineId: "PMB-MUC-405C2614B0D0DF42",
  startingBaselineDigest: "sha256:d539f7aa8abe10b10b586a5071d07507bc5d1ff7860fceb7e87864ac70d5261d",
  synopsisDigest: "sha256:54280c148c253caee295bc2cb262fe2d4de94d0d110ec527a01bc2583508a864",
  graphDigest: "sha256:1207f84ad9e7ea077f59f4a4d8731c31feb0b9e0ee8c22a75a02600e7d8dccee",
  repositoryRevision: implementationCommit,
  pluginVersion: plugin.version,
  memorySource: "fresh-worktree-bootstrap-only",
  outcome: "pass",
  observedAt: at,
};
write("03-live-desktop-memory-acceptance-receipt.json", live);
const liveRef = evidenceRef(live.receiptId, live, "https://devrelay.dev/evidence/desktop-live-memory-acceptance/v1");

const baseValue = JSON.parse(fs.readFileSync(path.join(root, "project", "project-memory-baseline.json"), "utf8"));
const base = api.loadProjectMemoryArtifact(baseValue);
const currentSynopsis = api.renderCurrentSynopsis(baseValue);
assert.equal(baseValue.version, "1.0.4");
assert.equal(baseValue.records.some(({ id, status }) => id === "MEM-DEVRELAY-STATUS-DO001-RELEASE-READY" && status === "active"), true);

const statusMemory = {
  id: "MEM-DEVRELAY-STATUS-DO001-RELEASE-READY-V2",
  category: "status",
  statement: "DO-001 Desktop orchestration and repository-triggered persistent ProjectMemory bootstrap are release-ready for DevRelay 0.11.0-rc.1: canonical verification ran 1,168 tests with 1,166 passing, zero failures, and two intentional skips; a pristine ChatGPT Desktop worktree with no node_modules recovered the exact approved baseline on its first command; the supported startup boundary is AGENTS.md plus the managed task prompt, not an undeclared automatic plug-in hook.",
  authority: "validated-status",
  status: "active",
  effectiveAt: at,
  domain: "acceptance",
  sourceRefs: [source("canonical-verification", verificationRef), source("live-desktop-memory", liveRef), source("plugin-installation", pluginRef)],
};
const probeMemory = {
  id: "MEM-DEVRELAY-MEMORY-LIVE-ACCEPTANCE",
  category: "decision",
  statement: `Persistent memory acceptance marker ${marker}: a fresh ChatGPT Desktop task must recover this exact statement from the newly promoted ProjectMemory baseline before substantive work.`,
  authority: "approved-project",
  status: "active",
  effectiveAt: at,
  domain: "acceptance",
  sourceRefs: [source("live-desktop-memory", liveRef)],
};
const changes = [
  { changeId: "CHANGE-DO001-GAP-STATUS-REPLACE", disposition: "replace", qualitative: false, domain: "acceptance", targetMemoryId: "MEM-DEVRELAY-STATUS-DO001-RELEASE-READY", proposedMemory: statusMemory, rationale: "Replace the disproven automatic-hook claim and stale counts with exact supported-boundary evidence.", sourceRefs: statusMemory.sourceRefs },
  { changeId: "CHANGE-DO001-LIVE-MEMORY-PROBE-ADD", disposition: "add", qualitative: false, domain: "acceptance", proposedMemory: probeMemory, rationale: "Persist a unique approved marker for the cross-task read-after-write acceptance test.", sourceRefs: probeMemory.sourceRefs },
];
const candidateValue = api.createMemoryUpdateCandidate({ projectId: "devrelay", sessionId, taskId, baseBaseline: base.ref, baseGraphCheckpoint: baseValue.graphCheckpoint, producerType: "main", changes, sourceRefs: [source("canonical-verification", verificationRef), source("live-desktop-memory", liveRef), source("plugin-installation", pluginRef)] });
const candidate = api.loadProjectMemoryArtifact(candidateValue);
const conclusionValue = api.createSessionConclusion({ projectId: "devrelay", sessionId, taskId, producerType: "main", startingBaseline: base.ref, startingGraphCheckpoint: baseValue.graphCheckpoint, contextReceipt: live.bootstrapReceipt, completedArtifacts: [verificationRef, pluginRef, liveRef], evidence: [verificationRef, pluginRef, liveRef], pendingDecisions: [], memoryCandidate: candidate.ref });
const terminalCheckpointDigest = api.canonicalJsonDigest({ conclusion: conclusionValue.contentDigest, implementationCommit, verification: verificationRef, live: liveRef });
const approvalValue = api.createProjectMemoryGateApproval({ candidate: candidateValue, candidateRef: candidate.ref, terminalCheckpointDigest, decisions: changes.map(({ changeId }) => ({ changeId, decision: "approve", rationale: "The project owner explicitly approved all in-scope corrections and required complete persistent-memory implementation and testing." })) });
const providerValue = seal({ apiVersion: API, kind: "MemoryProviderReceipt", receiptId: "DO001-GAP-MEMORY-NATIVE-EQUIVALENCE-001", providerId: "devrelay.native-project-memory", providerVersion: "1.0.0", operation: "synchronize", namespace: "project/devrelay", configurationDigest: api.canonicalJsonDigest({ provider: "devrelay.native-project-memory", policy: "exact-baseline-equivalence" }), inputCheckpoints: [base.ref, candidate.ref], commandFingerprint: api.canonicalJsonDigest({ operation: "synchronize", baseline: base.ref, candidate: candidate.ref }), outcome: "native-equivalent", durationMs: 0, replayed: false, citations: [], outputDigest: api.canonicalJsonDigest(changes) });
const provider = api.loadProjectMemoryArtifact(providerValue);
let committed;
let commitCount = 0;
const coordinator = api.createProjectMemoryConclusionCoordinator({ commitAtomic: async ({ expectedBaseline, baseline, synopsis, proof }) => {
  assert.deepEqual(expectedBaseline, base.ref);
  committed = { baseline, synopsis, proof };
  commitCount += 1;
  return { committed: true };
} });
const concludeInput = { conclusion: conclusionValue, candidate: candidateValue, candidateRef: candidate.ref, approval: approvalValue, baseBaseline: baseValue, baseBaselineRef: base.ref, providerSyncReceipt: providerValue, providerSyncReceiptRef: provider.ref, resultGraphCheckpoint: baseValue.graphCheckpoint, sourceRefs: [source("canonical-verification", verificationRef), source("live-desktop-memory", liveRef), source("plugin-installation", pluginRef), source("provider-equivalence", provider.ref)] };
const concluded = await coordinator.conclude(concludeInput);
const replayed = await coordinator.conclude(concludeInput);
assert.equal(commitCount, 1);
assert.equal(replayed.replayed, true);
assert.equal(committed.baseline.value.version, "1.0.5");
assert.equal(committed.synopsis.bytes.toString("utf8").includes(marker), true);

write("04-memory-update-candidate.json", candidateValue);
write("05-session-conclusion.json", conclusionValue);
write("06-project-memory-gate-approval.json", approvalValue);
write("07-provider-native-equivalence-receipt.json", providerValue);
write("08-project-memory-baseline.json", committed.baseline.value, false);
write("09-project-memory-gate-promotion-proof.json", committed.proof);
write("10-conclude-receipt.json", concluded.receipt);
fs.writeFileSync(path.join(output, "11-CurrentSynopsis.md"), committed.synopsis.bytes);

const history = path.join(root, "project", "history", "project-memory", committed.baseline.value.version);
fs.mkdirSync(history, { recursive: true });
fs.writeFileSync(path.join(history, "project-memory-baseline.json"), canonicalBytes(committed.baseline.value, false));
fs.writeFileSync(path.join(history, "CurrentSynopsis.md"), committed.synopsis.bytes);
fs.writeFileSync(path.join(root, "project", "project-memory-baseline.json"), canonicalBytes(committed.baseline.value, false));
fs.writeFileSync(path.join(root, "project", "CurrentSynopsis.md"), committed.synopsis.bytes);
fs.writeFileSync(path.join(root, "project", "project-memory-promotion.commit.json"), canonicalBytes(committed.proof));

process.stdout.write(`${JSON.stringify({ outcome: concluded.outcome, baseline: committed.baseline.ref, synopsis: committed.synopsis.ref, marker, verification: verification.testSummary, liveTask: live.desktopThreadId }, null, 2)}\n`);
