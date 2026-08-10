import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateChangeIntegrationArtifact } from "./change-integration-artifact-validator.mjs";

const PREFIX = "change-integration/checkpoints";

export class ChangeIntegrationCheckpointError extends Error {
  constructor(message, code = "DR4095") {
    super(`change integration checkpoint failed: ${message}`);
    this.name = "ChangeIntegrationCheckpointError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new ChangeIntegrationCheckpointError(message, code); };
const ref = (artifactId, digest) => ({ artifactId, digest });

function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (entry && typeof entry === "object" && !ArrayBuffer.isView(entry) && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}

function key(identity, state) {
  return `${PREFIX}/${encodeURIComponent(identity)}/${state}`;
}

function requireStore(store, name) {
  if (!store || typeof store.get !== "function" || typeof store.put !== "function") {
    fail(`${name} must provide immutable get and put operations`, "DR4096");
  }
}

async function read(store, storeKey) {
  try { return await store.get(storeKey); }
  catch (error) { fail(`checkpoint read failed: ${error.message}`, "DR4096"); }
}

async function write(store, storeKey, value) {
  try { await store.put(storeKey, immutable(value)); }
  catch (error) { fail(`immutable persistence failed: ${error.message}`, "DR4097"); }
}

function identityMaterial(plan, invocation) {
  return {
    idempotencyKey: plan.idempotencyKey,
    plan: ref(plan.planId, plan.planDigest),
    invocation: ref(invocation.invocationId, invocation.invocationFingerprint),
    adapter: structuredClone(invocation.adapter),
    operation: structuredClone(invocation.operation),
  };
}

function sealCheckpoint(checkpointId, invocation, state, recoveryStatus, additions = {}) {
  const body = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "IntegrationCheckpoint",
    checkpointId,
    invocation: ref(invocation.invocationId, invocation.invocationFingerprint),
    operation: structuredClone(invocation.operation),
    ...additions,
    state,
    recoveryStatus,
  };
  const checkpoint = {
    ...body,
    checkpointDigest: canonicalJsonDigest(
      Object.fromEntries(Object.entries(body).filter(([name]) => !["apiVersion", "kind"].includes(name))),
    ),
  };
  validateChangeIntegrationArtifact(checkpoint);
  return immutable(checkpoint);
}

function validateEnvelope(envelope, expectedIdentity) {
  if (!envelope || envelope.apiVersion !== "devrelay.dev/v1alpha1" || envelope.kind !== "IntegrationCheckpointEntry") fail("stored checkpoint entry is malformed", "DR4098");
  if (canonicalJsonDigest(envelope.identity) !== expectedIdentity) fail("idempotency identity is bound to different inputs", "DR4099");
  validateChangeIntegrationArtifact(envelope.checkpoint);
  if (envelope.observationEvidence !== undefined) exactEvidenceRef(envelope.observationEvidence, "stored observationEvidence");
  if (envelope.entryDigest !== canonicalJsonDigest(Object.fromEntries(Object.entries(envelope).filter(([name]) => name !== "entryDigest")))) fail("stored checkpoint entry digest is invalid", "DR4098");
  return envelope;
}

function envelope(identity, checkpoint, additions = {}) {
  const body = { apiVersion:"devrelay.dev/v1alpha1", kind:"IntegrationCheckpointEntry", identity:immutable(identity), checkpoint, ...additions };
  return immutable({ ...body, entryDigest:canonicalJsonDigest(body) });
}

function rawBytes(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || typeof value === "string") return Buffer.from(value);
  return Buffer.from(canonicalJson(value), "utf8");
}

function parseRaw(bytes, invocation) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(`raw effect result is not JSON: ${error.message}`, "DR4100"); }
  // Persisted JSON is canonical, so normalize the comparison context to the
  // same property order used by the artifact validator's exact operation check.
  validateChangeIntegrationArtifact(value, { invocation:JSON.parse(canonicalJson(invocation)) });
  return value;
}

function exactEvidenceRef(value, name) {
  if (!value || typeof value.artifactId !== "string" || value.artifactId.length === 0 || !/^sha256:[0-9a-f]{64}$/.test(value.digest ?? "")) fail(`${name} must be an exact persisted ArtifactRef`, "DR4101");
  return immutable(value);
}

function trustedProducedCommit(authorization, invocation, observation) {
  if (authorization === undefined) return undefined;
  if (!authorization || authorization.invocationId !== invocation.invocationId || authorization.invocationFingerprint !== invocation.invocationFingerprint || authorization.targetRef !== observation.ref || authorization.commit !== observation.commit) {
    fail("trusted produced-commit authorization does not bind the exact invocation and observation", "DR4101");
  }
  return exactEvidenceRef(authorization.artifact, "producedCommitAuthorization.artifact");
}

function recovery(rawResult, observation, transition) {
  if (!observation || observation.ref !== transition.targetRef || typeof observation.treeDigest !== "string") fail("recovery requires a trusted exact target observation", "DR4101");
  if (observation.commit === transition.expectedTargetCommit) return "recovered";
  if (rawResult.postState?.commit === observation.commit) return "recovered";
  if (transition.strategy === "fast-forward" && transition.sourceCommit === observation.commit) return "recovered";
  return "needs-reconciliation";
}

function preparedRecovery(observation, observationEvidence, transition, invocation, producedCommitAuthorization) {
  if (!observation || observation.ref !== transition.targetRef || typeof observation.treeDigest !== "string") fail("recovery requires a trusted exact target observation", "DR4101");
  const evidence = exactEvidenceRef(observationEvidence, "observationEvidence");
  let disposition = "unresolved";
  let authorizationRef;
  if (observation.commit === transition.expectedTargetCommit) disposition = "not-applied";
  else if (transition.strategy === "fast-forward" && observation.commit === transition.sourceCommit) disposition = "applied";
  else if ((authorizationRef = trustedProducedCommit(producedCommitAuthorization, invocation, observation))) disposition = "applied";
  return {
    recoveryStatus:disposition === "unresolved" ? "needs-reconciliation" : "recovered",
    recoveryEvidence:{ disposition, observedState:immutable(observation), observationEvidence:evidence, ...(authorizationRef ? { producedCommitAuthorization:authorizationRef } : {}) },
  };
}

export function createChangeIntegrationCheckpointController({ effect, persistRawResult, readRawResult } = {}) {
  if (typeof effect !== "function") fail("a callable integration effect is required");
  if (typeof persistRawResult !== "function" || typeof readRawResult !== "function") fail("raw-result persistence and read callbacks are required");

  async function execute({ plan, invocation, checkpoints, observation, observationEvidence, producedCommitAuthorization } = {}) {
    validateChangeIntegrationArtifact(plan);
    validateChangeIntegrationArtifact(invocation, { plan, binding:{ adapter:plan.adapter } });
    requireStore(checkpoints, "checkpoints");
    const identity = identityMaterial(plan, invocation);
    const identityDigest = canonicalJsonDigest(identity);
    const base = `${PREFIX}/${encodeURIComponent(plan.idempotencyKey)}`;

    for (const state of ["reconciled", "effect-recorded"]) {
      const loaded = await read(checkpoints, `${base}/${state}`);
      if (loaded !== undefined && loaded !== null) {
        const saved = validateEnvelope(immutable(loaded), identityDigest);
        if (state === "reconciled" && saved.checkpoint.recoveryEvidence) {
          return immutable({ replayed:true, effectCalls:0, checkpointKey:`${base}/${state}`, checkpoint:saved.checkpoint, checkpointDigest:saved.checkpoint.checkpointDigest, recoveryStatus:saved.checkpoint.recoveryStatus, recoveryEvidence:saved.checkpoint.recoveryEvidence });
        }
        const rawRef = saved.checkpoint.rawResult;
        const bytes = Buffer.from(await readRawResult(immutable(rawRef)));
        if (sha256Digest(bytes) !== rawRef.digest) fail("stored raw effect bytes do not match their immutable reference", "DR4098");
        const result = parseRaw(bytes, invocation);
        if (state === "effect-recorded" && saved.checkpoint.recoveryStatus === "needs-reconciliation" && observation) return reconcile({ plan, invocation, checkpoints, observation, observationEvidence, producedCommitAuthorization });
        return immutable({ replayed:true, effectCalls:0, checkpointKey:`${base}/${state}`, checkpoint:saved.checkpoint, checkpointDigest:saved.checkpoint.checkpointDigest, rawResult:result, nativeBytes:bytes, ...(saved.observationEvidence ? { observationEvidence:saved.observationEvidence } : {}) });
      }
    }

    const preparedKey = `${base}/prepared`;
    const existingPrepared = await read(checkpoints, preparedKey);
    if (existingPrepared !== undefined && existingPrepared !== null) {
      const saved = validateEnvelope(immutable(existingPrepared), identityDigest);
      if (!observation) return immutable({ replayed:true, effectCalls:0, checkpointKey:preparedKey, checkpoint:saved.checkpoint, checkpointDigest:saved.checkpoint.checkpointDigest, recoveryStatus:"pending" });
      const disposition = preparedRecovery(observation, observationEvidence, plan.transition, invocation, producedCommitAuthorization);
      const reconciled = sealCheckpoint(`${invocation.invocationId}:reconciled`, invocation, "reconciled", disposition.recoveryStatus, { recoveryEvidence:disposition.recoveryEvidence });
      const reconciledKey = `${base}/reconciled`;
      await write(checkpoints, reconciledKey, envelope(identity, reconciled));
      return immutable({ replayed:false, effectCalls:0, checkpointKey:reconciledKey, checkpoint:reconciled, checkpointDigest:reconciled.checkpointDigest, ...disposition });
    }

    const prepared = sealCheckpoint(`${invocation.invocationId}:prepared`, invocation, "prepared", "pending");
    await write(checkpoints, preparedKey, envelope(identity, prepared));
    let returned;
    try { returned = await effect(immutable(invocation)); }
    catch (error) {
      return immutable({ replayed:false, effectCalls:1, checkpointKey:preparedKey, checkpoint:prepared, checkpointDigest:prepared.checkpointDigest, recoveryStatus:"pending", diagnostic:{ authority:"non-authoritative", code:"INTEGRATION_EFFECT_UNCERTAIN", message:String(error?.message ?? error) } });
    }
    const bytes = rawBytes(returned);
    const value = parseRaw(bytes, invocation);
    const digest = sha256Digest(bytes);
    const rawRef = await persistRawResult(Buffer.from(bytes), immutable({ invocationId:invocation.invocationId, invocationFingerprint:invocation.invocationFingerprint, digest }));
    if (!rawRef || typeof rawRef.artifactId !== "string" || rawRef.digest !== digest) fail("raw-result store returned a mismatched immutable reference", "DR4097");
    const persisted = Buffer.from(await readRawResult(immutable(rawRef)));
    if (sha256Digest(persisted) !== digest || !persisted.equals(bytes)) fail("persisted raw-result bytes are not exact", "DR4097");
    const uncertain = value.effectState === "unknown" || ["interrupted", "uncertain"].includes(value.terminalState);
    const recorded = sealCheckpoint(`${invocation.invocationId}:effect-recorded`, invocation, "effect-recorded", uncertain ? "needs-reconciliation" : "not-required", { rawResult:immutable(rawRef) });
    const recordedKey = `${base}/effect-recorded`;
    await write(checkpoints, recordedKey, envelope(identity, recorded));
    return immutable({ replayed:false, effectCalls:1, checkpointKey:recordedKey, checkpoint:recorded, checkpointDigest:recorded.checkpointDigest, rawResult:value, nativeBytes:bytes });
  }

  async function reconcile({ plan, invocation, checkpoints, observation, observationEvidence, producedCommitAuthorization } = {}) {
    validateChangeIntegrationArtifact(plan);
    validateChangeIntegrationArtifact(invocation, { plan, binding:{ adapter:plan.adapter } });
    requireStore(checkpoints, "checkpoints");
    const identity = identityMaterial(plan, invocation);
    const identityDigest = canonicalJsonDigest(identity);
    const base = `${PREFIX}/${encodeURIComponent(plan.idempotencyKey)}`;
    const existing = await read(checkpoints, `${base}/reconciled`);
    if (existing !== undefined && existing !== null) {
      const saved = validateEnvelope(immutable(existing), identityDigest);
      const storedObservation = saved.checkpoint.recoveryEvidence?.observedState ?? saved.checkpoint.observedState;
      if (observation && canonicalJson(storedObservation) !== canonicalJson(observation)) fail("reconciliation observation changed for the same identity", "DR4099");
      return immutable({ replayed:true, effectCalls:0, checkpointKey:`${base}/reconciled`, checkpoint:saved.checkpoint, checkpointDigest:saved.checkpoint.checkpointDigest, recoveryStatus:saved.checkpoint.recoveryStatus, ...(saved.checkpoint.recoveryEvidence ? { recoveryEvidence:saved.checkpoint.recoveryEvidence } : {}), ...(saved.observationEvidence ? { observationEvidence:saved.observationEvidence } : {}) });
    }
    const loaded = await read(checkpoints, `${base}/effect-recorded`);
    if (loaded === undefined || loaded === null) fail("effect-recorded checkpoint is required for reconciliation", "DR4101");
    const recorded = validateEnvelope(immutable(loaded), identityDigest).checkpoint;
    const bytes = Buffer.from(await readRawResult(immutable(recorded.rawResult)));
    if (sha256Digest(bytes) !== recorded.rawResult.digest) fail("stored raw effect bytes do not match their immutable reference", "DR4098");
    const result = parseRaw(bytes, invocation);
    const evidence = exactEvidenceRef(observationEvidence, "observationEvidence");
    const status = recovery(result, observation, plan.transition);
    const reconciled = sealCheckpoint(`${invocation.invocationId}:reconciled`, invocation, "reconciled", status, { rawResult:recorded.rawResult, observedState:immutable(observation) });
    const reconciledKey = `${base}/reconciled`;
    await write(checkpoints, reconciledKey, envelope(identity, reconciled, { observationEvidence:evidence }));
    return immutable({ replayed:false, effectCalls:0, checkpointKey:reconciledKey, checkpoint:reconciled, checkpointDigest:reconciled.checkpointDigest, recoveryStatus:status, observationEvidence:evidence, rawResult:result, nativeBytes:bytes });
  }

  return Object.freeze({ execute, reconcile });
}

export function changeIntegrationCheckpointKey(idempotencyKey, state) {
  if (!["prepared", "effect-recorded", "reconciled"].includes(state)) fail("checkpoint state is invalid");
  return key(idempotencyKey, state);
}
