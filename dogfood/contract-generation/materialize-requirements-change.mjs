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
  buildContractGenerationRequirements,
  ownerDecisions,
} from "./contract-generation-approved-data.mjs";

const root = new URL("../../", import.meta.url);
const outputDirectory = new URL("./", import.meta.url);
const canonicalRepositoryRoot = "C:/repos/DevRelay";
const canonicalArtifactRoot =
  "file:///C:/repos/DevRelay/dogfood/contract-generation";

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
  path: "project/history/1.2.0/requirements-baseline.json",
  artifactId: JSON.parse(
    await readFile(new URL("project/history/1.2.0/requirements-baseline.json", root), "utf8"),
  ).baselineId,
  type: "requirementsBaseline",
  uri: "file:///C:/repos/DevRelay/project/requirements-baseline.json",
});
const projectOverviewBaselineDocument = await loadExisting({
  path: "project/history/1.2.0/project-overview-baseline.json",
  artifactId: JSON.parse(
    await readFile(
      new URL("project/history/1.2.0/project-overview-baseline.json", root),
      "utf8",
    ),
  ).baselineId,
  type: "projectOverviewBaseline",
  uri: "file:///C:/repos/DevRelay/project/project-overview-baseline.json",
});
const goalDocument = await loadExisting({
  path: "dogfood/contract-generation/goal.json",
  artifactId: "goal-contract-generation-module-v1",
  type: "goal",
  uri: `${canonicalArtifactRoot}/goal.json`,
});
const projectContextDocument = await loadExisting({
  path: "dogfood/contract-generation/project-context.json",
  artifactId: "project-context-devrelay-contract-generation-v1",
  type: "projectContext",
  uri: `${canonicalArtifactRoot}/project-context.json`,
});
const clarificationRequestDocument = await loadExisting({
  path: "dogfood/contract-generation/clarification-request.json",
  artifactId: "clarification-request-contract-generation-v1",
  type: "clarificationRequest",
  uri: `${canonicalArtifactRoot}/clarification-request.json`,
});
const continuationDocument = await loadExisting({
  path: "dogfood/contract-generation/requirements-continuation.json",
  artifactId: "requirements-continuation-contract-generation-v1",
  type: "continuation",
  uri: `${canonicalArtifactRoot}/requirements-continuation.json`,
});
store.addExisting({
  artifactId:
    projectOverviewBaselineDocument.value.renderedDocument.artifact.artifactId,
  bytes: await readFile(new URL("project/history/1.2.0/ProjectOverview.md", root)),
  type: "projectOverviewMarkdown",
  uri: "file:///C:/repos/DevRelay/ProjectOverview.md",
});

const clarificationResponse = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ClarificationResponseSet",
  request: pointer(clarificationRequestDocument.ref),
  responses: ownerDecisions.map(({ questionId, answer }) => ({
    questionId,
    answer,
  })),
};
const clarificationResponseRef = store.addJson(
  "clarification-response.json",
  "clarification-response-contract-generation-v1",
  "clarificationResponse",
  clarificationResponse,
);
const ownerDecisionText =
  "# ContractGeneration owner decisions\n\n" +
  "The project owner answered the checkpoint-bound RequirementsGathering request with: `Approve all four recommended decisions`.\n\n" +
  ownerDecisions.map(({ questionId, answer }, index) =>
    `${index + 1}. **${questionId}**\n\n   ${answer}\n`
  ).join("\n");
const ownerDecisionRef = store.addText(
  "owner-decisions.md",
  "owner-decisions-contract-generation-v1",
  ownerDecisionText,
);
const proposalRef = store.addText(
  "native/openspec/proposal.md",
  "openspec-proposal-contract-generation-v1",
  "# ContractGeneration proposal\n\nAdd one provider-neutral ContractGeneration module with establish-contracts and generate-contract-change operations. Generators propose native bytes, Core owns pinned format validation and canonical diff, and ContractGate owns semantic completeness, compatibility policy, approval, ApprovedNotApplicable, and progression.\n",
);
const specificationRef = store.addText(
  "native/openspec/specs/contract-generation/spec.md",
  "openspec-spec-contract-generation-v1",
  "# ContractGeneration requirements\n\n" +
    ownerDecisions.map(({ answer }) => `- ${answer}`).join("\n") +
    "\n\nV1 executes a live JSON Schema 2020-12 path first and defines optional OpenAPI, AsyncAPI, and Protobuf bindings behind the same contract. Every required InterfaceIntent receives one typed contract entry or a blocking diagnostic.\n",
);

const requirementSourceRefs = [
  { role: "goal", artifact: pointer(goalDocument.ref) },
  {
    role: "owner-decision",
    artifact: pointer(ownerDecisionRef),
    location: "All four checkpoint-bound recommended decisions approved in chat",
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
const replacement = buildContractGenerationRequirements(
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
  changeSetId: "requirements-change-set-contract-generation-v1",
  baseInputs: structuredClone(continuationDocument.value.baseInputs),
  baseline: pointer(requirementsBaselineDocument.ref),
  expectedRequirementsDigest: canonicalJsonDigest(
    requirementsBaselineDocument.value.requirements,
  ),
  replacement,
  changedSections,
  reason:
    "Define the ContractGeneration module, ContractGate authority, live JSON Schema path, optional format bindings, typed outputs, and traceability boundary approved through clarification.",
  compatibilityImpact: "backward-compatible",
  risks: [
    "Compatibility analysis can be invalid when compared against a stale ContractBaseline.",
    "Format-specific branches can couple generic Core to one contract tool.",
    "Generator self-certification can admit malformed or incomplete contracts.",
    "WorkBreakdown can propagate invalid scope if ContractGate is bypassed.",
  ],
  requiredEvidence: [
    "requirements/owner-decision",
    "requirements/source-provenance",
    "requirements/gate-promotion",
    "contract/coverage",
    "contract/format-validation",
    "contract/compatibility",
    "contract/checkpoint-replay",
    "contract/gate-promotion",
    "contract/traceability-merge",
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
  "project-overview-markdown-contract-generation-v1",
  "projectOverviewMarkdown",
  candidateMarkdownBytes,
);
const overviewChangeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewChangeSetDraft",
  changeSetId: "project-overview-change-set-contract-generation-v1",
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
      role: "owner-decision",
      path: "dogfood/contract-generation/owner-decisions.md",
      artifact: pointer(ownerDecisionRef),
    },
    {
      role: "proposal",
      path: "dogfood/contract-generation/native/openspec/proposal.md",
      artifact: pointer(proposalRef),
    },
    {
      role: "specification",
      path: "dogfood/contract-generation/native/openspec/specs/contract-generation/spec.md",
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
  "native-source-bundle-contract-generation-v1",
  "nativeSourceBundle",
  nativeSourceBundle,
);

const invocation = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId: "invocation-requirements-contract-generation-openspec-resume-v1",
  runId: "dogfood-contract-generation-v1-resume",
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
    "clarification-request": [clarificationRequestDocument.ref],
    continuation: [continuationDocument.ref],
    "clarification-responses": [clarificationResponseRef],
  },
  options: {},
  config: {
    projectRoot: canonicalRepositoryRoot,
    toolName: "OpenSpec",
    toolVersion: "conversation-contract-v1",
    nativeOperation: "requirements.gather",
    changeName: "contract-generation-module-v1",
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
        "The exact owner response, bounded OpenSpec proposal, and specification normalize to the canonical paired change outputs.",
    },
  ],
  diagnostics: [],
};

const sourceCheckpointDocument = JSON.parse(
  await readFile(
    new URL("dogfood/contract-generation/requirements-gathering.checkpoint.json", root),
    "utf8",
  ),
);
const checkpointValues = new Map([
  [sourceCheckpointDocument.checkpointKey, sourceCheckpointDocument.checkpoint],
]);
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
  throw new Error("RequirementsGathering resume result changed");
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
const newCheckpointEntries = [...checkpointValues.entries()].filter(
  ([key]) => key !== sourceCheckpointDocument.checkpointKey,
);
if (adapterCalls !== 1 || newCheckpointEntries.length !== 1) {
  throw new Error(
    `Expected one resumed adapter call and one new checkpoint; received ${adapterCalls} and ${newCheckpointEntries.length}`,
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
  proofId: "requirements-change-contract-generation-v1",
  module: "requirements-gathering@0.1.0",
  plugin: "openspec@0.1.0",
  outcome: result.outcome,
  adapterCallCount: adapterCalls,
  checkpointCount: newCheckpointEntries.length,
  replayAdapterCallCount: 0,
  request: pointer(clarificationRequestDocument.ref),
  response: pointer(clarificationResponseRef),
  continuation: pointer(continuationDocument.ref),
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
  ["ClarificationRequest", clarificationRequestDocument.ref.digest],
  ["ClarificationResponse", clarificationResponseRef.digest],
  ["Continuation", continuationDocument.ref.digest],
  ["RequirementsChangeSet", requirementsChangeSetRef.digest],
  ["ProjectOverviewChangeSetDraft", overviewChangeSetRef.digest],
  ["Candidate ProjectOverview.md", candidateMarkdownRef.digest],
  ["NativeSourceBundle", nativeSourceBundleRef.digest],
  ["Terminal checkpoint", sha256Digest(checkpointBytes)],
  ["Execution proof", sha256Digest(executionProofBytes)],
];
const gateReview = [
  "# Requirements Gate candidate: ContractGeneration module",
  "",
  "Status: **awaiting owner approval**",
  "",
  "## Exact bindings",
  "",
  ...gateBindings.map(([label, digest]) => `- ${label}: ${digest}`),
  "",
  "## Gate findings",
  "",
  "- PASS: all four checkpoint-bound clarification questions have one exact approved response.",
  "- PASS: the candidate preserves all unchanged requirements byte-for-byte at the entity level and adds only ContractGeneration-specific requirements.",
  "- PASS: separate state-routed operations and ContractGate-owned ApprovedNotApplicable are explicit.",
  "- PASS: generators remain untrusted; Core owns pinned format validation and canonical diff; ContractGate owns semantic and promotion authority.",
  "- PASS: the live V1 path is JSON Schema 2020-12; OpenAPI, AsyncAPI, and Protobuf remain optional fixture-conformant bindings behind the same contract.",
  "- PASS: typed draft/change-set outputs and separate candidate/approved traceability projections are required.",
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
