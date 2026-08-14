import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import {
  createCanonicalWorkExecutionInput,
  createInMemoryWorkExecutionCheckpointStore,
  deriveRunnableFrontierProof,
  executeWorkItem,
  loadWorkExecutionInput,
} from "../../../src/work-execution-runtime.mjs";
import { TRACEABILITY_VOCABULARY_V1_6 } from "../../../src/traceability-artifact-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../../../src/traceability-graph.mjs";
import { workExecutionTraceabilityContributor } from "../../../src/work-execution-traceability-contributor.mjs";

const API = "devrelay.dev/v1alpha1";
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../..");
const output = (...parts) => path.join(directory, ...parts);
const readBytes = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const readJson = (relativePath) => JSON.parse(readBytes(relativePath));
const writeBytes = (relativePath, bytes) => {
  const target = output(relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
};
const writeJson = (relativePath, value) =>
  writeBytes(relativePath, Buffer.from(`${canonicalJson(value)}\n`, "utf8"));
const ref = (artifactId, schema, mediaType, digest, uri) => ({
  artifactId,
  schema,
  mediaType,
  digest,
  ...(uri ? { uri } : {}),
});
const canonicalLoaded = (value, artifactId, schema, mediaType) =>
  createCanonicalWorkExecutionInput({ value, ref: ref(artifactId, schema, mediaType) });
const rawLoaded = (relativePath, artifactId, schema, mediaType) => {
  const bytes = readBytes(relativePath);
  return loadWorkExecutionInput({
    bytes,
    ref: ref(
      artifactId,
      schema,
      mediaType,
      sha256Digest(bytes),
      `file://${path.join(root, relativePath).replaceAll("\\", "/")}`,
    ),
    label: relativePath,
  });
};
const canonicalArtifact = (value, artifactId, schema, mediaType) => {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const digest = sha256Digest(bytes);
  return {
    value,
    bytes,
    ref: ref(
      artifactId,
      schema,
      mediaType,
      digest,
      `memory://devrelay/artifacts/${encodeURIComponent(artifactId)}/${digest.slice(7)}.json`,
    ),
  };
};
const sealBody = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !["apiVersion", "kind", field].includes(key),
      ),
    ),
  ),
});
const sealList = (value, field, material) => ({
  ...value,
  [field]: canonicalJsonDigest(material),
});
const gitBytes = (relativePath) =>
  Buffer.from(
    execFileSync("git", ["show", `HEAD:${relativePath}`], {
      cwd: root,
      encoding: "buffer",
      windowsHide: true,
    }),
  );
const mutation = (relativePath) => {
  const after = readBytes(relativePath);
  let before;
  try {
    before = gitBytes(relativePath);
  } catch {
    before = undefined;
  }
  return before === undefined
    ? {
        operation: "create",
        path: relativePath,
        beforeDigest: null,
        afterDigest: sha256Digest(after),
      }
    : {
        operation: "modify",
        path: relativePath,
        beforeDigest: sha256Digest(before),
        afterDigest: sha256Digest(after),
      };
};

const workBreakdown = rawLoaded(
  "project/work-breakdown-baseline.json",
  "WBB-WB-DOGFOOD",
  "https://devrelay.dev/artifacts/work-breakdown-baseline/v1",
  "application/vnd.devrelay.work-breakdown-baseline+json",
);
const workDependency = canonicalLoaded(
  readJson("project/work-dependency-baseline.json"),
  "WDB-V011-MODULE-QUALITY-002",
  "https://devrelay.dev/artifacts/work-dependency-baseline/v1",
  "application/vnd.devrelay.work-dependency-baseline+json",
);
const assignment = canonicalLoaded(
  readJson("project/specialist-assignment-baseline.json"),
  "SAB-22406E70A72F9D66",
  "https://devrelay.dev/artifacts/specialist-assignment-baseline/v1",
  "application/vnd.devrelay.specialist-assignment-baseline+json",
);
const projectOverview = canonicalLoaded(
  readJson("project/project-overview-baseline.json"),
  "project-overview-baseline-devrelay-v1-v0.11-module-quality-002",
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
);
const repository = rawLoaded(
  "dogfood/v0.11-module-quality/repository-snapshot.json",
  "repository-snapshot-devrelay-a97f1f5",
  "https://devrelay.dev/artifacts/repository-snapshot/v1",
  "application/vnd.devrelay.repository-snapshot+json",
);
const completionsValue = sealList(
  { apiVersion: API, kind: "IntegratedCompletionFactSet", facts: [] },
  "factsDigest",
  [],
);
const completions = canonicalLoaded(
  completionsValue,
  "ICFS-V011-G2-FIRST-FRONTIER",
  "https://devrelay.dev/artifacts/integrated-completion-fact-set/v1",
  "application/vnd.devrelay.integrated-completion-fact-set+json",
);

const commonPermissions = [
  { kind: "filesystem.write", scope: { values: ["src/**", "test/**"] } },
  { kind: "process.spawn", scope: { values: ["node"] } },
];
const jobs = [
  {
    workItemId: "WI-MQ-ADAPTIVE-INTERVIEW",
    attemptId: "ATT-MQ-ADAPTIVE-INTERVIEW-002",
    files: ["src/requirements-interview.mjs"],
  },
  {
    workItemId: "WI-MQ-EXECUTION-RECEIPTS",
    attemptId: "ATT-MQ-EXECUTION-RECEIPTS-002",
    files: ["src/execution-receipt.mjs"],
  },
  {
    workItemId: "WI-MQ-GDSCRIPT-DISCOVERY",
    attemptId: "ATT-MQ-GDSCRIPT-DISCOVERY-002",
    files: ["src/gdscript-discovery-analyzer.mjs"],
  },
  {
    workItemId: "WI-MQ-PROVIDER-TOOLCHAIN",
    attemptId: "ATT-MQ-PROVIDER-TOOLCHAIN-002",
    files: ["src/provider-toolchain.mjs"],
  },
  {
    workItemId: "WI-MQ-TRACE-QUERY",
    attemptId: "ATT-MQ-TRACE-QUERY-002",
    files: ["src/traceability-query-service.mjs", "src/index.mjs", "test/v0.11-frontier-one.test.mjs"],
  },
].map((job) => ({
  ...job,
  evidence: {
    artifactId: "EV-" + job.workItemId + "-002",
    command: "node --test test/v0.11-frontier-one.test.mjs",
    tests: 5,
  },
  permissions: commonPermissions,
}));

const graphHeadPath =
  "dogfood/v0.11-module-quality/assignment/promotion-v2/traceability-graph-snapshot.json";
const graphHeadValue = readJson(graphHeadPath);
const graphHeadBytes = Buffer.from(canonicalJson(graphHeadValue), "utf8");
const graphHeadRef = ref(
  `traceability-graph-devrelay-work-breakdown-r${graphHeadValue.revision}`,
  "https://devrelay.dev/artifacts/traceability-graph-snapshot/v1",
  "application/vnd.devrelay.traceability-graph+json",
  sha256Digest(graphHeadBytes),
  `memory://devrelay/traceability/devrelay%2Fwork-breakdown/snapshots/${sha256Digest(graphHeadBytes).slice(7)}.json`,
);
const updateLocations = new Map();
for (const relativePath of [
  "dogfood/architecture-discovery/work-breakdown/traceability-update.json",
  "dogfood/v0.10-release-hardening/work-breakdown/traceability-update.json",
  "project/history/traceability/updates/00920a6f6f2cf849510888a69a6e22cf1747c0889ac3d5d9d5226aff905d0b3c.json",
  "project/history/traceability/updates/4d7d052f347a91b104506510dc09dad51dceeb488bac5675a89ce7ca8af45067.json",
  "dogfood/lifecycle-run-report/work-breakdown/replay-v1/traceability-update.json",
  "dogfood/v0.11-module-quality/work-breakdown/traceability-update.json",
  "project/history/traceability/updates/d8fde060e3a21be13c5d90307dca6bda5a44e95055a31e292175dee99fabf37a.json",
  "project/history/traceability/updates/b9b77863db97ccfe1aa36c24224e5cd523030500908afb208b5883b24b6a8822.json",
  "dogfood/change-integration/work-breakdown/traceability-update.json",
  "project/history/traceability/updates/dc46268ba73b6924b2c473d2fb6294dbef7267dfd0846b72525c6fa58da84681.json",
  "dogfood/v0.11-module-quality/dependency-analysis/promotion-v2/traceability-update.json",
  "dogfood/v0.11-module-quality/assignment/promotion-v2/candidate-traceability-update.json",
  "dogfood/v0.11-module-quality/assignment/promotion-v2/approved-traceability-update.json",
]) {
  const value = readJson(relativePath);
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  updateLocations.set(sha256Digest(bytes), { relativePath, value, bytes });
}
const graphEntries = [{ ref: graphHeadRef, value: graphHeadValue, bytes: graphHeadBytes }];
for (const updateRef of graphHeadValue.appliedUpdates) {
  const found = updateLocations.get(updateRef.digest);
  if (!found) throw new Error(`missing applied update ${updateRef.digest}`);
  graphEntries.push({ ref: updateRef, value: found.value, bytes: found.bytes });
}
const graphStore = createInMemoryTraceabilityStore();
graphStore.restore(graphHeadValue.graphId, graphEntries, graphHeadRef);
const graph = createTraceabilityGraphService({
  graphId: graphHeadValue.graphId,
  projectId: graphHeadValue.projectId,
  store: graphStore,
  contributors: [workExecutionTraceabilityContributor],
  vocabulary: TRACEABILITY_VOCABULARY_V1_6,
});

const summary = {
  apiVersion: API,
  kind: "V011ModuleQualityGeneration2FirstFrontierExecutionSummary",
  inputGraph: graphHeadRef,
  executions: [],
};

for (const job of jobs) {
  const item = workBreakdown.value.workItems.find(({ id }) => id === job.workItemId);
  if (!item) throw new Error(`missing ${job.workItemId}`);
  const itemLoaded = canonicalArtifact(
    item,
    item.id,
    "https://devrelay.dev/contracts/work-breakdown-artifacts.schema.json#/$defs/workItemDraft",
    "application/vnd.devrelay.work-item-draft+json",
  );
  const readiness = deriveRunnableFrontierProof({
    workItemId: item.id,
    workBreakdownBaseline: workBreakdown,
    workDependencyBaseline: workDependency,
    integratedCompletionFacts: completions,
  });
  const readinessLoaded = canonicalLoaded(
    readiness.proof,
    `READY-${job.attemptId}`,
    "https://devrelay.dev/artifacts/runnable-frontier-proof/v1",
    "application/vnd.devrelay.runnable-frontier-proof+json",
  );
  const approvedAssignment = assignment.value.assignments.find(
    ({ workItemRef }) => workItemRef === item.id,
  );
  if (!approvedAssignment) throw new Error(`missing assignment for ${item.id}`);
  const policyValue = sealBody(
    {
      apiVersion: API,
      kind: "ExecutionPolicy",
      policyId: `POL-${item.id}`,
      version: "1.0.0",
      timeoutMilliseconds: 120_000,
      allowedPermissions: job.permissions,
      outputPolicy: { maxEvidenceBytes: 10_000_000, maxNativeArtifactBytes: 10_000_000 },
    },
    "policyDigest",
  );
  const policy = canonicalLoaded(
    policyValue,
    policyValue.policyId,
    "https://devrelay.dev/artifacts/execution-policy/v1",
    "application/vnd.devrelay.execution-policy+json",
  );
  const configurationDigest = canonicalJsonDigest({
    host: "ChatGPT Desktop",
    platform: "Windows",
    executor: "executor.chatgpt-desktop",
    version: "1.0.0",
  });
  const bindingValue = sealBody(
    {
      apiVersion: API,
      kind: "ExecutionBinding",
      bindingId: `BIND-${item.id}`,
      workItemId: item.id,
      specialistProfileId: approvedAssignment.specialistProfileRef,
      assignmentBaseline: assignment.ref,
      executor: { id: "executor.chatgpt-desktop", version: "1.0.0" },
      requiredCapabilities: approvedAssignment.capabilityCoverage,
      requiredTools: approvedAssignment.requiredTools,
      permissionDemands: job.permissions,
      executionPolicy: policy.ref,
      configurationDigest,
    },
    "bindingDigest",
  );
  const binding = canonicalLoaded(
    bindingValue,
    bindingValue.bindingId,
    "https://devrelay.dev/artifacts/execution-binding/v1",
    "application/vnd.devrelay.execution-binding+json",
  );
  const evidenceValue = {
    apiVersion: API,
    kind: "WorkExecutionCommandEvidence",
    evidenceId: job.evidence.artifactId,
    workItemId: item.id,
    command: job.evidence.command,
    outcome: "pass",
    tests: job.evidence.tests,
    platform: "win32",
    node: process.version,
  };
  const evidenceArtifact = canonicalArtifact(
    evidenceValue,
    evidenceValue.evidenceId,
    "https://devrelay.dev/evidence/work-execution-command/v1",
    "application/vnd.devrelay.work-execution-command-evidence+json",
  );
  const rawValueFor = (invocation) => ({
    apiVersion: API,
    kind: "RawExecutorResult",
    attemptId: invocation.attemptId,
    invocationFingerprint: invocation.invocationFingerprint,
    bindingDigest: bindingValue.bindingDigest,
    executor: { id: "executor.chatgpt-desktop", version: "1.0.0" },
    terminalState: "proposed",
    mutations: job.files.map(mutation).sort((a, b) => a.path.localeCompare(b.path, "en")),
    evidence: [evidenceArtifact.ref],
    diagnostics: [],
    nativeArtifacts: [],
  });
  let calls = 0;
  const executor = {
    id: "executor.chatgpt-desktop",
    version: "1.0.0",
    async execute(invocation) {
      calls += 1;
      return Buffer.from(`${canonicalJson(rawValueFor(invocation))}\n`, "utf8");
    },
  };
  const checkpoints = createInMemoryWorkExecutionCheckpointStore();
  const request = {
    attemptId: job.attemptId,
    workItemId: item.id,
    input: {
      workBreakdownBaseline: workBreakdown,
      workDependencyBaseline: workDependency,
      integratedCompletionFacts: completions,
      runnableFrontierProof: readinessLoaded,
      specialistAssignmentBaseline: assignment,
      executionBinding: binding,
      executionPolicy: policy,
      projectOverviewBaseline: projectOverview,
      repositorySnapshot: repository,
    },
    workspaceBaseDigest: repository.value.treeDigest,
    executor,
    executorConfigurationDigest: configurationDigest,
    checkpoints,
  };
  const first = await executeWorkItem(request);
  const replay = await executeWorkItem(request);
  if (first.outcome !== "proposed" || !replay.replayed || calls !== 1) {
    throw new Error(`execution/replay failed for ${item.id}`);
  }
  const attemptLoaded = canonicalArtifact(
    first.attempt,
    first.attempt.attemptId,
    "https://devrelay.dev/artifacts/execution-attempt/v1",
    "application/vnd.devrelay.execution-attempt+json",
  );
  const changeLoaded = canonicalArtifact(
    first.changeSet,
    `CS-${first.attempt.attemptId}`,
    "https://devrelay.dev/artifacts/change-set-draft/v1",
    "application/vnd.devrelay.change-set-draft+json",
  );
  const evidenceLoaded = canonicalArtifact(
    first.evidenceBundle,
    `EEB-${first.attempt.attemptId}`,
    "https://devrelay.dev/artifacts/execution-evidence-bundle/v1",
    "application/vnd.devrelay.execution-evidence-bundle+json",
  );
  const traceLoaded = canonicalArtifact(
    first.traceability,
    `TRACE-${first.attempt.attemptId}`,
    "https://devrelay.dev/artifacts/execution-traceability-candidate/v1",
    "application/vnd.devrelay.execution-traceability-candidate+json",
  );
  const invocationId = `WE-V011-${item.id}-002`;
  const moduleInvocation = {
    apiVersion: API,
    kind: "ModuleInvocation",
    invocationId,
    module: { id: "work-execution", version: "0.1.0", operation: "execute-work-item" },
    inputs: { "work-item": [itemLoaded.ref] },
    options: {},
  };
  const moduleResult = {
    apiVersion: API,
    kind: "ModuleResult",
    invocationId,
    status: "completed",
    outcome: "proposed",
    outputs: {
      "execution-attempt": [attemptLoaded.ref],
      "change-set-draft": [changeLoaded.ref],
      "execution-evidence-bundle": [evidenceLoaded.ref],
    },
    evidence: [
      {
        kind: "work-execution/raw-evidence",
        subject: first.attempt.attemptId,
        status: "pass",
        artifact: evidenceLoaded.ref,
      },
    ],
    diagnostics: [],
  };
  const resultLoaded = canonicalArtifact(
    moduleResult,
    `RESULT-${first.attempt.attemptId}`,
    "https://devrelay.dev/contracts/module-result.schema.json",
    "application/vnd.devrelay.module-result+json",
  );
  const context = {
    invocation: moduleInvocation,
    invocationFingerprint: first.invocation.invocationFingerprint,
    moduleResult,
    loadedInputs: { "work-item": [itemLoaded] },
    loadedOutputs: {
      "execution-attempt": [attemptLoaded],
      "change-set-draft": [changeLoaded],
      "execution-evidence-bundle": [evidenceLoaded],
    },
    loadedAttachments: {
      result: resultLoaded,
      trace: traceLoaded,
      commandEvidence: evidenceArtifact,
    },
  };
  const prepared = await graph.prepare({ ...context, baseGraph: graph.captureBase() });
  const merged = await graph.mergePrepared(prepared);
  const mergedReplay = await graph.mergePrepared(prepared);
  if (canonicalJson(merged.receipt) !== canonicalJson(mergedReplay.receipt)) {
    throw new Error(`traceability replay changed for ${item.id}`);
  }
  const folder = item.id;
  writeJson(`${folder}/work-item.json`, item);
  writeJson(`${folder}/runnable-frontier-proof.json`, first.readinessProof);
  writeJson(`${folder}/execution-policy.json`, policyValue);
  writeJson(`${folder}/execution-binding.json`, bindingValue);
  writeJson(`${folder}/executor-invocation.json`, first.invocation);
  writeBytes(`${folder}/raw-executor-result.json`, Buffer.from(first.checkpoint.rawBytesBase64, "base64"));
  writeJson(`${folder}/work-execution-checkpoint.json`, first.checkpoint);
  writeJson(`${folder}/execution-attempt.json`, first.attempt);
  writeJson(`${folder}/change-set-draft.json`, first.changeSet);
  writeJson(`${folder}/execution-evidence-bundle.json`, first.evidenceBundle);
  writeJson(`${folder}/command-evidence.json`, evidenceValue);
  writeJson(`${folder}/execution-traceability-candidate.json`, first.traceability);
  writeJson(`${folder}/module-invocation.json`, moduleInvocation);
  writeJson(`${folder}/module-result.json`, moduleResult);
  writeJson(`${folder}/traceability-update.json`, prepared.update);
  writeJson(`${folder}/traceability-merge-receipt.json`, merged.receipt);
  writeJson(`${folder}/traceability-graph-snapshot.json`, merged.snapshot);
  writeJson(`${folder}/replay-proof.json`, {
    attemptId: first.attempt.attemptId,
    executorCalls: calls,
    replayExecutorCalls: replay.executorCalls,
    byteIdentical:
      first.checkpoint.rawDigest === replay.checkpoint.rawDigest &&
      first.attempt.attemptDigest === replay.attempt.attemptDigest,
    traceabilityReceiptReplayed: true,
  });
  summary.executions.push({
    workItemId: item.id,
    attempt: attemptLoaded.ref,
    changeSet: changeLoaded.ref,
    evidence: evidenceLoaded.ref,
    traceabilityUpdate: prepared.updateRef,
    resultGraph: merged.snapshotRef,
    executorCalls: calls,
    replayExecutorCalls: replay.executorCalls,
  });
}
summary.resultGraph = graph.captureBase().ref;
summary.summaryDigest = canonicalJsonDigest(summary.executions);
writeJson("execution-summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
