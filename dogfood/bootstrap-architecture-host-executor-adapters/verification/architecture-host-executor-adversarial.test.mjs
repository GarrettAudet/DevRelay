import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createOpenSpecDesignHostExecutorAdapter } from "file:///C:/Users/garre/AppData/Local/Temp/devrelay-dg1-reverify-982e/src/architecture-host-executor-adapters.mjs";
import { sha256Digest } from "file:///C:/Users/garre/AppData/Local/Temp/devrelay-dg1-reverify-982e/src/content-digest.mjs";

const artifact = JSON.parse(await readFile(
  "C:/Users/garre/AppData/Local/Temp/devrelay-dg1-reverify-982e/examples/artifacts/architecture-designer-working-001.json",
  "utf8",
));

function invocation() {
  const config = {
    projectRoot: "C:/repos/DevRelay",
    toolVersion: "1.0",
    changeName: "adversarial-live-claim",
    schema: "devrelay-architecture",
    artifact: "design.md",
    bridge: "agent-command",
    toolName: "OpenSpec",
  };
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleStepInvocation",
    invocationId: "verifier-false-live-claim",
    invocationFingerprint: `sha256:${"1".repeat(64)}`,
    chainFingerprint: `sha256:${"2".repeat(64)}`,
    stepInvocationDigest: `sha256:${"3".repeat(64)}`,
    module: { id: "architecture-design", version: "0.1.0", operation: "design-change" },
    step: "designer",
    plugin: { id: "openspec-design", version: "0.1.0" },
    inputs: {},
    priorResults: [],
    config,
    grants: [
      { kind: "filesystem.read", scope: config.projectRoot },
      { kind: "filesystem.write", scope: `${config.projectRoot}/openspec/changes` },
      { kind: "network.connect", scope: "host:implementation-engine" },
    ],
  };
}

test("static executor cannot self-attest live CLI conformance", async () => {
  let executorCalls = 0;
  let processOrCliCalls = 0;
  const adapter = createOpenSpecDesignHostExecutorAdapter({
    executeCapability: async (request) => {
      executorCalls += 1;
      return {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "ArchitectureHostCapabilityResponse",
        binding: request.binding,
        artifact,
        nativeArtifacts: [{
          artifactId: "false-live-native",
          schema: "https://devrelay.dev/native/openspec-design/v1",
          mediaType: "text/markdown",
          role: "technical-design-source",
          path: "design.md",
          content: "static fixture only\n",
          provenance: { source: "verifier-static-fixture" },
        }],
        executionIdentity: {
          executor: { id: "static-function", version: "1" },
          tool: { name: "OpenSpec", version: "fabricated" },
          environment: { id: "node", version: process.version },
        },
        conformance: {
          maturity: "live-conformant",
          validator: "self-attested-only",
          realCliExecuted: true,
        },
      };
    },
    loadArtifact: async () => { throw new Error("no declared inputs expected"); },
    persistArtifact: async (record) => ({
      artifactId: record.artifactId,
      schema: record.schema,
      mediaType: record.mediaType,
      digest: sha256Digest(record.bytes),
    }),
  });

  const value = invocation();
  await assert.rejects(
    adapter.invoke(value, undefined, {
      invocationId: value.invocationId,
      plugin: value.plugin,
      stepInvocationDigest: value.stepInvocationDigest,
    }),
    /live|conformance|CLI/i,
  );
  assert.equal(executorCalls, 1);
  assert.equal(processOrCliCalls, 0);
});
