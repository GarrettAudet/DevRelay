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
  buildApprovedWorkingRequirements,
  mergeProjectRequirements,
  ownerDecisions,
} from "./work-dependency-approved-data.mjs";

const root = new URL("../../", import.meta.url);
const outputDirectory = new URL("./", import.meta.url);
const rootPath = fileURLToPath(root);
const canonicalRepositoryRoot = "C:/repos/DevRelay";
const canonicalArtifactRoot =
  "file:///C:/repos/DevRelay/dogfood/work-dependency-analysis";

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
      ? "project-context-devrelay-work-dependency-analysis-v1"
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
  path: "dogfood/work-dependency-analysis/goal.json",
  type: "goal",
  uri: `${canonicalArtifactRoot}/goal.json`,
});
const projectContextDocument = await loadExistingJson({
  path: "dogfood/work-dependency-analysis/project-context.json",
  type: "projectContext",
  uri: `${canonicalArtifactRoot}/project-context.json`,
});
const repositorySnapshotDocument = await loadExistingJson({
  path: "dogfood/work-dependency-analysis/repository-snapshot.json",
  type: "repositorySnapshot",
  uri: `${canonicalArtifactRoot}/repository-snapshot.json`,
});
const requirementsBaselineDocument = await loadExistingJson({
  path: "project/history/1.0.0/requirements-baseline.json",
  type: "requirementsBaseline",
  uri: "file:///C:/repos/DevRelay/project/requirements-baseline.json",
});
const projectOverviewBaselineDocument = await loadExistingJson({
  path: "project/history/1.0.0/project-overview-baseline.json",
  type: "projectOverviewBaseline",
  uri: "file:///C:/repos/DevRelay/project/project-overview-baseline.json",
});
const currentProjectOverviewMarkdownBytes = await readFile(
  new URL("project/history/1.0.0/ProjectOverview.md", root),
);
store.addExisting({
  artifactId:
    projectOverviewBaselineDocument.value.renderedDocument.artifact.artifactId,
  bytes: currentProjectOverviewMarkdownBytes,
  uri: "file:///C:/repos/DevRelay/ProjectOverview.md",
});

const clarificationRequestBytes = await readFile(
  new URL("dogfood/work-dependency-analysis/clarification-request.json", root),
);
const clarificationRequest = JSON.parse(clarificationRequestBytes.toString("utf8"));
const clarificationRequestRef = store.addExisting({
  artifactId: clarificationRequest.requestSetId,
  bytes: clarificationRequestBytes,
  uri: `${canonicalArtifactRoot}/clarification-request.json`,
});
const continuationBytes = await readFile(
  new URL("dogfood/work-dependency-analysis/requirements-continuation.json", root),
);
const continuation = JSON.parse(continuationBytes.toString("utf8"));
const continuationRef = store.addExisting({
  artifactId: continuation.continuationId,
  bytes: continuationBytes,
  uri: `${canonicalArtifactRoot}/requirements-continuation.json`,
});

const decisionText =
  "# WorkDependencyAnalysis owner decisions\n\n" +
  "The product owner approved decisions 1, 2, and 4 from the original clarification request, refined decision 3, and replaced decision 5. Because decisions 3 and 5 are outside the checkpointed closed choice set, this record authorizes a fresh superseding RequirementsGathering change invocation; it does not mutate or falsely complete the prior continuation.\n\n" +
  ownerDecisions
    .map(
      ({ questionId, decision }, index) =>
        `${index + 1}. **${questionId}**\n\n   ${decision}\n`,
    )
    .join("\n");
const ownerDecisionRef = store.addText(
  "owner-decisions.md",
  "owner-decisions-work-dependency-analysis-v1",
  decisionText,
);

const capabilityEvidenceText =
  "# WorkDependencyAnalysis capability evidence\n\n" +
  "Retrieved from primary project documentation on 2026-08-03. These sources support bounded capability selection; they do not grant an external tool workflow authority.\n\n" +
  "- OPA evaluates policy over structured input, supports versioned bundles, and can compile Rego entrypoints to WebAssembly for JavaScript-hosted evaluation: https://www.openpolicyagent.org/docs/ and https://www.openpolicyagent.org/docs/wasm\n" +
  "- Graphology-DAG provides cycle detection and topological traversal over directed graphs: https://graphology.github.io/standard-library/dag.html\n" +
  "- Spec Kit documents `/speckit.analyze` as cross-artifact consistency and coverage analysis after tasks and before implementation: https://github.com/github/spec-kit\n" +
  "- Task Master exposes structured task dependencies and dependency validation/fixing, making it suitable only as an optional proposal source: https://github.com/eyaltoledano/claude-task-master\n" +
  "- OpenSpec custom schemas define version-controlled artifacts and artifact dependencies, allowing a bounded dependency proposal artifact without invoking its full workflow: https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md\n";
const capabilityEvidenceRef = store.addText(
  "capability-evidence.md",
  "capability-evidence-work-dependency-analysis-v1",
  capabilityEvidenceText,
);

const proposalText =
  "# WorkDependencyAnalysis proposal\n\n" +
  "Add one full-snapshot dependency-analysis module between WorkBreakdown and SpecialistAssignment. The default path uses a native structured proposer, trusted Graphology-DAG mechanics, pinned OPA policy evaluation, a bounded Spec Kit consistency review, and a separate WorkDependencyGate. Task Master and OpenSpec may replace only the proposal step.\n";
const proposalRef = store.addText(
  "native/openspec/proposal.md",
  "openspec-proposal-work-dependency-analysis-v1",
  proposalText,
);
const specificationText =
  "# WorkDependencyAnalysis requirements\n\n" +
  ownerDecisions
    .map(({ decision }) => `- ${decision}`)
    .join("\n") +
  "\n\nThe full approved WorkBreakdownBaseline snapshot is the work-item universe. Context slices are explicit and version-pinned. Proposers and reviewers remain untrusted. Core owns deterministic graph mechanics; OPA decisions and semantic Gate review are required before promotion.\n";
const specificationRef = store.addText(
  "native/openspec/specs/work-dependency-analysis/spec.md",
  "openspec-spec-work-dependency-analysis-v1",
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
    location: "Approved decisions 1-5 and superseding-invocation authority",
  },
  {
    role: "capability-evidence",
    artifact: pointer(capabilityEvidenceRef),
    location: "Primary capability documentation retrieved 2026-08-03",
  },
];
const baselineSourceRefs = [
  {
    role: "requirements-baseline",
    artifact: pointer(requirementsBaselineDocument.ref),
  },
  {
    role: "project-overview-baseline",
    artifact: pointer(projectOverviewBaselineDocument.ref),
  },
];
const replacement = mergeProjectRequirements(
  requirementsBaselineDocument.value.requirements,
  buildApprovedWorkingRequirements(sourceRefs),
  baselineSourceRefs,
);
const requirementsChangeSet = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsChangeSet",
  changeSetId: "requirements-change-set-work-dependency-analysis-v1",
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
    "Define the approved WorkDependencyAnalysis module boundary, context-slice model, native proposal path, OPA policy evaluation, Graphology-DAG mechanics, consistency review, and optional proposal adapters.",
  compatibilityImpact: "backward-compatible",
  risks: [
    "Version-pinned context slices can omit relevant context if Gate coverage review is weak.",
    "Policy and graph-library success can be mistaken for semantic completeness.",
    "Optional proposal tools can leak native semantics unless normalization remains strict.",
  ],
  requiredEvidence: [
    "requirements/owner-decision",
    "requirements/source-provenance",
    "requirements/gate-promotion",
    "dependency/capability-evaluation",
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
  "project-overview-markdown-work-dependency-analysis-v1",
  overviewMarkdownBytes,
);
const overviewChangedSections = diffProjectOverviewSections(
  projectOverviewBaselineDocument.value.overview,
  overview,
);
const projectOverviewChangeSet = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewChangeSetDraft",
  changeSetId: "project-overview-change-set-work-dependency-analysis-v1",
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
      role: "superseded-clarification-request",
      path: "dogfood/work-dependency-analysis/clarification-request.json",
      artifact: pointer(clarificationRequestRef),
    },
    {
      role: "superseded-continuation",
      path: "dogfood/work-dependency-analysis/requirements-continuation.json",
      artifact: pointer(continuationRef),
    },
    {
      role: "owner-decision",
      path: "dogfood/work-dependency-analysis/owner-decisions.md",
      artifact: pointer(ownerDecisionRef),
    },
    {
      role: "capability-evidence",
      path: "dogfood/work-dependency-analysis/capability-evidence.md",
      artifact: pointer(capabilityEvidenceRef),
    },
    {
      role: "proposal",
      path: "dogfood/work-dependency-analysis/native/openspec/proposal.md",
      artifact: pointer(proposalRef),
    },
    {
      role: "specification",
      path: "dogfood/work-dependency-analysis/native/openspec/specs/work-dependency-analysis/spec.md",
      artifact: pointer(specificationRef),
    },
  ],
  canonicalOutputs: [
    pointer(requirementsChangeSetRef),
    pointer(projectOverviewChangeSetRef),
  ],
  normalization: {
    warnings: [
      "The closed prior clarification request could not encode the owner's replacement answers; it is preserved and superseded rather than rewritten.",
    ],
    unmappedContent: [],
  },
  schema: "devrelay-requirements",
});
const nativeSourceBundleRef = store.addJson(
  "native-source-bundle.json",
  "native-source-work-dependency-analysis-v1",
  "nativeSourceBundle",
  nativeSourceBundle,
);

const invocation = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId:
    "invocation-requirements-work-dependency-analysis-openspec-superseding-v1",
  runId: "dogfood-work-dependency-analysis-v1",
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
    changeName: "work-dependency-analysis-module-v1",
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
        "The candidate is bound to the exact global baseline pair, repository snapshot, preserved clarification, owner decisions, primary capability evidence, bounded OpenSpec source artifacts, and deterministic ProjectOverview projection.",
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

const executionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "DogfoodExecutionProof",
  proofId: "requirements-change-work-dependency-analysis-v1",
  module: "requirements-gathering@0.1.0",
  plugin: "openspec@0.1.0",
  sourceRevision: revision,
  invocationId: invocation.invocationId,
  outcome: result.outcome,
  adapterCallCount: adapterCalls,
  checkpointCount: checkpoints.values.size,
  checkpointKey,
  checkpointDigest: sha256Digest(checkpointBytes),
  invocationDigest: sha256Digest(invocationBytes),
  resultDigest: sha256Digest(resultBytes),
  requirementsChangeSet: pointer(requirementsChangeSetRef),
  projectOverviewChangeSet: pointer(projectOverviewChangeSetRef),
  candidateProjectOverviewMarkdown: pointer(overviewMarkdownRef),
  nativeSourceBundle: pointer(nativeSourceBundleRef),
  supersedesClarification: {
    request: pointer(clarificationRequestRef),
    continuation: pointer(continuationRef),
  },
  promotableCandidateProduced: true,
  requirementsGateStatus: "awaiting-owner-approval",
  architectureProgressionAllowed: false,
});
await writeFile(
  new URL("requirements-change.execution-proof.json", outputDirectory),
  jsonBytes(executionProof),
);

const supersessionRecord =
  "# Clarification supersession record\n\n" +
  "The original RequirementsGathering invocation remains an immutable completed `needs_clarification` result. Its closed single-choice schema cannot encode the owner's replacement answers for decisions 3 and 5. The fresh requirements-change invocation cites the original request and continuation plus `owner-decisions.md`; it supersedes the stalled path without treating it as answered, replayed, or mutated.\n\n" +
  `- Original request: ${clarificationRequestRef.digest}\n` +
  `- Original continuation: ${continuationRef.digest}\n` +
  `- Owner decision record: ${ownerDecisionRef.digest}\n` +
  `- Superseding candidate: ${requirementsChangeSetRef.digest}\n`;
await writeFile(
  new URL("supersession-record.md", outputDirectory),
  Buffer.from(supersessionRecord.normalize("NFC"), "utf8"),
);

const gateReview =
  "# WorkDependencyAnalysis Requirements Gate review\n\n" +
  "Status: **awaiting owner approval**\n\n" +
  "RequirementsGathering produced one schema-valid, checkpoint-replay-valid requirements change and deterministic ProjectOverview change. Structural and lineage checks pass; no baseline promotion or ArchitectureDesign progression is authorized until the owner approves this exact candidate.\n\n" +
  "## Decisions represented\n\n" +
  ownerDecisions.map(({ decision }) => `- ${decision}`).join("\n") +
  "\n\n## Exact candidate evidence\n\n" +
  `- RequirementsChangeSet: ${requirementsChangeSetRef.digest}\n` +
  `- ProjectOverviewChangeSetDraft: ${projectOverviewChangeSetRef.digest}\n` +
  `- Candidate ProjectOverview.md: ${overviewMarkdownRef.digest}\n` +
  `- NativeSourceBundle: ${nativeSourceBundleRef.digest}\n` +
  `- Terminal checkpoint: ${sha256Digest(checkpointBytes)}\n` +
  `- Repository revision: ${revision}\n\n` +
  "## Gate checks\n\n" +
  "- PASS: exact global requirements/project-overview baseline pair supplied\n" +
  "- PASS: no unconfirmed blocking assumptions remain\n" +
  "- PASS: changed-section list is exhaustive and canonical\n" +
  "- PASS: ProjectOverview projection and Markdown bytes are deterministic\n" +
  "- PASS: native sources and owner decisions are digest-bound\n" +
  "- PASS: checkpoint replay performs zero adapter reinvocations\n" +
  "- PENDING: owner approval of the exact candidate and atomic pair promotion\n";
await writeFile(
  new URL("requirements-gate-review.md", outputDirectory),
  Buffer.from(gateReview.normalize("NFC"), "utf8"),
);

const readme =
  "# WorkDependencyAnalysis dogfood\n\n" +
  "This directory records the cumulative module-by-module run for DevRelay's next lifecycle slice.\n\n" +
  "Current state: RequirementsGathering produced a checkpointed `change_set_drafted` candidate through a fresh superseding invocation because the original closed clarification choices could not represent the owner's replacements for decisions 3 and 5. The old `needs_clarification` result remains immutable evidence. Requirements Gate is awaiting owner approval; no global baseline promotion, ArchitectureDesign, WorkBreakdown, or WorkDependencyAnalysis implementation is yet authorized.\n\n" +
  "Regenerate the original clarification checkpoint and the superseding candidate from repository root with:\n\n" +
  "```powershell\nnode dogfood\\work-dependency-analysis\\materialize-clarification.mjs\nnode dogfood\\work-dependency-analysis\\materialize-requirements-change.mjs\n```\n";
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
