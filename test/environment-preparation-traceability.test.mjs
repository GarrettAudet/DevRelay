import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import {
  createEnvironmentPreparationTraceabilityContributor,
  environmentPreparationTraceabilityContributor,
} from "../src/environment-preparation-traceability-contributor.mjs";
import {
  approveEnvironmentVerificationCandidate,
  buildEnvironmentVerificationCandidate,
  promoteEnvironmentGate,
} from "../src/environment-preparation-gate.mjs";
import {
  createNativeWindowsEnvironmentHost,
  createNativeWindowsEnvironmentInventory,
  resolveEnvironmentProfileSet,
} from "../src/environment-preparation-profile-inventory.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";
import { TRACEABILITY_VOCABULARY_V1_6, TRACEABILITY_VOCABULARY_V1_7 } from "../src/traceability-artifact-validator.mjs";

const D = (value) => canonicalJsonDigest(value);
const domainRef = (id) => ({ artifactId: id, schema: `https://devrelay.dev/artifacts/${id.toLowerCase()}/v1`, mediaType: "application/json", digest: D(id), uri: `memory://fixture/${id}` });
const rawLoaded = (value, artifactId = value.profileSetId ?? value.candidateId ?? value.approvalId ?? value.receiptId ?? value.id) => {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return { ref: { artifactId, schema: `https://devrelay.dev/loaded/${value.kind.toLowerCase()}/v1`, mediaType: "application/json", digest: sha256Digest(bytes), uri: `memory://fixture/raw/${artifactId}` }, bytes, value };
};
const repository = domainRef("REPOSITORY");
const assignmentBaseline = domainRef("ASSIGNMENT");
const sourceRefs = [{ role: "approved-work-item", artifact: domainRef("WI-EP-TRACEABILITY") }];

function fixture() {
  const profileSet = resolveEnvironmentProfileSet({
    profileSetId: "EPS-TRACE",
    version: "1.0.0",
    repository,
    hostProfile: { id: "HOST", layer: "devrelay-host", name: "Windows host", checks: [{ id: "OS", capability: "windows", required: true, observationKind: "os", constraint: "win32", freshnessSeconds: 300 }] },
    projectProfiles: [{ id: "PROJECT", layer: "project-target", name: "Project", checks: [{ id: "NODE", capability: "node", required: true, observationKind: "runtime", constraint: ">=22.0.0", freshnessSeconds: 300 }] }],
    sourceRefs,
  });
  const host = createNativeWindowsEnvironmentHost({ platform: "win32", architecture: "x64", repositoryRoot: process.cwd(), maturity: "fixture-conformant", spawn: () => ({ status: 0, stdout: "v24.0.0\n", stderr: "" }) });
  const inventory = createNativeWindowsEnvironmentInventory({ inventoryId: "INV-TRACE", profileSet, repository, host, observedAt: "2026-08-21T12:00:00.000Z", sourceRefs }).inventory;
  const request = { candidateId: "EVC-TRACE", operation: "prepare-frontier", repository, upstreamBaselines: [domainRef("REQ")], profileSet, inventory, effectReceipts: [], frontierId: "FRONTIER-005", workItemIds: ["WI-A", "WI-B"], assignmentBaseline, executionAttemptId: "ATT-005", evaluatedAt: "2026-08-21T12:01:00.000Z", sourceRefs };
  const candidate = buildEnvironmentVerificationCandidate(request);
  const approval = approveEnvironmentVerificationCandidate({ candidate, terminalCheckpointDigest: D("checkpoint"), policyVersion: "1.0.0" });
  const { readiness } = promoteEnvironmentGate({ proofId: "PROOF-TRACE", baselineId: "BASE-TRACE", baselineVersion: "1.0.0", candidate, approval, profileSet, inventory, assignmentBaseline, workItemIds: request.workItemIds, issuedAt: "2026-08-21T12:01:00.000Z", expiresAt: "2026-08-21T12:06:00.000Z", policyVersion: "1.0.0", graphCheckpoint: domainRef("GRAPH"), sourceRefs });
  const loadedOutputs = { profileSet: [rawLoaded(profileSet)], candidate: [rawLoaded(candidate)], approval: [rawLoaded(approval)], readiness: [rawLoaded(readiness)] };
  const context = {
    invocation: { invocationId: "EP-TRACE", module: { id: "environment-preparation", version: "1.0.0", operation: "prepare-frontier" } },
    moduleResult: { invocationId: "EP-TRACE", status: "completed", outcome: "ready", outputs: Object.fromEntries(Object.entries(loadedOutputs).map(([key, [entry]]) => [key, [entry.ref]])), evidence: [] },
    loadedOutputs,
  };
  return { profileSet, candidate, approval, readiness, context };
}

function seedContributor(id, nodes) {
  const scope = nodes.every(({ kind }) => kind === "work-item")
    ? "work-breakdown/candidate"
    : "work-execution/attempt";
  return Object.freeze({
    metadata: { id, version: "1.0.0" },
    match: (context) => context.invocation.module.id === id,
    authority: "candidate",
    scope,
    ownership: { authority: "candidate", scope, nodeKinds: [...new Set(nodes.map(({ kind }) => kind))], edgeKinds: [] },
    async project(context) {
      const loaded = context.loadedOutputs.seed[0];
      return { horizon: "implementation", nodes: nodes.map((node) => ({ ...node, sourceLocators: [{ artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest }, jsonPointer: "", entityDigest: D(loaded.value) }] })), edges: [] };
    },
  });
}

async function mergeSeed(service, id, nodes) {
  const seed = rawLoaded({ apiVersion: "devrelay.dev/v1alpha1", kind: "Seed", id });
  const invocation = { invocationId: id, module: { id, version: "1.0.0", operation: "seed" } };
  const moduleResult = { invocationId: id, status: "completed", outcome: "seeded", outputs: { seed: [seed.ref] }, evidence: [] };
  const prepared = await service.prepare({ baseGraph: service.captureBase(), invocation, invocationFingerprint: D(invocation), moduleResult, loadedOutputs: { seed: [seed] } });
  await service.mergePrepared(prepared);
}

test("trusted projection deterministically derives typed profiles, readiness, and forward-only lifecycle edges", async () => {
  const { context } = fixture();
  const first = await environmentPreparationTraceabilityContributor.project(context);
  const second = await environmentPreparationTraceabilityContributor.project(context);
  assert.deepEqual(first, second);
  assert.equal(first.nodes.filter(({ kind }) => kind === "environment-profile").length, 2);
  assert.equal(first.nodes.filter(({ kind }) => kind === "environment-readiness-receipt").length, 1);
  assert.equal(first.edges.filter(({ kind }) => kind === "required-by").length, 4);
  assert.equal(first.edges.filter(({ kind }) => kind === "authorizes-environment-for").length, 1);
  assert.equal(canonicalJson(first).includes("graphOperations"), false);
});

test("V1.7 graph validates endpoint closure, merges atomically, and supports forward provenance", async () => {
  const { context } = fixture();
  const workSeed = seedContributor("seed-work", [
    { kind: "work-item", stableId: "WI-A", label: "WI-A", attributes: {} },
    { kind: "work-item", stableId: "WI-B", label: "WI-B", attributes: {} },
  ]);
  const attemptSeed = seedContributor("seed-attempt", [{ kind: "execution-attempt", stableId: "ATT-005", label: "ATT-005", attributes: {} }]);
  const graph = createTraceabilityGraphService({ graphId: "ep-trace", projectId: "devrelay", store: createInMemoryTraceabilityStore(), vocabulary: TRACEABILITY_VOCABULARY_V1_7, contributors: [workSeed, attemptSeed, environmentPreparationTraceabilityContributor] });
  await mergeSeed(graph, "seed-work");
  await mergeSeed(graph, "seed-attempt");
  const prepared = await graph.prepare({ baseGraph: graph.captureBase(), invocation: context.invocation, invocationFingerprint: D(context.invocation), moduleResult: context.moduleResult, loadedOutputs: context.loadedOutputs });
  const merged = await graph.mergePrepared(prepared);
  assert.equal(merged.snapshot.revision, 3);
  assert.equal(merged.snapshot.edges.filter(({ kind }) => kind === "required-by").length, 4);
  assert.equal(merged.snapshot.edges.filter(({ kind }) => kind === "authorizes-environment-for").length, 1);
  assert.ok(merged.receiptRef.digest);
  assert.equal(merged.snapshot.lastAppliedUpdate.digest, prepared.updateRef.digest);
});

test("unknown lifecycle endpoints fail before graph mutation", async () => {
  const { context } = fixture();
  const graph = createTraceabilityGraphService({ graphId: "ep-orphan", projectId: "devrelay", store: createInMemoryTraceabilityStore(), vocabulary: TRACEABILITY_VOCABULARY_V1_7, contributors: [environmentPreparationTraceabilityContributor] });
  await assert.rejects(() => graph.prepare({ baseGraph: graph.captureBase(), invocation: context.invocation, invocationFingerprint: D(context.invocation), moduleResult: context.moduleResult, loadedOutputs: context.loadedOutputs }), /endpoint|does not resolve|unknown/u);
  assert.equal(graph.captureBase().revision, 0);
});

test("untrusted graph operations or resealed substitutions cannot enter trusted projection", async () => {
  const { context } = fixture();
  const profile = context.loadedOutputs.profileSet[0];
  const tamperedValue = { ...profile.value, graphOperations: [{ kind: "required-by" }] };
  context.loadedOutputs.profileSet[0] = rawLoaded(tamperedValue, profile.ref.artifactId);
  await assert.rejects(() => environmentPreparationTraceabilityContributor.project(context), /invalid|contentDigest|canonical/u);
});

test("V1.6 remains immutable and cannot register V1.7 environment vocabulary ownership", () => {
  assert.throws(() => createTraceabilityGraphService({ graphId: "old", projectId: "devrelay", store: createInMemoryTraceabilityStore(), vocabulary: TRACEABILITY_VOCABULARY_V1_6, contributors: [createEnvironmentPreparationTraceabilityContributor()] }), /unknown node kind|ownership/u);
});
