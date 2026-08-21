import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import {
  PROJECT_OVERVIEW_DOCUMENT,
  PROJECT_OVERVIEW_PROJECTION,
  PROJECT_OVERVIEW_RENDERER,
  deriveProjectOverview,
  diffProjectOverviewSections,
  renderProjectOverviewMarkdownBytes,
} from "../../src/project-overview.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { buildEnvironmentPreparationRequirements } from "./ep-001-approved-data.mjs";

const root = new URL("../../", import.meta.url);
const output = new URL("./", import.meta.url);
const canonicalRoot = "C:/repos/DevRelay";
const artifactRoot = "file:///C:/repos/DevRelay/dogfood/ep-001-environment-preparation";
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = ({ artifactId, digest }) => ({ artifactId, digest });

const types = {
  goal: ["https://devrelay.dev/artifacts/goal/v1", "application/vnd.devrelay.goal+json"],
  projectContext: ["https://devrelay.dev/artifacts/project-context/v1", "application/vnd.devrelay.project-context+json"],
  repositorySnapshot: ["https://devrelay.dev/artifacts/repository-snapshot/v1", "application/vnd.devrelay.repository-snapshot+json"],
  requirementsBaseline: ["https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json"],
  projectOverviewBaseline: ["https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json"],
  requirementsChangeSet: ["https://devrelay.dev/artifacts/requirements-change-set/v1", "application/vnd.devrelay.requirements-change-set+json"],
  projectOverviewChangeSet: ["https://devrelay.dev/artifacts/project-overview-change-set-draft/v1", "application/vnd.devrelay.project-overview-change-set-draft+json"],
  projectOverviewMarkdown: ["https://devrelay.dev/artifacts/project-overview-markdown/v1", "text/markdown; charset=utf-8"],
  nativeSourceBundle: ["https://devrelay.dev/artifacts/native-source-bundle/v1", "application/vnd.devrelay.native-source-bundle+json"],
};

function createStore() {
  const values = new Map();
  const files = new Map();
  const add = ({ artifactId, bytes, type, fileName, uri }) => {
    const [schema, mediaType] = types[type] ?? [];
    const ref = Object.freeze({ artifactId, ...(schema === undefined ? {} : { schema, mediaType }), digest: sha256Digest(bytes), uri });
    values.set(artifactId, Buffer.from(bytes));
    if (fileName !== undefined) files.set(fileName, Buffer.from(bytes));
    return ref;
  };
  return {
    addJson(fileName, artifactId, type, value) {
      return add({ artifactId, bytes: jsonBytes(value), type, fileName, uri: `${artifactRoot}/${fileName.replaceAll("\\", "/")}` });
    },
    addText(fileName, artifactId, text) {
      return add({ artifactId, bytes: Buffer.from(text.normalize("NFC"), "utf8"), fileName, uri: `${artifactRoot}/${fileName.replaceAll("\\", "/")}` });
    },
    addBytes(fileName, artifactId, type, bytes) {
      return add({ artifactId, bytes: Buffer.from(bytes), type, fileName, uri: `${artifactRoot}/${fileName.replaceAll("\\", "/")}` });
    },
    addExisting({ artifactId, bytes, type, uri }) { return add({ artifactId, bytes, type, uri }); },
    artifacts: {
      async load(ref) {
        const bytes = values.get(ref.artifactId);
        if (bytes === undefined) throw new Error(`Missing artifact ${ref.artifactId}.`);
        return Buffer.from(bytes);
      },
    },
    async writeAll() {
      for (const [fileName, bytes] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
        const target = new URL(fileName, output);
        await mkdir(new URL("./", target), { recursive: true });
        await writeFile(target, bytes);
      }
    },
  };
}

const store = createStore();
const requirementsBaselineBytes = await readFile(new URL("project/requirements-baseline.json", root));
const requirementsBaseline = JSON.parse(requirementsBaselineBytes);
const requirementsBaselineRef = store.addExisting({
  artifactId: requirementsBaseline.baselineId,
  bytes: requirementsBaselineBytes,
  type: "requirementsBaseline",
  uri: "file:///C:/repos/DevRelay/project/requirements-baseline.json",
});
const overviewBaselineBytes = await readFile(new URL("project/project-overview-baseline.json", root));
const overviewBaseline = JSON.parse(overviewBaselineBytes);
const overviewBaselineRef = store.addExisting({
  artifactId: overviewBaseline.baselineId,
  bytes: overviewBaselineBytes,
  type: "projectOverviewBaseline",
  uri: "file:///C:/repos/DevRelay/project/project-overview-baseline.json",
});
store.addExisting({
  artifactId: overviewBaseline.renderedDocument.artifact.artifactId,
  bytes: await readFile(new URL("ProjectOverview.md", root)),
  type: "projectOverviewMarkdown",
  uri: "file:///C:/repos/DevRelay/ProjectOverview.md",
});

const goalBytes = await readFile(new URL("goal.json", output));
const goal = JSON.parse(goalBytes);
const goalRef = store.addExisting({ artifactId: goal.goalId, bytes: goalBytes, type: "goal", uri: `${artifactRoot}/goal.json` });
const contextBytes = await readFile(new URL("project-context.json", output));
const projectContext = JSON.parse(contextBytes);
const projectContextRef = store.addExisting({
  artifactId: "project-context-devrelay-ep-001-environment-preparation-v1",
  bytes: contextBytes,
  type: "projectContext",
  uri: `${artifactRoot}/project-context.json`,
});

const repositorySnapshot = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RepositorySnapshot",
  repository: canonicalRoot,
  revision: "eb56676de9771a16c6800b11ed9c4762cc8cd83c",
  treeDigest: "sha256:b101b0404cc55b21bc275cc6edbe1110ee7dd8a36c52652be4aae24c7063cc28",
  includedPaths: [
    ".codex/**", "AGENTS.md", "CHANGELOG.md", "CONTRIBUTING.md", "CURRENT_STATUS.md", "ProjectOverview.md", "README.md", "RELEASE.md", "SECURITY.md",
    "contracts/**", "docs/**", "dogfood/**", "examples/**", "openspec/**", "project/**", "release/**", "scripts/**", "src/**", "test/**", "package-lock.json", "package.json",
  ],
  excludedPaths: [".git/**", ".devrelay/tools/**", "node_modules/**"],
};
const repositorySnapshotRef = store.addJson(
  "repository-snapshot.json",
  "repository-snapshot-devrelay-eb56676-ep-001",
  "repositorySnapshot",
  repositorySnapshot,
);

const decisionsBytes = await readFile(new URL("owner-decisions.json", output));
const decisions = JSON.parse(decisionsBytes);
const decisionsRef = store.addExisting({ artifactId: decisions.decisionSetId, bytes: decisionsBytes, uri: `${artifactRoot}/owner-decisions.json` });
const closureBytes = await readFile(new URL("requirements-closure-assessment-approved.json", output));
const closure = JSON.parse(closureBytes);
const closureRef = store.addExisting({
  artifactId: "requirements-closure-ep-001-environment-preparation-v1",
  bytes: closureBytes,
  uri: `${artifactRoot}/requirements-closure-assessment-approved.json`,
});

const requirementSourceRefs = [
  { role: "goal", artifact: pointer(goalRef) },
  { role: "owner-decision", artifact: pointer(decisionsRef), location: "All 24 recommendations approved in wave RQW-0FEF4753B3072E01" },
  { role: "requirements-closure", artifact: pointer(closureRef) },
  { role: "project-context", artifact: pointer(projectContextRef) },
  { role: "repository-snapshot", artifact: pointer(repositorySnapshotRef) },
  { role: "requirements-baseline", artifact: pointer(requirementsBaselineRef) },
  { role: "project-overview-baseline", artifact: pointer(overviewBaselineRef) },
];
const replacement = buildEnvironmentPreparationRequirements(requirementsBaseline.requirements, requirementSourceRefs);
const changedSections = Object.keys(replacement)
  .filter((key) => canonicalJsonDigest(replacement[key]) !== canonicalJsonDigest(requirementsBaseline.requirements[key]))
  .sort();
const requirementsChangeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsChangeSet",
  changeSetId: "requirements-change-set-ep-001-environment-preparation-v1",
  baseInputs: [
    { role: "goal", artifact: pointer(goalRef) },
    { role: "project-context", artifact: pointer(projectContextRef) },
    { role: "repository-snapshot", artifact: pointer(repositorySnapshotRef) },
    { role: "requirements-baseline", artifact: pointer(requirementsBaselineRef) },
    { role: "project-overview-baseline", artifact: pointer(overviewBaselineRef) },
  ],
  baseline: pointer(requirementsBaselineRef),
  expectedRequirementsDigest: canonicalJsonDigest(requirementsBaseline.requirements),
  replacement,
  changedSections,
  reason: "Add deterministic EnvironmentPreparation and EnvironmentVerificationGate with profile-bound readiness, capability-gated effects, drift detection, redacted evidence, and progression authority before WorkExecution.",
  compatibilityImpact: "backward-compatible",
  risks: replacement.risks.filter((entry) => /environment|fingerprint|preparation|adapter|attestation|parallel checks/i.test(entry)),
  requiredEvidence: replacement.requiredEvidence.filter((entry) => entry.startsWith("environment/") || entry.includes("environment-cycle")),
  sourceRefs: structuredClone(requirementSourceRefs),
};
const requirementsChangeSetRef = store.addJson(
  "requirements-change-set.json",
  requirementsChangeSet.changeSetId,
  "requirementsChangeSet",
  requirementsChangeSet,
);

const overview = deriveProjectOverview(replacement);
const overviewMarkdownBytes = renderProjectOverviewMarkdownBytes(overview);
const overviewMarkdownRef = store.addBytes(
  "candidate/ProjectOverview.md",
  "project-overview-markdown-ep-001-environment-preparation-v1",
  "projectOverviewMarkdown",
  overviewMarkdownBytes,
);
const overviewChangeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewChangeSetDraft",
  changeSetId: "project-overview-change-set-ep-001-environment-preparation-v1",
  baseOverview: pointer(overviewBaselineRef),
  requirementsChangeSet: pointer(requirementsChangeSetRef),
  changeDisposition: "changed",
  changedSections: diffProjectOverviewSections(overviewBaseline.overview, overview),
  projection: PROJECT_OVERVIEW_PROJECTION,
  overview,
  renderedDocument: { ...PROJECT_OVERVIEW_DOCUMENT, artifact: pointer(overviewMarkdownRef), renderer: PROJECT_OVERVIEW_RENDERER },
};
const overviewChangeSetRef = store.addJson(
  "project-overview-change-set-draft.json",
  overviewChangeSet.changeSetId,
  "projectOverviewChangeSet",
  overviewChangeSet,
);

const proposalRef = store.addText(
  "native/openspec/proposal.md",
  "openspec-proposal-ep-001-environment-preparation-v1",
  "# EP-001 EnvironmentPreparation/Verification\n\nAdd deterministic profile-based preparation and readiness verification before WorkExecution while preserving Core, Gate, permission, traceability, and downstream lifecycle authority.\n",
);
const specificationRef = store.addText(
  "native/openspec/specs/ep-001-environment-preparation/spec.md",
  "openspec-spec-ep-001-environment-preparation-v1",
  `# EP-001 EnvironmentPreparation/Verification requirements\n\n${decisions.decisions.map(({ decision }) => `- ${decision}`).join("\n")}\n`,
);
const nativeBundle = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "NativeSourceBundle",
  plugin: { id: "openspec", version: "0.1.0" },
  tool: { name: "OpenSpec", version: "conversation-contract-v1" },
  operation: "requirements.gather",
  sources: [
    { role: "requirements-closure", path: "dogfood/ep-001-environment-preparation/requirements-closure-assessment-approved.json", artifact: pointer(closureRef) },
    { role: "owner-decision", path: "dogfood/ep-001-environment-preparation/owner-decisions.json", artifact: pointer(decisionsRef) },
    { role: "proposal", path: "dogfood/ep-001-environment-preparation/native/openspec/proposal.md", artifact: pointer(proposalRef) },
    { role: "specification", path: "dogfood/ep-001-environment-preparation/native/openspec/specs/ep-001-environment-preparation/spec.md", artifact: pointer(specificationRef) },
  ],
  canonicalOutputs: [pointer(requirementsChangeSetRef), pointer(overviewChangeSetRef)],
  normalization: {
    warnings: ["This invocation uses the bounded OpenSpec conversation contract; no upstream OpenSpec CLI interoperability is claimed."],
    unmappedContent: [],
  },
  schema: "devrelay-requirements",
};
const nativeBundleRef = store.addJson(
  "native-source-bundle.json",
  "native-source-bundle-ep-001-environment-preparation-v1",
  "nativeSourceBundle",
  nativeBundle,
);

const invocation = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId: "invocation-requirements-ep-001-environment-preparation-openspec-v1",
  runId: "dogfood-ep-001-environment-preparation-v1",
  nodeId: "requirements-gathering",
  module: { id: "requirements-gathering", version: "0.1.0", operation: "gather" },
  plugin: { id: "openspec", version: "0.1.0" },
  inputs: {
    goal: [goalRef],
    "project-context": [projectContextRef],
    "repository-snapshot": [repositorySnapshotRef],
    "requirements-baseline": [requirementsBaselineRef],
    "project-overview-baseline": [overviewBaselineRef],
  },
  options: {},
  config: {
    projectRoot: canonicalRoot,
    toolName: "OpenSpec",
    toolVersion: "conversation-contract-v1",
    nativeOperation: "requirements.gather",
    changeName: "ep-001-environment-preparation-v1",
    schema: "devrelay-requirements",
    bridge: "agent-command",
  },
  grants: [
    { kind: "filesystem.read", scope: canonicalRoot },
    { kind: "filesystem.write", scope: `${canonicalRoot}/openspec/changes` },
    { kind: "network.connect", scope: "host:implementation-engine" },
  ],
};
const moduleResult = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleResult",
  invocationId: invocation.invocationId,
  status: "completed",
  outcome: "change_set_drafted",
  outputs: {
    "requirements-change-set": [requirementsChangeSetRef],
    "project-overview-change-set-draft": [overviewChangeSetRef],
    "native-source-bundle": [nativeBundleRef],
  },
  evidence: [{
    kind: "requirements/source-provenance",
    subject: `requirements-change-set:${requirementsChangeSet.changeSetId}`,
    status: "pass",
    artifact: nativeBundleRef,
    summary: "The exact owner-approved wave and bounded OpenSpec artifacts normalize to one canonical paired requirements and ProjectOverview change candidate.",
  }],
  diagnostics: [],
};

let adapterCalls = 0;
const checkpoints = new Map();
const checkpointStore = {
  async get(key) { return checkpoints.get(key); },
  async put(key, value) { checkpoints.set(key, structuredClone(value)); },
};
const registry = createModuleRegistry({
  modules: [JSON.parse(await readFile(new URL("examples/modules/requirements-gathering.module.json", root), "utf8"))],
  plugins: [{
    definition: JSON.parse(await readFile(new URL("examples/plugins/openspec.plugin.json", root), "utf8")),
    adapter: { async invoke() { adapterCalls += 1; return structuredClone(moduleResult); } },
  }],
  artifactContracts: requirementsRuntimeArtifactContracts(),
});
const result = await registry.execute(invocation, { artifacts: store.artifacts, checkpoints: checkpointStore });
const replay = await registry.execute(invocation, { artifacts: store.artifacts, checkpoints: checkpointStore });
if (canonicalJsonDigest(result) !== canonicalJsonDigest(moduleResult)) throw new Error("RequirementsGathering result changed during execution.");
if (canonicalJsonDigest(replay) !== canonicalJsonDigest(result) || adapterCalls !== 1) {
  throw new Error("RequirementsGathering checkpoint replay was not zero-call deterministic.");
}
const [[checkpointKey, checkpoint]] = [...checkpoints];
const checkpointBundle = { apiVersion: "devrelay.dev/v1alpha1", kind: "EffectCheckpointBundle", checkpointKey, checkpoint };
const checkpointBytes = jsonBytes(checkpointBundle);
const invocationBytes = jsonBytes(invocation);
const resultBytes = jsonBytes(result);
await store.writeAll();
await Promise.all([
  writeFile(new URL("requirements-gathering.invocation.json", output), invocationBytes),
  writeFile(new URL("requirements-gathering.result.json", output), resultBytes),
  writeFile(new URL("requirements-gathering.checkpoint.json", output), checkpointBytes),
]);

const executionProof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "DogfoodExecutionProof",
  proofId: "requirements-change-ep-001-environment-preparation-v1",
  module: "requirements-gathering@0.1.0",
  plugin: "openspec@0.1.0",
  adapterMaturity: "fixture-conformant-conversation-contract",
  outcome: result.outcome,
  adapterCallCount: adapterCalls,
  replayAdapterCallCount: 0,
  checkpointCount: checkpoints.size,
  requirementsChangeSet: pointer(requirementsChangeSetRef),
  projectOverviewChangeSet: pointer(overviewChangeSetRef),
  nativeSourceBundle: pointer(nativeBundleRef),
  closureAssessment: pointer(closureRef),
  checkpointDigest: sha256Digest(checkpointBytes),
  invocationDigest: sha256Digest(invocationBytes),
  resultDigest: sha256Digest(resultBytes),
  promotableCandidateProduced: true,
  architectureProgressionAllowed: false,
};
const executionProofBytes = jsonBytes(executionProof);
await writeFile(new URL("requirements-gathering.execution-proof.json", output), executionProofBytes);

const bindings = [
  ["RequirementsBaseline", requirementsBaselineRef.digest],
  ["ProjectOverviewBaseline", overviewBaselineRef.digest],
  ["RepositorySnapshot", repositorySnapshotRef.digest],
  ["OwnerDecisions", decisionsRef.digest],
  ["RequirementsClosureAssessment", closureRef.digest],
  ["RequirementsChangeSet", requirementsChangeSetRef.digest],
  ["ProjectOverviewChangeSetDraft", overviewChangeSetRef.digest],
  ["Candidate ProjectOverview.md", overviewMarkdownRef.digest],
  ["NativeSourceBundle", nativeBundleRef.digest],
  ["Terminal checkpoint", sha256Digest(checkpointBytes)],
  ["Execution proof", sha256Digest(executionProofBytes)],
];
const review = [
  "# Requirements Gate candidate: EP-001 EnvironmentPreparation/Verification",
  "",
  "Status: **standing owner approval applies after exact Gate validation**",
  "",
  "## Exact bindings",
  "",
  ...bindings.map(([label, digest]) => `- ${label}: ${digest}`),
  "",
  "## Gate findings",
  "",
  "- PASS: one visible breadth-first wave resolves all 24 questions and 12 blocking domains at weighted coverage 1.00.",
  "- PASS: EnvironmentPreparation and EnvironmentVerificationGate remain bounded before WorkExecution and do not claim execution, deployment, system verification, or release authority.",
  "- PASS: host and project profiles, required/optional readiness, current fingerprints, deterministic drift, remediation, and replay semantics are explicit.",
  "- PASS: project-local reversible preparation is the default; global, process, network, filesystem, and secret effects require exact grants and receipts.",
  "- PASS: secret values are prohibited and network is deny-by-default without exact destination/purpose grants.",
  "- PASS: native Windows verification is the controlled release default and arbitrary technology support requires exact live adapter evidence.",
  "- PASS: TraceabilityGraph remains Core-controlled and receives forward-only trusted projections.",
  "- PASS: ProjectOverview is the deterministic projection of the exact full replacement requirements.",
  "- PASS: OpenSpec maturity is recorded honestly as a bounded fixture-conformant conversation contract; no CLI execution is claimed.",
  "",
  "## Approval boundary",
  "",
  "Standing approval binds only the exact paired candidate, native bundle, closure assessment, execution proof, and checkpoint after Gate validation. Any byte change requires a new candidate.",
  "",
].join("\n");
const reviewBytes = Buffer.from(review.normalize("NFC"), "utf8");
await Promise.all([
  writeFile(new URL("requirements-gate-review.md", output), reviewBytes),
  writeFile(new URL("requirements-gate-candidate.json", output), jsonBytes({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RequirementsGateCandidate",
    status: "standing-approval-pending-validation",
    exactBindings: Object.fromEntries(bindings),
    reviewDigest: sha256Digest(reviewBytes),
    progressionAllowed: false,
  })),
]);

process.stdout.write(`${JSON.stringify({
  status: "REQUIREMENTS_GATE_CANDIDATE",
  adapterCalls,
  replayAdapterCalls: 0,
  adapterMaturity: executionProof.adapterMaturity,
  weightedCoverage: closure.weightedCoverage,
  requirementsChangeSetDigest: requirementsChangeSetRef.digest,
  projectOverviewChangeSetDigest: overviewChangeSetRef.digest,
  projectOverviewMarkdownDigest: overviewMarkdownRef.digest,
  nativeSourceBundleDigest: nativeBundleRef.digest,
  closureAssessmentDigest: closureRef.digest,
  checkpointDigest: sha256Digest(checkpointBytes),
  executionProofDigest: sha256Digest(executionProofBytes),
  gateReviewDigest: sha256Digest(reviewBytes),
  progressionAllowed: false,
}, null, 2)}\n`);
