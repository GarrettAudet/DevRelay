import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import {
  compileEmbeddedSchema,
  documentValidators,
  validationDetail,
} from "./schema-validation.mjs";
import {
  TRACEABILITY_GRAPH_MEDIA_TYPE,
  TRACEABILITY_GRAPH_SCHEMA,
  TRACEABILITY_RECEIPT_MEDIA_TYPE,
  TRACEABILITY_RECEIPT_SCHEMA,
  TRACEABILITY_UPDATE_MEDIA_TYPE,
  TRACEABILITY_UPDATE_SCHEMA,
  traceabilityHorizonRank,
  validateTraceabilityGraphSnapshot,
  validateTraceabilityMergeReceipt,
  validateTraceabilityUpdate,
} from "./traceability-artifact-validator.mjs";

export const MODULE_EXECUTION_RECORD_SCHEMA =
  "https://devrelay.dev/contracts/module-execution-record.schema.json";
export const MODULE_EXECUTION_RECORD_MEDIA_TYPE =
  "application/vnd.devrelay.module-execution-record+json";

const recordValidator = compileEmbeddedSchema(
  JSON.parse(
    readFileSync(
      new URL("../contracts/module-execution-record.schema.json", import.meta.url),
      "utf8",
    ),
  ),
);

export class ModuleExecutionRecordValidationError extends Error {
  constructor(message) {
    super(`TG_INVALID_EXECUTION_RECORD: ${message}`);
    this.name = "ModuleExecutionRecordValidationError";
    this.code = "TG_INVALID_EXECUTION_RECORD";
  }
}

function fail(message) {
  throw new ModuleExecutionRecordValidationError(message);
}

function exact(left, right) {
  return canonicalJsonDigest(left) === canonicalJsonDigest(right);
}

function validateArtifactValueRef(ref, value, { schema, mediaType }, label) {
  if (ref.schema !== schema || ref.mediaType !== mediaType) {
    fail(`${label} uses the wrong schema or media type`);
  }
  if (ref.digest !== canonicalJsonDigest(value)) {
    fail(`${label} digest does not identify its exact canonical value`);
  }
}

export function createGraphAwareInvocationFingerprint({
  invocationFingerprint,
  graphId,
  projectId,
  baseGraphRef,
}) {
  return canonicalJsonDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "GraphAwareInvocationFingerprint",
    invocationFingerprint,
    graphId,
    projectId,
    baseGraphRef,
  });
}

export function createTraceCheckpointKey({
  graphId,
  projectId,
  invocationId,
  runId,
  nodeId,
  module,
  invocationFingerprint,
}) {
  return canonicalJsonDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleTraceabilityCheckpointKey",
    graph: { graphId, projectId },
    invocationId,
    runId,
    nodeId,
    module,
    invocationFingerprint,
  });
}

function validateTraceCheckpoint(record) {
  const checkpoint = record.traceCheckpoint;
  const { checkpointDigest: ignored, ...material } = checkpoint;
  if (
    checkpoint.checkpointDigest !== canonicalJsonDigest(material) ||
    record.traceCheckpointDigest !== checkpoint.checkpointDigest
  ) {
    fail("traceCheckpointDigest does not bind the exact embedded checkpoint");
  }
  if (
    checkpoint.traceCheckpointKey !== record.traceCheckpointKey ||
    checkpoint.invocationId !== record.invocationId ||
    checkpoint.runId !== record.runId ||
    checkpoint.nodeId !== record.nodeId ||
    !exact(checkpoint.module, record.module) ||
    checkpoint.invocationFingerprint !== record.invocationFingerprint ||
    checkpoint.graphAwareInvocationFingerprint !== record.graphAwareInvocationFingerprint ||
    checkpoint.graphId !== record.graphId ||
    checkpoint.projectId !== record.projectId ||
    !exact(checkpoint.baseGraphRef, record.baseGraphRef) ||
    !exact(checkpoint.moduleResult, record.moduleResult)
  ) {
    fail("embedded traceCheckpoint does not match the execution record identity");
  }
  if (
    checkpoint.moduleResultDigest !== canonicalJsonDigest(checkpoint.moduleResult) ||
    checkpoint.executionContextDigest !== canonicalJsonDigest(checkpoint.executionContext) ||
    checkpoint.preparedCheckpointDigest !== canonicalJsonDigest(checkpoint.preparedCheckpoint) ||
    checkpoint.updateRefDigest !== canonicalJsonDigest(checkpoint.updateRef) ||
    checkpoint.updateDigest !== canonicalJsonDigest(checkpoint.preparedCheckpoint.update)
  ) {
    fail("embedded traceCheckpoint contains an invalid component digest");
  }
  if (
    !exact(checkpoint.preparedCheckpoint.baseGraphRef, checkpoint.baseGraphRef) ||
    !exact(checkpoint.preparedCheckpoint.updateRef, checkpoint.updateRef) ||
    !exact(checkpoint.preparedCheckpoint.updateRef, record.traceabilityUpdateRef) ||
    !exact(checkpoint.preparedCheckpoint.update, record.traceabilityUpdate)
  ) {
    fail("embedded traceCheckpoint does not bind the exact prepared update");
  }
}

function validateNestedArtifacts(record) {
  if (!documentValidators.moduleResult(record.moduleResult)) {
    fail(
      `moduleResult is invalid: ${validationDetail(
        documentValidators.moduleResult,
      )}`,
    );
  }
  validateTraceabilityUpdate(record.traceabilityUpdate);
  validateTraceabilityGraphSnapshot(record.mergeReceipt.snapshot);
  validateTraceabilityMergeReceipt(record.mergeReceipt.receipt);
  validateTraceabilityMergeReceipt(record.applicationProof.receipt);
  validateTraceCheckpoint(record);
}

function validateIdentity(record) {
  if (record.moduleResult.invocationId !== record.invocationId) {
    fail("moduleResult does not belong to the recorded invocation");
  }
  const producer = record.traceabilityUpdate.producer;
  if (
    producer.invocationId !== record.invocationId ||
    producer.invocationFingerprint !== record.invocationFingerprint ||
    producer.outcome !== record.moduleResult.outcome ||
    !exact(producer.module, record.module)
  ) {
    fail("traceability producer does not match the recorded module execution");
  }
  if (
    record.traceabilityUpdate.graphId !== record.graphId ||
    record.traceabilityUpdate.projectId !== record.projectId ||
    !exact(record.traceabilityUpdate.baseGraph, record.baseGraphRef)
  ) {
    fail("traceability update does not match the recorded graph context");
  }
  if (
    record.graphAwareInvocationFingerprint !==
    createGraphAwareInvocationFingerprint(record)
  ) {
    fail("graphAwareInvocationFingerprint is invalid");
  }
  if (record.traceCheckpointKey !== createTraceCheckpointKey(record)) {
    fail("traceCheckpointKey is invalid");
  }
  if (
    record.baseGraphRef.schema !== TRACEABILITY_GRAPH_SCHEMA ||
    record.baseGraphRef.mediaType !== TRACEABILITY_GRAPH_MEDIA_TYPE
  ) {
    fail("baseGraphRef is not a TraceabilityGraph snapshot ref");
  }
  if (
    record.moduleResult.traceabilityUpdate !== undefined &&
    !exact(record.moduleResult.traceabilityUpdate, record.traceabilityUpdateRef)
  ) {
    fail("moduleResult traceabilityUpdate does not match the recorded update ref");
  }
}

function validateMerge(record) {
  const updateRef = record.traceabilityUpdateRef;
  const merge = record.mergeReceipt;
  const proof = record.applicationProof;

  validateArtifactValueRef(
    updateRef,
    record.traceabilityUpdate,
    {
      schema: TRACEABILITY_UPDATE_SCHEMA,
      mediaType: TRACEABILITY_UPDATE_MEDIA_TYPE,
    },
    "traceabilityUpdateRef",
  );
  validateArtifactValueRef(
    merge.snapshotRef,
    merge.snapshot,
    {
      schema: TRACEABILITY_GRAPH_SCHEMA,
      mediaType: TRACEABILITY_GRAPH_MEDIA_TYPE,
    },
    "mergeReceipt.snapshotRef",
  );
  validateArtifactValueRef(
    merge.receiptRef,
    merge.receipt,
    {
      schema: TRACEABILITY_RECEIPT_SCHEMA,
      mediaType: TRACEABILITY_RECEIPT_MEDIA_TYPE,
    },
    "mergeReceipt.receiptRef",
  );

  if (
    merge.disposition !== merge.receipt.disposition ||
    !exact(merge.snapshotRef, merge.receipt.resultGraph) ||
    !exact(updateRef, merge.receipt.update) ||
    !exact(merge.diagnostics, merge.receipt.diagnostics)
  ) {
    fail("merge result does not match its canonical receipt");
  }
  if (
    merge.snapshot.graphId !== record.graphId ||
    merge.snapshot.projectId !== record.projectId ||
    merge.receipt.graphId !== record.graphId
  ) {
    fail("merge result belongs to a different graph or project");
  }
  if (
    merge.receipt.previousGraph.schema !== TRACEABILITY_GRAPH_SCHEMA ||
    merge.receipt.previousGraph.mediaType !== TRACEABILITY_GRAPH_MEDIA_TYPE ||
    !exact(merge.snapshot.parentGraph, merge.receipt.previousGraph) ||
    !exact(merge.snapshot.lastAppliedUpdate, updateRef) ||
    !merge.snapshot.appliedUpdates.some((applied) => exact(applied, updateRef)) ||
    merge.snapshot.revision !== merge.receipt.revisionAfter ||
    merge.receipt.revisionAfter !== merge.receipt.revisionBefore + 1
  ) {
    fail("merge snapshot does not prove exact update application");
  }
  if (
    traceabilityHorizonRank(merge.snapshot.horizon) <
    traceabilityHorizonRank(record.traceabilityUpdate.horizon)
  ) {
    fail("result snapshot horizon precedes the applied update horizon");
  }
  const changed = Object.values(merge.receipt.changes).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (changed > 0) {
    const expectedDisposition = exact(
      record.traceabilityUpdate.baseGraph,
      merge.receipt.previousGraph,
    )
      ? "merged"
      : "rebased";
    if (merge.disposition !== expectedDisposition) {
      fail("merge disposition does not match base and previous graph identity");
    }
  } else if (merge.disposition !== "no-op") {
    fail("zero-change application must use no-op disposition");
  }
  if (
    !exact(proof.updateRef, updateRef) ||
    !exact(proof.receiptRef, merge.receiptRef) ||
    !exact(proof.receipt, merge.receipt) ||
    !exact(proof.resultGraphRef, merge.snapshotRef)
  ) {
    fail("applicationProof does not prove the exact recorded merge");
  }
}

export function validateModuleExecutionRecord(record) {
  if (!recordValidator(record)) {
    fail(validationDetail(recordValidator));
  }
  validateNestedArtifacts(record);
  validateIdentity(record);
  validateMerge(record);
  const { recordDigest: ignored, ...material } = record;
  if (record.recordDigest !== canonicalJsonDigest(material)) {
    fail("recordDigest is invalid");
  }
  return record;
}
