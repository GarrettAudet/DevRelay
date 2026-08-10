import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import {
  TRACEABILITY_GRAPH_MEDIA_TYPE,
  TRACEABILITY_GRAPH_SCHEMA,
} from "../../../src/traceability-artifact-validator.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../../../src/traceability-graph.mjs";
import {
  specialistAssignmentBaselineTraceabilityContributor,
  specialistAssignmentCandidateTraceabilityContributor,
} from "../../../src/specialist-assignment-traceability-contributor.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const write = (path, value) => writeFileSync(new URL(path, import.meta.url), canonicalJson(value) + "\n");
const loaded = (value, schema, mediaType, artifactId, uri) => {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return { value, bytes, ref: { artifactId, schema, mediaType, digest: sha256Digest(bytes), uri } };
};
const priorGraph = read("../dependency-analysis/traceability-graph-snapshot.json");
const priorProof = read("../dependency-analysis/work-dependency-gate-promotion-proof.json");
const draftValue = read("./specialist-assignment-draft.json");
const baselineValue = read("./specialist-assignment-baseline.json");
const store = createInMemoryTraceabilityStore();
const priorBytes = Buffer.from(canonicalJson(priorGraph), "utf8");
const priorLoaded = { value: priorGraph, bytes: priorBytes, ref: priorProof.traceability.resultingGraph };
if (sha256Digest(priorBytes) !== priorLoaded.ref.digest) throw new Error("prior graph bytes do not match promotion proof");
const historicalPaths = new Map([
  ["sha256:4d7d052f347a91b104506510dc09dad51dceeb488bac5675a89ce7ca8af45067", "../../work-dependency-analysis/work-breakdown/traceability-update.json"],
  ["sha256:c77144d83d451837ac01023be26d745fe80f14fbae427d9c8a848fc9e7abd4fe", "../dependency-analysis/traceability-update.json"],
  ["sha256:b9b77863db97ccfe1aa36c24224e5cd523030500908afb208b5883b24b6a8822", "../../work-breakdown/work-breakdown/traceability-update.json"],
  ["sha256:dc46268ba73b6924b2c473d2fb6294dbef7267dfd0846b72525c6fa58da84681", "../work-breakdown/traceability-update.json"],
]);
const historicalUpdates = priorGraph.appliedUpdates.map((ref) => {
  const update = read(historicalPaths.get(ref.digest));
  const bytes = Buffer.from(canonicalJson(update), "utf8");
  if (sha256Digest(bytes) !== ref.digest) throw new Error(`historical update ${ref.digest} bytes are unavailable`);
  return { ref, bytes, value: update };
});
store.restore(priorGraph.graphId, [priorLoaded, ...historicalUpdates], priorLoaded.ref);
const service = createTraceabilityGraphService({
  graphId: priorGraph.graphId,
  projectId: priorGraph.projectId,
  store,
  contributors: [specialistAssignmentCandidateTraceabilityContributor, specialistAssignmentBaselineTraceabilityContributor],
});
async function merge({ invocation, outcome, name, artifact }) {
  const prepared = await service.prepare({
    baseGraph: service.captureBase(),
    invocation,
    invocationFingerprint: canonicalJsonDigest(invocation),
    moduleResult: { invocationId: invocation.invocationId, status: "completed", outcome, outputs: { [name]: [artifact.ref] }, evidence: [] },
    loadedOutputs: { [name]: [artifact] },
  });
  const merged = await service.mergePrepared(prepared);
  return { prepared, merged };
}
const draft = loaded(draftValue, "https://devrelay.dev/artifacts/specialist-assignment-draft/v1", "application/vnd.devrelay.specialist-assignment-draft+json", draftValue.draftId, "file:///dogfood/specialist-assignment/assignment/specialist-assignment-draft.json");
const candidate = await merge({
  invocation: { invocationId: "SA-DOGFOOD-001", module: { id: "specialist-assignment", version: "1.0.0", operation: "assign-specialists" } },
  outcome: "assigned",
  name: "specialist-assignment-draft",
  artifact: draft,
});
const baseline = loaded(baselineValue, "https://devrelay.dev/artifacts/specialist-assignment-baseline/v1", "application/vnd.devrelay.specialist-assignment-baseline+json", baselineValue.baselineId, "file:///project/specialist-assignment-baseline.json");
const approved = await merge({
  invocation: { invocationId: "SA-GATE-DOGFOOD-001", module: { id: "specialist-assignment-gate", version: "1.0.0", operation: "promote-baseline" } },
  outcome: "promoted",
  name: "specialist-assignment-baseline",
  artifact: baseline,
});
const proof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "SpecialistAssignmentPromotionProof",
  approvedBaseline: baseline.ref,
  candidateTraceabilityUpdate: candidate.prepared.updateRef,
  candidateTraceabilityReceipt: candidate.merged.receiptRef,
  approvedTraceabilityUpdate: approved.prepared.updateRef,
  approvedTraceabilityReceipt: approved.merged.receiptRef,
  resultingGraph: approved.merged.snapshotRef,
  resultingGraphRevision: approved.merged.snapshot.revision,
  nextModule: "WorkExecution",
};
write("./candidate-traceability-update.json", candidate.prepared.update);
write("./candidate-traceability-merge-receipt.json", candidate.merged.receipt);
write("./approved-traceability-update.json", approved.prepared.update);
write("./approved-traceability-merge-receipt.json", approved.merged.receipt);
write("./traceability-graph-snapshot.json", approved.merged.snapshot);
write("./specialist-assignment-promotion-proof.json", proof);
write("../../../project/specialist-assignment-baseline.json", baselineValue);
write("../../../project/specialist-assignment-promotion.commit.json", proof);
console.log(JSON.stringify({ baselineDigest: baseline.ref.digest, graphRevision: proof.resultingGraphRevision, graphDigest: proof.resultingGraph.digest, nextModule: proof.nextModule }, null, 2));