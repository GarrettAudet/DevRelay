import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import {
  PROJECT_OVERVIEW_DOCUMENT,
  PROJECT_OVERVIEW_PROJECTION,
  PROJECT_OVERVIEW_RENDERER,
  deriveProjectOverview,
  renderProjectOverviewMarkdownBytes,
} from "../src/project-overview.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";
import { validateRequirementsGatePromotion } from "../src/requirements-gate.mjs";
import {
  V1_LIFECYCLE,
  buildProjectRequirements,
  goal,
  projectContext,
} from "./project-baseline-data.mjs";

const root = new URL("../", import.meta.url);
const outputDirectory = new URL("./", import.meta.url);
const rootPath = fileURLToPath(root);
const canonicalRepositoryRoot = "C:/repos/DevRelay";
const canonicalArtifactRoot = "file:///C:/repos/DevRelay/project";

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
  requirementsDraft: Object.freeze([
    "https://devrelay.dev/artifacts/requirements-draft/v1",
    "application/vnd.devrelay.requirements-draft+json",
  ]),
  projectOverviewDraft: Object.freeze([
    "https://devrelay.dev/artifacts/project-overview-draft/v1",
    "application/vnd.devrelay.project-overview-draft+json",
  ]),
  nativeSourceBundle: Object.freeze([
    "https://devrelay.dev/artifacts/native-source-bundle/v1",
    "application/vnd.devrelay.native-source-bundle+json",
  ]),
  requirementsBaseline: Object.freeze([
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
  ]),
  projectOverviewBaseline: Object.freeze([
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
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
  const refs = new Map();
  const files = new Map();
  const add = ({ artifactId, bytes, fileUrl, schema, mediaType, uri }) => {
    const ref = Object.freeze({
      artifactId,
      ...(schema === undefined ? {} : { schema }),
      ...(mediaType === undefined ? {} : { mediaType }),
      digest: sha256Digest(bytes),
      ...(uri === undefined ? {} : { uri }),
    });
    values.set(artifactId, Buffer.from(bytes));
    refs.set(artifactId, ref);
    files.set(fileUrl.href, Buffer.from(bytes));
    return ref;
  };
  return Object.freeze({
    addJson(fileName, artifactId, type, value) {
      const [schema, mediaType] = artifactTypes[type];
      return add({
        artifactId,
        bytes: jsonBytes(value),
        fileUrl: new URL(fileName, outputDirectory),
        schema,
        mediaType,
        uri: `${canonicalArtifactRoot}/${fileName.replaceAll("\\", "/")}`,
      });
    },
    addText(fileName, artifactId, text, { rootFile = false } = {}) {
      const bytes = Buffer.from(text.normalize("NFC"), "utf8");
      return add({
        artifactId,
        bytes,
        fileUrl: rootFile
          ? new URL(fileName, root)
          : new URL(fileName, outputDirectory),
        uri: rootFile
          ? `file:///C:/repos/DevRelay/${fileName}`
          : `${canonicalArtifactRoot}/${fileName.replaceAll("\\", "/")}`,
      });
    },
    addBytes(fileName, artifactId, bytes, { rootFile = false } = {}) {
      return add({
        artifactId,
        bytes: Buffer.from(bytes),
        fileUrl: rootFile
          ? new URL(fileName, root)
          : new URL(fileName, outputDirectory),
        uri: rootFile
          ? `file:///C:/repos/DevRelay/${fileName}`
          : `${canonicalArtifactRoot}/${fileName.replaceAll("\\", "/")}`,
      });
    },
    bytes(artifactId) {
      const bytes = values.get(artifactId);
      if (bytes === undefined) {
        throw new Error(`Missing project artifact ${artifactId}.`);
      }
      return Buffer.from(bytes);
    },
    ref(artifactId) {
      const ref = refs.get(artifactId);
      if (ref === undefined) {
        throw new Error(`Missing project artifact ref ${artifactId}.`);
      }
      return ref;
    },
    artifacts: Object.freeze({
      async load(ref) {
        const bytes = values.get(ref.artifactId);
        if (bytes === undefined) {
          throw new Error(`Missing project artifact ${ref.artifactId}.`);
        }
        return Buffer.from(bytes);
      },
    }),
    async writeAll() {
      for (const [href, bytes] of [...files.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        const target = new URL(href);
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

const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: rootPath,
  encoding: "utf8",
}).trim();
const treeListing = execFileSync(
  "git",
  ["ls-tree", "-r", "--full-tree", "HEAD"],
  { cwd: rootPath },
);
const repositorySnapshot = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RepositorySnapshot",
  repository: canonicalRepositoryRoot,
  revision,
  treeDigest: sha256Digest(treeListing),
  includedPaths: [
    "AGENTS.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "README.md",
    "RELEASE.md",
    "SECURITY.md",
    "contracts/**",
    "docs/**",
    "dogfood/**",
    "examples/**",
    "openspec/**",
    "project/**",
    "release/**",
    "scripts/**",
    "src/**",
    "test/**",
    "package-lock.json",
    "package.json",
  ],
  excludedPaths: [".git/**", "node_modules/**"],
});

const store = createArtifactStore();
const goalRef = store.addJson("goal.json", goal.goalId, "goal", goal);
const projectContextRef = store.addJson(
  "project-context.json",
  "project-context-devrelay-v1",
  "projectContext",
  projectContext,
);
const repositorySnapshotRef = store.addJson(
  "repository-snapshot.json",
  `repository-snapshot-devrelay-project-${revision.slice(0, 7)}`,
  "repositorySnapshot",
  repositorySnapshot,
);
const ownerDecision =
  "# DevRelay V1 lifecycle approval\n\n" +
  "The product owner approved establishment of one project-wide DevRelay ProjectOverview baseline and confirmed that V1 contains exactly these lifecycle components in order:\n\n" +
  V1_LIFECYCLE.map(
    ({ name, kind, conditional }, index) =>
      `${index + 1}. ${name} (${kind}${conditional ? ", conditional" : ""})`,
  ).join("\n") +
  "\n\nArchitectureDiscovery applies to an existing repository without a baseline. ContractGeneration applies when APIs, schemas, events, protocols, or other formal contracts are required. TraceabilityGraph remains a cross-cutting infrastructure service and is not an additional lifecycle stage.\n";
const ownerDecisionRef = store.addText(
  "owner-v1-lifecycle-approval.md",
  "owner-v1-lifecycle-approval",
  ownerDecision,
);

const baseInputs = Object.freeze([
  Object.freeze({ role: "goal", artifact: pointer(goalRef) }),
  Object.freeze({
    role: "owner-confirmation",
    artifact: pointer(ownerDecisionRef),
    location: "Complete V1 lifecycle inventory and global-overview migration approval",
  }),
  Object.freeze({
    role: "project-context",
    artifact: pointer(projectContextRef),
  }),
  Object.freeze({
    role: "repository-snapshot",
    artifact: pointer(repositorySnapshotRef),
  }),
]);
const invocationBaseInputs = Object.freeze(
  baseInputs.filter(({ role }) => role !== "owner-confirmation"),
);
const sourceRefs = () => baseInputs.map((entry) => structuredClone(entry));
const requirements = buildProjectRequirements(sourceRefs);
const requirementsDraft = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsDraft",
  draftId: "requirements-draft-devrelay-v1",
  baseInputs: invocationBaseInputs,
  goal: pointer(goalRef),
  projectContext: pointer(projectContextRef),
  requirements,
});
const requirementsDraftRef = store.addJson(
  "requirements-draft.json",
  requirementsDraft.draftId,
  "requirementsDraft",
  requirementsDraft,
);

const overview = deriveProjectOverview(requirements);
const overviewMarkdownBytes = renderProjectOverviewMarkdownBytes(overview);
const overviewMarkdownRef = store.addBytes(
  "ProjectOverview.md",
  "project-overview-markdown-devrelay-v1",
  overviewMarkdownBytes,
  { rootFile: true },
);
const projectOverviewDraft = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewDraft",
  draftId: "project-overview-draft-devrelay-v1",
  requirementsDraft: pointer(requirementsDraftRef),
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
const projectOverviewDraftRef = store.addJson(
  "project-overview-draft.json",
  projectOverviewDraft.draftId,
  "projectOverviewDraft",
  projectOverviewDraft,
);

const proposal =
  "# DevRelay V1 project baseline proposal\n\n" +
  "Establish one global requirements and ProjectOverview baseline for DevRelay. Preserve module-specific dogfood baselines as historical feature evidence. Use the global pair as explicit context for future lifecycle modules and evolve it through approved requirements change sets.\n";
const proposalRef = store.addText(
  "native/openspec/proposal.md",
  "openspec-proposal-devrelay-v1-project-baseline",
  proposal,
);
const nativeSpec =
  "# DevRelay V1 lifecycle specification\n\n" +
  "## Required lifecycle\n\n" +
  V1_LIFECYCLE.map(
    ({ name, kind, conditional }) =>
      `- ${name}: ${kind}${conditional ? "; conditional" : "; required"}`,
  ).join("\n") +
  "\n\n## Invariants\n\n" +
  "- DevRelay owns deterministic routing, contracts, gates, evidence, traceability, and progression.\n" +
  "- Adapters expose bounded replaceable capabilities and never own workflow or graph authority.\n" +
  "- ProjectOverview.md is generated from the approved structured pair and is passed explicitly to downstream modules.\n";
const nativeSpecRef = store.addText(
  "native/openspec/specs/devrelay-v1/spec.md",
  "openspec-spec-devrelay-v1-project-baseline",
  nativeSpec,
);
const nativeSourceBundle = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "NativeSourceBundle",
  plugin: { id: "openspec", version: "0.1.0" },
  tool: { name: "OpenSpec", version: "conversation-contract-v1" },
  operation: "requirements.gather",
  sources: [
    {
      role: "owner-confirmation",
      path: "project/owner-v1-lifecycle-approval.md",
      artifact: pointer(ownerDecisionRef),
    },
    {
      role: "proposal",
      path: "project/native/openspec/proposal.md",
      artifact: pointer(proposalRef),
    },
    {
      role: "specification",
      path: "project/native/openspec/specs/devrelay-v1/spec.md",
      artifact: pointer(nativeSpecRef),
    },
  ],
  canonicalOutputs: [
    pointer(requirementsDraftRef),
    pointer(projectOverviewDraftRef),
  ],
  normalization: { warnings: [], unmappedContent: [] },
  schema: "devrelay-requirements",
});
const nativeSourceBundleRef = store.addJson(
  "native-source-bundle.json",
  "native-source-openspec-devrelay-v1",
  "nativeSourceBundle",
  nativeSourceBundle,
);

const invocation = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId: "invocation-requirements-devrelay-v1-openspec",
  runId: "project-baseline-devrelay-v1",
  nodeId: "requirements-gathering",
  module: {
    id: "requirements-gathering",
    version: "0.1.0",
    operation: "gather",
  },
  plugin: { id: "openspec", version: "0.1.0" },
  inputs: {
    goal: [goalRef],
    "project-context": [projectContextRef],
    "repository-snapshot": [repositorySnapshotRef],
  },
  options: {},
  config: {
    projectRoot: canonicalRepositoryRoot,
    toolName: "OpenSpec",
    toolVersion: "conversation-contract-v1",
    nativeOperation: "requirements.gather",
    changeName: "devrelay-v1-project-baseline",
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
  outcome: "drafted",
  outputs: {
    "requirements-draft": [requirementsDraftRef],
    "project-overview-draft": [projectOverviewDraftRef],
    "native-source-bundle": [nativeSourceBundleRef],
  },
  evidence: [
    {
      kind: "requirements/source-provenance",
      subject: `requirements-draft:${requirementsDraft.draftId}`,
      status: "pass",
      artifact: nativeSourceBundleRef,
      summary:
        "The global DevRelay V1 requirements candidate is bound to the owner-approved lifecycle inventory, project context, repository snapshot, bounded OpenSpec-native evidence, deterministic ProjectOverview projection, and exact generated Markdown bytes.",
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
if (result.outcome !== "drafted") {
  throw new Error(`Unexpected outcome ${result.outcome}.`);
}
const checkpointReplay = await registry.verifyCheckpointedExecution(invocation, {
  artifacts: store.artifacts,
  checkpoints: checkpoints.store,
});
if (adapterCalls !== 1 || checkpoints.values.size !== 1) {
  throw new Error(
    `Expected one adapter call and checkpoint, received ${adapterCalls} and ${checkpoints.values.size}.`,
  );
}

const gateApproval =
  "# DevRelay V1 Requirements Gate\n\n" +
  "Status: **pass**\n\n" +
  "The product owner approved one global DevRelay project baseline and the exact fourteen-component V1 lifecycle. RequirementsGathering produced a schema-valid, source-bound candidate and deterministic ProjectOverview projection. ArchitectureDiscovery and ContractGeneration are conditional; TraceabilityGraph remains a cross-cutting service. The pair is approved for atomic promotion and explicit use by all future downstream module invocations.\n\n" +
  `- RequirementsDraft: ${requirementsDraftRef.digest}\n` +
  `- ProjectOverviewDraft: ${projectOverviewDraftRef.digest}\n` +
  `- ProjectOverview.md: ${overviewMarkdownRef.digest}\n` +
  `- NativeSourceBundle: ${nativeSourceBundleRef.digest}\n` +
  `- Repository revision: ${revision}\n`;
const gateApprovalRef = store.addText(
  "requirements-gate.md",
  "requirements-gate-devrelay-v1",
  gateApproval,
);
const requirementsBaseline = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsBaseline",
  baselineId: "requirements-baseline-devrelay-v1",
  version: "1.0.0",
  approvedCandidate: pointer(requirementsDraftRef),
  requirements,
  approvalEvidence: [pointer(gateApprovalRef)],
});
const requirementsBaselineRef = store.addJson(
  "requirements-baseline.json",
  requirementsBaseline.baselineId,
  "requirementsBaseline",
  requirementsBaseline,
);
const projectOverviewBaseline = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewBaseline",
  baselineId: "project-overview-baseline-devrelay-v1",
  version: "1.0.0",
  approvedOverviewCandidate: pointer(projectOverviewDraftRef),
  requirementsBaseline: pointer(requirementsBaselineRef),
  projection: PROJECT_OVERVIEW_PROJECTION,
  overview,
  renderedDocument: {
    path: PROJECT_OVERVIEW_DOCUMENT.path,
    schema: PROJECT_OVERVIEW_DOCUMENT.schema,
    mediaType: PROJECT_OVERVIEW_DOCUMENT.mediaType,
    artifact: pointer(overviewMarkdownRef),
    renderer: PROJECT_OVERVIEW_RENDERER,
  },
  approvalEvidence: [pointer(gateApprovalRef)],
});
const projectOverviewBaselineRef = store.addJson(
  "project-overview-baseline.json",
  projectOverviewBaseline.baselineId,
  "projectOverviewBaseline",
  projectOverviewBaseline,
);

const promotion = validateRequirementsGatePromotion({
  checkpointReplay,
  requirementsBaseline,
  requirementsBaselineRef,
  requirementsBaselineBytes: store.bytes(requirementsBaseline.baselineId),
  projectOverviewBaseline,
  projectOverviewBaselineRef,
  projectOverviewBaselineBytes: store.bytes(projectOverviewBaseline.baselineId),
  projectOverviewMarkdownBytes: overviewMarkdownBytes,
});
if (
  promotion.commitPayload.requirementsBaseline.bytesBase64 !==
    store.bytes(requirementsBaseline.baselineId).toString("base64") ||
  promotion.commitPayload.projectOverviewBaseline.bytesBase64 !==
    store.bytes(projectOverviewBaseline.baselineId).toString("base64")
) {
  throw new Error("Requirements Gate commit payload does not match baseline bytes.");
}

const [[checkpointKey, checkpointValue]] = checkpoints.values.entries();
const checkpointBundle = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EffectCheckpointBundle",
  checkpointKey,
  checkpoint: checkpointValue,
});
const checkpointBytes = jsonBytes(checkpointBundle);
const resultBytes = jsonBytes(result);
const invocationBytes = jsonBytes(invocation);
await writeFile(
  new URL("requirements-gathering.checkpoint.json", outputDirectory),
  checkpointBytes,
);
await writeFile(
  new URL("requirements-gathering.invocation.json", outputDirectory),
  invocationBytes,
);
await writeFile(
  new URL("requirements-gathering.result.json", outputDirectory),
  resultBytes,
);
const executionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "DogfoodExecutionProof",
  proofId: "requirements-promotion-devrelay-v1",
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
  requirementsBaseline: pointer(requirementsBaselineRef),
  projectOverviewBaseline: pointer(projectOverviewBaselineRef),
  projectOverviewMarkdown: pointer(overviewMarkdownRef),
  gateEvidence: pointer(gateApprovalRef),
  promotableCandidateProduced: true,
  gatePromotionValidated: true,
});
await writeFile(
  new URL("runtime-execution-proof.json", outputDirectory),
  jsonBytes(executionProof),
);

const readme =
  "# DevRelay project baseline\n\n" +
  "This directory contains the canonical project-wide RequirementsBaseline and ProjectOverviewBaseline pair for DevRelay V1, plus the exact RequirementsGathering invocation, checkpoint, candidate, native evidence, Gate decision, and execution proof that produced it.\n\n" +
  "The root `ProjectOverview.md` is the deterministic readable projection of this pair. Existing module-specific dogfood overviews remain immutable historical evidence and are not the current project context. Future feature and module requirements must evolve this pair through RequirementsChangeSet and ProjectOverviewChangeSetDraft artifacts.\n\n" +
  "Regenerate and validate the pair from the repository root with:\n\n" +
  "```powershell\nnode project\\materialize.mjs\n```\n";
await writeFile(
  new URL("README.md", outputDirectory),
  Buffer.from(readme.normalize("NFC"), "utf8"),
);
await store.writeAll();

process.stdout.write(
  `${JSON.stringify(
    {
      outcome: result.outcome,
      lifecycleComponents: V1_LIFECYCLE.length,
      adapterCalls,
      checkpoints: checkpoints.values.size,
      requirementsBaselineDigest: requirementsBaselineRef.digest,
      projectOverviewBaselineDigest: projectOverviewBaselineRef.digest,
      projectOverviewMarkdownDigest: overviewMarkdownRef.digest,
      gatePromotionValidated: true,
    },
    null,
    2,
  )}\n`,
);
