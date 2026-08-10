import { mkdir, readFile, writeFile } from "node:fs/promises";

import { sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import {
  goal,
  projectContext,
  questions,
} from "./work-execution-clarification-data.mjs";

const root = new URL("../../", import.meta.url);
const outputDirectory = new URL("./", import.meta.url);
const canonicalRepositoryRoot = "C:/repos/DevRelay";
const canonicalArtifactRoot =
  "file:///C:/repos/DevRelay/dogfood/work-execution";

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
  clarificationRequest: Object.freeze([
    "https://devrelay.dev/artifacts/clarification-request-set/v1",
    "application/vnd.devrelay.clarification-request-set+json",
  ]),
  continuation: Object.freeze([
    "https://devrelay.dev/artifacts/requirements-gathering-continuation/v1",
    "application/vnd.devrelay.requirements-gathering-continuation+json",
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
});

const jsonBytes = (value) =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = (ref) => ({ artifactId: ref.artifactId, digest: ref.digest });

function createArtifactStore() {
  const values = new Map();
  const files = new Map();
  return Object.freeze({
    addJson(fileName, artifactId, type, value) {
      const bytes = jsonBytes(value);
      const [schema, mediaType] = artifactTypes[type];
      const ref = Object.freeze({
        artifactId,
        schema,
        mediaType,
        digest: sha256Digest(bytes),
        uri: `${canonicalArtifactRoot}/${fileName}`,
      });
      values.set(artifactId, bytes);
      files.set(fileName, bytes);
      return ref;
    },
    addExisting(artifactId, type, bytes, uri) {
      const [schema, mediaType] = artifactTypes[type];
      const ref = Object.freeze({
        artifactId,
        schema,
        mediaType,
        digest: sha256Digest(bytes),
        uri,
      });
      values.set(artifactId, Buffer.from(bytes));
      return ref;
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
        await writeFile(new URL(fileName, outputDirectory), bytes);
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
  "project-context-devrelay-work-execution-v1",
  "projectContext",
  projectContext,
);
const baseInputs = Object.freeze([
  Object.freeze({ role: "goal", artifact: pointer(goalRef) }),
  Object.freeze({ role: "project-context", artifact: pointer(projectContextRef) }),
  Object.freeze({
    role: "requirements-baseline",
    artifact: pointer(requirementsBaselineRef),
  }),
  Object.freeze({
    role: "project-overview-baseline",
    artifact: pointer(projectOverviewBaselineRef),
  }),
]);
const sourceRefs = () => [
  { role: "goal", artifact: pointer(goalRef) },
  { role: "project-context", artifact: pointer(projectContextRef) },
  { role: "requirements-baseline", artifact: pointer(requirementsBaselineRef) },
  { role: "project-overview-baseline", artifact: pointer(projectOverviewBaselineRef) },
];

const workingRequirementSourceRefs = [
  { role: "project-overview-baseline", artifact: pointer(projectOverviewBaselineRef) },
  { role: "requirements-baseline", artifact: pointer(requirementsBaselineRef) },
];
function rebaseWorkingSourceRefs(value) {
  if (Array.isArray(value)) return value.map(rebaseWorkingSourceRefs);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === "sourceRefs"
        ? structuredClone(workingRequirementSourceRefs)
        : rebaseWorkingSourceRefs(child),
    ]),
  );
}
const invocation = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId: "invocation-requirements-work-execution-openspec-clarify-v1",
  runId: "dogfood-work-execution-v1",
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
    "requirements-baseline": [requirementsBaselineRef],
    "project-overview-baseline": [projectOverviewBaselineRef],
  },
  options: {},
  config: {
    projectRoot: canonicalRepositoryRoot,
    toolName: "OpenSpec",
    toolVersion: "conversation-contract-v1",
    nativeOperation: "requirements.gather",
    changeName: "work-execution-module-v1",
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

const checkpoints = createCheckpointStore();
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
        async invoke(_invocation, _adapterContext, producer) {
          adapterCalls += 1;
          const clarificationRequest = {
            apiVersion: "devrelay.dev/v1alpha1",
            kind: "ClarificationRequestSet",
            requestSetId: "clarification-request-work-execution-v1",
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
            continuationId: "requirements-continuation-work-execution-v1",
            clarificationRequest: pointer(clarificationRequestRef),
            baseInputs,
            sourceInvocation: {
              invocationId: producer.invocationId,
              invocationFingerprint: producer.invocationFingerprint,
              stepInvocationDigest: producer.stepInvocationDigest,
              plugin: structuredClone(producer.plugin),
            },
            workingRequirements: rebaseWorkingSourceRefs(requirementsBaseline.requirements),
            confirmedFacts: [
              "The approved WorkBreakdownBaseline defines the complete work-item assignment universe.",
              "WorkExecution is selected and WorkExecution is blocked until WorkExecutionGate promotes a complete baseline.",
              "The exact approved WorkDependencyBaseline supplies immutable ordering context without transferring DAG authority.",
              "Adapters cannot route, approve, mutate TraceabilityGraph, or select undeclared contract kinds.",
              "WorkExecutionGate owns exact WorkExecutionBaseline authority.",
              "No promotable WorkExecution module requirements change exists until every blocking question is answered.",
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
  checkpoints: checkpoints.store,
});
if (result.outcome !== "needs_clarification") {
  throw new Error(`Unexpected outcome ${result.outcome}.`);
}
if (adapterCalls !== 1 || checkpoints.values.size !== 1) {
  throw new Error(
    `Expected one adapter call and checkpoint, received ${adapterCalls} and ${checkpoints.values.size}.`,
  );
}

await store.writeAll();
const [[checkpointKey, checkpointValue]] = checkpoints.values.entries();
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
  proofId: "requirements-clarification-work-execution-v1",
  module: "requirements-gathering@0.1.0",
  plugin: "openspec@0.1.0",
  invocationId: invocation.invocationId,
  invocationFingerprint: continuation.sourceInvocation.invocationFingerprint,
  stepInvocationDigest: continuation.sourceInvocation.stepInvocationDigest,
  outcome: result.outcome,
  adapterCallCount: adapterCalls,
  checkpointCount: checkpoints.values.size,
  checkpointKey,
  checkpointDigest: sha256Digest(checkpointBytes),
  request: pointer(clarificationRequestRef),
  continuation: pointer(continuationRef),
  requirementsBaseline: pointer(requirementsBaselineRef),
  projectOverviewBaseline: pointer(projectOverviewBaselineRef),
  resultDigest: sha256Digest(resultBytes),
  promotableCandidateProduced: false,
  architectureProgressionAllowed: false,
  specialistAssignmentImplementationAllowed: false,
};
await writeFile(
  new URL("runtime-execution-proof.json", outputDirectory),
  jsonBytes(executionProof),
);

const transcript =
  "# WorkExecution RequirementsGathering clarification\n\n" +
  "Status: `needs_clarification`\n\n" +
  "RequirementsGathering executed as a change against the exact approved DevRelay requirements and ProjectOverview baselines through the bounded `openspec@0.1.0` contract. No OpenSpec CLI execution is claimed, no promotable change candidate exists, and WorkExecution architecture and implementation are blocked until every question below is answered.\n\n" +
  questions.map((question, index) =>
    `${index + 1}. **${question.prompt}**\n\n` +
    question.options.map((option) => `   - ${option}`).join("\n") +
    `\n\n   Why it matters: ${question.rationale}\n`
  ).join("\n");
await writeFile(
  new URL("clarification-transcript.md", outputDirectory),
  Buffer.from(transcript.normalize("NFC"), "utf8"),
);
await writeFile(
  new URL("README.md", outputDirectory),
  Buffer.from(
    "# WorkExecution dogfood\n\n" +
      "Current state: RequirementsGathering is checkpointed at `needs_clarification`. The exact request, continuation, approved baseline inputs, and effect checkpoint form the resumable package. No WorkExecution requirements change, architecture candidate, assignment contract, or implementation is authorized.\n",
    "utf8",
  ),
);

process.stdout.write(`${JSON.stringify({
  outcome: result.outcome,
  questions: questions.length,
  adapterCalls,
  checkpoints: checkpoints.values.size,
  requestDigest: clarificationRequestRef.digest,
  continuationDigest: continuationRef.digest,
  checkpointDigest: executionProof.checkpointDigest,
  resultDigest: executionProof.resultDigest,
}, null, 2)}\n`);
