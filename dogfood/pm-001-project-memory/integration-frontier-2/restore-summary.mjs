import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, canonicalJsonDigest } from "../../../src/content-digest.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const targetRef = "refs/heads/codex/pm-001-integration-frontier-2-r2";
const finalCommit = execFileSync("git", ["-C", root, "rev-parse", "--verify", targetRef], { encoding: "utf8", windowsHide: true }).trim();
const integrationResult = read("dogfood/pm-001-project-memory/integration-frontier-2/WI-PM-NATIVE-ENGINE/integration-result.json");
const graph = read("dogfood/pm-001-project-memory/integration-frontier-2/WI-PM-NATIVE-ENGINE/traceability-graph-snapshot.json");
const summary = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "Pm001SecondFrontierIntegrationSummary",
  targetRef,
  baseCommit: "d114c2fb1ba5830b76e453ccd192c996206a2b57",
  finalCommit,
  results: [{
    workItemId: "WI-PM-NATIVE-ENGINE",
    sourceCommit: finalCommit,
    expectedTargetCommit: "d114c2fb1ba5830b76e453ccd192c996206a2b57",
    postCommit: finalCommit,
    outcome: "integrated",
    adapterCalls: 1,
    replayAdapterCalls: 0,
    integratedChange: integrationResult.outputs["integrated-change-record"][0],
    graphRevision: graph.revision,
    graphDigest: canonicalJsonDigest(graph),
  }],
  resultGraph: {
    artifactId: `traceability-graph-devrelay-pm-001-contract-generation-promotion-r${graph.revision}`,
    schema: "https://devrelay.dev/artifacts/traceability-graph-snapshot/v1",
    mediaType: "application/vnd.devrelay.traceability-graph+json",
    digest: canonicalJsonDigest(graph),
    uri: `memory://devrelay/traceability/devrelay%2Fpm-001-contract-generation-promotion/snapshots/${canonicalJsonDigest(graph).slice(7)}.json`,
  },
};
summary.summaryDigest = canonicalJsonDigest(summary);
writeFileSync(new URL("integration-summary.json", import.meta.url), `${canonicalJson(summary)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
