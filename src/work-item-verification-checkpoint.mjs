import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateWorkItemVerificationArtifact } from "./work-item-verification-artifact-validator.mjs";

const PREFIX = "work-item-verification/attempts";

export class WorkItemVerificationCheckpointError extends Error {
  constructor(message, code = "DR4080") {
    super(`work item verification checkpoint failed: ${message}`);
    this.name = "WorkItemVerificationCheckpointError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new WorkItemVerificationCheckpointError(message, code); };

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

function attemptKey(attemptId) {
  return `${PREFIX}/${encodeURIComponent(attemptId)}`;
}

function requireStore(store) {
  if (!store || typeof store.get !== "function" || typeof store.put !== "function") {
    fail("an immutable checkpoint store with get and put is required", "DR4081");
  }
}

async function read(store, key) {
  try { return await store.get(key); }
  catch (error) { fail(`checkpoint read failed: ${error.message}`, "DR4081"); }
}

async function write(store, key, checkpoint) {
  try { await store.put(key, checkpoint); }
  catch (error) { fail(`immutable checkpoint write failed: ${error.message}`, "DR4082"); }
}

function checkpointDigest(checkpoint) {
  const { checkpointDigest: ignored, ...material } = checkpoint;
  return canonicalJsonDigest(material);
}

function validatePredecessor(predecessor, invocation) {
  if (!predecessor) return undefined;
  validateWorkItemVerificationCheckpoint(predecessor);
  if (predecessor.verificationAttemptId === invocation.verificationAttemptId) {
    fail("an attempt cannot be its own predecessor", "DR4083");
  }
  return {
    verificationAttemptId: predecessor.verificationAttemptId,
    invocationFingerprint: predecessor.invocationFingerprint,
    checkpointDigest: predecessor.checkpointDigest,
  };
}

function parseNativeResult(nativeOutput) {
  let bytes;
  let value;
  if (nativeOutput && typeof nativeOutput === "object" && "bytes" in nativeOutput) {
    bytes = Buffer.from(nativeOutput.bytes);
    value = nativeOutput.value;
  } else if (typeof nativeOutput === "string" || Buffer.isBuffer(nativeOutput) || nativeOutput instanceof Uint8Array) {
    bytes = Buffer.from(nativeOutput);
  } else {
    value = nativeOutput;
    bytes = Buffer.from(canonicalJson(nativeOutput), "utf8");
  }
  if (value === undefined) {
    try { value = JSON.parse(bytes.toString("utf8")); }
    catch (error) { fail(`native verifier output is not JSON: ${error.message}`, "DR4084"); }
  }
  return { bytes, value };
}

export function validateWorkItemVerificationCheckpoint(value, expected = {}) {
  if (!value || value.apiVersion !== "devrelay.dev/v1alpha1" || value.kind !== "VerificationAttemptCheckpoint") {
    fail("checkpoint has an invalid envelope", "DR4083");
  }
  if (value.checkpointDigest !== checkpointDigest(value)) fail("checkpoint digest is invalid", "DR4083");
  if (expected.verificationAttemptId && value.verificationAttemptId !== expected.verificationAttemptId) fail("checkpoint attempt identity does not match", "DR4083");
  if (expected.invocationFingerprint && value.invocationFingerprint !== expected.invocationFingerprint) fail("checkpoint invocation fingerprint does not match", "DR4083");
  if (!value.invocation || value.invocation.verificationAttemptId !== value.verificationAttemptId || value.invocation.invocationFingerprint !== value.invocationFingerprint) fail("checkpoint invocation binding is invalid", "DR4083");
  validateWorkItemVerificationArtifact(value.invocation);
  validateWorkItemVerificationArtifact(value.binding);
  if (!["returned", "threw-failure", "threw-interruption"].includes(value.terminalState)) fail("checkpoint terminal state is invalid", "DR4083");
  if (value.terminalState === "returned") {
    if (!value.nativeOutput || typeof value.nativeOutput.bytesBase64 !== "string" || typeof value.nativeOutput.digest !== "string") fail("returned checkpoint lacks exact native verifier bytes", "DR4083");
    const bytes = Buffer.from(value.nativeOutput.bytesBase64, "base64");
    if (bytes.toString("base64") !== value.nativeOutput.bytesBase64 || sha256Digest(bytes) !== value.nativeOutput.digest) fail("checkpoint native verifier bytes are corrupt", "DR4083");
    let raw;
    try { raw = JSON.parse(bytes.toString("utf8")); }
    catch { fail("checkpoint native verifier bytes are not JSON", "DR4083"); }
    validateWorkItemVerificationArtifact(raw, { invocation: value.invocation, binding: value.binding });
    if (value.failure !== undefined) fail("returned checkpoint cannot contain thrown failure data", "DR4083");
  } else if (value.nativeOutput !== undefined || !value.failure || typeof value.failure.name !== "string" || typeof value.failure.message !== "string") {
    fail("thrown checkpoint lifecycle is malformed", "DR4083");
  }
  if (value.predecessor && (typeof value.predecessor.verificationAttemptId !== "string" || typeof value.predecessor.checkpointDigest !== "string")) fail("checkpoint predecessor reference is malformed", "DR4083");
  return value;
}

export function createWorkItemVerificationCheckpointController({ verifier } = {}) {
  if (typeof verifier !== "function") fail("a callable verifier is required");

  async function execute({ invocation, binding, predecessor, checkpoints }) {
    validateWorkItemVerificationArtifact(invocation);
    validateWorkItemVerificationArtifact(binding);
    requireStore(checkpoints);
    const key = attemptKey(invocation.verificationAttemptId);
    const existing = await read(checkpoints, key);
    if (existing !== undefined && existing !== null) {
      const checkpoint = immutable(existing);
      validateWorkItemVerificationCheckpoint(checkpoint, {
        verificationAttemptId: invocation.verificationAttemptId,
        invocationFingerprint: invocation.invocationFingerprint,
      });
      if (canonicalJsonDigest(checkpoint.invocation) !== canonicalJsonDigest(invocation) || canonicalJsonDigest(checkpoint.binding) !== canonicalJsonDigest(binding)) fail("duplicate attempt identity has changed inputs", "DR4085");
      const requestedPredecessor = validatePredecessor(predecessor, invocation);
      if (canonicalJsonDigest(checkpoint.predecessor ?? null) !== canonicalJsonDigest(requestedPredecessor ?? null)) fail("duplicate attempt identity has predecessor drift", "DR4085");
      if (checkpoint.terminalState !== "returned") {
        fail(`replayed verifier ${checkpoint.terminalState}: ${checkpoint.failure.message}`, checkpoint.terminalState === "threw-interruption" ? "DR4087" : "DR4086");
      }
      const bytes = Buffer.from(checkpoint.nativeOutput.bytesBase64, "base64");
      return immutable({ replayed: true, checkpointKey: key, checkpointDigest: checkpoint.checkpointDigest, checkpoint, nativeBytes: bytes, rawResult: JSON.parse(bytes.toString("utf8")) });
    }

    const predecessorRef = validatePredecessor(predecessor, invocation);
    let native;
    try { native = parseNativeResult(await verifier(immutable(invocation))); }
    catch (error) {
      if (error instanceof WorkItemVerificationCheckpointError) throw error;
      const terminalState = error?.name === "AbortError" ? "threw-interruption" : "threw-failure";
      const material = {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "VerificationAttemptCheckpoint",
        verificationAttemptId: invocation.verificationAttemptId,
        invocationFingerprint: invocation.invocationFingerprint,
        invocation: immutable(invocation),
        binding: immutable(binding),
        ...(predecessorRef ? { predecessor: predecessorRef } : {}),
        terminalState,
        failure: { name: String(error?.name ?? "Error"), message: String(error?.message ?? error) },
      };
      const checkpoint = immutable({ ...material, checkpointDigest: canonicalJsonDigest(material) });
      await write(checkpoints, key, checkpoint);
      validateWorkItemVerificationCheckpoint(checkpoint);
      fail(`verifier ${terminalState}: ${checkpoint.failure.message}`, terminalState === "threw-interruption" ? "DR4087" : "DR4086");
    }
    const material = {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "VerificationAttemptCheckpoint",
      verificationAttemptId: invocation.verificationAttemptId,
      invocationFingerprint: invocation.invocationFingerprint,
      invocation: immutable(invocation),
      binding: immutable(binding),
      ...(predecessorRef ? { predecessor: predecessorRef } : {}),
      terminalState: "returned",
      nativeOutput: { digest: sha256Digest(native.bytes), bytesBase64: native.bytes.toString("base64") },
    };
    const checkpoint = immutable({ ...material, checkpointDigest: canonicalJsonDigest(material) });
    await write(checkpoints, key, checkpoint);
    // Validation deliberately follows the durable write: native effect bytes must
    // survive even when contract validation reports a failed verifier result.
    validateWorkItemVerificationCheckpoint(checkpoint);
    return immutable({ replayed: false, checkpointKey: key, checkpointDigest: checkpoint.checkpointDigest, checkpoint, nativeBytes: native.bytes, rawResult: native.value });
  }

  async function replay({ verificationAttemptId, invocationFingerprint, checkpoints }) {
    requireStore(checkpoints);
    const key = attemptKey(verificationAttemptId);
    const loaded = await read(checkpoints, key);
    if (loaded === undefined || loaded === null) fail("exact attempt checkpoint does not exist", "DR4083");
    const checkpoint = immutable(loaded);
    validateWorkItemVerificationCheckpoint(checkpoint, { verificationAttemptId, invocationFingerprint });
    if (checkpoint.terminalState !== "returned") {
      return immutable({ replayed: true, checkpointKey: key, checkpointDigest: checkpoint.checkpointDigest, checkpoint, failure: checkpoint.failure });
    }
    const bytes = Buffer.from(checkpoint.nativeOutput.bytesBase64, "base64");
    return immutable({ replayed: true, checkpointKey: key, checkpointDigest: checkpoint.checkpointDigest, checkpoint, nativeBytes: bytes, rawResult: JSON.parse(bytes.toString("utf8")) });
  }

  return Object.freeze({ execute, replay });
}

export { attemptKey as workItemVerificationAttemptCheckpointKey };
