import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ArchitectureHostExecutorAdapterError,
  createArchitectureDesignHostExecutorRegistry,
  createMadrHostExecutorAdapter,
  createOpenSpecDesignHostExecutorAdapter,
  createStructurizrHostExecutorAdapter,
} from "../src/architecture-host-executor-adapters.mjs";
import { sha256Digest } from "../src/content-digest.mjs";

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

function invocation() {
  const config = { projectRoot: "C:/repos/DevRelay", toolVersion: "1.0", changeName: "prefix-integrity", schema: "devrelay-architecture", artifact: "design.md", bridge: "agent-command", toolName: "OpenSpec" };
  return {
    apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleStepInvocation", invocationId: "dg1-architecture-adapter-test", runId: "dg1-run", nodeId: "architecture-design", invocationFingerprint: `sha256:${"1".repeat(64)}`, chainFingerprint: `sha256:${"2".repeat(64)}`, stepInvocationDigest: `sha256:${"3".repeat(64)}`,
    module: { id: "architecture-design", version: "0.1.0", operation: "design-change" }, step: "designer", plugin: { id: "openspec-design", version: "0.1.0" }, inputs: {}, priorResults: [], options: {}, config,
    grants: [{ kind: "filesystem.read", scope: config.projectRoot }, { kind: "filesystem.write", scope: `${config.projectRoot}/openspec/changes` }, { kind: "network.connect", scope: "host:implementation-engine" }],
  };
}

const producer = (value) => ({ invocationId: value.invocationId, step: value.step, plugin: value.plugin, invocationFingerprint: value.invocationFingerprint, chainFingerprint: value.chainFingerprint, stepInvocationDigest: value.stepInvocationDigest });

function store() {
  const values = new Map();
  return {
    values,
    async loadArtifact(ref) { const bytes = values.get(ref.artifactId); if (!bytes) throw new Error("missing artifact"); return bytes; },
    async persistArtifact(record) { values.set(record.artifactId, Buffer.from(record.bytes)); return { artifactId: record.artifactId, schema: record.schema, mediaType: record.mediaType, digest: sha256Digest(record.bytes), uri: `artifact://${record.artifactId}` }; },
  };
}

async function responseFor(request, mutate) {
  const artifact = await json("../examples/artifacts/architecture-designer-working-001.json");
  const response = {
    apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureHostCapabilityResponse", binding: request.binding, artifact,
    nativeArtifacts: [{ artifactId: "dg1-openspec-design-native", schema: "https://devrelay.dev/native/openspec-design/v1", mediaType: "text/markdown", role: "technical-design-source", path: "design.md", content: "# DG-1 design\n", provenance: { source: "host-executor", invocationId: request.invocation.invocationId } }],
    executionIdentity: { executor: { id: "fixture-host", version: "1" }, tool: { name: "OpenSpec", version: "1.0" }, model: { id: "bounded-fixture", version: "1" }, prompt: { digest: `sha256:${"4".repeat(64)}` }, environment: { id: "node-test", version: process.version } },
    conformance: { maturity: "fixture-conformant", validator: "canonical-architecture-validator", realCliExecuted: false },
  };
  mutate?.(response);
  return response;
}

test("OpenSpec Design host executor is bounded and preserves native bytes", async () => {
  const invocationValue = invocation();
  const artifacts = store();
  let calls = 0;
  const adapter = createOpenSpecDesignHostExecutorAdapter({ ...artifacts, async executeCapability(request) { calls += 1; return responseFor(request); } });
  const result = await adapter.invoke(invocationValue, {}, producer(invocationValue));
  assert.equal(calls, 1);
  assert.equal(result.disposition, "continue");
  assert.deepEqual(Object.keys(result.outputs), ["architecture-designer-working"]);
  assert.equal(artifacts.values.get("dg1-openspec-design-native").toString("utf8"), "# DG-1 design\n");
});

test("host executor adapters fail closed on substitution, hidden authority, and false live claims", async () => {
  for (const mutate of [
    (value) => { value.binding.plugin.id = "substitute"; },
    (value) => { value.artifact.approval = "approved"; },
    (value) => { value.conformance = { maturity: "live-conformant", validator: "fixture", realCliExecuted: false }; },
  ]) {
    const invocationValue = invocation();
    const artifacts = store();
    const adapter = createOpenSpecDesignHostExecutorAdapter({ ...artifacts, executeCapability: (request) => responseFor(request, mutate) });
    await assert.rejects(() => adapter.invoke(invocationValue, {}, producer(invocationValue)), ArchitectureHostExecutorAdapterError);
  }
});

test("all three adapter paths reject provider-authored live conformance even when CLI execution is self-asserted", async () => {
  for (const [step, plugin, factory] of [["designer", "openspec-design", createOpenSpecDesignHostExecutorAdapter], ["modeler", "structurizr", createStructurizrHostExecutorAdapter], ["decision-recorder", "madr", createMadrHostExecutorAdapter]]) {
    const fixture = step === "designer" ? { invocation: invocation(), artifacts: store(), artifact: await json("../examples/artifacts/architecture-designer-working-001.json") } : await chainedFixture(step);
    let executorCalls = 0, processOrCliCalls = 0;
    const adapter = factory({ ...fixture.artifacts, executeCapability(request) { executorCalls += 1; return providerResponse(request, fixture.artifact, plugin, (value) => { value.conformance = { maturity: "live-conformant", validator: "provider-self-attested", realCliExecuted: true }; }); } });
    await assert.rejects(() => adapter.invoke(fixture.invocation, {}, step === "designer" ? producer(fixture.invocation) : undefined), /live|conformance|attestation/i);
    assert.equal(executorCalls, 1); assert.equal(processOrCliCalls, 0);
  }
});

test("registry factory assembles only the exact published architecture bindings", () => {
  const artifacts = store();
  const executor = async () => { throw new Error("not executed"); };
  const registry = createArchitectureDesignHostExecutorRegistry({ executors: { openspecDesign: executor, structurizr: executor, madr: executor }, ...artifacts });
  assert.equal(typeof registry.execute, "function");
  assert.equal(typeof registry.selectOperation, "function");
});

const dg1 = "../dogfood/bootstrap-architecture-host-executor-adapters/dg1-continuation/";
const artifactRef = (value, schema, mediaType) => {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  return { artifactId: value.workingArtifactId ?? value.changeSetId, schema, mediaType, digest: sha256Digest(bytes), uri: `artifact://${value.workingArtifactId ?? value.changeSetId}` };
};
const prior = (invocationValue, step, plugin, outputs, digestCharacter) => ({ step, plugin: { id: plugin, version: "0.1.0" }, sourceInvocation: { invocationId: invocationValue.invocationId, invocationFingerprint: invocationValue.invocationFingerprint, plugin: { id: plugin, version: "0.1.0" }, stepInvocationDigest: `sha256:${digestCharacter.repeat(64)}` }, stepInvocationDigest: `sha256:${digestCharacter.repeat(64)}`, digest: `sha256:${"9".repeat(64)}`, outputs });

async function chainedFixture(step) {
  const designer = await json(`${dg1}architecture-designer-working.json`);
  const modeler = await json(`${dg1}architecture-modeler-working.json`);
  const candidate = await json(`${dg1}architecture-change-set-draft.json`);
  const designerRef = artifactRef(designer, "https://devrelay.dev/artifacts/architecture-designer-working/v1", "application/vnd.devrelay.architecture-designer-working+json");
  const modelerRef = artifactRef(modeler, "https://devrelay.dev/artifacts/architecture-modeler-working/v1", "application/vnd.devrelay.architecture-modeler-working+json");
  const base = invocation();
  if (step === "modeler") Object.assign(base, { step, plugin: { id: "structurizr", version: "0.1.0" }, config: { projectRoot: "C:/repos/DevRelay", toolVersion: "2026.06.28", workspacePath: "dogfood/dg1/workspace.dsl", exportFormat: "static", toolName: "Structurizr DSL" }, grants: [{ kind: "filesystem.read", scope: "C:/repos/DevRelay" }, { kind: "filesystem.write", scope: "C:/repos/DevRelay/architecture" }, { kind: "process.spawn", scope: "structurizr-export" }] });
  if (step === "decision-recorder") Object.assign(base, { step, plugin: { id: "madr", version: "0.1.0" }, config: { projectRoot: "C:/repos/DevRelay", templateVersion: "4.0", decisionsPath: "C:/repos/DevRelay/dogfood/dg1", toolName: "MADR", toolVersion: "4.0" }, grants: [{ kind: "filesystem.read", scope: "C:/repos/DevRelay" }, { kind: "filesystem.write", scope: "C:/repos/DevRelay/dogfood/dg1" }] });
  base.priorResults = [prior(base, "designer", "openspec-design", { "architecture-designer-working": [designerRef] }, "5")];
  if (step === "decision-recorder") base.priorResults.push(prior(base, "modeler", "structurizr", { "architecture-modeler-working": [modelerRef] }, "6"));
  const artifacts = store();
  artifacts.values.set(designerRef.artifactId, Buffer.from(`${JSON.stringify(designer, null, 2)}\n`));
  artifacts.values.set(modelerRef.artifactId, Buffer.from(`${JSON.stringify(modeler, null, 2)}\n`));
  return { invocation: base, artifacts, artifact: step === "modeler" ? modeler : candidate };
}

function providerResponse(request, artifact, plugin, mutate) {
  const role = plugin === "structurizr" ? "structurizr-workspace" : "madr-decision-record";
  const response = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureHostCapabilityResponse", binding: request.binding, artifact: structuredClone(artifact), nativeArtifacts: [{ artifactId: `${plugin}-focused-native`, schema: `https://devrelay.dev/native/${plugin}/v1`, mediaType: plugin === "structurizr" ? "text/vnd.structurizr.dsl" : "text/markdown", role, path: plugin === "structurizr" ? "workspace.dsl" : "decision.md", content: "bounded native evidence\n", provenance: { source: "focused-test", invocationId: request.invocation.invocationId } }], executionIdentity: { executor: { id: "focused-fixture", version: "1" }, tool: { name: plugin === "structurizr" ? "Structurizr DSL" : "MADR", version: "1" }, model: { id: "fixture", version: "1" }, prompt: { digest: `sha256:${"7".repeat(64)}` }, environment: { id: "node", version: process.version } }, conformance: { maturity: "fixture-conformant", validator: "canonical", realCliExecuted: false }, evidence: [], diagnostics: [] };
  mutate?.(response); return response;
}

test("Structurizr and MADR executor entries return only their declared handoff/terminal result", async () => {
  for (const [step, plugin, factory] of [["modeler", "structurizr", createStructurizrHostExecutorAdapter], ["decision-recorder", "madr", createMadrHostExecutorAdapter]]) {
    const fixture = await chainedFixture(step); let calls = 0;
    const adapter = factory({ ...fixture.artifacts, executeCapability(request) { calls += 1; return providerResponse(request, fixture.artifact, plugin); } });
    const result = await adapter.invoke(fixture.invocation, {});
    assert.equal(calls, 1); assert.equal(result.disposition, plugin === "madr" ? "terminal" : "continue");
  }
});

test("Structurizr rejects invalid C4 nesting and views through canonical validation", async () => {
  for (const mutate of [
    (artifact) => { artifact.architectureModel.content.elements.find(({ type }) => type === "component").parentId = "EL-DEVRELAY-SYSTEM"; },
    (artifact) => { const view = artifact.diagrams.content.views.find(({ type }) => type === "component"); view.elementIds = ["EL-NOT-IN-MODEL"]; },
  ]) {
    const fixture = await chainedFixture("modeler"); const changed = structuredClone(fixture.artifact); mutate(changed);
    const adapter = createStructurizrHostExecutorAdapter({ ...fixture.artifacts, executeCapability: (request) => providerResponse(request, changed, "structurizr") });
    await assert.rejects(() => adapter.invoke(fixture.invocation, {}), ArchitectureHostExecutorAdapterError);
  }
});

test("MADR rejects incomplete decisions and both adapters reject bad handoff/provider/evidence authority", async () => {
  const incomplete = await chainedFixture("decision-recorder");
  delete incomplete.artifact.sections.decisionRecords.content.decisions.at(-1).consideredOptions;
  await assert.rejects(() => createMadrHostExecutorAdapter({ ...incomplete.artifacts, executeCapability: (request) => providerResponse(request, incomplete.artifact, "madr") }).invoke(incomplete.invocation, {}), ArchitectureHostExecutorAdapterError);

  for (const step of ["modeler", "decision-recorder"]) {
    const plugin = step === "modeler" ? "structurizr" : "madr", factory = step === "modeler" ? createStructurizrHostExecutorAdapter : createMadrHostExecutorAdapter;
    for (const handoffMutation of [(value) => { value.priorResults[0].sourceInvocation.invocationId = "cross-invocation"; }, (value) => { value.priorResults[0].sourceInvocation.invocationFingerprint = `sha256:${"8".repeat(64)}`; }, (value) => { value.priorResults[0].plugin.id = "substitute"; }]) {
      const fixture = await chainedFixture(step); handoffMutation(fixture.invocation); let calls = 0;
      const adapter = factory({ ...fixture.artifacts, executeCapability() { calls += 1; } });
      await assert.rejects(() => adapter.invoke(fixture.invocation, {}), ArchitectureHostExecutorAdapterError); assert.equal(calls, 0);
    }
    for (const mutate of [(value) => { value.binding.plugin.id = "provider-substitute"; }, (value) => { value.artifact.graphOperations = []; }, (value) => { value.nativeArtifacts = []; }, (value) => { delete value.nativeArtifacts[0].provenance; }]) {
      const fixture = await chainedFixture(step);
      const adapter = factory({ ...fixture.artifacts, executeCapability: (request) => providerResponse(request, fixture.artifact, plugin, mutate) });
      await assert.rejects(() => adapter.invoke(fixture.invocation, {}), ArchitectureHostExecutorAdapterError);
    }
  }
});
