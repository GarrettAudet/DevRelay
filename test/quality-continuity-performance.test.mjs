import assert from "node:assert/strict";
import test from "node:test";

import { runQualityContinuityBenchmark } from "../scripts/quality-continuity-benchmark.mjs";

test("QC-001 cross-cutting preflight and reconciliation remain within the approved Windows p95 budget", () => {
  const evidence = runQualityContinuityBenchmark();
  assert.deepEqual(evidence.scale, { bindingCount: 100, workItemCount: 1000, attemptCount: 10000 });
  assert.equal(evidence.samples, 10);
  assert.equal(evidence.outcome, "pass", `p95 ${evidence.p95Milliseconds.toFixed(3)} ms exceeded 500 ms`);
  assert.equal(evidence.universalPerformanceClaim, false);
  assert.match(evidence.evidenceDigest, /^sha256:[0-9a-f]{64}$/u);
});
