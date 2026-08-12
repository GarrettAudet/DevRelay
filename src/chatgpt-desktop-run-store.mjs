import { constants } from "node:fs";
import { access, mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const LIFECYCLE_STATES = new Set([
  "created", "active", "clarification-required", "gate-required", "completed", "unable-to-proceed", "failed",
]);

export class ChatGptDesktopRunStoreError extends Error {
  constructor(message, code = "DR4091") {
    super(`ChatGPT Desktop run store: ${message}`);
    this.name = "ChatGptDesktopRunStoreError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new ChatGptDesktopRunStoreError(message, code); };
const digestHex = (digest) => digest.slice(7);
const immutable = (value) => {
  const copy = structuredClone(value);
  const freeze = (item) => {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
};
const requireId = (value, name) => {
  if (typeof value !== "string" || !ID.test(value)) fail(`${name} must be a non-empty portable identifier`);
};
const requireDigest = (value, name) => {
  if (typeof value !== "string" || !DIGEST.test(value)) fail(`${name} must be a sha256 digest`);
};
const bytesOf = (value) => Buffer.isBuffer(value) || value instanceof Uint8Array
  ? Buffer.from(value)
  : Buffer.from(typeof value === "string" ? value : canonicalJson(value), "utf8");

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  const directory = await open(dirname(path), "r").catch(() => undefined);
  if (directory) {
    try {
      await directory.sync().catch((error) => {
        if (!new Set(["EINVAL", "ENOTSUP", "EPERM"]).has(error?.code)) throw error;
      });
    } finally { await directory.close(); }
  }
}

function revisionBody(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "revisionDigest"));
}

export function createChatGptDesktopRunStore({ rootPath, faultInjector } = {}) {
  if (typeof rootPath !== "string" || rootPath.length === 0) fail("rootPath is required");
  const root = resolve(rootPath);
  const blobs = join(root, "blobs", "sha256");
  const runs = join(root, "runs");
  const locks = new Map();

  const serialize = (runId, work) => {
    const prior = locks.get(runId) ?? Promise.resolve();
    const current = prior.then(work, work);
    locks.set(runId, current.catch(() => {}));
    return current;
  };

  async function initialize() {
    await Promise.all([mkdir(blobs, { recursive: true }), mkdir(runs, { recursive: true })]);
  }

  async function putArtifact({ artifactId, content, digest, mediaType, schema, uri } = {}) {
    requireId(artifactId, "artifactId");
    const bytes = bytesOf(content);
    const actual = sha256Digest(bytes);
    if (digest !== undefined && digest !== actual) fail("artifact content does not match its declared digest", "DR4092");
    const path = join(blobs, digestHex(actual));
    await initialize();
    if (await exists(path)) {
      const stored = await readFile(path);
      if (sha256Digest(stored) !== actual || !stored.equals(bytes)) fail("content-addressed artifact is corrupt", "DR4092");
    } else {
      await atomicWrite(path, bytes);
    }
    return immutable({ artifactId, digest: actual, ...(mediaType && { mediaType }), ...(schema && { schema }), ...(uri && { uri }) });
  }

  async function getArtifact(ref) {
    requireId(ref?.artifactId, "artifactId");
    requireDigest(ref?.digest, "digest");
    const bytes = await readFile(join(blobs, digestHex(ref.digest))).catch((error) => {
      if (error?.code === "ENOENT") fail(`artifact ${ref.artifactId} is missing`, "DR4092");
      throw error;
    });
    if (sha256Digest(bytes) !== ref.digest) fail(`artifact ${ref.artifactId} is corrupt`, "DR4092");
    return Buffer.from(bytes);
  }

  const runDirectory = (runId) => join(runs, encodeURIComponent(runId));
  const revisionPath = (runId, revision) => join(runDirectory(runId), "revisions", `${String(revision).padStart(12, "0")}.json`);

  async function readRevision(runId, revision) {
    const bytes = await readFile(revisionPath(runId, revision));
    const value = JSON.parse(bytes.toString("utf8"));
    if (value.runId !== runId || value.revision !== revision || value.revisionDigest !== canonicalJsonDigest(revisionBody(value))) {
      fail(`revision ${revision} is corrupt`, "DR4092");
    }
    if (value.content) await getArtifact(value.content);
    for (const ref of [...value.taskBindings, ...value.approvals, ...value.reports]) await getArtifact(ref);
    return value;
  }

  async function validRevisions(runId) {
    const directory = join(runDirectory(runId), "revisions");
    const entries = await readdir(directory).catch((error) => error?.code === "ENOENT" ? [] : Promise.reject(error));
    return entries.filter((name) => /^\d{12}\.json$/u.test(name)).map((name) => Number.parseInt(name, 10)).sort((a, b) => b - a);
  }

  async function loadExistingUnlocked(runId) {
    requireId(runId, "runId");
    const revisions = await validRevisions(runId);
    if (revisions.length === 0) return undefined;
    let corrupt = false;
    for (const revision of revisions) {
      try {
        const value = await readRevision(runId, revision);
        return immutable({ ...value, recovered: corrupt });
      } catch (error) {
        if (!(error instanceof ChatGptDesktopRunStoreError) && !(error instanceof SyntaxError)) throw error;
        corrupt = true;
      }
    }
    fail(`run ${runId} has no valid revision`, "DR4092");
  }

  async function loadUnlocked(runId) {
    await initialize();
    return loadExistingUnlocked(runId);
  }

  async function load(runId) {
    return serialize(runId, () => loadUnlocked(runId));
  }

  async function listRuns() {
    const entries = await readdir(runs, { withFileTypes: true }).catch((error) => error?.code === "ENOENT" ? [] : Promise.reject(error));
    const summaries = [];
    const diagnostics = [];
    for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
      if (!entry.isDirectory()) continue;
      let runId;
      try {
        runId = decodeURIComponent(entry.name);
      } catch {
        diagnostics.push({ code: "DESKTOP_RUN_UNREADABLE", severity: "warning", message: "A persisted run directory has an invalid encoded identity." });
        continue;
      }
      if (!ID.test(runId) || encodeURIComponent(runId) !== entry.name) {
        diagnostics.push({ code: "DESKTOP_RUN_UNREADABLE", severity: "warning", message: "A persisted run directory has an invalid identity." });
        continue;
      }
      try {
        const revision = await loadExistingUnlocked(runId);
        if (!revision) {
          diagnostics.push({ code: "DESKTOP_RUN_UNREADABLE", severity: "warning", message: "The persisted run has no readable revision.", runId });
          continue;
        }
        const content = JSON.parse((await getArtifact(revision.content)).toString("utf8"));
        const stateDigest = canonicalJsonDigest(Object.fromEntries(Object.entries(content).filter(([key]) => key !== "stateDigest")));
        const lifecycleState = content?.status === "running" ? "active" : content?.status;
        if (content?.apiVersion !== API_VERSION || content?.kind !== "DesktopLifecycleRunState" || content?.runId !== runId || content?.stateDigest !== stateDigest || !LIFECYCLE_STATES.has(lifecycleState)) {
          diagnostics.push({ code: "DESKTOP_RUN_UNREADABLE", severity: "warning", message: "The persisted run has no valid lifecycle state.", runId });
          continue;
        }
        const revisions = await validRevisions(runId);
        const firstRevision = Math.min(...revisions);
        const [created, updated] = await Promise.all([
          stat(revisionPath(runId, firstRevision)),
          stat(revisionPath(runId, revision.revision)),
        ]);
        const checkpoint = revision.checkpointId ?? content?.checkpoint?.artifactId ?? null;
        summaries.push({
          runId,
          revision: revision.revision,
          lifecycleState,
          checkpoint,
          recoveryStatus: revision.recovered ? "recovered" : "current",
          createdAt: created.mtime.toISOString(),
          updatedAt: updated.mtime.toISOString(),
        });
      } catch {
        diagnostics.push({ code: "DESKTOP_RUN_CORRUPT", severity: "warning", message: "The persisted run is corrupt or unreadable.", runId });
      }
    }
    summaries.sort((left, right) => right.updatedAt < left.updatedAt ? -1 : right.updatedAt > left.updatedAt ? 1 : left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0);
    return immutable({ runs: summaries, diagnostics });
  }

  async function commit({ runId, requestId, expectedRevision, operation = "append", content, checkpoint, taskBindings = [], approvals = [], reports = [] } = {}) {
    requireId(runId, "runId");
    requireId(requestId, "requestId");
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) fail("expectedRevision must be a non-negative integer");
    if (!new Set(["append", "checkpoint", "compare-and-swap"]).has(operation)) fail("operation is unsupported");
    if (checkpoint) {
      requireId(checkpoint.checkpointId, "checkpointId");
      requireDigest(checkpoint.checkpointDigest, "checkpointDigest");
    }
    return serialize(runId, async () => {
      const current = await loadUnlocked(runId);
      const currentRevision = current?.revision ?? 0;
      const requestMaterial = {
        runId, requestId, expectedRevision, operation,
        ...(content && { content }),
        ...(checkpoint && { checkpoint }),
        taskBindings, approvals, reports,
      };
      const requestDigest = canonicalJsonDigest(requestMaterial);
      for (const revision of await validRevisions(runId)) {
        let prior;
        try { prior = await readRevision(runId, revision); } catch { continue; }
        if (prior.requestId === requestId) {
          if (prior.requestDigest !== requestDigest) fail("duplicate request identity has divergent content", "DR4093");
          return immutable({ ...prior, replayed: true, recovered: false });
        }
      }
      if (expectedRevision !== currentRevision) return immutable({ outcome: "conflict", runId, revision: currentRevision, replayed: false, recovered: current?.recovered ?? false });

      const contentRef = content ? await putArtifact(content) : current?.content;
      if (!contentRef) fail("the first revision requires content");
      const storeRefs = async (items, kind) => Promise.all(items.map((item, index) => putArtifact({ ...item, artifactId: item.artifactId ?? `${runId}:${kind}:${currentRevision + 1}:${index}` })));
      const material = {
        apiVersion: API_VERSION,
        kind: "DesktopRunStoreRevision",
        runId,
        revision: currentRevision + 1,
        requestId,
        requestDigest,
        operation,
        outcome: "committed",
        replayed: false,
        ...(current?.revisionDigest && { previousRevisionDigest: current.revisionDigest }),
        content: contentRef,
        contentDigest: contentRef.digest,
        ...(checkpoint && checkpoint),
        taskBindings: await storeRefs(taskBindings, "task-binding"),
        approvals: await storeRefs(approvals, "approval"),
        reports: await storeRefs(reports, "report"),
      };
      const value = { ...material, revisionDigest: canonicalJsonDigest(material) };
      const path = revisionPath(runId, value.revision);
      await atomicWrite(path, Buffer.from(canonicalJson(value), "utf8"));
      await faultInjector?.({ point: "after-revision-write", runId, revision: value.revision, path });
      await atomicWrite(join(runDirectory(runId), "HEAD"), Buffer.from(`${value.revision}\n`, "utf8"));
      return immutable({ ...value, recovered: false });
    });
  }

  async function resume(runId, checkpointDigest) {
    requireDigest(checkpointDigest, "checkpointDigest");
    const state = await load(runId);
    if (!state) fail(`run ${runId} does not exist`);
    if (state.checkpointDigest !== checkpointDigest) fail("stale checkpoint cannot be resumed", "DR4094");
    return immutable({ ...state, replayed: true });
  }

  return Object.freeze({ rootPath: root, initialize, putArtifact, getArtifact, load, listRuns, commit, resume });
}
