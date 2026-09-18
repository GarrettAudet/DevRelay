import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { sha256Digest } from "../src/content-digest.mjs";
import { createWorkflowCompositionRuntime } from "../src/workflow-composition-runtime.mjs";
import { validateCompositionArtifact, COMPOSITION_SCHEMA } from "../src/workflow-composition-artifact-validator.mjs";
import { compositionFixture } from "./fixtures/workflow-composition.mjs";

test("two installed adapter and agent configurations preserve the same semantic preset", async () => {
  const a = compositionFixture();
  const b = compositionFixture({ variant: "b" });
  assert.deepEqual(a.request.preset, b.request.preset);
  for (const fixture of [a, b]) {
    const result = await createWorkflowCompositionRuntime(fixture.host).resolve(fixture.requestRef());
    assert.equal(result.kind, "ResolvedWorkflowConfiguration", JSON.stringify(result));
    validateCompositionArtifact(result);
    assert.equal(result.selections[0].agents[0].modelSelection.actualIdentity.status, "unknown");
    assert.equal(fixture.counts.adapters, 0);
    assert.equal(fixture.counts.commits, 1);
  }
});

test("restart replay revalidates bytes without resolver callbacks or persistence effects", async () => {
  const fixture = compositionFixture();
  const ref = fixture.requestRef();
  const result = await createWorkflowCompositionRuntime(fixture.host).resolve(ref);
  assert.equal(result.kind, "ResolvedWorkflowConfiguration", JSON.stringify(result));
  const before = { ...fixture.counts };
  const restarted = createWorkflowCompositionRuntime(fixture.host);
  assert.deepEqual(await restarted.resolve(ref), result);
  const resultRef = fixture.add("resolved", result, COMPOSITION_SCHEMA);
  assert.deepEqual(await restarted.verify(resultRef), result);
  assert.deepEqual(fixture.counts, before);
  fixture.storage.set(fixture.selection.adapters[0].configuration.uri, Buffer.from("{ }"));
  const failed = await restarted.resolve(ref);
  assert.equal(failed.kind, "CompositionDiagnostics");
  assert.equal(failed.outcome, "stale");
  await assert.rejects(restarted.verify(resultRef));
});

for (const [name, mutate, code] of [
  ["duplicate slot", (f) => f.request.selections.push(structuredClone(f.selection)), "ambiguous-selection"],
  ["duplicate step", (f) => f.selection.adapters.push(structuredClone(f.selection.adapters[0])), "ambiguous-selection"],
  ["wrong overview", (f) => { f.selection.projectOverview = f.add("other", { artifactId: "other" }); }, "stale-input"],
  ["missing Gate", (f) => { f.host.services = f.host.services.filter((s) => s.category !== "gate"); }, "missing-gate"],
  ["missing contributor", (f) => { f.host.services = f.host.services.filter((s) => s.category !== "contributor"); }, "missing-contributor"],
  ["unsupported settings", (f) => { f.selection.agents[0].settings = f.add("invalid-settings", { temperature: 99 }); }, "unsupported-model-setting"],
  ["excess grants", (f) => { f.selection.adapters[0].grants = f.add("excess", { grants: [{ kind: "network.connect", scope: "*" }] }); }, "grant-exceeded"],
  ["wrong step order", (f) => { f.selection.adapters[0].stepOrder = 1; }, "ambiguous-selection"],
  ["unattested identity", (f) => { f.selection.agents[0].modelSelection.actualIdentity = { status: "attested", providerId: "example", modelId: "model", revision: "r1", attestation: f.add("attestation", {}) }; }, "stale-input"],
]) test(`${name} rejects before persistence or adapter effects`, async () => {
  const fixture = compositionFixture();
  mutate(fixture);
  const result = await createWorkflowCompositionRuntime(fixture.host).resolve(fixture.requestRef());
  assert.equal(result.kind, "CompositionDiagnostics", JSON.stringify(result));
  assert.equal(result.findings[0].code, code, JSON.stringify(result));
  assert.equal(fixture.counts.adapters, 0);
  assert.equal(fixture.counts.writes, 0);
  assert.equal(fixture.counts.commits, 0);
});

test("active run swaps fail while successor lineage preserves exact predecessor", async () => {
  const initial = compositionFixture();
  const first = await createWorkflowCompositionRuntime(initial.host).resolve(initial.requestRef());
  assert.equal(first.kind, "ResolvedWorkflowConfiguration", JSON.stringify(first));
  const predecessorRef = initial.add("first-result", first, COMPOSITION_SCHEMA);
  initial.request.qualityProfile = "quick";
  assert.equal((await createWorkflowCompositionRuntime(initial.host).resolve(initial.requestRef())).outcome, "stale");
  const next = compositionFixture({ variant: "b", runId: "run-b", storage: initial.storage, checkpoints: initial.checkpoints });
  const swapRequest = next.add("swap", { kind: "CompositionSwapRequest", predecessorRunId: "run-a", predecessorConfiguration: predecessorRef, newRunId: "run-b" });
  next.request.lineage = { mode: "new-run-swap", predecessorRunId: "run-a", predecessorConfiguration: predecessorRef, swapRequest };
  const result = await createWorkflowCompositionRuntime(next.host).resolve(next.requestRef());
  assert.equal(result.kind, "ResolvedWorkflowConfiguration", JSON.stringify(result));
  assert.deepEqual(result.lineage.predecessorConfiguration, predecessorRef);
  assert.equal(initial.checkpoints.size, 2);
});

test("checkpoint persistence must read back exact bytes before success", async () => {
  const fixture = compositionFixture();
  fixture.host.checkpoints.commit = () => {};
  await assert.rejects(createWorkflowCompositionRuntime(fixture.host).resolve(fixture.requestRef()), /readback/);
});

test("actual registry resolves complete ordered chain and rejects invalid terminal configuration before effects", async () => {
  const fixture = compositionFixture({ chain: true });
  const resolved = await createWorkflowCompositionRuntime(fixture.host).resolve(fixture.requestRef());
  assert.equal(resolved.kind, "ResolvedWorkflowConfiguration", JSON.stringify(resolved));
  assert.equal(resolved.selections[0].adapters.length, 2);
  assert.equal(fixture.counts.adapters, 0);
  const invalid = compositionFixture({ chain: true });
  const badConfig = { forbidden: true };
  invalid.selection.adapters[1].configuration = invalid.add("bad-config", badConfig);
  invalid.invocation.adapters[1].config = badConfig;
  invalid.request.bindingCatalog = invalid.add("bad-catalog", { kind: "CompositionBindingCatalog", slots: [{ slotId: "build", invocations: [invalid.add("bad-invocation", invalid.invocation)] }] });
  invalid.host.bindingCatalog = invalid.request.bindingCatalog;
  const rejected = await createWorkflowCompositionRuntime(invalid.host).resolve(invalid.requestRef());
  assert.equal(rejected.kind, "CompositionDiagnostics");
  assert.match(rejected.findings[0].message, /DR1608/);
  assert.equal(invalid.counts.adapters, 0);
  assert.equal(invalid.counts.writes, 0);
});

for (const [name, mutate, code] of [
  ["port cardinality", (f) => { f.preset.slots[0].ports[0].minimum = 0; }, "cardinality-mismatch"],
  ["port schema", (f) => { f.preset.slots[0].ports[0].schemaRef.schema = "https://example.test/different"; }, "schema-mismatch"],
  ["broken handoff", (f) => { f.preset.orderedHandoffs = [{ fromSlot: "build", toSlot: "build", outputPort: "result", inputPort: "project-overview-baseline" }]; }, "schema-mismatch"],
]) test(`${name} blocks configuration publication`, async () => {
  const fixture = compositionFixture();
  mutate(fixture);
  fixture.request.preset = fixture.add("changed-preset", fixture.preset, COMPOSITION_SCHEMA);
  fixture.host.preset = fixture.request.preset;
  const result = await createWorkflowCompositionRuntime(fixture.host).resolve(fixture.requestRef());
  assert.equal(result.kind, "CompositionDiagnostics");
  assert.equal(result.findings[0].code, code);
  assert.equal(fixture.counts.writes, 0);
});

test("consumer rejects changed configuration bytes and checkpoint corruption", async () => {
  const fixture = compositionFixture();
  const runtime = createWorkflowCompositionRuntime(fixture.host);
  const result = await runtime.resolve(fixture.requestRef());
  const changed = structuredClone(result);
  changed.selections[0].agents[0].role = "reviewer";
  await assert.rejects(runtime.verify(fixture.add("changed-result", changed, COMPOSITION_SCHEMA)), /differs/);
  fixture.checkpoints.set(result.runId, Buffer.from("{}"));
  await assert.rejects(runtime.verify(fixture.add("result", result, COMPOSITION_SCHEMA)), /checkpoint/);
});

test("isolated filesystem checkpoint survives fresh runtime and store instances", async () => {
  const fixture = compositionFixture();
  const requestRef = fixture.requestRef();
  const directory = mkdtempSync(join(tmpdir(), "devrelay-composition-"));
  const filename = (key) => join(directory, sha256Digest(Buffer.from(key)).slice(7));
  const put = (key, bytes) => {
    try { writeFileSync(filename(key), bytes, { flag: "wx" }); }
    catch (error) { if (error.code !== "EEXIST") throw error; assert.deepEqual(readFileSync(filename(key)), bytes); }
  };
  const stores = () => ({
    artifacts: { load: (ref) => readFileSync(filename(ref.uri)), put: (ref, bytes) => put(ref.uri, bytes) },
    checkpoints: { pin: fixture.host.checkpoints.pin,
      read(runId) { try { return readFileSync(filename(`run:${runId}`)); } catch (error) { if (error.code === "ENOENT") return undefined; throw error; } },
      commit: (runId, bytes) => put(`run:${runId}`, bytes) },
  });
  try {
    for (const [uri, bytes] of fixture.storage) put(uri, bytes);
    const first = await createWorkflowCompositionRuntime({ ...fixture.host, ...stores() }).resolve(requestRef);
    assert.equal(first.kind, "ResolvedWorkflowConfiguration", JSON.stringify(first));
    const calls = fixture.counts.contributors;
    const second = await createWorkflowCompositionRuntime({ ...fixture.host, ...stores() }).resolve(requestRef);
    assert.deepEqual(second, first);
    assert.equal(fixture.counts.contributors, calls);
    assert.equal(fixture.counts.adapters, 0);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("devrelay-composition-"));
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const [name, changeHost] of [
  ["artifact validators removed", (host) => { host.artifactContracts = []; }],
  ["validator implementation removed", (host) => { delete host.artifactContracts[0].validate; }],
  ["validator pin changed", (host) => { host.artifactContracts[0].pin.version = "2.0.0"; }],
  ["validator schema changed", (host) => { host.artifactContracts[0].schema = "https://example.test/other/v1"; }],
  ["Module definition changed under unchanged pin", (host) => { host.modules[0].definition.operations[0].outcomes = ["other"]; }],
  ["plugin definition changed under unchanged pin", (host) => { host.plugins[0].definition.implements[0].operations[0].capabilities = []; }],
  ["plugin adapter removed", (host) => { delete host.plugins[0].adapter; }],
  ["Gate callable removed", (host) => { delete host.services.find((entry) => entry.category === "gate").implementation.evaluate; }],
  ["contributor callable removed", (host) => { delete host.services.find((entry) => entry.category === "contributor").implementation.project; }],
  ["contributor ownership changed", (host) => { host.services.find((entry) => entry.category === "contributor").implementation.ownership.scope = "other"; }],
  ["agent validator removed", (host) => { delete host.services.find((entry) => entry.category === "agent").implementation.validateSettings; }],
  ["executor validator removed", (host) => { delete host.services.find((entry) => entry.category === "executor").implementation.validateSettings; }],
  ["harness validator removed", (host) => { delete host.services.find((entry) => entry.category === "harness").implementation.validateSettings; }],
  ["all current executable registrations removed", (host) => {
    host.artifactContracts = [];
    for (const plugin of host.plugins) delete plugin.adapter;
    for (const service of host.services) delete service.implementation;
  }],
]) test(`restart and consumer verification reject ${name} without callbacks or effects`, async () => {
  const fixture = compositionFixture();
  const requestRef = fixture.requestRef();
  const result = await createWorkflowCompositionRuntime(fixture.host).resolve(requestRef);
  assert.equal(result.kind, "ResolvedWorkflowConfiguration", JSON.stringify(result));
  const resultRef = fixture.add("resolved-for-restart", result, COMPOSITION_SCHEMA);
  const before = { ...fixture.counts };
  changeHost(fixture.host);
  const restarted = createWorkflowCompositionRuntime(fixture.host);
  const replayed = await restarted.resolve(requestRef);
  assert.equal(replayed.kind, "CompositionDiagnostics", JSON.stringify(replayed));
  await assert.rejects(restarted.verify(resultRef));
  assert.deepEqual(fixture.counts, before);
});
