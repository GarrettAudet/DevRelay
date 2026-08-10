import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { validateContractGenerationArtifact } from "../src/contract-generation-artifact-validator.mjs";
import { validateTraceabilityArtifact } from "../src/traceability-artifact-validator.mjs";
import { validateWorkBreakdownArtifact } from "../src/work-breakdown-artifact-validator.mjs";

const ROOT = new URL("../", import.meta.url);
const OUTPUT = new URL("../dogfood/contract-generation/contract-generation/", import.meta.url);
const REPLAY = new URL("replay-v7/", OUTPUT);
const PROJECT_FILES = ["contract-gate-owner-approval.json", "contract-baseline.json", "contract-disposition.json", "project-contract-state.json", "contract-promotion.commit.json"];

async function json(url) {
  return JSON.parse(await readFile(url));
}

test("approved ContractGate promotion is exact, restart-safe, traceable, and progresses to WorkBreakdown", async () => {
  const projectBefore = await Promise.all(PROJECT_FILES.map((name) => readFile(new URL(`project/${name}`, ROOT))));
  const script = new URL("promote.mjs", OUTPUT);
  const first = spawnSync(process.execPath, [fileURLToPath(script)], {
    cwd: fileURLToPath(ROOT),
    encoding: "utf8",
  });
  assert.equal(first.status, 0, first.stderr);
  const second = spawnSync(process.execPath, [fileURLToPath(script)], {
    cwd: fileURLToPath(ROOT),
    encoding: "utf8",
  });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  const projectAfter = await Promise.all(PROJECT_FILES.map((name) => readFile(new URL(`project/${name}`, ROOT))));
  assert.deepEqual(projectAfter, projectBefore);
  const summary = JSON.parse(first.stdout.slice(first.stdout.lastIndexOf("{\n")));
  assert.equal(summary.status, "CONTRACT_BASELINE_PROMOTED");
  assert.equal(summary.contracts, 14);
  assert.equal(summary.nextModule, "work-breakdown");

  const baselineBytes = await readFile(new URL("contract-baseline.json", REPLAY));
  const baseline = JSON.parse(baselineBytes);
  validateContractGenerationArtifact(baseline, {
    ref: {
      artifactId: baseline.baselineId,
      schema: "https://devrelay.dev/artifacts/contract-baseline/v1",
      mediaType: "application/vnd.devrelay.contract-baseline+json",
      digest: sha256Digest(baselineBytes),
      uri: "memory://test/contract-baseline.json",
    },
  });
  assert.equal(baseline.contracts.length, 14);
  assert.equal(baseline.contractsDigest, canonicalJsonDigest(baseline.contracts));
  assert.equal(baseline.approvedCandidate.digest, "sha256:5ee40f770704ef83ccdde89cfce1a584e2e3d5f9af6bc738db073dfef94255b6");

  const disposition = await json(new URL("contract-disposition.json", REPLAY));
  validateWorkBreakdownArtifact(disposition);
  assert.equal(disposition.mode, "baseline");
  assert.equal(disposition.contractTargets.length, 14);
  const state = await json(new URL("project-contract-state-baselined.json", REPLAY));
  validateContractGenerationArtifact(state);
  assert.equal(state.state, "baselined");

  const update = await json(new URL("approved-traceability-update.json", REPLAY));
  const snapshot = await json(new URL("approved-traceability-graph-snapshot.json", REPLAY));
  validateTraceabilityArtifact(update);
  validateTraceabilityArtifact(snapshot);
  const active = snapshot.nodes.filter(({ kind, state: nodeState }) => kind === "contract" && nodeState === "active");
  assert.equal(active.filter(({ authority }) => authority === "candidate").length, 14);
  assert.equal(active.filter(({ authority }) => authority === "approved").length, 14);
  assert.equal(snapshot.edges.filter(({ kind, authority, state: edgeState }) => kind === "contracted-by" && authority === "approved" && edgeState === "active").length, 14);

  const promotion = await json(new URL("contract-gate-promotion.json", REPLAY));
  assert.equal(promotion.checkpointDigest, "sha256:71dd4f6dc0545d65c561772081bc6337e10f24b7186665fca9ea69a5fd1219bc");
  assert.equal(promotion.progressionAllowed, true);
  assert.equal(promotion.nextModule, "work-breakdown");
});
