import { readFileSync } from "node:fs";

import { validateArchitectureArtifact } from "./architecture-artifact-validator.mjs";
import { architectureRuntimeArtifactContracts } from "./architecture-runtime-contracts.mjs";
import { canonicalJson, sha256Digest } from "./content-digest.mjs";
import { createModuleRegistry } from "./module-registry.mjs";

const API = "devrelay.dev/v1alpha1";
const MODULE = Object.freeze({ id: "architecture-design", version: "0.1.0" });
const CAPABILITIES = Object.freeze({
  "openspec-design": "openspec.architecture.design/v1",
  structurizr: "structurizr.architecture.model/v1",
  madr: "madr.architecture.decisions/v1",
});
const BINDINGS = Object.freeze({
  "openspec-design": Object.freeze({ version: "0.1.0", steps: Object.freeze({ "design-change": "designer" }) }),
  structurizr: Object.freeze({ version: "0.1.0", steps: Object.freeze({ "establish-baseline": "modeler", "design-change": "modeler" }) }),
  madr: Object.freeze({ version: "0.1.0", steps: Object.freeze({ "establish-baseline": "decision-recorder", "design-change": "decision-recorder" }) }),
});
const OUTPUT = Object.freeze({
  "openspec-design": Object.freeze({ kind: "ArchitectureDesignerWorkingArtifact", port: "architecture-designer-working", disposition: "continue" }),
  structurizr: Object.freeze({ kind: "ArchitectureModelerWorkingArtifact", port: "architecture-modeler-working", disposition: "continue" }),
  madr: Object.freeze({ kinds: Object.freeze(["ArchitectureDraft", "ArchitectureChangeSetDraft"]), disposition: "terminal" }),
});
const FORBIDDEN = new Set(["approval", "promotion", "gate", "graph", "graphOperations", "traceabilityUpdate", "route", "selectedOperation"]);

export class ArchitectureHostExecutorAdapterError extends Error {
  constructor(message) {
    super(`Architecture host-executor adapter rejected input: ${message}`);
    this.name = "ArchitectureHostExecutorAdapterError";
    this.code = "DR4300";
  }
}

const fail = (message) => { throw new ArchitectureHostExecutorAdapterError(message); };
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = (value) => structuredClone(value);
const immutable = (value) => Object.freeze(clone(value));
const exactKeys = (value, allowed, required = allowed) => record(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.includes(key));

function assertNoAuthority(value) {
  if (value === null || typeof value !== "object") return;
  if (record(value)) for (const key of Object.keys(value)) if (FORBIDDEN.has(key)) fail(`provider response contains forbidden authority field ${key}`);
  for (const child of Object.values(value)) assertNoAuthority(child);
}

function expectedGrants(pluginId, config) {
  if (pluginId === "openspec-design") return [["filesystem.read", config.projectRoot], ["filesystem.write", `${config.projectRoot.replace(/[\\/]$/, "")}/openspec/changes`], ["network.connect", "host:implementation-engine"]];
  if (pluginId === "structurizr") return [["filesystem.read", config.projectRoot], ["filesystem.write", `${config.projectRoot.replace(/[\\/]$/, "")}/architecture`], ["process.spawn", "structurizr-export"]];
  return [["filesystem.read", config.projectRoot], ["filesystem.write", config.decisionsPath]];
}

function assertBinding(invocation, pluginId) {
  const binding = BINDINGS[pluginId];
  if (!record(invocation) || invocation.kind !== "ModuleStepInvocation") fail("an exact ModuleStepInvocation is required");
  if (invocation.module?.id !== MODULE.id || invocation.module?.version !== MODULE.version) fail("module identity or version drifted");
  const operation = invocation.module.operation;
  if (binding.steps[operation] !== invocation.step) fail("operation/step binding is not declared by the exact plug-in manifest");
  if (invocation.plugin?.id !== pluginId || invocation.plugin?.version !== binding.version) fail("plug-in identity or version drifted");
  const config = invocation.config;
  if (!record(config) || typeof config.projectRoot !== "string" || !config.projectRoot) fail("plug-in configuration is incomplete");
  if (pluginId === "openspec-design" && (config.toolName !== "OpenSpec" || config.artifact !== "design.md" || config.bridge !== "agent-command" || config.schema !== "devrelay-architecture" || !config.toolVersion || !config.changeName)) fail("OpenSpec Design configuration drifted");
  if (pluginId === "structurizr" && (config.toolName !== "Structurizr DSL" || !config.toolVersion || !config.workspacePath || !["plantuml", "mermaid", "dot", "json", "static"].includes(config.exportFormat))) fail("Structurizr configuration drifted");
  if (pluginId === "madr" && (config.toolName !== "MADR" || !config.toolVersion || !config.templateVersion || !config.decisionsPath)) fail("MADR configuration drifted");
  const grants = invocation.grants;
  if (!Array.isArray(grants) || expectedGrants(pluginId, config).some(([kind, scope]) => !grants.some((grant) => grant?.kind === kind && grant?.scope === scope))) fail("capability grants do not satisfy the exact plug-in binding");
}

async function loadExact(ref, loadArtifact, label) {
  if (!record(ref) || typeof ref.artifactId !== "string" || typeof ref.digest !== "string") fail(`${label} reference is malformed`);
  const supplied = await loadArtifact(immutable(ref));
  const bytes = Buffer.isBuffer(supplied) || supplied instanceof Uint8Array ? Buffer.from(supplied) : Buffer.from(supplied?.bytes ?? []);
  if (!bytes.length || sha256Digest(bytes) !== ref.digest) fail(`${label} bytes do not match the declared digest`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail(`${label} is not JSON`); }
  return { ref: clone(ref), value };
}

async function loadDeclared(invocation, loadArtifact) {
  const inputs = {};
  for (const [port, refs] of Object.entries(invocation.inputs ?? {})) {
    if (!Array.isArray(refs) || refs.length !== 1) fail(`input ${port} must have exact cardinality one`);
    inputs[port] = await loadExact(refs[0], loadArtifact, `input ${port}`);
  }
  const handoffs = [];
  for (const prior of invocation.priorResults ?? []) {
    if (!record(prior) || !record(prior.outputs)) fail("prior handoff descriptor is malformed");
    const loadedOutputs = {};
    for (const [port, refs] of Object.entries(prior.outputs)) {
      if (!Array.isArray(refs) || refs.length !== 1) fail(`prior handoff ${port} must have exact cardinality one`);
      loadedOutputs[port] = await loadExact(refs[0], loadArtifact, `prior handoff ${port}`);
    }
    handoffs.push({ descriptor: clone(prior), outputs: loadedOutputs });
  }
  const expectedPrefix = invocation.step === "designer" ? [] : invocation.step === "modeler" ? [["designer", invocation.module.operation === "design-change" ? "openspec-design" : "spec-kit-plan"]] : [["designer", invocation.module.operation === "design-change" ? "openspec-design" : "spec-kit-plan"], ["modeler", "structurizr"]];
  if (handoffs.length !== expectedPrefix.length) fail("prior handoffs are not the exact chain prefix");
  for (let index = 0; index < expectedPrefix.length; index += 1) {
    const [step, plugin] = expectedPrefix[index], prior = handoffs[index].descriptor;
    if (prior.step !== step || prior.plugin?.id !== plugin || prior.sourceInvocation?.plugin?.id !== plugin || prior.sourceInvocation?.invocationId !== invocation.invocationId || prior.sourceInvocation?.invocationFingerprint !== invocation.invocationFingerprint || prior.sourceInvocation?.stepInvocationDigest !== prior.stepInvocationDigest) fail("prior handoff is stale, cross-invocation, or substituted");
  }
  return { inputs, handoffs };
}

function requestBinding(invocation, pluginId) {
  return {
    capability: CAPABILITIES[pluginId],
    module: { ...MODULE, operation: invocation.module.operation },
    step: invocation.step,
    plugin: clone(invocation.plugin),
    config: clone(invocation.config),
    grants: clone(invocation.grants),
  };
}

function parseResponse(response, request, pluginId) {
  const allowed = ["apiVersion", "kind", "binding", "artifact", "nativeArtifacts", "executionIdentity", "conformance", "evidence", "diagnostics"];
  if (!exactKeys(response, allowed, ["apiVersion", "kind", "binding", "artifact", "nativeArtifacts", "executionIdentity", "conformance"])) fail("provider response is malformed or open-ended");
  if (response.apiVersion !== API || response.kind !== "ArchitectureHostCapabilityResponse") fail("provider response kind is unsupported");
  if (canonicalJson(response.binding) !== canonicalJson(request.binding)) fail("provider substituted the requested binding");
  if (!exactKeys(response.executionIdentity, ["executor", "tool", "model", "prompt", "environment"], ["executor", "tool", "environment"])) fail("executor/tool/environment identity is incomplete");
  if (!exactKeys(response.conformance, ["maturity", "validator", "realCliExecuted"]) || !["contract-defined", "fixture-conformant"].includes(response.conformance.maturity) || typeof response.conformance.realCliExecuted !== "boolean") fail("this adapter version supports only contract-defined or fixture-conformant provider responses; live conformance requires a future separately versioned trusted execution-attestation contract");
  if (!Array.isArray(response.nativeArtifacts) || response.nativeArtifacts.length === 0) fail("native evidence is required");
  const expected = OUTPUT[pluginId];
  if (expected.kind && response.artifact?.kind !== expected.kind) fail(`executor must return only ${expected.kind}`);
  if (expected.kinds && !expected.kinds.includes(response.artifact?.kind)) fail("MADR terminal artifact kind is not declared");
  if (pluginId === "madr" && ((request.binding.module.operation === "design-change") !== (response.artifact.kind === "ArchitectureChangeSetDraft"))) fail("MADR terminal artifact does not match the routed operation");
  assertNoAuthority(response);
  try { validateArchitectureArtifact(response.artifact); } catch (error) { fail(`canonical architecture validation failed: ${error instanceof Error ? error.message : String(error)}`); }
  return clone(response);
}

async function persistNative(nativeArtifacts, persistArtifact, executionIdentity) {
  const refs = [];
  for (const native of nativeArtifacts) {
    if (!exactKeys(native, ["artifactId", "schema", "mediaType", "role", "path", "content", "provenance"]) || !record(native.provenance)) fail("native evidence entry is malformed or lacks source provenance");
    if ([native.artifactId, native.schema, native.mediaType, native.role, native.path, native.content].some((value) => typeof value !== "string" || !value)) fail("native evidence entry is incomplete");
    if (native.path.includes("\\") || native.path.startsWith("/") || native.path.split("/").some((part) => !part || part === "." || part === "..")) fail("native evidence path is not portable and bounded");
    const bytes = Buffer.from(native.content.normalize("NFC"), "utf8");
    const expected = { artifactId: native.artifactId, schema: native.schema, mediaType: native.mediaType, digest: sha256Digest(bytes) };
    const returned = await persistArtifact({ ...expected, bytes, provenance: immutable(native.provenance), executionIdentity: immutable(executionIdentity) });
    if (!record(returned) || canonicalJson({ artifactId: returned.artifactId, schema: returned.schema, mediaType: returned.mediaType, digest: returned.digest }) !== canonicalJson(expected)) fail(`persistArtifact did not preserve native bytes for ${native.artifactId}`);
    refs.push(clone(returned));
  }
  return refs;
}

function artifactId(artifact) {
  return artifact.workingArtifactId ?? artifact.changeSetId ?? artifact.draftId;
}

async function persistCanonical(artifact, persistArtifact) {
  const id = artifactId(artifact);
  if (typeof id !== "string" || !id) fail("canonical artifact identity is missing");
  const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  const slug = artifact.kind.replace(/Artifact$/, "").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const expected = { artifactId: id, schema: `https://devrelay.dev/artifacts/${slug}/v1`, mediaType: `application/vnd.devrelay.${slug}+json`, digest: sha256Digest(bytes) };
  const returned = await persistArtifact({ ...expected, bytes, value: immutable(artifact) });
  if (!record(returned) || returned.artifactId !== expected.artifactId || returned.digest !== expected.digest) fail("persistArtifact did not preserve the canonical artifact bytes");
  return clone(returned);
}

function stepEnvelope(invocation, pluginId, artifactRef, response) {
  const common = { apiVersion: API, kind: "ModuleStepResult", invocationId: invocation.invocationId, invocationFingerprint: invocation.invocationFingerprint, chainFingerprint: invocation.chainFingerprint, stepInvocationDigest: invocation.stepInvocationDigest, step: invocation.step, plugin: clone(invocation.plugin) };
  if (pluginId !== "madr") return { ...common, disposition: "continue", outputs: { [OUTPUT[pluginId].port]: [artifactRef] }, evidence: clone(response.evidence ?? []), diagnostics: clone(response.diagnostics ?? []) };
  const port = response.artifact.kind === "ArchitectureDraft" ? "architecture-draft" : "architecture-change-set-draft";
  const outcome = response.artifact.kind === "ArchitectureDraft" ? "baseline_drafted" : "change_set_drafted";
  return { ...common, disposition: "terminal", moduleResult: { apiVersion: API, kind: "ModuleResult", invocationId: invocation.invocationId, status: "completed", outcome, outputs: { [port]: [artifactRef] }, evidence: clone(response.evidence ?? []), diagnostics: clone(response.diagnostics ?? []) } };
}

function createAdapter(pluginId, { executeCapability, executor, loadArtifact, persistArtifact } = {}) {
  const execute = executeCapability ?? executor;
  if (typeof execute !== "function" || typeof loadArtifact !== "function" || typeof persistArtifact !== "function") fail(`${pluginId} requires executeCapability, loadArtifact, and persistArtifact host ports`);
  return Object.freeze({
    async invoke(invocation, _adapterContext, producer) {
      assertBinding(invocation, pluginId);
      if (producer && (producer.stepInvocationDigest !== invocation.stepInvocationDigest || producer.invocationId !== invocation.invocationId || canonicalJson(producer.plugin) !== canonicalJson(invocation.plugin))) fail("effect producer identity is stale");
      const loaded = await loadDeclared(invocation, loadArtifact);
      const request = { apiVersion: API, kind: "ArchitectureHostCapabilityRequest", binding: requestBinding(invocation, pluginId), invocation: { invocationId: invocation.invocationId, invocationFingerprint: invocation.invocationFingerprint, chainFingerprint: invocation.chainFingerprint, stepInvocationDigest: invocation.stepInvocationDigest }, inputs: loaded.inputs, priorHandoffs: loaded.handoffs };
      let returned;
      try { returned = await execute(immutable(request)); } catch (error) { fail(`${pluginId} executor failed: ${error instanceof Error ? error.message : String(error)}`); }
      const response = parseResponse(returned, request, pluginId);
      await persistNative(response.nativeArtifacts, persistArtifact, response.executionIdentity);
      const ref = await persistCanonical(response.artifact, persistArtifact);
      return stepEnvelope(invocation, pluginId, ref, response);
    },
  });
}

export const ARCHITECTURE_HOST_EXECUTOR_CAPABILITIES = CAPABILITIES;
export const createOpenSpecDesignHostExecutorAdapter = (ports) => createAdapter("openspec-design", ports);
export const createStructurizrHostExecutorAdapter = (ports) => createAdapter("structurizr", ports);
export const createMadrHostExecutorAdapter = (ports) => createAdapter("madr", ports);

function definition(relative) {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));
}

export function createArchitectureDesignHostExecutorRegistry({ executors, loadArtifact, persistArtifact, moduleDefinition, pluginDefinitions } = {}) {
  if (!record(executors)) fail("executors must provide openspecDesign, structurizr, and madr host capabilities");
  const module = moduleDefinition ?? definition("../examples/modules/architecture-design.module.json");
  const definitions = pluginDefinitions ?? ["openspec-design", "structurizr", "madr"].map((id) => definition(`../examples/plugins/${id}.plugin.json`));
  const ports = (executeCapability) => ({ executeCapability, loadArtifact, persistArtifact });
  const adapters = { "openspec-design": createOpenSpecDesignHostExecutorAdapter(ports(executors.openspecDesign)), structurizr: createStructurizrHostExecutorAdapter(ports(executors.structurizr)), madr: createMadrHostExecutorAdapter(ports(executors.madr)) };
  return createModuleRegistry({ modules: [module], plugins: definitions.map((item) => ({ definition: item, adapter: adapters[item.metadata.id] })), artifactContracts: architectureRuntimeArtifactContracts() });
}
