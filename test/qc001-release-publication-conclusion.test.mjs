import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as api from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const conclusionRoot = "dogfood/qc-001-quality-continuity/release-publication-conclusion";
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative));

test("published v0.11.0-rc.2 is concluded into exact durable ProjectMemory", () => {
  const evidence = json(`${conclusionRoot}/00-release-publication-evidence.json`);
  const bootstrap = json(`${conclusionRoot}/01-project-memory-bootstrap-receipt.json`);
  const routes = json(`${conclusionRoot}/03-memory-change-routes.json`);
  const conclusion = json(`${conclusionRoot}/04-session-conclusion.json`);
  const concludedBaseline = json(`${conclusionRoot}/07-project-memory-baseline.json`);
  const currentBaseline = json("project/project-memory-baseline.json");
  const historicalBaseline = json("project/history/project-memory/1.0.9/project-memory-baseline.json");
  const receipt = json(`${conclusionRoot}/09-conclude-receipt.json`);
  const replay = json(`${conclusionRoot}/14-fresh-task-replay-proof.json`);
  const summary = json(`${conclusionRoot}/release-publication-conclusion-summary.json`);

  assert.equal(evidence.release.tag, "v0.11.0-rc.2");
  assert.equal(evidence.release.tagCommit, "75c9b3a312d24bff967e5c652385f529ffab4db0");
  assert.equal(evidence.integration.testedHead, "061be4ce570edb0fc2baba2f812f194847143e14");
  assert.equal(evidence.integration.pullRequest, "https://github.com/GarrettAudet/DevRelay/pull/21");
  assert.deepEqual(evidence.integration.pullRequestChecks, { failed: 0, passed: 11, total: 11 });
  assert.equal(evidence.releaseWorkflow.runId, 34183116800);
  assert.equal(evidence.releaseWorkflow.conclusion, "success");
  assert.deepEqual(evidence.release.assets.map(({ name }) => name), [
    "0.11.0-rc.2.json",
    "devrelay-0.11.0-rc.2.tgz",
    "SBOM.cdx.json",
    "SHA256SUMS",
  ]);
  assert.equal(bootstrap.outcome, "pass");
  assert.equal(bootstrap.repositoryRevision, evidence.release.tagCommit);
  assert.equal(api.sha256Digest(Buffer.from(api.canonicalJson(bootstrap), "utf8")), summary.bootstrapReceipt.digest);
  assert.equal(summary.outcome, "pass");
  assert.equal(summary.summaryDigest, api.canonicalJsonDigest(Object.fromEntries(Object.entries(summary).filter(([key]) => key !== "summaryDigest"))));
  assert.deepEqual(historicalBaseline, concludedBaseline);
  assert.ok(Number(currentBaseline.version.split(".").at(-1)) >= 9);
  assert.equal(receipt.outcome, "concluded");
  assert.equal(receipt.resultBaseline.digest, summary.resultBaseline.digest);
  assert.equal(replay.outcome, "pass");
  assert.equal(replay.replayed, true);
  assert.equal(replay.replayProviderCalls, 0);
  assert.deepEqual(replay.recoveredMemoryIds, ["MEM-DEVRELAY-RELEASE-V0.11.0-RC2"]);
  assert.equal(currentBaseline.records.some(({ id, status }) => id === "MEM-DEVRELAY-RELEASE-V0.11.0-RC2" && status === "active"), true);
  assert.equal(currentBaseline.records.some(({ id, status }) => id === "MEM-DEVRELAY-STATUS-QC001-RC2-CANDIDATE" && status === "superseded"), true);
  assert.equal(conclusion.pendingDecisions.includes("CHANGE-V0110RC2-NEXT-ACTION-REPLACE"), true);
  assert.equal(routes.routes.find(({ changeId }) => changeId === "CHANGE-V0110RC2-NEXT-ACTION-REPLACE").nextModule, "roadmap-management");
  assert.deepEqual(read("project/history/project-memory/1.0.9/CurrentSynopsis.md"), read(`${conclusionRoot}/CurrentSynopsis.md`));
});
