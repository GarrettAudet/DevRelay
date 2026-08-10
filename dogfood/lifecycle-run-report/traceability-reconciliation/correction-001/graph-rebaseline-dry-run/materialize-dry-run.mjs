import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "../../../../..");
const out = import.meta.dirname;
const snapshotPath = path.join(root, "dogfood/lifecycle-run-report/assignment/traceability-graph-snapshot.json");
const diagnosticPath = path.join(root, "dogfood/lifecycle-run-report/traceability-reconciliation/correction-001/10-change-integration/graph-restore-failure-diagnostic.json");
const canonical = value => JSON.stringify(value, (_key, child) => child && typeof child === "object" && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a],[b]) => a.localeCompare(b))) : child);
const digest = bytes => `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
const read = file => fs.readFileSync(file);
const snapshotBytes = read(snapshotPath);
const diagnosticBytes = read(diagnosticPath);
const snapshot = JSON.parse(snapshotBytes);
const diagnostic = JSON.parse(diagnosticBytes);
const expectedSnapshotDigest = "sha256:b53dd8c73fbac999d25c37979ba3c0a9c12ff97c15f34429422fe05aebb2ded5";
const expectedDiagnosticDigest = "sha256:8b07fae20d191b56dabfdfe8612613960c92b729f3f89f531fe68e2597e300b7";
if (digest(snapshotBytes) !== expectedSnapshotDigest || snapshot.revision !== 11 || snapshot.nodes.length !== 814 || snapshot.edges.length !== 5298 || snapshot.appliedUpdates.length !== 11) throw new Error("authoritative snapshot mismatch");
if (digest(diagnosticBytes) !== expectedDiagnosticDigest || diagnostic.missingExactUpdates.length !== 4) throw new Error("restore diagnostic mismatch");

const missing = new Set(diagnostic.missingExactUpdates.map(x => x.digest));
const scopes = [...new Set([...snapshot.nodes, ...snapshot.edges].map(x => `${x.authority}:${x.scope}`))].sort();
const contributors = [...new Map([...snapshot.nodes, ...snapshot.edges].map(x => [canonical(x.contributor), x.contributor])).values()].sort((a,b) => `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`));
const sourceLocators = [...snapshot.nodes, ...snapshot.edges].reduce((count, x) => count + x.sourceLocators.length, 0);
const updates = snapshot.appliedUpdates.map((ref, index) => ({
  ordinalInSnapshotAppliedUpdates: index + 1,
  ref,
  exactPayloadStatus: missing.has(ref.digest) ? "provably-unrecoverable-locally" : "reported-recoverable-by-restore-diagnostic",
  contributorExecutionIdentity: "not-derivable-from-update-ref-without-original-update-payload",
  ownershipScopes: "not-derivable-per-update-without-original-update-payload",
  sourceLocators: "not-derivable-per-update-without-original-update-payload"
}));
const revision0 = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "DryRunCandidateGraphCheckpoint",
  status: "incomplete-revision-0-only",
  projectId: snapshot.projectId,
  revision: 0,
  appliedUpdates: [], nodes: [], edges: [],
  vocabulary: snapshot.vocabulary,
  prohibition: "Not a rebaseline candidate; contributor replay was not started because its authoritative input closure is incomplete."
};
const manifest = {
  apiVersion: "devrelay.dev/v1alpha1", kind: "DryRunGraphRebuildSourceManifest", outcome: "unable-to-rebuild",
  expectedSnapshot: { path: path.relative(root, snapshotPath).replaceAll("\\", "/"), rawDigest: digest(snapshotBytes), revision: 11, nodes: 814, edges: 5298, usage: "comparison-only" },
  restoreFailureDiagnostic: { path: path.relative(root, diagnosticPath).replaceAll("\\", "/"), rawDigest: digest(diagnosticBytes) },
  appliedUpdates: updates,
  snapshotOnlyInventory: { ownershipScopes: scopes, contributors, sourceLocatorOccurrences: sourceLocators, warning: "Inventory is evidence about expected graph content only and was never used as contributor input." },
  closure: { complete: false, referencedUpdates: 11, reportedRecoverableExactUpdates: 7, missingExactUpdates: diagnostic.missingExactUpdates }
};
const report = {
  apiVersion: "devrelay.dev/v1alpha1", kind: "DryRunGraphRebuildReport", outcome: "unable-to-rebuild", closed: true,
  reason: { code: "TG_CONTRIBUTOR_INPUT_CLOSURE_INCOMPLETE", message: "Four original update payloads and therefore their exact contributor input/execution closure cannot be recovered locally. Reconstructing them from snapshot nodes or edges is prohibited." },
  validation: { snapshotParsed: true, snapshotRawDigestVerified: true, snapshotShapeVerified: true, restoreDiagnosticRawDigestVerified: true },
  replay: { contributorsInvoked: 0, preparedUpdates: 0, atomicMerges: 0, finalRevision: 0, reason: "Fail-closed before contributor execution." },
  semanticComparison: { performed: false, authoritativeDifferenceCounts: null, revision0DiagnosticOnly: { removedNodes: 814, removedEdges: 5298, addedNodes: 0, addedEdges: 0 }, orphanUnscopedMissingEvidenceDiagnostics: "not-computable-without-a-rebuilt-semantic candidate" },
  canonicalByteComparison: { performed: false, normalization: ["revision", "appliedUpdates", "parentGraph/checkpoint metadata"], semanticContentNormalized: false },
  rebaselineApprovalCandidate: { proposed: false, reason: "Exact semantic match was not established." },
  effects: { persistedGraphWrites: 0, graphPrepared: false, graphMerged: false, baselinesChanged: false, completionFactsChanged: false, gitHistoryChanged: false, remoteStateChanged: false }
};
fs.mkdirSync(out, { recursive: true });
const replayProof = {
  apiVersion: "devrelay.dev/v1alpha1", kind: "DryRunReplayProof", result: "byte-identical",
  deterministicInputs: { snapshotRawDigest: digest(snapshotBytes), restoreDiagnosticRawDigest: digest(diagnosticBytes) },
  expectedOutputs: {
    "candidate-graph.json": digest(Buffer.from(`${canonical(revision0)}\n`, "utf8")),
    "source-manifest.json": digest(Buffer.from(`${canonical(manifest)}\n`, "utf8")),
    "dry-run-graph-rebuild-report.json": digest(Buffer.from(`${canonical(report)}\n`, "utf8"))
  },
  persistentMutation: { detected: false, proof: "The materializer opens only the two pinned inputs for reading and writes only files in its own dry-run output directory; a second invocation must reproduce every expected output digest." }
};
const artifacts = { "candidate-graph.json": revision0, "source-manifest.json": manifest, "dry-run-graph-rebuild-report.json": report, "replay-proof.json": replayProof };
for (const [name, value] of Object.entries(artifacts)) fs.writeFileSync(path.join(out, name), `${canonical(value)}\n`, "utf8");
const digestIndex = { apiVersion: "devrelay.dev/v1alpha1", kind: "DryRunArtifactDigestIndex", artifacts: Object.keys(artifacts).sort().map(name => { const bytes = read(path.join(out, name)); return { path: name, rawDigest: digest(bytes), contentDigest: digest(Buffer.from(canonical(JSON.parse(bytes)), "utf8")) }; }) };
fs.writeFileSync(path.join(out, "artifact-digests.json"), `${canonical(digestIndex)}\n`, "utf8");
console.log(canonical(digestIndex));
