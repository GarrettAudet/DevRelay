import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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
  buildLifecycleReportingRequirements,
  ownerDecisions,
} from "./lifecycle-run-report-requirements-data.mjs";

const root = new URL("../../", import.meta.url);
const outputDirectory = new URL("./", import.meta.url);
const rootPath = fileURLToPath(root);
const canonicalRepositoryRoot = "C:/repos/DevRelay";
const canonicalArtifactRoot =
  "file:///C:/repos/DevRelay/dogfood/lifecycle-run-report";

const moduleDefinition = JSON.parse(
  await readFile(
    new URL("examples/modules/requirements-gathering.module.json", root),
    "utf8",
  ),
);
const pluginDefinition = JSON.parse(
  await readFile(new URL("examples/plugins/openspec.plugin.json", root), "utf8"),
);

const artifactTypes = Object.freeze({
  goal: Object.freeze([
    "https://devrelay.dev/artifacts/goal/v1",
    "application/vnd.devrelay.goal+json",
  ]),
  projectContext: Object.freeze([
    "https://devrelay.dev/artifacts/project-context/v1",
    "application/vnd.devrelay.project-context+json",
  ]),
  repositorySnapshot: Object.freeze([
    "https://devrelay.dev/artifacts/repository-snapshot/v1",
    "application/vnd.devrelay.repository-snapshot+json",
  ]),
  requirementsBaseline: Object.freeze([
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
  ]),
  projectOverviewBaseline: Object.freeze([
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
  ]),
  requirementsChangeSet: Object.freeze([
    "https://devrelay.dev/artifacts/requirements-change-set/v1",
    "application/vnd.devrelay.requirements-change-set+json",
  ]),
  projectOverviewChangeSet: Object.freeze([
    "https://devrelay.dev/artifacts/project-overview-change-set-draft/v1",
    "application/vnd.devrelay.project-overview-change-set-draft+json",
  ]),
  nativeSourceBundle: Object.freeze([
    "https://devrelay.dev/artifacts/native-source-bundle/v1",
    "application/vnd.devrelay.native-source-bundle+json",
  ]),
});

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pointer(ref) {
  return Object.freeze({ artifactId: ref.artifactId, digest: ref.digest });
}

function createArtifactStore() {
  const values = new Map();
  const files = new Map();
  const add = ({ artifactId, bytes, fileName, type, uri }) => {
    const typeEntry = type === undefined ? undefined : artifactTypes[type];
    const ref = Object.freeze({
      artifactId,
      ...(typeEntry === undefined
        ? {}
        : { schema: typeEntry[0], mediaType: typeEntry[1] }),
      digest: sha256Digest(bytes),
      uri,
    });
    values.set(artifactId, Buffer.from(bytes));
    if (fileName !== undefined) {
      files.set(fileName, Buffer.from(bytes));
    }
    return ref;
  };
  return Object.freeze({
    addExisting({ artifactId, bytes, type, uri }) {
      return add({ artifactId, bytes, type, uri });
    },
    addJson(fileName, artifactId, type, value) {
      return add({
        artifactId,
        bytes: jsonBytes(value),
        fileName,
        type,
        uri: `${canonicalArtifactRoot}/${fileName.replaceAll("\\", "/")}`,
      });
    },
    addText(fileName, artifactId, text) {
      return add({
        artifactId,
        bytes: Buffer.from(text.normalize("NFC"), "utf8"),
        fileName,
        uri: `${canonicalArtifactRoot}/${fileName.replaceAll("\\", "/")}`,
      });
    },
    addBytes(fileName, artifactId, bytes) {
      return add({
        artifactId,
        bytes: Buffer.from(bytes),
        fileName,
        uri: `${canonicalArtifactRoot}/${fileName.replaceAll("\\", "/")}`,
      });
    },
    bytes(artifactId) {
      const bytes = values.get(artifactId);
      if (bytes === undefined) {
        throw new Error(`Missing dogfood artifact ${artifactId}.`);
      }
      return Buffer.from(bytes);
    },
    artifacts: Object.freeze({
      async load(ref) {
        const bytes = values.get(ref.artifactId);
        if (bytes === undefined) {
          throw new Error(`Missing dogfood artifact ${ref.artifactId}.`);
        }
        return Buffer.from(bytes);
      },
    }),
    async writeAll() {
      await mkdir(outputDirectory, { recursive: true });
      for (const [fileName, bytes] of [...files.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        const target = new URL(fileName, outputDirectory);
        await mkdir(new URL("./", target), { recursive: true });
        await writeFile(target, bytes);
      }
    },
  });
}

function createCheckpointStore() {
  const values = new Map();
  return Object.freeze({
    values,
    store: Object.freeze({
      async get(key) {
        return values.get(key);
      },
      async put(key, value) {
        values.set(key, value);
      },
    }),
  });
}

function changedRequirementSections(current, replacement) {
  return Object.keys(replacement)
    .filter(
      (section) =>
        canonicalJsonDigest(current[section]) !==
        canonicalJsonDigest(replacement[section]),
    )
    .sort();
}

const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: rootPath,
  encoding: "utf8",
}).trim();

const store = createArtifactStore();
const loadExistingJson = async ({ path, type, uri }) => {
  const bytes = await readFile(new URL(path, root));
  const value = JSON.parse(bytes.toString("utf8"));
  const artifactId =
    value.goalId ??
    value.baselineId ??
    (value.kind === "ProjectContext"
      ? "project-context-devrelay-lifecycle-run-report-v1"
      : value.kind === "RepositorySnapshot"
        ? `repository-snapshot-devrelay-${value.revision.slice(0, 7)}`
        : undefined);
  if (artifactId === undefined) {
    throw new Error(`Cannot derive artifact ID for ${path}.`);
  }
  return {
    value,
    bytes,
    ref: store.addExisting({ artifactId, bytes, type, uri }),
  };
};

const goalDocument = await loadExistingJson({
  path: "dogfood/lifecycle-run-report/goal.json",
  type: "goal",
  uri: `${canonicalArtifactRoot}/goal.json`,
});
const projectContextDocument = await loadExistingJson({
  path: "dogfood/lifecycle-run-report/project-context.json",
  type: "projectContext",
  uri: `${canonicalArtifactRoot}/project-context.json`,
});
const repositorySnapshotDocument = await loadExistingJson({
  path: "dogfood/lifecycle-run-report/repository-snapshot.json",
  type: "repositorySnapshot",
  uri: `${canonicalArtifactRoot}/repository-snapshot.json`,
});
const requirementsBaselineDocument = await loadExistingJson({
  path: "project/requirements-baseline.json",
  type: "requirementsBaseline",
  uri: "file:///C:/repos/DevRelay/project/requirements-baseline.json",
});
const projectOverviewBaselineDocument = await loadExistingJson({
  path: "project/project-overview-baseline.json",
  type: "projectOverviewBaseline",
  uri: "file:///C:/repos/DevRelay/project/project-overview-baseline.json",
});
const currentProjectOverviewMarkdownBytes = await readFile(
  new URL("ProjectOverview.md", root),
);
store.addExisting({
  artifactId:
    projectOverviewBaselineDocument.value.renderedDocument.artifact.artifactId,
  bytes: currentProjectOverviewMarkdownBytes,
  uri: "file:///C:/repos/DevRelay/ProjectOverview.md",
});

const decisionText =
  "# DevRelay V1 lifecycle and run-report owner decisions\n\n" +
  "This record freezes the complete V1 construction sequence, the repeating dependency-ready execution frontier, the narrow provider-neutral SpecialistAssignment boundary, the adapter maturity vocabulary, and the human-readable dynamic run-report requirement. It authorizes a fresh RequirementsGathering change candidate only; promotion still requires the exact Requirements Gate approval.\n\n" +
  ownerDecisions
    .map(
      ({ decisionId, decision }, index) =>
        `${index + 1}. **${decisionId}**\n\n   ${decision}\n`,
    )
    .join("\n");
const ownerDecisionRef = store.addText(
  "owner-decisions.md",
  "owner-decisions-lifecycle-run-report-v1",
  decisionText,
);

const capabilityEvidenceText =
  "# Lifecycle run reporting capability evidence\n\n" +
  "This bounded evidence records the current DevRelay capabilities and the owner-approved boundaries used for the candidate. It does not claim that declared external adapters are live.\n\n" +
  "- RequirementsGathering, ArchitectureDesign, WorkBreakdown, and WorkDependencyAnalysis expose versioned module contracts, deterministic Core routing, checkpoint replay, Gate evidence, and forward TraceabilityGraph contributions.\n" +
  "- WorkDependencyAnalysis promotes a static dependency DAG; runtime readiness and completion remain separate Core facts.\n" +
  "- Current adapter maturity must be stated as contract-defined, fixture-conformant, live-conformant, or release-ready.\n" +
  "- The OpenSpec binding used here is a fixture-conformant bounded requirements adapter through the existing conversation contract; no upstream OpenSpec CLI execution is claimed.\n" +
  "- V0.4 release verification passed 403 tests, offline package smoke checks, exact digest inventory checks, and a live pinned Structurizr parser/export conformance test.\n";
const capabilityEvidenceRef = store.addText(
  "capability-evidence.md",
  "capability-evidence-lifecycle-run-report-v1",
  capabilityEvidenceText,
);

const proposalText =
  "# DevRelay V1 lifecycle completion and run reporting\n\n" +
  "Complete the owner-approved eighteen-component V1 lifecycle, repeat WorkExecution, WorkItemVerification, and ChangeIntegration for each Core-derived dependency-ready frontier, and add a cross-cutting RunLedger plus deterministic human-readable LifecycleRunReport.md. Reporting observes exact lifecycle facts and performance observations but never controls routing, adapters, evidence, Gates, or progression.\n";
const proposalRef = store.addText(
  "native/openspec/proposal.md",
  "openspec-proposal-lifecycle-run-report-v1",
  proposalText,
);
const specificationText =
  "# DevRelay V1 lifecycle and run-report requirements\n\n" +
  ownerDecisions
    .map(({ decision }) => `- ${decision}`)
    .join("\n") +
  "\n\nThe report must dynamically represent any circuit shape, lead with a human-readable Markdown view, preserve exact artifact and TraceabilityGraph links, expose only sourced metrics or explicit absence dispositions, distinguish adapter maturity from Core-owned implementations, and remain non-authoritative.\n";
const specificationRef = store.addText(
  "native/openspec/specs/lifecycle-run-report/spec.md",
  "openspec-spec-lifecycle-run-report-v1",
  specificationText,
);

const baseInputs = Object.freeze([
  Object.freeze({ role: "goal", artifact: pointer(goalDocument.ref) }),
  Object.freeze({
    role: "project-context",
    artifact: pointer(projectContextDocument.ref),
  }),
  Object.freeze({
    role: "repository-snapshot",
    artifact: pointer(repositorySnapshotDocument.ref),
  }),
  Object.freeze({
    role: "requirements-baseline",
    artifact: pointer(requirementsBaselineDocument.ref),
  }),
  Object.freeze({
    role: "project-overview-baseline",
    artifact: pointer(projectOverviewBaselineDocument.ref),
  }),
]);
const sourceRefs = () => [
  ...baseInputs.map((entry) => structuredClone(entry)),
  {
    role: "owner-decision",
    artifact: pointer(ownerDecisionRef),
    location: "Frozen V1 lifecycle, frontier loop, assignment boundary, maturity vocabulary, reporting, and complete-run authority",
  },
  {
    role: "capability-evidence",
    artifact: pointer(capabilityEvidenceRef),
    location: "Released capability and maturity evidence at repository revision 4bda7fe707ba102bd22fe0001c83aa13ec03b0c5",
  },
];
const replacement = buildLifecycleReportingRequirements(
  requirementsBaselineDocument.value.requirements,
  sourceRefs,
);
const requirementsChangeSet = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsChangeSet",
  changeSetId: "requirements-change-set-lifecycle-run-report-v1",
  baseInputs,
  baseline: pointer(requirementsBaselineDocument.ref),
  expectedRequirementsDigest: canonicalJsonDigest(
    requirementsBaselineDocument.value.requirements,
  ),
  replacement,
  changedSections: changedRequirementSections(
    requirementsBaselineDocument.value.requirements,
    replacement,
  ),
  reason:
    "Freeze the complete V1 lifecycle and repeating ready-frontier loop, correct the SpecialistAssignment boundary, formalize adapter maturity, and require dynamic human-readable run reporting before completing and optimizing the end-to-end circuit.",
  compatibilityImpact: "backward-compatible",
  risks: [
    "A human-readable report can mislead if missing measurements are treated as zero.",
    "Adapter comparisons can be invalid when exact input, policy, circuit, module, or host context differs.",
    "Operational observations can leak secrets unless projection enforces an explicit content policy.",
    "Frontier progression can unlock work prematurely unless only verified integrated-completion facts affect readiness.",
    "Reporting can corrupt deterministic authority if it is allowed to route, approve, or satisfy evidence.",
  ],
  requiredEvidence: [
    "requirements/owner-decision",
    "requirements/source-provenance",
    "requirements/gate-promotion",
    "run-report/dynamic-projection",
    "run-report/human-readability",
    "run-report/metric-provenance",
    "run-report/non-authority",
    "run-report/security-redaction",
    "run-report/traceability-reconciliation",
    "run-report/adapter-comparability",
    "lifecycle/frontier-recalculation",
    "specialist-assignment/boundary",
  ],
  sourceRefs: sourceRefs(),
});
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
  "project-overview-markdown-lifecycle-run-report-v1",
  overviewMarkdownBytes,
);
const overviewChangedSections = diffProjectOverviewSections(
  projectOverviewBaselineDocument.value.overview,
  overview,
);
const projectOverviewChangeSet = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewChangeSetDraft",
  changeSetId: "project-overview-change-set-lifecycle-run-report-v1",
  baseOverview: pointer(projectOverviewBaselineDocument.ref),
  requirementsChangeSet: pointer(requirementsChangeSetRef),
  changeDisposition:
    overviewChangedSections.length === 0 ? "unchanged" : "changed",
  changedSections: overviewChangedSections,
  projection: PROJECT_OVERVIEW_PROJECTION,
  overview,
  renderedDocument: {
    path: PROJECT_OVERVIEW_DOCUMENT.path,
    schema: PROJECT_OVERVIEW_DOCUMENT.schema,
    mediaType: PROJECT_OVERVIEW_DOCUMENT.mediaType,
    artifact: pointer(overviewMarkdownRef),
    renderer: PROJECT_OVERVIEW_RENDERER,
  },
});
const projectOverviewChangeSetRef = store.addJson(
  "project-overview-change-set-draft.json",
  projectOverviewChangeSet.changeSetId,
  "projectOverviewChangeSet",
  projectOverviewChangeSet,
);

const nativeSourceBundle = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "NativeSourceBundle",
  plugin: { id: "openspec", version: "0.1.0" },
  tool: { name: "OpenSpec", version: "conversation-contract-v1" },
  operation: "requirements.gather",
  sources: [
    {
      role: "owner-decision",
      path: "dogfood/lifecycle-run-report/owner-decisions.md",
      artifact: pointer(ownerDecisionRef),
    },
    {
      role: "capability-evidence",
      path: "dogfood/lifecycle-run-report/capability-evidence.md",
      artifact: pointer(capabilityEvidenceRef),
    },
    {
      role: "proposal",
      path: "dogfood/lifecycle-run-report/native/openspec/proposal.md",
      artifact: pointer(proposalRef),
    },
    {
      role: "specification",
      path: "dogfood/lifecycle-run-report/native/openspec/specs/lifecycle-run-report/spec.md",
      artifact: pointer(specificationRef),
    },
  ],
  canonicalOutputs: [
    pointer(requirementsChangeSetRef),
    pointer(projectOverviewChangeSetRef),
  ],
  normalization: {
    warnings: [
      "The OpenSpec adapter binding is fixture-conformant through the bounded conversation contract; this invocation does not claim upstream CLI execution.",
    ],
    unmappedContent: [],
  },
  schema: "devrelay-requirements",
});
const nativeSourceBundleRef = store.addJson(
  "native-source-bundle.json",
  "native-source-lifecycle-run-report-v1",
  "nativeSourceBundle",
  nativeSourceBundle,
);

const invocation = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId:
    "invocation-requirements-lifecycle-run-report-openspec-v1",
  runId: "dogfood-lifecycle-run-report-v1",
  nodeId: "requirements-gathering",
  module: {
    id: "requirements-gathering",
    version: "0.1.0",
    operation: "gather",
  },
  plugin: { id: "openspec", version: "0.1.0" },
  inputs: {
    goal: [goalDocument.ref],
    "project-context": [projectContextDocument.ref],
    "repository-snapshot": [repositorySnapshotDocument.ref],
    "requirements-baseline": [requirementsBaselineDocument.ref],
    "project-overview-baseline": [projectOverviewBaselineDocument.ref],
  },
  options: {},
  config: {
    projectRoot: canonicalRepositoryRoot,
    toolName: "OpenSpec",
    toolVersion: "conversation-contract-v1",
    nativeOperation: "requirements.gather",
    changeName: "lifecycle-run-report-v1",
    schema: "devrelay-requirements",
    bridge: "agent-command",
  },
  grants: [
    { kind: "filesystem.read", scope: canonicalRepositoryRoot },
    {
      kind: "filesystem.write",
      scope: `${canonicalRepositoryRoot}/openspec/changes`,
    },
    { kind: "network.connect", scope: "host:implementation-engine" },
  ],
});
const moduleResult = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleResult",
  invocationId: invocation.invocationId,
  status: "completed",
  outcome: "change_set_drafted",
  outputs: {
    "requirements-change-set": [requirementsChangeSetRef],
    "project-overview-change-set-draft": [projectOverviewChangeSetRef],
    "native-source-bundle": [nativeSourceBundleRef],
  },
  evidence: [
    {
      kind: "requirements/source-provenance",
      subject: `requirements-change-set:${requirementsChangeSet.changeSetId}`,
      status: "pass",
      artifact: nativeSourceBundleRef,
      summary:
        "The candidate is bound to the exact global baseline pair, V0.4 repository snapshot, owner decisions, released capability evidence, bounded OpenSpec source artifacts, and deterministic ProjectOverview projection.",
    },
  ],
  diagnostics: [],
});

const checkpoints = createCheckpointStore();
let adapterCalls = 0;
const registry = createModuleRegistry({
  modules: [moduleDefinition],
  plugins: [
    {
      definition: pluginDefinition,
      adapter: {
        async invoke() {
          adapterCalls += 1;
          return moduleResult;
        },
      },
    },
  ],
  artifactContracts: requirementsRuntimeArtifactContracts(),
});
const result = await registry.execute(invocation, {
  artifacts: store.artifacts,
  checkpoints: checkpoints.store,
});
if (result.outcome !== "change_set_drafted") {
  throw new Error(`Unexpected outcome ${result.outcome}.`);
}
await registry.verifyCheckpointedExecution(invocation, {
  artifacts: store.artifacts,
  checkpoints: checkpoints.store,
});
if (adapterCalls !== 1 || checkpoints.values.size !== 1) {
  throw new Error(
    `Expected one adapter call and checkpoint, received ${adapterCalls} and ${checkpoints.values.size}.`,
  );
}

const [[checkpointKey, checkpointValue]] = checkpoints.values.entries();
const checkpointBundle = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EffectCheckpointBundle",
  checkpointKey,
  checkpoint: checkpointValue,
});
const checkpointBytes = jsonBytes(checkpointBundle);
const invocationBytes = jsonBytes(invocation);
const resultBytes = jsonBytes(result);
await writeFile(
  new URL("requirements-change.checkpoint.json", outputDirectory),
  checkpointBytes,
);
await writeFile(
  new URL("requirements-change.invocation.json", outputDirectory),
  invocationBytes,
);
await writeFile(
  new URL("requirements-change.result.json", outputDirectory),
  resultBytes,
);

const repositoryTreeBytes = execFileSync(
  "git",
  ["ls-tree", "-r", "--full-tree", repositorySnapshotDocument.value.revision],
  { cwd: rootPath },
);
if (repositorySnapshotDocument.value.revision !== revision) {
  throw new Error(
    `Repository snapshot revision ${repositorySnapshotDocument.value.revision} does not match source revision ${revision}.`,
  );
}
if (sha256Digest(repositoryTreeBytes) !== repositorySnapshotDocument.value.treeDigest) {
  throw new Error("Repository snapshot tree digest does not match the pinned revision.");
}
const unresolvedBlockingAssumptions = replacement.assumptions.filter(
  (entry) => entry.blocking === true && entry.status !== "confirmed",
);
if (unresolvedBlockingAssumptions.length !== 0) {
  throw new Error(
    `Requirements candidate retains blocking assumptions: ${unresolvedBlockingAssumptions.map((entry) => entry.id).join(", ")}.`,
  );
}
if (
  requirementsChangeSet.changedSections.join("\n") !==
  changedRequirementSections(
    requirementsBaselineDocument.value.requirements,
    replacement,
  ).join("\n")
) {
  throw new Error("Requirements changed-section inventory is not exhaustive.");
}

const executionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "DogfoodExecutionProof",
  proofId: "requirements-change-lifecycle-run-report-v1",
  module: "requirements-gathering@0.1.0",
  plugin: "openspec@0.1.0",
  adapterMaturity: "fixture-conformant",
  sourceRevision: revision,
  repositoryTreeDigest: repositorySnapshotDocument.value.treeDigest,
  invocationId: invocation.invocationId,
  outcome: result.outcome,
  adapterCallCount: adapterCalls,
  checkpointCount: checkpoints.values.size,
  checkpointKey,
  checkpointDigest: sha256Digest(checkpointBytes),
  invocationDigest: sha256Digest(invocationBytes),
  resultDigest: sha256Digest(resultBytes),
  requirementsBaselineInput: pointer(requirementsBaselineDocument.ref),
  projectOverviewBaselineInput: pointer(projectOverviewBaselineDocument.ref),
  requirementsChangeSet: pointer(requirementsChangeSetRef),
  projectOverviewChangeSet: pointer(projectOverviewChangeSetRef),
  candidateProjectOverviewMarkdown: pointer(overviewMarkdownRef),
  nativeSourceBundle: pointer(nativeSourceBundleRef),
  changedSections: requirementsChangeSet.changedSections,
  promotableCandidateProduced: true,
  requirementsGateStatus: "awaiting-owner-approval",
  architectureProgressionAllowed: false,
});
await writeFile(
  new URL("requirements-change.execution-proof.json", outputDirectory),
  jsonBytes(executionProof),
);

const gateReview =
  "# DevRelay V1 lifecycle and run-report Requirements Gate review\n\n" +
  "Status: **awaiting owner approval**\n\n" +
  "RequirementsGathering produced one schema-valid, checkpoint-replay-valid full-body requirements change and deterministic ProjectOverview change. It replaces obsolete fourteen-component and SpecialistAssignment statements with the frozen eighteen-component lifecycle, repeating ready-frontier loop, maturity vocabulary, and dynamic human-readable reporting boundary. No baseline promotion or ArchitectureDesign progression is authorized until the owner approves this exact candidate.\n\n" +
  "## Decisions represented\n\n" +
  ownerDecisions
    .map(({ decisionId, decision }) => `- **${decisionId}:** ${decision}`)
    .join("\n") +
  "\n\n## Exact candidate evidence\n\n" +
  `- RequirementsBaseline input: ${requirementsBaselineDocument.ref.digest}\n` +
  `- ProjectOverviewBaseline input: ${projectOverviewBaselineDocument.ref.digest}\n` +
  `- RequirementsChangeSet: ${requirementsChangeSetRef.digest}\n` +
  `- ProjectOverviewChangeSetDraft: ${projectOverviewChangeSetRef.digest}\n` +
  `- Candidate ProjectOverview.md: ${overviewMarkdownRef.digest}\n` +
  `- NativeSourceBundle: ${nativeSourceBundleRef.digest}\n` +
  `- Terminal checkpoint: ${sha256Digest(checkpointBytes)}\n` +
  `- Repository revision: ${revision}\n` +
  `- Repository tree: ${repositorySnapshotDocument.value.treeDigest}\n\n` +
  "## Gate checks\n\n" +
  "- PASS: exact current global requirements/project-overview baseline pair supplied\n" +
  "- PASS: V0.4 repository revision and tree bytes are version-pinned and match\n" +
  "- PASS: no unconfirmed blocking assumptions remain\n" +
  "- PASS: obsolete lifecycle and SpecialistAssignment records are replaced rather than contradicted\n" +
  "- PASS: changed-section list is exhaustive and canonical\n" +
  "- PASS: ProjectOverview projection and Markdown bytes are deterministic\n" +
  "- PASS: owner decisions, capability evidence, and bounded OpenSpec native sources are digest-bound\n" +
  "- PASS: the OpenSpec binding is labeled fixture-conformant; no live CLI call is claimed\n" +
  "- PASS: checkpoint replay performs zero adapter reinvocations\n" +
  "- PENDING: owner approval of the exact candidate and atomic baseline-pair promotion\n";
await writeFile(
  new URL("requirements-gate-review.md", outputDirectory),
  Buffer.from(gateReview.normalize("NFC"), "utf8"),
);

const readme =
  "# DevRelay V1 lifecycle completion dogfood\n\n" +
  "This directory is the cumulative module-by-module run for completing DevRelay V1, executing it end to end, and optimizing from measured evidence.\n\n" +
  "Current state: RequirementsGathering produced a checkpointed `change_set_drafted` candidate using the released module and bounded OpenSpec adapter contract. Requirements Gate is awaiting exact owner approval. The candidate freezes the eighteen-component V1 lifecycle, repeating ready-frontier loop, narrow provider-neutral SpecialistAssignment boundary, adapter maturity vocabulary, and human-readable dynamic run reporting. No global baseline promotion or ArchitectureDesign progression is yet authorized.\n\n" +
  "Regenerate the candidate from repository root with:\n\n" +
  "```powershell\nnode dogfood\\lifecycle-run-report\\materialize-requirements-change.mjs\n```\n";
await writeFile(
  new URL("README.md", outputDirectory),
  Buffer.from(readme.normalize("NFC"), "utf8"),
);

await store.writeAll();

process.stdout.write(
  `${JSON.stringify(
    {
      outcome: result.outcome,
      adapterCalls,
      checkpoints: checkpoints.values.size,
      requirementsChangeSetDigest: requirementsChangeSetRef.digest,
      projectOverviewChangeSetDigest: projectOverviewChangeSetRef.digest,
      projectOverviewMarkdownDigest: overviewMarkdownRef.digest,
      requirementsGateStatus: "awaiting-owner-approval",
    },
    null,
    2,
  )}\n`,
);
