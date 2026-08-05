import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  validateWorkDependencyArtifact,
  WORK_DEPENDENCY_ARTIFACT_CONTRACTS,
} from "./work-dependency-artifact-validator.mjs";
import { analyzeDependencyGraph } from "./work-dependency-graph.mjs";
import {
  createNativeDependencyProposal,
  validateDependencyProposal,
} from "./work-dependency-native-proposer.mjs";
import { evaluateWorkDependencyPolicy } from "./work-dependency-opa.mjs";
import { buildWorkBreakdownAnalysisSnapshot } from "./work-dependency-snapshot.mjs";

const VERIFIED_RECEIPTS = new WeakSet();
const ENTRYPOINT = "devrelay/work_dependency/decision";

export class WorkDependencyRuntimeError extends Error {
  constructor(message, code = "DR3050") {
    super(`work dependency runtime failed: ${message}`);
    this.name = "WorkDependencyRuntimeError";
    this.code = code;
  }
}

function fail(message, code) {
  throw new WorkDependencyRuntimeError(message, code);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (ArrayBuffer.isView(entry)) return entry;
    if (entry !== null && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}

function stableId(value) {
  return {
    WorkBreakdownAnalysisSnapshot: value.snapshotId,
    DependencyProposal: value.proposalId,
    WorkDependencyConsistencyReview: value.reviewId,
    WorkDependencyCandidate: value.candidateId,
    WorkDependencyBaseline: value.baselineId,
  }[value.kind];
}

function artifactRecord(value, uriBase = "memory://devrelay/work-dependency-analysis") {
  validateWorkDependencyArtifact(value);
  const contract = WORK_DEPENDENCY_ARTIFACT_CONTRACTS[value.kind];
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const digest = sha256Digest(bytes);
  const artifactId =
    stableId(value) ?? `${value.kind.toLowerCase()}-${digest.slice(7, 23)}`;
  const ref = {
    artifactId,
    schema: contract.schema,
    mediaType: contract.mediaType,
    digest,
    uri: `${uriBase}/${artifactId}/${digest.slice(7)}.json`,
  };
  validateWorkDependencyArtifact(value, { ref });
  return immutable({ ref, value, bytesBase64: bytes.toString("base64") });
}

function validateLoaded(loaded, label) {
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    loaded.ref === null ||
    typeof loaded.ref !== "object" ||
    loaded.value === undefined ||
    (!Buffer.isBuffer(loaded.bytes) && !(loaded.bytes instanceof Uint8Array))
  ) {
    fail(`${label} must contain ref, parsed value, and exact raw bytes`);
  }
  if (sha256Digest(Buffer.from(loaded.bytes)) !== loaded.ref.digest) {
    fail(`${label} bytes do not match its ArtifactRef`);
  }
}

function sameRef(left, right) {
  return Boolean(
    left &&
      right &&
      left.artifactId === right.artifactId &&
      left.schema === right.schema &&
      left.mediaType === right.mediaType &&
      left.digest === right.digest,
  );
}
function descriptor(value, fallbackId) {
  if (value === undefined) return { id: fallbackId, version: "0.1.0" };
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    typeof value.version !== "string"
  ) {
    fail("adapter descriptors require id and version");
  }
  return { id: value.id, version: value.version };
}

function checkpointKey(executionId, executionFingerprint) {
  return `work-dependency-analysis/${executionId}/${executionFingerprint.slice(7)}`;
}

async function readCheckpoint(store, key) {
  if (!store || typeof store.get !== "function" || typeof store.put !== "function") {
    fail("a checkpoint store with get and put is required", "DR3051");
  }
  try {
    return await store.get(key);
  } catch (error) {
    fail(`checkpoint read failed: ${error.message}`, "DR3051");
  }
}

async function writeCheckpoint(store, key, value) {
  try {
    await store.put(key, value);
  } catch (error) {
    fail(`checkpoint write failed: ${error.message}`, "DR3052");
  }
}

function validateArtifactRecord(record) {
  if (
    !record ||
    typeof record.bytesBase64 !== "string" ||
    !record.ref ||
    record.value === undefined
  ) {
    fail("checkpoint contains a malformed artifact record", "DR3053");
  }
  const bytes = Buffer.from(record.bytesBase64, "base64");
  if (
    bytes.toString("base64") !== record.bytesBase64 ||
    sha256Digest(bytes) !== record.ref.digest ||
    !bytes.equals(Buffer.from(canonicalJson(record.value), "utf8"))
  ) {
    fail("checkpoint artifact record is not an exact canonical artifact", "DR3053");
  }
  validateWorkDependencyArtifact(record.value, { ref: record.ref });
}

function inputBindings(workBreakdown, projectOverview, contextSliceSet, policyBundle) {
  return [
    { role: "work-breakdown-baseline", artifact: structuredClone(workBreakdown.ref) },
    { role: "project-overview-baseline", artifact: structuredClone(projectOverview.ref) },
    { role: "context-slice-set", artifact: structuredClone(contextSliceSet.ref) },
    { role: "dependency-policy-bundle", artifact: structuredClone(policyBundle.ref) },
  ].sort((left, right) => compareText(left.role, right.role));
}

function sourceRefs(snapshot) {
  return snapshot.contextSlices
    .map((slice) => ({
      role: `context-slice:${slice.id}`,
      artifact: structuredClone(slice.sourceArtifact),
      jsonPointer: slice.selector,
    }))
    .sort((left, right) => compareText(left.role, right.role));
}

function consistencyReviewFallback(graphMechanics) {
  const material = {
    graphDigest: graphMechanics.graphDigest,
    status: "pass",
    findings: [],
  };
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkDependencyConsistencyReview",
    reviewId: `WDCR-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    reviewer: { id: "devrelay.native-consistency-reviewer", version: "0.1.0" },
    graphDigest: graphMechanics.graphDigest,
    advisory: true,
    status: "pass",
    findings: [],
  };
}

function validateReview(review, graphMechanics) {
  validateWorkDependencyArtifact(review);
  if (review.graphDigest !== graphMechanics.graphDigest) {
    fail("consistency review is not bound to the exact Core graph");
  }
  const blocking = review.findings.filter(({ severity }) => severity === "error");
  if ((review.status === "blocking") !== (blocking.length > 0)) {
    fail("consistency review status does not match its blocking findings");
  }
}

function buildCandidate({
  bindings,
  snapshotRecord,
  proposalRecord,
  mechanicsRecord,
  policyRecord,
  reviewRecord,
  rawResultRef,
}) {
  const mechanics = mechanicsRecord.value;
  const proposal = proposalRecord.value;
  const material = {
    snapshot: snapshotRecord.ref,
    proposal: proposalRecord.ref,
    graphMechanics: mechanicsRecord.ref,
    policyDecisionSet: policyRecord.ref,
    consistencyReview: reviewRecord.ref,
    graphDigest: mechanics.graphDigest,
  };
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkDependencyCandidate",
    candidateId: `WDC-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    operation: "analyze-dependencies",
    inputBindings: bindings,
    snapshot: snapshotRecord.ref,
    proposal: proposalRecord.ref,
    graphMechanics: mechanicsRecord.ref,
    policyDecisionSet: policyRecord.ref,
    consistencyReview: reviewRecord.ref,
    nodes: mechanics.nodes,
    edges: mechanics.edges,
    graphDigest: mechanics.graphDigest,
    topologicalOrder: mechanics.topologicalOrder,
    hintDispositions: proposal.hintDispositions,
    nativeArtifacts: [rawResultRef],
    sourceRefs: sourceRefs(snapshotRecord.value),
  };
}

function validateCheckpoint(checkpoint, expected = {}) {
  if (
    checkpoint?.apiVersion !== "devrelay.dev/v1alpha1" ||
    checkpoint.kind !== "WorkDependencyExecutionCheckpoint" ||
    typeof checkpoint.checkpointDigest !== "string"
  ) {
    fail("checkpoint has an invalid envelope", "DR3053");
  }
  const { checkpointDigest, ...material } = checkpoint;
  if (canonicalJsonDigest(material) !== checkpointDigest) {
    fail("checkpoint digest is invalid", "DR3053");
  }
  if (
    (expected.executionId && checkpoint.executionId !== expected.executionId) ||
    (expected.executionFingerprint &&
      checkpoint.executionFingerprint !== expected.executionFingerprint)
  ) {
    fail("checkpoint does not match the requested execution", "DR3053");
  }
  for (const record of Object.values(checkpoint.artifacts)) validateArtifactRecord(record);
  const mechanics = checkpoint.artifacts.graphMechanics.value;
  const proposal = checkpoint.artifacts.proposal.value;
  const policy = checkpoint.artifacts.policyDecisionSet.value;
  const review = checkpoint.artifacts.consistencyReview?.value;
  validateDependencyProposal(proposal, checkpoint.artifacts.snapshot.value);
  if (
    mechanics.graphDigest !== canonicalJsonDigest({
      nodes: mechanics.nodes,
      edges: mechanics.edges,
    }) ||
    policy.inputDigest !== canonicalJsonDigest({
      nodes: mechanics.nodes,
      edges: mechanics.edges,
      graphDigest: mechanics.graphDigest,
    })
  ) {
    fail("checkpoint Core graph or policy input binding is invalid", "DR3053");
  }
  if (
    !sameRef(policy.policyBundle, checkpoint.policyWasm) ||
    policy.entrypoint !== checkpoint.policyEntrypoint
  ) {
    fail("checkpoint OPA decision does not bind its resolved policy artifact", "DR3053");
  }
  if (review) validateReview(review, mechanics);
  if (checkpoint.artifacts.candidate) {
    const candidate = checkpoint.artifacts.candidate.value;
    if (
      candidate.graphDigest !== mechanics.graphDigest ||
      candidate.proposal.digest !== checkpoint.artifacts.proposal.ref.digest ||
      candidate.policyDecisionSet.digest !==
        checkpoint.artifacts.policyDecisionSet.ref.digest ||
      candidate.consistencyReview.digest !==
        checkpoint.artifacts.consistencyReview.ref.digest
    ) {
      fail("checkpoint candidate attachment binding is invalid", "DR3053");
    }
  }
  return checkpoint;
}

export function assertVerifiedWorkDependencyReceipt(receipt) {
  if (!VERIFIED_RECEIPTS.has(receipt)) {
    fail("Gate requires an unforgeable checkpoint replay receipt", "DR3054");
  }
  return receipt.checkpoint;
}

export function createWorkDependencyAnalysisRuntime({
  proposer,
  reviewer,
  entrypoint = ENTRYPOINT,
} = {}) {
  const proposerDescriptor = descriptor(
    proposer,
    "native-structured-dependency-proposer",
  );
  const reviewerDescriptor = descriptor(
    reviewer,
    "devrelay.native-consistency-reviewer",
  );
  const propose = proposer?.propose ?? (async (snapshot) => createNativeDependencyProposal(snapshot));
  const review = reviewer?.review ?? (async ({ graphMechanics }) => consistencyReviewFallback(graphMechanics));
  if (typeof propose !== "function" || typeof review !== "function") {
    fail("configured proposer and reviewer require callable operations");
  }

  async function execute({
    executionId,
    workBreakdown,
    projectOverview,
    contextSliceSet,
    policyBundle,
    resolveArtifact,
    checkpoints,
  }) {
    if (typeof executionId !== "string" || executionId.length === 0) {
      fail("executionId is required");
    }
    for (const [label, value] of Object.entries({
      workBreakdown,
      projectOverview,
      contextSliceSet,
      policyBundle,
    })) {
      validateLoaded(value, label);
    }
    const bindings = inputBindings(
      workBreakdown,
      projectOverview,
      contextSliceSet,
      policyBundle,
    );
    const executionFingerprint = canonicalJsonDigest({
      module: { id: "work-dependency-analysis", version: "0.1.0", operation: "analyze-dependencies" },
      executionId,
      bindings,
      proposer: proposerDescriptor,
      reviewer: reviewerDescriptor,
      entrypoint,
    });
    const key = checkpointKey(executionId, executionFingerprint);
    const existing = await readCheckpoint(checkpoints, key);
    if (existing !== undefined && existing !== null) {
      const checkpoint = immutable(existing);
      validateCheckpoint(checkpoint, { executionId, executionFingerprint });
      return immutable({
        executionId,
        executionFingerprint,
        checkpointKey: key,
        replayed: true,
        outcome: checkpoint.outcome,
        progressionAllowed: checkpoint.progressionAllowed,
        candidate: checkpoint.artifacts.candidate?.value,
        candidateRef: checkpoint.artifacts.candidate?.ref,
        diagnostics: checkpoint.diagnostics,
      });
    }

    validateWorkDependencyArtifact(policyBundle.value, { ref: policyBundle.ref });
    if (
      policyBundle.value.kind !== "OpaPolicyBundle" ||
      policyBundle.value.entrypoint !== entrypoint
    ) {
      fail("OPA policy manifest does not match the configured entrypoint");
    }
    if (typeof resolveArtifact !== "function") {
      fail("fresh execution requires an exact artifact resolver");
    }
    const policyWasm = await resolveArtifact(
      structuredClone(policyBundle.value.wasm),
    );
    validateLoaded(policyWasm, "policyWasm");
    if (
      !sameRef(policyWasm.ref, policyBundle.value.wasm) ||
      policyWasm.ref.mediaType !== "application/wasm"
    ) {
      fail("OPA policy manifest did not resolve its exact WASM artifact");
    }
    const snapshot = await buildWorkBreakdownAnalysisSnapshot({
      workBreakdown,
      projectOverview,
      contextSliceSet,
      resolveArtifact,
    });
    const snapshotRecord = artifactRecord(snapshot);
    const proposal = immutable(await propose(immutable(snapshot)));
    validateWorkDependencyArtifact(proposal);
    validateDependencyProposal(proposal, snapshot);
    if (
      proposal.proposer?.id !== proposerDescriptor.id ||
      proposal.proposer?.version !== proposerDescriptor.version
    ) {
      fail("proposal producer does not match the configured adapter");
    }
    const proposalRecord = artifactRecord(proposal);
    const mechanics = analyzeDependencyGraph({
      expectedWorkItemIds: snapshot.workItemIds,
      nodeIds: proposal.nodes,
      edges: proposal.edges,
    });
    const mechanicsRecord = artifactRecord(mechanics);
    const policyInput = {
      nodes: mechanics.nodes,
      edges: mechanics.edges,
      graphDigest: mechanics.graphDigest,
    };
    const policyEvaluation = await evaluateWorkDependencyPolicy({
      bundleRef: policyWasm.ref,
      bundleBytes: policyWasm.bytes,
      entrypoint,
      input: policyInput,
      opaCompilerVersion: policyBundle.value.opaCompilerVersion,
    });
    const policyRecord = artifactRecord(policyEvaluation.decisionSet);
    const reviewValue = immutable(
      await review(
        immutable({
          snapshot,
          proposal,
          graphMechanics: mechanics,
          policyDecisionSet: policyEvaluation.decisionSet,
        }),
      ),
    );
    validateReview(reviewValue, mechanics);
    if (
      reviewValue.reviewer?.id !== reviewerDescriptor.id ||
      reviewValue.reviewer?.version !== reviewerDescriptor.version
    ) {
      fail("review producer does not match the configured adapter");
    }
    const reviewRecord = artifactRecord(reviewValue);
    const diagnostics = [
      ...mechanics.diagnostics,
      ...policyEvaluation.decisionSet.diagnostics,
      ...reviewValue.findings,
    ].sort((left, right) =>
      `${left.code}\u0000${left.subject ?? ""}`.localeCompare(
        `${right.code}\u0000${right.subject ?? ""}`,
        "en",
      ),
    );
    const progressionAllowed =
      mechanics.status === "valid" &&
      policyEvaluation.decisionSet.evaluationStatus === "evaluated" &&
      policyEvaluation.decisionSet.allow === true &&
      reviewValue.status !== "blocking" &&
      diagnostics.every(({ severity }) => severity !== "error");
    const outcome = progressionAllowed
      ? "analyzed"
      : reviewValue.status === "blocking"
        ? "needs-clarification"
        : "unable-to-proceed";
    let candidateRecord;
    if (mechanics.status === "valid") {
      candidateRecord = artifactRecord(
        buildCandidate({
          bindings,
          snapshotRecord,
          proposalRecord,
          mechanicsRecord,
          policyRecord,
          reviewRecord,
          rawResultRef: policyEvaluation.rawResultRef,
        }),
      );
    }
    const artifacts = {
      snapshot: snapshotRecord,
      proposal: proposalRecord,
      graphMechanics: mechanicsRecord,
      policyDecisionSet: policyRecord,
      consistencyReview: reviewRecord,
      ...(candidateRecord ? { candidate: candidateRecord } : {}),
    };
    const checkpointMaterial = {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "WorkDependencyExecutionCheckpoint",
      executionId,
      executionFingerprint,
      checkpointKey: key,
      operation: "analyze-dependencies",
      inputBindings: bindings,
      adapters: { proposer: proposerDescriptor, reviewer: reviewerDescriptor },
      policyEntrypoint: entrypoint,
      policyWasm: structuredClone(policyWasm.ref),
      outcome,
      progressionAllowed,
      diagnostics,
      artifacts,
      opaRawResult: {
        ref: policyEvaluation.rawResultRef,
        bytesBase64: Buffer.from(policyEvaluation.rawResultBytes).toString("base64"),
      },
    };
    const checkpoint = immutable({
      ...checkpointMaterial,
      checkpointDigest: canonicalJsonDigest(checkpointMaterial),
    });
    await writeCheckpoint(checkpoints, key, checkpoint);
    return immutable({
      executionId,
      executionFingerprint,
      checkpointKey: key,
      replayed: false,
      outcome,
      progressionAllowed,
      candidate: candidateRecord?.value,
      candidateRef: candidateRecord?.ref,
      diagnostics,
    });
  }

  async function verifyCheckpointedExecution({
    executionId,
    executionFingerprint,
    checkpoints,
  }) {
    const key = checkpointKey(executionId, executionFingerprint);
    const loaded = await readCheckpoint(checkpoints, key);
    if (loaded === undefined || loaded === null) {
      fail("checkpoint-only verification requires the exact checkpoint", "DR3053");
    }
    const checkpoint = immutable(loaded);
    validateCheckpoint(checkpoint, { executionId, executionFingerprint });
    const receipt = Object.freeze({
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "VerifiedWorkDependencyCheckpointReplayReceipt",
      executionId,
      executionFingerprint,
      checkpointKey: key,
      checkpointDigest: checkpoint.checkpointDigest,
      checkpoint,
    });
    VERIFIED_RECEIPTS.add(receipt);
    return receipt;
  }

  return Object.freeze({
    execute,
    verifyCheckpointedExecution,
    proposer: immutable(proposerDescriptor),
    reviewer: immutable(reviewerDescriptor),
    entrypoint,
  });
}
