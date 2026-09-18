import assert from "node:assert/strict";
import test from "node:test";
import { prepareLocalArchitectureGate, verifyLocalArchitectureGate } from "../src/local-architecture-gate.mjs";

test("local architecture Gate rejects fabricated Core authority before reading decision bytes", async () => {
  let loads = 0;
  const request = { checkpointReplay: { moduleResult: { outcome: "baseline_drafted" } }, loadArtifact: () => { loads++; } };
  await assert.rejects(prepareLocalArchitectureGate(request), /receipt|checkpoint/i);
  await assert.rejects(verifyLocalArchitectureGate({ ...request, record: {} }), /contract/);
  assert.equal(loads, 0);
});
