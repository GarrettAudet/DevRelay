import { canonicalJsonDigest } from "./content-digest.mjs";
import {
  ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS,
  validateEnvironmentPreparationArtifact,
  withEnvironmentPreparationContentDigest,
} from "./environment-preparation-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";

export class EnvironmentPreparationEffectError extends Error {
  constructor(message, code = "DR5420") {
    super(`environment preparation effect failed: ${message}`);
    this.name = "EnvironmentPreparationEffectError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new EnvironmentPreparationEffectError(message, code);
};
const ordered = (values, key) =>
  [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
const grantKey = ({ kind, scope, purpose }) => `${kind}\u0000${scope}\u0000${purpose}`;
const normalizedGrants = (grants) => ordered(grants, grantKey);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sameRef = (left, right) =>
  left?.artifactId === right?.artifactId && left?.schema === right?.schema &&
  left?.mediaType === right?.mediaType && left?.digest === right?.digest;

function artifactRef(value) {
  const contract = ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS[value.kind];
  const artifactId = value.profileSetId ?? value.inventoryId ?? value.planId ?? value.receiptId;
  return {
    artifactId,
    schema: contract.schema,
    mediaType: contract.mediaType,
    digest: value.contentDigest,
    uri: `memory://devrelay/environment-preparation/${encodeURIComponent(artifactId)}/${value.contentDigest.slice(7)}.json`,
  };
}

function findCheck(profileSet, checkId) {
  return profileSet.profiles.flatMap(({ checks }) => checks).find(({ id }) => id === checkId);
}

function effectFor({ planId, check, entry, inventory }) {
  const definition = structuredClone(entry.effect);
  const effectId = entry.effectId ?? `EP-EFFECT-${check.id}`;
  return {
    id: effectId,
    capability: definition.capability,
    scope: definition.scope ?? "project-local",
    description: definition.description,
    impact: definition.impact,
    grants: normalizedGrants(definition.grants ?? []),
    rollback: structuredClone(definition.rollback ?? { supported: true, procedure: "Restore the exact before-state captured by the effect receipt." }),
    idempotencyKey: canonicalJsonDigest({ planId, effectId, checkId: check.id, inventoryFingerprint: inventory.fingerprint, definition }),
    requiredEvidence: ordered(definition.requiredEvidence ?? ["environment-preparation/effect-receipt"], (value) => value),
  };
}

export function createEnvironmentRemediationPlan({
  planId,
  profileSet,
  profileSetRef = artifactRef(profileSet),
  inventory,
  inventoryRef = artifactRef(inventory),
  effectCatalog = [],
  sourceRefs,
} = {}) {
  validateEnvironmentPreparationArtifact(profileSet, { ref: profileSetRef });
  validateEnvironmentPreparationArtifact(inventory, { profileSet, ref: inventoryRef });
  if (!sameRef(inventory.profileSet, profileSetRef)) fail("inventory does not bind the exact profile set");
  const effects = [];
  const diagnostics = [];
  for (const observation of ordered(inventory.observations, ({ checkId }) => checkId)) {
    const check = findCheck(profileSet, observation.checkId);
    if (!check) fail(`inventory references unknown check ${observation.checkId}`);
    if (!check.required || ["pass", "not-applicable"].includes(observation.status)) continue;
    const matches = effectCatalog.filter((entry) =>
      entry.checkId === check.id || (!entry.checkId && entry.capability === check.capability),
    );
    if (matches.length !== 1) {
      diagnostics.push({
        code: matches.length === 0 ? "DR5421" : "DR5422",
        severity: "error",
        message: matches.length === 0 ? `No approved remediation capability covers ${check.id}.` : `Multiple remediation capabilities ambiguously cover ${check.id}.`,
        checkId: check.id,
      });
      continue;
    }
    effects.push(effectFor({ planId, check, entry: matches[0], inventory }));
  }
  const result = withEnvironmentPreparationContentDigest({
    apiVersion: API,
    kind: "EnvironmentRemediationPlan",
    planId,
    profileSet: structuredClone(profileSetRef),
    inventory: structuredClone(inventoryRef),
    baseFingerprint: inventory.fingerprint,
    effects: ordered(effects, ({ id }) => id),
    approvalRequired: effects.length > 0,
    diagnostics,
    sourceRefs: ordered(sourceRefs, ({ role, jsonPointer = "" }) => `${role}:${jsonPointer}`),
  });
  return validateEnvironmentPreparationArtifact(result);
}

function approvalMaterial(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", "approvalDigest"].includes(key)));
}

export function createEnvironmentRemediationApproval({
  approvalId,
  plan,
  planRef = artifactRef(plan),
  approvedEffectIds,
  machineGlobalEffectIds = [],
} = {}) {
  validateEnvironmentPreparationArtifact(plan, { ref: planRef });
  const requested = ordered(approvedEffectIds ?? plan.effects.map(({ id }) => id), (value) => value);
  const available = new Set(plan.effects.map(({ id }) => id));
  if (requested.some((id) => !available.has(id))) fail("approval contains an effect outside the remediation plan", "DR5423");
  const machineGlobal = ordered(machineGlobalEffectIds, (value) => value);
  if (machineGlobal.some((id) => !requested.includes(id) || plan.effects.find(({ id: effectId }) => effectId === id)?.scope !== "machine-global")) {
    fail("machine-global approval does not identify an approved machine-global effect", "DR5423");
  }
  const value = {
    apiVersion: API,
    kind: "EnvironmentRemediationApproval",
    approvalId,
    authority: "human-owner",
    decision: "approved",
    plan: structuredClone(planRef),
    approvedEffects: requested.map((effectId) => ({
      effectId,
      grants: normalizedGrants(plan.effects.find(({ id }) => id === effectId).grants),
    })),
    machineGlobalEffectIds: machineGlobal,
  };
  return Object.freeze({ ...value, approvalDigest: canonicalJsonDigest(approvalMaterial(value)) });
}

function validateApproval(approval, plan, planRef) {
  if (!approval || approval.kind !== "EnvironmentRemediationApproval" || approval.authority !== "human-owner" || approval.decision !== "approved") {
    fail("an exact human-owner remediation approval is required", "DR5423");
  }
  if (approval.approvalDigest !== canonicalJsonDigest(approvalMaterial(approval))) fail("remediation approval digest drifted", "DR5423");
  if (!sameRef(approval.plan, planRef)) fail("remediation approval substitutes its plan", "DR5423");
  for (const approved of approval.approvedEffects) {
    const effect = plan.effects.find(({ id }) => id === approved.effectId);
    if (!effect || !same(normalizedGrants(effect.grants), normalizedGrants(approved.grants))) {
      fail(`remediation approval grants differ for ${approved.effectId}`, "DR5423");
    }
  }
}

function assertSafeAdapterResult(value) {
  const visit = (item, key = "") => {
    if (Array.isArray(item)) return item.forEach((entry) => visit(entry, key));
    if (!item || typeof item !== "object") {
      if (/(?:secret|token|password|credential|api[-_]?key)/iu.test(key) && typeof item !== "boolean") {
        fail(`adapter result exposes sensitive field ${key}`, "DR5424");
      }
      return;
    }
    for (const [childKey, child] of Object.entries(item)) visit(child, childKey);
  };
  visit(value);
}

export function createInMemoryEnvironmentEffectCheckpointStore() {
  const values = new Map();
  return Object.freeze({
    async get(key) { return values.get(key); },
    async put(key, value) {
      if (values.has(key)) fail(`checkpoint ${key} is immutable`, "DR5425");
      values.set(key, structuredClone(value));
    },
  });
}

export function createEnvironmentEffectCoordinator({ adapter, checkpoints } = {}) {
  if (!adapter || typeof adapter.apply !== "function" || typeof adapter.id !== "string" || typeof adapter.version !== "string") {
    fail("effect coordinator requires a versioned adapter");
  }
  if (!checkpoints || typeof checkpoints.get !== "function" || typeof checkpoints.put !== "function") {
    fail("effect coordinator requires an immutable checkpoint store");
  }
  return Object.freeze({
    async execute({ plan, planRef = artifactRef(plan), effectId, approval, hostGrants, currentFingerprint }) {
      validateEnvironmentPreparationArtifact(plan, { ref: planRef });
      validateApproval(approval, plan, planRef);
      const effect = plan.effects.find(({ id }) => id === effectId);
      if (!effect) fail(`unknown remediation effect ${effectId}`);
      const approved = approval.approvedEffects.find(({ effectId: id }) => id === effectId);
      if (!approved) fail(`effect ${effectId} is not approved`, "DR5423");
      if (effect.scope === "machine-global" && !approval.machineGlobalEffectIds.includes(effectId)) {
        fail(`machine-global effect ${effectId} lacks separate approval`, "DR5423");
      }
      if (!same(normalizedGrants(hostGrants), normalizedGrants(effect.grants))) {
        fail(`host grants differ from the exact approved grants for ${effectId}`, "DR5426");
      }
      if (currentFingerprint !== plan.baseFingerprint) fail("environment fingerprint drifted before effect execution", "DR5427");
      const invocationFingerprint = canonicalJsonDigest({ plan: planRef, effect, approvalDigest: approval.approvalDigest, hostGrants: normalizedGrants(hostGrants), currentFingerprint, adapter: { id: adapter.id, version: adapter.version } });
      const checkpointKey = `environment-effect:${effect.id}:${effect.idempotencyKey}`;
      const existing = await checkpoints.get(checkpointKey);
      if (existing) {
        if (existing.invocationFingerprint !== invocationFingerprint) fail("effect checkpoint fingerprint differs", "DR5425");
        return Object.freeze({ receipt: structuredClone(existing.receipt), replayed: true, effectCalls: 0, rollbackCalls: 0, invocationFingerprint });
      }
      let effectCalls = 0;
      let rollbackCalls = 0;
      let raw;
      try {
        effectCalls += 1;
        raw = await adapter.apply(structuredClone(effect), { currentFingerprint, grants: structuredClone(hostGrants) });
        assertSafeAdapterResult(raw);
      } catch (error) {
        if (error instanceof EnvironmentPreparationEffectError) throw error;
        raw = { outcome: "failed", beforeFingerprint: currentFingerprint, afterFingerprint: currentFingerprint, durationMs: 0, rollbackState: "not-required", evidence: [{ artifactId: `EP-ERROR-${effect.id}`, schema: "https://devrelay.dev/evidence/environment-effect-error/v1", mediaType: "application/json", digest: canonicalJsonDigest({ effectId, error: "adapter-failure" }), uri: `memory://devrelay/environment-preparation/errors/${encodeURIComponent(effect.id)}` }], diagnostics: [{ code: "DR5428", severity: "error", message: "The effect adapter failed without trusted output." }] };
      }
      if (!raw || !["applied", "failed", "no-change"].includes(raw.outcome)) fail("adapter returned an invalid effect outcome", "DR5428");
      let final = structuredClone(raw);
      if (raw.outcome === "failed" && raw.afterFingerprint !== raw.beforeFingerprint && effect.rollback.supported) {
        if (typeof adapter.rollback !== "function") fail("mutating failure has no rollback adapter", "DR5429");
        rollbackCalls += 1;
        const rollback = await adapter.rollback(structuredClone(effect), structuredClone(raw), { grants: structuredClone(hostGrants) });
        assertSafeAdapterResult(rollback);
        if (rollback?.outcome !== "completed" || rollback.afterFingerprint !== raw.beforeFingerprint) fail("rollback did not restore the exact before fingerprint", "DR5429");
        final = { ...raw, outcome: "rolled-back", afterFingerprint: rollback.afterFingerprint, rollbackState: "completed", evidence: [...raw.evidence, ...rollback.evidence], diagnostics: [...(raw.diagnostics ?? []), ...(rollback.diagnostics ?? [])] };
      }
      const receipt = withEnvironmentPreparationContentDigest({
        apiVersion: API,
        kind: "EnvironmentEffectReceipt",
        receiptId: `EP-RECEIPT-${effect.id}-${effect.idempotencyKey.slice(7, 19).toUpperCase()}`,
        plan: structuredClone(planRef),
        effectId: effect.id,
        adapter: { id: adapter.id, version: adapter.version },
        outcome: final.outcome,
        beforeFingerprint: final.beforeFingerprint,
        afterFingerprint: final.afterFingerprint,
        checkpointKey,
        replayed: false,
        durationMs: final.durationMs ?? 0,
        grants: normalizedGrants(effect.grants),
        rollbackState: final.rollbackState ?? (final.outcome === "applied" ? "available" : "not-required"),
        evidence: final.evidence,
        diagnostics: final.diagnostics ?? [],
      });
      validateEnvironmentPreparationArtifact(receipt, { plan, planRef });
      await checkpoints.put(checkpointKey, { invocationFingerprint, receipt });
      return Object.freeze({ receipt, replayed: false, effectCalls, rollbackCalls, invocationFingerprint });
    },
  });
}
