import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "../../../src/content-digest.mjs";
import {
  createCanonicalWorkExecutionInput,
  createInMemoryWorkExecutionCheckpointStore,
  deriveRunnableFrontierProof,
  executeWorkItem,
  loadWorkExecutionInput,
} from "../../../src/work-execution-runtime.mjs";
import { TRACEABILITY_VOCABULARY_V1_8 } from "../../../src/traceability-artifact-validator.mjs";
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
const rawLoaded = (relativePath, artifactRef) => {
  const bytes = readBytes(relativePath);
  const digest = sha256Digest(bytes);
  if (artifactRef.digest && artifactRef.digest !== digest) {
    throw new Error(
      `${relativePath} drifted: expected ${artifactRef.digest}, received ${digest}`,
    );
  }
  return loadWorkExecutionInput({
    bytes,
    ref: { ...artifactRef, digest },
    label: relativePath,
  });
};
const canonicalLoaded = (value, artifactId, schema, mediaType) =>
  createCanonicalWorkExecutionInput({ value, ref: ref(artifactId, schema, mediaType) });
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
    execFileSync("git", ["show", `${repositoryRevision}:${relativePath}`], {
      cwd: root,
      encoding: "buffer",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
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
  return {
    operation: before === undefined ? "create" : "modify",
    path: relativePath,
    beforeDigest: before === undefined ? null : sha256Digest(before),
    afterDigest: sha256Digest(after),
  };
};

const dependencyPromotion = readJson("project/work-dependency-promotion.commit.json");
const assignmentPromotion = readJson("project/specialist-assignment-promotion.commit.json");
const requirementsPromotion = readJson("project/requirements-promotion.commit.json");
const workDependencyValue = readJson("project/work-dependency-baseline.json");
const workBreakdown = rawLoaded(
  "project/work-breakdown-baseline.json",
  workDependencyValue.workBreakdownBaseline,
);
const workDependency = rawLoaded(
  "project/work-dependency-baseline.json",
  dependencyPromotion.promotedBaseline,
);
const assignment = rawLoaded(
  "project/specialist-assignment-baseline.json",
  assignmentPromotion.approvedBaseline,
);
const projectOverview = rawLoaded("project/project-overview-baseline.json", {
  artifactId: requirementsPromotion.next.projectOverviewBaseline.artifactId,
  schema: "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  mediaType: "application/vnd.devrelay.project-overview-baseline+json",
  digest: requirementsPromotion.next.projectOverviewBaseline.digest,
});
const integrationSummary = readJson(
  "dogfood/rp-001-release-preparation/integration-system-fix-1/integration-summary.json",
);
const repositoryRevision = integrationSummary.finalCommit;
const repositoryTree = execFileSync(
  "git",
  ["rev-parse", `${repositoryRevision}^{tree}`],
  { cwd: root, encoding: "utf8", windowsHide: true },
).trim();
const repository = canonicalLoaded(
  {
    apiVersion: API,
    kind: "RepositorySnapshot",
    repository: root.replaceAll("\\", "/"),
    revision: repositoryRevision,
    treeDigest: canonicalJsonDigest({ commit: repositoryRevision, tree: repositoryTree }),
    includedPaths: ["src/**", "test/**"],
    excludedPaths: [".git/**", "node_modules/**"],
  },
  `repository-snapshot-devrelay-${repositoryRevision.slice(0, 7)}`,
  "https://devrelay.dev/artifacts/repository-snapshot/v1",
  "application/vnd.devrelay.repository-snapshot+json",
);
const completionsValue = readJson(
  "dogfood/rp-001-release-preparation/frontier-8/integrated-completion-fact-set.json",
);
const completions = canonicalLoaded(
  completionsValue,
  "ICFS-RP-001-FRONTIER-8",
  "https://devrelay.dev/artifacts/integrated-completion-fact-set/v1",
  "application/vnd.devrelay.integrated-completion-fact-set+json",
);

const jobs = [
  { workItemId: "WI-RP-WINDOWS-E2E", attemptId: "ATT-RP-WINDOWS-E2E-002", files: ["release/0.10.0-rc.3.json"], command: "node scripts/check-release-manifest.mjs (isolated candidate checkout)", tests: 1 },
];
const permissions = [
  { kind: "filesystem.write", scope: { values: ["release/**"] } },
  { kind: "process.spawn", scope: { values: ["node"] } },
];

const graphHeadPath =
  "dogfood/rp-001-release-preparation/integration-system-fix-1/WI-RP-TRACEABILITY/traceability-graph-snapshot.json";
const graphHeadValue = readJson(graphHeadPath);
const graphHeadBytes = Buffer.from(canonicalJson(graphHeadValue), "utf8");
const graphHeadRef = integrationSummary.resultGraph;
if (sha256Digest(graphHeadBytes) !== graphHeadRef.digest) {
  throw new Error("assignment graph head bytes drifted");
}

function findTraceabilityUpdates(start) {
  const found = new Map();
  const visit = (absolute) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if ([".git", "node_modules"].includes(entry.name)) continue;
      const child = path.join(absolute, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        try {
          const value = JSON.parse(fs.readFileSync(child, "utf8"));
          if (value?.kind === "TraceabilityUpdate") {
            const bytes = Buffer.from(canonicalJson(value), "utf8");
            found.set(sha256Digest(bytes), { value, bytes });
          }
        } catch {}
      }
    }
  };
  visit(start);
  return found;
}

const updates = findTraceabilityUpdates(root);
const graphEntries = [
  { ref: graphHeadRef, value: graphHeadValue, bytes: graphHeadBytes },
];
for (const updateRef of graphHeadValue.appliedUpdates) {
  const entry = updates.get(updateRef.digest);
  if (!entry) throw new Error(`missing applied update ${updateRef.digest}`);
  graphEntries.push({ ref: updateRef, value: entry.value, bytes: entry.bytes });
}
const graphStore = createInMemoryTraceabilityStore();
graphStore.restore(graphHeadValue.graphId, graphEntries, graphHeadRef);
const graph = createTraceabilityGraphService({
  graphId: graphHeadValue.graphId,
  projectId: graphHeadValue.projectId,
  store: graphStore,
  contributors: [workExecutionTraceabilityContributor],
  vocabulary: TRACEABILITY_VOCABULARY_V1_8,
});

const summary = {
  apiVersion: API,
  kind: "Rp001ReleaseCatalogRepairExecutionSummary",
  inputGraph: graphHeadRef,
  executions: [],
};

for (const job of jobs) {
  const item = workBreakdown.value.workItems.find(({ id }) => id === job.workItemId);
  if (!item) throw new Error(`missing work item ${job.workItemId}`);
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
      allowedPermissions: permissions,
      outputPolicy: {
        maxEvidenceBytes: 10_000_000,
        maxNativeArtifactBytes: 10_000_000,
      },
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
      permissionDemands: permissions,
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
    evidenceId: `EV-${item.id}-001`,
    workItemId: item.id,
    command: job.command,
    outcome: "pass",
    tests: job.tests,
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
    mutations: job.files.map(mutation).sort((left, right) =>
      left.path.localeCompare(right.path, "en"),
    ),
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
  const moduleInvocation = {
    apiVersion: API,
    kind: "ModuleInvocation",
    invocationId: `WE-RP-001-${item.id}`,
    module: {
      id: "work-execution",
      version: "0.1.0",
      operation: "execute-work-item",
    },
    inputs: { "work-item": [itemLoaded.ref] },
    options: {},
  };
  const moduleResult = {
    apiVersion: API,
    kind: "ModuleResult",
    invocationId: moduleInvocation.invocationId,
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
  const prepared = await graph.prepare({
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
    baseGraph: graph.captureBase(),
  });
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
  writeBytes(
    `${folder}/raw-executor-result.json`,
    Buffer.from(first.checkpoint.rawBytesBase64, "base64"),
  );
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
