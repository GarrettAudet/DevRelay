import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateLifecycleRunReportArtifact } from "./lifecycle-run-report-artifact-validator.mjs";

const VERSION = "devrelay.dev/v1alpha1";
const CHECKPOINT_KIND = "RunLedgerCheckpoint";
const forbiddenClaims = new Set(["adapterSelection", "approval", "evidenceSatisfaction", "gateDecision", "graphMutation", "graphOperations", "nextOperation", "progression", "routeDecision", "workflowMutation"]);

export class RunLedgerError extends Error {
  constructor(message, code = "DR4410") {
    super(`run ledger rejected append: ${message}`);
    this.name = "RunLedgerError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new RunLedgerError(message, code); };
const clone = value => structuredClone(value);

function rejectAuthority(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenClaims.has(key)) fail(`${key} is forbidden workflow authority`);
    rejectAuthority(child);
  }
}

function checkpointMaterial(checkpoint) {
  const { checkpointDigest, ...material } = checkpoint;
  return material;
}

export function verifyRunLedgerCheckpoint(checkpoint, { predecessor } = {}) {
  if (!checkpoint || checkpoint.apiVersion !== VERSION || checkpoint.kind !== CHECKPOINT_KIND) fail("invalid checkpoint envelope");
  if (!Array.isArray(checkpoint.records) || checkpoint.records.length === 0) fail("checkpoint requires records");
  if (checkpoint.recordCount !== checkpoint.records.length) fail("record count drift");
  if (checkpoint.checkpointDigest !== canonicalJsonDigest(checkpointMaterial(checkpoint))) fail("checkpoint bytes or digest drift");
  if (checkpoint.predecessorCheckpointDigest !== null && typeof checkpoint.predecessorCheckpointDigest !== "string") fail("invalid predecessor checkpoint digest");
  if (predecessor !== undefined) {
    verifyRunLedgerCheckpoint(predecessor);
    if (checkpoint.predecessorCheckpointDigest !== predecessor.checkpointDigest) fail("wrong predecessor checkpoint");
    if (checkpoint.runId !== predecessor.runId) fail("cross-run predecessor checkpoint");
    if (checkpoint.records.length <= predecessor.records.length) fail("append must extend predecessor history");
    for (const [index, record] of predecessor.records.entries()) {
      if (canonicalJson(checkpoint.records[index]) !== canonicalJson(record)) fail("predecessor history was omitted, mutated, or reordered");
    }
  }
  const identities = new Set();
  for (const [index, record] of checkpoint.records.entries()) {
    if (record.sequence !== index) fail("record ordering drift");
    if (identities.has(record.factId)) fail(`duplicate fact identity ${record.factId}`);
    identities.add(record.factId);
    if (record.bytesDigest !== sha256Digest(Buffer.from(record.bytesBase64, "base64"))) fail(`record bytes drift for ${record.factId}`);
    const fact = JSON.parse(Buffer.from(record.bytesBase64, "base64").toString("utf8"));
    if (canonicalJson(fact) !== Buffer.from(record.bytesBase64, "base64").toString("utf8")) fail(`record ${record.factId} is not canonical JSON`);
    validateLifecycleRunReportArtifact(fact);
    if (fact.kind !== "RunWorkflowFact" || fact.runId !== checkpoint.runId || fact.factId !== record.factId || fact.factDigest !== record.factDigest) fail(`record lineage drift for ${record.factId}`);
  }
  return checkpoint;
}

export function createRunLedgerCheckpoint({ runId, facts, predecessor } = {}) {
  if (typeof runId !== "string" || runId.length === 0) fail("runId is required");
  if (!Array.isArray(facts) || facts.length === 0) fail("at least one workflow fact is required");
  if (predecessor !== undefined) {
    verifyRunLedgerCheckpoint(predecessor);
    if (predecessor.runId !== runId) fail("cross-run predecessor checkpoint");
  }
  const priorRecords = predecessor === undefined ? [] : predecessor.records.map(clone);
  const seen = new Set(priorRecords.map(record => record.factId));
  const appendedRecords = facts.map((input, offset) => {
    const fact = clone(input);
    rejectAuthority(fact);
    validateLifecycleRunReportArtifact(fact);
    if (fact.kind !== "RunWorkflowFact") fail("only RunWorkflowFact records may enter the workflow ledger");
    if (fact.runId !== runId) fail(`stale or cross-run fact ${fact.factId}`);
    if (seen.has(fact.factId)) fail(`duplicate or divergent fact identity ${fact.factId}`);
    seen.add(fact.factId);
    const bytes = Buffer.from(canonicalJson(fact), "utf8");
    const sequence = priorRecords.length + offset;
    return { sequence, factId: fact.factId, factDigest: fact.factDigest, bytesDigest: sha256Digest(bytes), bytesBase64: bytes.toString("base64") };
  });
  const records = [...priorRecords, ...appendedRecords];
  const body = { apiVersion: VERSION, kind: CHECKPOINT_KIND, runId, predecessorCheckpointDigest: predecessor?.checkpointDigest ?? null, recordCount: records.length, records, authority: "append-only-recording" };
  const checkpoint = Object.freeze({ ...body, checkpointDigest: canonicalJsonDigest(body) });
  verifyRunLedgerCheckpoint(checkpoint, predecessor === undefined ? {} : { predecessor });
  return checkpoint;
}

export function createRunLedger({ store, currentCheckpointDigest = null } = {}) {
  const records = store ?? new Map();
  let headDigest = currentCheckpointDigest;
  const get = async digest => typeof records.get === "function" ? records.get(digest) : undefined;
  const put = async (digest, checkpoint) => {
    if (typeof records.set !== "function") fail("ledger store must provide set", "DR4411");
    records.set(digest, clone(checkpoint));
  };
  return Object.freeze({
    async append(input) {
      const suppliedPredecessor = input?.predecessorCheckpointDigest ?? null;
      const predecessor = suppliedPredecessor === null ? undefined : await get(suppliedPredecessor);
      if (suppliedPredecessor !== null && predecessor === undefined) {
        if (suppliedPredecessor !== headDigest) fail("append does not bind the exact current checkpoint");
        fail("current predecessor checkpoint not found", "DR4412");
      }
      if (predecessor !== undefined) verifyRunLedgerCheckpoint(predecessor);
      const checkpoint = createRunLedgerCheckpoint({ runId: input?.runId, facts: input?.facts, predecessor });
      const existing = await get(checkpoint.checkpointDigest);
      if (existing !== undefined) {
        verifyRunLedgerCheckpoint(existing);
        if (canonicalJson(existing) !== canonicalJson(checkpoint)) fail("duplicate checkpoint digest has divergent bytes");
        return Object.freeze({ checkpoint: clone(existing), checkpointDigest: existing.checkpointDigest, replayed: true });
      }
      if (suppliedPredecessor !== headDigest) fail(headDigest === null ? "genesis append must not claim a predecessor" : "append does not bind the exact current checkpoint");
      await put(checkpoint.checkpointDigest, checkpoint);
      const persisted = await get(checkpoint.checkpointDigest);
      if (persisted === undefined || canonicalJson(persisted) !== canonicalJson(checkpoint)) fail("checkpoint was not durably stored", "DR4411");
      verifyRunLedgerCheckpoint(persisted);
      headDigest = persisted.checkpointDigest;
      return Object.freeze({ checkpoint: clone(persisted), checkpointDigest: persisted.checkpointDigest, replayed: false });
    },
    async replay(checkpointDigest) {
      const checkpoint = await get(checkpointDigest);
      if (checkpoint === undefined) fail("checkpoint not found", "DR4412");
      verifyRunLedgerCheckpoint(checkpoint);
      return Object.freeze({ checkpoint: clone(checkpoint), checkpointDigest, replayed: true });
    },
    async current() {
      if (headDigest === null) return null;
      const checkpoint = await get(headDigest);
      if (checkpoint === undefined) fail("current checkpoint not found", "DR4412");
      verifyRunLedgerCheckpoint(checkpoint);
      return Object.freeze({ checkpoint: clone(checkpoint), checkpointDigest: headDigest });
    },
  });
}
