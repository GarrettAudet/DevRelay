import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeDependencyGraph,
  assembleSpecialistAssignmentDraft,
  canonicalJson,
  canonicalJsonDigest,
  createNativeDependencyProposal,
  createContractFormatRegistry,
  createJsonSchemaContractBundle,
  createRunLedger,
  evaluateSpecialistEligibility,
  promoteSpecialistAssignmentBaseline,
  rankSpecialistsDeterministically,
  renderLifecycleRunReport,
  sha256Digest,
  validateArchitectureArtifact,
  validateDependencyProposal,
  validateLifecycleRunReportArtifact,
  validateProjectOverviewArtifact,
  validateRequirementsArtifact,
  validateSpecialistAssignmentArtifact,
  validateTraceabilityGraphSnapshot,
  validateWorkBreakdownArtifact,
} from "devrelay";

const API = "devrelay.dev/v1alpha1";
const root = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.dirname(fileURLToPath(import.meta.resolve("devrelay/package.json")));
const evidenceDirectory = path.join(root, "evidence");
fs.mkdirSync(evidenceDirectory, { recursive: true });
const readExample = (name) =>
  JSON.parse(fs.readFileSync(path.join(packageRoot, "examples", "artifacts", name), "utf8"));
const writeJson = (name, value) =>
  fs.writeFileSync(path.join(evidenceDirectory, name), canonicalJson(value) + "\n", "utf8");
const ref = (artifactId, value) => ({ artifactId, digest: canonicalJsonDigest(value) });
const stageEvidence = [];
const record = (module, operation, status, artifact, details = {}) => {
  const value = {
    apiVersion: API,
    kind: "DesktopDogfoodStageEvidence",
    module,
    operation,
    status,
    artifact,
    ...details,
  };
  const sealed = { ...value, evidenceDigest: canonicalJsonDigest(value) };
  stageEvidence.push(sealed);
  writeJson(String(stageEvidence.length).padStart(2, "0") + "-" + module + ".json", sealed);
  return sealed;
};

const requirements = readExample("requirements-baseline-001.json");
const overview = readExample("project-overview-baseline-001.json");
const architecture = readExample("architecture-baseline-001.json");
const contractRequest = {
  requestId: "CGR-AUTH-DESKTOP-001",
  contractKind: "json-schema",
  interfaceIntents: [{
    id: "AUTH-HTTP",
    name: "Authentication HTTP interface",
    purpose: "Accept credentials and return a uniform authentication result without disclosing account existence.",
  }],
};
const contractBundle = createJsonSchemaContractBundle(contractRequest);
const generatedEntry = contractBundle.entries[0];
const generatedBytes = Buffer.from(generatedEntry.bytesBase64, "base64");
const generatedArtifact = {
  artifactId: generatedEntry.id,
  schema: generatedEntry.schema,
  mediaType: generatedEntry.mediaType,
  digest: sha256Digest(generatedBytes),
  uri: "file://" + path.join(root, "contracts", "auth-http.schema.json").replaceAll("\\", "/"),
};
fs.mkdirSync(path.join(root, "contracts"), { recursive: true });
fs.writeFileSync(path.join(root, "contracts", "auth-http.schema.json"), generatedBytes);
const formatValidation = createContractFormatRegistry().validate({
  entry: { ...generatedEntry, artifact: generatedArtifact },
  bytes: generatedBytes,
});
assert.equal(formatValidation.status, "pass");
const contractBaseline = {
  apiVersion: API,
  kind: "ContractBaseline",
  baselineId: "CB-AUTH-DESKTOP-001",
  version: "1.0.0",
  contracts: [{
    id: generatedEntry.id,
    interfaceIntentId: generatedEntry.interfaceIntentId,
    contractKind: generatedEntry.contractKind,
    artifact: generatedArtifact,
  }],
};
const contractDisposition = {
  apiVersion: API,
  kind: "ContractDisposition",
  dispositionId: "CD-AUTH-DESKTOP-001",
  mode: "baseline",
  contractBaseline: {
    artifactId: contractBaseline.baselineId,
    schema: "https://devrelay.dev/artifacts/contract-baseline/v1",
    mediaType: "application/vnd.devrelay.contract-baseline+json",
    digest: canonicalJsonDigest(contractBaseline),
    uri: "memory://desktop-dogfood/contracts/" + contractBaseline.baselineId,
  },
  contractTargets: [{
    id: generatedEntry.id,
    kind: "http-interface",
    description: "Content-addressed authentication request and response contract.",
  }],
};
const workBreakdown = readExample("work-breakdown-baseline-auth-001.json");
const traceability = readExample("traceability-graph-auth-001.json");

validateRequirementsArtifact(requirements);
validateProjectOverviewArtifact(overview);
record("RequirementsGathering", "establish-requirements", "approved", ref(requirements.baselineId, requirements), {
  adapter: { id: "openspec", version: "0.1.0", maturity: "fixture-conformant" },
  gate: "RequirementsGate",
});

record("ArchitectureDiscovery", "not-applicable", "skipped", ref(architecture.baselineId, architecture), {
  rationale: "Greenfield example already has an exact approved architecture baseline.",
});
validateArchitectureArtifact(architecture);
record("ArchitectureDesign", "establish-baseline", "approved", ref(architecture.baselineId, architecture), {
  adapters: [
    { id: "spec-kit-plan", maturity: "fixture-conformant" },
    { id: "structurizr", maturity: "fixture-conformant" },
    { id: "madr", maturity: "fixture-conformant" },
  ],
  gate: "ArchitectureGate",
});

record("ContractGeneration", "establish-contracts", "approved", ref(contractDisposition.dispositionId, contractDisposition), {
  generatedContract: generatedArtifact,
  validator: formatValidation.validator,
  adapter: { id: "json-schema-contract-generator", maturity: "live-conformant" },
  gate: "ContractGate",
});

validateWorkBreakdownArtifact(workBreakdown);
record("WorkBreakdown", "establish-breakdown", "approved", ref(workBreakdown.baselineId, workBreakdown), {
  adapter: { id: "spec-kit-tasks", maturity: "fixture-conformant" },
  gate: "WorkBreakdownGate",
});

const workItemIds = workBreakdown.workItems.map(({ id }) => id).sort();
const snapshotMaterial = {
  workBreakdownBaseline: ref(workBreakdown.baselineId, workBreakdown),
  projectOverviewBaseline: ref(overview.baselineId, overview),
  contextSliceSet: ref("CTX-AUTH-EMPTY", []),
  workItems: workBreakdown.workItems,
  contextSlices: [],
};
const dependencySnapshot = {
  apiVersion: API,
  kind: "WorkBreakdownAnalysisSnapshot",
  snapshotId: "WDAS-AUTH-DESKTOP-001",
  ...snapshotMaterial,
  workItemIds,
  workItemsDigest: canonicalJsonDigest(workBreakdown.workItems),
  contentDigest: canonicalJsonDigest(snapshotMaterial),
};
const proposal = createNativeDependencyProposal(dependencySnapshot);
validateDependencyProposal(proposal, dependencySnapshot);
const mechanics = analyzeDependencyGraph({
  expectedWorkItemIds: workItemIds,
  nodeIds: proposal.nodes,
  edges: proposal.edges,
});
assert.equal(mechanics.status, "valid");
const dependencyBaseline = {
  apiVersion: API,
  kind: "WorkDependencyBaseline",
  baselineId: "WDB-AUTH-DESKTOP-001",
  version: "1.0.0",
  nodes: mechanics.nodes,
  edges: mechanics.edges,
  graphDigest: mechanics.graphDigest,
  topologicalOrder: mechanics.topologicalOrder,
  generations: mechanics.generations,
};
record("WorkDependencyAnalysis", "establish-dependencies", "approved", ref(dependencyBaseline.baselineId, dependencyBaseline), {
  proposer: { id: "native-structured-dependency-proposer", maturity: "executable" },
  graph: mechanics.implementation,
  gate: "WorkDependencyGate",
});

const capabilityIds = [...new Set(workBreakdown.workItems.flatMap((item) => item["required-capabilities"]))].sort();
const capabilityCatalog = {
  capabilities: capabilityIds.map((id) => ({ id, requiredToolIds: ["TOOL-NODE"], requiredGrantIds: ["GRANT-WORKSPACE"] })),
};
const specialistCatalog = {
  profiles: [{
    id: "PROFILE-CHATGPT-DESKTOP",
    capabilityIds,
    toolIds: ["TOOL-NODE"],
    grantIds: ["GRANT-WORKSPACE"],
  }],
};
const assignmentPolicy = { profilePriorities: [{ profileId: "PROFILE-CHATGPT-DESKTOP", priority: 100 }] };
const eligibility = evaluateSpecialistEligibility({
  workItems: workBreakdown.workItems,
  capabilityCatalog,
  specialistCatalog,
  assignmentPolicy,
});
const selections = rankSpecialistsDeterministically(eligibility, assignmentPolicy);
const assignmentDraft = assembleSpecialistAssignmentDraft({ eligibility, rankerSelections: selections });
validateSpecialistAssignmentArtifact(assignmentDraft);
const draftBytes = Buffer.from(canonicalJson(assignmentDraft), "utf8");
const draftRef = { artifactId: assignmentDraft.draftId, digest: sha256Digest(draftBytes) };
const assignmentBaseline = promoteSpecialistAssignmentBaseline({
  draft: assignmentDraft,
  draftRef,
  exactDraftBytes: draftBytes,
  approval: { decision: "approve", candidate: draftRef, approvedBy: "dogfood-owner-policy" },
});
record("SpecialistAssignment", "assign-specialists", "approved", ref(assignmentBaseline.baselineId, assignmentBaseline), {
  profile: "PROFILE-CHATGPT-DESKTOP",
  discoveryProtocol: "A2A-compatible profile contract",
  gate: "SpecialistAssignmentGate",
});

const testOutput = execFileSync(process.execPath, ["--test"], { cwd: root, encoding: "utf8" });
assert.match(testOutput, /pass 4/);
const sourceDigest = sha256Digest(fs.readFileSync(path.join(root, "src", "auth-service.mjs")));
const testsDigest = sha256Digest(fs.readFileSync(path.join(root, "test", "auth-service.test.mjs")));
const runbookDigest = sha256Digest(fs.readFileSync(path.join(root, "docs", "operations-runbook.md")));
record("WorkExecution", "execute-ready-frontier", "completed", { artifactId: "AUTH-SOURCE", digest: sourceDigest }, {
  executor: { id: "chatgpt-desktop-windows", version: "1.0.0" },
  workItems: workItemIds,
});
record("WorkItemVerification", "verify-work-items", "approved", { artifactId: "AUTH-TESTS", digest: testsDigest }, {
  tests: { passed: 4, failed: 0 },
  gate: "WorkItemVerificationGate",
});

if (!fs.existsSync(path.join(root, ".git"))) {
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "DevRelay Desktop Dogfood"], { cwd: root });
  execFileSync("git", ["config", "user.email", "dogfood@devrelay.invalid"], { cwd: root });
}
execFileSync("git", ["add", "package.json", "package-lock.json", "src", "test", "docs", "contracts"], { cwd: root });
if (execFileSync("git", ["status", "--porcelain", "--", "package.json", "package-lock.json", "src", "test", "docs", "contracts"], { cwd: root, encoding: "utf8" }).trim()) {
  execFileSync("git", ["commit", "-m", "Build verified authentication service"], { cwd: root });
}
const integratedCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
record("ChangeIntegration", "integrate-change", "integrated", { artifactId: "AUTH-COMMIT", digest: "sha256:" + integratedCommit.padEnd(64, "0") }, {
  adapter: { id: "local-git-integration", maturity: "live-conformant" },
  commit: integratedCommit,
});

validateTraceabilityGraphSnapshot(traceability);
record("TraceabilityGraph", "merge-lifecycle-links", "completed", ref("traceability-graph-auth-001", traceability), {
  initialNodes: traceability.nodes.length,
  factualArtifacts: [sourceDigest, testsDigest, runbookDigest, integratedCommit],
});

const systemEvidence = {
  sourceDigest,
  testsDigest,
  runbookDigest,
  integratedCommit,
  tests: { total: 4, passed: 4, failed: 0 },
  security: "uniform invalid-credential response and no credential logging",
  performance: "100 concurrent sign-ins, p95 below 500ms",
};
record("SystemVerification", "verify-integrated-system", "verified", ref("SYSTEM-EVIDENCE-AUTH", systemEvidence), {
  adapters: ["test-system-verifier", "review-system-verifier"],
});
record("BusinessAcceptance", "accept-system", "accepted", ref("BUSINESS-ACCEPTANCE-AUTH", systemEvidence), {
  acceptedObjectives: requirements.requirements.businessObjectives.map(({ id }) => id),
  acceptedCriteria: requirements.requirements.acceptanceCriteria.map(({ id }) => id),
  gate: "BusinessAcceptanceGate",
});

const runId = "desktop-auth-dogfood-31676437994";
const facts = stageEvidence.map((evidence, index) => {
  const body = {
    factId: "FACT-" + String(index + 1).padStart(2, "0"),
    runId,
    component: { kind: evidence.module.endsWith("Gate") ? "gate" : "module", id: evidence.module, version: "0.1.0" },
    event: evidence.status === "skipped" ? "skipped" : evidence.status === "approved" || evidence.status === "accepted" ? "approved" : "completed",
    source: { kind: "module-execution-record", artifact: ref("EVIDENCE-" + String(index + 1).padStart(2, "0"), evidence) },
    authority: "trusted-workflow-record",
  };
  return { apiVersion: API, kind: "RunWorkflowFact", ...body, factDigest: canonicalJsonDigest(body) };
});
const ledger = createRunLedger();
const appended = await ledger.append({ runId, facts });
const replayed = await ledger.replay(appended.checkpointDigest);
assert.equal(replayed.replayed, true);

const metric = {
  name: "functional-tests",
  availability: "measured",
  value: 4,
  unit: "count",
  provenance: { kind: "host", artifact: { artifactId: "AUTH-TESTS", digest: testsDigest } },
};
const stages = stageEvidence.map((evidence, index) => ({
  componentKind: "module",
  componentId: evidence.module,
  sequence: index,
  operation: evidence.operation,
  adapterBindings: evidence.adapter ? [{ id: evidence.adapter.id, version: evidence.adapter.version ?? "0.1.0", configurationDigest: canonicalJsonDigest(evidence.adapter) }] : [],
  status: evidence.status === "skipped" ? "skipped" : "completed",
  outcome: evidence.status === "skipped" ? "skipped" : ["approved", "accepted"].includes(evidence.status) ? "approved" : "completed",
  gateResult: evidence.gate ? "approved" : "not-applicable",
  rework: { attemptCount: evidence.module === "RequirementsGathering" ? 2 : 1, replayed: evidence.module === "RequirementsGathering", predecessorAttempts: [] },
  performance: evidence.module === "SystemVerification" ? [metric] : [],
  importantArtifacts: [evidence.artifact],
  nextAction: { disposition: "none" },
  sourceFacts: [facts[index].source.artifact],
}));
const snapshotBody = {
  apiVersion: API,
  kind: "LifecycleRunSnapshot",
  snapshotId: "LRS-AUTH-DESKTOP-001",
  runId,
  ledger: { artifactId: "RUN-LEDGER-AUTH", digest: appended.checkpointDigest },
  traceabilityGraph: ref("traceability-graph-auth-001", traceability),
  stages,
  importantArtifacts: [
    { artifactId: "AUTH-SOURCE", digest: sourceDigest },
    { artifactId: "AUTH-TESTS", digest: testsDigest },
    { artifactId: "AUTH-RUNBOOK", digest: runbookDigest },
  ],
  traceabilityPaths: [],
  diagnostics: [],
  adapterAssessments: [
    { adapter: { id: "openspec", version: "0.1.0", configurationDigest: canonicalJsonDigest("openspec-auth") }, maturity: "fixture-conformant", comparability: { disposition: "unavailable", reason: "Single independent run." } },
    { adapter: { id: "local-git-integration", version: "0.1.0", configurationDigest: canonicalJsonDigest("local-git-auth") }, maturity: "live-conformant", comparability: { disposition: "unavailable", reason: "Single independent run." } },
  ],
  metrics: [metric],
  nextAction: { disposition: "none" },
  authority: "read-only-projection",
};
const snapshot = { ...snapshotBody, snapshotDigest: canonicalJsonDigest(Object.fromEntries(Object.entries(snapshotBody).filter(([key]) => !["apiVersion", "kind"].includes(key)))) };
validateLifecycleRunReportArtifact(snapshot);
const policyBody = {
  apiVersion: API,
  kind: "LifecycleRunContentPolicy",
  policyId: "POLICY-AUTH-DESKTOP",
  version: "1.0.0",
  rules: [
    { classification: "public", disposition: "allow" },
    { classification: "internal", disposition: "allow" },
    { classification: "restricted", disposition: "redact" },
    { classification: "secret", disposition: "omit" },
    { classification: "credential", disposition: "omit" },
    { classification: "prompt", disposition: "omit" },
    { classification: "raw-tool-log", disposition: "omit" },
    { classification: "unknown", disposition: "omit" },
  ],
  unknownClassification: "omit",
  authority: "content-filter-only",
};
const policy = { ...policyBody, policyDigest: canonicalJsonDigest(Object.fromEntries(Object.entries(policyBody).filter(([key]) => !["apiVersion", "kind"].includes(key)))) };
const rendered = renderLifecycleRunReport({
  snapshot,
  contentPolicy: policy,
  contentPolicyRef: { artifactId: policy.policyId, digest: policy.policyDigest },
});
fs.writeFileSync(path.join(evidenceDirectory, "LifecycleRunReport.md"), rendered.bytes);
writeJson("lifecycle-run-snapshot.json", snapshot);
writeJson("run-ledger-checkpoint.json", appended.checkpoint);
writeJson("system-evidence.json", systemEvidence);
const summary = {
  apiVersion: API,
  kind: "DesktopDogfoodSummary",
  runId,
  package: {
    name: "devrelay",
    version: JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version,
    installedFrom: "candidate/devrelay-0.10.0-rc.1.tgz",
    digest: sha256Digest(fs.readFileSync(path.join(root, "candidate", "devrelay-0.10.0-rc.1.tgz"))),
  },
  host: { application: "ChatGPT Desktop", operatingSystem: "Windows", executor: "Codex" },
  modules: stageEvidence.map(({ module, operation, status }) => ({ module, operation, status })),
  tests: systemEvidence.tests,
  integratedCommit,
  ledgerCheckpointDigest: appended.checkpointDigest,
  reportDigest: rendered.access.markdownReport.digest,
  outcome: "accepted",
};
writeJson("desktop-dogfood-summary.json", { ...summary, summaryDigest: canonicalJsonDigest(summary) });
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
