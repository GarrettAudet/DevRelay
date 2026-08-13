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
  buildReleaseHardeningRequirements,
  ownerDecisions,
} from "./v0.10-release-hardening-requirements-data.mjs";

const root = new URL("../../", import.meta.url);
const outputDirectory = new URL("./", import.meta.url);
const rootPath = fileURLToPath(root);
const canonicalRepositoryRoot = "C:/repos/DevRelay";
const canonicalArtifactRoot =
  "file:///C:/repos/DevRelay/dogfood/v0.10-release-hardening";

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
      ? "project-context-devrelay-v0.10-release-hardening-v1"
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
  path: "dogfood/v0.10-release-hardening/goal.json",
  type: "goal",
  uri: `${canonicalArtifactRoot}/goal.json`,
});
const projectContextDocument = await loadExistingJson({
  path: "dogfood/v0.10-release-hardening/project-context.json",
  type: "projectContext",
  uri: `${canonicalArtifactRoot}/project-context.json`,
});
const repositorySnapshotDocument = await loadExistingJson({
  path: "dogfood/v0.10-release-hardening/repository-snapshot.json",
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
  "# DevRelay V0.10 public OSS preview owner decisions\n\n" +
  "This record freezes GitHub-only source and tarball distribution, Apache-2.0 with DCO, the public security contact, protected main, the Windows Desktop support boundary, recursive lifecycle dogfood, and explicit release exclusions. It authorizes a fresh RequirementsGathering change candidate only; promotion still requires the exact Requirements Gate approval.\n\n" +
  ownerDecisions
    .map(
      ({ decisionId, decision }, index) =>
        `${index + 1}. **${decisionId}**\n\n   ${decision}\n`,
    )
    .join("\n");
const ownerDecisionRef = store.addText(
  "owner-decisions.md",
  "owner-decisions-v0.10-release-hardening-v1",
  decisionText,
);

const capabilityEvidenceText =
  "# V0.10 public OSS preview capability evidence\n\n" +
  "This bounded evidence records the accepted source/library baseline, the audit findings, and the owner-approved V0.10 boundaries.\n\n" +
  "- The accepted 0.9.0 source at a38d2ffde71b5226721a45fedf203c62fc093739 passed its controlled source/library release evidence.\n" +
  "- Independent audit found that two declared ArchitectureDiscovery package exports are absent from the packed artifact, so the prior package evidence cannot support the public preview.\n" +
  "- RequirementsGathering, ArchitectureDiscovery, ArchitectureDesign, ContractGeneration, WorkBreakdown, WorkDependencyAnalysis, SpecialistAssignment, WorkExecution, WorkItemVerification, ChangeIntegration, SystemVerification, BusinessAcceptance, and TraceabilityGraph have executable released contracts.\n" +
  "- OpenSpec is used here through the released bounded requirements adapter with ChatGPT as the host-supplied capability executor; no upstream OpenSpec CLI execution is claimed.\n" +
  "- The existing uncommitted OSS edits are a non-authoritative draft and are not release evidence until downstream execution, verification, integration, and acceptance complete.\n";
const capabilityEvidenceRef = store.addText(
  "capability-evidence.md",
  "capability-evidence-v0.10-release-hardening-v1",
  capabilityEvidenceText,
);

const proposalText =
  "# DevRelay V0.10 public OSS source/library preview\n\n" +
  "Correct package-export completeness, adopt Apache-2.0/DCO governance and public project controls, support the current Node LTS matrix, verify the release from ChatGPT Desktop on Windows, and publish only GitHub source plus an installable tarball after the complete DevRelay lifecycle and a separate minimal software dogfood pass.\n";
const proposalRef = store.addText(
  "native/openspec/proposal.md",
  "openspec-proposal-v0.10-release-hardening-v1",
  proposalText,
);
const specificationText =
  "# DevRelay V0.10 public OSS preview requirements\n\n" +
  ownerDecisions
    .map(({ decision }) => `- ${decision}`)
    .join("\n") +
  "\n\nThe candidate must preserve deterministic Core semantics, derive package checks from the declared export contract, fail closed on missing packed files, preserve exact lifecycle and traceability evidence, and avoid unsupported npm, Desktop plug-in, or hosted-service claims.\n";
const specificationRef = store.addText(
  "native/openspec/specs/v0.10-release-hardening/spec.md",
  "openspec-spec-v0.10-release-hardening-v1",
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
    location: "Owner-approved V0.10 distribution, license, security, branch, host, dogfood, and exclusion decisions",
  },
  {
    role: "capability-evidence",
    artifact: pointer(capabilityEvidenceRef),
    location: "Accepted 0.9.0 source and V0.10 public-preview audit evidence at repository revision a38d2ffde71b5226721a45fedf203c62fc093739",
  },
];
const replacement = buildReleaseHardeningRequirements(
  requirementsBaselineDocument.value.requirements,
  sourceRefs,
);
const requirementsChangeSet = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsChangeSet",
  changeSetId: "requirements-change-set-v0.10-release-hardening-v1",
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
    "Prepare a deterministic public Apache-2.0/DCO GitHub source/library preview with complete packed exports, protected-main promotion, supported Windows Desktop evidence, and complete lifecycle dogfood without claiming npm publication, a one-click plug-in, or a hosted backend.",
  compatibilityImpact: "backward-compatible",
  risks: [
    "Package exports can remain incomplete if the verifier relies on a second manually maintained file list.",
    "Owner-only GitHub settings can remain incomplete after all source changes pass.",
    "Cross-platform CI can mask an untested release-defining Windows Desktop path.",
    "Open-source contribution and security guidance can overpromise unsupported operational response guarantees.",
  ],
  requiredEvidence: [
    "requirements/owner-decision",
    "requirements/source-provenance",
    "requirements/gate-promotion",
    "release/package-export-completeness",
    "release/installed-package-windows",
    "oss/license-and-governance",
    "oss/security-contact",
    "oss/protected-main",
    "dogfood/full-lifecycle",
    "dogfood/minimal-software-project",
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
  "project-overview-markdown-v0.10-release-hardening-v1",
  overviewMarkdownBytes,
);
const overviewChangedSections = diffProjectOverviewSections(
  projectOverviewBaselineDocument.value.overview,
  overview,
);
const projectOverviewChangeSet = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewChangeSetDraft",
  changeSetId: "project-overview-change-set-v0.10-release-hardening-v1",
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
      path: "dogfood/v0.10-release-hardening/owner-decisions.md",
      artifact: pointer(ownerDecisionRef),
    },
    {
      role: "capability-evidence",
      path: "dogfood/v0.10-release-hardening/capability-evidence.md",
      artifact: pointer(capabilityEvidenceRef),
    },
    {
      role: "proposal",
      path: "dogfood/v0.10-release-hardening/native/openspec/proposal.md",
      artifact: pointer(proposalRef),
    },
    {
      role: "specification",
      path: "dogfood/v0.10-release-hardening/native/openspec/specs/v0.10-release-hardening/spec.md",
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
  "native-source-v0.10-release-hardening-v1",
  "nativeSourceBundle",
  nativeSourceBundle,
);

const invocation = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId:
    "invocation-requirements-v0.10-release-hardening-openspec-v1",
  runId: "dogfood-v0.10-release-hardening-v1",
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
    changeName: "v0.10-release-hardening-v1",
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
        "The candidate is bound to the exact global baseline pair, accepted 0.9.0 repository snapshot, owner decisions, public-preview audit evidence, bounded OpenSpec source artifacts, and deterministic ProjectOverview projection.",
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
  proofId: "requirements-change-v0.10-release-hardening-v1",
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
  "# DevRelay V0.10 public OSS preview Requirements Gate review\n\n" +
  "Status: **awaiting owner approval**\n\n" +
  "RequirementsGathering produced one schema-valid, checkpoint-replay-valid full-body requirements change and deterministic ProjectOverview change. It adds the exact public GitHub source/library preview, package completeness, governance, protected-main, security-contact, Windows Desktop, recursive dogfood, and exclusion requirements. No baseline promotion or ArchitectureDesign progression is authorized until the exact candidate is approved.\n\n" +
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
  "- PASS: accepted 0.9.0 repository revision and tree bytes are version-pinned and match\n" +
  "- PASS: no unconfirmed blocking assumptions remain\n" +
  "- PASS: GitHub-only distribution, Apache-2.0/DCO, security contact, protected main, supported host, and exclusions are explicit\n" +
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
  "# DevRelay V0.10 public OSS preview dogfood\n\n" +
  "This directory is the cumulative full-lifecycle run for hardening the accepted source/library into the public GitHub preview.\n\n" +
  "Current state: RequirementsGathering produced a checkpointed `change_set_drafted` candidate using the released module and bounded OpenSpec adapter contract with ChatGPT as the host capability executor. Requirements Gate is awaiting exact approval. No global baseline promotion or ArchitectureDesign progression is yet authorized.\n\n" +
  "Regenerate the candidate from repository root with:\n\n" +
  "```powershell\nnode dogfood\\v0.10-release-hardening\\materialize-requirements-change.mjs\n```\n";
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
