import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateProviderExecutionAttestation } from "./provider-execution-attestation.mjs";

const API = "devrelay.dev/v1alpha1";
const CAPABILITIES = new Set(["inventory", "acquire", "configure", "service-check", "target-probe"]);
const MATURITY = ["contract-defined", "fixture-conformant", "live-conformant", "release-ready"];
const FORBIDDEN_AUTHORITY = new Set(["approval", "gateDecision", "graphMutation", "graphOperations", "nextOperation", "progression", "readinessReceipt", "routeDecision", "workflowAuthority"]);

export class EnvironmentPreparationAdapterError extends Error {
  constructor(message, code = "DR5440") {
    super(`environment preparation adapter failed: ${message}`);
    this.name = "EnvironmentPreparationAdapterError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new EnvironmentPreparationAdapterError(message, code);
};
const ordered = (values, key) => [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const grantKey = ({ kind, scope, purpose }) => `${kind}\0${scope}\0${purpose}`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function validateNoAuthorityOrSecrets(value) {
  const visit = (item, key = "") => {
    if (FORBIDDEN_AUTHORITY.has(key)) fail(`adapter output attempts lifecycle authority through ${key}`, "DR5441");
    if (Array.isArray(item)) return item.forEach((entry) => visit(entry, key));
    if (!item || typeof item !== "object") {
      if (/(?:secret|token|password|credential|api[-_]?key)/iu.test(key) && typeof item !== "boolean") fail(`adapter output exposes sensitive field ${key}`, "DR5442");
      return;
    }
    for (const [childKey, child] of Object.entries(item)) visit(child, childKey);
  };
  visit(value);
}

export function defineEnvironmentAdapterManifest({
  id,
  version,
  capabilities,
  permissionDemands = [],
  offlineDefault = true,
  configurationSchemaDigest,
} = {}) {
  if (typeof id !== "string" || !id || typeof version !== "string" || !version) fail("adapter id and version are required");
  if (!Array.isArray(capabilities) || capabilities.length === 0 || capabilities.some((item) => !CAPABILITIES.has(item)) || new Set(capabilities).size !== capabilities.length) fail("adapter capabilities must be unique known capability types");
  if (!configurationSchemaDigest?.startsWith("sha256:")) fail("adapter configuration schema digest is required");
  const body = {
    apiVersion: API,
    kind: "EnvironmentAdapterManifest",
    id,
    version,
    capabilities: ordered(capabilities, (value) => value),
    permissionDemands: ordered(permissionDemands, grantKey),
    offlineDefault,
    configurationSchemaDigest,
  };
  return Object.freeze({ ...body, manifestDigest: canonicalJsonDigest(body) });
}

function validateManifest(manifest) {
  const rebuilt = defineEnvironmentAdapterManifest(manifest);
  if (manifest.manifestDigest !== rebuilt.manifestDigest) fail(`adapter manifest ${manifest.id} drifted`);
}

export function selectEnvironmentAdapter({ catalog, configuredAdapterId, capability, hostGrants = [] } = {}) {
  if (!CAPABILITIES.has(capability)) fail(`unknown environment capability ${capability}`);
  const matches = catalog.filter(({ id }) => id === configuredAdapterId);
  if (matches.length !== 1) fail(`configured adapter ${configuredAdapterId} is unavailable or ambiguous`, "DR5443");
  const manifest = matches[0];
  validateManifest(manifest);
  if (!manifest.capabilities.includes(capability)) fail(`adapter ${manifest.id} does not provide ${capability}`, "DR5443");
  const demands = ordered(manifest.permissionDemands, grantKey);
  const grants = ordered(hostGrants, grantKey);
  if (!demands.every((demand) => grants.some((grant) => grantKey(grant) === grantKey(demand)))) fail(`adapter ${manifest.id} lacks exact host grants`, "DR5444");
  if (manifest.offlineDefault && demands.some(({ kind }) => kind === "network.connect") && !grants.some(({ kind }) => kind === "network.connect")) fail(`adapter ${manifest.id} cannot use undeclared network access`, "DR5444");
  return Object.freeze({ manifest, capability, hostGrants: grants });
}

export function createEnvironmentAdapterInvocation({ invocationId, selection, request, configurationDigest } = {}) {
  validateManifest(selection?.manifest);
  if (!selection.manifest.capabilities.includes(selection.capability)) fail("selection capability is not declared by its manifest");
  const body = {
    apiVersion: API,
    kind: "EnvironmentAdapterInvocation",
    invocationId,
    adapter: { id: selection.manifest.id, version: selection.manifest.version, manifestDigest: selection.manifest.manifestDigest },
    capability: selection.capability,
    request: structuredClone(request),
    configurationDigest,
    grants: structuredClone(selection.hostGrants),
  };
  return Object.freeze({ ...body, invocationFingerprint: canonicalJsonDigest(body) });
}

function validateInvocation(invocation, manifest) {
  if (!exactKeys(invocation, ["apiVersion", "kind", "invocationId", "adapter", "capability", "request", "configurationDigest", "grants", "invocationFingerprint"])) fail("adapter invocation contains unknown or missing fields");
  const { invocationFingerprint, ...body } = invocation;
  if (invocationFingerprint !== canonicalJsonDigest(body)) fail("adapter invocation fingerprint drifted");
  if (invocation.adapter.id !== manifest.id || invocation.adapter.version !== manifest.version || invocation.adapter.manifestDigest !== manifest.manifestDigest || !manifest.capabilities.includes(invocation.capability)) fail("adapter invocation substitutes its manifest or capability");
}

function maturityFor(raw, invocation, trustedObservers) {
  if (raw.executionAttestation) {
    const observer = trustedObservers.find((candidate) => same(candidate, raw.executionAttestation.observer));
    if (!observer) fail("live adapter attestation observer is not trusted", "DR5445");
    validateProviderExecutionAttestation(raw.executionAttestation, {
      expectedBinding: { id: invocation.adapter.id, version: invocation.adapter.version, configurationDigest: invocation.configurationDigest },
      expectedObserver: observer,
    });
    if (raw.executionAttestation.capability !== `environment-preparation.${invocation.capability}`) fail("live adapter attestation capability differs from the invocation", "DR5445");
    return raw.executionAttestation.maturity;
  }
  return raw.fixture === true ? "fixture-conformant" : "contract-defined";
}

function validateRawResult(raw, invocation) {
  const keys = ["invocationFingerprint", "status", "nativeEvidence", "diagnostics", "fixture"];
  if (raw?.executionAttestation) keys.push("executionAttestation");
  if (invocation.capability === "inventory") keys.push("observations");
  else keys.push("effectResult");
  if (!exactKeys(raw, keys)) fail("adapter result contains unknown or missing fields");
  if (raw.invocationFingerprint !== invocation.invocationFingerprint) fail("adapter result substitutes invocation identity");
  if (!new Set(["completed", "unavailable", "failed"]).has(raw.status)) fail("adapter result status is invalid");
  if (!Array.isArray(raw.nativeEvidence) || !Array.isArray(raw.diagnostics)) fail("adapter result evidence and diagnostics must be arrays");
  validateNoAuthorityOrSecrets(raw);
}

export function createEnvironmentAdapterCheckpointController({ manifest, hostExecute, checkpoints, trustedObservers = [] } = {}) {
  validateManifest(manifest);
  if (typeof hostExecute !== "function") fail("adapter binding requires a host executor");
  if (!checkpoints || typeof checkpoints.get !== "function" || typeof checkpoints.put !== "function") fail("adapter binding requires immutable checkpoints");
  return Object.freeze({
    async execute(invocation) {
      validateInvocation(invocation, manifest);
      const key = `environment-adapter:${invocation.invocationId}`;
      const existing = await checkpoints.get(key);
      if (existing) {
        if (existing.invocationFingerprint !== invocation.invocationFingerprint) fail("adapter checkpoint fingerprint differs", "DR5446");
        return Object.freeze({ ...structuredClone(existing.result), replayed: true, hostCalls: 0 });
      }
      const raw = await hostExecute(structuredClone(invocation));
      validateRawResult(raw, invocation);
      const maturity = maturityFor(raw, invocation, trustedObservers);
      const receiptBody = {
        apiVersion: API,
        kind: "EnvironmentAdapterReceipt",
        receiptId: `EP-ADAPTER-${invocation.invocationId}`,
        invocationFingerprint: invocation.invocationFingerprint,
        adapter: structuredClone(invocation.adapter),
        capability: invocation.capability,
        status: raw.status,
        maturity,
        nativeEvidence: structuredClone(raw.nativeEvidence),
        diagnostics: structuredClone(raw.diagnostics),
      };
      const receipt = Object.freeze({ ...receiptBody, receiptDigest: canonicalJsonDigest(receiptBody) });
      const result = Object.freeze({ raw: structuredClone(raw), receipt, replayed: false, hostCalls: 1 });
      await checkpoints.put(key, { invocationFingerprint: invocation.invocationFingerprint, result });
      return result;
    },
  });
}

export function assertEnvironmentAdapterMaturity({ receipt, requiredMaturity } = {}) {
  const actual = MATURITY.indexOf(receipt?.maturity);
  const required = MATURITY.indexOf(requiredMaturity);
  if (actual < 0 || required < 0 || actual < required) fail(`adapter maturity ${receipt?.maturity ?? "unknown"} is below ${requiredMaturity}`, "DR5447");
  return receipt;
}
