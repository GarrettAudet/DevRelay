import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import {
  createGraphAwareInvocationFingerprint,
  createTraceCheckpointKey,
  validateModuleExecutionRecord,
} from "../src/module-execution-record-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
} from "../src/traceability-graph.mjs";

function loadedArtifact(id, value) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    ref: {
      artifactId: id,
      schema: `https://example.test/artifacts/${id}/v1`,
      mediaType: "application/json",
      digest: sha256Digest(bytes),
      uri: `memory://fixtures/${id}.json`,
    },
    bytes,
    value,
  };
}

function selfDigest(value, field) {
  const { [field]: ignored, ...material } = value;
  value[field] = canonicalJsonDigest(material);
  return value;
}

function resignRecord(record) {
  return selfDigest(record, "recordDigest");
}

function rebindMerge(record) {
  record.mergeReceipt.snapshotRef.digest = canonicalJsonDigest(record.mergeReceipt.snapshot);
  record.mergeReceipt.receipt.resultGraph = structuredClone(record.mergeReceipt.snapshotRef);
  record.mergeReceipt.receiptRef.digest = canonicalJsonDigest(record.mergeReceipt.receipt);
  record.applicationProof.receipt = structuredClone(record.mergeReceipt.receipt);
  record.applicationProof.receiptRef = structuredClone(record.mergeReceipt.receiptRef);
  record.applicationProof.resultGraphRef = structuredClone(record.mergeReceipt.snapshotRef);
  return resignRecord(record);
}

async function validRecord() {
  const graphId = "record-graph";
  const projectId = "record-project";
  const module = { id: "requirements", version: "1.0.0", operation: "gather" };
  const invocation = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleInvocation",
    invocationId: "invocation-record",
    runId: "run-record",
    nodeId: "node-record",
    module,
    inputs: {},
    options: {},
  };
  const invocationFingerprint = canonicalJsonDigest({ invocation });
  const output = loadedArtifact("record-output", { objective: "Ship safely" });
  const moduleResult = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleResult",
    invocationId: invocation.invocationId,
    status: "completed",
    outcome: "completed",
    outputs: { primary: [output.ref] },
    evidence: [],
    diagnostics: [],
  };
  const ownership = {
    scope: "requirements/candidate",
    authority: "candidate",
    nodeKinds: ["business-objective"],
    edgeKinds: [],
  };
  const service = createTraceabilityGraphService({
    graphId,
    projectId,
    store: createInMemoryTraceabilityStore(),
    contributors: [
      {
        metadata: {
          id: "test.record-projector",
          version: "1.0.0",
          contractDigest: canonicalJsonDigest({
            id: "test.record-projector",
            version: "1.0.0",
            ownership,
          }),
        },
        match: { moduleId: module.id },
        scope: ownership.scope,
        authority: ownership.authority,
        ownership,
        async project() {
          return {
            horizon: "architecture",
            nodes: [
              {
                kind: "business-objective",
                stableId: "BO-ONE",
                label: "Ship safely",
                sourceLocators: [
                  {
                    artifact: {
                      artifactId: output.ref.artifactId,
                      digest: output.ref.digest,
                    },
                    jsonPointer: "",
                    entityDigest: canonicalJsonDigest(output.value),
                  },
                ],
              },
            ],
            edges: [],
          };
        },
      },
    ],
  });
  const base = service.captureBase();
  const graphAwareInvocationFingerprint = createGraphAwareInvocationFingerprint({
    invocationFingerprint,
    graphId,
    projectId,
    baseGraphRef: base.ref,
  });
  const traceCheckpointKey = createTraceCheckpointKey({
    graphId,
    projectId,
    invocationId: invocation.invocationId,
    runId: invocation.runId,
    nodeId: invocation.nodeId,
    module,
    invocationFingerprint,
  });
  const prepared = await service.prepare({
    baseGraph: base,
    invocation,
    invocationFingerprint,
    moduleResult,
    loadedInputs: {},
    loadedOutputs: { primary: [output] },
  });
  const mergeReceipt = await service.mergePrepared(prepared);
  const applicationProof = service.assertApplied(prepared.updateRef);
  const traceCheckpoint = selfDigest(
    {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ModuleTraceabilityCheckpoint",
      traceCheckpointKey,
      invocationId: invocation.invocationId,
      runId: invocation.runId,
      nodeId: invocation.nodeId,
      module,
      invocationFingerprint,
      graphAwareInvocationFingerprint,
      graphId,
      projectId,
      baseGraphRef: prepared.baseGraphRef,
      moduleResult,
      moduleResultDigest: canonicalJsonDigest(moduleResult),
      executionContext: { purpose: "validator-fixture" },
      executionContextDigest: canonicalJsonDigest({ purpose: "validator-fixture" }),
      preparedCheckpoint: prepared.checkpoint,
      preparedCheckpointDigest: canonicalJsonDigest(prepared.checkpoint),
      updateRef: prepared.updateRef,
      updateRefDigest: canonicalJsonDigest(prepared.updateRef),
      updateDigest: canonicalJsonDigest(prepared.update),
    },
    "checkpointDigest",
  );
  const record = resignRecord({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleExecutionRecord",
    invocationId: invocation.invocationId,
    runId: invocation.runId,
    nodeId: invocation.nodeId,
    module,
    invocationFingerprint,
    graphAwareInvocationFingerprint,
    graphId,
    projectId,
    baseGraphRef: prepared.baseGraphRef,
    traceCheckpointKey,
    traceCheckpointDigest: traceCheckpoint.checkpointDigest,
    traceCheckpoint,
    moduleResult,
    traceabilityUpdate: prepared.update,
    traceabilityUpdateRef: prepared.updateRef,
    mergeReceipt,
    applicationProof,
  });
  return { record, base };
}

test("execution record embeds and content-binds the exact persisted trace checkpoint", async () => {
  const { record } = await validRecord();
  assert.equal(validateModuleExecutionRecord(record), record);
  assert.equal(record.traceCheckpointDigest, record.traceCheckpoint.checkpointDigest);
  assert.equal(
    record.traceCheckpoint.preparedCheckpoint.updateRef.digest,
    record.traceabilityUpdateRef.digest,
  );
});

test("an arbitrary checkpoint digest cannot be made valid by resigning the record", async () => {
  const { record: original } = await validRecord();
  const record = structuredClone(original);
  record.traceCheckpointDigest = `sha256:${"f".repeat(64)}`;
  resignRecord(record);
  assert.throws(
    () => validateModuleExecutionRecord(record),
    /does not bind the exact embedded checkpoint/u,
  );
});

test("a self-consistent checkpoint still cannot substitute a different prepared update", async () => {
  const { record: original } = await validRecord();
  const record = structuredClone(original);
  record.traceCheckpoint.preparedCheckpoint.update = { forged: true };
  record.traceCheckpoint.preparedCheckpointDigest = canonicalJsonDigest(
    record.traceCheckpoint.preparedCheckpoint,
  );
  record.traceCheckpoint.updateDigest = canonicalJsonDigest({ forged: true });
  selfDigest(record.traceCheckpoint, "checkpointDigest");
  record.traceCheckpointDigest = record.traceCheckpoint.checkpointDigest;
  resignRecord(record);
  assert.throws(
    () => validateModuleExecutionRecord(record),
    /does not bind the exact prepared update/u,
  );
});

test("an unapplied graph snapshot and fabricated no-op receipt cannot form an execution record", async () => {
  const { record: original, base } = await validRecord();
  const record = structuredClone(original);
  record.traceCheckpointDigest = `sha256:${"f".repeat(64)}`;
  record.mergeReceipt.disposition = "no-op";
  record.mergeReceipt.snapshot = structuredClone(base.snapshot);
  record.mergeReceipt.snapshotRef = structuredClone(base.ref);
  record.mergeReceipt.receipt = {
    ...record.mergeReceipt.receipt,
    previousGraph: structuredClone(base.ref),
    resultGraph: structuredClone(base.ref),
    disposition: "no-op",
    revisionBefore: 0,
    revisionAfter: 0,
    changes: {
      nodesAdded: 0,
      nodesReplaced: 0,
      nodesRetired: 0,
      edgesAdded: 0,
      edgesReplaced: 0,
      edgesRetired: 0,
    },
  };
  record.mergeReceipt.receiptRef.digest = canonicalJsonDigest(record.mergeReceipt.receipt);
  record.applicationProof = {
    updateRef: structuredClone(record.traceabilityUpdateRef),
    receiptRef: structuredClone(record.mergeReceipt.receiptRef),
    receipt: structuredClone(record.mergeReceipt.receipt),
    resultGraphRef: structuredClone(base.ref),
  };
  resignRecord(record);
  assert.throws(() => validateModuleExecutionRecord(record));
});

test("snapshot project identity and exact applied-update metadata are closed cross-fields", async () => {
  const { record: original } = await validRecord();
  const wrongProject = structuredClone(original);
  wrongProject.mergeReceipt.snapshot.projectId = "substituted-project";
  rebindMerge(wrongProject);
  assert.throws(
    () => validateModuleExecutionRecord(wrongProject),
    /different graph or project/u,
  );

  const alteredUpdateRef = structuredClone(original);
  alteredUpdateRef.mergeReceipt.snapshot.lastAppliedUpdate.uri =
    "memory://attacker/same-digest-different-ref.json";
  rebindMerge(alteredUpdateRef);
  assert.throws(
    () => validateModuleExecutionRecord(alteredUpdateRef),
    /(?:exact member|does not prove exact update application)/u,
  );
});


test("result snapshot horizon cannot precede the applied update horizon", async () => {
  const { record: original } = await validRecord();
  assert.equal(original.traceabilityUpdate.horizon, "architecture");
  const record = structuredClone(original);
  record.mergeReceipt.snapshot.horizon = "requirements";
  rebindMerge(record);
  assert.throws(
    () => validateModuleExecutionRecord(record),
    /snapshot horizon precedes/u,
  );
});

test("changed merge disposition is derived from update base versus previous graph", async () => {
  const { record: original } = await validRecord();
  assert.equal(original.mergeReceipt.disposition, "merged");

  const relabeled = structuredClone(original);
  relabeled.mergeReceipt.disposition = "rebased";
  relabeled.mergeReceipt.receipt.disposition = "rebased";
  rebindMerge(relabeled);
  assert.throws(
    () => validateModuleExecutionRecord(relabeled),
    /disposition does not match base/u,
  );

  const rebased = structuredClone(original);
  const previousGraph = {
    ...rebased.mergeReceipt.receipt.previousGraph,
    artifactId: "record-graph-concurrent-r1",
    digest: "sha256:" + "9".repeat(64),
    uri: "memory://audit/record-graph-concurrent-r1.json",
  };
  rebased.mergeReceipt.disposition = "rebased";
  rebased.mergeReceipt.receipt.disposition = "rebased";
  rebased.mergeReceipt.receipt.previousGraph = structuredClone(previousGraph);
  rebased.mergeReceipt.snapshot.parentGraph = structuredClone(previousGraph);
  rebindMerge(rebased);
  assert.equal(validateModuleExecutionRecord(rebased), rebased);
});

test("zero-change receipt cannot masquerade as a merged application", async () => {
  const { record: original } = await validRecord();
  const record = structuredClone(original);
  record.mergeReceipt.receipt.changes = {
    nodesAdded: 0,
    nodesReplaced: 0,
    nodesRetired: 0,
    edgesAdded: 0,
    edgesReplaced: 0,
    edgesRetired: 0,
  };
  rebindMerge(record);
  assert.throws(() => validateModuleExecutionRecord(record));
});
