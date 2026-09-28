import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCodingResult } from "../examples/modular/coding-summary.mjs";
function result(overrides = {}) {
  return {result:{outcome:"verified"}, replayed:false, currentWorkspaceMatches:true,
    report:{requestId:"change-1", goal:"Greeting", changes:[{path:"greet.mjs"}],
      verification:{exitCode:0}}, ...overrides};
}
test("coding summary reports changed paths and actual current test success", () => {
  assert.deepEqual(summarizeCodingResult(result()), {requestId:"change-1", goal:"Greeting",
    outcome:"verified", changedPaths:["greet.mjs"], testExitCode:0,
    testsPassed:true, replayed:false, currentWorkspaceMatches:true});
});
test("coding summary never turns failed or stale evidence into current success", () => {
  assert.equal(summarizeCodingResult(result({currentWorkspaceMatches:false,replayed:true})).testsPassed, false);
  const failure = result(); failure.result.outcome="tests_failed"; failure.report.verification.exitCode=1;
  assert.equal(summarizeCodingResult(failure).testsPassed, false);
});
test("coding summary retains replay labeling and tolerates a missing report", () => {
  assert.equal(summarizeCodingResult(result({replayed:true})).replayed, true);
  const summary = summarizeCodingResult({result:{outcome:"blocked"},replayed:false,currentWorkspaceMatches:false});
  assert.equal(summary.testsPassed, false);
  assert.equal(summary.testExitCode, null);
  assert.deepEqual(summary.changedPaths, []);
});
