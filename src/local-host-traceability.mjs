import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import {
  TRACEABILITY_GRAPH_SCHEMA, TRACEABILITY_GRAPH_MEDIA_TYPE,
  TRACEABILITY_UPDATE_SCHEMA, TRACEABILITY_UPDATE_MEDIA_TYPE,
  TRACEABILITY_RECEIPT_SCHEMA, TRACEABILITY_RECEIPT_MEDIA_TYPE,
  validateTraceabilityGraphSnapshot, validateTraceabilityUpdate, validateTraceabilityMergeReceipt,
} from "./traceability-artifact-validator.mjs";

const schema = (name) => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const resultSchema = schema("module-result.schema.json");
const validateHead = compileArtifactSchema(schema("local-host-traceability-head.schema.json"), [resultSchema]);
const validateCommit = compileArtifactSchema(schema("local-host-traceability-commit.schema.json"), [resultSchema]);
const validateRef = compileArtifactSchema({ $ref: `${resultSchema.$id}#/$defs/artifactRef` }, [resultSchema]);
const artifactKinds = new Map([
  [TRACEABILITY_GRAPH_SCHEMA, [TRACEABILITY_GRAPH_MEDIA_TYPE, validateTraceabilityGraphSnapshot]],
  [TRACEABILITY_UPDATE_SCHEMA, [TRACEABILITY_UPDATE_MEDIA_TYPE, validateTraceabilityUpdate]],
  [TRACEABILITY_RECEIPT_SCHEMA, [TRACEABILITY_RECEIPT_MEDIA_TYPE, validateTraceabilityMergeReceipt]],
]);
const equal = (left, right) => canonicalJson(left) === canonicalJson(right);
const freeze = (value) => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const clone = (value) => freeze(structuredClone(value));

export class LocalHostTraceabilityError extends Error {
  constructor(message, code = "DR4940") {
    super(`local host traceability: ${message}`);
    this.name = "LocalHostTraceabilityError";
    this.code = code;
  }
}
const fail = (message, code) => { throw new LocalHostTraceabilityError(message, code); };

// A host storage implementation, not a contributor or graph authority. Only
// the configured trusted graph service may produce the updates committed here.
export function createLocalHostTraceabilityStore({ storage, namespace, graphId } = {}) {
  for (const value of [namespace, graphId]) {
    if (typeof value !== "string" || !value.trim()) fail("namespace and graphId must be explicit nonempty strings");
  }
  if (namespace.length > 256) fail("namespace exceeds its contract limit");
  for (const method of ["readRun", "initializeRun", "acquireLease", "releaseLease", "commitTransition", "readTransitionJournal"]) {
    if (typeof storage?.[method] !== "function") fail("an explicitly opened LocalHostStorage is required");
  }
  const identity = canonicalJsonDigest({ namespace, graphId }).slice(7);
  const runId = `local-traceability:${identity}`;
  const checkpoints = createLocalHostCheckpointStore({ storage, namespace: `local-traceability/${identity}` });
  const leaseOwner = `traceability-store:${randomUUID()}`;
  const assertGraph = (id) => { if (id !== graphId) fail("graph identity was substituted", "DR4941"); };
  const assertRef = (ref) => { if (!validateRef(ref)) fail("invalid artifact reference", "DR4941"); };
  const artifactKey = (ref) => {
    assertRef(ref);
    return `artifact:${canonicalJsonDigest({ schema: ref.schema, digest: ref.digest })}`;
  };
  const decode = (ref, bytes) => {
    assertRef(ref);
    const contract = artifactKinds.get(ref.schema);
    if (!contract || ref.mediaType !== contract[0] || sha256Digest(bytes) !== ref.digest) fail("artifact contract or raw digest drifted", "DR4941");
    let value;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { fail("artifact is not UTF-8 JSON", "DR4941"); }
    contract[1](value);
    assertGraph(value.graphId);
    return Object.freeze({ ref: clone(ref), bytes: Buffer.from(bytes), value: clone(value) });
  };
  const load = (ref) => {
    const entry = checkpoints.get(artifactKey(ref));
    if (!entry) fail("traceability artifact is unavailable", "TG_ARTIFACT_NOT_FOUND");
    if (Object.keys(entry).sort().join(",") !== "bytesBase64,ref" || !equal(entry.ref, ref) || typeof entry.bytesBase64 !== "string") fail("artifact identity was substituted", "DR4941");
    const bytes = Buffer.from(entry.bytesBase64, "base64");
    if (bytes.toString("base64") !== entry.bytesBase64) fail("artifact encoding drifted", "DR4941");
    return decode(ref, bytes);
  };
  const put = (entry) => {
    if (!Buffer.isBuffer(entry?.bytes) && !(entry?.bytes instanceof Uint8Array)) fail("artifact bytes are required");
    const loaded = decode(entry.ref, entry.bytes);
    if (!equal(loaded.value, entry.value)) fail("artifact value does not match exact bytes", "DR4941");
    checkpoints.put(artifactKey(entry.ref), { ref: loaded.ref, bytesBase64: loaded.bytes.toString("base64") });
    return loaded;
  };
  const readHead = () => {
    let run;
    try { run = storage.readRun(runId); }
    catch (error) { if (error?.code === "DR4920") return undefined; throw error; }
    if (run.runId !== runId || !validateHead(run.state) || run.state.namespace !== namespace || run.state.graphId !== graphId ||
        !Number.isSafeInteger(run.version) || run.version < 0 || run.artifactRefs.length !== 0 ||
        run.approvalRef !== null || run.checkpointRef !== null || run.graphRef !== null) fail("graph head pointer drifted", "DR4941");
    const head = load(run.state.headRef);
    if (head.ref.schema !== TRACEABILITY_GRAPH_SCHEMA || head.value.revision !== run.version) fail("graph head version drifted", "DR4941");
    if (run.version > 0) {
      const rows = storage.readTransitionJournal(runId, { toVersion: run.version });
      if (rows.length !== 1 || !equal(committedResult(rows[0], run.version).snapshotRef, head.ref)) fail("head does not match its atomic journal commit", "DR4941");
    }
    return { run, head };
  };
  const checkedResult = (result, updateRef, expectedHead) => {
    if (!result || Object.keys(result).sort().join(",") !== "diagnostics,disposition,receipt,receiptRef,snapshot,snapshotRef") fail("invalid merge result", "DR4941");
    const snapshot = load(result.snapshotRef);
    const receipt = load(result.receiptRef);
    const update = load(updateRef);
    if (snapshot.ref.schema !== TRACEABILITY_GRAPH_SCHEMA || receipt.ref.schema !== TRACEABILITY_RECEIPT_SCHEMA || update.ref.schema !== TRACEABILITY_UPDATE_SCHEMA ||
        !equal(snapshot.value, result.snapshot) || !equal(receipt.value, result.receipt) ||
        !equal(receipt.value.update, updateRef) || !equal(receipt.value.resultGraph, result.snapshotRef) ||
        !equal(receipt.value.previousGraph, expectedHead) || !equal(snapshot.value.parentGraph, expectedHead) ||
        !equal(snapshot.value.lastAppliedUpdate, updateRef) || result.disposition !== receipt.value.disposition ||
        !equal(result.diagnostics, receipt.value.diagnostics)) fail("merge result bindings drifted", "DR4941");
    return clone(result);
  };
  const committedResult = (row, currentVersion) => {
    const transition = row.transition;
    if (row.runId !== runId || !Number.isSafeInteger(row.fromVersion) || row.toVersion !== row.fromVersion + 1 ||
        row.toVersion > currentVersion || row.fromVersion < 0 || !validateCommit(transition) || transition.id !== transition.updateRef.digest ||
        !equal(row.artifactRefs, []) || row.approvalRef !== null || row.checkpointRef !== null || row.graphRef !== null) fail("committed receipt journal drifted", "DR4941");
    const result = checkpoints.get(transition.resultKey);
    if (!result || transition.resultKey !== `result:${canonicalJsonDigest(result)}` || result.snapshot?.revision !== row.toVersion) fail("committed result checkpoint drifted", "DR4941");
    const previous = load(transition.expectedHead);
    if (previous.ref.schema !== TRACEABILITY_GRAPH_SCHEMA || previous.value.revision !== row.fromVersion) fail("committed parent version drifted", "DR4941");
    return checkedResult(result, transition.updateRef, transition.expectedHead);
  };
  const receipt = (updateRef) => {
    assertRef(updateRef);
    if (updateRef.schema !== TRACEABILITY_UPDATE_SCHEMA) fail("receipt lookup requires an update reference");
    const current = readHead();
    if (!current) return undefined;
    const rows = storage.readTransitionJournal(runId, { transitionId: updateRef.digest });
    if (rows.length === 0) return undefined;
    if (rows.length !== 1) fail("duplicate committed update identity", "DR4941");
    const result = committedResult(rows[0], current.run.version);
    if (!equal(result.receipt.update, updateRef)) fail("committed update reference was substituted", "DR4941");
    return result;
  };
  const store = {
    initialize(id, entry) {
      assertGraph(id);
      const prior = readHead();
      if (prior) return prior.head;
      const loaded = put(entry);
      if (loaded.ref.schema !== TRACEABILITY_GRAPH_SCHEMA || loaded.value.revision !== 0 || loaded.value.parentGraph !== null) fail("initialization requires the genesis graph");
      try {
        storage.initializeRun({ runId, state: { kind: "LocalHostTraceabilityHead", namespace, graphId, headRef: loaded.ref } });
      } catch (error) {
        if (error?.code !== "DR4922" || !readHead()) throw error;
      }
      return readHead().head;
    },
    capture(id) {
      assertGraph(id);
      const current = readHead();
      if (!current) fail("graph has not been initialized", "TG_GRAPH_NOT_FOUND");
      return current.head;
    },
    load,
    receipt,
    isAncestor(ancestorRef, descendantRef) {
      let cursor = load(descendantRef);
      const visited = new Set();
      while (cursor) {
        if (equal(cursor.ref, ancestorRef)) return true;
        if (visited.has(cursor.ref.digest)) fail("graph ancestry contains a cycle", "DR4941");
        visited.add(cursor.ref.digest);
        cursor = cursor.value.parentGraph === null ? null : load(cursor.value.parentGraph);
      }
      return false;
    },
    commit({ graphId: id, expectedHead, artifacts, updateRef, result }) {
      assertGraph(id);
      const prior = receipt(updateRef);
      if (prior) return prior;
      const current = readHead();
      if (!current || !equal(current.head.ref, expectedHead)) return undefined;
      if (!Array.isArray(artifacts)) fail("commit artifacts must be an array");
      for (const entry of artifacts) put(entry);
      const checked = checkedResult(result, updateRef, expectedHead);
      if (checked.snapshot.revision !== current.run.version + 1) fail("merge revision is not the next version", "DR4941");
      const resultKey = `result:${canonicalJsonDigest(checked)}`;
      checkpoints.put(resultKey, checked);
      let lease;
      try {
        lease = storage.acquireLease({ runId, owner: leaseOwner, expectedVersion: current.run.version });
        // Head and receipt visibility share ONE SQLite transaction. All bytes
        // are durable first; uncommitted candidate bytes are not an applied proof.
        storage.commitTransition({
          runId, expectedVersion: current.run.version, leaseToken: lease.token,
          transition: { kind: "LocalHostTraceabilityCommit", id: updateRef.digest, updateRef, expectedHead, resultKey },
          nextState: { kind: "LocalHostTraceabilityHead", namespace, graphId, headRef: checked.snapshotRef },
        });
      } catch (error) {
        if (error?.code === "DR4923") return receipt(updateRef);
        throw error;
      } finally {
        if (lease) storage.releaseLease({ runId, leaseToken: lease.token });
      }
      return receipt(updateRef);
    },
  };
  return Object.freeze(store);
}
