import assert from "node:assert/strict";
import test from "node:test";
import { createMem0ProjectMemoryAdapter } from "../src/mem0-project-memory-adapter.mjs";
import { createProviderExecutionAttestation } from "../src/provider-execution-attestation.mjs";

const D = `sha256:${"c".repeat(64)}`;
const attestation = { providerId: "mem0", version: "1.1.0", available: true, executableDigest: D };
const trustedObserver = { id: "desktop.windows", version: "1.0.0", configurationDigest: D, authority: "host-trusted-observer" };
const sourceRef = { role: "memory", artifact: { artifactId: "PMB", schema: "https://devrelay.dev/a", mediaType: "application/json", digest: D, uri: "devrelay://pm/P" } };
const makeObserved = (command, overrides = {}) => ({ exitCode: 0, providerVersion: "1.1.0", networkUsed: false, durationMs: 2, items: [{ memoryId: "M-1", statement: "Approved", effectiveAt: "2026-08-20T00:00:00Z", sourceRefs: [sourceRef] }], citations: [{ rank: 1, sourceRef, score: 1 }], attestation: createProviderExecutionAttestation({ attestationId: `PEA-${command.operation}`, binding: { id: "mem0", version: "1.1.0", configurationDigest: command.configurationDigest }, capability: `project-memory.${command.operation}`, request: command.requestRef, tool: { name: "mem0", version: "1.1.0" }, command: { executable: "mem0", arguments: [command.operation], workingDirectoryDigest: D }, execution: { startedAt: "2026-08-20T00:00:00Z", completedAt: "2026-08-20T00:00:01Z", exitCode: 0, stdoutDigest: D, stderrDigest: D }, nativeArtifacts: [{ artifactId: `NATIVE-${command.operation}`, digest: D }], observer: trustedObserver }), ...overrides });

test("Mem0 adapter is pinned, local-only, and returns cited derived retrieval", async () => {
  let command;
  const adapter = createMem0ProjectMemoryAdapter({ attestation, trustedObserver, hostExecute: async (value) => { command = value; return makeObserved(value); } });
  const result = await adapter.retrieve({ namespace: "project/devrelay", query: "approved" });
  assert.equal(adapter.maturity, "attestation-required");
  assert.equal(command.network, "denied");
  assert.equal(result.items[0].memoryId, "M-1");
  assert.equal(result.nativeReceipt.networkUsed, false);
  assert.equal(result.nativeReceipt.attestationDigest, result.nativeReceipt.attestationDigest);
});

test("Mem0 operations remain proposals and expose no baseline or graph mutation port", async () => {
  const operations = [];
  const adapter = createMem0ProjectMemoryAdapter({ attestation, trustedObserver, hostExecute: async (command) => { operations.push(command.operation); return makeObserved(command, { items: [], citations: [] }); } });
  await adapter.proposeIndex({ namespace: "project/p", records: [] });
  await adapter.proposeUpdate({ namespace: "project/p", records: [] });
  await adapter.proposeDelete({ namespace: "project/p", records: [] });
  assert.deepEqual(operations, ["add", "update", "delete"]);
  assert.equal(adapter.commitBaseline, undefined);
  assert.equal(adapter.mergeGraph, undefined);
});

test("Mem0 fails closed on missing attestation, provider substitution, network use, and command failure", async () => {
  assert.throws(() => createMem0ProjectMemoryAdapter({ hostExecute() {} }), /attestation/u);
  assert.throws(() => createMem0ProjectMemoryAdapter({ attestation, trustedObserver, configuration: { allowNetwork: true }, hostExecute() {} }), /denied/u);
  for (const mutate of [(value) => ({ ...value, providerVersion: "2.0.0" }), (value) => ({ ...value, networkUsed: true }), (value) => ({ ...value, exitCode: 1 })]) {
    const adapter = createMem0ProjectMemoryAdapter({ attestation, trustedObserver, hostExecute: async (command) => mutate(makeObserved(command)) });
    await assert.rejects(() => adapter.retrieve({ namespace: "project/p" }), /conformance/u);
  }
});
