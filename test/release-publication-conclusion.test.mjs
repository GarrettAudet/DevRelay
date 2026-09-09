import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as api from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const json = (relativePath) => JSON.parse(read(relativePath));
const conclusionRoot = "dogfood/ep-001-environment-preparation/release-publication-conclusion";

test("published v0.10.0-rc.3 is concluded into exact durable ProjectMemory", () => {
  const summary = json(`${conclusionRoot}/release-publication-conclusion-summary.json`);
  const evidence = json(`${conclusionRoot}/00-release-publication-evidence.json`);
  const concludedBaseline = json(`${conclusionRoot}/07-project-memory-baseline.json`);
  const currentBaseline = json("project/project-memory-baseline.json");
  const historicalBaseline = json("project/history/project-memory/1.0.3/project-memory-baseline.json");
  const priorCurrentBaseline = json("project/history/project-memory/1.0.4/project-memory-baseline.json");
  const desktopAcceptanceBaseline = json("project/history/project-memory/1.0.5/project-memory-baseline.json");
  const doAcceptanceBaseline = json("project/history/project-memory/1.0.6/project-memory-baseline.json");
  const doPublicationBaseline = json("project/history/project-memory/1.0.7/project-memory-baseline.json");
  const qualityContinuityBaseline = json("project/history/project-memory/1.0.8/project-memory-baseline.json");
  const rc2PublicationBaseline = json("project/history/project-memory/1.0.9/project-memory-baseline.json");
  const receipt = json(`${conclusionRoot}/09-conclude-receipt.json`);
  const replay = json(`${conclusionRoot}/14-fresh-task-replay-proof.json`);

  assert.equal(summary.outcome, "pass");
  assert.equal(summary.protectedMainCommit, "d17bc7dada964c3b669c29407cdabfbfe37c2651");
  assert.equal(evidence.release.tag, "v0.10.0-rc.3");
  assert.equal(evidence.release.tagCommit, "dc0f4094ce0e178757984e363836d05cfcc0037d");
  assert.deepEqual(evidence.automationFollowup.canonicalRuns, {
    codeql: 32592205360,
    scorecard: 32592205344,
    verify: 32592205364,
  });
  assert.deepEqual(historicalBaseline, concludedBaseline);
  assert.equal(historicalBaseline.version, "1.0.3");
  assert.equal(api.loadProjectMemoryArtifact(historicalBaseline).ref.digest, summary.resultBaseline.digest);
  assert.ok(Number(currentBaseline.version.split(".").at(-1)) >= 9);
  assert.equal(priorCurrentBaseline.supersedes.digest, summary.resultBaseline.digest);
  assert.equal(desktopAcceptanceBaseline.supersedes.digest, api.loadProjectMemoryArtifact(priorCurrentBaseline).ref.digest);
  assert.equal(doAcceptanceBaseline.supersedes.digest, api.loadProjectMemoryArtifact(desktopAcceptanceBaseline).ref.digest);
  assert.equal(doPublicationBaseline.supersedes.digest, api.loadProjectMemoryArtifact(doAcceptanceBaseline).ref.digest);
  assert.equal(qualityContinuityBaseline.supersedes.digest, api.loadProjectMemoryArtifact(doPublicationBaseline).ref.digest);
  assert.equal(rc2PublicationBaseline.supersedes.digest, api.loadProjectMemoryArtifact(qualityContinuityBaseline).ref.digest);
  assert.equal(currentBaseline.supersedes.digest, api.loadProjectMemoryArtifact(rc2PublicationBaseline).ref.digest);
  assert.equal(receipt.outcome, "concluded");
  assert.equal(receipt.resultBaseline.digest, summary.resultBaseline.digest);
  assert.equal(replay.replayed, true);
  assert.equal(replay.replayProviderCalls, 0);
  assert.deepEqual(replay.loadOrder, [
    "current-synopsis",
    "project-memory-baseline",
    "traceability-context",
  ]);
  assert.equal(
    currentBaseline.records.some(
      ({ id, status }) => id === "MEM-DEVRELAY-RELEASE-V0.10.0-RC3" && status === "active",
    ),
    true,
  );
  assert.equal(
    currentBaseline.records.some(
      ({ id, status }) => id === "MEM-DEVRELAY-NEXT-AFTER-EP001" && status === "superseded",
    ),
    true,
  );
  assert.deepEqual(
    read("project/history/project-memory/1.0.3/CurrentSynopsis.md"),
    read(`${conclusionRoot}/CurrentSynopsis.md`),
  );
});
