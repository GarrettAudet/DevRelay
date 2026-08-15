import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkflowProfileError,
  createWorkflowProfileCatalog,
  resolveWorkflowProfile,
  verifyResolvedWorkflowProfile,
} from "../src/workflow-profiles.mjs";

const names = ["quick", "standard", "assurance", "inspect"];

test("standard is the deterministic default and resolved policy is deeply immutable", () => {
  const left = resolveWorkflowProfile();
  const right = resolveWorkflowProfile();
  assert.equal(left.profileName, "standard");
  assert.deepEqual(left, right);
  assert.equal(left.policyDigest, right.policyDigest);
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.closurePolicy), true);
  assert.equal(Object.isFrozen(left.authorityPolicy.requiredGates), true);
  assert.equal(verifyResolvedWorkflowProfile(left), true);
});

test("all four profiles retain closure, Core authority, and every required Gate", () => {
  for (const profileName of names) {
    const policy = resolveWorkflowProfile({
      profileName,
      projectRiskContext: { level: "moderate", sourceRefs: ["RISK-1"] },
    });
    assert.equal(policy.closurePolicy.minimumWeightedCoverage, 0.99);
    assert.equal(policy.closurePolicy.maximumBlockingUnknowns, 0);
    assert.equal(policy.closurePolicy.maximumContradictions, 0);
    assert.equal(policy.authorityPolicy.coreOwnsRouting, true);
    assert.equal(policy.authorityPolicy.coreOwnsValidation, true);
    assert.equal(policy.authorityPolicy.coreOwnsProgression, true);
    assert.equal(policy.authorityPolicy.gateBypassAllowed, false);
    assert.deepEqual(policy.authorityPolicy.requiredGates, [
      "RequirementsGate",
      "ArchitectureGate",
      "ContractGate",
      "WorkBreakdownGate",
      "WorkDependencyGate",
      "SpecialistAssignmentGate",
      "WorkItemVerificationGate",
      "BusinessAcceptanceGate",
    ]);
  }
});

test("quick records expensive lanes as obligations while assurance defers nothing", () => {
  const quick = resolveWorkflowProfile({ profileName: "quick" });
  assert.deepEqual(
    quick.verificationPolicy.deferredObligations.map(({ lane }) => lane),
    ["full-regression", "performance", "release", "security"],
  );
  assert.ok(
    quick.verificationPolicy.deferredObligations.every(
      ({ disposition }) => disposition === "required-before-final-acceptance",
    ),
  );
  const assurance = resolveWorkflowProfile({ profileName: "assurance" });
  assert.deepEqual(assurance.verificationPolicy.deferredObligations, []);
});

test("inspect is read-only and cannot acquire lifecycle mutation authority", () => {
  const inspect = resolveWorkflowProfile({ profileName: "inspect" });
  assert.equal(inspect.executionPolicy.mode, "read-only");
  assert.equal(inspect.executionPolicy.lifecycleMutationAllowed, false);
  assert.equal(inspect.authorityPolicy.gateBypassAllowed, false);
});

test("unknown profiles, overrides, catalog drift, and malformed risk fail closed", () => {
  assert.throws(
    () => resolveWorkflowProfile({ profileName: "fastest" }),
    (error) => error instanceof WorkflowProfileError && error.code === "DR4906",
  );
  assert.throws(
    () => resolveWorkflowProfile({ requestedOverrides: { gateBypassAllowed: true } }),
    (error) => error instanceof WorkflowProfileError && error.code === "DR4905",
  );
  const catalog = structuredClone(createWorkflowProfileCatalog());
  catalog.profiles.quick.deferredVerificationLanes = [];
  assert.throws(
    () => resolveWorkflowProfile({ catalog }),
    (error) => error instanceof WorkflowProfileError && error.code === "DR4902",
  );
  assert.throws(
    () => resolveWorkflowProfile({ projectRiskContext: { level: "unknown", sourceRefs: [] } }),
    (error) => error instanceof WorkflowProfileError && error.code === "DR4904",
  );
});

test("verification detects substituted or drifted policy bytes", () => {
  const policy = structuredClone(resolveWorkflowProfile({ profileName: "standard" }));
  policy.authorityPolicy.gateBypassAllowed = true;
  assert.throws(
    () => verifyResolvedWorkflowProfile(policy),
    (error) => error instanceof WorkflowProfileError && error.code === "DR4908",
  );
});
