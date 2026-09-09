import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createDesktopOrchestrationPlan } from "../src/desktop-orchestration.mjs";
import { createHumanOrchestrationSourceBundle, createHumanOrchestrationView } from "../src/human-orchestration.mjs";
import { humanOrchestrationCandidateTraceabilityContributor } from "../src/human-orchestration-traceability-contributor.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
function loaded(value, artifactId) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return {
    value,
    bytes,
    ref: {
      artifactId,
      digest: sha256Digest(bytes),
      schema: "https://devrelay.dev/contracts/human-orchestration-artifacts.schema.json",
      mediaType: "application/json",
      uri: `memory://human-orchestration/${artifactId}`,
    },
  };
}
const result = (invocationId) => ({ apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId, status: "completed", outcome: "view-projected", outputs: {}, evidence: [], diagnostics: [] });
const plan = createDesktopOrchestrationPlan({ runId: "RUN-HO-TRACE", projectId: "devrelay", horizonDigest: digest("a"), startingRevision: "revision", workItems: [{ id: "WI-HO-TRACE", dependencies: [] }] });
const sourceValue = createHumanOrchestrationSourceBundle({ projectId: "devrelay", orchestrationRun: { kind: "LocalHostRunState", version: 1, state: { plan, workState: { "WI-HO-TRACE": { status: "pending", receipts: [] } }, blockers: [], recovery: "clean" } }, taskObservations: [{ taskId: "TASK-HO-TRACE", workItemId: "WI-HO-TRACE", status: "ready" }] });

test("trusted HumanOrchestration contributor projects exact candidate lineage without authority", async () => {
  const source = loaded(sourceValue, "HO-SOURCE");
  const view = loaded(createHumanOrchestrationView(sourceValue), "HO-VIEW");
  const invocation = { invocationId: "HO-CANDIDATE", module: { id: "human-orchestration", version: "0.1.0", operation: "project-operator-view" } };
  const graph = createTraceabilityGraphService({ graphId: "devrelay/ho-trace", projectId: "devrelay", store: createInMemoryTraceabilityStore(), contributors: [humanOrchestrationCandidateTraceabilityContributor] });
  const prepared = await graph.prepare({ projectId: "devrelay", invocation, invocationFingerprint: canonicalJsonDigest(invocation), moduleResult: result(invocation.invocationId), loadedInputs: { source: [source] }, loadedOutputs: { view: [view] }, baseGraph: graph.captureBase() });
  const merged = await graph.mergePrepared(prepared);

  assert.equal(merged.snapshot.edges.some(({ scope, authority, kind }) => scope === "human-orchestration/candidate" && authority === "candidate" && kind === "derived-from"), true);
  assert.equal(humanOrchestrationCandidateTraceabilityContributor.authority, "candidate");
  assert.deepEqual(humanOrchestrationCandidateTraceabilityContributor.ownership.nodeKinds, []);
  assert.equal(humanOrchestrationCandidateTraceabilityContributor.ownership.edgeKinds.includes("derived-from"), true);
});

test("contributor rejects substituted invocations and drifted exact bytes", async () => {
  const view = loaded(createHumanOrchestrationView(sourceValue), "HO-VIEW");
  assert.equal(humanOrchestrationCandidateTraceabilityContributor.match({ invocation: { module: { id: "desktop-orchestration", version: "0.1.0", operation: "project-run" } }, loadedOutputs: { view: [view] } }), false);
  const drifted = { ...view, bytes: Buffer.from(`${canonicalJson(view.value)} `, "utf8") };
  await assert.rejects(
    () => humanOrchestrationCandidateTraceabilityContributor.project({ invocation: { module: { id: "human-orchestration", version: "0.1.0", operation: "project-operator-view" } }, loadedOutputs: { view: [drifted] } }),
    /bytes or digest drifted/u,
  );
});
