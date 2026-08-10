import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { createJsonSchemaContractBundle } from "../src/contract-format-registry.mjs";
import {
  ContractGenerationHostExecutorAdapterError,
  createJsonSchemaContractHostGenerator,
} from "../src/contract-generation-host-executor-adapter.mjs";

const binding = Object.freeze({
  module: { id: "contract-generation", version: "0.1.0", operation: "generate-contract-change" },
  step: "generate",
  plugin: { id: "json-schema-contract-generator", version: "0.1.0" },
  config: { contractKind: "json-schema" },
  grants: [],
});

function artifact(value, role) {
  const bytes = Buffer.from(canonicalJson(value));
  return {
    role,
    bytes,
    ref: { artifactId: `${role}-001`, schema: `https://devrelay.dev/test/${role}/v1`, mediaType: "application/json", digest: sha256Digest(bytes), uri: `memory://test/${role}` },
  };
}

function fixture() {
  const inputs = [
    artifact({ kind: "ArchitectureBaseline" }, "architecture-baseline"),
    artifact({ kind: "ContractBaseline" }, "current-contract-baseline"),
    artifact({ kind: "ProjectContractState" }, "project-contract-state"),
    artifact({ kind: "ProjectOverviewBaseline" }, "project-overview-baseline"),
  ];
  const request = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractGeneratorRequest",
    requestId: "CGR-HOST-TEST-001",
    operation: "generate-contract-change",
    contractKind: "json-schema",
    interfaceIntents: [{ id: "IF-HOST-TEST", name: "Host test", purpose: "Prove bounded execution", semanticInputs: ["request"], semanticOutputs: ["response"], sourceRequirementIds: ["REQ-HOST-TEST"] }],
    inputBindings: inputs.map(({ role, ref }) => ({ role, artifact: ref })),
    currentContractBaseline: inputs[1].ref,
  };
  const bytes = new Map(inputs.map(({ ref, bytes: value }) => [ref.artifactId, value]));
  return { request, bytes };
}

function response(request, mutate = (value) => value) {
  const bundle = createJsonSchemaContractBundle(request, { id: "json-schema-contract-generator", version: "0.1.0" });
  const value = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractGenerationHostCapabilityResponse",
    binding: { capability: "contract-generation.json-schema/v1", ...binding },
    requestId: request.requestId,
    bundle,
    nativeEvidence: bundle.entries.map((entry) => ({ contractId: entry.id, contentDigest: sha256Digest(Buffer.from(entry.bytesBase64, "base64")), schema: entry.schema, mediaType: entry.mediaType, sourceProvenance: { requestId: request.requestId, interfaceIntentId: entry.interfaceIntentId } })),
    executionIdentity: { executor: { id: "fixture-host", version: "1" }, tool: { id: "bounded-json-schema", version: "1" }, model: { id: "fixture", version: "1" }, prompt: { digest: canonicalJsonDigest(request) }, environment: { id: "node", version: process.version } },
    conformance: { maturity: "fixture-conformant", validator: "Core JSON Schema 2020-12", liveProviderExecuted: false },
    diagnostics: [],
  };
  return mutate(value);
}

function generator({ mutate, calls = { value: 0 }, evidence = [] } = {}) {
  const { bytes } = fixture();
  return {
    calls,
    evidence,
    value: createJsonSchemaContractHostGenerator({
      binding,
      loadArtifact: async (ref) => bytes.get(ref.artifactId),
      executeCapability: async (request) => { calls.value += 1; return response(request.request, mutate); },
      persistEvidence: async (value) => { evidence.push(value); return { digest: canonicalJsonDigest(value) }; },
    }),
  };
}

test("bounded JSON Schema host generator invokes once and preserves exact evidence before normalization", async () => {
  const { request } = fixture();
  const host = generator();
  const bundle = await host.value.generate(request);
  assert.equal(host.calls.value, 1);
  assert.equal(host.evidence.length, 1);
  assert.equal(bundle.entries.length, 1);
  assert.equal(bundle.entries[0].interfaceIntentId, "IF-HOST-TEST");
  assert.equal(host.evidence[0].executionIdentity.executor.id, "fixture-host");
  assert.equal("approval" in host.evidence[0], false);
});

for (const [name, mutate, pattern] of [
  ["provider substitution", (value) => ({ ...value, requestId: "CGR-SUBSTITUTED" }), /substituted/],
  ["hidden authority", (value) => ({ ...value, gate: { decision: "approve" } }), /malformed|authority/],
  ["missing native evidence", (value) => ({ ...value, nativeEvidence: [] }), /native evidence/],
  ["provider-authored live conformance", (value) => ({ ...value, conformance: { ...value.conformance, liveProviderExecuted: true } }), /live conformance/],
  ["wrong protocol", (value) => ({ ...value, bundle: { ...value.bundle, entries: value.bundle.entries.map((entry) => ({ ...entry, contractKind: "openapi" })) } }), /invalid|contractKind|bundle/],
]) test(`fails closed on ${name}`, async () => {
  const { request } = fixture();
  const host = generator({ mutate });
  await assert.rejects(host.value.generate(request), ContractGenerationHostExecutorAdapterError);
  assert.equal(host.evidence.length, 0);
});

test("binding, operation, grants, and content-addressed inputs fail before host execution", async () => {
  assert.throws(() => createJsonSchemaContractHostGenerator({ binding: { ...binding, grants: [{ kind: "network.connect", scope: "*" }] }, executeCapability() {}, loadArtifact() {}, persistEvidence() {} }), /grants no host authority/);
  const { request } = fixture();
  const host = generator();
  await assert.rejects(host.value.generate({ ...request, operation: "establish-contracts" }), /routed operation/);
  assert.equal(host.calls.value, 0);
});

test("digest drift and stale current-baseline lineage fail before host execution", async () => {
  const { request } = fixture();
  const drifted = structuredClone(request);
  drifted.inputBindings[0].artifact.digest = `sha256:${"0".repeat(64)}`;
  const driftHost = generator();
  await assert.rejects(driftHost.value.generate(drifted), /bytes do not match/);
  assert.equal(driftHost.calls.value, 0);

  const stale = structuredClone(request);
  stale.currentContractBaseline = { ...stale.currentContractBaseline, artifactId: "stale-baseline" };
  const staleHost = generator();
  await assert.rejects(staleHost.value.generate(stale), /stale or substituted/);
  assert.equal(staleHost.calls.value, 0);
});
