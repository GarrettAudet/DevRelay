import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJsonDigest, sha256Digest } from "../../../../.verifier-candidate-002/src/content-digest.mjs";
import { createOpenSpecRequirementsAdapter } from "../../../../.verifier-candidate-002/src/openspec-requirements-adapter.mjs";
import { deriveProjectOverview, diffProjectOverviewSections } from "../../../../.verifier-candidate-002/src/project-overview.mjs";

const candidate = new URL("../../../../.verifier-candidate-002/", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, candidate), "utf8"));
const bytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

test("ArchitectureRevisionRequest approval against existing baselines produces the exact change-set pair", async () => {
  const [invocationTemplate, goal, context, requirementsBaseline, overviewBaseline, draft] = await Promise.all([
    readJson("examples/invocations/requirements-openspec.invocation.json"),
    readJson("examples/artifacts/goal-001.json"),
    readJson("examples/artifacts/project-context-001.json"),
    readJson("project/requirements-baseline.json"),
    readJson("project/project-overview-baseline.json"),
    readJson("examples/artifacts/requirements-draft-001.json"),
  ]);
  const store = new Map();
  const add = (id, schema, mediaType, value) => {
    const raw = bytes(value);
    const ref = { artifactId: id, schema, mediaType, digest: sha256Digest(raw) };
    store.set(id, raw);
    return ref;
  };
  const goalRef = add(goal.goalId, "https://devrelay.dev/artifacts/goal/v1", "application/vnd.devrelay.goal+json", goal);
  const contextRef = add(context.projectId, "https://devrelay.dev/artifacts/project-context/v1", "application/vnd.devrelay.project-context+json", context);
  const baselineRef = add(requirementsBaseline.baselineId, "https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json", requirementsBaseline);
  overviewBaseline.requirementsBaseline = { artifactId: baselineRef.artifactId, digest: baselineRef.digest };
  const overviewRef = add(overviewBaseline.baselineId, "https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json", overviewBaseline);
  const proposedRequirements = structuredClone(draft.requirements);
  const rewriteRefs = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.artifactId === "goal-001") Object.assign(value, { artifactId: goalRef.artifactId, digest: goalRef.digest });
    if (value.artifactId === "project-context-001") Object.assign(value, { artifactId: contextRef.artifactId, digest: contextRef.digest });
    for (const child of Object.values(value)) rewriteRefs(child);
  };
  rewriteRefs(proposedRequirements);
  let phase = "clarify";
  const adapter = createOpenSpecRequirementsAdapter({
    async loadArtifact(ref) { return store.get(ref.artifactId); },
    async persistArtifact({ artifactId, schema, mediaType, digest, bytes: raw }) {
      store.set(artifactId, Buffer.from(raw));
      return { artifactId, schema, mediaType, digest };
    },
    async executeCapability(request) {
      if (phase === "clarify") return {
        apiVersion: "devrelay.dev/v1alpha1", kind: "OpenSpecRequirementsClarification", binding: request.binding,
        questions: [{ id: "Q-ARCH-REVISION", prompt: "Approve ArchitectureRevisionRequest?", rationale: "The architecture decision changes approved requirements.", blocking: true, responseType: "single-choice", options: ["approve", "reject"] }],
        workingRequirements: proposedRequirements, confirmedFacts: [],
        nativeArtifacts: [{ role: "proposal", path: "openspec/changes/architecture-revision/proposal.md", mediaType: "text/markdown; charset=utf-8", content: "# ArchitectureRevisionRequest\n" }],
      };
      assert.equal(request.clarificationContinuation.responses.value.responses[0].answer, "approve");
      return {
        apiVersion: "devrelay.dev/v1alpha1", kind: "OpenSpecRequirementsProposal", binding: request.binding,
        requirements: proposedRequirements,
        nativeArtifacts: [{ role: "spec", path: "openspec/changes/architecture-revision/specs/requirements/spec.md", mediaType: "text/markdown; charset=utf-8", content: "# Approved ArchitectureRevisionRequest\n" }],
      };
    },
  });
  const invocation = structuredClone(invocationTemplate);
  invocation.inputs = { goal: [goalRef], "project-context": [contextRef], "requirements-baseline": [baselineRef], "project-overview-baseline": [overviewRef] };
  const producer = { invocationId: invocation.invocationId, invocationFingerprint: `sha256:${"1".repeat(64)}`, plugin: invocation.plugin, stepInvocationDigest: `sha256:${"2".repeat(64)}` };
  const clarification = await adapter.invoke(invocation, {}, producer);
  const requestRef = clarification.outputs["clarification-requests"][0];
  const continuationRef = clarification.outputs.continuation[0];
  const response = { apiVersion: "devrelay.dev/v1alpha1", kind: "ClarificationResponseSet", request: { artifactId: requestRef.artifactId, digest: requestRef.digest }, responses: [{ questionId: "Q-ARCH-REVISION", answer: "approve" }] };
  const responseRef = add("architecture-revision-approval", "https://devrelay.dev/artifacts/clarification-response-set/v1", "application/vnd.devrelay.clarification-response-set+json", response);
  const resumed = structuredClone(invocation);
  resumed.invocationId = `${invocation.invocationId}-resumed`;
  resumed.inputs = { ...invocation.inputs, "clarification-request": [requestRef], "clarification-responses": [responseRef], continuation: [continuationRef] };
  phase = "resume";
  const result = await adapter.invoke(resumed, {}, { ...producer, invocationId: resumed.invocationId });
  assert.equal(result.outcome, "change_set_drafted");
  assert.equal(result.outputs["requirements-draft"], undefined);
  assert.equal(result.outputs["project-overview-draft"], undefined);
  const changeRef = result.outputs["requirements-change-set"][0];
  const overviewChangeRef = result.outputs["project-overview-change-set-draft"][0];
  const change = JSON.parse(store.get(changeRef.artifactId));
  const overviewChange = JSON.parse(store.get(overviewChangeRef.artifactId));
  const expectedRequirementsSections = Object.keys(proposedRequirements)
    .filter((section) => canonicalJsonDigest(requirementsBaseline.requirements[section]) !== canonicalJsonDigest(proposedRequirements[section]))
    .sort();
  const expectedOverview = deriveProjectOverview(proposedRequirements);
  const expectedOverviewSections = diffProjectOverviewSections(overviewBaseline.overview, expectedOverview);
  assert.deepEqual(change.changedSections, expectedRequirementsSections);
  assert.deepEqual(overviewChange.changedSections, expectedOverviewSections);
  assert.deepEqual(change.baseline, { artifactId: baselineRef.artifactId, digest: baselineRef.digest });
  assert.deepEqual(overviewChange.baseOverview, { artifactId: overviewRef.artifactId, digest: overviewRef.digest });
  assert.equal(change.expectedRequirementsDigest, canonicalJsonDigest(requirementsBaseline.requirements));
  const bundleRef = result.outputs["native-source-bundle"][0];
  const bundle = JSON.parse(store.get(bundleRef.artifactId));
  assert.deepEqual(bundle.canonicalOutputs.map(({ artifactId, digest }) => ({ artifactId, digest })), [
    { artifactId: changeRef.artifactId, digest: changeRef.digest },
    { artifactId: overviewChangeRef.artifactId, digest: overviewChangeRef.digest },
  ]);
  assert.equal(bundle.sources.length, 1);
  assert.equal(store.get(bundle.sources[0].artifact.artifactId).toString("utf8"), "# Approved ArchitectureRevisionRequest\n");
});
