import assert from "node:assert/strict";
import test from "node:test";

import {
  ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS,
  EnvironmentPreparationArtifactValidationError,
  validateEnvironmentPreparationArtifact,
  withEnvironmentPreparationContentDigest,
} from "../src/environment-preparation-artifact-validator.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const ref = (artifactId, schema = "https://devrelay.dev/artifacts/test/v1", mediaType = "application/json", character = "a") => ({
  artifactId,
  schema,
  mediaType,
  digest: digest(character),
  uri: `memory://devrelay/${artifactId}`,
});
const sourceRefs = [{ role: "requirements-baseline", artifact: ref("requirements", undefined, undefined, "b") }];
const commandFingerprint = digest("c");

const profileSet = withEnvironmentPreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EnvironmentProfileSet",
  profileSetId: "EPS-001",
  version: "1.0.0",
  repository: ref("repository", undefined, undefined, "d"),
  profiles: [
    { id: "PROFILE-HOST", layer: "devrelay-host", name: "Windows Desktop", checks: [{ id: "CHECK-NODE", capability: "runtime/node", required: true, observationKind: "runtime", constraint: ">=22", freshnessSeconds: 60 }] },
    { id: "PROFILE-TARGET", layer: "project-target", name: "DevRelay", checks: [{ id: "CHECK-SECRET", capability: "secret/github", required: false, observationKind: "environment-variable", freshnessSeconds: 0 }] },
  ],
  sourceRefs,
});
const profileSetRef = ref("EPS-001", ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentProfileSet.schema, ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentProfileSet.mediaType, "e");
const inventory = withEnvironmentPreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EnvironmentInventory",
  inventoryId: "EINV-001",
  profileSet: profileSetRef,
  repository: profileSet.repository,
  adapter: { id: "native-windows-inventory", version: "1.0.0", maturity: "release-ready" },
  observations: [
    { checkId: "CHECK-NODE", status: "pass", sensitivity: "public", value: "24.14.1", observedAt: "2026-08-21T12:00:00Z", commandFingerprint, durationMs: 4 },
    { checkId: "CHECK-SECRET", status: "pass", sensitivity: "secret-presence", present: true, observedAt: "2026-08-21T12:00:00Z", commandFingerprint, durationMs: 1 },
  ],
  diagnostics: [],
  fingerprint: digest("f"),
  sourceRefs,
});
const inventoryRef = ref("EINV-001", ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentInventory.schema, ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentInventory.mediaType, "1");
const plan = withEnvironmentPreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EnvironmentRemediationPlan",
  planId: "ERPLAN-001",
  profileSet: profileSetRef,
  inventory: inventoryRef,
  baseFingerprint: inventory.fingerprint,
  effects: [{
    id: "EFFECT-001",
    capability: "configure",
    scope: "project-local",
    description: "Write project-local tool configuration.",
    impact: "Changes only the repository-local cache.",
    grants: [{ kind: "filesystem.write", scope: "C:/repos/DevRelay/.devrelay", purpose: "Create the approved local configuration." }],
    rollback: { supported: true, procedure: "Restore the prior content-addressed file." },
    idempotencyKey: digest("2"),
    requiredEvidence: ["before-fingerprint", "after-fingerprint"],
  }],
  approvalRequired: true,
  diagnostics: [],
  sourceRefs,
});
const planRef = ref("ERPLAN-001", ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentRemediationPlan.schema, ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentRemediationPlan.mediaType, "3");
const effectReceipt = withEnvironmentPreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EnvironmentEffectReceipt",
  receiptId: "ERCP-001",
  plan: planRef,
  effectId: "EFFECT-001",
  adapter: { id: "native-project-config", version: "1.0.0" },
  outcome: "applied",
  beforeFingerprint: digest("4"),
  afterFingerprint: digest("5"),
  checkpointKey: "environment/effect/EFFECT-001",
  replayed: false,
  durationMs: 12,
  grants: plan.effects[0].grants,
  rollbackState: "available",
  evidence: [ref("effect-evidence", undefined, undefined, "6")],
  diagnostics: [],
});
const candidate = withEnvironmentPreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EnvironmentVerificationCandidate",
  candidateId: "EVC-001",
  operation: "prepare-frontier",
  repository: profileSet.repository,
  upstreamBaselines: [ref("work-dependency-baseline", undefined, undefined, "7")],
  profileSet: profileSetRef,
  inventory: inventoryRef,
  effectReceipts: [ref("ERCP-001", ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentEffectReceipt.schema, ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentEffectReceipt.mediaType, "8")],
  frontierId: "FRONTIER-001",
  executionAttemptId: "ATTEMPT-001",
  fingerprint: digest("9"),
  checks: [{ checkId: "CHECK-NODE", required: true, status: "pass", evidence: [inventoryRef] }],
  proposedOutcome: "ready",
  diagnostics: [],
  sourceRefs,
});
const candidateRef = ref("EVC-001", ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentVerificationCandidate.schema, ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentVerificationCandidate.mediaType, "0");
const approval = withEnvironmentPreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EnvironmentGateApproval",
  approvalId: "EGA-001",
  authority: "devrelay-core",
  decision: "ready",
  candidate: candidateRef,
  terminalCheckpointDigest: digest("a"),
  policyVersion: "environment-gate/1.0.0",
});
const approvalRef = ref("EGA-001", ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentGateApproval.schema, ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentGateApproval.mediaType, "b");
const readiness = withEnvironmentPreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EnvironmentReadinessReceipt",
  receiptId: "ERR-001",
  candidate: candidateRef,
  gateApproval: approvalRef,
  repository: profileSet.repository,
  profileSet: profileSetRef,
  frontierId: candidate.frontierId,
  workItemIds: ["WI-EP-ARTIFACT-CONTRACTS"],
  assignmentBaseline: ref("assignment-baseline", undefined, undefined, "c"),
  executionAttemptId: candidate.executionAttemptId,
  fingerprint: candidate.fingerprint,
  issuedAt: "2026-08-21T12:00:00Z",
  expiresAt: "2026-08-21T12:05:00Z",
  singleUse: true,
  consumed: false,
});
const baseline = withEnvironmentPreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EnvironmentBaseline",
  baselineId: "EB-001",
  version: "1.0.0",
  approvedCandidate: candidateRef,
  profileSet: profileSetRef,
  policyVersion: "environment-gate/1.0.0",
  hostFingerprint: candidate.fingerprint,
  targetFingerprints: { devrelay: candidate.fingerprint },
  approvalEvidence: [approvalRef],
  sourceRefs,
});
const promotion = withEnvironmentPreparationContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "EnvironmentGatePromotionProof",
  proofId: "EGP-001",
  status: "promoted",
  candidate: candidateRef,
  approval: approvalRef,
  environmentBaseline: ref("EB-001", ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentBaseline.schema, ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentBaseline.mediaType, "d"),
  readinessReceipt: ref("ERR-001", ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentReadinessReceipt.schema, ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentReadinessReceipt.mediaType, "e"),
  graphCheckpoint: ref("graph-checkpoint", undefined, undefined, "f"),
  checkpointDigest: digest("1"),
});

const fixtures = [profileSet, inventory, plan, effectReceipt, candidate, approval, readiness, baseline, promotion];

test("all canonical EnvironmentPreparation artifact kinds validate", () => {
  for (const fixture of fixtures) validateEnvironmentPreparationArtifact(fixture);
});

test("inventory covers exact profile checks and never exposes secret values", () => {
  validateEnvironmentPreparationArtifact(inventory, { profileSet });
  const leaked = structuredClone(inventory);
  leaked.observations[1].value = "secret";
  assert.throws(
    () => validateEnvironmentPreparationArtifact(withEnvironmentPreparationContentDigest(leaked), { profileSet }),
    EnvironmentPreparationArtifactValidationError,
  );
});

test("ready candidates cannot contain failed or unknown required checks", () => {
  const blocked = structuredClone(candidate);
  blocked.checks[0].status = "unknown";
  assert.throws(
    () => validateEnvironmentPreparationArtifact(withEnvironmentPreparationContentDigest(blocked)),
    /ready candidate contains blocking check/u,
  );
});

test("effect receipts bind exact plan grants and replay cannot claim mutation", () => {
  validateEnvironmentPreparationArtifact(effectReceipt, { plan, planRef });
  const escalated = structuredClone(effectReceipt);
  escalated.grants[0].scope = "C:/";
  assert.throws(
    () => validateEnvironmentPreparationArtifact(withEnvironmentPreparationContentDigest(escalated), { plan, planRef }),
    /grants differ/u,
  );
  const replayed = structuredClone(effectReceipt);
  replayed.replayed = true;
  assert.throws(
    () => validateEnvironmentPreparationArtifact(withEnvironmentPreparationContentDigest(replayed)),
    /replayed effect receipt claims a new mutation/u,
  );
});

test("Gate approval and readiness bind the exact ready candidate", () => {
  validateEnvironmentPreparationArtifact(approval, { candidate, candidateRef });
  validateEnvironmentPreparationArtifact(readiness, { candidate, candidateRef, approval, approvalRef });
  const substituted = structuredClone(readiness);
  substituted.executionAttemptId = "ATTEMPT-OTHER";
  assert.throws(
    () => validateEnvironmentPreparationArtifact(withEnvironmentPreparationContentDigest(substituted), { candidate, candidateRef, approval, approvalRef }),
    /executionAttemptId differs/u,
  );
});

test("ArtifactRef contract identity and canonical content digests fail closed", () => {
  const contract = ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS.EnvironmentProfileSet;
  validateEnvironmentPreparationArtifact(profileSet, {
    ref: { ...profileSetRef, digest: digest("f") },
  });
  assert.throws(
    () => validateEnvironmentPreparationArtifact(profileSet, { ref: { ...profileSetRef, schema: "https://example.com/wrong" } }),
    /published contract/u,
  );
  assert.throws(
    () => validateEnvironmentPreparationArtifact({ ...profileSet, version: "2.0.0" }),
    /contentDigest/u,
  );
  assert.equal(contract.schema, profileSetRef.schema);
});
