import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { materializeNativeDiscoveryHostFixture } from "./fixtures/desktop-native-discovery-host.mjs";
import { openDesktopLocalHost } from "../src/desktop-local-host.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createLocalHostCheckpointStore } from "../src/local-host-checkpoints.mjs";
import { materializeDesktopHostFixture } from "./fixtures/desktop-local-host.mjs";
import { materializeRequirementsChangeHostFixture } from "./fixtures/desktop-requirements-change-host.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "devrelay-connected-host-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, ...materializeDesktopHostFixture(root) };
}
const output = (result) => result.result?.outputs ?? result.result;
async function command(fx, operation, input = fx.input) {
  const host = await openDesktopLocalHost({ ...fx, command: operation, platform: "win32" });
  try { return await host.cli.execute({ command: operation, input, format: "json" }); }
  finally { host.close(); }
}

async function executableCommand(fx, operation, input = fx.input) {
  if (process.platform !== "win32") return command(fx, operation, input);
  const child = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/devrelay.mjs", import.meta.url)), operation,
    "--json", "--host", fx.configurationPath, "--host-digest", fx.configurationDigest, "--input", JSON.stringify(input)],
  { encoding: "utf8", windowsHide: true, timeout: 60_000 });
  assert.ifError(child.error);
  const result = JSON.parse(child.stdout);
  assert.equal(child.status, result.exitCode, child.stdout);
  return result;
}

test("Desktop discovery interpretation persists candidate-only evidence and revalidates after restart", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "devrelay-discovery-handoff-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { fx, configured, invocation } = materializeNativeDiscoveryHostFixture(root);
  const invoke = (operation, input = configured.input) => executableCommand(configured, operation, input);
  assert.equal((await invoke("init")).exitCode, 0);
  const run = await invoke("run");
  assert.equal(run.exitCode, 0, JSON.stringify(run));
  const evidence = output(await invoke("evidence"));
  const snapshotRef = evidence.execution.moduleResult.outputs["current-architecture-snapshot"][0];
  const storage = createLocalHostStorage({ rootDirectory: join(root, "state"), readOnly: true });
  let discovered;
  try {
    const namespace = `desktop-host/${canonicalJsonDigest({ projectId: "devrelay", root: realpathSync(root) }).slice(7)}/records`;
    const records = createLocalHostCheckpointStore({ storage, namespace });
    discovered = JSON.parse(storage.getArtifact(records.get(`artifact:${canonicalJsonDigest(snapshotRef)}`).stored));
  } finally { storage.close(); }
  const structured = JSON.parse(readFileSync(new URL("../examples/artifacts/current-architecture-snapshot-001.json", import.meta.url)));
  const state = JSON.parse(readFileSync(join(root, "native/state.json")));
  const repository = JSON.parse(readFileSync(join(root, "native/repository.json")));
  structured.projectArchitectureState = invocation.inputs["project-architecture-state"][0];
  structured.projectContext = state.projectContext;
  structured.repositorySnapshot = state.repositorySnapshot;
  structured.repositoryRevision = { revision: repository.revision, treeDigest: repository.treeDigest };
  structured.sourceRefs = [{ role: "original-discovery", artifact: snapshotRef }];
  structured.warnings = discovered.warnings;
  const structuredFile = fx.json("handoff/structured.json", structured);
  const structuredRef = { artifactId: structured.snapshotId, schema: "https://devrelay.dev/artifacts/current-architecture-snapshot/v1", mediaType: "application/vnd.devrelay.current-architecture-snapshot+json", digest: structuredFile.digest, uri: "artifact://fixture/structured" };
  const candidate = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureDiscoveryInterpretation", interpretationId: "host-interpretation", authority: "candidate", discoverySnapshot: snapshotRef, structuredSnapshot: structuredRef, projectArchitectureState: structured.projectArchitectureState, requirementsBaseline: state.requirementsBaseline, projectOverviewBaseline: state.projectOverviewBaseline, observations: discovered.observations.map(observation => ({ observation, disposition: "unresolved", rationale: "Fixture interpretation remains unreviewed.", targetPointers: [] })), gaps: [] };
  const submit = (value, replacesInterpretation) => {
    const file = fx.json("handoff/interpretation.json", value);
    const ref = { artifactId: value.interpretationId, schema: "https://devrelay.dev/artifacts/architecture-discovery-interpretation/v1", mediaType: "application/json", digest: file.digest, uri: "artifact://fixture/interpretation" };
    return fx.json("handoff/submission.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopDiscoveryInterpretationSubmission", interpretation: { path: file.path, ref }, artifacts: [{ path: structuredFile.path, ref: structuredRef }], ...(replacesInterpretation ? { replacesInterpretation } : {}) });
  };
  const descriptor = submit(candidate);
  const input = { ...configured.input, checkpointDigest: output(run).checkpointDigest, discoveryInterpretation: descriptor };
  const submitted = await invoke("resume", input);
  assert.equal(submitted.exitCode, 4, JSON.stringify(submitted));
  assert.equal(output(submitted).state.status, "awaiting-discovery-approval");
  const database = readFileSync(join(root, "state/state.sqlite"));
  const verified = await invoke("verify", { ...configured.input, subject: { kind: "checkpoint" } });
  assert.equal(verified.exitCode, 0, JSON.stringify(verified));
  assert.equal(output(verified).discoveryInterpretation.authority, "candidate");
  assert.ok(output(verified).discoveryInterpretation.unresolvedObservations > 0);
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), database);
  const replay = await invoke("resume", { ...input, checkpointDigest: output(submitted).checkpointDigest });
  assert.equal(replay.exitCode, 4, JSON.stringify(replay));
  assert.equal(output(replay).version, output(submitted).version);
  const different = structuredClone(candidate); different.observations[0].rationale = "Different candidate.";
  const denied = await invoke("resume", { ...input, checkpointDigest: output(submitted).checkpointDigest, discoveryInterpretation: submit(different) });
  assert.equal(denied.exitCode, 6, JSON.stringify(denied));
  const ordinaryReplay = await invoke("resume", { ...configured.input, checkpointDigest: output(submitted).checkpointDigest });
  assert.equal(ordinaryReplay.exitCode, 4, JSON.stringify(ordinaryReplay));
  assert.equal(output(ordinaryReplay).version, output(submitted).version);
  assert.equal((await invoke("verify", { ...configured.input, subject: { kind: "checkpoint" } })).exitCode, 0);
  const originalRef = output(verified).discoveryInterpretation.interpretationRef;
  const correction = submit(different, originalRef);
  const revised = await invoke("resume", { ...input, checkpointDigest: output(submitted).checkpointDigest, discoveryInterpretation: correction });
  assert.equal(revised.exitCode, 4, JSON.stringify(revised));
  assert.equal(output(revised).version, output(submitted).version + 1);
  const revisionReplay = await invoke("resume", { ...input, checkpointDigest: output(revised).checkpointDigest, discoveryInterpretation: correction });
  assert.equal(revisionReplay.exitCode, 4, JSON.stringify(revisionReplay));
  assert.equal(output(revisionReplay).version, output(revised).version);
  const revisedDatabase = readFileSync(join(root, "state/state.sqlite"));
  const revisionVerification = await invoke("verify", { ...configured.input, subject: { kind: "checkpoint" } });
  assert.equal(revisionVerification.exitCode, 0, JSON.stringify(revisionVerification));
  const history = output(revisionVerification).discoveryInterpretationHistory;
  assert.equal(history.length, 2);
  assert.deepEqual(history[1].interpretationRef, originalRef);
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), revisedDatabase);
  const third = structuredClone(candidate); third.observations[0].rationale = "Third candidate.";
  assert.equal((await invoke("resume", { ...input, checkpointDigest: output(revised).checkpointDigest, discoveryInterpretation: submit(third, originalRef) })).exitCode, 6);
  // These approvals are deliberately synthetic fixtures, not project-owner
  // acceptance of DevRelay or of the example architecture.
  const gateSubmission = (interpretationRef, modify = () => {}) => {
    const evidenceFile = (id, schema, text) => {
      const file = fx.write(`handoff/${id}.md`, Buffer.from(text));
      return { path: file.path, ref: { artifactId: id, schema, mediaType: "text/markdown", digest: file.digest, uri: `artifact://fixture/${id}` } };
    };
    const review = evidenceFile("discovery-review", "https://devrelay.dev/evidence/architecture-discovery-review/v1", "Fixture-only independent review. Not a real approval.");
    const evidence = evidenceFile("discovery-support", "https://devrelay.dev/evidence/test/v1", "Fixture-only supporting evidence.");
    const approval = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureDiscoveryOwnerApproval", approvalId: "fixture-owner-approval",
      authority: "project-owner", decision: "approve", policyVersion: "architecture-discovery-gate/0.1.0", interpretation: interpretationRef,
      repositoryRevision: repository.revision, review: review.ref, requiredEvidence: [evidence.ref],
      acknowledgedWarnings: structured.warnings, acceptedNonMaterialGapIds: structured.gaps.map(gap => gap.id),
      acceptedOutOfScopeObservations: discovered.observations };
    modify(approval);
    const file = fx.json("handoff/owner-approval.json", approval);
    const ref = { artifactId: approval.approvalId, schema: "https://devrelay.dev/evidence/architecture-discovery-owner-approval/v1",
      mediaType: "application/vnd.devrelay.architecture-discovery-owner-approval+json", digest: file.digest, uri: "artifact://fixture/owner-approval" };
    return fx.json("handoff/gate.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopDiscoveryGateSubmission", ownerApproval: { path: file.path, ref }, artifacts: [review, evidence] });
  };
  const blocked = await invoke("resume", { ...configured.input, checkpointDigest: output(revised).checkpointDigest,
    discoveryGate: gateSubmission(history[0].interpretationRef) });
  assert.equal(blocked.exitCode, 6, JSON.stringify(blocked));
  assert.match(JSON.stringify(blocked), /unresolved observations/);
  const disposed = structuredClone(candidate);
  disposed.observations.forEach(entry => { entry.disposition = "out-of-scope"; entry.rationale = "Explicitly excluded for this fixture only."; });
  const ready = await invoke("resume", { ...input, checkpointDigest: output(revised).checkpointDigest,
    discoveryInterpretation: submit(disposed, history[0].interpretationRef) });
  assert.equal(ready.exitCode, 4, JSON.stringify(ready));
  const readyEvidence = output(await invoke("evidence"));
  for (const modify of [
    approval => { approval.interpretation = originalRef; },
    approval => { approval.repositoryRevision = "another-revision"; },
    approval => { approval.acceptedOutOfScopeObservations = []; },
    approval => { approval.acknowledgedWarnings = ["invented-warning"]; },
    approval => { approval.requiredEvidence = [approval.review]; },
    approval => { approval.decision = "reject"; },
  ]) {
    const deniedGate = await command(configured, "resume", { ...configured.input, checkpointDigest: output(ready).checkpointDigest,
      discoveryGate: gateSubmission(readyEvidence.discoveryInterpretation.interpretationRef, modify) });
    assert.equal(deniedGate.exitCode, 6, JSON.stringify(deniedGate));
  }
  const discoveryGate = gateSubmission(readyEvidence.discoveryInterpretation.interpretationRef);
  const prepared = await invoke("resume", { ...configured.input, checkpointDigest: output(ready).checkpointDigest, discoveryGate });
  assert.equal(prepared.exitCode, 5, JSON.stringify(prepared));
  const preparedEvidence = output(await invoke("evidence"));
  assert.equal(preparedEvidence.discoveryGate.scope, "observational-discovery-readiness");
  const nextState = JSON.parse(preparedEvidence.discoveryGate.nextState.utf8);
  assert.equal(nextState.state, "existing-discovered-unbaselined");
  assert.equal(nextState.architectureBaseline, undefined);
  const gateReplay = await invoke("resume", { ...configured.input, checkpointDigest: output(prepared).checkpointDigest, discoveryGate });
  assert.equal(gateReplay.exitCode, 5, JSON.stringify(gateReplay));
  assert.equal(output(gateReplay).version, output(prepared).version);
  fx.write("handoff/discovery-review.md", Buffer.from("Changed source review after commit."));
  const changedReview = await command(configured, "resume", { ...configured.input, checkpointDigest: output(prepared).checkpointDigest, discoveryGate });
  assert.equal(changedReview.exitCode, 6, JSON.stringify(changedReview));
  const gateDatabase = readFileSync(join(root, "state/state.sqlite"));
  const gateVerified = await invoke("verify", { ...configured.input, subject: { kind: "checkpoint" } });
  assert.equal(gateVerified.exitCode, 0, JSON.stringify(gateVerified));
  assert.deepEqual(output(gateVerified).discoveryGate, preparedEvidence.discoveryGate);
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), gateDatabase);
  const sealedRevision = await invoke("resume", { ...input, checkpointDigest: output(prepared).checkpointDigest,
    discoveryInterpretation: submit(third, readyEvidence.discoveryInterpretation.interpretationRef) });
  assert.equal(sealedRevision.exitCode, 6, JSON.stringify(sealedRevision));
});

test("native discovery runs through the durable host and Core without a Desktop candidate response", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "devrelay-native-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { fx, configured, source, invocation } = materializeNativeDiscoveryHostFixture(root);
  assert.equal((await executableCommand(configured, "init")).exitCode, 0);
  const result = await executableCommand(configured, "run");
  assert.equal(result.exitCode, 0, JSON.stringify(result));
  assert.equal(output(result).state.status, "module-completed");
  assert.equal(output(result).state.pendingRequestId, null);
  const databaseBefore = readFileSync(join(fx.root, "state/state.sqlite"));
  const verified = await executableCommand(configured, "verify", { ...configured.input, subject: { kind: "checkpoint" } });
  assert.equal(verified.exitCode, 0, JSON.stringify(verified));
  assert.deepEqual(readFileSync(join(fx.root, "state/state.sqlite")), databaseBefore);
  const ungrantedInvocation = { ...invocation, invocationId: "native-ungranted", runId: "native-ungranted", grants: [] };
  const denied = await executableCommand(configured, "run", { ...configured.input, runId: ungrantedInvocation.runId,
    invocation: fx.json("native/ungranted.json", ungrantedInvocation) });
  assert.notEqual(denied.exitCode, 0);
  fx.write(source.path, Buffer.from("export const greeting = 'changed';\n"));
  const replay = await executableCommand(configured, "resume", { ...configured.input, checkpointDigest: output(result).checkpointDigest });
  assert.equal(replay.exitCode, 0, JSON.stringify(replay));
  assert.equal(output(replay).version, output(result).version);
  const nextInvocation = { ...invocation, invocationId: "native-discovery-002", runId: "native-run-002" };
  const changed = await executableCommand(configured, "run", { ...configured.input, runId: nextInvocation.runId,
    invocation: fx.json("native/changed-invocation.json", nextInvocation) });
  assert.notEqual(changed.exitCode, 0);
  assert.match(JSON.stringify(changed), /declared source bytes drifted/);
});

test("CLI resume validates a current-pair requirements change through the actual Gate", async (t) => {
  const base = fixture(t);
  const fx = { root: base.root, ...materializeRequirementsChangeHostFixture(base.root) };
  const invoke = async (operation, input = fx.input, selected = fx) => {
    if (process.platform !== "win32") return command({ ...fx, ...selected }, operation, input);
    const child = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/devrelay.mjs", import.meta.url)), operation,
      "--json", "--host", selected.configurationPath, "--host-digest", selected.configurationDigest, "--input", JSON.stringify(input)],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 });
    assert.ifError(child.error);
    const body = JSON.parse(child.stdout);
    assert.equal(child.status, body.exitCode, child.stdout);
    return body;
  };
  assert.equal((await invoke("init")).exitCode, 0);
  const pending = await invoke("run");
  assert.equal(pending.exitCode, 5, JSON.stringify(pending));
  const waiting = output(pending);
  const response = fx.json("change-response.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopStepResponse", requestId: waiting.desktopRequest.requestId, requestDigest: canonicalJsonDigest(waiting.desktopRequest), result: fx.result });
  const completed = await invoke("resume", { ...fx.input, checkpointDigest: waiting.checkpointDigest, response });
  assert.equal(completed.exitCode, 0, JSON.stringify(completed));
  const gate = await invoke("resume", { ...fx.input, checkpointDigest: output(completed).checkpointDigest, requirementsGate: fx.gate });
  assert.equal(gate.outcome, "awaiting-gate-activation", JSON.stringify(gate));
  assert.equal(gate.exitCode, 5);
  const evidence = output(await invoke("evidence"));
  assert.equal(evidence.requirementsGate.commitPayload.requirementsBaseline.ref.artifactId, "requirements-baseline-002");
  const replay = await invoke("resume", { ...fx.input, checkpointDigest: output(gate).checkpointDigest, requirementsGate: fx.gate });
  assert.equal(output(replay).state.gateRecordKey, output(gate).state.gateRecordKey);
  assert.equal(output(replay).lifecycleComplete, false);
  assert.equal(output(replay).version, output(gate).version);
  const staleActivation = await invoke("resume", { ...fx.input, checkpointDigest: output(gate).checkpointDigest,
    activateRequirementsGate: `sha256:${"f".repeat(64)}` });
  assert.equal(staleActivation.exitCode, 6, JSON.stringify(staleActivation));
  const submission = JSON.parse(readFileSync(join(fx.root, fx.gate.path)));
  assert.equal(evidence.requirementsGate.approvalEvidence[0].ref.artifactId, "requirements-change-approval-001");
  // Committed verification uses exact stored approval bytes; a new submission
  // must still validate the source file before it can publish anything.
  fx.write(submission.approvalEvidence[0].path, Buffer.from("altered approval"));
  const changedApproval = await invoke("resume", { ...fx.input, checkpointDigest: output(gate).checkpointDigest, requirementsGate: fx.gate });
  assert.equal(changedApproval.exitCode, 6, JSON.stringify(changedApproval));
  const databaseBefore = readFileSync(join(fx.root, "state", "state.sqlite"));
  const verified = await invoke("verify", { ...fx.input, subject: { kind: "checkpoint" } });
  assert.equal(verified.exitCode, 0, JSON.stringify(verified));
  assert.equal(output(verified).requirementsGate.commitDigest, evidence.requirementsGate.commitDigest);
  assert.equal(output(verified).requirementsGate.scope, "validated-requirements-pair");
  assert.equal(output(verified).requirementsGate.lifecycleComplete, false);
  assert.deepEqual(readFileSync(join(fx.root, "state", "state.sqlite")), databaseBefore);
  const activated = await invoke("resume", { ...fx.input, checkpointDigest: output(gate).checkpointDigest,
    activateRequirementsGate: evidence.requirementsGate.commitDigest });
  assert.equal(activated.outcome, "requirements-activated", JSON.stringify(activated));
  assert.equal(output(activated).lifecycleComplete, false);
  const activeEvidence = output(await invoke("evidence"));
  assert.ok(activeEvidence.requirementsActivation.applicationProof.receiptRef);
  const activeBytes = readFileSync(join(fx.root, "state", "state.sqlite"));
  const activeVerification = await invoke("verify", { ...fx.input, subject: { kind: "checkpoint" } });
  assert.equal(activeVerification.exitCode, 0, JSON.stringify(activeVerification));
  assert.deepEqual(output(activeVerification).requirementsActivation, activeEvidence.requirementsActivation);
  assert.deepEqual(readFileSync(join(fx.root, "state", "state.sqlite")), activeBytes);
  const activationReplay = await invoke("resume", { ...fx.input, checkpointDigest: output(activated).checkpointDigest,
    activateRequirementsGate: evidence.requirementsGate.commitDigest });
  assert.equal(output(activationReplay).version, output(activated).version);
  assert.deepEqual(output(await invoke("evidence")).requirementsActivation, activeEvidence.requirementsActivation);
  const staleRun = await invoke("run", { ...fx.input, runId: "old-context-new-run" });
  assert.equal(staleRun.exitCode, 6, JSON.stringify(staleRun));
  assert.equal(output(await invoke("status")).checkpointDigest, output(activated).checkpointDigest);
  const refreshRequirementsContext = "2026-09-14T02:00:00Z";
  const refreshed = await invoke("resume", { ...fx.input, checkpointDigest: output(activated).checkpointDigest, refreshRequirementsContext });
  assert.equal(refreshed.outcome, "requirements-context-prepared", JSON.stringify(refreshed));
  const context = output(await invoke("evidence")).requirementsContext;
  assert.equal(context.snapshot.bindings.find(({ role }) => role === "requirements-baseline").artifact.artifactId, "requirements-baseline-002");
  assert.equal(context.lifecycleComplete, false);
  const contextDatabase = readFileSync(join(fx.root, "state", "state.sqlite"));
  const verifiedContext = await invoke("verify", { ...fx.input, subject: { kind: "checkpoint" } });
  assert.equal(verifiedContext.exitCode, 0, JSON.stringify(verifiedContext));
  assert.deepEqual(output(verifiedContext).requirementsContext, context);
  assert.deepEqual(readFileSync(join(fx.root, "state", "state.sqlite")), contextDatabase);
  const repeatedContext = await invoke("resume", { ...fx.input, checkpointDigest: output(refreshed).checkpointDigest, refreshRequirementsContext });
  assert.equal(output(repeatedContext).version, output(refreshed).version);
  const conflict = await invoke("resume", { ...fx.input, checkpointDigest: output(refreshed).checkpointDigest,
    refreshRequirementsContext: "2026-09-14T03:00:00Z" });
  assert.equal(conflict.exitCode, 6, JSON.stringify(conflict));
  const originalConfiguration = readFileSync(fx.configurationPath);
  const materialized = await invoke("resume", { ...fx.input, checkpointDigest: output(refreshed).checkpointDigest,
    materializeRequirementsContext: context.handoffDigest });
  assert.equal(materialized.outcome, "requirements-context-materialized", JSON.stringify(materialized));
  const nextConfiguration = output(materialized).nextConfiguration;
  assert.deepEqual(readFileSync(fx.configurationPath), originalConfiguration);
  const filesVerified = await invoke("verify", { ...fx.input, subject: { kind: "checkpoint" } });
  assert.equal(filesVerified.exitCode, 0, JSON.stringify(filesVerified));
  assert.deepEqual(output(filesVerified).requirementsContextFiles, nextConfiguration);
  const materializationReplay = await invoke("resume", { ...fx.input, checkpointDigest: output(materialized).checkpointDigest,
    materializeRequirementsContext: context.handoffDigest });
  assert.equal(output(materializationReplay).version, output(materialized).version);
  const nextInitialized = await invoke("init", fx.input, nextConfiguration);
  assert.equal(nextInitialized.exitCode, 0, JSON.stringify(nextInitialized));
  assert.equal((await invoke("inspect", fx.input, nextConfiguration)).exitCode, 6);
  const historical = await invoke("inspect");
  assert.equal(historical.exitCode, 0, JSON.stringify(historical));
});

test("native host connects real facade/Core to durable Desktop pending/result/replay flow", async (t) => {
  const fx = fixture(t);
  assert.equal((await command(fx, "init")).exitCode, 0);
  const readOnlyRun = await command(fx, "run", { ...fx.input, profile: "inspect" });
  assert.equal(readOnlyRun.exitCode, 2);
  assert.equal(readOnlyRun.diagnostics[0].code, "DR4743");
  const pending = await command(fx, "run");
  assert.equal(pending.outcome, "awaiting-desktop", JSON.stringify(pending));
  assert.equal(pending.exitCode, 5);
  const waiting = output(pending);
  assert.equal(waiting.lifecycleComplete, false);
  const legacyActivation = await command(fx, "resume", { ...fx.input, checkpointDigest: waiting.checkpointDigest,
    activateRequirementsGate: `sha256:${"a".repeat(64)}` });
  assert.equal(legacyActivation.exitCode, 4, JSON.stringify(legacyActivation));
  assert.equal(output(await command(fx, "status")).checkpointDigest, waiting.checkpointDigest);
  assert.equal(waiting.desktopRequest.invocation.invocationId, fx.result.invocationId);
  const readOnlyResume = await command(fx, "resume", { ...fx.input, profile: "inspect", checkpointDigest: waiting.checkpointDigest });
  assert.equal(readOnlyResume.exitCode, 2);
  assert.equal(readOnlyResume.diagnostics[0].code, "DR4743");
  assert.equal(output(await command(fx, "status")).checkpointDigest, waiting.checkpointDigest);
  const stale = await command(fx, "resume", { ...fx.input, checkpointDigest: `sha256:${"f".repeat(64)}` });
  assert.equal(stale.exitCode, 6);
  assert.equal((await command(fx, "verify", { ...fx.input, subject: { kind: "checkpoint" } })).exitCode, 7);
  const response = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopStepResponse", requestId: waiting.desktopRequest.requestId,
    requestDigest: canonicalJsonDigest(waiting.desktopRequest), result: fx.result };
  const responseFile = fx.json("response.json", response);
  const mismatched = fx.json("mismatched.json", { ...response, requestDigest: `sha256:${"f".repeat(64)}` });
  assert.notEqual((await command(fx, "resume", { ...fx.input, checkpointDigest: waiting.checkpointDigest, response: mismatched })).exitCode, 0);
  const completed = await command(fx, "resume", { ...fx.input, checkpointDigest: waiting.checkpointDigest, response: responseFile });
  assert.equal(completed.exitCode, 0, JSON.stringify(completed));
  assert.equal(output(completed).state.status, "module-completed");
  const invalidGate = fx.json("invalid-gate.json", { kind: "DesktopRequirementsGateSubmission", approved: true });
  assert.notEqual((await command(fx, "resume", { ...fx.input, checkpointDigest: output(completed).checkpointDigest, requirementsGate: invalidGate })).exitCode, 0);
  assert.equal(output(await command(fx, "status")).checkpointDigest, output(completed).checkpointDigest);
  const verified = await command(fx, "verify", { ...fx.input, subject: { kind: "checkpoint" } });
  assert.equal(verified.exitCode, 0, JSON.stringify(verified));
  assert.equal(output(verified).lifecycleComplete, false);
  const before = readFileSync(join(fx.root, "state", "state.sqlite"));
  for (const operation of ["status", "inspect", "evidence", "verify"]) {
    assert.equal((await command(fx, operation, { ...fx.input, subject: { kind: "checkpoint" } })).exitCode, 0);
  }
  assert.deepEqual(readFileSync(join(fx.root, "state", "state.sqlite")), before);
  const replay = await command(fx, "resume", { ...fx.input, checkpointDigest: output(completed).checkpointDigest });
  assert.equal(replay.exitCode, 0, JSON.stringify(replay));
  const again = await command(fx, "verify", { ...fx.input, subject: { kind: "checkpoint" } });
  assert.deepEqual(output(again).applicationProof, output(verified).applicationProof);
});

test("stale configuration, context, missing grants, and unknown state stop before effects", async (t) => {
  const fx = fixture(t);
  await assert.rejects(openDesktopLocalHost({ ...fx, configurationDigest: `sha256:${"f".repeat(64)}`, command: "init", platform: "win32" }), { code: "DR4962" });
  assert.equal(existsSync(join(fx.root, "state")), false);
  await assert.rejects(openDesktopLocalHost({ ...fx, command: "status", platform: "win32" }), { code: "DR4963" });
  assert.equal(existsSync(join(fx.root, "state")), false);
  const denied = fx.json("denied.json", { ...fx.configuration, grants: [{ kind: "filesystem.read", values: ["."] }] });
  await assert.rejects(openDesktopLocalHost({ configurationPath: join(fx.root, denied.path), configurationDigest: denied.digest, command: "init", platform: "win32" }), { code: "DR4736" });
  assert.equal(existsSync(join(fx.root, "state")), false);
  const prior = JSON.parse(readFileSync(join(fx.root, fx.configuration.memorySessionState.path)));
  const priorBody = { ...prior, status: "open", taskId: "another-task" };
  delete priorBody.contentDigest;
  const priorFile = fx.json("prior-session.json", { ...priorBody, contentDigest: canonicalJsonDigest(priorBody) });
  const priorConfig = fx.json("prior-host.json", { ...fx.configuration, memorySessionState: priorFile });
  await assert.rejects(openDesktopLocalHost({ configurationPath: join(fx.root, priorConfig.path), configurationDigest: priorConfig.digest, command: "init", platform: "win32" }), { code: "DR4967" });
  assert.equal(existsSync(join(fx.root, "state")), false);
  fx.write(fx.configuration.sessionSnapshot.path, Buffer.from("{}"));
  await assert.rejects(openDesktopLocalHost({ ...fx, command: "init", platform: "win32" }), { code: "DR4962" });
  assert.equal(existsSync(join(fx.root, "state")), false);
});

test("invalid Desktop response can be corrected without overwriting candidate history", async (t) => {
  const fx = fixture(t);
  await command(fx, "init");
  const waiting = output(await command(fx, "run"));
  const response = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopStepResponse", requestId: waiting.desktopRequest.requestId,
    requestDigest: canonicalJsonDigest(waiting.desktopRequest), result: { ...fx.result, outcome: "not_declared" } };
  const invalid = fx.json("invalid.json", response);
  const rejected = await command(fx, "resume", { ...fx.input, checkpointDigest: waiting.checkpointDigest, response: invalid });
  assert.notEqual(rejected.exitCode, 0);
  assert.equal(output(await command(fx, "status")).state.status, "awaiting-desktop");
  const valid = fx.json("valid.json", { ...response, result: fx.result });
  const corrected = await command(fx, "resume", { ...fx.input, checkpointDigest: waiting.checkpointDigest, response: valid });
  assert.equal(corrected.exitCode, 0, JSON.stringify(corrected));
  const storage = createLocalHostStorage({ rootDirectory: join(fx.root, "state"), readOnly: true });
  try { assert.equal(storage.listRuns({ prefix: "local-checkpoint:" }).filter(({ state }) => state.namespace.endsWith("/responses")).length, 2); }
  finally { storage.close(); }
});

test("actual executable uses the explicit native host binding and its supported platform boundary", (t) => {
  const fx = fixture(t);
  const bin = fileURLToPath(new URL("../bin/devrelay.mjs", import.meta.url));
  const child = spawnSync(process.execPath, [bin, "init", "--json", "--host", fx.configurationPath, "--host-digest", fx.configurationDigest], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  assert.ifError(child.error);
  const result = JSON.parse(child.stdout);
  if (process.platform === "win32") {
    assert.equal(child.status, 0, child.stdout);
    assert.equal(result.outcome, "initialized");
    const invoke = (operation, input) => {
      const next = spawnSync(process.execPath, [bin, operation, "--json", "--host", fx.configurationPath, "--host-digest", fx.configurationDigest, "--input", JSON.stringify(input)], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
      assert.ifError(next.error);
      return { exit: next.status, body: JSON.parse(next.stdout) };
    };
    const pending = invoke("run", fx.input);
    assert.equal(pending.exit, 5, JSON.stringify(pending));
    const waiting = output(pending.body);
    const packet = fx.json("subprocess-response.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopStepResponse",
      requestId: waiting.desktopRequest.requestId, requestDigest: canonicalJsonDigest(waiting.desktopRequest), result: fx.result });
    const resumed = invoke("resume", { ...fx.input, checkpointDigest: waiting.checkpointDigest, response: packet });
    assert.equal(resumed.exit, 0, JSON.stringify(resumed));
    for (const operation of ["status", "inspect", "evidence", "verify"]) {
      const inspected = invoke(operation, { ...fx.input, subject: { kind: "checkpoint" } });
      assert.equal(inspected.exit, 0, JSON.stringify(inspected));
    }
  } else {
    assert.notEqual(child.status, 0);
    assert.equal(result.diagnostics[0].code, "DR4961");
    assert.equal(existsSync(join(fx.root, "state")), false);
  }
});
