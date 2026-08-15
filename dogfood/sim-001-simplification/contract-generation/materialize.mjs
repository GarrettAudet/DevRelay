import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLoadedJsonValueFidelity, normalizeRepositoryArtifactUris, repositoryArtifactUriFromUrl } from "../../_support/repository-artifact-uri.mjs";

import { architectureBaselineObserverContributor } from "../../../src/architecture-traceability-contributor.mjs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import { createJsonSchemaContractBundle } from "../../../src/contract-format-registry.mjs";
import { createContractGenerationRuntime } from "../../../src/contract-generation-runtime.mjs";
import { contractCandidateTraceabilityContributor } from "../../../src/contract-traceability-contributor.mjs";
import {
  createGraphAwareInvocationFingerprint,
  createTraceCheckpointKey,
  validateModuleExecutionRecord,
} from "../../../src/module-execution-record-validator.mjs";
import { selectModuleRoute } from "../../../src/operation-router.mjs";
import { requirementsBaselineObserverContributor } from "../../../src/requirements-traceability-contributor.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../../../src/traceability-graph.mjs";
import { validateContractGenerationArtifact } from "../../../src/contract-generation-artifact-validator.mjs";

const ROOT = new URL("../../../", import.meta.url);
const OUTPUT = new URL("./", import.meta.url);
const RUN_ID = "sim-001-simplification-contract-change-run-v1";
const INVOCATION_ID = "contract-generation-change-sim-001-simplification-v1";
const GRAPH_ID = "devrelay/sim-001-simplification-contract-change";
const PROJECT_ID = "devrelay";

function refFor({ value, bytes, schema, mediaType, uri, artifactId }) {
  return { artifactId, schema, mediaType, digest: sha256Digest(bytes), uri };
}

async function loadedFile(relativePath, schema, mediaType, idField) {
  const url = new URL(relativePath, ROOT);
  const bytes = await readFile(url);
  const value = JSON.parse(bytes);
  assertLoadedJsonValueFidelity(bytes, value);
  return {
    value,
    bytes,
    ref: refFor({
      value,
      bytes,
      schema,
      mediaType,
      artifactId: value[idField],
      uri: repositoryArtifactUriFromUrl(ROOT, url),
    }),
  };
}

async function exactJsonFile(name, value, schema, mediaType, artifactId) {
  const url = new URL(name, OUTPUT);
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  await mkdir(dirname(fileURLToPath(url)), { recursive: true });
  await writeFile(url, bytes);
  return {
    value,
    bytes,
    ref: refFor({
      value,
      bytes,
      schema,
      mediaType,
      artifactId,
      uri: repositoryArtifactUriFromUrl(ROOT, url),
    }),
  };
}

function memoryCheckpoints() {
  const entries = new Map();
  return {
    async get(key) { return entries.get(key); },
    async put(key, value) {
      if (entries.has(key)) throw new Error(`immutable checkpoint ${key} already exists`);
      entries.set(key, structuredClone(value));
    },
  };
}

function selfDigest(value, field) {
  const { [field]: ignored, ...material } = value;
  value[field] = canonicalJsonDigest(material);
  return value;
}

const moduleDefinition = JSON.parse(
  await readFile(new URL("examples/modules/contract-generation.module.json", ROOT), "utf8"),
);
const architecture = await loadedFile(
  "project/architecture-baseline.json",
  "https://devrelay.dev/artifacts/architecture-baseline/v1",
  "application/vnd.devrelay.architecture-baseline+json",
  "baselineId",
);
const projectArchitectureState = JSON.parse(
  await readFile(new URL("project/project-architecture-state.json", ROOT), "utf8"),
);
architecture.ref = normalizeRepositoryArtifactUris(projectArchitectureState.architectureBaseline);
const projectOverview = await loadedFile(
  "project/project-overview-baseline.json",
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
  "baselineId",
);
projectOverview.ref = normalizeRepositoryArtifactUris(architecture.value.projectOverviewBaseline);
const requirements = await loadedFile(
  "project/requirements-baseline.json",
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
  "baselineId",
);
requirements.ref = normalizeRepositoryArtifactUris(architecture.value.requirementsBaseline);
const upstreamArchitecture = { ...architecture, ref: structuredClone(projectArchitectureState.architectureBaseline) };
const upstreamProjectOverview = { ...projectOverview, ref: structuredClone(architecture.value.projectOverviewBaseline) };
const upstreamRequirements = { ...requirements, ref: structuredClone(architecture.value.requirementsBaseline) };
const currentContractBaseline = await loadedFile(
  "project/contract-baseline.json",
  "https://devrelay.dev/artifacts/contract-baseline/v1",
  "application/vnd.devrelay.contract-baseline+json",
  "baselineId",
);
currentContractBaseline.ref = {
  ...currentContractBaseline.ref,
  uri: "devrelay://repository/project/contract-baseline.json",
};

const requiredInterfaceIntentIds = architecture.value.sections.interfaceIntent.content.interfaces
  .filter(({ contractGeneration }) => contractGeneration.required)
  .map(({ id }) => id)
  .sort();
if (requiredInterfaceIntentIds.length !== currentContractBaseline.value.contracts.length + 7) {
  throw new Error(`expected prior contract count plus seven required interface intents, found ${requiredInterfaceIntentIds.length}`);
}
const state = await exactJsonFile(
  "project-contract-state.json",
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectContractState",
    stateId: "PCS-DEVRELAY-CONTRACTS-SIM-001-001",
    state: "baselined",
    architectureBaseline: architecture.ref,
    projectOverviewBaseline: projectOverview.ref,
    requiredInterfaceIntentIds,
    contractBaseline: currentContractBaseline.ref,
  },
  "https://devrelay.dev/artifacts/project-contract-state/v1",
  "application/vnd.devrelay.project-contract-state+json",
  "PCS-DEVRELAY-CONTRACTS-SIM-001-001",
);
validateContractGenerationArtifact(state.value, { ref: state.ref });
const routeDecisionValue = await selectModuleRoute(moduleDefinition, {
  stateArtifactBytes: state.bytes,
  stateArtifactRef: state.ref,
  validateStateArtifact: validateContractGenerationArtifact,
});
const routeDecision = await exactJsonFile(
  "module-route-decision.json",
  routeDecisionValue,
  "https://devrelay.dev/artifacts/module-route-decision/v1",
  "application/vnd.devrelay.module-route-decision+json",
  "module-route-decision-contract-generation-sim-001-v1",
);

const invocation = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleInvocation",
  invocationId: INVOCATION_ID,
  runId: RUN_ID,
  nodeId: "contract-generation",
  module: { id: "contract-generation", version: "0.1.0", operation: "generate-contract-change" },
  plugin: { id: "json-schema-contract-generator", version: "0.1.0" },
  inputs: {
    "project-contract-state": [state.ref],
    "routing-decision": [routeDecision.ref],
    "architecture-baseline": [architecture.ref],
    "project-overview-baseline": [projectOverview.ref],
    "current-contract-baseline": [currentContractBaseline.ref],
  },
  options: {
    generatorBindings: { "json-schema": "json-schema-contract-generator@0.1.0" },
  },
  config: { contractKind: "json-schema" },
  grants: [],
};
const invocationFile = await exactJsonFile(
  "contract-generation.invocation.json",
  invocation,
  "https://devrelay.dev/contracts/module-invocation.schema.json",
  "application/vnd.devrelay.module-invocation+json",
  INVOCATION_ID,
);

let generatorCalls = 0;
const generator = {
  id: "json-schema-contract-generator",
  version: "0.1.0",
  async generate(request) {
    generatorCalls += 1;
    return createJsonSchemaContractBundle(request, this);
  },
};
const runtime = createContractGenerationRuntime({ generators: { "json-schema": generator } });
const checkpoints = memoryCheckpoints();
const execution = await runtime.execute({
  executionId: INVOCATION_ID,
  state,
  architecture,
  projectOverview,
  currentBaseline: currentContractBaseline,
  checkpoints,
});
if (execution.outcome !== "generated" || !execution.progressionAllowed) {
  throw new Error("ContractGeneration did not produce a Gate-eligible candidate");
}
const replay = await runtime.execute({
  executionId: INVOCATION_ID,
  state,
  architecture,
  projectOverview,
  currentBaseline: currentContractBaseline,
  checkpoints,
});
if (!replay.replayed || generatorCalls !== 1) {
  throw new Error("ContractGeneration checkpoint replay was not zero-call deterministic");
}
const replayReceipt = await runtime.verifyCheckpointedExecution({
  executionId: execution.executionId,
  executionFingerprint: execution.executionFingerprint,
  checkpoints,
});
const checkpoint = replayReceipt.checkpoint;
const checkpointFile = await exactJsonFile(
  "execution-checkpoint.json",
  checkpoint,
  "https://devrelay.dev/evidence/contract-generation-execution-checkpoint/v1",
  "application/json",
  "CG-CHECKPOINT-SIM-001-001",
);

const artifactNames = {
  validationSet: "contract-format-validation-set.json",
  canonicalDiff: "contract-canonical-diff.json",
  candidate: "contract-change-set-draft.json",
  generatedBundle0: "generated-contract-bundle.json",
};
for (const [key, name] of Object.entries(artifactNames)) {
  const record = checkpoint.artifacts[key];
  await writeFile(new URL(name, OUTPUT), Buffer.from(record.bytesBase64, "base64"));
}
for (const [contractId, native] of Object.entries(checkpoint.nativeArtifacts)) {
  const name = `native/${contractId.toLowerCase()}.schema.json`;
  const url = new URL(name, OUTPUT);
  await mkdir(dirname(fileURLToPath(url)), { recursive: true });
  await writeFile(url, Buffer.from(native.bytesBase64, "base64"));
}

const candidateLoaded = {
  value: execution.candidate,
  ref: execution.candidateRef,
  bytes: Buffer.from(checkpoint.artifacts.candidate.bytesBase64, "base64"),
};
const moduleResult = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ModuleResult",
  invocationId: INVOCATION_ID,
  status: "completed",
  outcome: "generated",
  outputs: { "contract-change-set-draft": [execution.candidateRef] },
  evidence: [
    {
      kind: "contract-generation/format-validation",
      subject: execution.candidate.changeSetId,
      status: "pass",
      artifact: checkpoint.artifacts.validationSet.ref,
      summary: "Core independently validated every native JSON Schema draft 2020-12 artifact.",
    },
    {
      kind: "contract-generation/canonical-diff",
      subject: execution.candidate.changeSetId,
      status: "pass",
      artifact: checkpoint.artifacts.canonicalDiff.ref,
      summary: "Core computed a deterministic seven-add contract diff against the exact current ContractBaseline.",
    },
  ],
  diagnostics: [],
};
await exactJsonFile(
  "contract-generation.result.json",
  moduleResult,
  "https://devrelay.dev/contracts/module-result.schema.json",
  "application/vnd.devrelay.module-result+json",
  `${INVOCATION_ID}-result`,
);

const graphStore = createInMemoryTraceabilityStore();
const upstreamGraph = createTraceabilityGraphService({
  graphId: GRAPH_ID,
  projectId: PROJECT_ID,
  store: graphStore,
  contributors: [
    requirementsBaselineObserverContributor,
    architectureBaselineObserverContributor,
  ],
});
const upstreamInvocation = {
  invocationId: "contract-generation-upstream-baseline-seed",
  module: { id: "work-breakdown", version: "0.1.0", operation: "establish-breakdown" },
};
const upstreamPrepared = await upstreamGraph.prepare({
  graphId: GRAPH_ID,
  projectId: PROJECT_ID,
  invocation: upstreamInvocation,
  invocationFingerprint: canonicalJsonDigest(upstreamInvocation),
  moduleResult: {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleResult",
    invocationId: upstreamInvocation.invocationId,
    status: "completed",
    outcome: "decomposed",
    outputs: {},
    evidence: [],
    diagnostics: [],
  },
  loadedInputs: {
    "requirements-baseline": [upstreamRequirements],
    "project-overview-baseline": [upstreamProjectOverview],
    "architecture-baseline": [upstreamArchitecture],
  },
  loadedOutputs: {},
  baseGraph: upstreamGraph.captureBase(),
});
await upstreamGraph.mergePrepared(upstreamPrepared);
const graph = createTraceabilityGraphService({
  graphId: GRAPH_ID,
  projectId: PROJECT_ID,
  store: graphStore,
  contributors: [contractCandidateTraceabilityContributor],
});
const baseGraph = graph.captureBase();
const invocationFingerprint = canonicalJsonDigest({ invocation });
const graphAwareInvocationFingerprint = createGraphAwareInvocationFingerprint({
  invocationFingerprint,
  graphId: GRAPH_ID,
  projectId: PROJECT_ID,
  baseGraphRef: baseGraph.ref,
});
const prepared = await graph.prepare({
  graphId: GRAPH_ID,
  projectId: PROJECT_ID,
  invocation,
  invocationFingerprint,
  moduleResult,
  loadedInputs: {
    "project-contract-state": [state],
    "routing-decision": [routeDecision],
    "architecture-baseline": [architecture],
    "project-overview-baseline": [projectOverview],
    "current-contract-baseline": [currentContractBaseline],
  },
  loadedOutputs: { "contract-change-set-draft": [candidateLoaded] },
  baseGraph,
});
const mergeReceipt = await graph.mergePrepared(prepared);
const applicationProof = graph.assertApplied(prepared.updateRef);
const traceCheckpointKey = createTraceCheckpointKey({
  graphId: GRAPH_ID,
  projectId: PROJECT_ID,
  invocationId: invocation.invocationId,
  runId: invocation.runId,
  nodeId: invocation.nodeId,
  module: invocation.module,
  invocationFingerprint,
});
const executionContext = {
  contractGenerationCheckpointDigest: checkpoint.checkpointDigest,
  producer: { id: generator.id, version: generator.version },
  replayed: replay.replayed,
};
const traceCheckpoint = selfDigest(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleTraceabilityCheckpoint",
    traceCheckpointKey,
    invocationId: invocation.invocationId,
    runId: invocation.runId,
    nodeId: invocation.nodeId,
    module: invocation.module,
    invocationFingerprint,
    graphAwareInvocationFingerprint,
    graphId: GRAPH_ID,
    projectId: PROJECT_ID,
    baseGraphRef: prepared.baseGraphRef,
    moduleResult,
    moduleResultDigest: canonicalJsonDigest(moduleResult),
    executionContext,
    executionContextDigest: canonicalJsonDigest(executionContext),
    preparedCheckpoint: prepared.checkpoint,
    preparedCheckpointDigest: canonicalJsonDigest(prepared.checkpoint),
    updateRef: prepared.updateRef,
    updateRefDigest: canonicalJsonDigest(prepared.updateRef),
    updateDigest: canonicalJsonDigest(prepared.update),
  },
  "checkpointDigest",
);
const moduleExecutionRecord = selfDigest(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleExecutionRecord",
    invocationId: invocation.invocationId,
    runId: invocation.runId,
    nodeId: invocation.nodeId,
    module: invocation.module,
    invocationFingerprint,
    graphAwareInvocationFingerprint,
    graphId: GRAPH_ID,
    projectId: PROJECT_ID,
    baseGraphRef: prepared.baseGraphRef,
    traceCheckpointKey,
    traceCheckpointDigest: traceCheckpoint.checkpointDigest,
    traceCheckpoint,
    moduleResult,
    traceabilityUpdate: prepared.update,
    traceabilityUpdateRef: prepared.updateRef,
    mergeReceipt,
    applicationProof,
  },
  "recordDigest",
);
validateModuleExecutionRecord(moduleExecutionRecord);
const executionRecordFile = await exactJsonFile(
  "module-execution-record.json",
  moduleExecutionRecord,
  "https://devrelay.dev/contracts/module-execution-record.schema.json",
  "application/vnd.devrelay.module-execution-record+json",
  "MER-CONTRACT-CHANGE-SIM-001-001",
);
const traceabilityUpdateFile = await exactJsonFile(
  "traceability-update.json",
  prepared.update,
  prepared.updateRef.schema,
  prepared.updateRef.mediaType,
  prepared.updateRef.artifactId,
);
await exactJsonFile(
  "traceability-merge-receipt.json",
  mergeReceipt.receipt,
  mergeReceipt.receiptRef.schema,
  mergeReceipt.receiptRef.mediaType,
  mergeReceipt.receiptRef.artifactId,
);
await exactJsonFile(
  "traceability-graph-snapshot.json",
  mergeReceipt.snapshot,
  mergeReceipt.snapshotRef.schema,
  mergeReceipt.snapshotRef.mediaType,
  mergeReceipt.snapshotRef.artifactId,
);

const gateReview = await exactJsonFile(
  "contract-gate-review.json",
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractGateReview",
    reviewId: "CGR-SIM-001-CONTRACT-CHANGE-001",
    candidate: execution.candidateRef,
    checkpointDigest: checkpoint.checkpointDigest,
    architectureBaseline: architecture.ref,
    projectOverviewBaseline: projectOverview.ref,
    requiredInterfaceIntentCount: requiredInterfaceIntentIds.length,
    contractCount: execution.candidate.contracts.length,
    checks: [
      { id: "exact-interface-coverage", status: "pass", evidence: execution.candidateRef },
      { id: "json-schema-2020-12-validation", status: "pass", evidence: checkpoint.artifacts.validationSet.ref },
      { id: "canonical-change-diff", status: "pass", evidence: checkpoint.artifacts.canonicalDiff.ref },
      { id: "zero-call-checkpoint-replay", status: "pass", evidenceDigest: checkpoint.checkpointDigest },
      { id: "candidate-traceability-merge", status: "pass", evidence: executionRecordFile.ref },
    ],
    compatibilityDisposition: checkpoint.artifacts.canonicalDiff.value.status,
    decision: "eligible-for-owner-approval",
  },
  "https://devrelay.dev/evidence/contract-gate-review/v1",
  "application/json",
  "CGR-SIM-001-001",
);
const gateCandidate = await exactJsonFile(
  "contract-gate-candidate.json",
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractGateCandidate",
    gateCandidateId: "CGC-SIM-001-001",
    candidate: execution.candidateRef,
    architectureBaseline: architecture.ref,
    projectOverviewBaseline: projectOverview.ref,
    formatValidation: checkpoint.artifacts.validationSet.ref,
    canonicalDiff: checkpoint.artifacts.canonicalDiff.ref,
    gateReview: gateReview.ref,
    moduleExecutionRecord: executionRecordFile.ref,
    terminalCheckpointDigest: checkpoint.checkpointDigest,
    requestedDecision: "approve",
  },
  "https://devrelay.dev/gates/contract-candidate/v1",
  "application/json",
  "CGC-SIM-001-001",
);
await exactJsonFile(
  "runtime-execution-proof.json",
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractGenerationRuntimeExecutionProof",
    invocation: invocationFile.ref,
    executionId: execution.executionId,
    executionFingerprint: execution.executionFingerprint,
    checkpointKey: execution.checkpointKey,
    checkpointDigest: checkpoint.checkpointDigest,
    firstExecutionReplayed: execution.replayed,
    secondExecutionReplayed: replay.replayed,
    generatorCalls,
    requiredInterfaceIntentCount: requiredInterfaceIntentIds.length,
    contractCount: execution.candidate.contracts.length,
    validatorRegistryDigest: checkpoint.validatorRegistryDigest,
    traceabilityUpdate: prepared.updateRef,
    traceabilityMergeReceipt: mergeReceipt.receiptRef,
    moduleExecutionRecord: executionRecordFile.ref,
    gateCandidate: gateCandidate.ref,
  },
  "https://devrelay.dev/evidence/contract-generation-runtime-execution-proof/v1",
  "application/json",
  "CG-RUNTIME-PROOF-SIM-001-001",
);

export const contractGenerationDogfoodExecution = Object.freeze({
  runtime,
  checkpoints,
  replayReceipt,
  checkpoint,
  checkpointFile,
  state,
  architecture,
  projectOverview,
  requirements,
  currentContractBaseline,
  invocation,
  moduleResult,
  candidateLoaded,
  gateReview,
  gateCandidate,
  executionRecordFile,
  traceabilityUpdateFile,
  prepared,
  mergeReceipt,
});

process.stdout.write(
  `${JSON.stringify(
    {
      status: "CONTRACT_GATE_CANDIDATE_READY",
      candidate: execution.candidateRef.digest,
      gateReview: gateReview.ref.digest,
      gateCandidate: gateCandidate.ref.digest,
      checkpoint: checkpoint.checkpointDigest,
      traceabilityUpdate: prepared.updateRef.digest,
      moduleExecutionRecord: executionRecordFile.ref.digest,
      requiredInterfaceIntents: requiredInterfaceIntentIds.length,
      contracts: execution.candidate.contracts.length,
      generatorCalls,
    },
    null,
    2,
  )}\n`,
);
