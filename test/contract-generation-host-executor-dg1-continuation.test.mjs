import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";

const source = process.env.DEVRELAY_DG1_SOURCE_BUNDLE;
test("DG-1 exact 6ddd continuation calls the new generator once and replays with zero calls", async (t) => {
  if (!source) return t.skip("DEVRELAY_DG1_SOURCE_BUNDLE is not configured");
  try { await readFile(path.join(source, "evidence-manifest.json")); } catch { return t.skip("immutable delegated DG-1 source bundle is not mounted"); }
  const result = spawnSync(process.execPath, ["dogfood/bootstrap-contract-generation-host-executor/materialize-dg1.mjs", source], { cwd: new URL("../", import.meta.url), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const proofBytes = await readFile(new URL("../dogfood/bootstrap-contract-generation-host-executor/dg1-continuation/runtime-execution-proof.json", import.meta.url));
  const proof = JSON.parse(proofBytes);
  assert.deepEqual(proof.firstExecutionCalls, { "json-schema-contract-generator": 1 });
  assert.deepEqual(proof.replayAdditionalCalls, { "json-schema-contract-generator": 0 });
  assert.equal(proof.identicalReplayBytes, true);
  assert.equal(proof.authority.contractGateDecision, false);
  assert.equal(proof.correctedRequiredIntentCount, 48);
  assert.equal(proof.terminalArtifact.artifactId.startsWith("CCS-"), true);
  const candidateBytes = await readFile(new URL("../dogfood/bootstrap-contract-generation-host-executor/dg1-continuation/contract-change-set-draft.json", import.meta.url));
  assert.equal(sha256Digest(candidateBytes), proof.terminalArtifact.digest);
  const manifest = JSON.parse(await readFile(new URL("../dogfood/bootstrap-contract-generation-host-executor/dg1-continuation/evidence-manifest.json", import.meta.url)));
  assert.equal(manifest.lineage.supersedesManifest, "sha256:6dddece4148cee24389595e2d971993f859f62df2fb0fd4da9fc1f00416bd311");
  assert.ok(manifest.entries.every((entry) => /^sha256:[a-f0-9]{64}$/.test(entry.sha256) && entry.byteLength > 0));
});
