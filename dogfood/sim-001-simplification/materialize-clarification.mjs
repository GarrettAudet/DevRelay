import { mkdir, readFile, writeFile } from "node:fs/promises";

import { sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import {
  goal,
  projectContext,
  questions,
} from "./sim-001-simplification-clarification-data.mjs";

const root = new URL("../../", import.meta.url);
const outputDirectory = new URL("./", import.meta.url);
const canonicalRepositoryRoot = "C:/repos/DevRelay";
const canonicalArtifactRoot =
  "file:///C:/repos/DevRelay/dogfood/sim-001-simplification";
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
  repositorySnapshot: [
    "https://devrelay.dev/artifacts/repository-snapshot/v1",
    "application/vnd.devrelay.repository-snapshot+json",
  ],
  clarificationRequest: [
    "https://devrelay.dev/artifacts/clarification-request-set/v1",
    "application/vnd.devrelay.clarification-request-set+json",
  ],
  continuation: [
    "https://devrelay.dev/artifacts/requirements-gathering-continuation/v1",
    "application/vnd.devrelay.requirements-gathering-continuation+json",
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
});

const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const pointer = ({ artifactId, digest }) => ({ artifactId, digest });

function createArtifactStore() {
  const values = new Map();
  const files = new Map();
  const add = (fileName, artifactId, type, bytes, uri) => {
    const [schema, mediaType] = artifactTypes[type];
    const ref = Object.freeze({
      artifactId,
      schema,
      mediaType,
      digest: sha256Digest(bytes),
      uri: uri ?? `${canonicalArtifactRoot}/${fileName}`,
    });
    values.set(artifactId, Buffer.from(bytes));
    if (fileName !== undefined) files.set(fileName, Buffer.from(bytes));
    return ref;
  };
  return Object.freeze({
    addJson(fileName, artifactId, type, value) {
      return add(fileName, artifactId, type, jsonBytes(value));
    },
    addExisting(artifactId, type, bytes, uri) {
      return add(undefined, artifactId, type, bytes, uri);
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
      for (const [fileName, bytes] of [...files].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        await writeFile(new URL(fileName, outputDirectory), bytes);
      }
    },
  });
}

const requirementsBaselineBytes = await readFile(
  new URL("project/requirements-baseline.json", root),
);
const projectOverviewBaselineBytes = await readFile(
  new URL("project/project-overview-baseline.json", root),
);
const projectOverviewMarkdownBytes = await readFile(
  new URL("ProjectOverview.md", root),
);
const requirementsBaseline = JSON.parse(requirementsBaselineBytes);
const projectOverviewBaseline = JSON.parse(projectOverviewBaselineBytes);
const store = createArtifactStore();
const requirementsBaselineRef = store.addExisting(
  requirementsBaseline.baselineId,
  "requirementsBaseline",
  requirementsBaselineBytes,
  "file:///C:/repos/DevRelay/project/requirements-baseline.json",
);
const projectOverviewBaselineRef = store.addExisting(
  projectOverviewBaseline.baselineId,
  "projectOverviewBaseline",
  projectOverviewBaselineBytes,
  "file:///C:/repos/DevRelay/project/project-overview-baseline.json",
);
store.addExisting(
  projectOverviewBaseline.renderedDocument.artifact.artifactId,
  "projectOverviewMarkdown",
  projectOverviewMarkdownBytes,
  "file:///C:/repos/DevRelay/ProjectOverview.md",
);
const goalRef = store.addJson("goal.json", goal.goalId, "goal", goal);
const projectContextRef = store.addJson(
  "project-context.json",
  "project-context-devrelay-sim-001-simplification-v1",
  "projectContext",
  projectContext,
);
const repositorySnapshotBytes = await readFile(new URL("repository-snapshot.json", outputDirectory));
const repositorySnapshot = JSON.parse(repositorySnapshotBytes);
const repositorySnapshotRef = store.addExisting(
  `repository-snapshot-devrelay-${repositorySnapshot.revision.slice(0, 7)}`,
  "repositorySnapshot",
  repositorySnapshotBytes,
  `${canonicalArtifactRoot}/repository-snapshot.json`,
);
const baseInputs = Object.freeze([
  Object.freeze({ role: "goal", artifact: pointer(goalRef) }),
  Object.freeze({ role: "project-context", artifact: pointer(projectContextRef) }),
  Object.freeze({ role: "repository-snapshot", artifact: pointer(repositorySnapshotRef) }),
  Object.freeze({
    role: "requirements-baseline",
    artifact: pointer(requirementsBaselineRef),
  }),
  Object.freeze({
    role: "project-overview-baseline",
    artifact: pointer(projectOverviewBaselineRef),
  }),
]);
const sourceRefs = () => structuredClone(baseInputs);
const workingSourceRefs = [
  { role: "project-overview-baseline", artifact: pointer(projectOverviewBaselineRef) },
  { role: "requirements-baseline", artifact: pointer(requirementsBaselineRef) },
];
function rebaseSourceRefs(value) {
  if (Array.isArray(value)) return value.map(rebaseSourceRefs);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === "sourceRefs"
        ? structuredClone(workingSourceRefs)
        : rebaseSourceRefs(child),
    ]),
  );
}

const invocation = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId:
    "invocation-requirements-sim-001-simplification-openspec-clarify-v1",
  runId: "dogfood-sim-001-simplification-v1",
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
    "requirements-baseline": [requirementsBaselineRef],
    "project-overview-baseline": [projectOverviewBaselineRef],
  },
  options: {},
  config: {
    projectRoot: canonicalRepositoryRoot,
    toolName: "OpenSpec",
    toolVersion: "conversation-contract-v1",
    nativeOperation: "requirements.gather",
    changeName: "sim-001-simplification-module-v1",
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

const checkpointValues = new Map();
const checkpoints = Object.freeze({
  async get(key) {
    return checkpointValues.get(key);
  },
  async put(key, value) {
    checkpointValues.set(key, value);
  },
});
let adapterCalls = 0;
let clarificationRequestRef;
let continuationRef;
let continuation;
const registry = createModuleRegistry({
  modules: [moduleDefinition],
  plugins: [
    {
      definition: pluginDefinition,
      adapter: {
        async invoke(_adapterInvocation, _adapterContext, producer) {
          adapterCalls += 1;
          const clarificationRequest = {
            apiVersion: "devrelay.dev/v1alpha1",
            kind: "ClarificationRequestSet",
            requestSetId: "clarification-request-sim-001-simplification-v1",
            baseInputs,
            questions,
          };
          clarificationRequestRef = store.addJson(
            "clarification-request.json",
            clarificationRequest.requestSetId,
            "clarificationRequest",
            clarificationRequest,
          );
          continuation = {
            apiVersion: "devrelay.dev/v1alpha1",
            kind: "RequirementsGatheringContinuation",
            continuationId: "requirements-continuation-sim-001-simplification-v1",
            clarificationRequest: pointer(clarificationRequestRef),
            baseInputs,
            sourceInvocation: {
              invocationId: producer.invocationId,
              invocationFingerprint: producer.invocationFingerprint,
              stepInvocationDigest: producer.stepInvocationDigest,
              plugin: structuredClone(producer.plugin),
            },
            workingRequirements: rebaseSourceRefs(requirementsBaseline.requirements),
            confirmedFacts: [
              "The approved DevRelay requirements and ProjectOverview baseline pair is the authoritative brownfield input.",
              "ChatGPT Desktop on Windows is the release-defining product host.",
              "Generic Core and semantic Module contracts remain provider-neutral and domain-neutral.",
              "Adapters cannot route, approve, mutate TraceabilityGraph, declare requirements closure, or choose lifecycle progression.",
              "The owner assessment identifies live ecosystem integration and adaptive exhaustive requirements elicitation as the SIM-001 priorities.",
              "No promotable SIM-001 simplification requirements change exists until every blocking question is answered and deterministic closure is proven.",
            ],
            unresolvedQuestionIds: questions.map(({ id }) => id),
            sourceRefs: sourceRefs(),
          };
          continuationRef = store.addJson(
            "requirements-continuation.json",
            continuation.continuationId,
            "continuation",
            continuation,
          );
          return {
            apiVersion: "devrelay.dev/v1alpha1",
            kind: "ModuleResult",
            invocationId: invocation.invocationId,
            status: "completed",
            outcome: "needs_clarification",
            outputs: {
              "clarification-requests": [clarificationRequestRef],
              continuation: [continuationRef],
            },
            evidence: [],
            diagnostics: [],
          };
        },
      },
    },
  ],
  artifactContracts: requirementsRuntimeArtifactContracts(),
});

const result = await registry.execute(invocation, {
  artifacts: store.artifacts,
  checkpoints,
});
if (result.outcome !== "needs_clarification") {
  throw new Error(`Unexpected outcome ${result.outcome}.`);
}
if (adapterCalls !== 1 || checkpointValues.size !== 1) {
  throw new Error(
    `Expected one adapter call and checkpoint, received ${adapterCalls} and ${checkpointValues.size}.`,
  );
}
const replayResult = await registry.execute(invocation, {
  artifacts: store.artifacts,
  checkpoints,
});
if (
  adapterCalls !== 1 ||
  checkpointValues.size !== 1 ||
  JSON.stringify(replayResult) !== JSON.stringify(result)
) {
  throw new Error(
    "Expected byte-equivalent checkpoint replay with zero additional adapter calls.",
  );
}
await store.writeAll();
const [[checkpointKey, checkpointValue]] = checkpointValues;
const checkpointBundle = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EffectCheckpointBundle",
  checkpointKey,
  checkpoint: checkpointValue,
};
const checkpointBytes = jsonBytes(checkpointBundle);
const resultBytes = jsonBytes(result);
await Promise.all([
  writeFile(
    new URL("requirements-gathering.checkpoint.json", outputDirectory),
    checkpointBytes,
  ),
  writeFile(
    new URL("requirements-gathering.invocation.json", outputDirectory),
    jsonBytes(invocation),
  ),
  writeFile(
    new URL("requirements-gathering.result.json", outputDirectory),
    resultBytes,
  ),
]);
const executionProof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "DogfoodExecutionProof",
  proofId: "requirements-clarification-sim-001-simplification-v1",
  module: "requirements-gathering@0.1.0",
  plugin: "openspec@0.1.0",
  invocationId: invocation.invocationId,
  invocationFingerprint: continuation.sourceInvocation.invocationFingerprint,
  stepInvocationDigest: continuation.sourceInvocation.stepInvocationDigest,
  outcome: result.outcome,
  adapterCallCount: adapterCalls,
  replayAdapterCallCount: 0,
  replayResultDigest: sha256Digest(jsonBytes(replayResult)),
  checkpointCount: checkpointValues.size,
  checkpointKey,
  checkpointDigest: sha256Digest(checkpointBytes),
  request: pointer(clarificationRequestRef),
  continuation: pointer(continuationRef),
  requirementsBaseline: pointer(requirementsBaselineRef),
  projectOverviewBaseline: pointer(projectOverviewBaselineRef),
  repositorySnapshot: pointer(repositorySnapshotRef),
  resultDigest: sha256Digest(resultBytes),
  promotableCandidateProduced: false,
  architectureProgressionAllowed: false,
  simplificationImplementationAllowed: false,
};
await writeFile(
  new URL("runtime-execution-proof.json", outputDirectory),
  jsonBytes(executionProof),
);
const transcript =
  "# SIM-001 simplification RequirementsGathering clarification\n\n" +
  "Status: `needs_clarification`\n\n" +
  "RequirementsGathering executed as a change against the exact approved DevRelay requirements and ProjectOverview baselines through the bounded `openspec@0.1.0` contract. No OpenSpec CLI execution is claimed, no promotable change candidate exists, and SIM-001 simplification design and implementation are blocked until every question below is answered.\n\n" +
  questions
    .map(
      (question, index) =>
        `${index + 1}. **${question.prompt}**\n\n` +
        (question.options ?? []).map((option) => `   - ${option}`).join("\n") +
        `\n\n   Why it matters: ${question.rationale}\n`,
    )
    .join("\n");
await Promise.all([
  writeFile(
    new URL("clarification-transcript.md", outputDirectory),
    Buffer.from(transcript.normalize("NFC")),
  ),
  writeFile(
    new URL("README.md", outputDirectory),
    Buffer.from(
      "# SIM-001 simplification dogfood\n\n" +
        "Current state: RequirementsGathering is checkpointed at `needs_clarification`. The exact request, continuation, approved baseline inputs, and effect checkpoint form the resumable package. No SIM-001 simplification requirements change, architecture candidate, work breakdown, or implementation is authorized.\n",
    ),
  ),
]);
process.stdout.write(
  `${JSON.stringify(
    {
      outcome: result.outcome,
      questions: questions.length,
      adapterCalls,
      checkpoints: checkpointValues.size,
      requestDigest: clarificationRequestRef.digest,
      continuationDigest: continuationRef.digest,
      checkpointDigest: executionProof.checkpointDigest,
      resultDigest: executionProof.resultDigest,
    },
    null,
    2,
  )}\n`,
);
