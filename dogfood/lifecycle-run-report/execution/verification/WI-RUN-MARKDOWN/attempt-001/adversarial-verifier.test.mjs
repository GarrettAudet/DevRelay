import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalJsonDigest } from "../../../../../../src/content-digest.mjs";
import * as candidate from "../../../../../../src/lifecycle-run-report-markdown.mjs";

const ref = artifactId => ({ artifactId, digest: canonicalJsonDigest({ artifactId }) });
const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const metric = name => ({ name, availability:"measured", value:1, unit:"milliseconds", provenance:{ kind:"host", artifact:ref(`clock-${name}`) } });
const stage = (componentId, sequence, status, outcome, extra={}) => ({
  componentKind:"module", componentId, sequence, operation:`operate-${componentId}`,
  adapterBindings:[{ id:`adapter-${componentId}`, version:"1.0.0", configurationDigest:ref(`config-${componentId}`).digest }],
  status, outcome, gateResult:"not-applicable",
  rework:{ attemptCount:extra.attemptCount ?? 1, replayed:extra.replayed ?? false, predecessorAttempts:extra.predecessorAttempts ?? [] },
  performance:[metric(`stage-${componentId}`)], importantArtifacts:[ref(`output-${componentId}`)],
  nextAction:{ disposition:"none" }, sourceFacts:[ref(`source-${componentId}`)]
});
const stages = [
  stage("Conditional",0,"skipped","skipped"), stage("Failed",1,"failed","failed"),
  stage("Resumed",2,"active","candidate",{attemptCount:2,replayed:true,predecessorAttempts:[ref("attempt-1")]}),
  stage("Parallel-A",3,"active","candidate"), stage("Parallel-B",3,"active","candidate"),
  stage("Repeating-Frontier",4,"not-started","unknown")
];
const snapshot = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"LifecycleRunSnapshot", snapshotId:"snapshot-adversarial", runId:"run-adversarial", ledger:ref("ledger-secret-link"), traceabilityGraph:ref("graph"), stages, importantArtifacts:stages.map(value=>value.importantArtifacts[0]), traceabilityPaths:[], diagnostics:[], adapterAssessments:[], metrics:[metric("z"),metric("a")], nextAction:{disposition:"available",description:"Continue the repeating frontier."}, authority:"read-only-projection" }, "snapshotDigest");
const policy = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"LifecycleRunContentPolicy", policyId:"policy-adversarial", version:"1.0.0", rules:[{classification:"public",disposition:"allow"},{classification:"internal",disposition:"allow"},{classification:"restricted",disposition:"redact"},{classification:"secret",disposition:"omit"},{classification:"credential",disposition:"omit"},{classification:"prompt",disposition:"omit"},{classification:"raw-tool-log",disposition:"omit"},{classification:"unknown",disposition:"omit"}], unknownClassification:"omit", authority:"content-filter-only" }, "policyDigest");
const options = { snapshot, contentPolicy:policy, contentPolicyRef:{artifactId:policy.policyId,digest:policy.policyDigest} };

test("arbitrary count and conditional, skipped, failed, resumed, parallel, and repeating-frontier states are explicit", () => {
  const markdown = candidate.renderLifecycleRunReport(options).markdown;
  assert.match(markdown,/6 lifecycle components were observed/);
  for (const term of ["Conditional","skipped","Failed","failed","Resumed","resumed","Parallel-A","Parallel-B","Repeating-Frontier"]) assert.match(markdown,new RegExp(term));
});

test("semantically equivalent reordered collections render byte-identically", () => {
  const reordered = structuredClone(snapshot);
  reordered.stages.reverse(); reordered.metrics.reverse(); reordered.importantArtifacts.reverse();
  delete reordered.snapshotDigest;
  reordered.snapshotDigest = canonicalJsonDigest(Object.fromEntries(Object.entries(reordered).filter(([key]) => !["apiVersion", "kind", "snapshotDigest"].includes(key))));
  assert.deepEqual(candidate.renderLifecycleRunReport({...options,snapshot:reordered}).bytes,candidate.renderLifecycleRunReport(options).bytes);
});

test("every stage source fact has an exact digest-bound source link", () => {
  const markdown = candidate.renderLifecycleRunReport(options).markdown;
  for (const value of stages) assert.match(markdown,new RegExp(`devrelay-artifact://${value.sourceFacts[0].artifactId}\\?digest=${value.sourceFacts[0].digest.slice(7)}`));
});

test("policy-denied top-level source links are omitted", () => {
  const markdown = candidate.renderLifecycleRunReport({...options,classifications:{"/ledger":"secret"}}).markdown;
  assert.doesNotMatch(markdown,/ledger-secret-link/);
});

test("read-only response is bound to exact snapshot, policy, and Markdown bytes", () => {
  const result = candidate.renderLifecycleRunReport(options);
  assert.equal(result.access.access,"read-only");
  assert.deepEqual(result.access.snapshot,{artifactId:snapshot.snapshotId,digest:snapshot.snapshotDigest});
  assert.deepEqual(result.access.contentPolicy,{artifactId:policy.policyId,digest:policy.policyDigest});
  assert.equal(result.access.markdownReport.digest,`sha256:${createHash("sha256").update(result.bytes).digest("hex")}`);
});
