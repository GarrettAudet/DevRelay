import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createNativeArchitectureInventory } from "../src/architecture-discovery-native-inventory.mjs";
import { normalizeArchitectureDiscoveryObservations } from "../src/architecture-discovery-observation-normalizer.mjs";
import { loadMaterializedArchitectureDiscoveryClosure } from "../src/architecture-discovery-materialized-closure.mjs";
import { loadArchitectureDiscoveryInterpretation } from "../src/architecture-discovery-interpretation.mjs";

const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
function fixture(withAnalyzer = false) {
  const stored = new Map();
  const put = (value, artifactId, definition) => {
    const bytes = Buffer.from(canonicalJson(value));
    const ref = { artifactId, digest: sha256Digest(bytes), schema: `https://devrelay.dev/contracts/architecture-discovery-artifacts.schema.json#/$defs/${definition}`, mediaType: "application/json", uri: `artifact://fixture/${artifactId}` };
    stored.set(ref.digest, bytes);
    return ref;
  };
  const repositorySnapshot = put({ revision: "fixture", treeDigest: canonicalJsonDigest({}) }, "repository", "repository");
  const adapter = { id: "native", version: "1.0.0", configurationDigest: canonicalJsonDigest({}) };
  const invocation = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "RepositoryInventoryInvocation", invocationId: "closure", repositorySnapshot, allowedPaths: ["src/index.mjs"], policy: { artifactId: "policy", digest: canonicalJsonDigest({}) }, adapter }, "invocationFingerprint");
  const bytes = Buffer.from("export const value = 1;\n");
  const inventory = createNativeArchitectureInventory({ invocation, files: [{ path: "src/index.mjs", bytes }] });
  for (const ref of inventory.nativeEvidence) stored.set(ref.digest, bytes);
  const nativeRef = { artifactId: `native-repository-inventory-${invocation.invocationId}`, digest: inventory.inventoryDigest, schema: "https://devrelay.dev/contracts/architecture-discovery-artifacts.schema.json#/$defs/nativeInventory", mediaType: "application/json" };
  const analyzer = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureAnalyzerResult", invocationId: "optional-analyzer", invocationFingerprint: canonicalJsonDigest({}), repositorySnapshot, nativeInventory: nativeRef, adapter: { ...adapter, id: "optional" }, status: "unavailable", findings: [], nativeEvidence: inventory.nativeEvidence }, "resultDigest");
  const normalized = normalizeArchitectureDiscoveryObservations({ snapshotId: "closure-snapshot", nativeInventory: inventory, analyzerResults: withAnalyzer ? [analyzer] : [] });
  const inventoryRef = put(inventory, normalized.snapshot.nativeInventory.artifactId, "nativeInventory");
  const materializedAnalyzer = seal({ ...analyzer, nativeInventory: inventoryRef }, "resultDigest");
  const analyzerRef = withAnalyzer ? put(materializedAnalyzer, normalized.snapshot.analyzerResults[0].artifactId, "analyzerResult") : undefined;
  for (const observation of normalized.observations) put(observation, observation.observationId, "observation");
  const snapshot = seal({ ...normalized.snapshot, nativeInventory: inventoryRef, analyzerResults: analyzerRef ? [analyzerRef] : [] }, "snapshotDigest");
  const snapshotRef = put(snapshot, snapshot.snapshotId, "snapshot");
  return { stored, put, snapshot, snapshotRef, inventory, observations: normalized.observations, loadArtifact: ref => stored.get(ref.digest) };
}

test("materialized discovery resolves raw producer/source bytes and rederives observations", async () => {
  const fx = fixture();
  const result = await loadMaterializedArchitectureDiscoveryClosure(fx);
  assert.deepEqual(result.snapshot.value, fx.snapshot);
  assert.deepEqual(result.observations.map(entry => entry.value), fx.observations);
  assert.ok(result.evidence.length > 0);
  assert.equal("routeDecision" in result, false);
  assert.equal("approval" in result, false);
});

test("missing or altered producer and source bytes fail closed", async () => {
  for (const target of ["inventory", "source", "repository"]) {
    const fx = fixture();
    const ref = target === "inventory" ? fx.snapshot.nativeInventory : target === "repository" ? fx.snapshot.repositorySnapshot : fx.inventory.nativeEvidence[0];
    fx.stored.set(ref.digest, Buffer.from("altered bytes"));
    await assert.rejects(loadMaterializedArchitectureDiscoveryClosure(fx), /bytes do not match/);
  }
});

test("unavailable optional analyzer evidence and warnings survive raw-byte handoff", async () => {
  const fx = fixture(true);
  const result = await loadMaterializedArchitectureDiscoveryClosure(fx);
  assert.equal(result.analyzers[0].value.status, "unavailable");
  assert.match(result.snapshot.value.warnings.join(" "), /unavailable/);
  const snapshot = seal({ ...fx.snapshot, warnings: [] }, "snapshotDigest");
  const snapshotRef = fx.put(snapshot, snapshot.snapshotId, "snapshot");
  await assert.rejects(loadMaterializedArchitectureDiscoveryClosure({ ...fx, snapshotRef }), /omits producer warnings/);
});

test("self-consistent rehashed observation substitution cannot replace producer findings", async () => {
  const fx = fixture();
  const changed = seal({ ...fx.observations[0], finding: { ...fx.observations[0].finding, statement: "Invented architecture." } }, "observationDigest");
  const changedRef = fx.put(changed, changed.observationId, "observation");
  const snapshot = seal({ ...fx.snapshot, observations: [{ ...fx.snapshot.observations[0], digest: changedRef.digest }, ...fx.snapshot.observations.slice(1)] }, "snapshotDigest");
  const snapshotRef = fx.put(snapshot, snapshot.snapshotId, "snapshot");
  await assert.rejects(loadMaterializedArchitectureDiscoveryClosure({ ...fx, snapshotRef }), /observations do not match/);
});

function interpretationFixture() {
  const fx = fixture();
  const read = name => JSON.parse(readFileSync(new URL(`../examples/artifacts/${name}`, import.meta.url), "utf8"));
  const state = read("project-architecture-state-existing-undiscovered-001.json");
  state.repositorySnapshot = fx.snapshot.repositorySnapshot;
  const overview = { artifactId: "overview", digest: canonicalJsonDigest({}), schema: "https://devrelay.dev/artifacts/project-overview-baseline/v1", mediaType: "application/vnd.devrelay.project-overview-baseline+json", uri: "artifact://fixture/overview" };
  state.projectOverviewBaseline = overview;
  const stateRef = { ...fx.put(state, state.stateId, "state"), schema: "https://devrelay.dev/artifacts/project-architecture-state/v1", mediaType: "application/vnd.devrelay.project-architecture-state+json" };
  const structured = read("current-architecture-snapshot-001.json");
  structured.projectArchitectureState = stateRef;
  structured.projectContext = state.projectContext;
  structured.repositorySnapshot = state.repositorySnapshot;
  structured.repositoryRevision = { revision: "fixture", treeDigest: canonicalJsonDigest({}) };
  structured.sourceRefs.push({ role: "original-discovery", artifact: fx.snapshotRef });
  const structuredRef = { ...fx.put(structured, structured.snapshotId, "structured"), schema: "https://devrelay.dev/artifacts/current-architecture-snapshot/v1", mediaType: "application/vnd.devrelay.current-architecture-snapshot+json" };
  const candidate = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureDiscoveryInterpretation", interpretationId: "interpretation", authority: "candidate", discoverySnapshot: fx.snapshotRef, structuredSnapshot: structuredRef, projectArchitectureState: stateRef, requirementsBaseline: state.requirementsBaseline, projectOverviewBaseline: overview, observations: fx.snapshot.observations.map(observation => ({ observation, disposition: "unresolved", rationale: "Fixture inventory needs independent interpretation.", targetPointers: [] })), gaps: [] };
  const save = value => ({ ...fx.put(value, value.interpretationId, "interpretation"), schema: "https://devrelay.dev/artifacts/architecture-discovery-interpretation/v1" });
  return { ...fx, candidate, structured, save, interpretationRef: save(candidate) };
}

test("interpretation binds exact discovery to a structured snapshot but remains candidate-only", async () => {
  const fx = interpretationFixture();
  const result = await loadArchitectureDiscoveryInterpretation(fx);
  assert.equal(result.authority, "candidate");
  assert.equal(result.state.value.state, "existing-undiscovered");
  assert.equal("routeDecision" in result, false);
  const mapped = structuredClone(fx.candidate);
  mapped.observations[0].disposition = "mapped";
  mapped.observations[0].targetPointers = ["/architectureModel/content/elements/0"];
  assert.equal((await loadArchitectureDiscoveryInterpretation({ ...fx, interpretationRef: fx.save(mapped) })).authority, "candidate");
  for (const modify of [
    value => { value.observations = []; },
    value => { value.observations[0].disposition = "mapped"; },
    value => { value.observations[0].disposition = "mapped"; value.observations[0].targetPointers = ["/architectureModel/content/absent"]; },
    value => { value.observations[0].disposition = "mapped"; value.observations[0].targetPointers = ["/architectureModel/mode"]; },
    value => { value.authority = "approved"; },
  ]) {
    const candidate = structuredClone(fx.candidate); modify(candidate);
    await assert.rejects(loadArchitectureDiscoveryInterpretation({ ...fx, interpretationRef: fx.save(candidate) }));
  }
});

test("interpretation cannot omit or downgrade a source material gap", async () => {
  const fx = interpretationFixture();
  const gap = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureDiscoveryGap", gapId: "AD-GAP-MATERIAL", subject: "service:unknown", material: true, reason: "Service boundary remains unknown.", confidence: { disposition: "unknown", score: 0, rationale: "No verified boundary observation." }, sources: fx.snapshot.sourceRefs }, "gapDigest");
  const gapRef = fx.put(gap, gap.gapId, "gap");
  const snapshot = seal({ ...fx.snapshot, gaps: [gapRef] }, "snapshotDigest");
  const discoverySnapshot = fx.put(snapshot, snapshot.snapshotId, "snapshot");
  const structured = structuredClone(fx.structured);
  structured.sourceRefs = [{ role: "original-discovery", artifact: discoverySnapshot }];
  structured.gaps = [{ id: "GAP-MATERIAL", statement: gap.reason, blocking: true }];
  const structuredRef = value => ({ ...fx.put(value, value.snapshotId, "structured"), schema: "https://devrelay.dev/artifacts/current-architecture-snapshot/v1", mediaType: "application/vnd.devrelay.current-architecture-snapshot+json" });
  const candidate = { ...fx.candidate, discoverySnapshot, structuredSnapshot: structuredRef(structured), gaps: [{ gap: gapRef, structuredGapId: "GAP-MATERIAL" }] };
  const loaded = await loadArchitectureDiscoveryInterpretation({ ...fx, interpretationRef: fx.save(candidate) });
  assert.equal(loaded.structured.value.gaps[0].blocking, true);
  await assert.rejects(loadArchitectureDiscoveryInterpretation({ ...fx, interpretationRef: fx.save({ ...candidate, gaps: [] }) }), /omits gaps/);
  structured.gaps[0].blocking = false;
  await assert.rejects(loadArchitectureDiscoveryInterpretation({ ...fx, interpretationRef: fx.save({ ...candidate, structuredSnapshot: structuredRef(structured) }) }), /loses materiality/);
});

test("interpretation resolves attached section content without rewriting its snapshot", async () => {
  const fx = interpretationFixture();
  const structured = structuredClone(fx.structured);
  const model = structured.architectureModel.content;
  const modelRef = { ...fx.put(model, model.modelId, "model"), schema: "https://devrelay.dev/artifacts/architecture-model/v1", mediaType: "application/vnd.devrelay.architecture-model+json" };
  structured.architectureModel = { mode: "attached", contentId: model.modelId, artifact: modelRef };
  const structuredRef = { ...fx.put(structured, structured.snapshotId, "structured"), schema: "https://devrelay.dev/artifacts/current-architecture-snapshot/v1", mediaType: "application/vnd.devrelay.current-architecture-snapshot+json" };
  const candidate = structuredClone(fx.candidate);
  candidate.structuredSnapshot = structuredRef;
  candidate.observations[0].disposition = "mapped";
  candidate.observations[0].targetPointers = ["/architectureModel/content/elements/0"];
  const request = { ...fx, interpretationRef: fx.save(candidate) };
  const result = await loadArchitectureDiscoveryInterpretation(request);
  assert.equal(result.structured.value.architectureModel.mode, "attached");
  fx.stored.set(modelRef.digest, Buffer.from("changed model"));
  await assert.rejects(loadArchitectureDiscoveryInterpretation(request), /bytes do not match/);
});
