import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/content-digest.mjs";
import { validateModuleExecutionRecord } from "../src/module-execution-record-validator.mjs";
import {
  validateTraceabilityGraphSnapshot,
  validateTraceabilityUpdate,
} from "../src/traceability-artifact-validator.mjs";
import { validateWorkBreakdownArtifact } from "../src/work-breakdown-artifact-validator.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dogfoodDir = path.join(
  root,
  "dogfood",
  "work-breakdown",
  "work-breakdown",
);
const materializer = path.join(dogfoodDir, "materialize.mjs");
const generatedFiles = [
  "approved-not-applicable.json",
  "baseline-drift-execution-proof.json",
  "baseline-drift.invocation.json",
  "baseline-drift.result.json",
  "capability-catalog.json",
  "contract-disposition.json",
  "contract-not-applicable-approval.md",
  "module-execution-record.json",
  "module-route-decision-drift.json",
  "module-route-decision.json",
  "project-work-breakdown-state-drift.json",
  "project-work-breakdown-state.json",
  "runtime-execution-proof.json",
  "traceability-graph-snapshot.json",
  "traceability-update.json",
  "work-breakdown-baseline.json",
  "work-breakdown-dogfood-proof.json",
  "work-breakdown-draft.json",
  "work-breakdown-gate.md",
  "work-breakdown-gate-promotion-proof.json",
  "work-breakdown.invocation.json",
  "work-breakdown.result.json",
];

function read(name) {
  return readFileSync(path.join(dogfoodDir, name));
}

function load(name) {
  return JSON.parse(read(name));
}

function digests() {
  return Object.fromEntries(
    generatedFiles.map((name) => [name, sha256Digest(read(name))]),
  );
}

test("WorkBreakdown dogfood is deterministic, traceable, gated, and planning-only", () => {
  const before = digests();
  const stdout = execFileSync(process.execPath, [materializer], {
    cwd: root,
    encoding: "utf8",
  });
  assert.match(stdout, /"status": "PASS"/u);
  assert.deepEqual(digests(), before, "checked-in dogfood artifacts are stale");

  const proof = load("work-breakdown-dogfood-proof.json");
  const draft = load("work-breakdown-draft.json");
  const baseline = load("work-breakdown-baseline.json");
  const result = load("work-breakdown.result.json");
  const runtime = load("runtime-execution-proof.json");
  const gatePromotion = load("work-breakdown-gate-promotion-proof.json");
  const drift = load("baseline-drift-execution-proof.json");
  const record = load("module-execution-record.json");
  const update = load("traceability-update.json");
  const snapshot = load("traceability-graph-snapshot.json");

  assert.equal(proof.status, "pass");
  assert.equal(proof.operation, "establish-breakdown");
  assert.deepEqual(proof.plugin, {
    id: "openspec-tasks",
    version: "0.1.0",
  });
  assert.equal(proof.adapterExecution.liveCliInvoked, false);
  assert.equal(result.outcome, "decomposed");
  assert.equal(runtime.adapterCalls, 1);
  assert.equal(runtime.replayAdapterCalls, 0);
  assert.equal(runtime.checkpointVerificationAdapterCalls, 0);
  assert.equal(gatePromotion.status, "pass");
  assert.equal(gatePromotion.checkpointReplay.adapterCalls, 0);
  assert.equal(
    gatePromotion.commitPayload.bytesDigest,
    proof.outputs.workBreakdownBaseline.digest,
  );
  assert.equal(drift.outcome, "baseline_drift");
  assert.equal(drift.adapterCalls, 0);
  assert.equal(drift.replayAdapterCalls, 0);

  validateWorkBreakdownArtifact(draft, {
    ref: proof.outputs.workBreakdownDraft,
  });
  validateWorkBreakdownArtifact(baseline, {
    ref: proof.outputs.workBreakdownBaseline,
  });
  validateModuleExecutionRecord(record);
  validateTraceabilityUpdate(update);
  validateTraceabilityGraphSnapshot(snapshot);
  assert.equal(record.recordDigest, runtime.mergeProof.executionRecordDigest);
  assert.equal(record.mergeReceipt.snapshot.revision, 1);
  assert.equal(record.traceabilityUpdateRef.digest, runtime.mergeProof.traceabilityUpdateDigest);
  assert.equal(
    sha256Digest(read("module-execution-record.json")),
    proof.outputs.moduleExecutionRecord.digest,
  );

  const exactWorkItemKeys = [
    "id",
    "objective",
    "bounded-scope",
    "deliverables",
    "work-type",
    "acceptance-criterion-refs",
    "architecture-refs",
    "contract-refs",
    "required-capabilities",
    "dependency-hints",
    "verification-plan",
    "required-evidence",
    "source-refs",
  ].sort();
  for (const item of draft.workItems) {
    assert.deepEqual(Object.keys(item).sort(), exactWorkItemKeys);
  }
  assert.equal(draft.workItems.length, 7);
  assert.equal(
    draft.coverageDispositions.filter(
      ({ scopeKind }) => scopeKind === "acceptance-criterion",
    ).length,
    10,
  );
  assert.equal(
    draft.coverageDispositions.filter(
      ({ scopeKind }) => scopeKind === "architecture",
    ).length,
    12,
  );
  assert.equal(
    draft.coverageDispositions.every(
      ({ disposition }) => disposition === "planned",
    ),
    true,
  );

  const candidateEdges = snapshot.edges.filter(
    ({ scope, authority }) =>
      scope === "work-breakdown/candidate" && authority === "candidate",
  );
  assert.equal(candidateEdges.length, 37);
  assert.deepEqual(
    new Set(candidateEdges.map(({ kind }) => kind)),
    new Set(["planned-by", "implementation-planned-by"]),
  );
  const nodes = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
  assert.equal(
    candidateEdges.every(
      (edge) =>
        nodes.get(edge.sourceNodeId)?.kind !== "work-item" &&
        nodes.get(edge.targetNodeId)?.kind === "work-item",
    ),
    true,
  );
  assert.equal(proof.assertions.objectiveToWorkItemPathCount > 0, true);

  const nativeTasks = read("tasks.md").toString("utf8");
  assert.match(nativeTasks, /bounded, deterministic fixture/u);
  assert.doesNotMatch(nativeTasks, /\/opsx:apply|\/speckit\.implement/u);
  assert.match(
    read("work-breakdown-gate.md").toString("utf8"),
    /Status: \*\*pass\*\*/u,
  );
});
