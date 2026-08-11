import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../../../src/index.mjs";
import { deriveReadyFrontier } from "../../../src/lifecycle-run-report-frontier.mjs";
import { createInMemoryTraceabilityStore } from "../../../src/traceability-graph.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const executionRoot = resolve(
  root,
  "dogfood/chatgpt-desktop-runtime/execution",
);
const integrationRoot = resolve(
  executionRoot,
  "integration/WI-DESKTOP-CONTRACTS",
);
const reconciliationRoot = resolve(
  executionRoot,
  "traceability-correction/approved-coverage-links",
);
const artifactRoot = resolve(integrationRoot, "artifacts");
const targetRef = "refs/heads/codex/v0.10-chatgpt-desktop-runtime";
const expectedCommit = "918fd3f830bbced0dc6398f2034a6d2dd953fdae";
const sourceCommit = "e2a88f4642740527e400ccdaf8bcf0351fd46696";
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
const canonicalBytes = (value) => Buffer.from(api.canonicalJson(value), "utf8");
const ref = (artifactId, digest, extras = {}) => ({
  artifactId,
  digest,
  ...extras,
});
const seal = (value, field) => ({
  ...value,
  [field]: api.canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !["apiVersion", "kind", field].includes(key),
      ),
    ),
  ),
});
const write = (base, name, value) => {
  const path = resolve(base, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${api.canonicalJson(value)}\n`, "utf8");
  return path;
};
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const treeDigest = (commit) =>
  api.sha256Digest(
    Buffer.from(
      execFileSync("git", ["ls-tree", "-r", "--full-tree", commit], {
        cwd: root,
      }),
    ),
  );

mkdirSync(artifactRoot, { recursive: true });
function persistExact(value, { artifactId, schema, mediaType }) {
  const bytes = Buffer.isBuffer(value)
    ? Buffer.from(value)
    : canonicalBytes(value);
  const digest = api.sha256Digest(bytes);
  const safe = artifactId.replace(/[^A-Za-z0-9._-]/gu, "_");
  const path = resolve(artifactRoot, `${safe}.${digest.slice(7, 23)}.json`);
  if (existsSync(path) && !readFileSync(path).equals(bytes))
    throw new Error(`persisted artifact drift: ${artifactId}`);
  if (!existsSync(path)) writeFileSync(path, bytes);
  return {
    reference: ref(artifactId, digest, {
      schema,
      mediaType,
      uri: new URL(`file:///${path.replaceAll("\\", "/")}`).href,
    }),
    bytes,
  };
}
const readArtifact = async (reference) => {
  const bytes = readFileSync(fileURLToPath(reference.uri));
  if (api.sha256Digest(bytes) !== reference.digest)
    throw new Error("persisted artifact digest drift");
  return bytes;
};
const persistArtifact = async (bytes, metadata) =>
  persistExact(Buffer.from(bytes), metadata).reference;
const loaded = (value, artifactId, exactRef) => ({
  value,
  bytes: canonicalBytes(value),
  ref:
    exactRef ??
    ref(artifactId, api.sha256Digest(canonicalBytes(value)), {
      schema: `https://devrelay.dev/internal/loaded-artifact/${artifactId}/v1`,
      mediaType: "application/json",
      uri: `memory://devrelay/change-integration/${artifactId}`,
    }),
});

function approvedLinkContributor(approvalLoaded) {
  const locator = (jsonPointer, entity) => ({
    artifact: ref(approvalLoaded.ref.artifactId, approvalLoaded.ref.digest),
    jsonPointer,
    entityDigest: api.canonicalJsonDigest(entity),
  });
  return {
    metadata: {
      id: "devrelay.release-coverage-reconciliation",
      version: "1.0.0",
    },
    authority: "approved",
    scope: "release-reconciliation/approved",
    ownership: {
      authority: "approved",
      scope: "release-reconciliation/approved",
      nodeKinds: [],
      edgeKinds: ["designed-by"],
    },
    match: (context) =>
      context?.invocation?.module?.id === "release-coverage-reconciliation" &&
      context?.moduleResult?.outcome === "reconciled",
    project: () => ({
      horizon: "architecture",
      nodes: [],
      edges: approvalLoaded.value.links.map((link, index) => ({
        kind: "designed-by",
        source: {
          kind: link.sourceKind,
          stableId: link.sourceId,
          authority: "approved",
          scope: "requirements/baseline",
        },
        target: {
          kind: "architecture-element",
          stableId: link.targetId,
          authority: "approved",
          scope: "architecture/baseline",
        },
        rationale: link.rationale,
        sourceLocators: [locator(`/links/${index}`, link)],
      })),
    }),
  };
}

if (
  git("rev-parse", targetRef) !== sourceCommit ||
  git("rev-parse", "HEAD") !== sourceCommit
)
  throw new Error(
    "the authorized target was not integrated at the exact source commit",
  );
const parentCommits = git("show", "-s", "--format=%P", sourceCommit)
  .split(/\s+/u)
  .filter(Boolean);
if (parentCommits.length !== 1 || parentCommits[0] !== expectedCommit)
  throw new Error("source commit is not the authorized fast-forward successor");
const subject = readJson(
  "dogfood/chatgpt-desktop-runtime/execution/integration/WI-DESKTOP-CONTRACTS/verified-subject.json",
);
const binding = readJson(
  "dogfood/chatgpt-desktop-runtime/execution/integration/WI-DESKTOP-CONTRACTS/input-binding.json",
);
const plan = readJson(
  "dogfood/chatgpt-desktop-runtime/execution/integration/WI-DESKTOP-CONTRACTS/integration-plan.json",
);
const invocation = readJson(
  "dogfood/chatgpt-desktop-runtime/execution/integration/WI-DESKTOP-CONTRACTS/adapter-invocation.json",
);
const authorization = readJson(
  "dogfood/chatgpt-desktop-runtime/execution/integration/WI-DESKTOP-CONTRACTS/integration-authorization.json",
);
for (const artifact of [subject, binding, plan, invocation])
  api.validateChangeIntegrationArtifact(
    artifact,
    artifact.kind === "IntegrationPlan"
      ? { subject, binding }
      : artifact.kind === "IntegrationAdapterInvocation"
        ? { plan, binding }
        : {},
  );
if (
  authorization.plan.digest !== plan.planDigest ||
  authorization.invocation.digest !== invocation.invocationFingerprint
)
  throw new Error("integration authorization drifted");

const preRepositorySnapshot = readJson(
  "dogfood/chatgpt-desktop-runtime/execution/repository-snapshot.json",
);
const postObservation = {
  ref: targetRef,
  commit: sourceCommit,
  treeDigest: treeDigest(sourceCommit),
};
const observation = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ChangeIntegrationTargetObservation",
  targetRef,
  expectedCommit,
  disposition: "present",
  observed: postObservation,
};
const observationStored = persistExact(observation, {
  artifactId: "TARGET-OBSERVATION-DESKTOP-CONTRACTS-003",
  schema:
    "https://devrelay.dev/internal/change-integration/target-observation/v1",
  mediaType:
    "application/vnd.devrelay.change-integration-target-observation+json",
});

const checkpointValues = new Map();
const checkpoints = {
  async get(key) {
    return checkpointValues.get(key);
  },
  async put(key, value) {
    if (checkpointValues.has(key))
      throw new Error("immutable checkpoint overwrite");
    checkpointValues.set(key, structuredClone(value));
  },
};
let recoveryAdapterCalls = 0;
const controller = api.createChangeIntegrationCheckpointController({
  effect: async () => {
    recoveryAdapterCalls += 1;
    throw new Error(
      "host fast-forward occurred under the persisted authorization before checkpoint attachment",
    );
  },
  persistRawResult: async () => {
    throw new Error("recovery path must not persist a synthetic raw result");
  },
  readRawResult: async () => {
    throw new Error("recovery path has no raw result");
  },
});
const prepared = await controller.execute({ plan, invocation, checkpoints });
if (prepared.recoveryStatus !== "pending")
  throw new Error("prepared recovery checkpoint was not created");
const recovered = await controller.execute({
  plan,
  invocation,
  checkpoints,
  observation: postObservation,
  observationEvidence: observationStored.reference,
});
if (
  recovered.recoveryStatus !== "recovered" ||
  recovered.recoveryEvidence?.disposition !== "applied"
)
  throw new Error("exact fast-forward recovery was not proven");
const replay = await controller.execute({ plan, invocation, checkpoints });
if (!replay.replayed || replay.effectCalls !== 0 || recoveryAdapterCalls !== 1)
  throw new Error("recovered checkpoint did not replay with zero effects");
write(integrationRoot, "checkpoint.json", replay.checkpoint);

const postRepositorySnapshot = {
  ...preRepositorySnapshot,
  revision: sourceCommit,
  treeDigest: postObservation.treeDigest,
};
const postStored = persistExact(postRepositorySnapshot, {
  artifactId: "REPOSITORY-SNAPSHOT-DESKTOP-CONTRACTS-003",
  schema: "https://devrelay.dev/artifacts/repository-snapshot/v1",
  mediaType: "application/vnd.devrelay.repository-snapshot+json",
});
const incorporationProof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RepositoryIncorporationProof",
  invocationId: invocation.invocationId,
  invocationFingerprint: invocation.invocationFingerprint,
  targetRef,
  strategy: "fast-forward",
  expectedTargetCommit: expectedCommit,
  sourceCommit,
  postCommit: sourceCommit,
  postTreeDigest: postObservation.treeDigest,
  parentCommits,
  sourceIncorporated: true,
};
const proofStored = persistExact(incorporationProof, {
  artifactId: "INCORPORATION-PROOF-DESKTOP-CONTRACTS-003",
  schema:
    "https://devrelay.dev/internal/change-integration/repository-incorporation-proof/v1",
  mediaType: "application/vnd.devrelay.repository-incorporation-proof+json",
});
const moduleResult = await api.validateChangeIntegrationResult({
  subject,
  plan,
  invocation,
  checkpointReplay: replay,
  recoveryObservationEvidence: observationStored.reference,
  preRepositorySnapshot,
  postRepositorySnapshotRef: postStored.reference,
  postRepositorySnapshotBytes: postStored.bytes,
  incorporationProofRef: proofStored.reference,
  incorporationProofBytes: proofStored.bytes,
  persistArtifact,
  readArtifact,
});
if (moduleResult.outcome !== "integrated")
  throw new Error(`ChangeIntegration outcome is ${moduleResult.outcome}`);
write(integrationRoot, "module-result.json", moduleResult);
const recordRef = moduleResult.outputs["integrated-change-record"][0];
const record = JSON.parse((await readArtifact(recordRef)).toString("utf8"));
const traceabilityInput = seal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ChangeIntegrationTraceabilityInput",
    integratedChange: recordRef,
    subject: ref(subject.subjectId, subject.subjectDigest),
    repositorySnapshot: postStored.reference,
    authority: "approved",
    scope: "change-integration/integrated",
  },
  "traceabilityDigest",
);
api.validateChangeIntegrationArtifact(traceabilityInput);
write(integrationRoot, "traceability-input.json", traceabilityInput);

const workItem = readJson(
  "project/work-breakdown-baseline.json",
).workItems.find(({ id }) => id === "WI-DESKTOP-CONTRACTS");
const changeSet = readJson(
  "dogfood/chatgpt-desktop-runtime/execution/verification/WI-DESKTOP-CONTRACTS/change-set-draft.json",
);
const architecture = readJson("project/architecture-baseline.json");
const contracts = readJson("project/contract-disposition.json");
const moduleResultLoaded = loaded(
  moduleResult,
  "MODULE-RESULT-DESKTOP-CONTRACTS-003",
);
const context = {
  invocation: {
    invocationId: invocation.invocationId,
    module: {
      id: "change-integration",
      version: "0.1.0",
      operation: "integrate-change",
    },
  },
  invocationFingerprint: invocation.invocationFingerprint,
  moduleResult,
  loadedInputs: {
    "verified-work-item-subject": [loaded(subject, subject.subjectId)],
    "integration-input-binding": [loaded(binding, binding.bindingId)],
  },
  loadedOutputs: {
    "integrated-change-record": [loaded(record, record.recordId, recordRef)],
    "repository-snapshot": [
      loaded(
        postRepositorySnapshot,
        postStored.reference.artifactId,
        postStored.reference,
      ),
    ],
  },
  loadedAttachments: {
    result: moduleResultLoaded,
    trace: loaded(traceabilityInput, "TRACE-DESKTOP-CONTRACTS-003"),
    work: loaded(workItem, workItem.id, subject.workItem),
    change: loaded(changeSet, subject.changeSet.artifactId, subject.changeSet),
    architecture: loaded(
      architecture,
      binding.baselines.architectureBaseline.artifactId,
      binding.baselines.architectureBaseline,
    ),
    contracts: loaded(
      contracts,
      binding.baselines.contractDisposition.artifactId,
      binding.baselines.contractDisposition,
    ),
  },
};
const currentGraph = readJson(
  "dogfood/chatgpt-desktop-runtime/assignment/approved-v2/traceability-graph-snapshot.json",
);
const currentGraphBytes = canonicalBytes(currentGraph);
const currentGraphRef = ref(
  `traceability-graph-${currentGraph.graphId.replace(/[^A-Za-z0-9._-]/gu, "-")}-r${currentGraph.revision}`,
  api.sha256Digest(currentGraphBytes),
  {
    schema: "https://devrelay.dev/artifacts/traceability-graph-snapshot/v1",
    mediaType: "application/vnd.devrelay.traceability-graph+json",
    uri: "memory://devrelay/traceability/desktop-runtime/approved-r12.json",
  },
);
const requiredUpdateDigests = new Set(
  currentGraph.appliedUpdates.map(({ digest }) => digest),
);
const updateValues = new Map();
function indexJson(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) indexJson(path);
    else if (entry.isFile() && entry.name.endsWith(".json")) {
      try {
        const value = JSON.parse(readFileSync(path, "utf8"));
        const digest = api.sha256Digest(canonicalBytes(value));
        if (requiredUpdateDigests.has(digest) && !updateValues.has(digest))
          updateValues.set(digest, value);
      } catch {}
    }
  }
}
indexJson(resolve(root, "dogfood"));
indexJson(resolve(root, "project/history/traceability/updates"));
const updateEntries = currentGraph.appliedUpdates.map((reference) => {
  const value = updateValues.get(reference.digest);
  if (!value)
    throw new Error(
      `approved traceability update closure is missing ${reference.digest}`,
    );
  return { ref: reference, bytes: canonicalBytes(value), value };
});
const store = createInMemoryTraceabilityStore();
store.restore(
  currentGraph.graphId,
  [
    ...updateEntries,
    { ref: currentGraphRef, bytes: currentGraphBytes, value: currentGraph },
  ],
  currentGraphRef,
);
const reconciliationApproval = seal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ApprovedCoverageDispositionSet",
    dispositionId: "DESKTOP-COVERAGE-RECONCILIATION-001",
    targetCommit: sourceCommit,
    links: [
      {
        sourceKind: "user-story",
        sourceId: "US-DEV-SPECIFY-001",
        targetId: "EL-DEVRELAY-CORE",
        relation: "designed-by",
        rationale:
          "The approved Generic Core architecture already realizes deterministic module specification and execution.",
      },
      {
        sourceKind: "non-functional-requirement",
        sourceId: "NFR-DEV-DETERMINISM-001",
        targetId: "EL-DEVRELAY-CORE",
        relation: "designed-by",
        rationale:
          "The approved Generic Core architecture already realizes deterministic routing, validation, checkpointing, and replay.",
      },
    ],
    authority: "business-owner",
  },
  "dispositionDigest",
);
const reconciliationLoaded = loaded(
  reconciliationApproval,
  reconciliationApproval.dispositionId,
);
const reconciliationContributor = approvedLinkContributor(reconciliationLoaded);
const graph = api.createTraceabilityGraphService({
  graphId: currentGraph.graphId,
  projectId: currentGraph.projectId,
  store,
  contributors: [
    reconciliationContributor,
    api.changeIntegrationTraceabilityContributor,
  ],
});
const reconciliationInvocation = {
  invocationId: "DESKTOP-COVERAGE-RECONCILIATION-001",
  module: {
    id: "release-coverage-reconciliation",
    version: "1.0.0",
    operation: "apply-approved-links",
  },
};
const reconciliationResult = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleResult",
  invocationId: reconciliationInvocation.invocationId,
  status: "completed",
  outcome: "reconciled",
  outputs: { "approved-coverage-disposition-set": [reconciliationLoaded.ref] },
  evidence: [],
  diagnostics: [],
};
const reconciliationContext = {
  invocation: reconciliationInvocation,
  invocationFingerprint: api.canonicalJsonDigest(reconciliationInvocation),
  moduleResult: reconciliationResult,
  loadedInputs: {},
  loadedOutputs: {
    "approved-coverage-disposition-set": [reconciliationLoaded],
  },
  loadedAttachments: {},
};
const reconciliationPrepared = await graph.prepare({
  ...reconciliationContext,
  baseGraph: graph.captureBase(),
});
const reconciliationMerged = await graph.mergePrepared(reconciliationPrepared);
const reconciliationReplay = await graph.mergePrepared(reconciliationPrepared);
if (
  reconciliationMerged.receipt.disposition !== "merged" ||
  api.canonicalJson(reconciliationMerged.receipt) !==
    api.canonicalJson(reconciliationReplay.receipt)
) {
  throw new Error(
    "approved traceability correction merge or idempotent replay failed",
  );
}
const remainingBlockingOrphans = api
  .diagnoseTraceabilityGraph(reconciliationMerged.snapshot)
  .filter(({ blocking, category }) => blocking && category === "orphan");
if (remainingBlockingOrphans.length !== 0) {
  throw new Error(
    `approved traceability correction left blocking orphan diagnostics: ${api.canonicalJson(remainingBlockingOrphans)}`,
  );
}
write(
  reconciliationRoot,
  "approved-coverage-disposition-set.json",
  reconciliationApproval,
);
write(
  reconciliationRoot,
  "traceability-update.json",
  reconciliationPrepared.update,
);
write(
  reconciliationRoot,
  "traceability-merge-receipt.json",
  reconciliationMerged.receipt,
);
write(
  reconciliationRoot,
  "traceability-graph-snapshot.json",
  reconciliationMerged.snapshot,
);

const baseGraph = graph.captureBase();
const preparedUpdate = await graph.prepare({ ...context, baseGraph });
const merged = await graph.mergePrepared(preparedUpdate);
const mergeReplay = await graph.mergePrepared(preparedUpdate);
if (
  merged.receipt.disposition !== "merged" ||
  api.canonicalJson(merged.receipt) !== api.canonicalJson(mergeReplay.receipt)
)
  throw new Error("TraceabilityGraph merge or idempotent replay failed");
write(integrationRoot, "traceability-update.json", preparedUpdate.update);
write(integrationRoot, "traceability-merge-receipt.json", merged.receipt);
write(integrationRoot, "traceability-graph-snapshot.json", merged.snapshot);

const gateApproval = readJson(
  "dogfood/chatgpt-desktop-runtime/execution/verification/WI-DESKTOP-CONTRACTS/gate-approval.json",
);
const receipt = seal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "DesktopWorkItemIntegrationReceipt",
    receiptId: "CI-RECEIPT-DESKTOP-CONTRACTS-003",
    workItemId: workItem.id,
    executionAttemptId: "ATT-DESKTOP-CONTRACTS-003",
    verificationGateApproval: ref(
      gateApproval.approvalId,
      gateApproval.approvalDigest,
    ),
    integrationPlan: ref(plan.planId, plan.planDigest),
    integratedChange: recordRef,
    postRepositorySnapshot: postStored.reference,
    traceabilityMerge: merged.receipt,
    targetRef,
    expectedCommit,
    sourceCommit,
    effectDisposition: "recovered-exact-host-fast-forward",
    replayEffectCalls: replay.effectCalls,
    authoritativeIntegratedCompletionFactCreated: true,
    target: {
      application: "ChatGPT Desktop",
      platform: "Windows",
      scope: "exclusive",
    },
  },
  "receiptDigest",
);
write(integrationRoot, "integration-receipt.json", receipt);
const completionBody = {
  completionId: "ICF-DESKTOP-CONTRACTS-003",
  workItem: ref(subject.workItem.artifactId, subject.workItem.digest),
  changeSet: ref(subject.changeSet.artifactId, subject.changeSet.digest),
  verification: ref(gateApproval.approvalId, gateApproval.approvalDigest),
  integration: ref(receipt.receiptId, receipt.receiptDigest),
  status: "verified-and-integrated",
  authority: "factual-completion",
};
const completionFact = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "IntegratedCompletionFact",
  ...completionBody,
  completionDigest: api.canonicalJsonDigest(completionBody),
};
api.validateLifecycleRunReportArtifact(completionFact);
write(integrationRoot, "integrated-completion-fact.json", completionFact);
const workExecutionFacts = [
  {
    workItemId: workItem.id,
    authority: "approved",
    integrationRef: ref(receipt.receiptId, receipt.receiptDigest),
    evidence: [
      ref(gateApproval.approvalId, gateApproval.approvalDigest),
      recordRef,
      postStored.reference,
    ],
  },
];
const completionFactSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "IntegratedCompletionFactSet",
  facts: workExecutionFacts,
  factsDigest: api.canonicalJsonDigest(workExecutionFacts),
};
write(executionRoot, "integrated-completion-facts.json", completionFactSet);
const dependencyBaseline = readJson("project/work-dependency-baseline.json");
const runnable = api.deriveRunnableFrontier({
  baseline: dependencyBaseline,
  completedWorkItemIds: [workItem.id],
});
const readyFrontier = deriveReadyFrontier({
  baseline: dependencyBaseline,
  completionFacts: [completionFact],
  frontierId: "FRONTIER-DESKTOP-AFTER-CONTRACTS-001",
});
write(executionRoot, "ready-frontier-after-contracts.json", readyFrontier);
console.log(
  JSON.stringify(
    {
      outcome: moduleResult.outcome,
      workItemId: workItem.id,
      sourceCommit,
      receiptDigest: receipt.receiptDigest,
      completionDigest: completionFact.completionDigest,
      traceability: {
        revisionBefore: merged.receipt.revisionBefore,
        revisionAfter: merged.receipt.revisionAfter,
        updateDigest: preparedUpdate.updateRef.digest,
      },
      runnable,
      lifecycleFrontier: readyFrontier.readyWorkItemIds,
    },
    null,
    2,
  ),
);
