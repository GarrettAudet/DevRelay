import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileArtifactSchema, compileEmbeddedSchema, documentValidators, validationDetail } from "../src/schema-validation.mjs";
import { createCrossCuttingCompositionPlan } from "../src/cross-cutting-composition.mjs";
import { createQualityPolicyCandidate, createQualityPolicyContext, promoteQualityPolicyBaseline, resolveQualityObligations } from "../src/quality-policy.mjs";
import { createWorkContinuityIndex, createWorkFingerprintInput, deriveWorkFingerprint, findExactWorkReuse } from "../src/work-continuity.mjs";
import { createProjectControlSnapshot, createProjectControlSourceBundle, assessProjectProductivity } from "../src/project-control.mjs";
import { resolveWorkflowProfile } from "../src/workflow-profiles.mjs";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { validateQualityContinuityArtifact } from "../src/quality-continuity-artifact-validator.mjs";

const root = new URL("../", import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const digest = (value) => canonicalJsonDigest({ value });

test("all QC-001 schemas compile and all three independently versioned Modules validate", async () => {
  for (const path of ["contracts/cross-cutting-module-binding.schema.json", "contracts/quality-policy-artifacts.schema.json", "contracts/work-continuity-artifacts.schema.json", "contracts/project-control-artifacts.schema.json"]) compileEmbeddedSchema(await json(path));
  for (const path of ["examples/modules/quality-policy.module.json", "examples/modules/work-continuity.module.json", "examples/modules/project-control.module.json"]) {
    const module = await json(path);
    assert.equal(documentValidators.moduleDefinition(module), true, validationDetail(documentValidators.moduleDefinition));
    assert.equal(module.metadata.version, "0.1.0");
  }
  assert.equal(validateQualityContinuityArtifact(await json("project/quality-policy-baseline.json")).kind, "QualityPolicyBaseline");
});

test("runtime outputs conform to their published artifact schemas", async () => {
  const compositionValidator = compileArtifactSchema(await json("contracts/cross-cutting-module-binding.schema.json"));
  const qualityValidator = compileArtifactSchema(await json("contracts/quality-policy-artifacts.schema.json"));
  const continuityValidator = compileArtifactSchema(await json("contracts/work-continuity-artifacts.schema.json"));
  const controlValidator = compileArtifactSchema(await json("contracts/project-control-artifacts.schema.json"));
  const qualityModule = await json("examples/modules/quality-policy.module.json");
  const qualityOperation = qualityModule.operations.find(({ id }) => id === "resolve-obligations");
  const plan = createCrossCuttingCompositionPlan({
    availablePorts: qualityOperation.inputs.map(({ name }) => name),
    moduleDefinitions: [qualityModule],
    bindings: [{ id: "quality", boundary: "before-task-dispatch", moduleId: "quality-policy", moduleVersion: "0.1.0", operationId: "resolve-obligations", inputPorts: qualityOperation.inputs.map(({ name }) => name), outputPorts: qualityOperation.outputs.map(({ name }) => name), dependsOn: [], configurationDigest: digest("quality-config"), grantDigest: digest("no-grants"), failureBehavior: "stop" }],
  });
  assert.equal(compositionValidator(plan), true, JSON.stringify(compositionValidator.errors));
  assert.equal(validateQualityContinuityArtifact(plan), plan);
  const candidate = createQualityPolicyCandidate({ policyId: "QP", version: "1.0.0", rules: [{ id: "R", obligations: [{ id: "O", lane: "test", evidenceKinds: ["test/pass"] }] }] });
  assert.equal(qualityValidator(candidate), true, JSON.stringify(qualityValidator.errors));
  const baseline = promoteQualityPolicyBaseline({ candidate, approval: { kind: "QualityPolicyGateApproval", authority: "QualityPolicyGate", decision: "approve", candidateDigest: candidate.candidateDigest } });
  assert.equal(qualityValidator(baseline), true, JSON.stringify(qualityValidator.errors));
  const qualityContext = createQualityPolicyContext();
  assert.equal(qualityValidator(qualityContext), true, JSON.stringify(qualityValidator.errors));
  const resolution = resolveQualityObligations({ baseline, workflowProfile: resolveWorkflowProfile(), context: qualityContext, workItem: { id: "WI-1", type: "code-change" } });
  assert.equal(qualityValidator(resolution), true, JSON.stringify(qualityValidator.errors));
  const index = createWorkContinuityIndex();
  assert.equal(continuityValidator(index), true, JSON.stringify(continuityValidator.errors));
  const fingerprintInput = createWorkFingerprintInput({ projectId: "devrelay", requirementsBaselineDigest: digest("r"), projectOverviewBaselineDigest: digest("o"), workItem: { id: "WI-1" }, targetRevision: "abc", assignment: { id: "A" }, qualityResolutionDigest: resolution.resolutionDigest, implementationConfigurationDigest: digest("c") });
  assert.equal(continuityValidator(fingerprintInput), true, JSON.stringify(continuityValidator.errors));
  const fingerprint = deriveWorkFingerprint(fingerprintInput);
  assert.equal(continuityValidator(fingerprint), true, JSON.stringify(continuityValidator.errors));
  assert.equal(continuityValidator(findExactWorkReuse({ index, workFingerprint: fingerprint, targetRevision: "abc", qualityResolutionDigest: resolution.resolutionDigest })), true, JSON.stringify(continuityValidator.errors));
  const sourceBundle = createProjectControlSourceBundle({ projectId: "devrelay", lifecycle: { phase: "verification" } });
  assert.equal(controlValidator(sourceBundle), true, JSON.stringify(controlValidator.errors));
  const snapshot = createProjectControlSnapshot(sourceBundle);
  assert.equal(controlValidator(snapshot), true, JSON.stringify(controlValidator.errors));
  assert.equal(controlValidator(assessProjectProductivity({ snapshot })), true, JSON.stringify(controlValidator.errors));
});
