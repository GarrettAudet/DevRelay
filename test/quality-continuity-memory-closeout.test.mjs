import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as api from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const closeout = "dogfood/qc-001-quality-continuity/project-memory-closeout";
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative));

test("QC-001 conclusion promotes exact durable memory and fresh-task replay recovers it", () => {
  const summary = json(`${closeout}/14-closeout-summary.json`);
  const baseline = json("project/project-memory-baseline.json");
  const historical = json("project/history/project-memory/1.0.8/project-memory-baseline.json");
  const proof = json("project/project-memory-promotion.commit.json");
  const replay = json(`${closeout}/13-fresh-task-replay-proof.json`);
  const session = json("project/project-memory-session-state.json");
  const { summaryDigest, ...material } = summary;

  api.validateProjectMemoryArtifact(baseline);
  api.validateProjectMemoryArtifact(proof);
  assert.equal(summaryDigest, api.canonicalJsonDigest(material));
  assert.equal(summary.outcome, "pass");
  assert.equal(summary.implementationCommit, "779e6aa341b93aca99ff33177f95742284f6d606");
  assert.equal(summary.atomicCommits, 1);
  assert.equal(summary.replayAtomicCommits, 0);
  assert.equal(summary.freshTaskReplayed, true);
  assert.equal(summary.freshTaskProviderOutcome, "native-equivalent");
  assert.deepEqual(summary.recoveredMemoryIds, ["MEM-DEVRELAY-STATUS-QC001-RC2-CANDIDATE"]);
  assert.equal(baseline.version, "1.0.9");
  assert.equal(baseline.supersedes.digest, api.loadProjectMemoryArtifact(historical).ref.digest);
  assert.equal(proof.projectMemoryBaseline.digest, api.loadProjectMemoryArtifact(baseline).ref.digest);
  assert.equal(baseline.records.some(({ id, status }) => id === "MEM-DEVRELAY-STATUS-QC001-RC2-CANDIDATE" && status === "superseded"), true);
  assert.equal(baseline.records.some(({ id, status }) => id === "MEM-DEVRELAY-RELEASE-V0.11.0-RC2" && status === "active"), true);
  assert.equal(api.renderCurrentSynopsis(baseline).bytes.equals(read("project/CurrentSynopsis.md")), true);
  assert.deepEqual(replay.recoveredMemoryIds, ["MEM-DEVRELAY-STATUS-QC001-RC2-CANDIDATE"]);
  assert.equal(replay.replayed, true);
  assert.equal(replay.replayProviderCalls, 0);
  assert.equal(session.status, "concluded");
});
