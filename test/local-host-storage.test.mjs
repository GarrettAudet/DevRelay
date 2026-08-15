import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  LocalHostStorageError,
  createLocalHostStorage,
} from "../src/local-host-storage.mjs";

function fixture(options = {}) {
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-host-storage-"));
  let now = 1_700_000_000_000;
  const storage = createLocalHostStorage({
    rootDirectory,
    clock: () => now,
    ...options,
  });
  return {
    rootDirectory,
    storage,
    advance(milliseconds) {
      now += milliseconds;
    },
    cleanup() {
      storage.close();
      rmSync(rootDirectory, { recursive: true, force: true });
    },
  };
}

function putJson(storage, artifactId, value) {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  return storage.putArtifact({
    artifactId,
    bytes,
    mediaType: "application/json",
    provenance: [{ source: "test" }],
  });
}

test("SQLite state and CAS bytes survive restart with exact journal lineage", () => {
  const fx = fixture();
  try {
    const input = putJson(fx.storage, "ART-INPUT", { value: 1 });
    const checkpoint = putJson(fx.storage, "ART-CHECKPOINT", { step: 1 });
    const graph = putJson(fx.storage, "ART-GRAPH", { revision: 1 });
    fx.storage.initializeRun({
      runId: "RUN-1",
      state: { stage: "ready" },
      artifactRefs: [input],
    });
    const lease = fx.storage.acquireLease({
      runId: "RUN-1",
      owner: "desktop-executor",
      expectedVersion: 0,
    });
    const committed = fx.storage.commitTransition({
      runId: "RUN-1",
      expectedVersion: 0,
      leaseToken: lease.token,
      transition: { from: "ready", to: "executed" },
      nextState: { stage: "executed" },
      artifactRefs: [input],
      checkpointRef: checkpoint,
      graphRef: graph,
    });
    assert.equal(committed.version, 1);
    assert.deepEqual(committed.state, { stage: "executed" });
    assert.deepEqual(fx.storage.getArtifact(input), Buffer.from('{"value":1}'));
    assert.deepEqual(fx.storage.verifyIntegrity(), {
      database: "ok",
      artifacts: "ok",
      artifactCount: 3,
      schemaVersion: 1,
    });
    fx.storage.close();

    const reopened = createLocalHostStorage({
      rootDirectory: fx.rootDirectory,
      clock: () => 1_700_000_000_000,
    });
    try {
      assert.equal(reopened.readRun("RUN-1").version, 1);
      const journal = reopened.readTransitionJournal("RUN-1");
      assert.equal(journal.length, 1);
      assert.deepEqual(journal[0].transition, { from: "ready", to: "executed" });
      assert.equal(journal[0].checkpointRef.digest, checkpoint.digest);
      assert.equal(journal[0].graphRef.digest, graph.digest);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(fx.rootDirectory, { recursive: true, force: true });
  }
});

test("stale versions, invalid leases, and missing artifacts fail closed", () => {
  const fx = fixture();
  try {
    fx.storage.initializeRun({ runId: "RUN-2", state: { stage: "ready" } });
    const lease = fx.storage.acquireLease({
      runId: "RUN-2",
      owner: "owner-a",
      expectedVersion: 0,
    });
    assert.throws(
      () =>
        fx.storage.acquireLease({
          runId: "RUN-2",
          owner: "owner-b",
          expectedVersion: 0,
        }),
      (error) => error instanceof LocalHostStorageError && error.code === "DR4924",
    );
    const missing = {
      artifactId: "MISSING",
      digest: `sha256:${"0".repeat(64)}`,
      mediaType: "application/json",
      byteCount: 1,
    };
    assert.throws(
      () =>
        fx.storage.commitTransition({
          runId: "RUN-2",
          expectedVersion: 0,
          leaseToken: lease.token,
          transition: { to: "bad" },
          nextState: { stage: "bad" },
          artifactRefs: [missing],
        }),
      (error) => error instanceof LocalHostStorageError && error.code === "DR4917",
    );
    assert.equal(fx.storage.readRun("RUN-2").version, 0);
    assert.throws(
      () =>
        fx.storage.commitTransition({
          runId: "RUN-2",
          expectedVersion: 1,
          leaseToken: lease.token,
          transition: { to: "bad" },
          nextState: { stage: "bad" },
        }),
      (error) => error instanceof LocalHostStorageError && error.code === "DR4923",
    );
  } finally {
    fx.cleanup();
  }
});

test("transaction failure injection rolls back state and journal together", () => {
  let failBoundary = false;
  const fx = fixture({
    failureInjector({ boundary }) {
      if (failBoundary && boundary === "after-state-update-before-journal") {
        throw new Error("injected crash");
      }
    },
  });
  try {
    fx.storage.initializeRun({ runId: "RUN-3", state: { stage: "ready" } });
    const lease = fx.storage.acquireLease({
      runId: "RUN-3",
      owner: "desktop-executor",
      expectedVersion: 0,
    });
    failBoundary = true;
    assert.throws(() =>
      fx.storage.commitTransition({
        runId: "RUN-3",
        expectedVersion: 0,
        leaseToken: lease.token,
        transition: { to: "executed" },
        nextState: { stage: "executed" },
      }),
    );
    assert.equal(fx.storage.readRun("RUN-3").version, 0);
    assert.deepEqual(fx.storage.readTransitionJournal("RUN-3"), []);
  } finally {
    fx.cleanup();
  }
});

test("artifact digest mismatch and post-write failure leave no registered or orphaned bytes", () => {
  let inject = false;
  const fx = fixture({
    failureInjector({ boundary }) {
      if (inject && boundary === "after-artifact-rename-before-database") {
        throw new Error("injected crash");
      }
    },
  });
  try {
    assert.throws(
      () =>
        fx.storage.putArtifact({
          artifactId: "ART-BAD",
          bytes: Buffer.from("exact"),
          mediaType: "text/plain",
          expectedDigest: `sha256:${"0".repeat(64)}`,
        }),
      (error) => error instanceof LocalHostStorageError && error.code === "DR4919",
    );
    inject = true;
    assert.throws(() =>
      fx.storage.putArtifact({
        artifactId: "ART-CRASH",
        bytes: Buffer.from("crash-window"),
        mediaType: "text/plain",
      }),
    );
    assert.deepEqual(fx.storage.verifyIntegrity(), {
      database: "ok",
      artifacts: "ok",
      artifactCount: 0,
      schemaVersion: 1,
    });
  } finally {
    fx.cleanup();
  }
});

test("tampered CAS bytes are rejected by retrieval and recovery", () => {
  const fx = fixture();
  try {
    const ref = putJson(fx.storage, "ART-TAMPER", { exact: true });
    const hex = ref.digest.slice(7);
    const path = join(
      fx.rootDirectory,
      "artifacts",
      "sha256",
      hex.slice(0, 2),
      hex.slice(2),
    );
    assert.equal(readFileSync(path, "utf8"), '{"exact":true}');
    writeFileSync(path, "substituted", "utf8");
    assert.throws(
      () => fx.storage.getArtifact(ref),
      (error) => error instanceof LocalHostStorageError && error.code === "DR4919",
    );
    assert.throws(
      () => fx.storage.reconcile(),
      (error) => error instanceof LocalHostStorageError && error.code === "DR4919",
    );
  } finally {
    fx.cleanup();
  }
});

test("expired leases are reported deterministically during reconciliation", () => {
  const fx = fixture();
  try {
    fx.storage.initializeRun({ runId: "RUN-4", state: { stage: "ready" } });
    fx.storage.acquireLease({
      runId: "RUN-4",
      owner: "desktop-executor",
      expectedVersion: 0,
      durationMilliseconds: 10,
    });
    fx.advance(11);
    const report = fx.storage.reconcile();
    assert.equal(report.outcome, "reconciled");
    assert.deepEqual(report.expiredLeases, [
      {
        runId: "RUN-4",
        owner: "desktop-executor",
        expiredAt: 1_700_000_000_010,
      },
    ]);
  } finally {
    fx.cleanup();
  }
});

test("two host connections reject a stale concurrent transition", () => {
  const fx = fixture();
  let second;
  try {
    fx.storage.initializeRun({ runId: "RUN-5", state: { stage: "ready" } });
    const lease = fx.storage.acquireLease({
      runId: "RUN-5",
      owner: "desktop-executor",
      expectedVersion: 0,
    });
    second = createLocalHostStorage({
      rootDirectory: fx.rootDirectory,
      clock: () => 1_700_000_000_000,
    });
    const first = fx.storage.commitTransition({
      runId: "RUN-5",
      expectedVersion: 0,
      leaseToken: lease.token,
      transition: { to: "executed" },
      nextState: { stage: "executed" },
    });
    assert.equal(first.version, 1);
    assert.throws(
      () =>
        second.commitTransition({
          runId: "RUN-5",
          expectedVersion: 0,
          leaseToken: lease.token,
          transition: { to: "substituted" },
          nextState: { stage: "substituted" },
        }),
      (error) => error instanceof LocalHostStorageError && error.code === "DR4923",
    );
    assert.deepEqual(second.readRun("RUN-5").state, { stage: "executed" });
  } finally {
    second?.close();
    fx.cleanup();
  }
});

test("unknown future schema versions fail closed on reopen", () => {
  const fx = fixture();
  fx.storage.close();
  const database = new DatabaseSync(join(fx.rootDirectory, "state.sqlite"));
  database
    .prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)")
    .run(2, 1_700_000_000_001);
  database.close();
  try {
    assert.throws(
      () => createLocalHostStorage({ rootDirectory: fx.rootDirectory }),
      (error) => error instanceof LocalHostStorageError && error.code === "DR4915",
    );
  } finally {
    rmSync(fx.rootDirectory, { recursive: true, force: true });
  }
});
