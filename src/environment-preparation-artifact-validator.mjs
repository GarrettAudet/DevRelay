import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const CONTRACT_URI =
  "https://devrelay.dev/contracts/environment-preparation-artifacts.schema.json";
const validator = compileArtifactSchema(
  JSON.parse(
    readFileSync(
      new URL("../contracts/environment-preparation-artifacts.schema.json", import.meta.url),
      "utf8",
    ),
  ),
);

export const ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS = Object.freeze({
  EnvironmentProfileSet: Object.freeze({
    schema: "https://devrelay.dev/artifacts/environment-profile-set/v1",
    mediaType: "application/vnd.devrelay.environment-profile-set+json",
  }),
  EnvironmentInventory: Object.freeze({
    schema: "https://devrelay.dev/artifacts/environment-inventory/v1",
    mediaType: "application/vnd.devrelay.environment-inventory+json",
  }),
  EnvironmentRemediationPlan: Object.freeze({
    schema: "https://devrelay.dev/artifacts/environment-remediation-plan/v1",
    mediaType: "application/vnd.devrelay.environment-remediation-plan+json",
  }),
  EnvironmentEffectReceipt: Object.freeze({
    schema: "https://devrelay.dev/evidence/environment-effect-receipt/v1",
    mediaType: "application/vnd.devrelay.environment-effect-receipt+json",
  }),
  EnvironmentVerificationCandidate: Object.freeze({
    schema: "https://devrelay.dev/artifacts/environment-verification-candidate/v1",
    mediaType: "application/vnd.devrelay.environment-verification-candidate+json",
  }),
  EnvironmentReadinessReceipt: Object.freeze({
    schema: "https://devrelay.dev/evidence/environment-readiness-receipt/v1",
    mediaType: "application/vnd.devrelay.environment-readiness-receipt+json",
  }),
  EnvironmentBaseline: Object.freeze({
    schema: "https://devrelay.dev/artifacts/environment-baseline/v1",
    mediaType: "application/vnd.devrelay.environment-baseline+json",
  }),
  EnvironmentGateApproval: Object.freeze({
    schema: "https://devrelay.dev/evidence/environment-gate-approval/v1",
    mediaType: "application/vnd.devrelay.environment-gate-approval+json",
  }),
  EnvironmentGatePromotionProof: Object.freeze({
    schema: "https://devrelay.dev/evidence/environment-gate-promotion/v1",
    mediaType: "application/vnd.devrelay.environment-gate-promotion+json",
  }),
});

const stableId = (value) =>
  ({
    EnvironmentProfileSet: value.profileSetId,
    EnvironmentInventory: value.inventoryId,
    EnvironmentRemediationPlan: value.planId,
    EnvironmentEffectReceipt: value.receiptId,
    EnvironmentVerificationCandidate: value.candidateId,
    EnvironmentReadinessReceipt: value.receiptId,
    EnvironmentBaseline: value.baselineId,
    EnvironmentGateApproval: value.approvalId,
    EnvironmentGatePromotionProof: value.proofId,
  })[value.kind];

export class EnvironmentPreparationArtifactValidationError extends Error {
  constructor(message) {
    super(`environment preparation artifact is invalid: ${message}`);
    this.name = "EnvironmentPreparationArtifactValidationError";
    this.code = "DR5400";
  }
}

const fail = (message) => {
  throw new EnvironmentPreparationArtifactValidationError(message);
};

function unique(values, key, label) {
  const seen = new Set();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) fail(`${label} repeats ${identity}`);
    seen.add(identity);
  }
}

function sameRef(left, right) {
  return (
    left?.artifactId === right?.artifactId &&
    left?.schema === right?.schema &&
    left?.mediaType === right?.mediaType &&
    left?.digest === right?.digest
  );
}

function verifyContentDigest(value) {
  const { contentDigest, ...material } = value;
  if (contentDigest !== canonicalJsonDigest(material)) {
    fail(`${value.kind} contentDigest does not bind canonical content`);
  }
}

function validateProfileSet(value) {
  unique(value.profiles, ({ id }) => id, "environment profiles");
  const layers = new Set(value.profiles.map(({ layer }) => layer));
  if (!layers.has("devrelay-host") || !layers.has("project-target")) {
    fail("profile set requires both devrelay-host and project-target layers");
  }
  for (const profile of value.profiles) {
    unique(profile.checks, ({ id }) => id, `profile ${profile.id} checks`);
  }
}

function validateInventory(value, context) {
  unique(value.observations, ({ checkId }) => checkId, "inventory observations");
  for (const observation of value.observations) {
    if (observation.sensitivity === "secret-presence") {
      if (Object.hasOwn(observation, "value") || typeof observation.present !== "boolean") {
        fail(`secret-presence observation ${observation.checkId} must expose presence only`);
      }
    } else if (Object.hasOwn(observation, "present")) {
      fail(`public observation ${observation.checkId} cannot expose secret presence metadata`);
    }
    if (observation.status === "unknown" && !value.diagnostics.some(({ checkId }) => checkId === observation.checkId)) {
      fail(`unknown observation ${observation.checkId} lacks a diagnostic`);
    }
  }
  if (context.profileSet) {
    const expected = new Set(
      context.profileSet.profiles.flatMap(({ checks }) => checks.map(({ id }) => id)),
    );
    const actual = new Set(value.observations.map(({ checkId }) => checkId));
    if (expected.size !== actual.size || [...expected].some((id) => !actual.has(id))) {
      fail("inventory does not cover every profile check exactly once");
    }
  }
}

function validateRemediationPlan(value) {
  unique(value.effects, ({ id }) => id, "remediation effects");
  if (value.effects.length > 0 && !value.approvalRequired) {
    fail("a non-empty remediation plan requires approval");
  }
  for (const effect of value.effects) {
    if (effect.scope === "machine-global" && !effect.grants.some(({ kind }) => kind === "filesystem.write" || kind === "process.spawn")) {
      fail(`machine-global effect ${effect.id} lacks an exact mutation grant`);
    }
    if (!effect.rollback.supported && effect.scope === "machine-global") {
      fail(`machine-global effect ${effect.id} lacks supported rollback`);
    }
    unique(effect.grants, ({ kind, scope }) => `${kind}\u0000${scope}`, `effect ${effect.id} grants`);
  }
}

function validateEffectReceipt(value, context) {
  if (value.outcome === "failed" && value.diagnostics.length === 0) {
    fail("failed effect receipt lacks diagnostics");
  }
  if (value.replayed && value.beforeFingerprint !== value.afterFingerprint && value.outcome !== "no-change") {
    fail("replayed effect receipt claims a new mutation");
  }
  if (value.outcome === "rolled-back" && value.rollbackState !== "completed") {
    fail("rolled-back effect lacks completed rollback state");
  }
  if (context.plan) {
    if (!sameRef(value.plan, context.planRef)) fail("effect receipt does not bind the exact remediation plan");
    const effect = context.plan.effects.find(({ id }) => id === value.effectId);
    if (!effect) fail(`effect receipt references unknown effect ${value.effectId}`);
    const expected = [...effect.grants].sort((a, b) => `${a.kind}:${a.scope}`.localeCompare(`${b.kind}:${b.scope}`));
    const actual = [...value.grants].sort((a, b) => `${a.kind}:${a.scope}`.localeCompare(`${b.kind}:${b.scope}`));
    if (JSON.stringify(expected) !== JSON.stringify(actual)) fail("effect receipt grants differ from the approved plan");
  }
}

function validateCandidate(value) {
  unique(value.upstreamBaselines, ({ artifactId }) => artifactId, "candidate upstream baselines");
  unique(value.effectReceipts, ({ artifactId }) => artifactId, "candidate effect receipts");
  unique(value.checks, ({ checkId }) => checkId, "candidate checks");
  const blocking = value.checks.filter(({ required, status }) => required && !["pass", "not-applicable"].includes(status));
  if (value.proposedOutcome === "ready" && blocking.length > 0) {
    fail(`ready candidate contains blocking check ${blocking[0].checkId}`);
  }
  if (value.proposedOutcome !== "ready" && value.diagnostics.length === 0) {
    fail(`${value.proposedOutcome} candidate lacks diagnostics`);
  }
  if (value.checks.some(({ status }) => status === "warning") && value.checks.some(({ required, status }) => required && status === "warning")) {
    fail("required checks cannot be downgraded to warnings");
  }
}

function validateReadiness(value, context) {
  unique(value.workItemIds, (id) => id, "readiness work items");
  if (value.expiresAt <= value.issuedAt) fail("readiness receipt expiry must follow issue time");
  if (context.candidate) {
    if (!sameRef(value.candidate, context.candidateRef)) fail("readiness receipt does not bind the exact candidate");
    if (context.candidate.proposedOutcome !== "ready") fail("readiness receipt derives from a non-ready candidate");
    for (const field of ["frontierId", "executionAttemptId", "fingerprint"]) {
      if (value[field] !== context.candidate[field]) fail(`readiness receipt ${field} differs from its candidate`);
    }
  }
  if (context.approval) {
    if (!sameRef(value.gateApproval, context.approvalRef)) fail("readiness receipt does not bind exact Gate approval");
    if (context.approval.decision !== "ready") fail("readiness receipt derives from a non-ready Gate decision");
  }
}

function validateApproval(value, context) {
  if (!context.candidate) return;
  if (!sameRef(value.candidate, context.candidateRef)) fail("Gate approval does not bind the exact candidate");
  if (value.decision !== context.candidate.proposedOutcome) fail("Gate decision differs from the candidate outcome");
}

export function withEnvironmentPreparationContentDigest(value) {
  const { contentDigest: _contentDigest, ...material } = value;
  return Object.freeze({ ...material, contentDigest: canonicalJsonDigest(material) });
}

export function validateEnvironmentPreparationArtifact(value, context = {}) {
  if (!validator(value)) fail(`${validationDetail(validator)} (${CONTRACT_URI})`);
  const contract = ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS[value.kind];
  if (!contract) fail(`unsupported kind ${value.kind}`);
  if (context.ref) {
    if (
      context.ref.artifactId !== stableId(value) ||
      context.ref.schema !== contract.schema ||
      context.ref.mediaType !== contract.mediaType
    ) {
      fail(`${value.kind} ArtifactRef does not identify its published contract`);
    }
  }
  verifyContentDigest(value);
  if (value.kind === "EnvironmentProfileSet") validateProfileSet(value);
  if (value.kind === "EnvironmentInventory") validateInventory(value, context);
  if (value.kind === "EnvironmentRemediationPlan") validateRemediationPlan(value);
  if (value.kind === "EnvironmentEffectReceipt") validateEffectReceipt(value, context);
  if (value.kind === "EnvironmentVerificationCandidate") validateCandidate(value);
  if (value.kind === "EnvironmentReadinessReceipt") validateReadiness(value, context);
  if (value.kind === "EnvironmentGateApproval") validateApproval(value, context);
  return value;
}
