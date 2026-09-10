import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as api from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const conclusionRoot = "dogfood/ho-001-human-orchestration/final-conclusion";
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative));

test("HO-001 conclusion promotes exact durable memory and fresh-task replay recovers it", () => {
  const bootstrap = json(`${conclusionRoot}/00-project-memory-bootstrap-receipt.json`);
  const routes = json(`${conclusionRoot}/03-memory-change-routes.json`);
  const conclusion = json(`${conclusionRoot}/04-session-conclusion.json`);
  const concludedBaseline = json(`${conclusionRoot}/07-project-memory-baseline.json`);
  const priorBaseline = json("project/history/project-memory/1.0.9/project-memory-baseline.json");
  const currentBaseline = json("project/project-memory-baseline.json");
  const proof = json("project/project-memory-promotion.commit.json");
  const receipt = json(`${conclusionRoot}/09-conclude-receipt.json`);
  const replay = json(`${conclusionRoot}/14-fresh-task-replay-proof.json`);
  const summary = json(`${conclusionRoot}/15-final-conclusion-summary.json`);
  const session = json("project/project-memory-session-state.json");

  api.validateProjectMemoryArtifact(currentBaseline);
  api.validateProjectMemoryArtifact(proof);
  assert.equal(bootstrap.outcome, "pass");
  assert.equal(bootstrap.receiptId, "DPMBR-A4AD0B51685CB1AA");
  assert.equal(bootstrap.repositoryRevision, summary.implementationCommit);
  assert.equal(concludedBaseline.version, "1.0.10");
  assert.ok(Number(currentBaseline.version.split(".").at(-1)) >= 11);
  assert.deepEqual(json("project/history/project-memory/1.0.10/project-memory-baseline.json"), concludedBaseline);
  assert.equal(concludedBaseline.supersedes.digest, api.loadProjectMemoryArtifact(priorBaseline).ref.digest);
  assert.equal(currentBaseline.supersedes.digest, api.loadProjectMemoryArtifact(concludedBaseline).ref.digest);
  assert.equal(proof.projectMemoryBaseline.digest, api.loadProjectMemoryArtifact(currentBaseline).ref.digest);
  assert.equal(receipt.outcome, "concluded");
  assert.equal(receipt.resultBaseline.digest, summary.baseline.digest);
  assert.equal(concludedBaseline.records.some(({ id, status }) => id === summary.acceptedMemoryId && status === "active"), true);
  assert.equal(conclusion.pendingDecisions.includes(summary.pendingRoadmapChangeId), true);
  assert.equal(routes.routes.find(({ changeId }) => changeId === summary.pendingRoadmapChangeId).nextModule, "roadmap-management");
  assert.equal(concludedBaseline.records.some(({ id }) => id === "MEM-DEVRELAY-NEXT-AFTER-HO001"), false);
  assert.equal(replay.outcome, "pass");
  assert.equal(replay.replayed, true);
  assert.equal(replay.replayProviderCalls, 0);
  assert.deepEqual(replay.recoveredMemoryIds, [summary.acceptedMemoryId]);
  assert.match(read("project/history/project-memory/1.0.10/CurrentSynopsis.md").toString("utf8"), /MEM-DEVRELAY-STATUS-HO001-RC3-CANDIDATE/u);
  assert.equal(session.status, "concluded");
});
