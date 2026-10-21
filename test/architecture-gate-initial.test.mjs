import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateArchitectureGatePromotion } from "../src/architecture-gate.mjs";
import { validateWorkBreakdownGatePromotion } from "../src/work-breakdown-gate.mjs";
import { createCodingPreflight } from "../examples/modular/coding-preflight.mjs";
import { createGovernedCodingFixture } from "./governed-coding-fixture.mjs";

// Mechanically genuine Core/Gate evidence; synthetic approvals are not owner acceptance.
const fixture = await createGovernedCodingFixture();
const request = fixture.governance.architecture;

test("ArchitectureGate accepts the published initial baseline_drafted outcome from genuine Core replay", async () => {
  const module = JSON.parse(await readFile(new URL("../examples/modules/architecture-design.module.json", import.meta.url)));
  const operation = module.operations.find(({ id }) => id === "establish-baseline");
  assert.ok(operation.outcomes.includes("baseline_drafted"));
  assert.equal(request.checkpointReplay.moduleResult.outcome, "baseline_drafted");
  const promotion = await validateArchitectureGatePromotion(request);
  assert.equal(promotion.operation, "establish-baseline");
  assert.deepEqual(promotion.baselineRef, request.baselineRef);
  assert.equal(promotion.commitPayload.baseline.bytesBase64, request.baselineBytes.toString("base64"));
  assert.equal(Object.isFrozen(promotion), true);
});

test("ArchitectureGate rejects a cloned initial replay receipt", async () => {
  await assert.rejects(validateArchitectureGatePromotion({ ...request,
    checkpointReplay: structuredClone(request.checkpointReplay),
  }), /in-process verified checkpoint replay receipt/);
});

test("ArchitectureGate rejects fabricated initial approval instead of treating a boolean as authority", async () => {
  await assert.rejects(validateArchitectureGatePromotion({ ...request,
    checkpointReplay: { approved: true, invocation: request.checkpointReplay.invocation,
      moduleResult: request.checkpointReplay.moduleResult },
  }), /in-process verified checkpoint replay receipt/);
});

test("ArchitectureGate rejects a genuine Requirements Core receipt from the wrong module", async () => {
  await assert.rejects(validateArchitectureGatePromotion({ ...request,
    checkpointReplay: fixture.governance.requirements.checkpointReplay,
  }), /completed promotable ArchitectureDesign/);
});

test("governed coding reports unsupported repository N/A despite genuine Gate-valid prerequisites", async () => {
  const { governance } = await createGovernedCodingFixture(undefined, { repositoryNotApplicable: true });
  const promotion = await validateWorkBreakdownGatePromotion(governance.workBreakdown);
  const repository = promotion.baseline.inputBindings.find(({ role }) => role === "repository-context").artifact;
  assert.equal(repository.schema, "https://devrelay.dev/artifacts/approved-not-applicable/v1");
  await assert.rejects(createCodingPreflight(governance), /existing-repository.*greenfield or not-applicable/);
});
