import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";

export class LocalHostStorageError extends Error {
  constructor(message, code = "DR4910", cause) {
    super(`local host storage: ${message}`, cause ? { cause } : undefined);
    this.name = "LocalHostStorageError";
    this.code = code;
  }
}

const fail = (message, code, cause) => {
  throw new LocalHostStorageError(message, code, cause);
};

const digestPattern = /^sha256:[0-9a-f]{64}$/u;

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required`, "DR4911");
  return value;
}

function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    fail(`${label} contains invalid JSON`, "DR4912", error);
  }
}

function validateArtifactRef(ref, label = "artifact reference") {
  if (
    !ref ||
    typeof ref !== "object" ||
    Array.isArray(ref) ||
    typeof ref.artifactId !== "string" ||
    !ref.artifactId ||
    !digestPattern.test(ref.digest) ||
    typeof ref.mediaType !== "string" ||
    !ref.mediaType ||
    !Number.isSafeInteger(ref.byteCount) ||
    ref.byteCount < 0
  ) {
    fail(`${label} is malformed`, "DR4913");
  }
  return structuredClone(ref);
}

function normalizeRefs(refs, label) {
  if (!Array.isArray(refs)) fail(`${label} must be an array`, "DR4913");
  const seen = new Set();
  return refs
    .map((ref, index) => validateArtifactRef(ref, `${label}[${index}]`))
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId, "en"))
    .map((ref) => {
      const identity = `${ref.artifactId}\u0000${ref.digest}`;
      if (seen.has(identity)) fail(`${label} contains a duplicate`, "DR4913");
      seen.add(identity);
      return ref;
    });
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

export function createLocalHostStorage({
  rootDirectory,
  clock = () => Date.now(),
  failureInjector = () => {},
} = {}) {
  requiredText(rootDirectory, "rootDirectory");
  if (!isAbsolute(rootDirectory)) fail("rootDirectory must be absolute", "DR4914");
  if (typeof clock !== "function" || typeof failureInjector !== "function") {
    fail("clock and failureInjector must be functions", "DR4914");
  }

  const root = resolve(rootDirectory);
  const databasePath = join(root, "state.sqlite");
  const artifactRoot = join(root, "artifacts", "sha256");
  mkdirSync(artifactRoot, { recursive: true });

  let database;
  try {
    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS artifacts (
        digest TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        media_type TEXT NOT NULL,
        byte_count INTEGER NOT NULL,
        provenance_json TEXT NOT NULL,
        relative_path TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        artifact_refs_json TEXT NOT NULL,
        approval_ref_json TEXT,
        checkpoint_ref_json TEXT,
        graph_ref_json TEXT,
        lease_owner TEXT,
        lease_token TEXT,
        lease_expires_at INTEGER,
        updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS transition_journal (
        entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        from_version INTEGER NOT NULL,
        to_version INTEGER NOT NULL,
        transition_json TEXT NOT NULL,
        artifact_refs_json TEXT NOT NULL,
        approval_ref_json TEXT,
        checkpoint_ref_json TEXT,
        graph_ref_json TEXT,
        committed_at INTEGER NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(run_id)
      ) STRICT;
    `);
    database
      .prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)")
      .run(1, clock());
    const migration = database
      .prepare("SELECT MAX(version) AS version FROM schema_migrations")
      .get();
    if (migration?.version !== 1) {
      fail("database schema version is unsupported", "DR4928");
    }
  } catch (error) {
    try {
      database?.close();
    } catch {}
    fail("database initialization failed", "DR4915", error);
  }

  let closed = false;
  const ensureOpen = () => {
    if (closed) fail("storage is closed", "DR4916");
  };

  const artifactPath = (digest) => {
    if (!digestPattern.test(digest)) fail("artifact digest is malformed", "DR4913");
    const hex = digest.slice(7);
    return join(artifactRoot, hex.slice(0, 2), hex.slice(2));
  };

  const rowForDigest = (digest) =>
    database.prepare("SELECT * FROM artifacts WHERE digest = ?").get(digest);

  const verifyStoredArtifact = (ref) => {
    const normalized = validateArtifactRef(ref);
    const row = rowForDigest(normalized.digest);
    if (!row) fail(`artifact ${normalized.digest} is not registered`, "DR4917");
    if (
      row.artifact_id !== normalized.artifactId ||
      row.media_type !== normalized.mediaType ||
      row.byte_count !== normalized.byteCount
    ) {
      fail(`artifact metadata mismatch for ${normalized.digest}`, "DR4918");
    }
    const absolute = resolve(root, row.relative_path);
    if (relative(root, absolute).startsWith("..") || !existsSync(absolute)) {
      fail(`artifact bytes are missing for ${normalized.digest}`, "DR4917");
    }
    const bytes = readFileSync(absolute);
    if (bytes.byteLength !== row.byte_count || sha256Digest(bytes) !== row.digest) {
      fail(`artifact bytes drifted for ${normalized.digest}`, "DR4919");
    }
    return { ref: normalized, row, bytes };
  };

  const verifyAllRefs = (refs) => {
    for (const ref of refs) verifyStoredArtifact(ref);
  };

  const transaction = (action) => {
    ensureOpen();
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {}
      throw error;
    }
  };

  const readRun = (runId) => {
    ensureOpen();
    requiredText(runId, "runId");
    const row = database.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId);
    if (!row) fail(`run ${runId} does not exist`, "DR4920");
    return immutable({
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "LocalHostRunState",
      runId: row.run_id,
      version: row.version,
      state: parseJson(row.state_json, "run state"),
      artifactRefs: parseJson(row.artifact_refs_json, "artifact refs"),
      approvalRef: row.approval_ref_json ? parseJson(row.approval_ref_json, "approval ref") : null,
      checkpointRef: row.checkpoint_ref_json ? parseJson(row.checkpoint_ref_json, "checkpoint ref") : null,
      graphRef: row.graph_ref_json ? parseJson(row.graph_ref_json, "graph ref") : null,
      lease: row.lease_owner
        ? {
            owner: row.lease_owner,
            token: row.lease_token,
            expiresAt: row.lease_expires_at,
          }
        : null,
      updatedAt: row.updated_at,
    });
  };

  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "LocalHostStorage",
    interfaceIntentId: "IF-SIM-HOST-STATE",
    rootDirectory: root,
    databasePath,

    putArtifact({ artifactId, bytes, mediaType, provenance = [], expectedDigest } = {}) {
      ensureOpen();
      requiredText(artifactId, "artifactId");
      requiredText(mediaType, "mediaType");
      if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
        fail("artifact bytes must be a Buffer or Uint8Array", "DR4913");
      }
      if (!Array.isArray(provenance)) fail("provenance must be an array", "DR4913");
      const exactBytes = Buffer.from(bytes);
      const digest = sha256Digest(exactBytes);
      if (expectedDigest !== undefined && expectedDigest !== digest) {
        fail("artifact expected digest does not match bytes", "DR4919");
      }
      const existing = rowForDigest(digest);
      const ref = { artifactId, digest, mediaType, byteCount: exactBytes.byteLength };
      if (existing) {
        const existingRef = {
          artifactId: existing.artifact_id,
          digest,
          mediaType: existing.media_type,
          byteCount: existing.byte_count,
        };
        if (canonicalJson(existingRef) !== canonicalJson(ref)) {
          fail("an existing digest cannot acquire substituted metadata", "DR4918");
        }
        verifyStoredArtifact(ref);
        return immutable(ref);
      }

      const target = artifactPath(digest);
      mkdirSync(resolve(target, ".."), { recursive: true });
      const temporary = `${target}.tmp-${process.pid}-${sha256Hex(Buffer.from(`${artifactId}:${clock()}`)).slice(0, 12)}`;
      let createdTarget = false;
      try {
        writeFileSync(temporary, exactBytes, { flag: "wx" });
        failureInjector({ boundary: "before-artifact-rename", digest });
        try {
          renameSync(temporary, target);
          createdTarget = true;
        } catch (error) {
          if (!existsSync(target)) throw error;
          rmSync(temporary, { force: true });
          const targetBytes = readFileSync(target);
          if (sha256Digest(targetBytes) !== digest) throw error;
        }
        failureInjector({ boundary: "after-artifact-rename-before-database", digest });
        transaction(() => {
          database
            .prepare(`INSERT INTO artifacts(
              digest, artifact_id, media_type, byte_count, provenance_json,
              relative_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`) 
            .run(
              digest,
              artifactId,
              mediaType,
              exactBytes.byteLength,
              canonicalJson(provenance),
              relative(root, target),
              clock(),
            );
        });
      } catch (error) {
        rmSync(temporary, { force: true });
        if (createdTarget && !rowForDigest(digest)) rmSync(target, { force: true });
        if (error instanceof LocalHostStorageError) throw error;
        fail("artifact persistence failed atomically", "DR4921", error);
      }
      verifyStoredArtifact(ref);
      return immutable(ref);
    },

    getArtifact(ref) {
      ensureOpen();
      const verified = verifyStoredArtifact(ref);
      return Buffer.from(verified.bytes);
    },

    initializeRun({ runId, state, artifactRefs = [] } = {}) {
      ensureOpen();
      requiredText(runId, "runId");
      const refs = normalizeRefs(artifactRefs, "artifactRefs");
      verifyAllRefs(refs);
      const now = clock();
      try {
        transaction(() => {
          database
            .prepare(`INSERT INTO runs(
              run_id, version, state_json, artifact_refs_json, updated_at
            ) VALUES (?, 0, ?, ?, ?)`) 
            .run(runId, canonicalJson(state), canonicalJson(refs), now);
        });
      } catch (error) {
        if (error instanceof LocalHostStorageError) throw error;
        fail(`run ${runId} already exists or could not be initialized`, "DR4922", error);
      }
      return readRun(runId);
    },

    readRun,

    listRuns({ prefix = "" } = {}) {
      ensureOpen();
      if (typeof prefix !== "string") fail("run prefix must be a string", "DR4911");
      const rows = prefix
        ? database.prepare("SELECT run_id FROM runs WHERE run_id LIKE ? ORDER BY run_id").all(`${prefix}%`)
        : database.prepare("SELECT run_id FROM runs ORDER BY run_id").all();
      return immutable(rows.map(({ run_id: runId }) => readRun(runId)));
    },

    acquireLease({ runId, owner, expectedVersion, durationMilliseconds = 30_000 } = {}) {
      ensureOpen();
      requiredText(runId, "runId");
      requiredText(owner, "lease owner");
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        fail("expectedVersion is invalid", "DR4923");
      }
      if (!Number.isSafeInteger(durationMilliseconds) || durationMilliseconds <= 0) {
        fail("durationMilliseconds is invalid", "DR4924");
      }
      const now = clock();
      const expiresAt = now + durationMilliseconds;
      let lease;
      transaction(() => {
        const row = database.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId);
        if (!row) fail(`run ${runId} does not exist`, "DR4920");
        if (row.version !== expectedVersion) fail("stale expected state version", "DR4923");
        if (row.lease_owner && row.lease_expires_at > now && row.lease_owner !== owner) {
          fail("run has an active lease owned by another executor", "DR4924");
        }
        const tokenMaterial = { runId, owner, version: row.version, acquiredAt: now, expiresAt };
        const token = canonicalJsonDigest(tokenMaterial);
        database
          .prepare(`UPDATE runs SET lease_owner = ?, lease_token = ?,
            lease_expires_at = ?, updated_at = ? WHERE run_id = ? AND version = ?`)
          .run(owner, token, expiresAt, now, runId, expectedVersion);
        lease = { owner, token, expiresAt };
      });
      return immutable(lease);
    },

    commitTransition({
      runId,
      expectedVersion,
      leaseToken,
      transition,
      nextState,
      artifactRefs = [],
      approvalRef = null,
      checkpointRef = null,
      graphRef = null,
    } = {}) {
      ensureOpen();
      requiredText(runId, "runId");
      requiredText(leaseToken, "leaseToken");
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        fail("expectedVersion is invalid", "DR4923");
      }
      if (!transition || typeof transition !== "object" || Array.isArray(transition)) {
        fail("transition must be an object", "DR4925");
      }
      const refs = normalizeRefs(artifactRefs, "artifactRefs");
      const optionalRefs = [approvalRef, checkpointRef, graphRef]
        .filter((ref) => ref !== null)
        .map((ref, index) => validateArtifactRef(ref, `authoritativeRef[${index}]`));
      verifyAllRefs([...refs, ...optionalRefs]);
      const now = clock();
      const nextVersion = expectedVersion + 1;
      transaction(() => {
        const row = database.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId);
        if (!row) fail(`run ${runId} does not exist`, "DR4920");
        if (row.version !== expectedVersion) fail("stale expected state version", "DR4923");
        if (row.lease_token !== leaseToken || !row.lease_owner || row.lease_expires_at <= now) {
          fail("lease is missing, substituted, or expired", "DR4924");
        }
        failureInjector({ boundary: "before-state-update", runId, expectedVersion });
        const result = database
          .prepare(`UPDATE runs SET version = ?, state_json = ?, artifact_refs_json = ?,
            approval_ref_json = ?, checkpoint_ref_json = ?, graph_ref_json = ?,
            updated_at = ? WHERE run_id = ? AND version = ? AND lease_token = ?`)
          .run(
            nextVersion,
            canonicalJson(nextState),
            canonicalJson(refs),
            approvalRef ? canonicalJson(approvalRef) : null,
            checkpointRef ? canonicalJson(checkpointRef) : null,
            graphRef ? canonicalJson(graphRef) : null,
            now,
            runId,
            expectedVersion,
            leaseToken,
          );
        if (result.changes !== 1) fail("state compare-and-swap failed", "DR4923");
        failureInjector({ boundary: "after-state-update-before-journal", runId, nextVersion });
        database
          .prepare(`INSERT INTO transition_journal(
            run_id, from_version, to_version, transition_json,
            artifact_refs_json, approval_ref_json, checkpoint_ref_json,
            graph_ref_json, committed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
          .run(
            runId,
            expectedVersion,
            nextVersion,
            canonicalJson(transition),
            canonicalJson(refs),
            approvalRef ? canonicalJson(approvalRef) : null,
            checkpointRef ? canonicalJson(checkpointRef) : null,
            graphRef ? canonicalJson(graphRef) : null,
            now,
          );
        failureInjector({ boundary: "before-state-commit", runId, nextVersion });
      });
      return readRun(runId);
    },

    releaseLease({ runId, leaseToken } = {}) {
      ensureOpen();
      requiredText(runId, "runId");
      requiredText(leaseToken, "leaseToken");
      transaction(() => {
        const result = database
          .prepare(`UPDATE runs SET lease_owner = NULL, lease_token = NULL,
            lease_expires_at = NULL, updated_at = ?
            WHERE run_id = ? AND lease_token = ?`)
          .run(clock(), runId, leaseToken);
        if (result.changes !== 1) fail("lease token is missing or substituted", "DR4924");
      });
      return readRun(runId);
    },

    readTransitionJournal(runId) {
      ensureOpen();
      requiredText(runId, "runId");
      return immutable(
        database
          .prepare("SELECT * FROM transition_journal WHERE run_id = ? ORDER BY entry_id")
          .all(runId)
          .map((row) => ({
            entryId: row.entry_id,
            runId: row.run_id,
            fromVersion: row.from_version,
            toVersion: row.to_version,
            transition: parseJson(row.transition_json, "transition"),
            artifactRefs: parseJson(row.artifact_refs_json, "artifact refs"),
            approvalRef: row.approval_ref_json ? parseJson(row.approval_ref_json, "approval ref") : null,
            checkpointRef: row.checkpoint_ref_json ? parseJson(row.checkpoint_ref_json, "checkpoint ref") : null,
            graphRef: row.graph_ref_json ? parseJson(row.graph_ref_json, "graph ref") : null,
            committedAt: row.committed_at,
          })),
      );
    },

    verifyIntegrity() {
      ensureOpen();
      const result = database.prepare("PRAGMA integrity_check").get();
      const verdict = Object.values(result ?? {})[0];
      if (verdict !== "ok") fail("database integrity check failed", "DR4926");
      const rows = database.prepare("SELECT * FROM artifacts ORDER BY digest").all();
      const registeredPaths = new Set();
      for (const row of rows) {
        const ref = {
          artifactId: row.artifact_id,
          digest: row.digest,
          mediaType: row.media_type,
          byteCount: row.byte_count,
        };
        verifyStoredArtifact(ref);
        registeredPaths.add(resolve(root, row.relative_path));
      }
      const orphaned = listFiles(artifactRoot)
        .map((path) => resolve(path))
        .filter((path) => !registeredPaths.has(path));
      if (orphaned.length > 0) fail("content-addressed store contains orphaned bytes", "DR4927");
      return immutable({
        database: "ok",
        artifacts: "ok",
        artifactCount: rows.length,
        schemaVersion: 1,
      });
    },

    reconcile() {
      ensureOpen();
      const integrity = this.verifyIntegrity();
      const now = clock();
      const expiredLeases = database
        .prepare(`SELECT run_id, lease_owner, lease_expires_at FROM runs
          WHERE lease_owner IS NOT NULL AND lease_expires_at <= ? ORDER BY run_id`)
        .all(now)
        .map((row) => ({
          runId: row.run_id,
          owner: row.lease_owner,
          expiredAt: row.lease_expires_at,
        }));
      return immutable({
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "LocalHostRecoveryReport",
        observedAt: now,
        integrity,
        expiredLeases,
        outcome: "reconciled",
      });
    },

    close() {
      if (!closed) {
        database.close();
        closed = true;
      }
    },
  });
}
