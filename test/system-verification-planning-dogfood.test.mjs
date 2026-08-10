import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url)));

test("SystemVerification planning preserves every upstream lifecycle and authority boundary", async () => {
  const plan = await readJson("../dogfood/system-verification/planning/system-verification-dogfood-plan.json");
  const assignment = await readJson("../dogfood/system-verification/planning/specialist-assignment-baseline.json");
  const dependency = await readJson("../dogfood/system-verification/planning/work-dependency-baseline.json");
  const breakdown = await readJson("../dogfood/system-verification/planning/work-breakdown-baseline.json");
  const task = await readJson("../dogfood/system-verification/execution/task-contracts/WI-SV-RELEASE.attempt-002.task.json");

  assert.equal(plan.requirementsGate.outcome, "approved");
  assert.equal(plan.architectureDesign.outcome, "approved");
  assert.equal(plan.contractGeneration.outcome, "approved");
  assert.equal(plan.workBreakdown.outcome, "approved");
  assert.equal(plan.workDependencyAnalysis.outcome, "approved");
  assert.equal(plan.specialistAssignment.outcome, "approved");
  assert.equal(plan.workDependencyAnalysis.cycleCount, 0);
  assert.equal(breakdown.workItems.length, 6);
  assert.equal(dependency.nodes.length, 6);
  assert.equal(assignment.assignments.length, 6);
  assert.deepEqual(task.dependencies, ["WI-SV-CORE", "WI-SV-ADAPTERS", "WI-SV-TRACEABILITY", "WI-SV-DOCUMENTATION"]);
  assert.ok(task.authority.forbidden.includes("BusinessAcceptance"));
  assert.ok(task.authority.forbidden.includes("deployment"));
  assert.ok(plan.decisions.some(({ id, statement }) => id === "D-SV-BOUNDARY-001" && /grant business acceptance/.test(statement)));
});
