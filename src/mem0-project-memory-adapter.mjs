import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateProviderExecutionAttestation } from "./provider-execution-attestation.mjs";

export class Mem0ProjectMemoryAdapterError extends Error {
  constructor(message, code = "DR5340") {
    super(`Mem0 project memory adapter failed: ${message}`);
    this.name = "Mem0ProjectMemoryAdapterError";
    this.code = code;
  }
}
const fail = (message, code) => { throw new Mem0ProjectMemoryAdapterError(message, code); };
const immutable = (value) => Object.freeze(structuredClone(value));

export function createMem0ProjectMemoryAdapter({ hostExecute, attestation, trustedObserver, configuration = {} } = {}) {
  if (typeof hostExecute !== "function") fail("hostExecute is required");
  if (attestation?.providerId !== "mem0" || attestation?.available !== true || typeof attestation.version !== "string") fail("a pinned available Mem0 attestation is required", "DR5341");
  if (!trustedObserver) fail("a trusted host observer is required", "DR5341");
  if (configuration.allowNetwork === true || configuration.allowSourceTransmission === true) fail("network and source transmission are denied by the V1 local policy", "DR5342");
  const configurationDigest = canonicalJsonDigest({
    providerId: "mem0",
    version: attestation.version,
    executableDigest: attestation.executableDigest,
    allowNetwork: false,
    allowSourceTransmission: false,
    store: configuration.store ?? "local",
  });
  async function invoke(operation, request) {
    const requestMaterial = { provider: "mem0", providerVersion: attestation.version, operation, namespace: request.namespace, query: request.query ?? null, records: request.records ?? [], configurationDigest, grants: ["process.spawn"], network: "denied" };
    const requestDigest = canonicalJsonDigest(requestMaterial);
    const requestRef = { artifactId: `MEM0-REQUEST-${requestDigest.slice(7, 23).toUpperCase()}`, digest: requestDigest };
    const command = immutable({ ...requestMaterial, requestRef });
    const observed = await hostExecute(command);
    if (!observed || observed.exitCode !== 0 || observed.networkUsed === true || observed.providerVersion !== attestation.version) fail("host observation failed pinned local conformance", "DR5343");
    validateProviderExecutionAttestation(observed.attestation, { expectedBinding: { id: "mem0", version: attestation.version, configurationDigest }, expectedObserver: trustedObserver, expectedRequest: requestRef });
    if (observed.attestation.tool.name !== "mem0" || observed.attestation.tool.version !== attestation.version || observed.attestation.capability !== `project-memory.${operation}`) fail("host attestation does not bind the requested Mem0 capability", "DR5343");
    const rawBytes = Buffer.from(observed.rawBytes ?? JSON.stringify(observed), "utf8");
    return immutable({
      items: structuredClone(observed.items ?? []),
      citations: structuredClone(observed.citations ?? []),
      nativeReceipt: {
        providerId: "mem0",
        providerVersion: attestation.version,
        operation,
        commandFingerprint: canonicalJsonDigest(command),
        rawDigest: sha256Digest(rawBytes),
        exitCode: observed.exitCode,
        durationMs: observed.durationMs ?? 0,
        networkUsed: false,
        attestationDigest: observed.attestation.attestationDigest,
      },
    });
  }
  return Object.freeze({
    id: "mem0",
    version: attestation.version,
    configurationDigest,
    maturity: "attestation-required",
    retrieve: (request) => invoke("search", request),
    proposeIndex: (request) => invoke("add", request),
    proposeUpdate: (request) => invoke("update", request),
    proposeDelete: (request) => invoke("delete", request),
  });
}
