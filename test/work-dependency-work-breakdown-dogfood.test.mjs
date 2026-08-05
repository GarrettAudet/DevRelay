import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateModuleExecutionRecord } from "../src/module-execution-record-validator.mjs";
import { validateTraceabilityGraphSnapshot } from "../src/traceability-artifact-validator.mjs";
import { validateWorkBreakdownArtifact } from "../src/work-breakdown-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const readBytes = (relativePath) => readFile(new URL(relativePath, root));
const readText = (relativePath) => readFile(new URL(relativePath, root), "utf8");
const readJson = async (relativePath) => JSON.parse(await readText(relativePath));
const digest = async (relativePath) =>
  `sha256:${createHash("sha256").update(await readBytes(relativePath)).digest("hex")}`;

test("released WorkBreakdown decompose-change produces and promotes the exact WorkDependencyAnalysis plan", async () => {
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      ["dogfood/work-dependency-analysis/work-breakdown/materialize.mjs"],
      { cwd: rootPath, encoding: "utf8" },
    ),
  );
  assert.equal(output.status, "WORK_BREAKDOWN_PROMOTED");
  assert.equal(output.operation, "decompose-change");
  assert.deepEqual(output.plugin, { id: "openspec-tasks", version: "0.1.0" });
  assert.equal(output.newWorkItems, 11);
  assert.equal(output.retiredPriorWorkItems, 7);
  assert.equal(output.coverage, 48);
  assert.equal(output.graphRevision, 2);
  assert.equal(output.progressionAllowed, true);

  const [
    changeSet,
    baseline,
    approvedPackage,
    invocation,
    result,
    executionRecord,
    graph,
    runtimeProof,
    promotionProof,
    gateReview,
    tasks,
  ] = await Promise.all([
    readJson("dogfood/work-dependency-analysis/work-breakdown/work-breakdown-change-set-draft.json"),
    readJson("dogfood/work-dependency-analysis/work-breakdown/work-breakdown-baseline.json"),
    readJson("dogfood/work-dependency-analysis/work-breakdown/approved-change-package.json"),
    readJson("dogfood/work-dependency-analysis/work-breakdown/work-breakdown.invocation.json"),
    readJson("dogfood/work-dependency-analysis/work-breakdown/work-breakdown.result.json"),
    readJson("dogfood/work-dependency-analysis/work-breakdown/module-execution-record.json"),
    readJson("dogfood/work-dependency-analysis/work-breakdown/traceability-graph-snapshot.json"),
    readJson("dogfood/work-dependency-analysis/work-breakdown/runtime-execution-proof.json"),
    readJson("dogfood/work-dependency-analysis/work-breakdown/work-breakdown-gate-promotion-proof.json"),
    readText("dogfood/work-dependency-analysis/work-breakdown/work-breakdown-gate.md"),
    readText("dogfood/work-dependency-analysis/work-breakdown/tasks.md"),
  ]);

  validateWorkBreakdownArtifact(changeSet);
  validateWorkBreakdownArtifact(baseline);
  validateModuleExecutionRecord(executionRecord);
  validateTraceabilityGraphSnapshot(graph);

  const candidateDigest = await digest(
    "dogfood/work-dependency-analysis/work-breakdown/work-breakdown-change-set-draft.json",
  );
  const baselineDigest = await digest(
    "dogfood/work-dependency-analysis/work-breakdown/work-breakdown-baseline.json",
  );
  assert.equal(output.candidate, candidateDigest);
  assert.equal(output.baseline, baselineDigest);
  assert.equal(
    result.outputs["work-breakdown-change-set-draft"][0].digest,
    candidateDigest,
  );
  assert.equal(baseline.approvedCandidate.digest, candidateDigest);
  assert.equal(promotionProof.candidate.digest, candidateDigest);
  assert.equal(promotionProof.promotedWorkBreakdownBaseline.digest, baselineDigest);

  assert.deepEqual(invocation.module, {
    id: "work-breakdown",
    version: "0.1.0",
    operation: "decompose-change",
  });
  assert.equal(changeSet.operation, "decompose-change");
  assert.equal(
    changeSet.changes.filter(({ operation }) => operation === "retire").length,
    7,
  );
  assert.equal(
    changeSet.changes.filter(({ operation }) => operation === "add").length,
    11,
  );
  assert.equal(
    changeSet.coverageDispositions.filter(
      ({ disposition }) => disposition === "already-satisfied",
    ).length,
    22,
  );
  assert.equal(
    changeSet.coverageDispositions.filter(
      ({ disposition }) => disposition === "planned",
    ).length,
    26,
  );
  assert.equal(baseline.version, "1.1.0");
  assert.equal(baseline.workItems.length, 11);
  assert.ok(baseline.workItems.every(({ id }) => id.startsWith("WI-WDA-")));

  assert.equal(approvedPackage.traceabilityRefs.length, 7);
  assert.equal(
    approvedPackage.currentRepository.revision,
    "9cb4f2b8d340142557027fc0477440722d4f8286",
  );
  assert.equal(approvedPackage.authorizedScope.acceptanceCriteria.length, 26);
  assert.equal(approvedPackage.authorizedScope.architecture.length, 22);
  assert.deepEqual(approvedPackage.authorizedScope.contracts, []);

  assert.equal(runtimeProof.replayAdapterCalls, 0);
  assert.equal(runtimeProof.checkpointVerificationAdapterCalls, 0);
  assert.equal(runtimeProof.previousGraph.digest, graph.parentGraph.digest);
  assert.equal(
    promotionProof.traceabilityMerge.resultingGraph.digest,
    executionRecord.mergeReceipt.snapshotRef.digest,
  );
  assert.equal(promotionProof.workDependencyAnalysisProgressionAllowed, true);

  assert.equal(
    graph.nodes.filter(
      ({ kind, state, stableId }) =>
        kind === "work-item" && state === "active" && stableId.startsWith("WI-WDA-"),
    ).length,
    11,
  );
  assert.equal(
    graph.nodes.filter(
      ({ kind, state, stableId }) =>
        kind === "work-item" && state === "retired" && stableId.startsWith("WI-WB-"),
    ).length,
    7,
  );

  assert.ok(gateReview.includes(candidateDigest));
  assert.ok(gateReview.includes(baseline.currentBaseline?.digest ?? changeSet.currentBaseline.digest));
  assert.ok(gateReview.includes("Status: **pass**"));
  assert.ok(tasks.includes("planning work only"));
  assert.ok(tasks.includes("No item assigns specialists, executes work"));
});
