import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalJsonDigest } from "../../../src/content-digest.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = fileURLToPath(new URL("./", import.meta.url));
const targetRef = "refs/heads/codex/ep-001-integration-frontier-4";
const baseCommit = JSON.parse(readFileSync(resolve(root, "dogfood/ep-001-environment-preparation/integration-frontier-3/integration-summary.json"), "utf8")).finalCommit;
const ids = ["WI-EP-GATE-READINESS", "WI-EP-OPTIONAL-ADAPTERS"];
const read = (id, name) => JSON.parse(readFileSync(resolve(out, id, name), "utf8"));
const fullGraphRef = (graph) => ({
  artifactId: `traceability-graph-${graph.graphId.replaceAll("/", "-")}-r${graph.revision}`,
  digest: canonicalJsonDigest(graph),
  mediaType: "application/vnd.devrelay.traceability-graph+json",
  schema: "https://devrelay.dev/artifacts/traceability-graph-snapshot/v1",
  uri: `memory://devrelay/traceability/${encodeURIComponent(graph.graphId)}/snapshots/${canonicalJsonDigest(graph).slice(7)}.json`,
});

const results = ids.map((workItemId) => {
  const result = read(workItemId, "integration-result.json");
  const raw = read(workItemId, "raw-integration-result.json");
  const graph = read(workItemId, "traceability-graph-snapshot.json");
  assert.equal(result.status, "completed");
  assert.equal(result.outcome, "integrated");
  assert.equal(raw.terminalState, "integrated");
  assert.equal(raw.effectState, "applied");
  assert.equal(raw.operation.transition.sourceCommit, raw.postState.commit);
  return {
    workItemId,
    sourceCommit: raw.operation.transition.sourceCommit,
    expectedTargetCommit: raw.operation.transition.expectedTargetCommit,
    postCommit: raw.postState.commit,
    outcome: result.outcome,
    adapterCalls: 1,
    replayAdapterCalls: 0,
    integratedChange: result.outputs["integrated-change-record"][0],
    graphRevision: graph.revision,
    graphDigest: canonicalJsonDigest(graph),
  };
});
assert.equal(results[0].expectedTargetCommit, baseCommit);
assert.equal(results[1].expectedTargetCommit, results[0].postCommit);
const finalCommit = execFileSync("git", ["-C", root, "rev-parse", "--verify", targetRef], { encoding: "utf8", windowsHide: true }).trim();
assert.equal(finalCommit, results[1].postCommit);
const finalGraph = read(ids.at(-1), "traceability-graph-snapshot.json");
const summary = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "Ep001FourthFrontierIntegrationSummary",
  targetRef,
  baseCommit,
  finalCommit,
  results,
  resultGraph: fullGraphRef(finalGraph),
};
summary.summaryDigest = canonicalJsonDigest(summary);
const proof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ChangeIntegrationSummaryRecoveryProof",
  targetRef,
  baseCommit,
  finalCommit,
  durableResultDigests: ids.map((workItemId) => ({ workItemId, digest: canonicalJsonDigest(read(workItemId, "integration-result.json")) })),
  replayedGitEffects: 0,
  recoveredSummaryDigest: summary.summaryDigest,
};
proof.proofDigest = canonicalJsonDigest(proof);
writeFileSync(resolve(out, "integration-summary.json"), `${canonicalJson(summary)}\n`, "utf8");
writeFileSync(resolve(out, "recovery-proof.json"), `${canonicalJson(proof)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ summary, proof }, null, 2)}\n`);
