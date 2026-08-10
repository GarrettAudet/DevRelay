import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createNativeArchitectureInventory } from "../src/architecture-discovery-native-inventory.mjs";
import { ArchitectureDiscoveryNormalizationError, normalizeArchitectureDiscoveryObservations } from "../src/architecture-discovery-observation-normalizer.mjs";
import { ArchitectureDiscoveryAnalyzerRegistryError, createArchitectureDiscoveryAnalyzerRegistry } from "../src/architecture-discovery-analyzer-registry.mjs";

const D = (character) => `sha256:${character.repeat(64)}`;
const repositorySnapshot = { artifactId:"repo-pinned", digest:D("a"), schema:"https://devrelay.dev/artifacts/repository-snapshot/v1", mediaType:"application/json", uri:"artifact://repository/repo-pinned" };
const nativeAdapter = { id:"native-architecture-discovery", version:"0.1.0", configurationDigest:canonicalJsonDigest({}) };
const policy = { artifactId:"policy", digest:D("b"), schema:"https://devrelay.dev/policy/architecture-discovery/v1", mediaType:"application/json", uri:"artifact://policy/privacy" };
const seal = (body, field) => ({ ...body, [field]:canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const ref = (artifactId, digest) => ({ artifactId, digest, schema:"https://devrelay.dev/evidence/analyzer/v1", mediaType:"application/json", uri:`artifact://evidence/${artifactId}` });

function inventory() {
  const invocation = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"RepositoryInventoryInvocation", invocationId:"native-run", repositorySnapshot, allowedPaths:["src/index.mjs"], policy, adapter:nativeAdapter }, "invocationFingerprint");
  return createNativeArchitectureInventory({ invocation, files:[{ path:"src/index.mjs", bytes:Buffer.from("export function start() {}\n") }] });
}

function analyzer({ id="dependency-cruiser", version="1.0.0", status="completed", statement="src/index.mjs depends on node:fs.", score=0.75, disposition="analyzer-inferred", subject="relationship:src/index.mjs:node:fs", source=true, silent=false } = {}) {
  const native = inventory();
  const adapter = { id, version, configurationDigest:canonicalJsonDigest({ preset:"bounded" }) };
  const evidence = ref(`evidence-${id}`, canonicalJsonDigest({ id, statement }));
  const findings = status === "completed" && !silent ? [{
    id:`FINDING-${id}`, category:"relationship", subject, statement,
    confidence:{ disposition, score, rationale:"Analyzer-derived observation requiring independent review." },
    method:"specialized-analyzer", adapter,
    sources:[{ artifact:source ? evidence : ref("lost-evidence", D("f")), location:{ path:"src/index.mjs" } }],
  }] : [];
  return seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ArchitectureAnalyzerResult", invocationId:`run-${id}`, invocationFingerprint:D("c"), repositorySnapshot, nativeInventory:{ artifactId:"native-repository-inventory-native-run", digest:native.inventoryDigest }, adapter, status, findings, nativeEvidence:[evidence] }, "resultDigest");
}

test("native inventory alone produces a canonical observational snapshot", () => {
  const native = inventory();
  const first = normalizeArchitectureDiscoveryObservations({ snapshotId:"snapshot", nativeInventory:native });
  const second = normalizeArchitectureDiscoveryObservations({ snapshotId:"snapshot", nativeInventory:native, analyzerResults:[] });
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.deepEqual(first.snapshot.discoveryMethods, ["native-inventory"]);
  assert.equal(first.snapshot.authority, "observational");
  assert.ok(first.observations.length > 0);
  assert.ok(first.observations.every(value => value.finding.method === "native-inventory"));
  for (const [index, observation] of first.observations.entries()) {
    assert.equal(
      first.snapshot.observations[index].digest,
      sha256Digest(Buffer.from(canonicalJson(observation), "utf8")),
    );
    assert.notEqual(first.snapshot.observations[index].digest, observation.observationDigest);
  }
});

test("analyzer order cannot affect canonical output or provenance", () => {
  const native = inventory();
  const left = analyzer({ id:"dependency-cruiser" });
  const right = analyzer({ id:"scip", statement:"src/index.mjs exposes start.", subject:"interface:src/index.mjs:start" });
  const first = normalizeArchitectureDiscoveryObservations({ snapshotId:"snapshot", nativeInventory:native, analyzerResults:[left, right] });
  const second = normalizeArchitectureDiscoveryObservations({ snapshotId:"snapshot", nativeInventory:native, analyzerResults:[right, left] });
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.snapshot.analyzerResults.length, 2);
  assert.ok(first.observations.filter(value => value.finding.method === "specialized-analyzer").every(value => value.finding.sources.length === 1));
});

test("conflicting and low-confidence analyzer observations remain explicit", () => {
  const native = inventory();
  const subject = "relationship:src/index.mjs:node:fs";
  const first = analyzer({ id:"dependency-cruiser", subject, statement:"src/index.mjs depends on node:fs.", score:0.2 });
  const second = analyzer({ id:"scip", subject, statement:"src/index.mjs does not depend on node:fs.", score:0.9 });
  const output = normalizeArchitectureDiscoveryObservations({ snapshotId:"snapshot", nativeInventory:native, analyzerResults:[first, second] });
  assert.equal(output.observations.filter(value => value.finding.subject === subject).length, 2);
  assert.ok(output.snapshot.warnings.some(value => value.startsWith("Conflicting observations")));
  assert.ok(output.snapshot.warnings.some(value => value.includes("analyzer-inferred (0.2)")));
});

test("unavailable, failed, interrupted, and silent analyzers are preserved as limitations", () => {
  for (const status of ["unavailable", "failed", "interrupted"]) {
    const result = analyzer({ id:`tool-${status}`, status, statement:undefined });
    const output = normalizeArchitectureDiscoveryObservations({ snapshotId:`snapshot-${status}`, nativeInventory:inventory(), analyzerResults:[result] });
    assert.equal(output.snapshot.analyzerResults[0].digest, result.resultDigest);
    assert.ok(output.snapshot.warnings.some(value => value.includes(`was ${status}`)));
  }
  const silent = analyzer({ id:"silent", silent:true });
  const output = normalizeArchitectureDiscoveryObservations({ snapshotId:"snapshot-silent", nativeInventory:inventory(), analyzerResults:[silent] });
  assert.ok(output.snapshot.warnings.some(value => value.includes("completed without findings")));
});

test("malformed, cross-repository, duplicate, partial, and provenance-loss results fail closed", () => {
  const native = inventory();
  const valid = analyzer();
  const fixtures = [
    [{ ...valid, resultDigest:D("d") }],
    [seal({ ...valid, repositorySnapshot:{ ...repositorySnapshot, digest:D("e") } }, "resultDigest")],
    [valid, valid],
    [analyzer({ source:false })],
    [seal({ ...valid, status:"failed" }, "resultDigest")],
  ];
  for (const analyzerResults of fixtures) assert.throws(() => normalizeArchitectureDiscoveryObservations({ snapshotId:"snapshot", nativeInventory:native, analyzerResults }), ArchitectureDiscoveryNormalizationError);
});

test("versioned registry binds optional analyzers and validates their untrusted output", async () => {
  const result = analyzer();
  const invocation = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ArchitectureAnalyzerInvocation", invocationId:result.invocationId, repositorySnapshot, nativeInventory:result.nativeInventory, contextSlice:ref("context", D("9")), adapter:result.adapter }, "invocationFingerprint");
  const exactResult = seal({ ...result, invocationFingerprint:invocation.invocationFingerprint }, "resultDigest");
  const registry = createArchitectureDiscoveryAnalyzerRegistry([{ portVersion:"1.0.0", adapter:result.adapter, async analyze(received) { assert.equal(Object.isFrozen(received), true); return exactResult; } }]);
  assert.equal((await registry.invoke(invocation)).resultDigest, exactResult.resultDigest);
  assert.deepEqual(registry.list().map(value => value.adapter.id), ["dependency-cruiser"]);
  await assert.rejects(createArchitectureDiscoveryAnalyzerRegistry().invoke(invocation), ArchitectureDiscoveryAnalyzerRegistryError);
});

test("registry rejects malformed output and normalization exposes no downstream authority", async () => {
  const result = analyzer();
  const invocation = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ArchitectureAnalyzerInvocation", invocationId:result.invocationId, repositorySnapshot, nativeInventory:result.nativeInventory, contextSlice:ref("context", D("9")), adapter:result.adapter }, "invocationFingerprint");
  const registry = createArchitectureDiscoveryAnalyzerRegistry([{ portVersion:"1.0.0", adapter:result.adapter, analyze:async () => ({ ...result, invocationFingerprint:invocation.invocationFingerprint, resultDigest:D("0") }) }]);
  await assert.rejects(registry.invoke(invocation), ArchitectureDiscoveryAnalyzerRegistryError);
  const output = normalizeArchitectureDiscoveryObservations({ snapshotId:"snapshot", nativeInventory:inventory() });
  const forbidden = new Set(["approval", "gateDecision", "graphMutation", "graphOperations", "nextOperation", "progression", "routeDecision", "workflowAuthority", "architectureBaseline", "architectureProposal"]);
  const walk = (value) => { if (!value || typeof value !== "object") return; for (const [key, child] of Object.entries(value)) { assert.equal(forbidden.has(key), false); walk(child); } };
  walk(output);
});
