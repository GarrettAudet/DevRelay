import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
