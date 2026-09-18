import { readFileSync } from "node:fs";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const MEDIA_TYPE = "application/vnd.devrelay.local-host-checkpoint+json";
const validateEnvelope = compileArtifactSchema(JSON.parse(readFileSync(
  new URL("../contracts/local-host-checkpoint.schema.json", import.meta.url), "utf8",
)));

export class LocalHostCheckpointError extends Error {
  constructor(message, code = "DR4930") {
    super(`local host checkpoint: ${message}`);
    this.name = "LocalHostCheckpointError";
    this.code = code;
  }
}
const fail = (message, code) => { throw new LocalHostCheckpointError(message, code); };
const text = (value, label) => {
  if (typeof value !== "string" || !value.trim()) fail(`${label} must be a nonempty string`);
  return value;
};
const immutable = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
};

// Validate descriptors before reading values: persistence must not execute a
// caller's getters/toJSON or silently turn unsupported values into other data.
function assertJson(value, ancestors = new Set()) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object") fail("checkpoint value must be plain JSON data");
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array && prototype !== Array.prototype) fail("checkpoint arrays must have the plain array prototype");
  if (!array && prototype !== Object.prototype && prototype !== null) fail("checkpoint value must be plain JSON data");
  if (ancestors.has(value)) fail("checkpoint value must not contain cycles");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail("checkpoint value cannot contain symbol properties");
  if (array && (keys.length !== value.length + 1 || keys.some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key)))) {
    fail("checkpoint arrays must be dense and contain no extra properties");
  }
  ancestors.add(value);
  for (const key of keys) {
    if (array && key === "length") continue;
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) fail("checkpoint value cannot contain accessors or hidden properties");
    assertJson(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}

export function createLocalHostCheckpointStore({ storage, namespace } = {}) {
  text(namespace, "namespace");
  if (namespace.length > 256) fail("namespace exceeds the contract limit");
  for (const operation of ["readRun", "initializeRun", "putArtifact", "getArtifact"]) {
    if (typeof storage?.[operation] !== "function") fail("an explicitly opened LocalHostStorage is required");
  }
  const identity = (key) => `local-checkpoint:${canonicalJsonDigest({ namespace, key: text(key, "key") }).slice(7)}`;
  // Cache decoding only, never storage or authority. Every hit follows current
  // pointer validation and a raw storage reread/digest check. Values are deeply
  // frozen; raw cache bytes remain private. Bound both count and retained bytes.
  const decoded = new Map();
  let decodedBytes = 0;
  const encode = (key, value) => {
    text(key, "key");
    assertJson(value);
    const envelope = { apiVersion: API_VERSION, kind: "LocalHostCheckpoint", namespace, key, value };
    if (!validateEnvelope(envelope)) fail("checkpoint envelope violates its closed contract");
    return Buffer.from(canonicalJson(envelope), "utf8");
  };
  const read = (key) => {
    const runId = identity(key);
    let run;
    try { run = storage.readRun(runId); }
    catch (error) {
      if (error?.code === "DR4920") return undefined;
      throw error;
    }
    const artifact = run.state?.artifact;
    const expected = { kind: "LocalHostCheckpointPointer", namespace, key, artifact };
    if (
      !artifact || run.runId !== runId || run.version !== 0 ||
      run.approvalRef !== null || run.checkpointRef !== null || run.graphRef !== null ||
      canonicalJson(run.state) !== canonicalJson(expected) ||
      canonicalJson(run.artifactRefs) !== canonicalJson([artifact]) ||
      artifact.mediaType !== MEDIA_TYPE ||
      artifact.artifactId !== `LOCAL-CHECKPOINT-${artifact.digest?.slice(7)}`
    ) fail("checkpoint pointer identity or immutable state drifted", "DR4931");
    const bytes = storage.getArtifact(artifact);
    const cached = decoded.get(runId);
    if (cached && cached.bytes.equals(bytes)) {
      decoded.delete(runId); decoded.set(runId, cached);
      return { bytes: Buffer.from(bytes), value: cached.value };
    }
    let envelope;
    try { envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { fail("checkpoint bytes are not valid UTF-8 JSON", "DR4931"); }
    if (
      !validateEnvelope(envelope) || envelope.namespace !== namespace || envelope.key !== key ||
      !Buffer.from(canonicalJson(envelope), "utf8").equals(bytes)
    ) fail("checkpoint envelope identity or canonical bytes drifted", "DR4931");
    const value = immutable(envelope.value);
    if (cached) { decoded.delete(runId); decodedBytes -= cached.bytes.length; }
    if (bytes.length <= 4 * 1024 * 1024) {
      while (decoded.size >= 8 || decodedBytes + bytes.length > 16 * 1024 * 1024) {
        const oldest = decoded.keys().next().value;
        decodedBytes -= decoded.get(oldest).bytes.length; decoded.delete(oldest);
      }
      decoded.set(runId, { bytes: Buffer.from(bytes), value }); decodedBytes += bytes.length;
    }
    return { bytes, value };
  };
  const storeBytesIfAbsent = (key, bytes) => {
    const prior = read(key);
    if (prior) return prior;
    const digest = sha256Digest(bytes);
    const artifact = storage.putArtifact({
      artifactId: `LOCAL-CHECKPOINT-${digest.slice(7)}`,
      bytes, mediaType: MEDIA_TYPE, expectedDigest: digest, provenance: [],
    });
    try {
      storage.initializeRun({
        runId: identity(key),
        state: { kind: "LocalHostCheckpointPointer", namespace, key, artifact },
        artifactRefs: [artifact],
      });
    } catch (error) {
      // A competing process may have won the SQLite unique-key insertion.
      // An unrelated I/O/transaction failure is never treated as success.
      if (error?.code !== "DR4922") throw error;
      const winner = read(key);
      if (winner) return winner;
      throw error;
    }
    const persisted = read(key);
    if (!persisted) fail("checkpoint insertion was not durably observable", "DR4931");
    return persisted;
  };
  return Object.freeze({
    get(key) { return read(key)?.value; },
    put(key, value) {
      const expected = encode(key, value);
      const winner = storeBytesIfAbsent(key, expected);
      if (!winner.bytes.equals(expected)) fail("checkpoint key already binds different bytes", "DR4932");
      return winner.value;
    },
    putIfAbsent(key, value) { return storeBytesIfAbsent(key, encode(key, value)).value; },
  });
}
