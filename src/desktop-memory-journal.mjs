import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateProjectMemoryArtifact } from "./project-memory-artifact-validator.mjs";

export class DesktopMemoryJournalError extends Error {
  constructor(message, code = "DR6140") {
    super(`desktop memory journal: ${message}`);
    this.name = "DesktopMemoryJournalError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new DesktopMemoryJournalError(message, code); };
const safe = (value) => String(value).replaceAll(/[^A-Za-z0-9._-]/gu, "_");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const atomicJson = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporary, file);
};

export function createDesktopMemoryJournal({ dataDirectory, projectRoot, clock = () => new Date().toISOString() } = {}) {
  if (!path.isAbsolute(dataDirectory ?? "") || !path.isAbsolute(projectRoot ?? "")) fail("absolute dataDirectory and projectRoot are required");
  const projectId = canonicalJsonDigest({ projectRoot: path.resolve(projectRoot) }).slice(7, 23);
  const root = path.join(path.resolve(dataDirectory), "projects", projectId);
  const baselinePath = path.join(projectRoot, "project", "project-memory-baseline.json");
  const synopsisPath = path.join(projectRoot, "project", "CurrentSynopsis.md");
  const sessionFile = (sessionId) => path.join(root, "sessions", `${safe(sessionId)}.json`);
  const loadContext = () => {
    if (!existsSync(baselinePath) || !existsSync(synopsisPath)) fail("authoritative ProjectMemory files are missing", "DR6141");
    const baselineBytes = readFileSync(baselinePath);
    const synopsisBytes = readFileSync(synopsisPath);
    const baseline = JSON.parse(baselineBytes);
    try { validateProjectMemoryArtifact(baseline); } catch (error) { fail(`ProjectMemory baseline is malformed: ${error.message}`, "DR6141"); }
    return { baseline, baselineDigest: sha256Digest(baselineBytes), synopsis: synopsisBytes.toString("utf8"), synopsisDigest: sha256Digest(synopsisBytes) };
  };
  return Object.freeze({
    bootstrap({ sessionId, taskId = sessionId, source = "startup" } = {}) {
      if (!sessionId) fail("sessionId is required");
      const context = loadContext();
      const file = sessionFile(sessionId);
      const existing = existsSync(file) ? readJson(file) : null;
      if (existing && existing.baselineDigest !== context.baselineDigest && existing.status === "active") {
        existing.status = "quarantined";
        existing.diagnostics = ["project-memory-baseline-drift"];
        existing.updatedAt = clock();
        atomicJson(file, existing);
        fail("active session memory baseline drifted", "DR6142");
      }
      const record = existing ?? {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "DesktopMemorySession",
        projectId,
        sessionId,
        taskId,
        status: "active",
        conclusionStatus: "pending",
        baselineId: context.baseline.baselineId,
        baselineDigest: context.baselineDigest,
        synopsisDigest: context.synopsisDigest,
        checkpoints: [],
        createdAt: clock(),
      };
      record.lastSource = source;
      record.updatedAt = clock();
      atomicJson(file, record);
      const pending = this.list().filter((item) => item.sessionId !== sessionId && item.conclusionStatus !== "approved");
      return Object.freeze({ record: structuredClone(record), context, pending });
    },
    checkpoint({ sessionId, event, transcriptPath = null, turnId = null } = {}) {
      const file = sessionFile(sessionId);
      if (!existsSync(file)) return Object.freeze({ outcome: "unmanaged" });
      const record = readJson(file);
      const transcriptDigest = transcriptPath && existsSync(transcriptPath) ? sha256Digest(readFileSync(transcriptPath)) : null;
      const checkpoint = { event, turnId, transcriptDigest, recordedAt: clock() };
      const identity = canonicalJsonDigest(checkpoint);
      if (!record.checkpoints.some((item) => item.digest === identity)) record.checkpoints.push({ ...checkpoint, digest: identity });
      record.updatedAt = clock();
      atomicJson(file, record);
      return Object.freeze({ outcome: "checkpointed", checkpointDigest: identity });
    },
    conclude({ sessionId, reason = "session-end", transcriptPath = null } = {}) {
      const file = sessionFile(sessionId);
      if (!existsSync(file)) return Object.freeze({ outcome: "unmanaged" });
      const record = readJson(file);
      if (record.conclusionStatus === "candidate" || record.conclusionStatus === "approved") return Object.freeze({ outcome: "replayed", conclusion: record.conclusion });
      const transcriptDigest = transcriptPath && existsSync(transcriptPath) ? sha256Digest(readFileSync(transcriptPath)) : null;
      const body = {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "DesktopSessionConclusionCandidate",
        projectId,
        sessionId,
        taskId: record.taskId,
        startingBaseline: { baselineId: record.baselineId, digest: record.baselineDigest },
        transcriptDigest,
        reason,
        checkpointDigests: record.checkpoints.map(({ digest }) => digest).sort(),
        authority: "candidate-only",
      };
      record.status = "ended";
      record.conclusionStatus = "candidate";
      record.conclusion = { ...body, conclusionDigest: canonicalJsonDigest(body) };
      record.updatedAt = clock();
      atomicJson(file, record);
      return Object.freeze({ outcome: "candidate-recorded", conclusion: structuredClone(record.conclusion) });
    },
    approve({ sessionId, concludeReceipt } = {}) {
      const file = sessionFile(sessionId);
      if (!existsSync(file)) fail("session does not exist");
      const record = readJson(file);
      if (record.conclusionStatus !== "candidate") fail("conclusion candidate is required");
      try { validateProjectMemoryArtifact(concludeReceipt); } catch { fail("approved exact ConcludeReceipt is required", "DR6143"); }
      if (concludeReceipt.sessionId !== sessionId || concludeReceipt.outcome !== "concluded") fail("approved exact ConcludeReceipt is required", "DR6143");
      record.conclusionStatus = "approved";
      record.concludeReceipt = structuredClone(concludeReceipt);
      record.updatedAt = clock();
      atomicJson(file, record);
      return Object.freeze(structuredClone(record));
    },
    read(sessionId) { const file = sessionFile(sessionId); return existsSync(file) ? Object.freeze(readJson(file)) : null; },
    list() {
      const directory = path.join(root, "sessions");
      if (!existsSync(directory)) return [];
      return Object.freeze(readdirSync(directory).sort().map((name) => Object.freeze(readJson(path.join(directory, name)))));
    },
  });
}
