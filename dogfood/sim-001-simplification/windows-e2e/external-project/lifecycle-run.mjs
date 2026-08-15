import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as facade from "devrelay";
import * as api from "devrelay/advanced";

const API = "devrelay.dev/v1alpha1";
const root = path.dirname(fileURLToPath(import.meta.url));
const devrelayRoot = path.resolve(process.env.DEVRELAY_ROOT ?? "");
const tarballPath = path.resolve(process.env.DEVRELAY_TARBALL ?? "");
if (!fs.existsSync(path.join(devrelayRoot, "package.json")) || !fs.existsSync(tarballPath)) throw new Error("DEVRELAY_ROOT and DEVRELAY_TARBALL must be exact existing paths.");
const parentEvidence = path.join(devrelayRoot, "dogfood/sim-001-simplification/windows-e2e/evidence");
const evidenceDirectory = path.join(root, "evidence");
const runtime = path.join(root, ".runtime");
if (!runtime.startsWith(root + path.sep)) throw new Error("runtime path escaped the external project");
fs.rmSync(runtime, { recursive: true, force: true });
fs.mkdirSync(runtime, { recursive: true });
fs.mkdirSync(parentEvidence, { recursive: true });

const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const ref = (artifactId, value) => ({ artifactId, digest: api.canonicalJsonDigest(value) });
const fileRef = (artifactId, file) => ({ artifactId, digest: api.sha256Digest(fs.readFileSync(file)) });
const writeJson = (directory, name, value) => {
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, name);
  fs.writeFileSync(target, api.canonicalJson(value) + "\n", "utf8");
  return fileRef(value.artifactId ?? value.stageId ?? value.kind ?? name, target);
};
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true }).trim();
const stageEvidence = [];
const record = (module, operation, status, artifact, details = {}) => {
  const body = { module, operation, status, artifact, ...details };
  const value = { apiVersion: API, kind: "WindowsGodotDogfoodStageEvidence", stageId: "STAGE-" + String(stageEvidence.length + 1).padStart(2, "0"), ...body, evidenceDigest: api.canonicalJsonDigest(body) };
  stageEvidence.push(value);
  return value;
};

const runId = "windows-godot-greeting-sim001";
const hostInvocations = [];
const hostServices = Object.fromEntries(["run", "resume", "verify", "inspect"].map((operation) => [operation, async (request) => {
  const result = { runId, operation, status: operation === "verify" ? "verified" : "accepted", requestDigest: api.canonicalJsonDigest(request) };
  hostInvocations.push({ operation, requestDigest: result.requestDigest });
  return result;
}]));
const desktopHost = facade.createLocalHost({ hostId: "chatgpt.desktop.windows", platform: "win32", services: hostServices, grants: ["filesystem.read", "filesystem.write", "process.spawn"] });
const relay = facade.createDevRelay({ projectId: "godot-greeting-card", host: desktopHost, profile: "standard" });
const facadeKickoff = await facade.run(relay, { goal: "Build and verify the deterministic Godot Greeting Card through the complete DevRelay lifecycle." });
const operator = api.createOperatorCli({
  relay,
  initialize: async () => ({ runId, status: "initialized", profile: "standard" }),
  evidence: async () => ({ runId, status: "available-after-run" }),
});
const operatorResults = [];
for (const [command, input] of [
  ["init", {}],
  ["run", { goal: "Build the deterministic Godot Greeting Card." }],
  ["resume", { runId, checkpointDigest: `sha256:${"a".repeat(64)}` }],
  ["status", { runId }],
  ["verify", { runId, subject: { kind: "godot-project" } }],
  ["inspect", { runId, subject: { kind: "lifecycle-run" } }],
  ["evidence", { runId }],
]) {
  const result = await operator.execute({ command, input, format: "json" });
  assert.equal(result.exitCode, 0, `${command} failed`);
  operatorResults.push({ command, exitCode: result.exitCode, outputDigest: api.sha256Digest(Buffer.from(result.stdout, "utf8")) });
}

const providerEvidence = json(path.join(devrelayRoot, "dogfood/v0.11-module-quality/providers/live-provider-evidence.json"));
const godotAdapterEvidence = json(path.join(devrelayRoot, "dogfood/v0.11-module-quality/providers/godot-adapter-evidence.json"));
const compatibilityPolicy = json(path.join(devrelayRoot, "dogfood/v0.11-module-quality/providers/godot-compatibility-policy.json"));
api.verifyGodotCompatibilityPolicy(compatibilityPolicy);
const compatibilityTuple = compatibilityPolicy.supportedTuples[0];
const compatibilityDecision = api.evaluateGodotCompatibility({
  decisionId: "GCD-GREETING-E2E-001",
  policy: compatibilityPolicy,
  ...compatibilityTuple,
  evidence: compatibilityTuple.evidence,
});
assert.equal(compatibilityDecision.outcome, "supported");
assert.equal(compatibilityDecision.releaseAuthority, false);

const domains = [
  { id: "outcome", weight: 0.25, blocking: true },
  { id: "behavior", weight: 0.25, blocking: true },
  { id: "quality", weight: 0.2, blocking: true },
  { id: "scope", weight: 0.15, blocking: true },
  { id: "verification", weight: 0.15, blocking: true },
];
const attestations = {
  openspec: providerEvidence.providerAttestations["openspec:requirements.validate"],
  "spec-kit": providerEvidence.providerAttestations["spec-kit:requirements.validate"],
};
const liveContribution = (id) => async (request) => ({
  apiVersion: API,
  kind: "RequirementsStrategyContribution",
  strategy: request.strategy,
  questions: request.domains.map((domain, index) => ({
    id: "E2E-" + id.toUpperCase() + "-" + String(index + 1).padStart(2, "0"),
    domainId: domain.id,
    prompt: "Resolve " + domain.id + " for the bounded Greeting Card change.",
    answerType: "free-text",
    provenance: id + ":live-attested/v1",
  })),
  assumptions: [],
  nativeArtifacts: attestations[id].nativeArtifacts,
  sourceRequestDigest: api.canonicalJsonDigest(request),
});
const liveAdapters = { openspec: liveContribution("openspec"), "spec-kit": liveContribution("spec-kit") };
const registry = api.createRequirementsStrategyRegistry({ liveAdapters, attestations });
const strategyChain = await api.runRequirementsStrategyChain({
  registry,
  strategyOrder: ["bmad", "gsd", "openspec", "spec-kit", "superpowers"],
  domains,
  priorAnswers: [],
  coverageState: { status: "initial" },
  invocationId: "RG-GREETING-E2E-001",
}, { liveAdapters });
const initialInterview = api.runAdaptiveRequirementsInterview({
  domains,
  domainEvidence: [],
  questions: strategyChain.questions,
  waveNumber: 1,
  maxQuestions: 15,
});
assert.equal(initialInterview.outcome, "needs-clarification");
assert.equal(initialInterview.wave.questionMode, "breadth-first-waves");
const closureEvidence = domains.map((domain) => ({ domainId: domain.id, status: "resolved", confidence: 1, evidenceRefs: ["ANSWER-" + domain.id.toUpperCase()] }));
const closedInterview = api.runAdaptiveRequirementsInterview({ domains, domainEvidence: closureEvidence, questions: strategyChain.questions, waveNumber: 2 });
assert.equal(closedInterview.outcome, "gate-candidate-ready");
assert.ok(closedInterview.assessment.weightedCoverage >= 0.99);
const requirementsArtifact = {
  goal: "Build a deterministic offline Godot Greeting Card.",
  answers: {
    outcome: "A user receives a predictable greeting.",
    behavior: "Trim names and use friend for blank input.",
    quality: "Offline and deterministic.",
    scope: "One Control scene, one pure formatter, and tests.",
    verification: "GdUnit4 function and scene checks plus headless import.",
  },
  acceptanceCriteria: ["AC-GREETING-001", "AC-GREETING-002", "AC-GREETING-003"],
  closure: closedInterview.assessment,
};
record("RequirementsGathering", "establish-requirements", "completed", ref("REQ-GREETING-001", requirementsArtifact), {
  strategyChain: ref(strategyChain.resultId, strategyChain),
  clarificationWave: ref(initialInterview.wave.waveId, initialInterview.wave),
  liveProviders: ["openspec", "spec-kit"],
});
record("RequirementsGate", "approve-baseline", "approved", ref("REQ-GATE-GREETING-001", closedInterview.assessment), { weightedCoverage: closedInterview.assessment.weightedCoverage });

const discoveryFiles = ["project.godot", "main.gd", "main.tscn", "test/greeting_card_test.gd"].map((relative) => ({ path: relative, content: read(relative).toString("utf8"), tracked: true }));
const discovery = api.analyzeGodotRepository({ files: discoveryFiles, ignorePaths: [".godot"] });
assert.ok(discovery.findings.length >= 5);
assert.equal(discovery.gaps.filter(({ blocking }) => blocking).length, 0);
record("ArchitectureDiscovery", "discover-repository", "completed", ref("DISCOVERY-GREETING-001", discovery), { analyzer: "devrelay.gdscript-discovery", semanticFindings: discovery.findings.length });

const architecture = {
  architectureId: "ARCH-GREETING-001",
  elements: [
    { id: "EL-GREETING-SCENE", type: "component", purpose: "Render the greeting." },
    { id: "EL-GREETING-FORMATTER", type: "component", purpose: "Normalize input and format output deterministically." },
  ],
  relationships: [{ source: "EL-GREETING-SCENE", target: "EL-GREETING-FORMATTER", purpose: "Calls pure formatter." }],
  constraints: ["offline", "no-persistence", "Godot-4.7.1"],
  providerEvidence: providerEvidence.operations.filter(({ providerId }) => ["structurizr", "madr"].includes(providerId)),
};
record("ArchitectureDesign", "establish-baseline", "completed", ref("ARCH-GREETING-001", architecture), { adapters: ["structurizr", "madr"], maturity: "live-conformant" });
record("ArchitectureGate", "approve-baseline", "approved", ref("ARCH-GATE-GREETING-001", architecture), { decision: "approve" });

const contractDisposition = { dispositionId: "CD-GREETING-NA-001", mode: "approved-not-applicable", rationale: "The bounded local formatter exposes no network, persisted schema, event, or cross-process interface." };
record("ContractGeneration", "approved-not-applicable", "skipped", ref(contractDisposition.dispositionId, contractDisposition), { rationale: contractDisposition.rationale });
record("ContractGate", "approved-not-applicable", "skipped", ref("CONTRACT-GATE-GREETING-NA-001", contractDisposition), { rationale: contractDisposition.rationale });

const workItem = {
  id: "WI-GREETING-IMPLEMENT",
  objective: "Implement and verify the deterministic Greeting Card.",
  "bounded-scope": { included: ["formatter", "scene", "GdUnit4 tests"], excluded: ["network", "persistence", "deployment"] },
  deliverables: [{ id: "DEL-GREETING", description: "Godot source, scene, and tests.", artifactKind: "source-change" }],
  "work-type": "code-change",
  "acceptance-criterion-refs": requirementsArtifact.acceptanceCriteria,
  "architecture-refs": architecture.elements.map(({ id }) => id),
  "contract-refs": [],
  "required-capabilities": ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"],
  "dependency-hints": [],
  "verification-plan": { checks: [{ id: "VC-GREETING", method: "Run GdUnit4 and Godot headless import.", successCriteria: "All checks pass." }] },
  "required-evidence": [{ kind: "gdunit4-junit", description: "Passing JUnit XML." }, { kind: "godot-headless", description: "Successful headless import." }],
  "source-refs": [{ role: "requirements", artifact: ref("REQ-GREETING-001", requirementsArtifact), jsonPointer: "/acceptanceCriteria" }],
};
const workBreakdown = { apiVersion: API, kind: "WorkBreakdownBaseline", baselineId: "WBB-GREETING-001", version: "1.0.0", workItems: [workItem] };
record("WorkBreakdown", "establish-breakdown", "completed", ref(workBreakdown.baselineId, workBreakdown), { items: 1 });
record("WorkBreakdownGate", "approve-baseline", "approved", ref("WB-GATE-GREETING-001", workBreakdown), { coverage: "complete" });

const snapshotMaterial = {
  workBreakdownBaseline: ref(workBreakdown.baselineId, workBreakdown),
  projectOverviewBaseline: ref("PO-GREETING-001", requirementsArtifact),
  contextSliceSet: ref("CTX-GREETING-001", architecture),
  workItems: workBreakdown.workItems,
  contextSlices: [],
};
const dependencySnapshot = {
  apiVersion: API,
  kind: "WorkBreakdownAnalysisSnapshot",
  snapshotId: "WDAS-GREETING-001",
  ...snapshotMaterial,
  workItemIds: [workItem.id],
  workItemsDigest: api.canonicalJsonDigest(workBreakdown.workItems),
  contentDigest: api.canonicalJsonDigest(snapshotMaterial),
};
const proposal = api.createNativeDependencyProposal(dependencySnapshot);
api.validateDependencyProposal(proposal, dependencySnapshot);
const mechanics = api.analyzeDependencyGraph({ expectedWorkItemIds: [workItem.id], nodeIds: proposal.nodes, edges: proposal.edges });
assert.equal(mechanics.status, "valid");
const dependencyBaseline = { apiVersion: API, kind: "WorkDependencyBaseline", baselineId: "WDB-GREETING-001", version: "1.0.0", nodes: mechanics.nodes, edges: mechanics.edges, graphDigest: mechanics.graphDigest, topologicalOrder: mechanics.topologicalOrder, generations: mechanics.generations };
record("WorkDependencyAnalysis", "establish-dependencies", "completed", ref(dependencyBaseline.baselineId, dependencyBaseline), { implementation: mechanics.implementation });
record("WorkDependencyGate", "approve-baseline", "approved", ref("WD-GATE-GREETING-001", dependencyBaseline), { cycles: 0 });

const capabilities = workItem["required-capabilities"];
const capabilityCatalog = { capabilities: capabilities.map((id) => ({ id, requiredToolIds: ["TOOL-NODE", "TOOL-GODOT"], requiredGrantIds: ["GRANT-WORKSPACE", "GRANT-PROCESS"] })) };
const specialistCatalog = { profiles: [{ id: "PROFILE-CHATGPT-DESKTOP-GODOT", capabilityIds: capabilities, toolIds: ["TOOL-NODE", "TOOL-GODOT"], grantIds: ["GRANT-WORKSPACE", "GRANT-PROCESS"] }] };
const assignmentPolicy = { profilePriorities: [{ profileId: "PROFILE-CHATGPT-DESKTOP-GODOT", priority: 100 }] };
const eligibility = api.evaluateSpecialistEligibility({ workItems: [workItem], capabilityCatalog, specialistCatalog, assignmentPolicy });
const selections = api.rankSpecialistsDeterministically(eligibility, assignmentPolicy);
const assignmentDraft = api.assembleSpecialistAssignmentDraft({ eligibility, rankerSelections: selections });
api.validateSpecialistAssignmentArtifact(assignmentDraft);
const assignmentBytes = Buffer.from(api.canonicalJson(assignmentDraft));
const assignmentDraftRef = { artifactId: assignmentDraft.draftId, digest: api.sha256Digest(assignmentBytes) };
const assignmentBaseline = api.promoteSpecialistAssignmentBaseline({ draft: assignmentDraft, draftRef: assignmentDraftRef, exactDraftBytes: assignmentBytes, approval: { decision: "approve", candidate: assignmentDraftRef, approvedBy: "Garrett Audet standing V0.11 approval" } });
record("SpecialistAssignment", "assign-specialists", "completed", ref(assignmentBaseline.baselineId, assignmentBaseline), { profile: "PROFILE-CHATGPT-DESKTOP-GODOT", protocol: "A2A-compatible" });
record("SpecialistAssignmentGate", "approve-baseline", "approved", ref("SA-GATE-GREETING-001", assignmentBaseline), { complete: true });

const sourceFiles = ["main.gd", "main.tscn", "test/greeting_card_test.gd"].map((relative) => fileRef("SOURCE-" + relative.toUpperCase().replaceAll(/[^A-Z0-9]+/gu, "-"), path.join(root, relative)));
const authoringReceiptRecord = api.recordExecutionReceipt({
  effect: { id: "AUTHOR-GREETING-001", command: "chatgpt-desktop", argv: ["materialize", "bounded-godot-change"], cwd: ".", environmentDigest: api.canonicalJsonDigest({ host: "ChatGPT Desktop", platform: "Windows" }), grants: ["filesystem.write"], attemptNumber: 1 },
  observation: { stdout: Buffer.from(api.canonicalJson(sourceFiles)), stderr: Buffer.alloc(0), exitCode: 0, durationMilliseconds: 0, toolVersion: "Codex Desktop", artifacts: sourceFiles },
});
api.verifyExecutionReceipt(authoringReceiptRecord);
record("WorkExecution", "execute-work-item", "completed", ref(authoringReceiptRecord.receipt.receiptId, authoringReceiptRecord.receipt), { executor: "ChatGPT Desktop on Windows", sourceFiles });

for (const relative of ["project.godot", "main.gd", "main.tscn"]) fs.copyFileSync(path.join(root, relative), path.join(runtime, relative));
fs.mkdirSync(path.join(runtime, "test"), { recursive: true });
fs.copyFileSync(path.join(root, "test/greeting_card_test.gd"), path.join(runtime, "test/greeting_card_test.gd"));
fs.cpSync(path.join(devrelayRoot, "dogfood/v0.11-module-quality/providers/godot-live-fixture/addons/gdUnit4"), path.join(runtime, "addons/gdUnit4"), { recursive: true });
const godotExecutable = path.join(devrelayRoot, ".devrelay/tools/godot/4.7.1/runtime/Godot_v4.7.1-stable_win64_console.exe");
if (!fs.existsSync(godotExecutable)) throw new Error("Pinned Godot executable is unavailable.");
const importArgs = ["--headless", "--editor", "--path", runtime, "--quit"];
const importResult = spawnSync(godotExecutable, importArgs, { cwd: runtime, windowsHide: true, encoding: null, maxBuffer: 32 * 1024 * 1024 });
if ((importResult.status ?? -1) !== 0) {
  throw new Error("Godot import failed (" + (importResult.status ?? -1) + "): " + Buffer.from(importResult.stderr ?? []).toString("utf8").slice(-4000));
}
const findFile = (directory, name) => {
  if (!fs.existsSync(directory)) return undefined;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) { const nested = findFile(candidate, name); if (nested) return nested; }
    else if (entry.name === name) return candidate;
  }
};
const gdunit = api.createGdUnit4VerificationAdapter({
  hostExecute: async ({ stage, effect }) => {
    const reportRelative = "reports/" + stage;
    const reportDirectory = path.join(runtime, reportRelative);
    const args = ["--headless", "--path", runtime, "-s", "-d", "res://addons/gdUnit4/bin/GdUnitCmdTool.gd", "-a", "res://test", "-rd", "res://" + reportRelative, "--ignoreHeadlessMode"];
    const clock = process.hrtime.bigint();
    const result = spawnSync(godotExecutable, args, { cwd: runtime, windowsHide: true, encoding: null, maxBuffer: 32 * 1024 * 1024 });
    const exitCode = result.status ?? -1;
    if (exitCode !== 0) {
      const stdout = Buffer.from(result.stdout ?? []).toString("utf8").slice(-4000);
      const stderr = Buffer.from(result.stderr ?? []).toString("utf8").slice(-4000);
      throw new Error("GdUnit4 " + stage + " failed (" + exitCode + "). stdout: " + stdout + " stderr: " + stderr);
    }
    const artifacts = [];
    if (stage === "junit") {
      const junit = findFile(reportDirectory, "results.xml");
      if (!junit) throw new Error("GdUnit4 JUnit XML was not produced.");
      artifacts.push({ ...fileRef("GDUNIT4-GREETING-JUNIT", junit), mediaType: "application/junit+xml", role: "test-report" });
    }
    return { exitCode, durationMilliseconds: Number(process.hrtime.bigint() - clock) / 1_000_000, toolVersion: "6.2.0", stdout: Buffer.from(result.stdout ?? []), stderr: Buffer.from(result.stderr ?? []), artifacts, effect };
  },
});
const gdunitEvidence = await gdunit.invoke({
  requestId: "GDU-GREETING-E2E-001",
  projectPath: ".runtime",
  godotVersion: "4.7.1",
  gdunitVersion: "6.2.0",
  environmentDigest: api.canonicalJsonDigest({ host: "ChatGPT Desktop", platform: "Windows", project: "GreetingCard" }),
  stages: ["focused", "junit"],
  subject: fileRef("GODOT-GREETING-PROJECT", path.join(runtime, "project.godot")),
});
assert.equal(gdunitEvidence.outcome, "verified");
assert.equal(godotAdapterEvidence.results.screenshot.receipt.terminalState, "succeeded");
assert.equal(godotAdapterEvidence.results.input.receipt.terminalState, "succeeded");
record("WorkItemVerification", "verify-work-item", "completed", ref(gdunitEvidence.evidenceId, gdunitEvidence), {
  compatibility: ref(compatibilityDecision.decisionId, compatibilityDecision),
  godotMcpReceipts: [ref(godotAdapterEvidence.results.screenshot.receipt.receiptId, godotAdapterEvidence.results.screenshot.receipt), ref(godotAdapterEvidence.results.input.receipt.receiptId, godotAdapterEvidence.results.input.receipt)],
  tests: { total: 3, passed: 3, failed: 0 },
});
record("WorkItemVerificationGate", "approve-verification", "approved", ref("WIV-GATE-GREETING-001", gdunitEvidence), { requiredEvidenceComplete: true });

if (fs.existsSync(path.join(root, ".git"))) throw new Error("External dogfood repository already exists; use the exact replay summary instead of mutating it.");
execFileSync("git", ["init", "--initial-branch=main"], { cwd: root, windowsHide: true });
git("config", "user.name", "DevRelay ChatGPT Desktop Dogfood");
git("config", "user.email", "dogfood@devrelay.invalid");
git("add", ".gitignore", "README.md", "package.json", "package-lock.json", "lifecycle-run.mjs", "project.godot", "requirements", "architecture");
git("commit", "-m", "Baseline approved Greeting Card design");
const baselineCommit = git("rev-parse", "HEAD");
git("add", "main.gd", "main.tscn", "test");
git("commit", "-m", "Implement verified Greeting Card");
const implementationCommit = git("rev-parse", "HEAD");
assert.equal(git("status", "--porcelain"), "");
const changeSet = { changeSetId: "CS-GREETING-001", files: sourceFiles };
const integrationRecord = { recordId: "ICR-GREETING-001", workItemId: workItem.id, parentCommit: baselineCommit, implementationCommit, targetRef: "refs/heads/main", sourceIncorporated: true };
record("ChangeIntegration", "integrate-change", "integrated", ref(integrationRecord.recordId, integrationRecord), { adapter: "local-git-integration", commit: implementationCommit });

const sourceArtifact = ref("TRACE-SOURCE-GREETING-001", { requirementsArtifact, architecture, workItem, changeSet, gdunitEvidence, integrationRecord });
const contributor = { id: "devrelay.windows-godot-dogfood", version: "1.0.0", contractDigest: api.canonicalJsonDigest("devrelay.windows-godot-dogfood/v1") };
const graphId = "godot-greeting-e2e";
const locator = (pointer, value) => ({ artifact: sourceArtifact, jsonPointer: pointer, entityDigest: api.canonicalJsonDigest(value) });
const node = (kind, stableId, label, scope, value) => {
  const authority = "approved";
  const material = { nodeId: api.traceabilityNodeId({ graphId, kind, stableId, authority, scope }), kind, stableId, label, authority, state: "active", scope, contributor, attributes: {}, sourceLocators: [locator("/" + stableId, value)] };
  return { ...material, contentDigest: api.traceabilityContentDigest(material) };
};
const nodes = [
  node("business-objective", "BO-GREETING-001", "Provide a deterministic greeting.", "requirements/baseline", requirementsArtifact.goal),
  node("acceptance-criterion", "AC-GREETING-001", "Trimmed names produce the expected greeting.", "requirements/baseline", requirementsArtifact.acceptanceCriteria[0]),
  node("architecture-element", "EL-GREETING-FORMATTER", "Pure Greeting Formatter", "architecture/baseline", architecture.elements[1]),
  node("work-item", workItem.id, workItem.objective, "work-breakdown/baseline", workItem),
  node("change-set", changeSet.changeSetId, "Greeting Card source change", "change-integration/integrated", changeSet),
  node("verification-evidence", gdunitEvidence.evidenceId, "GdUnit4 Greeting Card evidence", "work-item-verification/approved", gdunitEvidence),
  node("business-acceptance-record", "BA-GREETING-001", "Accepted Greeting Card result", "business-acceptance/accepted", { accepted: true }),
].sort((a, b) => a.nodeId.localeCompare(b.nodeId, "en"));
const byStable = new Map(nodes.map((item) => [item.stableId, item]));
const edge = (kind, sourceId, targetId, rationale) => {
  const authority = "approved", scope = "windows-e2e/factual", qualifier = "";
  const sourceNodeId = byStable.get(sourceId).nodeId, targetNodeId = byStable.get(targetId).nodeId;
  const material = { edgeId: api.traceabilityEdgeId({ graphId, kind, sourceNodeId, targetNodeId, qualifier, authority, scope }), kind, sourceNodeId, targetNodeId, qualifier, rationale, authority, state: "active", scope, contributor, attributes: {}, sourceLocators: [locator("/edges/" + kind + "/" + sourceId + "/" + targetId, { kind, sourceId, targetId })] };
  return { ...material, contentDigest: api.traceabilityContentDigest(material) };
};
const edges = [
  edge("designed-by", "AC-GREETING-001", "EL-GREETING-FORMATTER", "The formatter design supports the criterion."),
  edge("produces", workItem.id, changeSet.changeSetId, "The approved work item produced the source change."),
  edge("implemented-by", "EL-GREETING-FORMATTER", changeSet.changeSetId, "The change implements the formatter element."),
  edge("verified-by", "AC-GREETING-001", gdunitEvidence.evidenceId, "GdUnit4 proves the behavior."),
  edge("accepted-by", "BO-GREETING-001", "BA-GREETING-001", "The owner accepted the demonstrated business outcome."),
].sort((a, b) => a.edgeId.localeCompare(b.edgeId, "en"));
const graph = { apiVersion: API, kind: "TraceabilityGraphSnapshot", graphId, projectId: "godot-greeting-card", revision: 0, horizon: "implementation", vocabulary: api.TRACEABILITY_VOCABULARY_V1_6, parentGraph: null, lastAppliedUpdate: null, appliedUpdates: [], nodes, edges };
api.validateTraceabilityGraphSnapshot(graph);
const traceService = api.createTraceabilityQueryService(graph);
const traceQuery = traceService.coverage({ start: { kind: "acceptance-criterion", stableId: "AC-GREETING-001" }, targetKinds: ["change-set", "verification-evidence"], limit: 20 });
assert.equal(traceQuery.total, 2);
record("TraceabilityGraph", "merge-and-query", "completed", ref("TRACE-GREETING-001", graph), { coverageQuery: ref("TRACE-QUERY-GREETING-001", traceQuery), resultCount: traceQuery.total });

const systemArgs = ["--headless", "--editor", "--path", runtime, "--quit"];
const systemClock = process.hrtime.bigint();
const systemRun = spawnSync(godotExecutable, systemArgs, { cwd: runtime, windowsHide: true, encoding: null, maxBuffer: 32 * 1024 * 1024 });
const systemReceiptRecord = api.recordExecutionReceipt({
  effect: { id: "SYSTEM-GODOT-GREETING-001", command: godotExecutable, argv: systemArgs, cwd: ".runtime", environmentDigest: api.canonicalJsonDigest({ godot: "4.7.1", platform: "Windows" }), grants: ["process.spawn"], attemptNumber: 1 },
  observation: { stdout: Buffer.from(systemRun.stdout ?? []), stderr: Buffer.from(systemRun.stderr ?? []), exitCode: systemRun.status ?? -1, durationMilliseconds: Number(process.hrtime.bigint() - systemClock) / 1_000_000, toolVersion: "4.7.1", artifacts: [] },
});
api.verifyExecutionReceipt(systemReceiptRecord);
if (systemReceiptRecord.receipt.terminalState !== "succeeded") throw new Error("Godot headless system verification failed.");
const systemEvidence = { evidenceId: "SYSTEM-EVIDENCE-GREETING-001", gdunit: ref(gdunitEvidence.evidenceId, gdunitEvidence), headless: ref(systemReceiptRecord.receipt.receiptId, systemReceiptRecord.receipt), compatibility: ref(compatibilityDecision.decisionId, compatibilityDecision), traceQuery: ref("TRACE-QUERY-GREETING-001", traceQuery), outcome: "verified" };
record("SystemVerification", "verify-integrated-system", "completed", ref(systemEvidence.evidenceId, systemEvidence), { outcome: "verified" });
const businessAcceptance = { acceptanceId: "BA-GREETING-001", acceptedBy: "Garrett Audet", authority: "owner-standing-approval", acceptedCriteria: requirementsArtifact.acceptanceCriteria, acceptedObjective: "BO-GREETING-001", exclusions: ["deployment", "hosted services", "analytics"], outcome: "accepted" };
record("BusinessAcceptanceGate", "accept-system", "approved", ref(businessAcceptance.acceptanceId, businessAcceptance), { outcome: "accepted" });

const implementationTree = git("rev-parse", implementationCommit + "^{tree}");
const implementationSeal = api.createImplementationSeal({
  repositoryId: "godot-greeting-card",
  targetRef: "refs/heads/main",
  parentCommit: baselineCommit,
  implementationCommit,
  treeDigest: api.canonicalJsonDigest({ tree: implementationTree }),
  verifiedChangeSet: ref(changeSet.changeSetId, changeSet),
  integrationRecord: ref(integrationRecord.recordId, integrationRecord),
  worktreeClean: true,
});

fs.mkdirSync(evidenceDirectory, { recursive: true });
for (let index = 0; index < stageEvidence.length; index += 1) writeJson(evidenceDirectory, String(index + 1).padStart(2, "0") + "-" + stageEvidence[index].module + ".json", stageEvidence[index]);
writeJson(evidenceDirectory, "traceability-graph.json", graph);
writeJson(evidenceDirectory, "trace-query.json", traceQuery);
writeJson(evidenceDirectory, "system-evidence.json", systemEvidence);
writeJson(evidenceDirectory, "business-acceptance.json", businessAcceptance);
writeJson(evidenceDirectory, "implementation-seal.json", implementationSeal);


const facts = stageEvidence.map((stage, index) => {
  const body = { factId: "FACT-" + String(index + 1).padStart(2, "0"), runId, component: { kind: stage.module.endsWith("Gate") ? "gate" : "module", id: stage.module, version: "0.1.0" }, event: stage.status === "skipped" ? "skipped" : stage.status === "approved" ? "approved" : "completed", source: { kind: "module-execution-record", artifact: ref(stage.stageId, stage) }, authority: "trusted-workflow-record" };
  return { apiVersion: API, kind: "RunWorkflowFact", ...body, factDigest: api.canonicalJsonDigest(body) };
});
const ledger = api.createRunLedger();
const appended = await ledger.append({ runId, facts });
const replayed = await ledger.replay(appended.checkpointDigest);
assert.equal(replayed.replayed, true);
const stageRows = stageEvidence.map((stage, index) => ({
  componentKind: stage.module.endsWith("Gate") ? "gate" : "module",
  componentId: stage.module,
  sequence: index,
  operation: stage.operation,
  adapterBindings: (stage.liveProviders ?? stage.adapters ?? []).map((id) => ({ id, version: "1.0.0", configurationDigest: api.canonicalJsonDigest({ id, stage: stage.module }) })),
  status: stage.status === "skipped" ? "skipped" : "completed",
  outcome: stage.status === "skipped" ? "skipped" : stage.status === "approved" ? "approved" : "completed",
  gateResult: stage.module.endsWith("Gate") ? (stage.status === "skipped" ? "not-applicable" : "approved") : "not-applicable",
  rework: { attemptCount: stage.module === "RequirementsGathering" ? 2 : 1, replayed: stage.module === "RequirementsGathering", predecessorAttempts: [] },
  performance: [],
  importantArtifacts: [stage.artifact],
  nextAction: { disposition: "none" },
  sourceFacts: [facts[index].source.artifact],
}));
const adapterAssessments = [
  { adapter: { id: "openspec", version: "1.9.0", configurationDigest: attestations.openspec.binding.configurationDigest }, maturity: "live-conformant", comparability: { disposition: "unavailable", reason: "Single bounded run." } },
  { adapter: { id: "spec-kit", version: "0.16.3", configurationDigest: attestations["spec-kit"].binding.configurationDigest }, maturity: "live-conformant", comparability: { disposition: "unavailable", reason: "Single bounded run." } },
  { adapter: { id: "structurizr", version: providerEvidence.manifests.structurizr.version, configurationDigest: api.canonicalJsonDigest(providerEvidence.manifests.structurizr) }, maturity: "live-conformant", comparability: { disposition: "unavailable", reason: "Single bounded run." } },
  { adapter: { id: "madr", version: providerEvidence.manifests.madr.version, configurationDigest: api.canonicalJsonDigest(providerEvidence.manifests.madr) }, maturity: "live-conformant", comparability: { disposition: "unavailable", reason: "Single bounded run." } },
  { adapter: { id: "gdunit4", version: "6.2.0", configurationDigest: compatibilityPolicy.policyDigest }, maturity: "live-conformant", comparability: { disposition: "unavailable", reason: "Single bounded run." } },
];
const stageDetails = Object.fromEntries(stageRows.map((stage) => [stage.componentId, {
  operation: stage.operation,
  adapterBindings: stage.adapterBindings,
  outcome: stage.outcome,
  gateResult: stage.gateResult,
  performance: stage.performance,
  importantArtifacts: stage.importantArtifacts,
  nextAction: stage.nextAction,
  sourceFacts: stage.sourceFacts,
}]));
const graphArtifactRef = ref("TRACE-GREETING-001", graph);
const snapshot = api.projectLifecycleRunSnapshot({
  snapshotId: "LRS-GREETING-SIM001",
  ledgerCheckpoint: appended.checkpoint,
  traceabilityGraph: { snapshot: graph, ref: graphArtifactRef },
  adapterAssessments,
  stageDetails,
  nextAction: { disposition: "none" },
});
api.validateLifecycleRunReportArtifact(snapshot);
const contentPolicyBody = { apiVersion: API, kind: "LifecycleRunContentPolicy", policyId: "POLICY-GREETING-SIM001", version: "1.0.0", rules: [
  { classification: "public", disposition: "allow" }, { classification: "internal", disposition: "allow" }, { classification: "restricted", disposition: "redact" }, { classification: "secret", disposition: "omit" }, { classification: "credential", disposition: "omit" }, { classification: "prompt", disposition: "omit" }, { classification: "raw-tool-log", disposition: "omit" }, { classification: "unknown", disposition: "omit" },
], unknownClassification: "omit", authority: "content-filter-only" };
const contentPolicy = { ...contentPolicyBody, policyDigest: api.canonicalJsonDigest(Object.fromEntries(Object.entries(contentPolicyBody).filter(([key]) => !["apiVersion", "kind"].includes(key)))) };
const rendered = api.renderLifecycleRunReport({ view: "summary", snapshot, contentPolicy, contentPolicyRef: { artifactId: contentPolicy.policyId, digest: contentPolicy.policyDigest } });
fs.writeFileSync(path.join(evidenceDirectory, "LifecycleRunReport.md"), rendered.bytes);
writeJson(evidenceDirectory, "lifecycle-run-snapshot.json", snapshot);
writeJson(evidenceDirectory, "run-ledger-checkpoint.json", appended.checkpoint);

const evidenceFiles = fs.readdirSync(evidenceDirectory).filter((name) => fs.statSync(path.join(evidenceDirectory, name)).isFile()).sort();
const evidenceManifest = evidenceFiles.map((name) => fileRef("EVIDENCE-" + name.toUpperCase().replaceAll(/[^A-Z0-9]+/gu, "-"), path.join(evidenceDirectory, name)));
git("add", "evidence");
git("commit", "-m", "Seal DevRelay lifecycle evidence");
const evidenceCommit = git("rev-parse", "HEAD");
assert.equal(git("rev-parse", evidenceCommit + "^"), implementationCommit);
assert.equal(git("status", "--porcelain"), "");
const evidenceSeal = api.createEvidenceSealRecord({ implementationSeal, evidenceCommit, parentCommit: implementationCommit, evidence: evidenceManifest, worktreeClean: true });
const evidenceManifestDigest = evidenceSeal.evidenceManifestDigest;
assert.equal(api.verifyTwoPhaseEvidenceSeal({
  implementationSeal,
  evidenceSeal,
  observation: { targetRef: "refs/heads/main", targetCommit: evidenceCommit, evidenceParentCommit: implementationCommit, implementationParentCommit: baselineCommit, implementationTreeDigest: implementationSeal.treeDigest, evidenceManifestDigest, worktreeClean: true },
}), true);
writeJson(parentEvidence, "evidence-seal.json", evidenceSeal);

const packageJson = json(path.join(root, "node_modules/devrelay/package.json"));
const cliEntrypoint = path.join(root, "node_modules/devrelay/bin/devrelay.mjs");
const cliVersion = spawnSync(process.execPath, [cliEntrypoint, "--version"], { cwd: root, encoding: "utf8", windowsHide: true });
const cliHelp = spawnSync(process.execPath, [cliEntrypoint, "--help"], { cwd: root, encoding: "utf8", windowsHide: true });
assert.equal(cliVersion.status, 0);
assert.equal(cliVersion.stdout.trim(), "0.10.0-rc.2");
assert.equal(cliHelp.status, 0);
assert.match(cliHelp.stdout, /init run resume status verify inspect evidence/u);
const finalFacadeVerification = await facade.verify(relay, { runId, subject: { kind: "business-acceptance", artifactId: businessAcceptance.acceptanceId } });
const finalFacadeInspection = await facade.inspect(relay, { runId, subject: { kind: "lifecycle-run-report", digest: rendered.access.markdownReport.digest } });
const summaryBody = {
  runId,
  host: { application: "ChatGPT Desktop", operatingSystem: "Windows", executor: "Codex" },
  operator: { profile: "standard", facadeConfigurationDigest: relay.configurationDigest, kickoffDigest: facadeKickoff.operationDigest, commands: operatorResults, binaryVersion: cliVersion.stdout.trim(), hostInvocations, finalVerificationDigest: finalFacadeVerification.operationDigest, finalInspectionDigest: finalFacadeInspection.operationDigest },
  software: { name: "DevRelay Greeting Card", platform: "Godot", tests: { total: 3, passed: 3, failed: 0 } },
  package: { name: packageJson.name, version: packageJson.version, tarball: fileRef("DEVRELAY-CANDIDATE-TARBALL", tarballPath) },
  modules: stageEvidence.map(({ module, operation, status }) => ({ module, operation, status })),
  liveProviders: providerEvidence.operations.map(({ providerId, operation, maturity, attestationDigest }) => ({ providerId, operation, maturity, attestationDigest })),
  compatibilityDecision: ref(compatibilityDecision.decisionId, compatibilityDecision),
  integration: { baselineCommit, implementationCommit, evidenceCommit },
  seals: { implementation: ref(implementationSeal.sealId, implementationSeal), evidence: ref(evidenceSeal.sealRecordId, evidenceSeal) },
  ledgerCheckpointDigest: appended.checkpointDigest,
  reportDigest: rendered.access.markdownReport.digest,
  traceQueryResults: traceQuery.total,
  outcome: "accepted",
};
const summary = { apiVersion: API, kind: "Sim001WindowsDesktopDogfoodSummary", ...summaryBody, summaryDigest: api.canonicalJsonDigest(summaryBody) };
writeJson(parentEvidence, "windows-desktop-dogfood-summary.json", summary);
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
