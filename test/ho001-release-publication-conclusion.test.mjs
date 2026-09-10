import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as api from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const conclusionRoot = "dogfood/ho-001-human-orchestration/release-publication-conclusion";
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative));

test("published v0.11.0-rc.3 is concluded into exact durable ProjectMemory", () => {
  const evidence = json(`${conclusionRoot}/00-release-publication-evidence.json`);
  const bootstrap = json(`${conclusionRoot}/01-project-memory-bootstrap-receipt.json`);
  const routes = json(`${conclusionRoot}/03-memory-change-routes.json`);
  const conclusion = json(`${conclusionRoot}/04-session-conclusion.json`);
  const concludedBaseline = json(`${conclusionRoot}/07-project-memory-baseline.json`);
  const currentBaseline = json("project/project-memory-baseline.json");
  const historicalBaseline = json("project/history/project-memory/1.0.11/project-memory-baseline.json");
  const receipt = json(`${conclusionRoot}/09-conclude-receipt.json`);
  const replay = json(`${conclusionRoot}/14-fresh-task-replay-proof.json`);
  const summary = json(`${conclusionRoot}/release-publication-conclusion-summary.json`);

  assert.equal(evidence.release.tag, "v0.11.0-rc.3");
  assert.equal(evidence.release.tagCommit, "0284fb781d38aaba7538cb62fb82a1a022280eb9");
  assert.equal(evidence.integration.testedHead, "9d685c64e10c95e6e6c952d8b9eaf84ee76db5f8");
  assert.equal(evidence.integration.pullRequest, "https://github.com/GarrettAudet/DevRelay/pull/22");
  assert.deepEqual(evidence.integration.pullRequestChecks, { failed: 0, passed: 11, total: 11 });
  assert.equal(evidence.releaseWorkflow.runId, 34469983856);
  assert.equal(evidence.releaseWorkflow.conclusion, "success");
  assert.deepEqual(evidence.release.assets.map(({ name }) => name), [
    "0.11.0-rc.3.json",
    "devrelay-0.11.0-rc.3.tgz",
    "SBOM.cdx.json",
    "SHA256SUMS",
  ]);
  assert.equal(bootstrap.outcome, "pass");
  assert.equal(bootstrap.repositoryRevision, evidence.release.tagCommit);
  assert.equal(api.sha256Digest(Buffer.from(api.canonicalJson(bootstrap), "utf8")), summary.bootstrapReceipt.digest);
  assert.equal(summary.outcome, "pass");
  assert.equal(summary.summaryDigest, api.canonicalJsonDigest(Object.fromEntries(Object.entries(summary).filter(([key]) => key !== "summaryDigest"))));
  assert.deepEqual(historicalBaseline, concludedBaseline);
  assert.ok(Number(currentBaseline.version.split(".").at(-1)) >= 11);
  assert.equal(receipt.outcome, "concluded");
  assert.equal(receipt.resultBaseline.digest, summary.resultBaseline.digest);
  assert.equal(replay.outcome, "pass");
  assert.equal(replay.replayed, true);
  assert.equal(replay.replayProviderCalls, 0);
  assert.deepEqual(replay.recoveredMemoryIds, ["MEM-DEVRELAY-RELEASE-V0.11.0-RC3"]);
  assert.equal(currentBaseline.records.some(({ id, status }) => id === "MEM-DEVRELAY-RELEASE-V0.11.0-RC3" && status === "active"), true);
  assert.equal(currentBaseline.records.some(({ id, status }) => id === "MEM-DEVRELAY-STATUS-HO001-RC3-CANDIDATE" && status === "superseded"), true);
  assert.equal(conclusion.pendingDecisions.includes("CHANGE-V0110RC3-NEXT-ACTION-REPLACE"), true);
  assert.equal(routes.routes.find(({ changeId }) => changeId === "CHANGE-V0110RC3-NEXT-ACTION-REPLACE").nextModule, "roadmap-management");
  assert.deepEqual(read("project/history/project-memory/1.0.11/CurrentSynopsis.md"), read(`${conclusionRoot}/CurrentSynopsis.md`));
});
