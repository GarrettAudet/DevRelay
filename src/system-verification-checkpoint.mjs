import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateSystemVerificationArtifact } from "./system-verification-artifact-validator.mjs";

const PREFIX = "system-verification/attempts";

export class SystemVerificationCheckpointError extends Error {
  constructor(message, code = "DR4140") {
    super(`system verification checkpoint failed: ${message}`);
    this.name = "SystemVerificationCheckpointError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new SystemVerificationCheckpointError(message, code); };
const immutable = (value) => {
  const copy = structuredClone(value);
  const freeze = (item) => { if (item && typeof item === "object" && !ArrayBuffer.isView(item) && !Object.isFrozen(item)) { for (const child of Object.values(item)) freeze(child); Object.freeze(item); } return item; };
  return freeze(copy);
};
const keyFor = (invocationId) => `${PREFIX}/${encodeURIComponent(invocationId)}`;
const digest = (value) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "checkpointDigest")));
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function requireStore(store) {
  if (!store || typeof store.get !== "function" || typeof store.put !== "function") fail("an immutable checkpoint store with get and put is required", "DR4141");
}

function parse(output) {
  let bytes, value;
  if (output && typeof output === "object" && Object.hasOwn(output, "bytes")) { bytes = Buffer.from(output.bytes); value = output.value; }
  else if (typeof output === "string" || Buffer.isBuffer(output) || output instanceof Uint8Array) bytes = Buffer.from(output);
  else { value = output; bytes = Buffer.from(canonicalJson(output), "utf8"); }
  if (value === undefined) { try { value = JSON.parse(bytes.toString("utf8")); } catch (error) { fail(`verifier output is not JSON: ${error.message}`, "DR4144"); } }
  return { bytes, value };
}

export function validateSystemVerificationCheckpoint(value, expected = {}) {
  if (!value || value.apiVersion !== "devrelay.dev/v1alpha1" || value.kind !== "SystemVerificationAttemptCheckpoint") fail("checkpoint has an invalid envelope", "DR4143");
  if (value.checkpointDigest !== digest(value)) fail("checkpoint digest is invalid", "DR4143");
  if (expected.invocationId && value.invocationId !== expected.invocationId) fail("checkpoint invocation identity does not match", "DR4143");
  if (expected.invocationFingerprint && value.invocationFingerprint !== expected.invocationFingerprint) fail("checkpoint invocation fingerprint does not match", "DR4143");
  for (const artifact of [value.subject,value.obligations,value.policy]) validateSystemVerificationArtifact(artifact);
  validateSystemVerificationArtifact(value.invocation,{subject:value.subject,obligations:value.obligations,policy:value.policy});
  if (value.invocation.invocationId !== value.invocationId || value.invocation.invocationFingerprint !== value.invocationFingerprint) fail("checkpoint invocation binding is invalid", "DR4143");
  if (value.terminalState === "returned") {
    if (!value.nativeOutput?.bytesBase64 || !value.nativeOutput?.digest) fail("returned checkpoint lacks exact verifier bytes", "DR4143");
    const bytes = Buffer.from(value.nativeOutput.bytesBase64, "base64");
    if (bytes.toString("base64") !== value.nativeOutput.bytesBase64 || sha256Digest(bytes) !== value.nativeOutput.digest) fail("checkpoint verifier bytes are corrupt", "DR4143");
    let raw; try { raw = JSON.parse(bytes.toString("utf8")); } catch { fail("checkpoint verifier bytes are not JSON", "DR4143"); }
    validateSystemVerificationArtifact(raw, { invocation:value.invocation });
    if (value.failure !== undefined) fail("returned checkpoint contains failure data", "DR4143");
  } else if (!["threw-failure", "threw-interruption"].includes(value.terminalState) || value.nativeOutput !== undefined || !value.failure?.name || !value.failure?.message) fail("checkpoint terminal state is invalid", "DR4143");
  return value;
}

export function createSystemVerificationCheckpointController({ verifier } = {}) {
  if (typeof verifier !== "function") fail("a callable verifier is required");
  async function replayValue(checkpoint, key) {
    validateSystemVerificationCheckpoint(checkpoint);
    if (checkpoint.terminalState !== "returned") fail(`replayed verifier ${checkpoint.terminalState}: ${checkpoint.failure.message}`, checkpoint.terminalState === "threw-interruption" ? "DR4147" : "DR4146");
    const bytes = Buffer.from(checkpoint.nativeOutput.bytesBase64, "base64");
    return immutable({ replayed:true, verifierCalls:0, checkpointKey:key, checkpointDigest:checkpoint.checkpointDigest, checkpoint, nativeBytes:bytes, rawObservation:JSON.parse(bytes.toString("utf8")) });
  }
  async function execute({ invocation, subject, obligations, policy, checkpoints }) {
    validateSystemVerificationArtifact(invocation,{subject,obligations,policy});
    requireStore(checkpoints);
    const key = keyFor(invocation.invocationId);
    let existing; try { existing = await checkpoints.get(key); } catch (error) { fail(`checkpoint read failed: ${error.message}`, "DR4141"); }
    if (existing != null) {
      const checkpoint = immutable(existing);
      validateSystemVerificationCheckpoint(checkpoint, invocation);
      if (!same(checkpoint.invocation, invocation)||!same(checkpoint.subject,subject)||!same(checkpoint.obligations,obligations)||!same(checkpoint.policy,policy)) fail("duplicate invocation identity has changed inputs", "DR4145");
      return replayValue(checkpoint, key);
    }
    let material;
    try {
      const native = parse(await verifier(immutable(invocation)));
      material = { apiVersion:"devrelay.dev/v1alpha1", kind:"SystemVerificationAttemptCheckpoint", invocationId:invocation.invocationId, invocationFingerprint:invocation.invocationFingerprint, subject:immutable(subject), obligations:immutable(obligations), policy:immutable(policy), invocation:immutable(invocation), terminalState:"returned", nativeOutput:{ digest:sha256Digest(native.bytes), bytesBase64:native.bytes.toString("base64") } };
    } catch (error) {
      if (error instanceof SystemVerificationCheckpointError) throw error;
      material = { apiVersion:"devrelay.dev/v1alpha1", kind:"SystemVerificationAttemptCheckpoint", invocationId:invocation.invocationId, invocationFingerprint:invocation.invocationFingerprint, subject:immutable(subject), obligations:immutable(obligations), policy:immutable(policy), invocation:immutable(invocation), terminalState:error?.name === "AbortError" ? "threw-interruption" : "threw-failure", failure:{ name:String(error?.name ?? "Error"), message:String(error?.message ?? error) } };
    }
    const checkpoint = immutable({ ...material, checkpointDigest:canonicalJsonDigest(material) });
    try { await checkpoints.put(key, checkpoint); } catch (error) { fail(`immutable checkpoint write failed: ${error.message}`, "DR4142"); }
    validateSystemVerificationCheckpoint(checkpoint);
    return replayValue(checkpoint, key).then((result) => immutable({ ...result, replayed:false, verifierCalls:1 }));
  }
  async function replay({ invocationId, invocationFingerprint, checkpoints }) {
    requireStore(checkpoints); const key=keyFor(invocationId); let checkpoint;
    try { checkpoint=await checkpoints.get(key); } catch(error) { fail(`checkpoint read failed: ${error.message}`, "DR4141"); }
    if (checkpoint == null) fail("exact invocation checkpoint does not exist", "DR4143");
    validateSystemVerificationCheckpoint(checkpoint,{invocationId,invocationFingerprint}); return replayValue(immutable(checkpoint),key);
  }
  return Object.freeze({ execute, replay });
}

export { keyFor as systemVerificationCheckpointKey };
