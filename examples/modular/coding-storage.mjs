import { createLocalHostStorage } from "../../src/local-host-storage.mjs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";

/** Adapt the existing durable host to Core's artifact and checkpoint ports. */
export function createCodingStorage(rootDirectory) {
  const storage = createLocalHostStorage({ rootDirectory });
  let closed = false;
  function find(key) {
    try { return storage.readRun(key).state; }
    catch (error) { if (error.code === "DR4920") return undefined; throw error; }
  }
  function bind(key, state, refs = []) {
    const existing = find(key);
    if (existing !== undefined) {
      if (canonicalJson(existing) !== canonicalJson(state)) throw new Error("Stored request or checkpoint identity is bound to different content: " + key);
      return existing;
    }
    storage.initializeRun({ runId: key, state, artifactRefs: refs });
    return state;
  }
  function putBytes(bytes, schema, metadata = {}) {
    const digest = sha256Digest(bytes);
    const stored = storage.putArtifact({ artifactId: "bytes-" + digest.slice(7), bytes,
      mediaType: "application/octet-stream" });
    const ref = schema === undefined ? { ...metadata, digest } : { artifactId: metadata.artifactId ?? "artifact-" + digest.slice(7),
      schema, mediaType: metadata.mediaType ?? "application/json", digest,
      uri: metadata.uri ?? "artifact://modular-coding/" + digest.slice(7) };
    bind("artifact:" + canonicalJsonDigest(ref), { ref, stored }, [stored]);
    return ref;
  }
  function load(ref) {
    const entry = find("artifact:" + canonicalJsonDigest(ref));
    if (!entry) throw new Error("Unknown exact artifact: " + ref.artifactId);
    return storage.getArtifact(entry.stored);
  }
  return {
    bind, putBytes, load,
    put(value, schema) { return putBytes(Buffer.from(canonicalJson(value) + "\n"), schema); },
    json(ref) { return JSON.parse(load(ref).toString("utf8")); },
    artifacts: { load },
    checkpoints: {
      async get(key) { return find("checkpoint:" + key); },
      async put(key, value) { bind("checkpoint:" + key, value); },
    },
    assertEffectAvailable(key) {
      if (find("effect:" + key)) throw new Error("Uncertain interrupted effect is quarantined: " + key);
    },
    beginEffect(key) {
      // A durable marker without the Core result is uncertainty, not permission to retry.
      if (find("effect:" + key)) throw new Error("Uncertain interrupted effect is quarantined: " + key);
      storage.initializeRun({ runId: "effect:" + key, state: { phase: "effect-started" } });
    },
    close() { if (!closed) { storage.close(); closed = true; } },
  };
}
