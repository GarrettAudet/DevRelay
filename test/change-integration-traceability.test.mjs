import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { changeIntegrationTraceabilityContributor } from "../src/change-integration-traceability-contributor.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";

const D = `sha256:${"a".repeat(64)}`;
const commit = "b".repeat(40);
const ref = (artifactId, digest = D, schema = "https://devrelay.dev/test/v1", mediaType = "application/json") => ({ artifactId, schema, mediaType, digest, uri: `memory://${artifactId}` });
const pointer = ({ artifactId, digest }) => ({ artifactId, digest });
const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
function loaded(value, artifactId = value.recordId ?? value.subjectId ?? value.bindingId ?? value.traceabilityDigest ?? value.kind) {
  const bytes = Buffer.from(canonicalJson(value));
  return { value, bytes, ref: ref(artifactId, sha256Digest(bytes)) };
}
function replaceLoaded(entry, value) {
  entry.value = value;
  entry.bytes = Buffer.from(canonicalJson(value));
  entry.ref = { ...entry.ref, digest: sha256Digest(entry.bytes) };
}

function fixture() {
  const workItem = { id: "WI-CI-TRACE", "architecture-refs": ["EL-CI"], "contract-refs": ["CT-CI"] };
  const changeSet = { kind: "ChangeSetDraft", mutations: [{ path: "src/a.mjs" }] };
  const work = loaded(workItem, workItem.id), change = loaded(changeSet, "CS-CI");
  const architecture = loaded({ kind: "ArchitectureBaseline", sections: { architectureModel: { content: { elements: [{ id: "EL-CI" }] } } } }, "ARCH");
  const contracts = loaded({ kind: "ContractDisposition", contractTargets: [{ id: "CT-CI" }] }, "CONTRACTS");
  const other = ["REQ", "PO", "WBB", "WDB", "SAB"].map((id) => loaded({ kind: `${id}Baseline`, id }, id));
  const subject = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "VerifiedWorkItemSubject", subjectId: "CI-SUB", workItem: work.ref, changeSet: change.ref, verificationGateApproval: pointer(ref("GATE")), verificationEvidence: [pointer(ref("VERIFY"))] }, "subjectDigest");
  const subjectLoaded = loaded(subject, subject.subjectId);
  const baselines = { requirementsBaseline: other[0].ref, projectOverviewBaseline: other[1].ref, architectureBaseline: architecture.ref, contractDisposition: contracts.ref, workBreakdownBaseline: other[2].ref, workDependencyBaseline: other[3].ref, specialistAssignmentBaseline: other[4].ref };
  const binding = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "IntegrationInputBinding", bindingId: "BIND", subject: pointer(subjectLoaded.ref), baselines, target: { repositorySnapshot: pointer(ref("PRE")), ref: "refs/heads/main", expectedCommit: commit }, integrationPolicy: pointer(ref("POLICY")), adapter: { id: "adapter", version: "1.0.0", configurationDigest: D }, permissionDemands: [{ kind: "filesystem.write", scope: { values: ["repo"] } }], idempotencyKey: "CI-1" }, "bindingDigest");
  const bindingLoaded = loaded(binding, binding.bindingId);
  const record = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "IntegratedChangeRecord", recordId: "ICR-CI", subject: { artifactId: subject.subjectId, digest: subject.subjectDigest }, plan: pointer(ref("PLAN")), preState: { ref: "refs/heads/main", commit: "c".repeat(40), treeDigest: D }, postState: { ref: "refs/heads/main", commit, treeDigest: D }, integrationEvidence: [pointer(ref("NATIVE"))] }, "recordDigest");
  const recordLoaded = loaded(record, record.recordId);
  const snapshotLoaded = loaded({ apiVersion: "devrelay.dev/v1alpha1", kind: "RepositorySnapshot", repository: "repo", revision: commit, treeDigest: D, includedPaths: [], excludedPaths: [] }, "POST");
  const result = { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: "CI-INV", status: "completed", outcome: "integrated", outputs: { "integrated-change-record": [recordLoaded.ref], "repository-snapshot": [snapshotLoaded.ref] }, evidence: [{ kind: "change-integration/native-effect", subject: record.recordId, status: "pass", artifact: recordLoaded.ref }, { kind: "change-integration/post-state", subject: snapshotLoaded.ref.artifactId, status: "pass", artifact: snapshotLoaded.ref }], diagnostics: [] };
  const resultLoaded = loaded(result, "RESULT");
  const trace = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "ChangeIntegrationTraceabilityInput", integratedChange: pointer(recordLoaded.ref), subject: { artifactId: subject.subjectId, digest: subject.subjectDigest }, repositorySnapshot: pointer(snapshotLoaded.ref), authority: "approved", scope: "change-integration/integrated" }, "traceabilityDigest");
  const traceLoaded = loaded(trace, "TRACE");
  const context = { invocation: { invocationId: "CI-INV", module: { id: "change-integration", version: "0.1.0", operation: "integrate-change" } }, invocationFingerprint: D, moduleResult: result, loadedInputs: { "verified-work-item-subject": [subjectLoaded], "integration-input-binding": [bindingLoaded] }, loadedOutputs: { "integrated-change-record": [recordLoaded], "repository-snapshot": [snapshotLoaded] }, loadedAttachments: { result: resultLoaded, trace: traceLoaded, work, change, architecture, contracts, other } };
  return { context, recordLoaded, snapshotLoaded, traceLoaded };
}

test("exact integrated bytes project only the four forward factual relationships and merge idempotently", async () => {
  const { context } = fixture();
  const projection = await changeIntegrationTraceabilityContributor.project(context);
  assert.deepEqual(projection.edges.map(({ kind }) => kind).sort(), ["implemented-by", "integrated-as", "produces", "realized-by"]);
  assert.equal(projection.edges.some(({ kind }) => kind === "verified-by"), false);
  const sources = [
    ["work-breakdown/candidate", "candidate", "work-item", "WI-CI-TRACE"],
    ["architecture/baseline", "approved", "architecture-element", "EL-CI"],
    ["contracts/baseline", "approved", "contract", "CT-CI"],
  ].map(([scope, authority, kind, stableId], index) => ({ metadata: { id: `fixture.source-${index}`, version: "1.0.0" }, scope, authority, ownership: { scope, authority, nodeKinds: [kind], edgeKinds: [] }, match: () => true, project: () => ({ horizon: "implementation", nodes: [{ kind, stableId, label: stableId, attributes: {}, sourceLocators: projection.edges[0].sourceLocators }], edges: [] }) }));
  const service = createTraceabilityGraphService({ graphId: "ci-trace", projectId: "devrelay", store: createInMemoryTraceabilityStore(), contributors: [...sources, changeIntegrationTraceabilityContributor] });
  const starting = service.captureBase();
  assert.equal(starting.revision, 0);
  assert.equal(starting.snapshot.revision, 0);
  const prepared = await service.prepare({ ...context, baseGraph: starting });
  assert.deepEqual(prepared.baseGraphRef, starting.ref);
  assert.equal(prepared.updateRef.digest, sha256Digest(Buffer.from(canonicalJson(prepared.update))));
  assert.equal(prepared.update.producer.invocationId, context.invocation.invocationId);
  assert.equal(prepared.update.producer.invocationFingerprint, context.invocationFingerprint);
  const first = await service.mergePrepared(prepared);
  const replay = await service.mergePrepared(prepared);
  assert.equal(first.receipt.disposition, "merged");
  assert.deepEqual(first.receipt.previousGraph, starting.ref);
  assert.deepEqual(first.receipt.update, prepared.updateRef);
  assert.equal(first.receipt.revisionBefore, 0);
  assert.equal(first.receipt.revisionAfter, 1);
  assert.deepEqual(first.receipt.resultGraph, first.snapshotRef);
  assert.equal(first.snapshot.revision, 1);
  assert.deepEqual(first.snapshot.lastAppliedUpdate, prepared.updateRef);
  assert.deepEqual(first.snapshot.appliedUpdates, [prepared.updateRef]);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.deepEqual(replay.snapshot, first.snapshot);
  assert.equal(service.captureBase().revision, 1);
});

test("non-integrated, substituted, stale, and adapter-authored facts fail closed", async () => {
  const nonIntegrated = fixture().context;
  nonIntegrated.moduleResult.outcome = "integration-conflict";
  await assert.rejects(changeIntegrationTraceabilityContributor.project(nonIntegrated), /nonmatching/);
  const substituted = fixture().context;
  substituted.loadedOutputs["repository-snapshot"][0].value.revision = "d".repeat(40);
  await assert.rejects(changeIntegrationTraceabilityContributor.project(substituted), /canonical loaded value|post RepositorySnapshot/);
  const arbitrary = fixture().context;
  arbitrary.loadedAttachments.trace.value.graphOperations = [{ kind: "verified-by" }];
  await assert.rejects(changeIntegrationTraceabilityContributor.project(arbitrary), /canonical loaded value|invalid/);
  const stale = fixture().context;
  stale.loadedAttachments.work.value["architecture-refs"] = ["EL-UNKNOWN"];
  await assert.rejects(changeIntegrationTraceabilityContributor.project(stale), /canonical loaded value|does not resolve/);
});

test("ModuleResult schema, closed outputs, downstream claims, duplicate refs, and canonical stale refs fail closed", async () => {
  const malformed = fixture().context;
  const malformedResult = { ...malformed.moduleResult, evidence: [{ kind: "change-integration/native-effect", subject: "x", status: "unknown" }] };
  replaceLoaded(malformed.loadedAttachments.result, malformedResult);
  malformed.moduleResult = malformedResult;
  await assert.rejects(changeIntegrationTraceabilityContributor.project(malformed), /ModuleResult is invalid/);

  const extraOutput = fixture().context;
  const outputResult = structuredClone(extraOutput.moduleResult);
  outputResult.outputs.untrusted = [ref("UNTRUSTED")];
  replaceLoaded(extraOutput.loadedAttachments.result, outputResult);
  extraOutput.moduleResult = outputResult;
  await assert.rejects(changeIntegrationTraceabilityContributor.project(extraOutput), /extra output ports/);

  const downstream = fixture().context;
  const downstreamResult = { ...downstream.moduleResult, systemVerified: true };
  replaceLoaded(downstream.loadedAttachments.result, downstreamResult);
  downstream.moduleResult = downstreamResult;
  await assert.rejects(changeIntegrationTraceabilityContributor.project(downstream), /ModuleResult is invalid/);

  const duplicate = fixture().context;
  duplicate.loadedAttachments.duplicateWork = structuredClone(duplicate.loadedAttachments.work);
  await assert.rejects(changeIntegrationTraceabilityContributor.project(duplicate), /exactly one loaded artifact/);

  const stale = fixture().context;
  const staleBinding = structuredClone(stale.loadedInputs["integration-input-binding"][0].value);
  staleBinding.baselines.architectureBaseline = { ...staleBinding.baselines.architectureBaseline, digest: D };
  replaceLoaded(stale.loadedInputs["integration-input-binding"][0], seal(staleBinding, "bindingDigest"));
  await assert.rejects(changeIntegrationTraceabilityContributor.project(stale), /exactly one loaded artifact/);
});

test("the 1.4 endpoint policy rejects inverse integration facts", async () => {
  const { context } = fixture();
  const projection = await changeIntegrationTraceabilityContributor.project(context);
  const inverse = { ...changeIntegrationTraceabilityContributor, metadata: { id: "fixture.inverse", version: "1.0.0" }, project: () => ({ horizon: "implementation", nodes: projection.nodes, edges: [{ ...projection.edges.find(({ kind }) => kind === "integrated-as"), source: { kind: "integrated-change-record", stableId: "ICR-CI" }, target: { kind: "change-set", stableId: "CS-CI" } }] }) };
  const service = createTraceabilityGraphService({ graphId: "ci-inverse", projectId: "devrelay", store: createInMemoryTraceabilityStore(), contributors: [inverse] });
  await assert.rejects(service.prepare({ ...context, baseGraph: service.captureBase() }), /invalid integrated-change-record -> change-set endpoints/);
});
