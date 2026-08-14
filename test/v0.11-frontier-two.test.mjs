import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import {
  createEvidenceSealRecord,
  createImplementationSeal,
  verifyTwoPhaseEvidenceSeal,
} from "../src/two-phase-evidence-seal.mjs";
import {
  recordLocalPerformanceMetrics,
  verifyLocalPerformanceMetrics,
} from "../src/local-performance-metrics.mjs";
import {
  createRequirementsStrategyRegistry,
  runRequirementsStrategyChain,
} from "../src/requirements-strategies.mjs";
import { evaluateProviderAvailability } from "../src/provider-toolchain.mjs";
import { createProviderExecutionAttestation } from "../src/provider-execution-attestation.mjs";
import { createOpenSpecLiveAdapter, createStructurizrLiveAdapter } from "../src/live-provider-adapters.mjs";
import { createGdUnit4VerificationAdapter, createGodotMcpAdapter } from "../src/godot-provider-adapters.mjs";

const digest = (seed) => sha256Digest(Buffer.from(seed));
const commit = (seed) => seed.repeat(40).slice(0, 40);
const ref = (artifactId, seed = artifactId) => ({ artifactId, digest: digest(seed) });

test("two-phase evidence sealing binds distinct direct-parent commits and exact evidence", () => {
  const implementationSeal = createImplementationSeal({
    repositoryId: "github.com/GarrettAudet/DevRelay",
    targetRef: "refs/heads/codex/v0.11-integration",
    parentCommit: commit("a"),
    implementationCommit: commit("b"),
    treeDigest: digest("implementation-tree"),
    worktreeClean: true,
    verifiedChangeSet: ref("VCS-1"),
    integrationRecord: ref("CIR-1"),
  });
  const evidenceSeal = createEvidenceSealRecord({
    implementationSeal,
    parentCommit: commit("b"),
    evidenceCommit: commit("c"),
    worktreeClean: true,
    evidence: [ref("Z-EVIDENCE"), ref("A-EVIDENCE")],
  });
  assert.equal(evidenceSeal.evidence[0].artifactId, "A-EVIDENCE");
  assert.equal(verifyTwoPhaseEvidenceSeal({
    implementationSeal,
    evidenceSeal,
    observation: {
      targetRef: evidenceSeal.targetRef,
      targetCommit: commit("c"),
      evidenceParentCommit: commit("b"),
      implementationParentCommit: commit("a"),
      implementationTreeDigest: digest("implementation-tree"),
      evidenceManifestDigest: evidenceSeal.evidenceManifestDigest,
      worktreeClean: true,
    },
  }), true);
  assert.throws(() => createEvidenceSealRecord({ implementationSeal, parentCommit: commit("d"), evidenceCommit: commit("e"), worktreeClean: true, evidence: [ref("E")] }), /directly follow/);
  assert.throws(() => verifyTwoPhaseEvidenceSeal({ implementationSeal, evidenceSeal, observation: { targetRef: evidenceSeal.targetRef, targetCommit: commit("c"), evidenceParentCommit: commit("b"), implementationParentCommit: commit("a"), implementationTreeDigest: digest("tampered"), evidenceManifestDigest: evidenceSeal.evidenceManifestDigest, worktreeClean: true } }), /bytes drifted/);
});

test("local metrics never invent unavailable values or acquire workflow authority", () => {
  const input = {
    executionId: "EXEC-MQ-2",
    selfOverheadMilliseconds: 2,
    observations: [
      { metric: "cycleDurationMilliseconds", disposition: "measured", value: 80, provenance: ["ER-1"] },
      { metric: "retries", disposition: "measured", value: 1, provenance: ["ER-1"] },
      { metric: "tokenUsage", disposition: "unavailable", reason: "host-did-not-expose" },
    ],
  };
  const first = recordLocalPerformanceMetrics(input);
  const second = recordLocalPerformanceMetrics(input);
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(verifyLocalPerformanceMetrics(first), true);
  assert.equal(first.metrics.find(({ metric }) => metric === "toolCalls").disposition, "unavailable");
  assert.throws(() => recordLocalPerformanceMetrics({ ...input, exportPolicy: "network" }), /local-only/);
  assert.throws(() => recordLocalPerformanceMetrics({ ...input, observations: [{ metric: "tokenUsage", disposition: "unavailable", value: 10, reason: "unknown" }] }), /cannot invent/);
});

test("requirements strategies compose deterministically while Core retains closure authority", async () => {
  const registry = createRequirementsStrategyRegistry();
  const input = {
    registry,
    strategyOrder: ["bmad", "gsd", "superpowers", "openspec", "spec-kit"],
    domains: [{ id: "objectives" }, { id: "security" }],
    priorAnswers: [],
    coverageState: { outcome: "clarify" },
    invocationId: "RG-MQ-2",
  };
  const first = await runRequirementsStrategyChain(input);
  const second = await runRequirementsStrategyChain(input);
  assert.equal(first.resultDigest, second.resultDigest);
  assert.equal(first.contributions.length, 5);
  assert.equal(first.questions.length, 10);
  assert.equal(first.closureAuthority, "core-only");
  assert.equal(registry.strategies.openspec.maturity, "contract-defined");
});

test("requirements strategy live bindings require verified attestations and cannot return Gate authority", async () => {
  const live = async (request) => ({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RequirementsStrategyContribution",
    strategy: request.strategy,
    questions: [{ id: "LIVE-Q-1", domainId: "scope", prompt: "What is excluded?" }],
    assumptions: [],
    nativeArtifacts: [ref("OPEN-SPEC")],
    sourceRequestDigest: canonicalJsonDigest(request),
  });
  const unattestedRegistry = createRequirementsStrategyRegistry({ liveAdapters: { openspec: live } });
  assert.equal(unattestedRegistry.strategies.openspec.maturity, "contract-defined");
  const attestation = createProviderExecutionAttestation({
    attestationId: "PEA-OPEN-SPEC-LIVE",
    binding: { id: "openspec", version: "1.9.0", configurationDigest: digest("openspec-binding") },
    capability: "openspec.requirements.gather/v1",
    request: ref("REQ-ATTESTED"),
    tool: { name: "openspec", version: "1.9.0" },
    command: { executable: "openspec", arguments: ["validate", "--all", "--strict"], workingDirectoryDigest: digest("cwd") },
    execution: { startedAt: "2026-08-14T12:00:00.000Z", completedAt: "2026-08-14T12:00:00.010Z", exitCode: 0, stdoutDigest: digest("stdout"), stderrDigest: digest("stderr") },
    nativeArtifacts: [ref("OPEN-SPEC")],
    observer: { id: "desktop-host", version: "1.0.0", configurationDigest: digest("host"), authority: "host-trusted-observer" },
    maturity: "live-conformant",
  });
  const registry = createRequirementsStrategyRegistry({ liveAdapters: { openspec: live }, attestations: { openspec: attestation } });
  const result = await runRequirementsStrategyChain({ registry, strategyOrder: ["openspec"], domains: [{ id: "scope" }], coverageState: { outcome: "clarify" }, invocationId: "RG-LIVE" }, { liveAdapters: { openspec: live } });
  assert.equal(registry.strategies.openspec.maturity, "live-conformant");
  assert.equal(registry.strategies.openspec.executionAttestation.attestationDigest, attestation.attestationDigest);
  assert.equal(result.questions[0].id, "LIVE-Q-1");
  const bad = async (request) => ({ apiVersion: "devrelay.dev/v1alpha1", kind: "RequirementsStrategyContribution", strategy: request.strategy, questions: [], assumptions: [], nativeArtifacts: [], sourceRequestDigest: canonicalJsonDigest(request), gate: "approved" });
  const badRegistry = createRequirementsStrategyRegistry({ liveAdapters: { openspec: bad } });
  await assert.rejects(runRequirementsStrategyChain({ registry: badRegistry, strategyOrder: ["openspec"], domains: [{ id: "scope" }], coverageState: {}, invocationId: "RG-BAD" }, { liveAdapters: { openspec: bad } }), /forbidden authority/);
  assert.throws(() => createRequirementsStrategyRegistry({ liveAdapters: { openspec: live }, attestations: { openspec: { ...attestation, attestationDigest: digest("tampered") } } }), /attestation is invalid/);
});

test("live provider adapter requires a pinned available tool and emits host attestation plus receipt", async () => {
  const manifest = {
    providerId: "openspec",
    version: "1.2.3",
    checksum: digest("openspec-install"),
    projectLocalPath: ".devrelay/tools/openspec/1.2.3",
    acquisitionOwner: "host",
    adapterMayDownload: false,
    allowedOperations: ["requirements.validate"],
    license: "MIT",
    telemetryMode: "disabled",
  };
  const installation = { status: "present", version: manifest.version, checksum: manifest.checksum, projectLocalPath: manifest.projectLocalPath };
  const assessment = evaluateProviderAvailability({ manifest, installation, policy: { allowedLicenses: ["MIT"], allowedTelemetryModes: ["disabled"] } });
  const native = ref("OPENSPEC-STRICT-VALIDATION");
  const hostExecute = async () => ({
    exitCode: 0,
    durationMilliseconds: 14,
    toolVersion: manifest.version,
    stdout: Buffer.from("valid\n"),
    stderr: Buffer.alloc(0),
    artifacts: [native],
    startedAt: "2026-08-14T12:00:00.000Z",
    completedAt: "2026-08-14T12:00:00.014Z",
  });
  const adapter = createOpenSpecLiveAdapter({
    manifest,
    assessment,
    hostExecute,
    hostObserver: { id: "desktop-host", version: "1.0.0", configurationDigest: digest("host"), authority: "host-trusted-observer" },
    normalizeNative: async ({ nativeArtifacts }) => ({ kind: "RequirementsProviderObservation", nativeArtifacts }),
  });
  const request = { ...ref("REQ-LIVE"), projectRoot: "C:/fixture", environmentDigest: digest("env"), workingDirectoryDigest: digest("cwd") };
  const result = await adapter.invoke({ operation: "requirements.validate", request, grants: ["process.spawn"] });
  assert.equal(result.attestation.maturity, "live-conformant");
  assert.equal(result.receipt.exitCode, 0);
  assert.equal(result.authority, "proposer-only");
  await assert.rejects(adapter.invoke({ operation: "requirements.validate", request, grants: [] }), /process.spawn/);
});


test("Structurizr inspection treats warnings as evidence and fails only on errors", async () => {
  const manifest = {
    providerId: "structurizr",
    version: "2026.06.28",
    checksum: digest("structurizr-install"),
    projectLocalPath: ".devrelay/tools/structurizr/2026.06.28",
    acquisitionOwner: "host",
    adapterMayDownload: false,
    allowedOperations: ["architecture.inspect"],
    license: "Apache-2.0",
    telemetryMode: "none",
  };
  const installation = { status: "present", version: manifest.version, checksum: manifest.checksum, projectLocalPath: manifest.projectLocalPath };
  const assessment = evaluateProviderAvailability({ manifest, installation, policy: { allowedLicenses: ["Apache-2.0"], allowedTelemetryModes: ["none"] } });
  let observedCommand;
  const native = ref("STRUCTURIZR-WORKSPACE");
  const adapter = createStructurizrLiveAdapter({
    manifest,
    assessment,
    hostExecute: async ({ command }) => {
      observedCommand = command;
      return {
        exitCode: 0,
        durationMilliseconds: 11,
        toolVersion: manifest.version,
        stdout: Buffer.from("WARNING | model.element.disconnected\n"),
        stderr: Buffer.alloc(0),
        artifacts: [native],
        startedAt: "2026-08-14T12:00:00.000Z",
        completedAt: "2026-08-14T12:00:00.011Z",
      };
    },
    hostObserver: { id: "desktop-host", version: "1.0.0", configurationDigest: digest("host"), authority: "host-trusted-observer" },
    normalizeNative: async ({ nativeArtifacts }) => ({ kind: "ArchitectureProviderObservation", nativeArtifacts }),
  });
  const request = { ...ref("ARCH-LIVE"), projectRoot: "C:/fixture", workspacePath: "workspace.dsl", environmentDigest: digest("env"), workingDirectoryDigest: digest("cwd") };
  const result = await adapter.invoke({ operation: "architecture.inspect", request, grants: ["process.spawn"] });
  assert.deepEqual(observedCommand.arguments, ["inspect", "-workspace", "workspace.dsl", "-s", "error"]);
  assert.equal(result.attestation.maturity, "live-conformant");
});

test("Godot MCP adapter enforces granular grants and exact screenshot receipts", async () => {
  const image = { ...ref("SHOT-1"), mediaType: "image/png" };
  const adapter = createGodotMcpAdapter({ hostCall: async () => ({
    exitCode: 0,
    durationMilliseconds: 9,
    toolVersion: "2.1.0",
    stdout: Buffer.from("ok"),
    stderr: Buffer.alloc(0),
    structuredMcpBytes: Buffer.from('{"result":"ok"}'),
    artifacts: [image],
  }) });
  const request = { operation: "screenshot", godotVersion: "4.6.3", providerVersion: "2.1.0", projectPath: "fixtures/godot", targetPath: "scenes/main.tscn", environmentDigest: digest("godot-env"), grants: ["godot.screenshot"] };
  const result = await adapter.invoke(request);
  assert.equal(result.nativeArtifacts[0].artifactId, "SHOT-1");
  assert.equal(result.receipt.terminalState, "succeeded");
  await assert.rejects(adapter.invoke({ ...request, grants: ["godot.inspect"] }), /missing explicit godot.screenshot/);
  await assert.rejects(adapter.invoke({ ...request, targetPath: "../outside.tscn" }), /unsafe segments/);
});

test("GdUnit4 adapter captures every structured verification stage and rejects incompatible versions", async () => {
  const stages = ["focused", "full", "scene", "fuzz", "flake", "soak", "junit", "export", "smoke"];
  const adapter = createGdUnit4VerificationAdapter({ hostExecute: async ({ stage }) => ({
    exitCode: 0,
    durationMilliseconds: 5,
    toolVersion: "6.2.0",
    stdout: Buffer.from(`${stage}: pass\n`),
    stderr: Buffer.alloc(0),
    artifacts: stage === "junit" ? [{ ...ref("JUNIT"), mediaType: "application/junit+xml" }] : [ref(`ART-${stage}`)],
  }) });
  const result = await adapter.invoke({ requestId: "GDU-REQ-1", projectPath: "fixtures/godot", godotVersion: "4.6.3", gdunitVersion: "6.2.0", environmentDigest: digest("gdunit-env"), stages, subject: ref("GODOT-SUBJECT") });
  assert.equal(result.outcome, "verified");
  assert.equal(result.results.length, 9);
  assert.deepEqual(result.results.map(({ stage }) => stage), [...stages].sort());
  await assert.rejects(adapter.invoke({ requestId: "GDU-OLD", projectPath: "fixtures/godot", godotVersion: "4.4.1", gdunitVersion: "6.2.0", environmentDigest: digest("old"), stages: ["focused"], subject: ref("OLD") }), /incompatible/);
});

test("new second-frontier APIs are exported by the package surface", async () => {
  const api = await import("../src/index.mjs");
  for (const name of [
    "createImplementationSeal",
    "recordLocalPerformanceMetrics",
    "createRequirementsStrategyRegistry",
    "createOpenSpecLiveAdapter",
    "createGodotMcpAdapter",
    "createGdUnit4VerificationAdapter",
  ]) assert.equal(typeof api[name], "function", `${name} must be exported`);
});
