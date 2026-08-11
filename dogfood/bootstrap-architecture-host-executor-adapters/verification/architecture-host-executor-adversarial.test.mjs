import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const adapterPath = path.join(
  repositoryRoot,
  "src/architecture-host-executor-adapters.mjs",
);
const artifactPath = path.join(
  repositoryRoot,
  "examples/artifacts/architecture-designer-working-001.json",
);
const sha256Digest = (bytes) =>
  `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;

const adapterBytes = await readFile(adapterPath);
assert.equal(
  sha256Digest(adapterBytes),
  "sha256:4d4ec08d51c509dc4239aad2bd5baf20b48ad07cedd0ef98a358b0cdb6f7c972",
  "committed adapter bytes must match the independently verified historical source",
);
const artifactBytes = await readFile(artifactPath);
assert.equal(
  sha256Digest(artifactBytes),
  "sha256:961377f17296ea98863ae7b53792fdfa09a3a39b315979fb83e7046000ccdb25",
  "committed fixture bytes must match the released artifact digest",
);
const { createOpenSpecDesignHostExecutorAdapter } = await import(
  pathToFileURL(adapterPath),
);
const artifact = JSON.parse(artifactBytes);

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
