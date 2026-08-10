import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";
import {
  specialistAssignmentBaselineTraceabilityContributor,
  specialistAssignmentCandidateTraceabilityContributor,
} from "../src/specialist-assignment-traceability-contributor.mjs";

const dogfood = new URL("../dogfood/specialist-assignment/assignment/", import.meta.url);
function loaded(value, schema, mediaType, id) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return { value, bytes, ref: { artifactId: id, schema, mediaType, digest: sha256Digest(bytes), uri: `memory://trace/${id}.json` } };
}
function seedContributor() {
  return {
    metadata: { id: "fixture.work-breakdown", version: "1.0.0" },
    scope: "work-breakdown/candidate",
    authority: "candidate",
    ownership: { scope: "work-breakdown/candidate", authority: "candidate", nodeKinds: ["work-item"], edgeKinds: [] },
    match: ({ invocation }) => invocation.module.id === "fixture-seed",
    project: ({ loadedOutputs }) => ({
      horizon: "implementation",
      nodes: loadedOutputs.seed[0].value.workItems.map((workItem, index) => ({
        kind: "work-item",
        stableId: workItem.id,
        label: workItem.id,
        attributes: {},
        sourceLocators: [{ artifact: { artifactId: loadedOutputs.seed[0].ref.artifactId, digest: loadedOutputs.seed[0].ref.digest }, jsonPointer: `/workItems/${index}`, entityDigest: canonicalJsonDigest(workItem) }],
      })),
      edges: [],
    }),
  };
}
async function apply(service, invocation, outcome, outputs, loadedOutputs) {
  const prepared = await service.prepare({
    baseGraph: service.captureBase(),
    invocation,
    invocationFingerprint: canonicalJsonDigest(invocation),
    moduleResult: { invocationId: invocation.invocationId, status: "completed", outcome, outputs, evidence: [] },
    loadedOutputs,
  });
  return { prepared, merged: await service.mergePrepared(prepared) };
}

test("trusted contributors project separate proposed and approved assignment facts", async () => {
  const draftValue = JSON.parse(readFileSync(new URL("specialist-assignment-draft.json", dogfood), "utf8"));
  const baselineValue = JSON.parse(readFileSync(new URL("specialist-assignment-baseline.json", dogfood), "utf8"));
  const service = createTraceabilityGraphService({
    graphId: "specialist-assignment-trace",
    projectId: "devrelay",
    store: createInMemoryTraceabilityStore(),
    contributors: [seedContributor(), specialistAssignmentCandidateTraceabilityContributor, specialistAssignmentBaselineTraceabilityContributor],
  });
  const seed = loaded({ workItems: draftValue.assignments.map(({ workItemRef }) => ({ id: workItemRef })) }, "https://devrelay.dev/fixtures/work-items/v1", "application/json", "seed-sa-work");
  await apply(service, { invocationId: "seed", module: { id: "fixture-seed", version: "1.0.0", operation: "seed" } }, "seeded", { seed: [seed.ref] }, { seed: [seed] });

  const draft = loaded(draftValue, "https://devrelay.dev/artifacts/specialist-assignment-draft/v1", "application/vnd.devrelay.specialist-assignment-draft+json", draftValue.draftId);
  const candidate = await apply(service, { invocationId: "sa", module: { id: "specialist-assignment", version: "1.0.0", operation: "assign-specialists" } }, "assigned", { "specialist-assignment-draft": [draft.ref] }, { "specialist-assignment-draft": [draft] });
  assert.equal(candidate.prepared.update.edgeChanges.length, 9);
  assert.equal(candidate.merged.snapshot.edges.filter(({ kind }) => kind === "proposed-assignment").length, 9);
  assert.equal(candidate.merged.snapshot.edges.filter(({ kind }) => kind === "assigned-to").length, 0);

  const baseline = loaded(baselineValue, "https://devrelay.dev/artifacts/specialist-assignment-baseline/v1", "application/vnd.devrelay.specialist-assignment-baseline+json", baselineValue.baselineId);
  const approved = await apply(service, { invocationId: "sa-gate", module: { id: "specialist-assignment-gate", version: "1.0.0", operation: "promote-baseline" } }, "promoted", { "specialist-assignment-baseline": [baseline.ref] }, { "specialist-assignment-baseline": [baseline] });
  assert.equal(approved.merged.snapshot.edges.filter(({ kind }) => kind === "proposed-assignment").length, 9);
  assert.equal(approved.merged.snapshot.edges.filter(({ kind }) => kind === "assigned-to").length, 9);
  assert.equal(approved.merged.snapshot.nodes.filter(({ kind }) => kind === "specialist-profile").length, 4);
});