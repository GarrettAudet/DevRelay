import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createTraceabilityGraphService, createInMemoryTraceabilityStore } from "../src/traceability-graph.mjs";
import { architectureDiscoveryTraceabilityContributor } from "../src/architecture-discovery-traceability-contributor.mjs";

const D = (value) => `sha256:${value.repeat(64)}`;
const seal = (body, field) => ({ ...body, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const adapter = { id: "native", version: "0.1.0", configurationDigest: D("a") };

function loaded(value, artifactId) {
  const bytes = Buffer.from(canonicalJson(value));
  return { value, bytes, ref: { artifactId, schema: `https://devrelay.dev/test/${value.kind}/v1`, mediaType: "application/json", digest: sha256Digest(bytes), uri: `memory:///${artifactId}` } };
}

function fixture() {
  const repository = loaded({ kind: "RepositorySnapshot", revision: "abc" }, "repository");
  const source = { artifact: repository.ref, location: { path: "src/index.mjs" } };
  const observationValue = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureObservation", observationId: "OBS-1", repositorySnapshot: repository.ref, finding: { id: "F-1", category: "element", subject: "service:core", statement: "Core exists.", confidence: { disposition: "observed", score: 1, rationale: "Exact bytes." }, method: "native-inventory", adapter, sources: [source] } }, "observationDigest");
  const gapValue = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureDiscoveryGap", gapId: "GAP-1", subject: "service:edge", material: false, reason: "Boundary remains unknown.", confidence: { disposition: "unknown", score: 0, rationale: "No bounded evidence." }, sources: [source] }, "gapDigest");
  const observation = loaded(observationValue, "OBS-1");
  const gap = loaded(gapValue, "GAP-1");
  const snapshotValue = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "CurrentArchitectureSnapshot", snapshotId: "SNAP", repositorySnapshot: repository.ref, nativeInventory: { artifactId: "inventory", digest: D("b") }, analyzerResults: [], observations: [observation.ref], gaps: [gap.ref], warnings: ["Non-material gap retained."], discoveryMethods: ["native-inventory"], sourceRefs: [source], authority: "observational" }, "snapshotDigest");
  const snapshot = loaded(snapshotValue, "SNAP");
  const artifacts = new Map([repository, observation, gap].map((entry) => [`${entry.ref.artifactId}:${entry.ref.digest}`, entry]));
  return { repository, observation, gap, snapshot, resolveArtifact: async (ref) => artifacts.get(`${ref.artifactId}:${ref.digest}`) };
}

async function prepare(service, data, id = "discover") {
  const invocation = { invocationId: id, module: { id: "architecture-discovery", version: "0.1.0", operation: "discover" } };
  return service.prepare({ baseGraph: service.captureBase(), invocation, invocationFingerprint: canonicalJsonDigest(invocation), moduleResult: { invocationId: id, status: "completed", outcome: "discovered", outputs: { "current-architecture-snapshot": [data.snapshot.ref] }, evidence: [] }, loadedOutputs: { "current-architecture-snapshot": [data.snapshot] }, resolveArtifact: data.resolveArtifact });
}

test("validated observational lineage merges atomically and replays deterministically", async () => {
  const data = fixture();
  const service = createTraceabilityGraphService({ graphId: "ad", projectId: "devrelay", store: createInMemoryTraceabilityStore(), contributors: [architectureDiscoveryTraceabilityContributor] });
  const first = await prepare(service, data);
  const replay = await prepare(service, data, "discover-replay");
  assert.deepEqual(first.update.nodeChanges, replay.update.nodeChanges);
  assert.deepEqual(first.update.edgeChanges, replay.update.edgeChanges);
  const merged = await service.mergePrepared(first);
  assert.ok(merged.receipt.resultGraph.digest);
  assert.equal(merged.snapshot.nodes.every(({ authority }) => ["candidate", "reference"].includes(authority)), true);
  assert.equal(merged.snapshot.edges.every(({ kind, authority, scope }) => ["contains", "derived-from"].includes(kind) && authority === "candidate" && scope === "architecture-discovery/observational"), true);
  const byId = new Map(merged.snapshot.nodes.map((node) => [node.nodeId, node]));
  assert.equal(merged.snapshot.edges.some((edge) => byId.get(edge.sourceNodeId)?.label === "SNAP" && byId.get(edge.targetNodeId)?.label === "repository"), true);
});

test("arbitrary, inverse, approved-state, implementation, verification, and completion claims fail closed", async () => {
  const data = fixture();
  for (const mutate of [
    (value) => { value.authority = "approved"; },
    (value) => { value.graphOperations = [{ kind: "implemented-by" }]; },
    (value) => { value.architectureBaseline = { approved: true }; },
  ]) {
    const changed = structuredClone(data.snapshot.value); mutate(changed);
    const bad = loaded(changed, "SNAP-BAD");
    const service = createTraceabilityGraphService({ graphId: `bad-${Math.random()}`, projectId: "devrelay", store: createInMemoryTraceabilityStore(), contributors: [architectureDiscoveryTraceabilityContributor] });
    await assert.rejects(prepare(service, { ...data, snapshot: bad }));
  }
  assert.deepEqual(architectureDiscoveryTraceabilityContributor.ownership, { scope: "architecture-discovery/observational", authority: "candidate", nodeKinds: [], edgeKinds: ["contains", "derived-from"] });
  assert.equal(Object.isFrozen(architectureDiscoveryTraceabilityContributor.ownership), true);
  assert.equal(architectureDiscoveryTraceabilityContributor.ownership.edgeKinds.includes("implemented-by"), false);
  assert.equal(architectureDiscoveryTraceabilityContributor.ownership.edgeKinds.includes("verified-by"), false);
  assert.equal(architectureDiscoveryTraceabilityContributor.ownership.edgeKinds.includes("supersedes"), false);
});
