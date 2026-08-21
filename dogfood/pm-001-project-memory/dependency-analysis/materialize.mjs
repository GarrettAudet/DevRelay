import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLoadedJsonValueFidelity, repositoryArtifactUriFromUrl } from "../../_support/repository-artifact-uri.mjs";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import { createNativeDependencyProposal } from "../../../src/work-dependency-native-proposer.mjs";
import { createWorkDependencyAnalysisRuntime } from "../../../src/work-dependency-runtime.mjs";
import { createContextSlice } from "../../../src/work-dependency-snapshot.mjs";

const ROOT = new URL("../../../", import.meta.url);
const OUTPUT = new URL("./", import.meta.url);
const REPOSITORY_REVISION = "a18e6fbfac4f8e3088b349dd2c018efcc5dc0bc1";

function stableId(value) {
  return (
    value.baselineId ??
    value.sliceSetId ??
    value.policyId ??
    value.candidateId ??
    value.reviewId ??
    (value.kind === "RepositorySnapshot" ? `repository-snapshot-devrelay-${value.revision.slice(0, 7)}` : value.artifactId)
  );
}

function refFor({ value, bytes, schema, mediaType, uri, artifactId = stableId(value) }) {
  return {
    artifactId,
    schema,
    mediaType,
    digest: sha256Digest(bytes),
    uri,
  };
}

async function loadedFile(relativePath, schema, mediaType) {
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

function memoryCheckpointStore() {
  const entries = new Map();
  return {
    entries,
    async get(key) {
      return entries.get(key);
    },
    async put(key, value) {
      if (entries.has(key)) throw new Error(`immutable checkpoint ${key} already exists`);
      entries.set(key, structuredClone(value));
    },
  };
}

function specKitReview(graphMechanics) {
  const material = {
    graphDigest: graphMechanics.graphDigest,
    status: "pass",
    findings: [],
  };
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkDependencyConsistencyReview",
    reviewId: `WDCR-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    reviewer: { id: "spec-kit-dependency-reviewer", version: "0.1.0" },
    graphDigest: graphMechanics.graphDigest,
    advisory: true,
    status: "pass",
    findings: [],
  };
}

const workBreakdown = await loadedFile(
  "project/work-breakdown-baseline.json",
  "https://devrelay.dev/artifacts/work-breakdown-baseline/v1",
  "application/vnd.devrelay.work-breakdown-baseline+json",
);
const projectOverview = await loadedFile(
  "project/project-overview-baseline.json",
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
);
const requirements = await loadedFile(
  "project/requirements-baseline.json",
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
);
const architecture = await loadedFile(
  "project/architecture-baseline.json",
  "https://devrelay.dev/artifacts/architecture-baseline/v1",
  "application/vnd.devrelay.architecture-baseline+json",
);
const contracts = await loadedFile(
  "project/contract-baseline.json",
  "https://devrelay.dev/artifacts/contract-baseline/v1",
  "application/vnd.devrelay.contract-baseline+json",
);
const repository = await loadedFile(
  "dogfood/pm-001-project-memory/repository-snapshot.json",
  "https://devrelay.dev/artifacts/repository-snapshot/v1",
  "application/vnd.devrelay.repository-snapshot+json",
);
if (repository.value.revision !== REPOSITORY_REVISION) {
  throw new Error("repository snapshot revision drifted before dependency analysis");
}

const coveredRefs = workBreakdown.value.workItems.map(({ id }) => id);
const contextSliceSetValue = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ContextSliceSet",
  sliceSetId: "CTXS-WDA-PM-001-001",
  slices: [
    createContextSlice({
      id: "CTX-WDA-PM-001-REQUIREMENTS",
      purpose: "Admit the approved acceptance criteria needed to audit dependency completeness.",
      source: requirements,
      sourceKind: "RequirementsBaseline",
      sourceVersion: { kind: "artifact-version", value: requirements.value.version },
      selector: "/requirements/acceptanceCriteria",
      coveredRefs,
    }),
    createContextSlice({
      id: "CTX-WDA-PM-001-ARCHITECTURE",
      purpose: "Admit the approved architecture elements needed to audit implementation ordering.",
      source: architecture,
      sourceKind: "ArchitectureBaseline",
      sourceVersion: { kind: "content-digest", value: architecture.ref.digest },
      selector: "/sections/architectureModel/content/elements",
      coveredRefs,
    }),
    createContextSlice({
      id: "CTX-WDA-PM-001-CONTRACTS",
      purpose: "Admit the approved interface contracts needed to audit realization ordering.",
      source: contracts,
      sourceKind: "ContractBaseline",
      sourceVersion: { kind: "artifact-version", value: contracts.value.version },
      selector: "/contracts",
      coveredRefs,
    }),
    createContextSlice({
      id: "CTX-WDA-PM-001-REPOSITORY-REVISION",
      purpose: "Pin dependency analysis to the exact repository revision used by the approved change package.",
      source: repository,
      sourceKind: "RepositorySnapshot",
      sourceVersion: { kind: "repository-commit", value: REPOSITORY_REVISION },
      selector: "/revision",
      coveredRefs,
    }),
  ],
};
const contextSliceSet = await exactJsonFile(
  "context-slice-set.json",
  contextSliceSetValue,
  "https://devrelay.dev/artifacts/context-slice-set/v1",
  "application/vnd.devrelay.context-slice-set+json",
);

const policyWasmBytes = await readFile(
  new URL("policies/work-dependency-analysis/policy.wasm", ROOT),
);
const policyWasm = {
  value: { kind: "OpaWasmPolicyBinary" },
  bytes: policyWasmBytes,
  ref: {
    artifactId: "opa-wda-policy-wasm-0.1.0",
    schema: "https://devrelay.dev/native/opa-wasm/v1",
    mediaType: "application/wasm",
    digest: sha256Digest(policyWasmBytes),
    uri: repositoryArtifactUriFromUrl(
      ROOT,
      new URL("policies/work-dependency-analysis/policy.wasm", ROOT),
    ),
  },
};
const policyBundle = await exactJsonFile(
  "opa-policy-bundle.json",
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "OpaPolicyBundle",
    policyId: "OPA-WDA-DEPENDENCY-POLICY",
    version: "0.1.0",
    wasm: policyWasm.ref,
    entrypoint: "devrelay/work_dependency/decision",
    opaCompilerVersion: "1.16.2",
  },
  "https://devrelay.dev/artifacts/opa-policy-bundle/v1",
  "application/vnd.devrelay.opa-policy-bundle+json",
);

const sources = new Map(
  [requirements, architecture, contracts, repository, policyWasm].map((entry) => [
    entry.ref.digest,
    entry,
  ]),
);
let proposerCalls = 0;
let reviewerCalls = 0;
const runtime = createWorkDependencyAnalysisRuntime({
  proposer: {
    id: "native-structured-dependency-proposer",
    version: "0.1.0",
    async propose(snapshot) {
      proposerCalls += 1;
      return createNativeDependencyProposal(snapshot);
    },
  },
  reviewer: {
    id: "spec-kit-dependency-reviewer",
    version: "0.1.0",
    async review({ graphMechanics }) {
      reviewerCalls += 1;
      return specKitReview(graphMechanics);
    },
  },
});
const checkpoints = memoryCheckpointStore();
const execution = await runtime.execute({
  executionId: "WDA-PM-001-001",
  workBreakdown,
  projectOverview,
  contextSliceSet,
  policyBundle,
  resolveArtifact: async (ref) => sources.get(ref.digest),
  checkpoints,
});
if (!execution.progressionAllowed || execution.outcome !== "analyzed") {
  throw new Error("dogfood dependency analysis did not produce a Gate-eligible candidate");
}
const replay = await runtime.execute({
  executionId: execution.executionId,
  workBreakdown,
  projectOverview,
  contextSliceSet,
  policyBundle,
  resolveArtifact: async () => {
    throw new Error("checkpoint replay must not resolve artifacts");
  },
  checkpoints,
});
if (!replay.replayed || proposerCalls !== 1 || reviewerCalls !== 1) {
  throw new Error("checkpoint replay was not zero-call deterministic");
}
const receipt = await runtime.verifyCheckpointedExecution({
  executionId: execution.executionId,
  executionFingerprint: execution.executionFingerprint,
  checkpoints,
});
const checkpoint = receipt.checkpoint;

const artifactNames = {
  snapshot: "work-breakdown-analysis-snapshot.json",
  proposal: "dependency-proposal.json",
  graphMechanics: "graph-mechanics-result.json",
  policyDecisionSet: "opa-policy-decision-set.json",
  consistencyReview: "spec-kit-consistency-review.json",
  candidate: "work-dependency-candidate.json",
};
for (const [key, name] of Object.entries(artifactNames)) {
  const record = checkpoint.artifacts[key];
  await writeFile(new URL(name, OUTPUT), Buffer.from(record.bytesBase64, "base64"));
}
await writeFile(
  new URL("opa-raw-result.json", OUTPUT),
  Buffer.from(checkpoint.opaRawResult.bytesBase64, "base64"),
);
await writeFile(
  new URL("execution-checkpoint.json", OUTPUT),
  Buffer.from(canonicalJson(checkpoint), "utf8"),
);

const gateReview = await exactJsonFile(
  "work-dependency-gate-review.json",
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkDependencyGateReview",
    reviewId: "WDA-GATE-REVIEW-PM-001-001",
    candidate: execution.candidateRef,
    checkpointDigest: checkpoint.checkpointDigest,
    workBreakdownBaseline: workBreakdown.ref,
    repositoryRevision: REPOSITORY_REVISION,
    checks: [
      { id: "full-snapshot", status: "pass", evidence: checkpoint.artifacts.snapshot.ref },
      { id: "graphology-dag", status: "pass", evidence: checkpoint.artifacts.graphMechanics.ref },
      { id: "opa-policy", status: "pass", evidence: checkpoint.artifacts.policyDecisionSet.ref },
      { id: "spec-kit-consistency", status: "pass", evidence: checkpoint.artifacts.consistencyReview.ref },
      { id: "zero-call-replay", status: "pass", evidenceDigest: checkpoint.checkpointDigest },
    ],
    decision: "eligible-for-owner-approval",
  },
  "https://devrelay.dev/evidence/work-dependency-gate-review/v1",
  "application/json",
);
const gateCandidate = await exactJsonFile(
  "gate-candidate.json",
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkDependencyGateCandidate",
    gateCandidateId: "WDA-GATE-CANDIDATE-PM-001-001",
    candidate: execution.candidateRef,
    workBreakdownBaseline: workBreakdown.ref,
    projectOverviewBaseline: projectOverview.ref,
    contextSliceSet: contextSliceSet.ref,
    policyBundle: policyBundle.ref,
    gateReview: gateReview.ref,
    terminalCheckpointDigest: checkpoint.checkpointDigest,
    repositoryRevision: REPOSITORY_REVISION,
    requestedDecision: "approve",
  },
  "https://devrelay.dev/gates/work-dependency-candidate/v1",
  "application/json",
  "WDA-GATE-CANDIDATE-PM-001-001",
);
await exactJsonFile(
  "runtime-execution-proof.json",
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkDependencyRuntimeExecutionProof",
    executionId: execution.executionId,
    executionFingerprint: execution.executionFingerprint,
    checkpointKey: execution.checkpointKey,
    checkpointDigest: checkpoint.checkpointDigest,
    firstExecutionReplayed: execution.replayed,
    secondExecutionReplayed: replay.replayed,
    proposerCalls,
    reviewerCalls,
    workItemCount: execution.candidate.nodes.length,
    dependencyCount: execution.candidate.edges.length,
    candidate: execution.candidateRef,
    gateCandidate: gateCandidate.ref,
  },
  "https://devrelay.dev/evidence/work-dependency-runtime-execution-proof/v1",
  "application/json",
  "WDA-RUNTIME-PROOF-PM-001-001",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "WORK_DEPENDENCY_GATE_CANDIDATE_READY",
      candidate: execution.candidateRef.digest,
      gateReview: gateReview.ref.digest,
      gateCandidate: gateCandidate.ref.digest,
      checkpoint: checkpoint.checkpointDigest,
      workItems: execution.candidate.nodes.length,
      dependencies: execution.candidate.edges.length,
      proposerCalls,
      reviewerCalls,
      repositoryRevision: REPOSITORY_REVISION,
    },
    null,
    2,
  )}\n`,
);
