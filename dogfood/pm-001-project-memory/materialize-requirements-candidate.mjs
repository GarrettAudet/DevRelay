import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  canonicalJsonDigest,
  sha256Digest,
} from "../../src/content-digest.mjs";
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
import {
  buildProjectMemoryRequirements,
  ownerDecisions,
} from "./pm-001-project-memory-approved-data.mjs";

const root = new URL("../../", import.meta.url);
const output = new URL("./", import.meta.url);
const canonicalRoot = "C:/repos/DevRelay";
const artifactRoot = "file:///C:/repos/DevRelay/dogfood/pm-001-project-memory";
const jsonBytes = (value) =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
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
    const ref = Object.freeze({
      artifactId,
      ...(schema === undefined ? {} : { schema, mediaType }),
      digest: sha256Digest(bytes),
      uri,
    });
    values.set(artifactId, Buffer.from(bytes));
    if (fileName !== undefined) files.set(fileName, Buffer.from(bytes));
    return ref;
  };
  return {
    addJson(fileName, artifactId, type, value) {
      return add({
        artifactId,
        bytes: jsonBytes(value),
        type,
        fileName,
        uri: `${artifactRoot}/${fileName.replaceAll("\\", "/")}`,
      });
    },
    addText(fileName, artifactId, text) {
      return add({
        artifactId,
        bytes: Buffer.from(text.normalize("NFC"), "utf8"),
        fileName,
        uri: `${artifactRoot}/${fileName.replaceAll("\\", "/")}`,
      });
    },
    addBytes(fileName, artifactId, type, bytes) {
      return add({
        artifactId,
        bytes: Buffer.from(bytes),
        type,
        fileName,
        uri: `${artifactRoot}/${fileName.replaceAll("\\", "/")}`,
      });
    },
    addExisting({ artifactId, bytes, type, uri }) {
      return add({ artifactId, bytes, type, uri });
    },
    artifacts: {
      async load(ref) {
        const bytes = values.get(ref.artifactId);
        if (bytes === undefined) throw new Error(`Missing artifact ${ref.artifactId}.`);
        return Buffer.from(bytes);
      },
    },
    async writeAll() {
      for (const [fileName, bytes] of [...files].sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        const target = new URL(fileName, output);
        await mkdir(new URL("./", target), { recursive: true });
        await writeFile(target, bytes);
      }
    },
  };
}

const store = createStore();
const requirementsBaselineBytes = await readFile(
  new URL("project/requirements-baseline.json", root),
);
const requirementsBaseline = JSON.parse(requirementsBaselineBytes);
const requirementsBaselineRef = store.addExisting({
  artifactId: requirementsBaseline.baselineId,
  bytes: requirementsBaselineBytes,
  type: "requirementsBaseline",
  uri: "file:///C:/repos/DevRelay/project/requirements-baseline.json",
});
const overviewBaselineBytes = await readFile(
  new URL("project/project-overview-baseline.json", root),
);
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
store.addExisting({
  artifactId: overviewBaseline.renderedDocument.artifact.artifactId,
  bytes: await readFile(new URL("ProjectOverview.md", root)),
  type: "projectOverviewMarkdown",
  uri: "file:///C:/repos/DevRelay/ProjectOverview.md",
});

const goal = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-devrelay-pm-001-project-memory-v1",
  statement:
    "Add authoritative project and session memory so every DevRelay task begins from accurate approved context and every completed frontier or task concludes through an explicit traceable memory delta and resumable synopsis.",
  objectives: [
    "Load ProjectMemory before every configured DevRelay task.",
    "Use a local bounded Mem0 adapter for relevant retrieval without provider authority.",
    "Ground memory in approved TraceabilityGraph paths and exact source artifacts.",
    "Require explicit add, replace, supersede, retain, and reject review after each completed frontier and terminal task.",
    "Provide /conclude, CurrentSynopsis.md, worker handoff receipts, crash recovery, and fresh-task resume through ChatGPT/Codex Desktop on Windows.",
  ],
  constraints: [
    "ProjectMemoryBaseline and ProjectMemoryGate remain authoritative.",
    "Modules, workers, models, Mem0, and adapters cannot mutate project memory or TraceabilityGraph directly.",
    "Cross-domain deltas must pass through the owning lifecycle module and Gate.",
    "Inaccurate or unverifiable memory blocks execution.",
    "External memory, model, or embedding transmission is opt-in only.",
  ],
  acceptanceCriteria: [
    "A fresh task cannot execute until exact project memory and graph context verify.",
    "Every completed worker and main task produces a verified ConcludeReceipt.",
    "Mem0 retrieval is local, version-pinned, source-linked, receipt-bound, and replayable.",
    "CurrentSynopsis.md is a deterministic complete-coverage projection of approved ProjectMemory.",
    "An installed Windows Desktop dogfood concludes work and resumes it accurately in a fresh task.",
  ],
  assumptions: [
    "The owner approved all decisions in the two PM-001 clarification waves.",
    "The RM-001 release-ready commit is the immutable PM-001 source baseline.",
    "ChatGPT/Codex Desktop on Windows is the release-defining interactive host.",
  ],
};
const goalRef = store.addJson("goal.json", goal.goalId, "goal", goal);

const projectContext = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary:
    "DevRelay is a release-ready deterministic Windows source/library preview with mandatory roadmap and session bootstrap. PM-001 adds authoritative project memory, traceability-aware retrieval, and conclusion-driven continuity without changing lifecycle authority.",
  stakeholders: [
    "DevRelay owner and maintainer",
    "ChatGPT/Codex Desktop users on Windows",
    "Module, adapter, pack, host, and worker authors",
    "Open-source contributors and reviewers",
  ],
  domainConstraints: [
    "Every authoritative baseline retains its existing Module and Gate owner.",
    "TraceabilityGraph remains cross-cutting and Core-controlled.",
    "RoadmapManagement and DevRelaySessionBootstrap remain active mandatory context.",
    "ProjectMemory is source-preserving, provider-neutral, and content addressed.",
    "Mem0 remains bounded, locally configured, replaceable, and proposer-only.",
  ],
  conventions: [
    "Ask clarification questions in breadth-first waves until deterministic closure.",
    "Present qualitative deltas explicitly before promotion.",
    "Keep handoff projections concise while preserving exact source references.",
    "Use checkpoints and zero-call replay for effects and provider retrieval.",
  ],
  sourceRefs: [],
};
const projectContextRef = store.addJson(
  "project-context.json",
  "project-context-devrelay-pm-001-project-memory-v1",
  "projectContext",
  projectContext,
);

const repositorySnapshot = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RepositorySnapshot",
  repository: canonicalRoot,
  revision: "a18e6fbfac4f8e3088b349dd2c018efcc5dc0bc1",
  treeDigest: "sha256:e449ee8152cfeb20b655784ab2227efdca71a97afbc334c0452a23e7572a1a08",
  includedPaths: [
    "AGENTS.md", "CHANGELOG.md", "CONTRIBUTING.md", "README.md", "RELEASE.md", "SECURITY.md",
    "contracts/**", "docs/**", "dogfood/**", "examples/**", "openspec/**", "project/**", "release/**", "scripts/**", "src/**", "test/**", "package-lock.json", "package.json",
  ],
  excludedPaths: [".git/**", "node_modules/**"],
};
const repositorySnapshotRef = store.addJson(
  "repository-snapshot.json",
  "repository-snapshot-devrelay-a18e6fb-pm-001",
  "repositorySnapshot",
  repositorySnapshot,
);

const decisionMarkdown = [
  "# PM-001 ProjectMemory owner decisions",
  "",
  "All decisions were resolved through two breadth-first RequirementsGathering clarification waves. A completed wave means a completed parallel execution frontier. The owner must approve or reject the exact qualitative delta before activation.",
  "",
  ...ownerDecisions.flatMap(({ questionId, decision }, index) => [
    `${index + 1}. **${questionId}**`,
    "",
    `   ${decision}`,
    "",
  ]),
].join("\n");
const decisionRef = store.addText(
  "owner-decisions.md",
  "owner-decisions-pm-001-project-memory-v1",
  decisionMarkdown,
);

const closureAssessment = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsClosureAssessment",
  assessmentId: "requirements-closure-pm-001-project-memory-v1",
  subject: pointer(goalRef),
  strategyChain: ["explore", "challenge", "clarify", "validate"],
  interviewWaves: 2,
  weightedCoverage: 1,
  minimumCoverage: 0.99,
  blockingUnknowns: [],
  contradictions: [],
  resolvedDecisionIds: ownerDecisions.map(({ questionId }) => questionId),
  outcome: "closed",
};
const closureRef = store.addJson(
  "requirements-closure-assessment.json",
  closureAssessment.assessmentId,
  undefined,
  closureAssessment,
);

const requirementSourceRefs = [
  { role: "goal", artifact: pointer(goalRef) },
  { role: "owner-decision", artifact: pointer(decisionRef), location: "All PM-001 decisions approved across clarification waves 1 and 2" },
  { role: "requirements-closure", artifact: pointer(closureRef) },
  { role: "project-context", artifact: pointer(projectContextRef) },
  { role: "repository-snapshot", artifact: pointer(repositorySnapshotRef) },
  { role: "requirements-baseline", artifact: pointer(requirementsBaselineRef) },
  { role: "project-overview-baseline", artifact: pointer(overviewBaselineRef) },
];
const replacement = buildProjectMemoryRequirements(
  requirementsBaseline.requirements,
  requirementSourceRefs,
);
const changedSections = Object.keys(replacement)
  .filter(
    (key) =>
      canonicalJsonDigest(replacement[key]) !==
      canonicalJsonDigest(requirementsBaseline.requirements[key]),
  )
  .sort();
const requirementsChangeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsChangeSet",
  changeSetId: "requirements-change-set-pm-001-project-memory-v1",
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
  reason:
    "Add authoritative ProjectMemory, bounded local Mem0 retrieval, trusted traceability projections, explicit qualitative-delta approval, and receipt-bound session conclusion and resume.",
  compatibilityImpact: "backward-compatible",
  risks: replacement.risks.filter((entry) => entry.includes("memory") || entry.includes("Mem0") || entry.includes("worker") || entry.includes("Desktop")),
  requiredEvidence: replacement.requiredEvidence.filter((entry) => entry.startsWith("memory/") || entry.includes("project-memory")),
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
  "project-overview-markdown-pm-001-project-memory-v1",
  "projectOverviewMarkdown",
  overviewMarkdownBytes,
);
const overviewChangeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewChangeSetDraft",
  changeSetId: "project-overview-change-set-pm-001-project-memory-v1",
  baseOverview: pointer(overviewBaselineRef),
  requirementsChangeSet: pointer(requirementsChangeSetRef),
  changeDisposition: "changed",
  changedSections: diffProjectOverviewSections(overviewBaseline.overview, overview),
  projection: PROJECT_OVERVIEW_PROJECTION,
  overview,
  renderedDocument: {
    ...PROJECT_OVERVIEW_DOCUMENT,
    artifact: pointer(overviewMarkdownRef),
    renderer: PROJECT_OVERVIEW_RENDERER,
  },
};
const overviewChangeSetRef = store.addJson(
  "project-overview-change-set-draft.json",
  overviewChangeSet.changeSetId,
  "projectOverviewChangeSet",
  overviewChangeSet,
);

const proposalRef = store.addText(
  "native/openspec/proposal.md",
  "openspec-proposal-pm-001-project-memory-v1",
  "# PM-001 ProjectMemory\n\nAdd authoritative project and session memory, a bounded local Mem0 retrieval adapter, trusted traceability context, and explicit conclusion-driven handoffs without transferring authority from DevRelay Core or existing Gates.\n",
);
const specificationRef = store.addText(
  "native/openspec/specs/pm-001-project-memory/spec.md",
  "openspec-spec-pm-001-project-memory-v1",
  `# PM-001 ProjectMemory requirements\n\n${ownerDecisions.map(({ decision }) => `- ${decision}`).join("\n")}\n`,
);
const nativeBundle = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "NativeSourceBundle",
  plugin: { id: "openspec", version: "0.1.0" },
  tool: { name: "OpenSpec", version: "conversation-contract-v1" },
  operation: "requirements.gather",
  sources: [
    { role: "requirements-closure", path: "dogfood/pm-001-project-memory/requirements-closure-assessment.json", artifact: pointer(closureRef) },
    { role: "owner-decision", path: "dogfood/pm-001-project-memory/owner-decisions.md", artifact: pointer(decisionRef) },
    { role: "proposal", path: "dogfood/pm-001-project-memory/native/openspec/proposal.md", artifact: pointer(proposalRef) },
    { role: "specification", path: "dogfood/pm-001-project-memory/native/openspec/specs/pm-001-project-memory/spec.md", artifact: pointer(specificationRef) },
  ],
  canonicalOutputs: [pointer(requirementsChangeSetRef), pointer(overviewChangeSetRef)],
  normalization: {
    warnings: [
      "This RequirementsGathering invocation uses the bounded OpenSpec conversation contract; PM-001 implementation acceptance separately requires live local Mem0 provider attestation.",
    ],
    unmappedContent: [],
  },
  schema: "devrelay-requirements",
};
const nativeBundleRef = store.addJson(
  "native-source-bundle.json",
  "native-source-bundle-pm-001-project-memory-v1",
  "nativeSourceBundle",
  nativeBundle,
);

const invocation = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId: "invocation-requirements-pm-001-project-memory-openspec-v1",
  runId: "dogfood-pm-001-project-memory-v1",
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
    changeName: "pm-001-project-memory-module-v1",
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
  evidence: [
    {
      kind: "requirements/source-provenance",
      subject: `requirements-change-set:${requirementsChangeSet.changeSetId}`,
      status: "pass",
      artifact: nativeBundleRef,
      summary:
        "The exact two-wave owner decisions and bounded OpenSpec artifacts normalize to one canonical paired requirements and ProjectOverview change candidate.",
    },
  ],
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
const result = await registry.execute(invocation, {
  artifacts: store.artifacts,
  checkpoints: checkpointStore,
});
const replay = await registry.execute(invocation, {
  artifacts: store.artifacts,
  checkpoints: checkpointStore,
});
if (canonicalJsonDigest(result) !== canonicalJsonDigest(moduleResult)) {
  throw new Error("RequirementsGathering result changed during execution.");
}
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
  proofId: "requirements-change-pm-001-project-memory-v1",
  module: "requirements-gathering@0.1.0",
  plugin: "openspec@0.1.0",
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
await writeFile(
  new URL("requirements-gathering.execution-proof.json", output),
  executionProofBytes,
);

const bindings = [
  ["RequirementsBaseline", requirementsBaselineRef.digest],
  ["ProjectOverviewBaseline", overviewBaselineRef.digest],
  ["RepositorySnapshot", repositorySnapshotRef.digest],
  ["OwnerDecisions", decisionRef.digest],
  ["RequirementsClosureAssessment", closureRef.digest],
  ["RequirementsChangeSet", requirementsChangeSetRef.digest],
  ["ProjectOverviewChangeSetDraft", overviewChangeSetRef.digest],
  ["Candidate ProjectOverview.md", overviewMarkdownRef.digest],
  ["NativeSourceBundle", nativeBundleRef.digest],
  ["Terminal checkpoint", sha256Digest(checkpointBytes)],
  ["Execution proof", sha256Digest(executionProofBytes)],
];
const review = [
  "# Requirements Gate candidate: PM-001 ProjectMemory",
  "",
  "Status: **awaiting owner approval**",
  "",
  "## Exact bindings",
  "",
  ...bindings.map(([label, digest]) => `- ${label}: ${digest}`),
  "",
  "## Gate findings",
  "",
  "- PASS: two visible breadth-first clarification waves close all 28 normalized decisions at 1.00 weighted coverage.",
  "- PASS: ProjectMemoryBaseline and ProjectMemoryGate remain authoritative; Mem0 is local, version-pinned, derived, bounded, and proposer-only.",
  "- PASS: task bootstrap, authority-before-recency, accurate native recovery, open-session handling, and deterministic retrieval receipts are explicit.",
  "- PASS: /conclude governs worker, frontier, and main-task closeout with exact delta review, cross-domain routing, CurrentSynopsis.md, and ConcludeReceipt.",
  "- PASS: TraceabilityGraph remains authoritative and supplies only trusted checkpoint-bound read projections to ProjectMemory and Mem0.",
  "- PASS: no memory operation can bypass RequirementsGate, ArchitectureGate, ContractGate, RoadmapGate, or another authoritative domain Gate.",
  "- PASS: the exact installed-package ChatGPT/Codex Desktop Windows acceptance path is mandatory.",
  "- PASS: ProjectOverview is a deterministic projection of the exact replacement requirements.",
  "",
  "## Approval boundary",
  "",
  "Approval binds only this exact paired requirements and ProjectOverview candidate, native bundle, closure assessment, execution proof, and terminal checkpoint. Any modification requires a new candidate.",
  "",
].join("\n");
const reviewBytes = Buffer.from(review.normalize("NFC"), "utf8");
await Promise.all([
  writeFile(new URL("requirements-gate-review.md", output), reviewBytes),
  writeFile(
    new URL("requirements-gate-candidate.json", output),
    jsonBytes({
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "RequirementsGateCandidate",
      status: "awaiting-approval",
      exactBindings: Object.fromEntries(bindings),
      reviewDigest: sha256Digest(reviewBytes),
      progressionAllowed: false,
    }),
  ),
]);

process.stdout.write(`${JSON.stringify({
  status: "REQUIREMENTS_GATE_CANDIDATE",
  adapterCalls,
  replayAdapterCalls: 0,
  weightedCoverage: closureAssessment.weightedCoverage,
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
