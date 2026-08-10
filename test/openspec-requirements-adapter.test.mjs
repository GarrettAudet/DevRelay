import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { createOpenSpecRequirementsAdapter, OpenSpecRequirementsAdapterError } from "../src/openspec-requirements-adapter.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";

const root = new URL("../", import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const [moduleDefinition, pluginDefinition, invocationFixture, goalFixture, contextFixture, draftFixture, requirementsBaselineFixture, overviewBaselineFixture, dr4200Fixture] = await Promise.all([
  json("examples/modules/requirements-gathering.module.json"),
  json("examples/plugins/openspec.plugin.json"),
  json("examples/invocations/requirements-openspec.invocation.json"),
  json("examples/artifacts/goal-001.json"),
  json("examples/artifacts/project-context-001.json"),
  json("examples/artifacts/requirements-draft-001.json"),
  json("examples/artifacts/requirements-baseline-001.json"),
  json("examples/artifacts/project-overview-baseline-001.json"),
  json("dogfood/bootstrap-open-spec-requirements-adapter/verification/dr4200-historical-provenance-repair-001/minimized-source-ref-fixture.json"),
]);
const overviewMarkdownFixture = await readFile(new URL("examples/artifacts/ProjectOverview.md", root));

const artifactBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const checkpointStore = () => { const values = new Map(); return { values, async get(key) { return values.get(key); }, async put(key, value) { values.set(key, structuredClone(value)); } }; };

function harness(executeCapability) {
  const store = new Map();
  const add = (artifactId, schema, mediaType, value) => {
    const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : artifactBytes(value);
    const ref = { artifactId, schema, mediaType, digest: sha256Digest(bytes), uri: `artifact://openspec-adapter-test/${artifactId}` };
    store.set(artifactId, bytes);
    return ref;
  };
  const ports = {
    executeCapability,
    async loadArtifact(ref) { const bytes = store.get(ref.artifactId); if (!bytes) throw new Error(`missing ${ref.artifactId}`); return Buffer.from(bytes); },
    async persistArtifact({ artifactId, schema, mediaType, digest, bytes }) {
      assert.equal(sha256Digest(bytes), digest);
      const ref = { artifactId, schema, mediaType, digest, uri: `artifact://openspec-adapter-test/${artifactId}` };
      store.set(artifactId, Buffer.from(bytes));
      return ref;
    },
  };
  const adapter = createOpenSpecRequirementsAdapter(ports);
  const registry = createModuleRegistry({ modules: [moduleDefinition], plugins: [{ definition: pluginDefinition, adapter }], artifactContracts: requirementsRuntimeArtifactContracts() });
  const artifacts = { async load(ref) { return ports.loadArtifact(ref); } };
  return { add, artifacts, registry, store };
}

function rewritePointers(value, pointers) {
  if (!value || typeof value !== "object") return;
  if (typeof value.artifactId === "string" && pointers.has(value.artifactId)) Object.assign(value, pointers.get(value.artifactId));
  for (const child of Object.values(value)) rewritePointers(child, pointers);
}

function featureInvocation(h, slug, token) {
  const goal = structuredClone(goalFixture), context = structuredClone(contextFixture);
  goal.goalId = `goal-${slug}`;
  goal.statement = `Deliver bounded ${slug.replaceAll("-", " ")} behavior.`;
  goal.objectives = [`Enable ${slug.replaceAll("-", " ")} for its intended users.`];
  context.projectId = `project-${slug}`;
  context.summary = `Context for the ${slug.replaceAll("-", " ")} capability.`;
  const goalRef = h.add(goal.goalId, "https://devrelay.dev/artifacts/goal/v1", "application/vnd.devrelay.goal+json", goal);
  const contextRef = h.add(context.projectId, "https://devrelay.dev/artifacts/project-context/v1", "application/vnd.devrelay.project-context+json", context);
  const invocation = structuredClone(invocationFixture);
  invocation.invocationId = `invocation-${slug}`; invocation.runId = `run-${slug}`;
  invocation.inputs = { goal: [goalRef], "project-context": [contextRef] };
  invocation.config.changeName = slug; invocation.config.projectRoot = "/workspace";
  const requirements = structuredClone(draftFixture.requirements);
  const serialized = JSON.stringify(requirements).replaceAll("AUTH", token).replaceAll("authentication", slug.replaceAll("-", " ")).replaceAll("Authentication", slug.replaceAll("-", " "));
  const rewritten = JSON.parse(serialized);
  rewritePointers(rewritten, new Map([["goal-001", { artifactId: goalRef.artifactId, digest: goalRef.digest }], ["project-context-001", { artifactId: contextRef.artifactId, digest: contextRef.digest }]]));
  rewritten.currentStatus.lifecycle = context.lifecycle;
  return { invocation, requirements: rewritten };
}

function proposal(request, requirements, slug) {
  return { apiVersion: "devrelay.dev/v1alpha1", kind: "OpenSpecRequirementsProposal", binding: request.binding, requirements, nativeArtifacts: [
    { role: "proposal", path: `openspec/changes/${slug}/proposal.md`, mediaType: "text/markdown; charset=utf-8", content: `# ${slug}\n\nBounded proposal.\n` },
    { role: "spec", path: `openspec/changes/${slug}/specs/requirements/spec.md`, mediaType: "text/markdown; charset=utf-8", content: `# Requirements\n\nFeature: ${slug}.\n` },
  ] };
}

test("two unrelated goals execute generically through the released runtime and replay calls the executor zero times", async () => {
  let calls = 0; const byInvocation = new Map();
  const h = harness(async (request) => { calls += 1; const data = byInvocation.get(request.invocation.invocationId); assert.ok(data); assert.deepEqual(request.inputs.goal.value, data.goal); return proposal(request, data.requirements, data.slug); });
  for (const [slug, token] of [["museum-audio-guide", "MUSEUM"], ["warehouse-temperature-alerts", "WAREHOUSE"]]) {
    const data = featureInvocation(h, slug, token);
    data.slug = slug; data.goal = JSON.parse(h.store.get(data.invocation.inputs.goal[0].artifactId));
    byInvocation.set(data.invocation.invocationId, data);
    const checkpoints = checkpointStore();
    const first = await h.registry.execute(data.invocation, { artifacts: h.artifacts, checkpoints });
    const afterFirst = calls;
    const replay = await h.registry.execute(data.invocation, { artifacts: h.artifacts, checkpoints });
    assert.equal(first.outcome, "drafted"); assert.deepEqual(replay, first); assert.equal(calls, afterFirst); assert.equal(checkpoints.values.size, 1);
  }
  assert.equal(calls, 2);
});

test("clarification issuance and cross-invocation continuation carry exact lineage without conversational memory", async () => {
  let calls = 0, phase = "clarify", finalRequirements;
  const h = harness(async (request) => {
    calls += 1;
    if (phase === "clarify") return { apiVersion: "devrelay.dev/v1alpha1", kind: "OpenSpecRequirementsClarification", binding: request.binding, questions: [{ id: "Q-MUSEUM-LANGUAGE-001", prompt: "Which launch language is required?", rationale: "It changes content acceptance criteria.", blocking: true, responseType: "single-choice", options: ["English", "French"] }], workingRequirements: finalRequirements, confirmedFacts: ["Visitors use a mobile device."], nativeArtifacts: [{ role: "proposal", path: "openspec/changes/museum-audio-guide/proposal.md", mediaType: "text/markdown; charset=utf-8", content: "# Museum audio guide\n\nLanguage unresolved.\n" }] };
    assert.equal(request.clarificationContinuation.responses.value.responses[0].answer, "French");
    return proposal(request, finalRequirements, "museum-audio-guide");
  });
  const firstData = featureInvocation(h, "museum-audio-guide", "MUSEUM"); finalRequirements = firstData.requirements;
  const checkpoints = checkpointStore();
  const first = await h.registry.execute(firstData.invocation, { artifacts: h.artifacts, checkpoints });
  assert.equal(first.outcome, "needs_clarification");
  const requestRef = first.outputs["clarification-requests"][0], continuationRef = first.outputs.continuation[0];
  const response = { apiVersion: "devrelay.dev/v1alpha1", kind: "ClarificationResponseSet", request: { artifactId: requestRef.artifactId, digest: requestRef.digest }, responses: [{ questionId: "Q-MUSEUM-LANGUAGE-001", answer: "French" }] };
  const responseRef = h.add("clarification-response-museum", "https://devrelay.dev/artifacts/clarification-response-set/v1", "application/vnd.devrelay.clarification-response-set+json", response);
  const resumed = structuredClone(firstData.invocation); resumed.invocationId = "invocation-museum-audio-guide-resumed"; resumed.runId = "run-museum-audio-guide-resumed";
  resumed.inputs = { ...resumed.inputs, "clarification-request": [requestRef], "clarification-responses": [responseRef], continuation: [continuationRef] };
  phase = "resume";
  const result = await h.registry.execute(resumed, { artifacts: h.artifacts, checkpoints });
  assert.equal(result.outcome, "drafted"); assert.equal(calls, 2);
});

function baselineRevision(h) {
  const goal = structuredClone(goalFixture), context = structuredClone(contextFixture), requirementsBaseline = structuredClone(requirementsBaselineFixture), overviewBaseline = structuredClone(overviewBaselineFixture);
  requirementsBaseline.requirements.assumptions[0].sourceRefs.push(structuredClone(dr4200Fixture.historicalSourceRef));
  const sourceRefKey = (source) => [source.role, source.artifact.artifactId, source.artifact.digest, source.location ?? ""].join("\0");
  requirementsBaseline.requirements.assumptions[0].sourceRefs.sort((left, right) => sourceRefKey(left).localeCompare(sourceRefKey(right)));
  goal.goalId = "goal-architecture-revision"; goal.statement = "Apply the approved ArchitectureRevisionRequest to the requirements baseline.";
  const goalRef = h.add(goal.goalId, "https://devrelay.dev/artifacts/goal/v1", "application/vnd.devrelay.goal+json", goal);
  const contextRef = h.add(context.projectId, "https://devrelay.dev/artifacts/project-context/v1", "application/vnd.devrelay.project-context+json", context);
  const baselineRef = h.add(requirementsBaseline.baselineId, "https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json", requirementsBaseline);
  overviewBaseline.requirementsBaseline = { artifactId: baselineRef.artifactId, digest: baselineRef.digest };
  assert.equal(sha256Digest(overviewMarkdownFixture), overviewBaseline.renderedDocument.artifact.digest);
  h.store.set(overviewBaseline.renderedDocument.artifact.artifactId, Buffer.from(overviewMarkdownFixture));
  const overviewRef = h.add(overviewBaseline.baselineId, "https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json", overviewBaseline);
  const replacement = structuredClone(requirementsBaseline.requirements);
  const rebindSources = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value.sourceRefs)) for (const source of value.sourceRefs) {
      if (source.role === "goal") source.artifact = { artifactId: goalRef.artifactId, digest: goalRef.digest };
      else if (source.role === "project-context") source.artifact = { artifactId: contextRef.artifactId, digest: contextRef.digest };
    }
    for (const child of Object.values(value)) rebindSources(child);
  };
  rebindSources(replacement);
  replacement.risks = [...replacement.risks, "Architecture revision compatibility must be verified."].sort();
  const invocation = structuredClone(invocationFixture); invocation.invocationId = "invocation-architecture-revision"; invocation.runId = "run-architecture-revision"; invocation.config.changeName = "architecture-revision";
  invocation.inputs = { goal: [goalRef], "project-context": [contextRef], "requirements-baseline": [baselineRef], "project-overview-baseline": [overviewRef] };
  return { invocation, replacement, requirementsBaseline, overviewBaseline, refs: { goalRef, contextRef, baselineRef, overviewRef } };
}

test("ArchitectureRevisionRequest clarification produces an exhaustive paired baseline revision through released runtime and replays with zero calls", async () => {
  let calls = 0, phase = "clarify", data;
  const h = harness(async (request) => {
    calls += 1;
    if (phase === "clarify") return { apiVersion: "devrelay.dev/v1alpha1", kind: "OpenSpecRequirementsClarification", binding: request.binding, questions: [{ id: dr4200Fixture.clarification.id, prompt: "Approve ArchitectureRevisionRequest?", rationale: "The architecture decision changes approved requirements.", blocking: true, responseType: "single-choice", options: dr4200Fixture.clarification.options }], workingRequirements: data.replacement, confirmedFacts: [], nativeArtifacts: [{ role: "proposal", path: "openspec/changes/architecture-revision/proposal.md", mediaType: "text/markdown; charset=utf-8", content: "# ArchitectureRevisionRequest\n" }] };
    assert.equal(request.clarificationContinuation.responses.value.responses[0].answer, dr4200Fixture.clarification.options[0]);
    return proposal(request, data.replacement, "architecture-revision");
  });
  data = baselineRevision(h); const checkpoints = checkpointStore();
  const clarification = await h.registry.execute(data.invocation, { artifacts: h.artifacts, checkpoints });
  const requestRef = clarification.outputs["clarification-requests"][0], continuationRef = clarification.outputs.continuation[0];
  const callsAfterClarification = calls;
  const clarificationReplay = await h.registry.execute(data.invocation, { artifacts: h.artifacts, checkpoints });
  assert.deepEqual(clarificationReplay, clarification); assert.equal(calls, callsAfterClarification);
  const responseRef = h.add("architecture-revision-approval", "https://devrelay.dev/artifacts/clarification-response-set/v1", "application/vnd.devrelay.clarification-response-set+json", { apiVersion: "devrelay.dev/v1alpha1", kind: "ClarificationResponseSet", request: { artifactId: requestRef.artifactId, digest: requestRef.digest }, responses: [{ questionId: dr4200Fixture.clarification.id, answer: dr4200Fixture.clarification.options[0] }] });
  const resumed = structuredClone(data.invocation); resumed.invocationId += "-resumed"; resumed.runId += "-resumed"; resumed.inputs = { ...resumed.inputs, "clarification-request": [requestRef], "clarification-responses": [responseRef], continuation: [continuationRef] };
  phase = "resume";
  const result = await h.registry.execute(resumed, { artifacts: h.artifacts, checkpoints });
  const callsAfterFresh = calls, replay = await h.registry.execute(resumed, { artifacts: h.artifacts, checkpoints });
  assert.equal(result.outcome, "change_set_drafted"); assert.deepEqual(replay, result); assert.equal(calls, callsAfterFresh);
  assert.equal(result.outputs["requirements-draft"], undefined); assert.equal(result.outputs["project-overview-draft"], undefined);
  const change = JSON.parse(h.store.get(result.outputs["requirements-change-set"][0].artifactId));
  const overviewChange = JSON.parse(h.store.get(result.outputs["project-overview-change-set-draft"][0].artifactId));
  const exhaustive = Object.keys(data.replacement).filter((section) => canonicalJsonDigest(data.requirementsBaseline.requirements[section]) !== canonicalJsonDigest(data.replacement[section])).sort();
  assert.deepEqual(change.changedSections, exhaustive); assert.equal(overviewChange.changeDisposition, overviewChange.changedSections.length ? "changed" : "unchanged");
  assert.deepEqual(change.baseline, { artifactId: data.refs.baselineRef.artifactId, digest: data.refs.baselineRef.digest });
  assert.deepEqual(overviewChange.baseOverview, { artifactId: data.refs.overviewRef.artifactId, digest: data.refs.overviewRef.digest });
  assert.deepEqual(change.replacement.assumptions[0].sourceRefs.find(({ role }) => role === dr4200Fixture.historicalSourceRef.role), dr4200Fixture.historicalSourceRef);
  assert.equal(calls, 2);
});

test("baseline-inherited historical provenance is identity-bound and newly injected hidden context still fails DR4200", async () => {
  for (const mutate of [
    (source) => { source.role = "new-feature-decision"; },
    (source) => { source.artifact.artifactId = "hidden-feature-context"; },
    (source) => { source.artifact.digest = `sha256:${"0".repeat(64)}`; },
    (source) => { source.location += " mutated"; },
  ]) {
    let data;
    const h = harness(async (request) => {
      const replacement = structuredClone(data.replacement);
      mutate(replacement.assumptions[0].sourceRefs.find(({ role }) => role === dr4200Fixture.historicalSourceRef.role));
      return proposal(request, replacement, "architecture-revision");
    });
    data = baselineRevision(h);
    await assert.rejects(
      h.registry.execute(data.invocation, { artifacts: h.artifacts, checkpoints: checkpointStore() }),
      (error) => error instanceof OpenSpecRequirementsAdapterError && error.code === "DR4200",
    );
  }

  let data;
  const h = harness(async (request) => {
    const replacement = structuredClone(data.replacement);
    replacement.assumptions[0].sourceRefs.push({ role: "feature-specific-context", artifact: { artifactId: "hidden-feature-context", digest: `sha256:${"1".repeat(64)}` } });
    return proposal(request, replacement, "architecture-revision");
  });
  data = baselineRevision(h);
  await assert.rejects(h.registry.execute(data.invocation, { artifacts: h.artifacts, checkpoints: checkpointStore() }), OpenSpecRequirementsAdapterError);
});

test("baseline revision rejects pair drift, stale projection, no-op replacement, and greenfield output", async () => {
  for (const mutate of [
    ({ h, data }) => { data.overviewBaseline.requirementsBaseline.digest = `sha256:${"0".repeat(64)}`; h.store.set(data.refs.overviewRef.artifactId, artifactBytes(data.overviewBaseline)); data.refs.overviewRef.digest = sha256Digest(h.store.get(data.refs.overviewRef.artifactId)); data.invocation.inputs["project-overview-baseline"][0] = data.refs.overviewRef; },
    ({ h, data }) => { data.overviewBaseline.overview.purpose.statement += " drift"; h.store.set(data.refs.overviewRef.artifactId, artifactBytes(data.overviewBaseline)); data.refs.overviewRef.digest = sha256Digest(h.store.get(data.refs.overviewRef.artifactId)); data.invocation.inputs["project-overview-baseline"][0] = data.refs.overviewRef; },
  ]) {
    let data; const h = harness(async (request) => proposal(request, data.replacement, "architecture-revision")); data = baselineRevision(h); mutate({ h, data });
    await assert.rejects(h.registry.execute(data.invocation, { artifacts: h.artifacts, checkpoints: checkpointStore() }));
  }
  let unchanged; const h = harness(async (request) => proposal(request, unchanged.requirementsBaseline.requirements, "architecture-revision")); unchanged = baselineRevision(h);
  await assert.rejects(h.registry.execute(unchanged.invocation, { artifacts: h.artifacts, checkpoints: checkpointStore() }), OpenSpecRequirementsAdapterError);
});

test("missing executor and malformed, authority-bearing, or binding-substituted native output fail closed", async () => {
  assert.throws(() => createOpenSpecRequirementsAdapter({ loadArtifact() {}, persistArtifact() {} }), OpenSpecRequirementsAdapterError);
  for (const mutate of [
    (response) => { response.provider = "substituted-provider"; },
    (response) => { response.binding.plugin.id = "feature-specific-adapter"; },
    (response) => { response.graphOperations = [{ op: "activate" }]; },
    (response) => { response.requirements.purpose.sourceRefs[0].artifact.artifactId = "hidden-feature-context"; },
  ]) {
    let requirements;
    const h = harness(async (request) => { const response = proposal(request, requirements, "warehouse-temperature-alerts"); mutate(response); return response; });
    const data = featureInvocation(h, "warehouse-temperature-alerts", "WAREHOUSE"); requirements = data.requirements;
    await assert.rejects(h.registry.execute(data.invocation, { artifacts: h.artifacts, checkpoints: checkpointStore() }), OpenSpecRequirementsAdapterError);
  }
});

test("package surface exports the executable adapter and metadata", async () => {
  const adapterSurface = await import("../src/openspec-requirements-adapter.mjs");
  assert.equal(typeof adapterSurface.createOpenSpecRequirementsAdapter, "function");
  assert.equal(adapterSurface.OPENSPEC_REQUIREMENTS_BINDING.plugin.id, "openspec");
  const indexText = await readFile(new URL("src/index.mjs", root), "utf8");
  assert.match(indexText, /createOpenSpecRequirementsAdapter/);
  const packageJson = await json("package.json");
  assert.equal(packageJson.exports["./adapters/openspec-requirements"], "./src/openspec-requirements-adapter.mjs");
});
