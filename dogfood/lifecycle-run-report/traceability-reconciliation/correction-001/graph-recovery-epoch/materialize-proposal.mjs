import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalJsonDigest } from "../../../../../src/content-digest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const correctionRoot = resolve(here, "..");
const repositoryRoot = resolve(correctionRoot, "../../../..");
const sourceGraphPath = resolve(
  repositoryRoot,
  "dogfood/lifecycle-run-report/assignment/traceability-graph-snapshot.json",
);
const restoreDiagnosticPath = resolve(
  correctionRoot,
  "10-change-integration/graph-restore-failure-diagnostic.json",
);
const dryRunReportPath = resolve(
  correctionRoot,
  "graph-rebaseline-dry-run/dry-run-graph-rebuild-report.json",
);
const outputPath = resolve(here, "recovery-epoch-proposal.json");

const expected = Object.freeze({
  sourceGraphRawDigest: "sha256:b53dd8c73fbac999d25c37979ba3c0a9c12ff97c15f34429422fe05aebb2ded5",
  dryRunReportRawDigest: "sha256:151210ca04a4bc2d1a83e19228e1506b1f2e11307666d7c11c6a2afa2118c73c",
  dryRunReportContentDigest: "sha256:51f06e6f2f3840e0caed78a3e1a60bdd96e82d9634041be3dff272d96ee1f7d5",
});

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function load(path) {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function assertEqual(actual, wanted, label) {
  if (actual !== wanted) {
    throw new Error(`${label} drifted: expected ${wanted}, received ${actual}`);
  }
}

const source = load(sourceGraphPath);
const diagnostic = load(restoreDiagnosticPath);
const dryRun = load(dryRunReportPath);

assertEqual(rawDigest(source.bytes), expected.sourceGraphRawDigest, "source graph raw digest");
assertEqual(rawDigest(dryRun.bytes), expected.dryRunReportRawDigest, "dry-run report raw digest");
assertEqual(canonicalJsonDigest(dryRun.value), expected.dryRunReportContentDigest, "dry-run report content digest");
assertEqual(source.value.revision, 11, "source graph revision");
assertEqual(source.value.nodes.length, 814, "source graph node count");
assertEqual(source.value.edges.length, 5298, "source graph edge count");
assertEqual(diagnostic.value.missingExactUpdates.length, 4, "missing update count");
assertEqual(dryRun.value.outcome, "unable-to-rebuild", "dry-run outcome");

const semanticStateDigest = canonicalJsonDigest({
  vocabulary: source.value.vocabulary,
  horizon: source.value.horizon,
  nodes: source.value.nodes,
  edges: source.value.edges,
});

const proposal = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "TraceabilityGraphRecoveryEpochProposal",
  proposalId: "TG-RECOVERY-LIFECYCLE-RUN-REPORT-001",
  authority: "candidate",
  decisionRequired: true,
  decisionQuestion:
    "May DevRelay adopt the intact revision-11 graph state as the semantic seed of a new graph epoch while preserving and exposing the four-payload historical audit gap?",
  sourceGraph: {
    graphId: source.value.graphId,
    projectId: source.value.projectId,
    revision: source.value.revision,
    rawDigest: rawDigest(source.bytes),
    semanticStateDigest,
    horizon: source.value.horizon,
    vocabulary: source.value.vocabulary,
    nodeCount: source.value.nodes.length,
    edgeCount: source.value.edges.length,
  },
  proposedEpoch: {
    graphId: "devrelay/lifecycle-run-report/epoch-2",
    projectId: source.value.projectId,
    initialRevision: 0,
    parentGraph: null,
    lastAppliedUpdate: null,
    appliedUpdates: [],
    semanticStateDigest,
    nodeCount: source.value.nodes.length,
    edgeCount: source.value.edges.length,
  },
  historicalGap: {
    status: "declared-unrecoverable",
    referencedUpdateCount: diagnostic.value.referencedUpdates,
    recoverableExactUpdateCount: diagnostic.value.recoverableExactUpdates,
    missingExactUpdates: diagnostic.value.missingExactUpdates,
    consequence:
      "Pre-epoch semantic state remains inspectable in the immutable revision-11 snapshot, but the prior eleven-update history cannot be fully replayed from exact source bytes.",
  },
  evidence: {
    restoreFailureDiagnostic: {
      canonicalDigest: canonicalJsonDigest(diagnostic.value),
      outcome: diagnostic.value.disposition,
    },
    deterministicDryRun: {
      rawDigest: rawDigest(dryRun.bytes),
      contentDigest: canonicalJsonDigest(dryRun.value),
      outcome: dryRun.value.outcome,
    },
  },
  guardrails: [
    "The revision-11 snapshot remains immutable predecessor evidence and is never rewritten or described as replay-complete.",
    "The epoch seed must preserve exactly the source vocabulary, horizon, nodes, edges, and semantic-state digest.",
    "The new graph identity, revision zero, null parent, null last update, and empty applied-update list make the history discontinuity explicit.",
    "No missing update payload, contributor invocation, merge receipt, completion fact, or replay proof may be fabricated.",
    "Every post-recovery update must use the released prepare, validate, checkpoint, atomic merge, and replay path.",
    "LifecycleRunReport must display the historical gap until an explicit future policy retires the warning.",
  ],
  effectsBeforeApproval: {
    graphStateChanged: false,
    baselinesChanged: false,
    completionFactsCreated: false,
    frontierAdvanced: false,
    gitHistoryChanged: false,
    remoteStateChanged: false,
  },
};

writeFileSync(outputPath, `${canonicalJson(proposal)}\n`, "utf8");
process.stdout.write(
  `${JSON.stringify({
    proposalDigest: canonicalJsonDigest(proposal),
    semanticStateDigest,
    outputPath,
  })}\n`,
);
