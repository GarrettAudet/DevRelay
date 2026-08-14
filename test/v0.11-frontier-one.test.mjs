import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { recordExecutionReceipt, verifyExecutionReceipt } from "../src/execution-receipt.mjs";
import { analyzeGodotRepository } from "../src/gdscript-discovery-analyzer.mjs";
import { authorizeProviderInvocation, createProviderAcquisitionPlan, evaluateProviderAvailability, resolveProviderBinding } from "../src/provider-toolchain.mjs";
import { assessRequirementsClosure, createClarificationWave, runAdaptiveRequirementsInterview } from "../src/requirements-interview.mjs";
import { createTraceabilityQueryService } from "../src/traceability-query-service.mjs";

const domains = [
  { id: "scope", weight: 0.5, blocking: true },
  { id: "verification", weight: 0.5, blocking: true },
];

test("adaptive interview uses breadth-first waves and closes only at evidence-backed 0.99 coverage", () => {
  const partial = assessRequirementsClosure({
    domains,
    domainEvidence: [{ domainId: "scope", status: "resolved", confidence: 1, evidenceRefs: ["answer:1"] }],
    contradictions: [{ id: "C-1", status: "open" }],
  });
  assert.equal(partial.outcome, "clarify");
  assert.equal(partial.weightedCoverage, 0.5);
  const wave = createClarificationWave({
    assessment: partial,
    questions: [
      { id: "Q-V-2", domainId: "verification", prompt: "Which negative cases?" },
      { id: "Q-S-1", domainId: "scope", prompt: "Resolve the contradiction", contradictionId: "C-1" },
      { id: "Q-V-1", domainId: "verification", prompt: "What proves success?" },
    ],
  });
  assert.deepEqual(wave.questions.map(({ id }) => id), ["Q-S-1", "Q-V-1", "Q-V-2"]);
  const closed = runAdaptiveRequirementsInterview({
    domains,
    domainEvidence: domains.map(({ id }) => ({ domainId: id, status: "resolved", confidence: 0.995, evidenceRefs: [`answer:${id}`] })),
    contradictions: [],
  });
  assert.equal(closed.outcome, "gate-candidate-ready");
  assert.equal(closed.wave, null);
  assert.throws(() => assessRequirementsClosure({ domains: [{ id: "bad", weight: 0.9 }] }), /sum to exactly 1/u);
});

test("execution receipts preserve exact binary bytes and bind deterministic redacted views", () => {
  const stdout = Buffer.from([0x6f, 0x6b, 0x3a, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74, 0xff]);
  const record = recordExecutionReceipt({
    effect: {
      id: "effect-1",
      command: "provider.exe",
      argv: ["validate"],
      cwd: "tools/provider",
      environmentDigest: `sha256:${"a".repeat(64)}`,
      grants: ["process.spawn"],
    },
    observation: {
      stdout,
      stderr: Buffer.from("warning", "utf8"),
      exitCode: 0,
      durationMilliseconds: 42,
      toolVersion: "1.2.3",
    },
    redactions: [{ source: "stdout", start: 3, end: 9, replacement: "[SECRET]" }],
  });
  assert.equal(verifyExecutionReceipt(record), true);
  assert.equal(Buffer.from(record.rawBundle.stdoutBase64, "base64").equals(stdout), true);
  assert.match(Buffer.from(record.redactedView.stdoutBase64, "base64").toString("utf8"), /\[SECRET\]/u);
  const tampered = structuredClone(record);
  tampered.rawBundle.stdoutBase64 = Buffer.from("changed").toString("base64");
  assert.throws(() => verifyExecutionReceipt(tampered), /do not match/u);
});

test("provider toolchain is project-local, pinned, offline, and fail-closed", () => {
  const manifest = {
    providerId: "openspec",
    version: "2.4.0",
    checksum: `sha256:${"b".repeat(64)}`,
    projectLocalPath: "tools/openspec/2.4.0",
    acquisitionOwner: "host",
    adapterMayDownload: false,
    license: "MIT",
    telemetryMode: "disabled",
    allowedOperations: ["requirements.gather"],
  };
  const policy = { allowedLicenses: ["MIT"], allowedTelemetryModes: ["disabled"] };
  const installation = {
    status: "present",
    version: manifest.version,
    checksum: manifest.checksum,
    projectLocalPath: manifest.projectLocalPath,
  };
  const available = evaluateProviderAvailability({ manifest, installation, policy });
  assert.equal(available.status, "available");
  assert.deepEqual(authorizeProviderInvocation({ assessment: available, manifest, operation: "requirements.gather" }), {
    providerId: "openspec",
    version: "2.4.0",
    operation: "requirements.gather",
    projectLocalPath: "tools/openspec/2.4.0",
    checksum: manifest.checksum,
    networkAllowed: false,
    acquisitionAllowed: false,
  });
  assert.equal(evaluateProviderAvailability({ manifest, installation: { status: "absent" }, policy }).status, "unavailable");
  assert.throws(() => evaluateProviderAvailability({ manifest: { ...manifest, projectLocalPath: "../global" }, installation, policy }), /unsafe/u);
});

test("GDScript analyzer emits exact semantic findings and explicit partial-parse gaps", () => {
  const result = analyzeGodotRepository({
    files: [
      { path: "project.godot", content: 'run/main_scene="res://main.tscn"\nGameState="*res://game_state.gd"\n' },
      { path: "main.gd", content: 'class_name Main\nextends Node2D\nsignal started\nvar cfg = preload("res://cfg.tres")\nfunc _ready():\n  print("ok")\n(' },
      { path: "main.tscn", content: '[node name="Main" type="Node2D"]\nscript = ExtResource("1_main")\n' },
      { path: "ignored.gd", content: "class_name Ignored", ignored: true },
    ],
  });
  assert.deepEqual([...new Set(result.findings.map(({ kind }) => kind))].sort(), ["autoload", "class", "dependency", "entry-point", "inheritance", "main-scene", "scene-node", "scene-script", "signal"]);
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].blocking, false);
  assert.ok(result.findings.every(({ source }) => Number.isInteger(source.line) && source.lineDigest.startsWith("sha256:")));
});

test("trace query service is compact, paginated, deterministic, and read-only", () => {
  const snapshot = JSON.parse(readFileSync(
    new URL("../dogfood/v0.11-module-quality/assignment/promotion/traceability-graph-snapshot.json", import.meta.url),
    "utf8",
  ));
  const startNode = snapshot.nodes.find(({ kind, state }) => kind === "work-item" && state === "active");
  assert.ok(startNode);
  const start = {
    kind: startNode.kind,
    stableId: startNode.stableId,
    authority: startNode.authority,
    scope: startNode.scope,
  };
  const service = createTraceabilityQueryService(snapshot, { defaultLimit: 1 });
  const first = service.provenance({ start });
  assert.equal(first.items.length, 1);
  assert.ok(first.total > 1);
  assert.equal(first.nextCursor, "offset:1");
  const second = service.provenance({ start, cursor: first.nextCursor });
  assert.equal(second.items.length, 1);
  assert.equal(second.graphDigest, first.graphDigest);
  const coverage = service.coverage({ start, limit: 10 });
  assert.equal(coverage.graphDigest, first.graphDigest);
  assert.throws(() => service.impact({ start: { kind: "work-item", stableId: "missing" } }), /start node/u);
});

test("adaptive interview continuation is deterministic and cannot silently close unresolved scope", () => {
  const input = {
    domains,
    domainEvidence: [{ domainId: "scope", status: "resolved", confidence: 1, evidenceRefs: ["answer:scope"] }],
    contradictions: [],
    questions: [
      { id: "Q-V-1", domainId: "verification", prompt: "What proves success?" },
      { id: "Q-V-2", domainId: "verification", prompt: "Which negative cases?" },
    ],
    waveNumber: 2,
  };
  const first = runAdaptiveRequirementsInterview(input);
  const replay = runAdaptiveRequirementsInterview(structuredClone(input));
  assert.deepEqual(replay, first);
  assert.equal(first.outcome, "needs-clarification");
  assert.equal(first.wave.waveNumber, 2);
  assert.deepEqual(first.wave.questions.map(({ id }) => id), ["Q-V-1", "Q-V-2"]);
  assert.equal(runAdaptiveRequirementsInterview({ ...input, questions: [] }).outcome, "unable-to-proceed");
});

test("execution receipts bind structured MCP, retries, failures, timeouts, artifacts, and safety decisions", () => {
  const base = {
    effect: {
      id: "effect-structured",
      command: "provider.exe",
      argv: ["inspect"],
      cwd: "tools/provider",
      environmentDigest: `sha256:${"c".repeat(64)}`,
      grants: ["process.spawn"],
      attemptNumber: 2,
      retryOf: "ER-PREVIOUS",
    },
    observation: {
      stdout: Buffer.from("partial", "utf8"),
      stderr: Buffer.from("timed out", "utf8"),
      structuredMcpBytes: Buffer.from('{"jsonrpc":"2.0","result":{"ok":false}}', "utf8"),
      artifacts: [{ artifactId: "SCREENSHOT-1", digest: `sha256:${"d".repeat(64)}` }],
      exitCode: -1,
      durationMilliseconds: 5000,
      toolVersion: "1.2.3",
      terminalState: "timed-out",
    },
  };
  const first = recordExecutionReceipt(base);
  const replay = recordExecutionReceipt(structuredClone(base));
  assert.deepEqual(replay, first);
  assert.equal(first.receipt.terminalState, "timed-out");
  assert.equal(first.receipt.attemptNumber, 2);
  assert.equal(first.receipt.retryOf, "ER-PREVIOUS");
  assert.equal(first.receipt.artifactCount, 1);
  assert.ok(first.rawBundle.structuredMcpDigest.startsWith("sha256:"));
  assert.equal(verifyExecutionReceipt(first), true);
  assert.throws(() => recordExecutionReceipt({
    ...base,
    observation: { ...base.observation, safetyFindings: [{ disposition: "block", reason: "secret" }] },
  }), /cannot be persisted/u);
  assert.throws(() => recordExecutionReceipt({ effect: base.effect, observation: null }), /observation requires/u);
});

test("provider acquisition requires exact approval and grants, rejects drift, and never silently falls back", () => {
  const manifest = {
    providerId: "openspec",
    version: "2.4.0",
    checksum: `sha256:${"e".repeat(64)}`,
    projectLocalPath: "tools/openspec/2.4.0",
    acquisitionOwner: "host",
    adapterMayDownload: false,
    license: "MIT",
    telemetryMode: "disabled",
    allowedOperations: ["requirements.gather"],
  };
  const policy = { allowedLicenses: ["MIT"], allowedTelemetryModes: ["disabled"] };
  const missing = evaluateProviderAvailability({ manifest, installation: { status: "absent" }, policy });
  assert.throws(() => createProviderAcquisitionPlan({ manifest, assessment: missing }), /exact manifest approval/u);
  const approval = { approvalId: "APR-1", decision: "approve", manifestDigest: missing.manifestDigest, source: "github.com/Fission-AI/OpenSpec" };
  assert.throws(() => createProviderAcquisitionPlan({ manifest, assessment: missing, approval, grants: [] }), /network.connect/u);
  const plan = createProviderAcquisitionPlan({
    manifest,
    assessment: missing,
    approval,
    grants: [{ kind: "network.connect", values: [approval.source] }],
  });
  assert.equal(plan.outcome, "acquisition-authorized");
  assert.equal(plan.adapterMayDownload, false);
  assert.equal(resolveProviderBinding({ assessment: missing, manifest, operation: "requirements.gather" }).outcome, "unavailable");
  assert.equal(resolveProviderBinding({ assessment: missing, manifest, operation: "requirements.gather", fallback: { mode: "native", authorized: true, operation: "requirements.gather", rationale: "owner policy" } }).outcome, "native-fallback");
  const mismatch = evaluateProviderAvailability({ manifest, installation: { status: "present", version: "2.5.0", checksum: `sha256:${"f".repeat(64)}`, projectLocalPath: manifest.projectLocalPath }, policy });
  assert.deepEqual(mismatch.diagnostics.map(({ code }) => code), ["PROVIDER_CHECKSUM_MISMATCH", "PROVIDER_VERSION_MISMATCH"]);
  assert.throws(() => evaluateProviderAvailability({ manifest: { ...manifest, version: "latest" }, installation: null, policy }), /exact and non-floating/u);
});

test("GDScript discovery covers resources, ignore policy, deterministic ordering, and normalized line evidence", () => {
  const files = [
    { path: "z.gd", content: '@export var texture\r\nfunc _process(delta):\r\n  pass\r\n' },
    { path: "ignored.gd", content: "class_name Ignored" },
    { path: "untracked.gd", content: "class_name Untracked", tracked: false },
  ];
  const first = analyzeGodotRepository({ files, ignorePaths: ["ignored.gd"] });
  const replay = analyzeGodotRepository({ files: structuredClone(files), ignorePaths: ["ignored.gd"] });
  assert.deepEqual(replay, first);
  assert.deepEqual(first.findings.map(({ kind }) => kind), ["resource", "entry-point"]);
  assert.ok(first.findings.every(({ source }) => source.path === "z.gd"));
});

test("trace queries preserve graph bytes across why, impact, coverage, provenance, and orphan diagnostics", () => {
  const snapshot = JSON.parse(readFileSync(
    new URL("../dogfood/v0.11-module-quality/assignment/promotion/traceability-graph-snapshot.json", import.meta.url),
    "utf8",
  ));
  const before = canonicalJsonDigest(snapshot);
  const node = snapshot.nodes.find(({ kind, state }) => kind === "work-item" && state === "active");
  const start = { kind: node.kind, stableId: node.stableId, authority: node.authority, scope: node.scope };
  const service = createTraceabilityQueryService(snapshot, { defaultLimit: 3 });
  for (const result of [service.why({ start }), service.impact({ start }), service.coverage({ start }), service.provenance({ start }), service.diagnostics({})]) {
    assert.equal(result.graphDigest, before);
    assert.ok(result.items.length <= 3);
  }
  assert.equal(canonicalJsonDigest(snapshot), before);
  assert.throws(() => service.provenance({ start, cursor: "bad" }), /cursor/u);
});