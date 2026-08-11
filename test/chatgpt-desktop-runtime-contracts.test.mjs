import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CHATGPT_DESKTOP_RUNTIME_APPROVED_CONTRACTS,
  CHATGPT_DESKTOP_RUNTIME_INTERFACE_INTENT_IDS,
  ChatGptDesktopRuntimeArtifactValidationError,
  canonicalChatGptDesktopRuntimeArtifact,
  canonicalChatGptDesktopRuntimeArtifactDigest,
  validateChatGptDesktopRuntimeArtifact,
} from "../src/chatgpt-desktop-runtime-artifact-validator.mjs";

const digest = (character = "a") => `sha256:${character.repeat(64)}`;
const ref = (artifactId = "ART-1", character = "a") => ({ artifactId, digest: digest(character) });
const diagnostic = { code: "D-1", message: "bounded diagnostic", severity: "info" };
const envelope = (interfaceIntentId, inputs, outputs) => ({ apiVersion: "devrelay.dev/v1alpha1", interfaceIntentId, inputs, outputs });
const reject = (value) => assert.throws(() => validateChatGptDesktopRuntimeArtifact(value), ChatGptDesktopRuntimeArtifactValidationError);
const mutate = (value, edit) => { const copy = structuredClone(value); edit(copy); return copy; };

const mcpOutput = { requestId: "REQ-1", runId: "RUN-1", revision: 1, status: "completed", artifacts: [ref()], gateState: "not-applicable", diagnostics: [], nextAction: { kind: "none" } };
const mcpBase = { requestId: "REQ-1", runId: "RUN-1", expectedRevision: 0 };
const mcpRequests = [
  { ...mcpBase, operation: "create-run", goal: "Ship the bounded change", circuit: ref("CIRCUIT"), projectOverview: ref("OVERVIEW", "b"), policy: ref("POLICY", "c") },
  { ...mcpBase, operation: "inspect-run", reportPolicy: ref("REPORT-POLICY") },
  { ...mcpBase, operation: "submit-clarification", checkpoint: ref("CHECKPOINT"), answers: [{ questionId: "Q-1", answer: "Approved answer" }] },
  { ...mcpBase, operation: "submit-gate-decision", gateCandidate: ref("GATE-CANDIDATE"), decision: "approve", approvalEvidence: ref("APPROVAL") },
  { ...mcpBase, operation: "progress-run", approvedPredecessor: ref("APPROVED-PREDECESSOR") },
  { ...mcpBase, operation: "resume-run", checkpoint: ref("CHECKPOINT"), checkpointDigest: digest("b") },
  { ...mcpBase, operation: "get-evidence", evidenceId: "EVIDENCE-1" },
];

test("MCP lifecycle operations accept their exact request and reject missing, unknown, and caller-authority fields", () => {
  for (const inputs of mcpRequests) {
    const value = envelope("IF-DESKTOP-MCP-COMMANDS", inputs, mcpOutput);
    validateChatGptDesktopRuntimeArtifact(value);
    reject(mutate(value, (copy) => { copy.inputs.callerSelectedRoute = "design-change"; }));
    reject(mutate(value, (copy) => { delete copy.inputs.runId; }));
  }
});

const taskOutput = { runId: "RUN-1", workItemId: "WI-1", attemptId: "ATT-1", threadId: "THREAD-1", turnId: "TURN-1", state: "running", eventCheckpoint: ref("EVENT-CHECKPOINT"), diagnostics: [] };
const taskRequests = [
  { operation: "start", runId: "RUN-1", workItemId: "WI-1", attemptId: "ATT-1", taskContract: ref("TASK-CONTRACT"), workspacePath: "C:\\repo\\worktree", contextBundle: ref("CONTEXT"), permissionDemands: ["filesystem.read"] },
  ...["resume", "inspect", "cancel"].map((operation) => ({ operation, runId: "RUN-1", workItemId: "WI-1", attemptId: "ATT-1", taskContract: ref("TASK-CONTRACT"), threadId: "THREAD-1", turnId: "TURN-1" })),
];

test("task start, resume, inspect, and cancel bind exact task identities and terminal handoffs", () => {
  for (const inputs of taskRequests) {
    const value = envelope("IF-DESKTOP-TASK-LIFECYCLE", inputs, taskOutput);
    validateChatGptDesktopRuntimeArtifact(value);
    reject(mutate(value, (copy) => { delete copy.inputs.attemptId; }));
    reject(mutate(value, (copy) => { copy.inputs.macWorkspace = "/tmp/work"; }));
  }
  const terminal = envelope("IF-DESKTOP-TASK-LIFECYCLE", taskRequests[1], { ...taskOutput, state: "completed", terminalRawHandoff: ref("RAW-HANDOFF") });
  validateChatGptDesktopRuntimeArtifact(terminal);
  reject(mutate(terminal, (copy) => { delete copy.outputs.terminalRawHandoff; }));
});

const stateOutput = { runId: "RUN-1", revision: 2, outcome: "committed", replayed: false, contentDigest: digest("b"), checkpointId: "CP-1", checkpointDigest: digest("c"), content: ref("RUN-CONTENT"), diagnostics: [] };
const stateRequests = [
  { operation: "load", runId: "RUN-1", expectedRevision: 1 },
  { operation: "append", runId: "RUN-1", expectedRevision: 1, content: ref("APPEND"), contentDigest: digest("b") },
  { operation: "checkpoint", runId: "RUN-1", expectedRevision: 1, checkpointId: "CP-1", checkpointDigest: digest("c"), content: ref("CHECKPOINT") },
  { operation: "compare-and-swap", runId: "RUN-1", expectedRevision: 1, replacement: ref("REPLACEMENT"), contentDigest: digest("d") },
];

test("durable state operations close revision, checkpoint, digest, replay, and CAS boundaries", () => {
  for (const inputs of stateRequests) {
    const value = envelope("IF-DESKTOP-RUN-STATE", inputs, { ...stateOutput, outcome: inputs.operation === "load" ? "loaded" : "committed" });
    validateChatGptDesktopRuntimeArtifact(value);
    reject(mutate(value, (copy) => { copy.inputs.expectedRevision = -1; }));
    reject(mutate(value, (copy) => { copy.outputs.outcome = "silently-overwritten"; }));
  }
  validateChatGptDesktopRuntimeArtifact(envelope("IF-DESKTOP-RUN-STATE", stateRequests[1], { ...stateOutput, outcome: "conflict", replayed: true }));
  validateChatGptDesktopRuntimeArtifact(envelope("IF-DESKTOP-RUN-STATE", stateRequests[1], { ...stateOutput, outcome: "corrupt" }));
  reject(envelope("IF-DESKTOP-RUN-STATE", stateRequests[0], stateOutput));
  reject(envelope("IF-DESKTOP-RUN-STATE", stateRequests[1], { ...stateOutput, outcome: "loaded" }));
});

const capabilityInput = { host: { platform: "win32", architecture: "x64", chatGptDesktopVersion: "2.7.1", codexVersion: "codex-1", nodeVersion: "v24.1.0" }, circuit: ref("CIRCUIT"), modules: [ref("MODULE")], adapters: [ref("ADAPTER")], policy: ref("POLICY"), requiredCapabilities: ["CAP-LIVE"] };
test("Windows capability resolution distinguishes release-ready bindings from missing live capability", () => {
  const resolved = envelope("IF-DESKTOP-CAPABILITY-RESOLUTION", capabilityInput, { outcome: "resolved", resolutionDigest: digest("e"), bindings: [{ capability: "CAP-LIVE", module: ref("MODULE"), adapter: ref("ADAPTER"), maturity: "release-ready" }] });
  const blocked = envelope("IF-DESKTOP-CAPABILITY-RESOLUTION", capabilityInput, { outcome: "blocked", resolutionDigest: digest("f"), missing: [{ capability: "CAP-LIVE", code: "missing-live-capability", message: "Only fixtures exist", observedMaturity: "fixture-only" }] });
  validateChatGptDesktopRuntimeArtifact(resolved);
  validateChatGptDesktopRuntimeArtifact(blocked);
  reject(mutate(resolved, (copy) => { copy.inputs.host.platform = "linux"; }));
  reject(mutate(resolved, (copy) => { copy.outputs.bindings[0].maturity = "fixture-only"; }));
});

const installTarget = { platform: "win32", chatGptDesktopVersion: "2.7.1", pluginPath: "C:\\Users\\tester\\.codex\\plugins\\devrelay", marketplacePath: "C:\\Users\\tester\\.codex\\marketplaces\\devrelay" };
const gitCommit = "1".repeat(40);
const installationOutput = (operation, state) => ({ receiptId: "RECEIPT-1", operation, state, repositoryRevision: gitCommit, repositoryContentDigest: digest("4"), pluginManifestDigest: digest("2"), installedFiles: [{ path: "C:\\Users\\tester\\.codex\\plugins\\devrelay\\plugin.json", digest: digest("3") }], diagnostics: [] });
const installationCases = [
  ["install", "installed", {}], ["upgrade", "upgraded", { priorInstallation: ref("PRIOR") }], ["rollback", "rolled-back", { priorInstallation: ref("PRIOR"), rollbackReceipt: ref("ROLLBACK") }], ["uninstall", "uninstalled", { priorInstallation: ref("PRIOR") }], ["diagnose", "healthy", {}],
];
test("repository-marketplace installation operations are Windows-only, revision-bound, and conditional", () => {
  for (const [operation, state, conditional] of installationCases) {
    const inputs = { operation, repository: "file:///C:/repos/DevRelay", repositoryRevision: gitCommit, repositoryContentDigest: digest("4"), pluginManifestDigest: digest("2"), target: installTarget, ...conditional };
    const value = envelope("IF-DESKTOP-INSTALLATION", inputs, { ...installationOutput(operation, state), ...conditional });
    validateChatGptDesktopRuntimeArtifact(value);
    reject(mutate(value, (copy) => { copy.inputs.target.platform = "darwin"; }));
    if (operation === "upgrade" || operation === "uninstall" || operation === "rollback") reject(mutate(value, (copy) => { delete copy.inputs.priorInstallation; }));
  }
  const valid = envelope("IF-DESKTOP-INSTALLATION", { operation: "install", repository: "file:///C:/repos/DevRelay", repositoryRevision: gitCommit, repositoryContentDigest: digest("4"), pluginManifestDigest: digest("2"), target: installTarget }, installationOutput("install", "installed"));
  for (const revision of [digest("1"), "A".repeat(40), "1".repeat(39)]) reject(mutate(valid, (copy) => { copy.inputs.repositoryRevision = revision; }));
  reject(mutate(valid, (copy) => { delete copy.inputs.repositoryContentDigest; }));
  reject(mutate(valid, (copy) => { delete copy.outputs.repositoryContentDigest; }));
});

const available = { status: "available", value: { label: "WorkExecution" }, source: ref("REPORT") };
const unavailable = { status: "unavailable", reason: "Host observation was not granted" };
test("run view is read-only, report-policy-bound, and explicit about unavailable observations", () => {
  const value = envelope("IF-DESKTOP-RUN-VIEW", { runId: "RUN-1", expectedRevision: 3, reportPolicy: ref("REPORT-POLICY"), ledgerCheckpoint: ref("LEDGER") }, { runId: "RUN-1", revision: 3, markdown: "# Run RUN-1", report: ref("REPORT"), checkpoint: ref("LEDGER"), activeStage: available, gate: available, frontier: available, tasks: available, evidence: available, traceability: available, performance: unavailable });
  validateChatGptDesktopRuntimeArtifact(value);
  reject(mutate(value, (copy) => { copy.inputs.advance = true; }));
  reject(mutate(value, (copy) => { delete copy.outputs.performance.reason; }));
});

test("validator approval bindings exactly match ContractBaseline 1.7.0", () => {
  const baseline = JSON.parse(readFileSync(new URL("../project/contract-baseline.json", import.meta.url), "utf8"));
  assert.equal(baseline.version, "1.7.0");
  const expected = Object.fromEntries(baseline.contracts.filter(({ interfaceIntentId }) => CHATGPT_DESKTOP_RUNTIME_INTERFACE_INTENT_IDS.includes(interfaceIntentId)).map(({ id, interfaceIntentId, contentDigest }) => [interfaceIntentId, { contractId: id, contentDigest }]));
  assert.deepEqual(CHATGPT_DESKTOP_RUNTIME_APPROVED_CONTRACTS, expected);
});

test("packaged validator and schema have no runtime project dependency", async () => {
  const source = readFileSync(new URL("../src/chatgpt-desktop-runtime-artifact-validator.mjs", import.meta.url), "utf8");
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const packagedFiles = packageJson.files;
  assert.ok(packagedFiles.includes("src/"));
  assert.ok(packagedFiles.includes("contracts/"));
  assert.doesNotMatch(source, /project[\\/]+contract-baseline\.json/u);
  assert.doesNotThrow(() => JSON.parse(readFileSync(new URL("../contracts/chatgpt-desktop-runtime-artifacts.schema.json", import.meta.url), "utf8")));
  const loaded = await import("../src/chatgpt-desktop-runtime-artifact-validator.mjs?package-surface");
  assert.deepEqual(loaded.CHATGPT_DESKTOP_RUNTIME_APPROVED_CONTRACTS, CHATGPT_DESKTOP_RUNTIME_APPROVED_CONTRACTS);
});

test("equivalent concrete artifacts have byte-identical canonical representations", () => {
  const one = envelope("IF-DESKTOP-MCP-COMMANDS", mcpRequests[6], mcpOutput);
  const two = { outputs: structuredClone(mcpOutput), inputs: structuredClone(mcpRequests[6]), interfaceIntentId: one.interfaceIntentId, apiVersion: one.apiVersion };
  assert.equal(canonicalChatGptDesktopRuntimeArtifact(one), canonicalChatGptDesktopRuntimeArtifact(two));
  assert.equal(canonicalChatGptDesktopRuntimeArtifactDigest(one), canonicalChatGptDesktopRuntimeArtifactDigest(two));
});

test("unknown envelope fields and unsupported interfaces fail closed", () => {
  const value = envelope("IF-DESKTOP-MCP-COMMANDS", mcpRequests[0], mcpOutput);
  reject({ ...value, authority: "caller-approved" });
  reject({ ...value, interfaceIntentId: "IF-DESKTOP-GENERIC-PROVIDER" });
});
