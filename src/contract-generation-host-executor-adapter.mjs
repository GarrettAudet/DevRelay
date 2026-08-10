import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateContractGenerationArtifact } from "./contract-generation-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";
const MODULE = Object.freeze({ id: "contract-generation", version: "0.1.0" });
const PLUGINS = Object.freeze({
  "json-schema": Object.freeze({ id: "json-schema-contract-generator", version: "0.1.0", capability: "contract-generation.json-schema/v1" }),
});
const FORBIDDEN = new Set(["approval", "promotion", "gate", "graph", "graphOperations", "traceabilityUpdate", "route", "selectedOperation", "notApplicable"]);

export class ContractGenerationHostExecutorAdapterError extends Error {
  constructor(message) {
    super(`ContractGeneration host-generator adapter rejected input: ${message}`);
    this.name = "ContractGenerationHostExecutorAdapterError";
    this.code = "DR4310";
  }
}

const fail = (message) => { throw new ContractGenerationHostExecutorAdapterError(message); };
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = (value) => structuredClone(value);
const immutable = (value) => Object.freeze(clone(value));
const exactKeys = (value, allowed, required = allowed) => record(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.includes(key));

function assertNoAuthority(value) {
  if (value === null || typeof value !== "object") return;
  if (record(value)) for (const key of Object.keys(value)) if (FORBIDDEN.has(key)) fail(`provider response contains forbidden authority field ${key}`);
  for (const child of Object.values(value)) assertNoAuthority(child);
}

function assertBinding(binding, kind) {
  const declared = PLUGINS[kind];
  if (!declared) fail(`contract kind ${kind} has no reusable host binding`);
  if (!exactKeys(binding, ["module", "step", "plugin", "config", "grants"])) fail("binding is malformed or open-ended");
  if (binding.module?.id !== MODULE.id || binding.module?.version !== MODULE.version || !["establish-contracts", "generate-contract-change"].includes(binding.module?.operation)) fail("module identity, version, or operation drifted");
  if (binding.step !== "generate" || binding.plugin?.id !== declared.id || binding.plugin?.version !== declared.version) fail("step or plug-in identity drifted");
  if (!exactKeys(binding.config, ["contractKind"]) || binding.config.contractKind !== kind) fail("plug-in configuration drifted");
  if (!Array.isArray(binding.grants) || binding.grants.length !== 0) fail("the declared generator binding grants no host authority");
  return declared;
}

async function loadInputs(request, loadArtifact) {
  const loaded = {};
  for (const item of request.inputBindings) {
    const supplied = await loadArtifact(immutable(item.artifact));
    const bytes = Buffer.isBuffer(supplied) || supplied instanceof Uint8Array ? Buffer.from(supplied) : Buffer.from(supplied?.bytes ?? []);
    if (!bytes.length || sha256Digest(bytes) !== item.artifact.digest) fail(`input ${item.role} bytes do not match the declared digest`);
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch { fail(`input ${item.role} is not JSON`); }
    loaded[item.role] = { ref: clone(item.artifact), value, bytesBase64: bytes.toString("base64") };
  }
  const expectedRoles = request.operation === "generate-contract-change"
    ? ["architecture-baseline", "current-contract-baseline", "project-contract-state", "project-overview-baseline"]
    : ["architecture-baseline", "project-contract-state", "project-overview-baseline"];
  if (canonicalJson(Object.keys(loaded).sort()) !== canonicalJson(expectedRoles)) fail("request does not declare the exact operation input set");
  if (request.operation === "generate-contract-change" && canonicalJson(request.currentContractBaseline) !== canonicalJson(loaded["current-contract-baseline"].ref)) fail("current ContractBaseline handoff is stale or substituted");
  return loaded;
}

function validateResponse(response, request, binding, declared) {
  const allowed = ["apiVersion", "kind", "binding", "requestId", "bundle", "nativeEvidence", "executionIdentity", "conformance", "diagnostics"];
  if (!exactKeys(response, allowed, ["apiVersion", "kind", "binding", "requestId", "bundle", "nativeEvidence", "executionIdentity", "conformance"])) fail("provider response is malformed or open-ended");
  if (response.apiVersion !== API || response.kind !== "ContractGenerationHostCapabilityResponse") fail("provider response kind is unsupported");
  if (response.requestId !== request.requestId || canonicalJson(response.binding) !== canonicalJson({ capability: declared.capability, ...binding })) fail("provider substituted the exact request or binding");
  if (!exactKeys(response.executionIdentity, ["executor", "tool", "model", "prompt", "environment"], ["executor", "tool", "environment"])) fail("executor/tool/environment identity is incomplete");
  if (!exactKeys(response.conformance, ["maturity", "validator", "liveProviderExecuted"]) || !["contract-defined", "fixture-conformant"].includes(response.conformance.maturity) || typeof response.conformance.liveProviderExecuted !== "boolean") fail("live conformance requires a separately versioned trusted host attestation contract");
  if (response.conformance.liveProviderExecuted) fail("this binding accepts provider-response or fixture conformance only");
  assertNoAuthority(response);
  try { validateContractGenerationArtifact(response.bundle); } catch (error) { fail(error.message); }
  if (response.bundle.kind !== "GeneratedContractBundle" || response.bundle.requestId !== request.requestId || response.bundle.producer.id !== declared.id || response.bundle.producer.version !== declared.version) fail("bundle does not bind the exact request and producer");
  if (response.bundle.entries.some((entry) => entry.contractKind !== request.contractKind)) fail("bundle contractKind substituted the requested protocol");
  if (!Array.isArray(response.nativeEvidence) || response.nativeEvidence.length !== response.bundle.entries.length) fail("native evidence must cover every generated entry exactly once");
  const evidence = new Map();
  for (const item of response.nativeEvidence) {
    if (!exactKeys(item, ["contractId", "contentDigest", "schema", "mediaType", "sourceProvenance"]) || !record(item.sourceProvenance)) fail("native evidence is malformed or lacks source provenance");
    if (evidence.has(item.contractId)) fail("native evidence repeats a contract identity");
    evidence.set(item.contractId, item);
  }
  for (const entry of response.bundle.entries) {
    const item = evidence.get(entry.id);
    const bytes = Buffer.from(entry.bytesBase64, "base64");
    if (!item || item.contentDigest !== sha256Digest(bytes) || item.schema !== entry.schema || item.mediaType !== entry.mediaType) fail(`${entry.id} native evidence does not bind its exact bytes`);
  }
  return clone(response);
}

export function createJsonSchemaContractHostGenerator({ binding, executeCapability, executor, loadArtifact, persistEvidence } = {}) {
  const declared = assertBinding(binding, "json-schema");
  const execute = executeCapability ?? executor;
  if (typeof execute !== "function" || typeof loadArtifact !== "function" || typeof persistEvidence !== "function") fail("executeCapability, loadArtifact, and persistEvidence host ports are required");
  return Object.freeze({
    id: declared.id,
    version: declared.version,
    async generate(request) {
      validateContractGenerationArtifact(request);
      if (request.contractKind !== "json-schema" || request.operation !== binding.module.operation) fail("request kind or routed operation does not match the configured binding");
      const inputs = await loadInputs(request, loadArtifact);
      const capabilityRequest = immutable({ apiVersion: API, kind: "ContractGenerationHostCapabilityRequest", binding: { capability: declared.capability, ...clone(binding) }, request, inputs, requestDigest: canonicalJsonDigest(request) });
      let returned;
      try { returned = await execute(capabilityRequest); } catch (error) { fail(`host executor failed: ${error instanceof Error ? error.message : String(error)}`); }
      const response = validateResponse(returned, request, binding, declared);
      const evidence = immutable({ requestId: request.requestId, requestDigest: capabilityRequest.requestDigest, binding: response.binding, nativeEvidence: response.nativeEvidence, executionIdentity: response.executionIdentity, conformance: response.conformance });
      const receipt = await persistEvidence(evidence);
      if (!record(receipt) || receipt.digest !== canonicalJsonDigest(evidence)) fail("persistEvidence did not preserve the exact generator evidence");
      return immutable(response.bundle);
    },
  });
}

export const CONTRACT_GENERATION_HOST_CAPABILITIES = Object.freeze(Object.fromEntries(Object.entries(PLUGINS).map(([kind, value]) => [kind, value.capability])));
