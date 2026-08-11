import assert from "node:assert/strict";
import test from "node:test";
import { releaseGatePlan } from "../scripts/verify-chatgpt-desktop-release.mjs";

test("Desktop release gate uses the complete independent suite and durable evidence path", () => {
  const plan = releaseGatePlan();
  assert.equal(plan.focusedSuites.length, 9);
  for (const required of ["install", "mcp-server", "app-server-client", "run-store", "task-supervisor"]) {
    assert.ok(plan.focusedSuites.some((entry) => entry.includes(required)), `missing ${required} coverage`);
  }
  assert.match(plan.evidencePath, /release[\\/]chatgpt-desktop[\\/]release-gate-evidence\.attempt-003\.json$/u);
});
