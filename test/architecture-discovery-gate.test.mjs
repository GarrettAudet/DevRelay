import assert from "node:assert/strict";
import test from "node:test";
import { prepareArchitectureDiscoveryGate } from "../src/architecture-discovery-gate.mjs";

test("discovery Gate rejects caller-authored Core receipts before loading approval bytes", async () => {
  let loads = 0;
  const plausible = {
    invocation: { module: { id: "architecture-discovery", version: "0.1.1", operation: "discover" } },
    moduleResult: { status: "completed", outcome: "discovered", diagnostics: [], evidence: [] },
    loadedInputs: {}, loadedOutputs: {},
  };
  for (const checkpointReplay of [undefined, {}, plausible, structuredClone(plausible), Object.freeze(plausible)]) {
    await assert.rejects(prepareArchitectureDiscoveryGate({ checkpointReplay, loadArtifact: () => { loads++; } }), /receipt|checkpoint/i);
  }
  assert.equal(loads, 0);
});
