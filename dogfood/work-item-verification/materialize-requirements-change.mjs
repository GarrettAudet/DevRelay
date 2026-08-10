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
  buildWorkItemVerificationRequirements,
  confirmedDecisions,
} from "./work-item-verification-approved-data.mjs";

const root = new URL("../../", import.meta.url);
const outputDirectory = new URL("./", import.meta.url);
const canonicalRepositoryRoot = "C:/repos/DevRelay";
const canonicalArtifactRoot =
  "file:///C:/repos/DevRelay/dogfood/work-item-verification";

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
  requirementsBaseline: Object.freeze([
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
  ]),
  projectOverviewBaseline: Object.freeze([
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
  ]),
  projectOverviewMarkdown: Object.freeze([
    "https://devrelay.dev/artifacts/project-overview-markdown/v1",
    "text/markdown; charset=utf-8",
  ]),
  clarificationRequest: Object.freeze([
    "https://devrelay.dev/artifacts/clarification-request-set/v1",
    "application/vnd.devrelay.clarification-request-set+json",
  ]),
  clarificationResponse: Object.freeze([
    "https://devrelay.dev/artifacts/clarification-response-set/v1",
    "application/vnd.devrelay.clarification-response-set+json",
  ]),
  continuation: Object.freeze([
    "https://devrelay.dev/artifacts/requirements-gathering-continuation/v1",
    "application/vnd.devrelay.requirements-gathering-continuation+json",
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

const jsonBytes = (value) =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = (ref) => ({ artifactId: ref.artifactId, digest: ref.digest });

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
    if (fileName !== undefined) files.set(fileName, Buffer.from(bytes));
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
    addBytes(fileName, artifactId, type, bytes) {
      return add({
        artifactId,
        bytes: Buffer.from(bytes),
        fileName,
        type,
        uri: `${canonicalArtifactRoot}/${fileName.replaceAll("\\", "/")}`,
      });
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
      for (const [fileName, bytes] of [...files.entries()].sort(
        ([left], [right]) => left.localeCompare(right),
      )) {
        const target = new URL(fileName, outputDirectory);
        await mkdir(new URL("./", target), { recursive: true });
        await writeFile(target, bytes);
      }
    },
  });
}

const store = createArtifactStore();
async function loadExisting({ path, artifactId, type, uri }) {
  const bytes = await readFile(new URL(path, root));
  const value = JSON.parse(bytes);
  return {
    bytes,
    value,
    ref: store.addExisting({ artifactId, bytes, type, uri }),
  };
}

const requirementsBaselineDocument = await loadExisting({
  path: "project/requirements-baseline.json",
  artifactId: JSON.parse(
    await readFile(new URL("project/requirements-baseline.json", root), "utf8"),
  ).baselineId,
  type: "requirementsBaseline",
  uri: "file:///C:/repos/DevRelay/project/requirements-baseline.json",
});
const projectOverviewBaselineDocument = await loadExisting({
  path: "project/project-overview-baseline.json",
  artifactId: JSON.parse(
    await readFile(
      new URL("project/project-overview-baseline.json", root),
      "utf8",
    ),
  ).baselineId,
  type: "projectOverviewBaseline",
  uri: "file:///C:/repos/DevRelay/project/project-overview-baseline.json",
});
const goalDocument = await loadExisting({
  path: "dogfood/work-item-verification/goal.json",
  artifactId: "goal-work-item-verification-module-v1",
  type: "goal",
  uri: `${canonicalArtifactRoot}/goal.json`,
});
const projectContextDocument = await loadExisting({
  path: "dogfood/work-item-verification/project-context.json",
  artifactId: "project-context-devrelay-work-item-verification-v1",
  type: "projectContext",
  uri: `${canonicalArtifactRoot}/project-context.json`,
});
store.addExisting({
  artifactId:
    projectOverviewBaselineDocument.value.renderedDocument.artifact.artifactId,
  bytes: await readFile(new URL("ProjectOverview.md", root)),
  type: "projectOverviewMarkdown",
  uri: "file:///C:/repos/DevRelay/ProjectOverview.md",
});

const designBasisText =
  "# WorkItemVerification confirmed design basis\n\n" +
  "No blocking clarification is required: the approved V1 lifecycle, WorkExecution verification barrier, evidence-first quality objective, and immutable per-item execution model already constrain these decisions.\n\n" +
  confirmedDecisions.map(({ decisionId, statement }, index) =>
    `${index + 1}. **${decisionId}**\n\n   ${statement}\n`
  ).join("\n");
const designBasisRef = store.addText(
  "confirmed-design-basis.md",
  "confirmed-design-basis-work-item-verification-v1",
  designBasisText,
);
const proposalRef = store.addText(
  "native/openspec/proposal.md",
  "openspec-proposal-work-item-verification-v1",
  "# WorkItemVerification proposal\n\nAdd one provider-neutral WorkItemVerification module that independently evaluates one exact WorkExecution result against the approved WorkItem verification plan and required evidence. Verifier adapters produce evidence only; Core validates it, WorkItemVerificationGate owns approval, and ChangeIntegration remains downstream.\n",
);
const specificationRef = store.addText(
  "native/openspec/specs/work-item-verification/spec.md",
  "openspec-spec-work-item-verification-v1",
  "# WorkItemVerification requirements\n\n" +
    confirmedDecisions.map(({ statement }) => `- ${statement}`).join("\n") +
    "\n\nOne invocation verifies one immutable execution result. All verification-plan and required-evidence obligations require an explicit validated disposition; only a separate exact Gate approval may advance the candidate to ChangeIntegration.\n",
);

const requirementSourceRefs = [
  { role: "goal", artifact: pointer(goalDocument.ref) },
  {
    role: "confirmed-design-basis",
    artifact: pointer(designBasisRef),
    location: "Approved V1 lifecycle, verification barrier, and per-item execution contracts",
  },
  { role: "project-context", artifact: pointer(projectContextDocument.ref) },
  {
    role: "project-overview-baseline",
    artifact: pointer(projectOverviewBaselineDocument.ref),
  },
  {
    role: "requirements-baseline",
    artifact: pointer(requirementsBaselineDocument.ref),
  },
];
const replacement = buildWorkItemVerificationRequirements(
  requirementsBaselineDocument.value.requirements,
  requirementSourceRefs,
);
const changedSections = Object.keys(replacement)
  .filter((section) =>
    canonicalJsonDigest(replacement[section]) !==
    canonicalJsonDigest(requirementsBaselineDocument.value.requirements[section])
  )
  .sort();
const requirementsChangeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsChangeSet",
  changeSetId: "requirements-change-set-work-item-verification-v1",
  baseInputs: [
    { role: "goal", artifact: pointer(goalDocument.ref) },
    { role: "project-context", artifact: pointer(projectContextDocument.ref) },
    { role: "requirements-baseline", artifact: pointer(requirementsBaselineDocument.ref) },
    { role: "project-overview-baseline", artifact: pointer(projectOverviewBaselineDocument.ref) },
  ],
  baseline: pointer(requirementsBaselineDocument.ref),
  expectedRequirementsDigest: canonicalJsonDigest(
    requirementsBaselineDocument.value.requirements,
  ),
  replacement,
  changedSections,
  reason:
    "Define WorkItemVerification as the independent evidence and Gate boundary between one exact WorkExecution result and ChangeIntegration, with immutable attempts, complete obligation coverage, deterministic adapter selection, and no integration authority.",
  compatibilityImpact: "backward-compatible",
  risks: [
    "Evidence may be valid but refer to different work-item, attempt, change-set, repository, or workspace bytes.",
    "An executor or verifier could self-certify completeness or independence.",
    "A passing subset of checks could hide an uncovered verification obligation.",
    "Verification retries could overwrite failing evidence.",
    "A verified candidate could be mistaken for an integrated or system-accepted change.",
  ],
  requiredEvidence: [
    "requirements/confirmed-design-basis",
    "requirements/source-provenance",
    "requirements/gate-promotion",
    "work-item-verification/input-binding",
    "work-item-verification/plan-coverage",
    "work-item-verification/evidence-closure",
    "work-item-verification/checkpoint-replay",
    "work-item-verification/gate-promotion",
    "work-item-verification/traceability-merge",
  ],
  sourceRefs: structuredClone(requirementSourceRefs),
};
const requirementsChangeSetRef = store.addJson(
  "requirements-change-set.json",
  requirementsChangeSet.changeSetId,
  "requirementsChangeSet",
  requirementsChangeSet,
);

const overview = deriveProjectOverview(replacement);
const candidateMarkdownBytes = renderProjectOverviewMarkdownBytes(overview);
const candidateMarkdownRef = store.addBytes(
  "candidate/ProjectOverview.md",
  "project-overview-markdown-work-item-verification-v1",
  "projectOverviewMarkdown",
  candidateMarkdownBytes,
);
const overviewChangeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewChangeSetDraft",
  changeSetId: "project-overview-change-set-work-item-verification-v1",
  baseOverview: pointer(projectOverviewBaselineDocument.ref),
  requirementsChangeSet: pointer(requirementsChangeSetRef),
  changeDisposition: "changed",
  changedSections: diffProjectOverviewSections(
    projectOverviewBaselineDocument.value.overview,
    overview,
  ),
  projection: PROJECT_OVERVIEW_PROJECTION,
  overview,
  renderedDocument: {
    ...PROJECT_OVERVIEW_DOCUMENT,
    artifact: pointer(candidateMarkdownRef),
    renderer: PROJECT_OVERVIEW_RENDERER,
  },
};
const overviewChangeSetRef = store.addJson(
  "project-overview-change-set-draft.json",
  overviewChangeSet.changeSetId,
  "projectOverviewChangeSet",
  overviewChangeSet,
);
const nativeSourceBundle = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "NativeSourceBundle",
  plugin: { id: "openspec", version: "0.1.0" },
  tool: { name: "OpenSpec", version: "conversation-contract-v1" },
  operation: "requirements.gather",
  sources: [
    {
      role: "confirmed-design-basis",
      path: "dogfood/work-item-verification/confirmed-design-basis.md",
      artifact: pointer(designBasisRef),
    },
    {
      role: "proposal",
      path: "dogfood/work-item-verification/native/openspec/proposal.md",
      artifact: pointer(proposalRef),
    },
    {
      role: "specification",
      path: "dogfood/work-item-verification/native/openspec/specs/work-item-verification/spec.md",
      artifact: pointer(specificationRef),
    },
  ],
  canonicalOutputs: [
    pointer(requirementsChangeSetRef),
    pointer(overviewChangeSetRef),
  ],
  normalization: {
    warnings: [
      "The OpenSpec binding is fixture-conformant through the bounded conversation contract; this invocation does not claim upstream CLI execution.",
    ],
    unmappedContent: [],
  },
  schema: "devrelay-requirements",
};
const nativeSourceBundleRef = store.addJson(
  "native-source-bundle.json",
  "native-source-bundle-work-item-verification-v1",
  "nativeSourceBundle",
  nativeSourceBundle,
);

const invocation = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId: "invocation-requirements-work-item-verification-openspec-v1",
  runId: "dogfood-work-item-verification-v1",
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
    "requirements-baseline": [requirementsBaselineDocument.ref],
    "project-overview-baseline": [projectOverviewBaselineDocument.ref],
  },
  options: {},
  config: {
    projectRoot: canonicalRepositoryRoot,
    toolName: "OpenSpec",
    toolVersion: "conversation-contract-v1",
    nativeOperation: "requirements.gather",
    changeName: "work-item-verification-module-v1",
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
    "native-source-bundle": [nativeSourceBundleRef],
  },
  evidence: [
    {
      kind: "requirements/source-provenance",
      subject: `requirements-change-set:${requirementsChangeSet.changeSetId}`,
      status: "pass",
      artifact: nativeSourceBundleRef,
      summary:
        "The exact confirmed design basis, bounded OpenSpec proposal, and specification normalize to the canonical paired change outputs.",
    },
  ],
  diagnostics: [],
};

const checkpointValues = new Map();
const checkpointStore = {
  async get(key) {
    return checkpointValues.get(key);
  },
  async put(key, value) {
    checkpointValues.set(key, structuredClone(value));
  },
};
let adapterCalls = 0;
const registry = createModuleRegistry({
  modules: [moduleDefinition],
  plugins: [
    {
      definition: pluginDefinition,
      adapter: {
        async invoke() {
          adapterCalls += 1;
          return structuredClone(moduleResult);
        },
      },
    },
  ],
  artifactContracts: requirementsRuntimeArtifactContracts(),
});
const result = await registry.execute(invocation, {
  artifacts: store.artifacts,
  checkpoints: checkpointStore,
});
if (canonicalJsonDigest(result) !== canonicalJsonDigest(moduleResult)) {
  throw new Error("RequirementsGathering direct result changed");
}
const callsBeforeReplay = adapterCalls;
const replay = await registry.execute(invocation, {
  artifacts: store.artifacts,
  checkpoints: checkpointStore,
});
if (canonicalJsonDigest(replay) !== canonicalJsonDigest(result)) {
  throw new Error("RequirementsGathering checkpoint replay changed");
}
if (adapterCalls !== callsBeforeReplay) {
  throw new Error("RequirementsGathering checkpoint replay invoked the adapter");
}
const newCheckpointEntries = [...checkpointValues.entries()];
if (adapterCalls !== 1 || newCheckpointEntries.length !== 1) {
  throw new Error(
    `Expected one adapter call and one new checkpoint; received ${adapterCalls} and ${newCheckpointEntries.length}`,
  );
}
const [[checkpointKey, checkpointValue]] = newCheckpointEntries;
const checkpointBundle = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EffectCheckpointBundle",
  checkpointKey,
  checkpoint: checkpointValue,
};
const checkpointBytes = jsonBytes(checkpointBundle);
const invocationBytes = jsonBytes(invocation);
const resultBytes = jsonBytes(result);
await store.writeAll();
await Promise.all([
  writeFile(
    new URL("requirements-change.checkpoint.json", outputDirectory),
    checkpointBytes,
  ),
  writeFile(
    new URL("requirements-change.invocation.json", outputDirectory),
    invocationBytes,
  ),
  writeFile(
    new URL("requirements-change.result.json", outputDirectory),
    resultBytes,
  ),
]);
const executionProof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "DogfoodExecutionProof",
  proofId: "requirements-change-work-item-verification-v1",
  module: "requirements-gathering@0.1.0",
  plugin: "openspec@0.1.0",
  outcome: result.outcome,
  adapterCallCount: adapterCalls,
  checkpointCount: newCheckpointEntries.length,
  replayAdapterCallCount: 0,
  designBasis: pointer(designBasisRef),
  requirementsChangeSet: pointer(requirementsChangeSetRef),
  projectOverviewChangeSet: pointer(overviewChangeSetRef),
  nativeSourceBundle: pointer(nativeSourceBundleRef),
  checkpointDigest: sha256Digest(checkpointBytes),
  invocationDigest: sha256Digest(invocationBytes),
  resultDigest: sha256Digest(resultBytes),
  promotableCandidateProduced: true,
  architectureProgressionAllowed: false,
};
const executionProofBytes = jsonBytes(executionProof);
await writeFile(
  new URL("requirements-change.execution-proof.json", outputDirectory),
  executionProofBytes,
);

const gateBindings = [
  ["RequirementsBaseline", requirementsBaselineDocument.ref.digest],
  ["ProjectOverviewBaseline", projectOverviewBaselineDocument.ref.digest],
  ["Confirmed design basis", designBasisRef.digest],
  ["RequirementsChangeSet", requirementsChangeSetRef.digest],
  ["ProjectOverviewChangeSetDraft", overviewChangeSetRef.digest],
  ["Candidate ProjectOverview.md", candidateMarkdownRef.digest],
  ["NativeSourceBundle", nativeSourceBundleRef.digest],
  ["Terminal checkpoint", sha256Digest(checkpointBytes)],
  ["Execution proof", sha256Digest(executionProofBytes)],
];
const gateReview = [
  "# Requirements Gate candidate: WorkItemVerification module",
  "",
  "Status: **awaiting owner approval**",
  "",
  "## Exact bindings",
  "",
  ...gateBindings.map(([label, digest]) => `- ${label}: ${digest}`),
  "",
  "## Gate findings",
  "",
  "- PASS: no blocking clarification is required because the approved V1 lifecycle, WorkExecution verification barrier, and per-item immutable attempt contract already constrain the module boundary.",
  "- PASS: the candidate preserves every unchanged requirement and adds only WorkItemVerification-specific capability, journey, story, acceptance, scope, constraint, NFR, assumption, terminology, evidence, risk, dependency, deliverable, and status entries.",
  "- PASS: one invocation binds one exact WorkItem, ExecutionAttempt, ChangeSetDraft, ExecutionEvidenceBundle, policy, repository base, and candidate workspace.",
  "- PASS: verifier adapters remain untrusted evidence producers; Core owns canonical evidence validation and policy evaluation, and WorkItemVerificationGate owns approval.",
  "- PASS: every verification-plan and required-evidence obligation requires an explicit subject-bound disposition; adapters cannot reduce approved scope.",
  "- PASS: a verified result may advance only to ChangeIntegration and cannot claim integration, integrated completion, system verification, or business acceptance.",
  "- PASS: ProjectOverview is a deterministic projection of the exact replacement requirements.",
  "",
  "## Approval boundary",
  "",
  "Approval must bind the exact paired change, candidate Markdown, native bundle, and terminal checkpoint. Any modification requires a new Requirements Gate candidate.",
  "",
].join("\n");
const gateReviewBytes = Buffer.from(gateReview.normalize("NFC"), "utf8");
await writeFile(
  new URL("requirements-gate-review.md", outputDirectory),
  gateReviewBytes,
);
await writeFile(
  new URL("requirements-gate-candidate.json", outputDirectory),
  jsonBytes({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RequirementsGateCandidate",
    status: "awaiting-approval",
    exactBindings: Object.fromEntries(gateBindings),
    reviewDigest: sha256Digest(gateReviewBytes),
    progressionAllowed: false,
  }),
);

process.stdout.write(`${JSON.stringify({
  status: "REQUIREMENTS_GATE_CANDIDATE",
  adapterCalls,
  replayAdapterCalls: 0,
  requirementsChangeSetDigest: requirementsChangeSetRef.digest,
  projectOverviewChangeSetDigest: overviewChangeSetRef.digest,
  projectOverviewMarkdownDigest: candidateMarkdownRef.digest,
  nativeSourceBundleDigest: nativeSourceBundleRef.digest,
  checkpointDigest: sha256Digest(checkpointBytes),
  gateReviewDigest: sha256Digest(gateReviewBytes),
  progressionAllowed: false,
}, null, 2)}\n`);
