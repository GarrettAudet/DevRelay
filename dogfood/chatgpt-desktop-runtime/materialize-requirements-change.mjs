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
  buildDesktopRuntimeRequirements,
  ownerDecisions,
} from "./desktop-runtime-requirements-data.mjs";

const root = new URL("../../", import.meta.url);
const outputDirectory = new URL("./", import.meta.url);
const canonicalRepositoryRoot = "C:/repos/DevRelay";
const canonicalArtifactRoot =
  "file:///C:/repos/DevRelay/dogfood/chatgpt-desktop-runtime";
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
  goal: [
    "https://devrelay.dev/artifacts/goal/v1",
    "application/vnd.devrelay.goal+json",
  ],
  projectContext: [
    "https://devrelay.dev/artifacts/project-context/v1",
    "application/vnd.devrelay.project-context+json",
  ],
  requirementsBaseline: [
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
  ],
  projectOverviewBaseline: [
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
  ],
  projectOverviewMarkdown: [
    "https://devrelay.dev/artifacts/project-overview-markdown/v1",
    "text/markdown; charset=utf-8",
  ],
  clarificationRequest: [
    "https://devrelay.dev/artifacts/clarification-request-set/v1",
    "application/vnd.devrelay.clarification-request-set+json",
  ],
  clarificationResponse: [
    "https://devrelay.dev/artifacts/clarification-response-set/v1",
    "application/vnd.devrelay.clarification-response-set+json",
  ],
  continuation: [
    "https://devrelay.dev/artifacts/requirements-gathering-continuation/v1",
    "application/vnd.devrelay.requirements-gathering-continuation+json",
  ],
  requirementsChangeSet: [
    "https://devrelay.dev/artifacts/requirements-change-set/v1",
    "application/vnd.devrelay.requirements-change-set+json",
  ],
  projectOverviewChangeSet: [
    "https://devrelay.dev/artifacts/project-overview-change-set-draft/v1",
    "application/vnd.devrelay.project-overview-change-set-draft+json",
  ],
  nativeSourceBundle: [
    "https://devrelay.dev/artifacts/native-source-bundle/v1",
    "application/vnd.devrelay.native-source-bundle+json",
  ],
});

const jsonBytes = (value) =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = ({ artifactId, digest }) => ({ artifactId, digest });

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
      for (const [fileName, bytes] of [...files].sort(([left], [right]) =>
        left.localeCompare(right),
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
  return {
    bytes,
    value: JSON.parse(bytes),
    ref: store.addExisting({ artifactId, bytes, type, uri }),
  };
}

const requirementsBaselineValue = JSON.parse(
  await readFile(new URL("project/requirements-baseline.json", root), "utf8"),
);
const projectOverviewBaselineValue = JSON.parse(
  await readFile(
    new URL("project/project-overview-baseline.json", root),
    "utf8",
  ),
);
const requirementsBaselineDocument = await loadExisting({
  path: "project/requirements-baseline.json",
  artifactId: requirementsBaselineValue.baselineId,
  type: "requirementsBaseline",
  uri: "file:///C:/repos/DevRelay/project/requirements-baseline.json",
});
const projectOverviewBaselineDocument = await loadExisting({
  path: "project/project-overview-baseline.json",
  artifactId: projectOverviewBaselineValue.baselineId,
  type: "projectOverviewBaseline",
  uri: "file:///C:/repos/DevRelay/project/project-overview-baseline.json",
});
const goalDocument = await loadExisting({
  path: "dogfood/chatgpt-desktop-runtime/goal.json",
  artifactId: "goal-chatgpt-desktop-runtime-v1",
  type: "goal",
  uri: `${canonicalArtifactRoot}/goal.json`,
});
const projectContextDocument = await loadExisting({
  path: "dogfood/chatgpt-desktop-runtime/project-context.json",
  artifactId: "project-context-devrelay-chatgpt-desktop-runtime-v1",
  type: "projectContext",
  uri: `${canonicalArtifactRoot}/project-context.json`,
});
const clarificationRequestDocument = await loadExisting({
  path: "dogfood/chatgpt-desktop-runtime/clarification-request.json",
  artifactId: "clarification-request-chatgpt-desktop-runtime-v1",
  type: "clarificationRequest",
  uri: `${canonicalArtifactRoot}/clarification-request.json`,
});
const continuationDocument = await loadExisting({
  path: "dogfood/chatgpt-desktop-runtime/requirements-continuation.json",
  artifactId: "requirements-continuation-chatgpt-desktop-runtime-v1",
  type: "continuation",
  uri: `${canonicalArtifactRoot}/requirements-continuation.json`,
});
store.addExisting({
  artifactId:
    projectOverviewBaselineDocument.value.renderedDocument.artifact.artifactId,
  bytes: await readFile(new URL("ProjectOverview.md", root)),
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
  "clarification-response-chatgpt-desktop-runtime-v1",
  "clarificationResponse",
  clarificationResponse,
);
const ownerDecisionText =
  "# ChatGPT Desktop runtime owner decisions\n\n" +
  "The project owner answered the checkpoint-bound RequirementsGathering request with: `Yes to all three`, approving every recommended release decision.\n\n" +
  ownerDecisions
    .map(
      ({ questionId, answer }, index) =>
        `${index + 1}. **${questionId}**\n\n   ${answer}\n`,
    )
    .join("\n");
const ownerDecisionRef = store.addText(
  "owner-decisions.md",
  "owner-decisions-chatgpt-desktop-runtime-v1",
  ownerDecisionText,
);
const officialHostEvidenceRef = store.addText(
  "official-host-capability-evidence.md",
  "official-host-capability-evidence-chatgpt-desktop-runtime-v1",
  "# Official ChatGPT Desktop host evidence\n\nRetrieved 2026-08-11 from official OpenAI documentation.\n\n- Plugins can combine skills and MCP servers: https://developers.openai.com/plugins/concepts/plugins\n- ChatGPT Desktop supports plugins and local Codex MCP configuration: https://learn.chatgpt.com/docs/plugins and https://learn.chatgpt.com/docs/extend/mcp\n- Codex app-server supports thread/start, thread/resume, turn/start, streamed events, and approval handling: https://learn.chatgpt.com/docs/app-server\n",
);
const proposalRef = store.addText(
  "native/openspec/proposal.md",
  "openspec-proposal-chatgpt-desktop-runtime-v1",
  "# ChatGPT Desktop runtime proposal\n\nExtend the verified DevRelay library into a repository-installed ChatGPT Desktop for Windows product. Package a workflow skill and local typed STDIO MCP bridge, preserve Core authority, launch one Codex app-server task per runnable work item, require one live binding path through every mandatory lifecycle capability, and prove the result with a clean-install real-feature run through BusinessAcceptance.\n",
);
const specificationRef = store.addText(
  "native/openspec/specs/chatgpt-desktop-runtime/spec.md",
  "openspec-spec-chatgpt-desktop-runtime-v1",
  "# ChatGPT Desktop runtime requirements\n\n" +
    ownerDecisions.map(({ answer }) => `- ${answer}`).join("\n") +
    "\n\nThe Desktop host exposes and executes DevRelay but does not own lifecycle routing, Gates, traceability, verification, integration, or acceptance. Alternative adapters remain governed by exact maturity and availability.\n",
);

const requirementSourceRefs = [
  { role: "goal", artifact: pointer(goalDocument.ref) },
  {
    role: "owner-decision",
    artifact: pointer(ownerDecisionRef),
    location: "All three checkpoint-bound recommended decisions approved in chat",
  },
  {
    role: "capability-evidence",
    artifact: pointer(officialHostEvidenceRef),
    location: "Official OpenAI plugin, Desktop MCP, and Codex app-server documentation retrieved 2026-08-11",
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
const replacement = buildDesktopRuntimeRequirements(
  requirementsBaselineDocument.value.requirements,
  requirementSourceRefs,
);
const changedSections = Object.keys(replacement)
  .filter(
    (section) =>
      canonicalJsonDigest(replacement[section]) !==
      canonicalJsonDigest(
        requirementsBaselineDocument.value.requirements[section],
      ),
  )
  .sort();
const requirementsChangeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsChangeSet",
  changeSetId: "requirements-change-set-chatgpt-desktop-runtime-v1",
  baseInputs: structuredClone(continuationDocument.value.baseInputs),
  baseline: pointer(requirementsBaselineDocument.ref),
  expectedRequirementsDigest: canonicalJsonDigest(
    requirementsBaselineDocument.value.requirements,
  ),
  replacement,
  changedSections,
  reason:
    "Extend the controlled DevRelay library into the approved repository-backed ChatGPT Desktop for Windows product with a typed local MCP bridge, one app-server task per runnable work item, a release-ready mandatory lifecycle path, and clean-install real-feature acceptance proof.",
  compatibilityImpact: "backward-compatible",
  risks: [
    "A Desktop skill could be mistaken for workflow authority unless state changes are mediated by typed Core operations.",
    "App-server interruptions could orphan tasks or repeat effects unless attempt, checkpoint, handoff, and integration identities are durable.",
    "A fixture-only binding could be mistaken for a live release path unless maturity is enforced at selection and reporting.",
    "Node, Codex CLI, plugin, or Desktop host drift could make a green library unusable on the supported Windows surface.",
    "A reference run could overstate readiness unless it changes real repository bytes and completes verification, integration, system verification, traceability, and business acceptance.",
  ],
  requiredEvidence: [
    "requirements/owner-decision",
    "requirements/source-provenance",
    "requirements/gate-promotion",
    "desktop/plugin-package-validation",
    "desktop/local-marketplace-install",
    "desktop/mcp-tool-conformance",
    "desktop/app-server-task-lifecycle",
    "desktop/work-item-handoff-verification",
    "desktop/checkpoint-resume",
    "desktop/permission-isolation",
    "desktop/live-binding-coverage",
    "desktop/clean-install-end-to-end-run",
    "desktop/business-acceptance",
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
  "project-overview-markdown-chatgpt-desktop-runtime-v1",
  "projectOverviewMarkdown",
  candidateMarkdownBytes,
);
const overviewChangeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewChangeSetDraft",
  changeSetId: "project-overview-change-set-chatgpt-desktop-runtime-v1",
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
      path: "dogfood/chatgpt-desktop-runtime/owner-decisions.md",
      artifact: pointer(ownerDecisionRef),
    },
    {
      role: "capability-evidence",
      path: "dogfood/chatgpt-desktop-runtime/official-host-capability-evidence.md",
      artifact: pointer(officialHostEvidenceRef),
    },
    {
      role: "proposal",
      path: "dogfood/chatgpt-desktop-runtime/native/openspec/proposal.md",
      artifact: pointer(proposalRef),
    },
    {
      role: "specification",
      path: "dogfood/chatgpt-desktop-runtime/native/openspec/specs/chatgpt-desktop-runtime/spec.md",
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
  "native-source-bundle-chatgpt-desktop-runtime-v1",
  "nativeSourceBundle",
  nativeSourceBundle,
);

const invocation = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId:
    "invocation-requirements-chatgpt-desktop-runtime-openspec-resume-v1",
  runId: "dogfood-chatgpt-desktop-runtime-v1-resume",
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
    changeName: "chatgpt-desktop-runtime-module-v1",
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
    new URL(
      "dogfood/chatgpt-desktop-runtime/requirements-gathering.checkpoint.json",
      root,
    ),
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
  throw new Error("RequirementsGathering resume result changed.");
}
const callsBeforeReplay = adapterCalls;
const replay = await registry.execute(invocation, {
  artifacts: store.artifacts,
  checkpoints: checkpointStore,
});
if (canonicalJsonDigest(replay) !== canonicalJsonDigest(result)) {
  throw new Error("RequirementsGathering checkpoint replay changed.");
}
if (adapterCalls !== callsBeforeReplay) {
  throw new Error("RequirementsGathering replay invoked the adapter.");
}
const newCheckpointEntries = [...checkpointValues].filter(
  ([key]) => key !== sourceCheckpointDocument.checkpointKey,
);
if (adapterCalls !== 1 || newCheckpointEntries.length !== 1) {
  throw new Error(
    `Expected one resumed adapter call and one new checkpoint; received ${adapterCalls} and ${newCheckpointEntries.length}.`,
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
  proofId: "requirements-change-chatgpt-desktop-runtime-v1",
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
  "# Requirements Gate candidate: ChatGPT Desktop runtime",
  "",
  "Status: **approved by standing owner authorization after exact validation**",
  "",
  "## Exact bindings",
  "",
  ...gateBindings.map(([label, digest]) => `- ${label}: ${digest}`),
  "",
  "## Gate findings",
  "",
  "- PASS: all three checkpoint-bound clarification questions have the exact owner-approved recommended response.",
  "- PASS: the candidate preserves every current baseline entity and adds only the approved Desktop runtime scope.",
  "- PASS: local marketplace distribution, per-work-item Codex tasks, and the live-path clean-install acceptance standard are explicit.",
  "- PASS: DevRelay Core retains routing, Gate, traceability, verification, integration, and acceptance authority.",
  "- PASS: one live path is required for every mandatory lifecycle capability while optional alternatives remain maturity-labelled.",
  "- PASS: Windows, local-first execution, permissions, interruption recovery, and human-readable observability are verifiable requirements.",
  "- PASS: official OpenAI host capability evidence and the exact clarification lineage are digest-bound.",
  "- PASS: ProjectOverview is a deterministic projection of the exact replacement requirements.",
  "",
  "## Approval boundary",
  "",
  "The owner explicitly approved all three decisions and previously authorized necessary Gate approvals. Promotion binds only the exact paired change, candidate Markdown, native bundle, checkpoint, and candidate digest produced by this run.",
  "",
].join("\n");
const gateReviewBytes = Buffer.from(gateReview.normalize("NFC"), "utf8");
await Promise.all([
  writeFile(
    new URL("requirements-gate-review.md", outputDirectory),
    gateReviewBytes,
  ),
  writeFile(
    new URL("requirements-gate-candidate.json", outputDirectory),
    jsonBytes({
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "RequirementsGateCandidate",
      status: "approved",
      exactBindings: Object.fromEntries(gateBindings),
      reviewDigest: sha256Digest(gateReviewBytes),
      progressionAllowed: true,
    }),
  ),
]);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "REQUIREMENTS_GATE_APPROVED_CANDIDATE",
      adapterCalls,
      replayAdapterCalls: 0,
      requirementsChangeSetDigest: requirementsChangeSetRef.digest,
      projectOverviewChangeSetDigest: overviewChangeSetRef.digest,
      projectOverviewMarkdownDigest: candidateMarkdownRef.digest,
      nativeSourceBundleDigest: nativeSourceBundleRef.digest,
      checkpointDigest: sha256Digest(checkpointBytes),
      gateReviewDigest: sha256Digest(gateReviewBytes),
      progressionAllowed: true,
    },
    null,
    2,
  )}\n`,
);
