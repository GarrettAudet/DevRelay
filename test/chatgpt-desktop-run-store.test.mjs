import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { ChatGptDesktopRunStoreError, createChatGptDesktopRunStore } from "../src/chatgpt-desktop-run-store.mjs";

const roots = [];
test.after(async () => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));
const root = async () => { const value = await mkdtemp(join(tmpdir(), "devrelay desktop run store ")); roots.push(value); return value; };
const content = (artifactId, value) => ({ artifactId, content: value, mediaType: "application/json" });
const checkpoint = (checkpointId, value) => ({ checkpointId, checkpointDigest: canonicalJsonDigest(value) });
const lifecycle = (artifactId, runId, status, checkpointRef, secret = "") => {
  const state = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopLifecycleRunState", runId, status, ...(checkpointRef && { checkpoint: checkpointRef }), secret };
  return content(artifactId, { ...state, stateDigest: canonicalJsonDigest(state) });
};
const revisionPath = (path, runId, revision = 1) => join(path, "runs", encodeURIComponent(runId), "revisions", `${String(revision).padStart(12, "0")}.json`);

test("atomically commits digest-bound state and restarts with exact immutable history on Windows-compatible paths", async () => {
  const path = await root();
  const firstStore = createChatGptDesktopRunStore({ rootPath: path });
  const first = await firstStore.commit({ runId: "RUN-1", requestId: "REQ-1", expectedRevision: 0, content: content("STATE-1", { stage: "RequirementsGathering" }), checkpoint: checkpoint("CP-1", { stage: 1 }), taskBindings: [content("BIND-1", { workItemId: "WI-1" })], approvals: [content("APPROVAL-1", { gate: "approved" })], reports: [content("REPORT-1", "# Run 1") ] });
  assert.equal(first.revision, 1);
  assert.equal(first.contentDigest, first.content.digest);

  const restarted = createChatGptDesktopRunStore({ rootPath: path });
  const loaded = await restarted.load("RUN-1");
  assert.deepEqual(loaded, first);
  assert.equal((await restarted.getArtifact(loaded.reports[0])).toString(), "# Run 1");
  assert.ok(Object.isFrozen(loaded));
});

test("duplicate requests replay exactly while divergent duplicates and stale revisions fail closed", async () => {
  const store = createChatGptDesktopRunStore({ rootPath: await root() });
  const request = { runId: "RUN-2", requestId: "REQ-2", expectedRevision: 0, content: content("STATE-2", { stage: 1 }), checkpoint: checkpoint("CP-2", { stage: 1 }) };
  const first = await store.commit(request);
  const replay = await store.commit(request);
  assert.equal(replay.revisionDigest, first.revisionDigest);
  assert.equal(replay.replayed, true);
  await assert.rejects(() => store.commit({ ...request, content: content("STATE-2B", { stage: 2 }) }), (error) => error instanceof ChatGptDesktopRunStoreError && error.code === "DR4093");
  const conflict = await store.commit({ ...request, requestId: "REQ-3", content: content("STATE-3", { stage: 3 }) });
  assert.deepEqual({ outcome: conflict.outcome, revision: conflict.revision }, { outcome: "conflict", revision: 1 });
  await assert.rejects(() => store.resume("RUN-2", canonicalJsonDigest({ stale: true })), (error) => error.code === "DR4094");
});

test("an interrupted commit recovers the last valid revision without inventing lifecycle facts", async () => {
  const path = await root();
  let interrupt = false;
  const store = createChatGptDesktopRunStore({ rootPath: path, faultInjector: ({ revision }) => {
    if (interrupt && revision === 2) throw new Error("simulated process interruption");
  } });
  const first = await store.commit({ runId: "RUN-3", requestId: "REQ-4", expectedRevision: 0, content: content("STATE-4", { facts: ["approved-A"] }), checkpoint: checkpoint("CP-4", { facts: ["approved-A"] }) });
  interrupt = true;
  await assert.rejects(() => store.commit({ runId: "RUN-3", requestId: "REQ-5", expectedRevision: 1, content: content("STATE-5", { facts: ["invented-B"] }), checkpoint: checkpoint("CP-5", { facts: ["invented-B"] }) }), /simulated process interruption/u);
  await writeFile(join(path, "runs", "RUN-3", "revisions", "000000000002.json"), "{corrupt", "utf8");

  const restarted = createChatGptDesktopRunStore({ rootPath: path });
  const recovered = await restarted.load("RUN-3");
  assert.equal(recovered.revisionDigest, first.revisionDigest);
  assert.equal(recovered.recovered, true);
  assert.deepEqual(JSON.parse((await restarted.getArtifact(recovered.content)).toString()), { facts: ["approved-A"] });
  const resumed = await restarted.resume("RUN-3", first.checkpointDigest);
  assert.equal(resumed.replayed, true);
});

test("corrupt content-addressed bytes are detected", async () => {
  const path = await root();
  const store = createChatGptDesktopRunStore({ rootPath: path });
  const committed = await store.commit({ runId: "RUN-4", requestId: "REQ-6", expectedRevision: 0, content: content("STATE-6", { valid: true }) });
  await writeFile(join(path, "blobs", "sha256", committed.content.digest.slice(7)), "tampered", "utf8");
  await assert.rejects(() => store.load("RUN-4"), (error) => error instanceof ChatGptDesktopRunStoreError && error.code === "DR4092");
});

test("enumerates safe run summaries newest-first with lexical run identity tie-breaking", async () => {
  const path = await root();
  const store = createChatGptDesktopRunStore({ rootPath: path });
  const sensitive = "PROMPT credential=secret raw-evidence";
  await store.commit({ runId: "RUN-B", requestId: "REQ-B", expectedRevision: 0, content: lifecycle("STATE-B", "RUN-B", "running", { artifactId: "CP-B" }, sensitive) });
  await store.commit({ runId: "RUN-A", requestId: "REQ-A", expectedRevision: 0, content: lifecycle("STATE-A", "RUN-A", "completed", undefined, sensitive), checkpoint: checkpoint("STORE-CP-A", { value: 1 }) });
  await store.commit({ runId: "RUN-C", requestId: "REQ-C", expectedRevision: 0, content: lifecycle("STATE-C", "RUN-C", "failed", undefined, sensitive) });
  const older = new Date("2026-01-01T00:00:00.000Z");
  const newer = new Date("2026-01-02T00:00:00.000Z");
  await utimes(revisionPath(path, "RUN-C"), older, older);
  await Promise.all(["RUN-A", "RUN-B"].map((runId) => utimes(revisionPath(path, runId), newer, newer)));

  const listed = await store.listRuns();
  assert.deepEqual(listed.runs, [
    { runId: "RUN-A", revision: 1, lifecycleState: "completed", checkpoint: "STORE-CP-A", recoveryStatus: "current", createdAt: newer.toISOString(), updatedAt: newer.toISOString() },
    { runId: "RUN-B", revision: 1, lifecycleState: "active", checkpoint: "CP-B", recoveryStatus: "current", createdAt: newer.toISOString(), updatedAt: newer.toISOString() },
    { runId: "RUN-C", revision: 1, lifecycleState: "failed", checkpoint: null, recoveryStatus: "current", createdAt: older.toISOString(), updatedAt: older.toISOString() },
  ]);
  assert.deepEqual(listed.diagnostics, []);
  assert.equal(JSON.stringify(listed).includes(sensitive), false);
  assert.ok(Object.isFrozen(listed));
  assert.deepEqual(await createChatGptDesktopRunStore({ rootPath: path }).listRuns(), listed);
});

test("enumeration reports corrupt and unreadable entries, recovers valid history, and never mutates the store", async () => {
  const path = await root();
  const store = createChatGptDesktopRunStore({ rootPath: path });
  await store.commit({ runId: "RUN-RECOVER", requestId: "REQ-1", expectedRevision: 0, content: lifecycle("STATE-1", "RUN-RECOVER", "gate-required", { artifactId: "GATE-1" }) });
  await store.commit({ runId: "RUN-RECOVER", requestId: "REQ-2", expectedRevision: 1, content: lifecycle("STATE-2", "RUN-RECOVER", "completed") });
  await writeFile(revisionPath(path, "RUN-RECOVER", 2), "{corrupt", "utf8");
  await store.commit({ runId: "RUN-CORRUPT", requestId: "REQ-3", expectedRevision: 0, content: lifecycle("STATE-3", "RUN-CORRUPT", "completed", undefined, "DO-NOT-LEAK") });
  const corrupt = await store.load("RUN-CORRUPT");
  await writeFile(join(path, "blobs", "sha256", corrupt.content.digest.slice(7)), "DO-NOT-LEAK", "utf8");
  await mkdir(join(path, "runs", "%invalid"), { recursive: true });
  const snapshot = async () => {
    const files = [];
    const visit = async (directory) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const target = join(directory, entry.name);
        if (entry.isDirectory()) await visit(target);
        else {
          const metadata = await stat(target);
          files.push([target.slice(path.length), (await readFile(target)).toString("base64"), metadata.mtimeMs]);
        }
      }
    };
    await visit(path);
    return files.sort((left, right) => left[0].localeCompare(right[0]));
  };
  const before = await snapshot();
  const listed = await store.listRuns();
  const after = await snapshot();

  assert.deepEqual(after, before);
  assert.deepEqual(listed.runs.map(({ runId, revision, lifecycleState, checkpoint, recoveryStatus }) => ({ runId, revision, lifecycleState, checkpoint, recoveryStatus })), [
    { runId: "RUN-RECOVER", revision: 1, lifecycleState: "gate-required", checkpoint: "GATE-1", recoveryStatus: "recovered" },
  ]);
  assert.deepEqual(listed.diagnostics, [
    { code: "DESKTOP_RUN_UNREADABLE", severity: "warning", message: "A persisted run directory has an invalid encoded identity." },
    { code: "DESKTOP_RUN_CORRUPT", severity: "warning", message: "The persisted run is corrupt or unreadable.", runId: "RUN-CORRUPT" },
  ]);
  assert.equal(JSON.stringify(listed).includes("DO-NOT-LEAK"), false);
});

test("enumerating an absent store is read-only", async () => {
  const path = join(await root(), "not-created");
  const listed = await createChatGptDesktopRunStore({ rootPath: path }).listRuns();
  assert.deepEqual(listed, { runs: [], diagnostics: [] });
  await assert.rejects(() => stat(path), (error) => error.code === "ENOENT");
});
