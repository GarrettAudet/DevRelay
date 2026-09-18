import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { materializeNativeDiscoveryHostFixture } from "./fixtures/desktop-native-discovery-host.mjs";
import { desktopWorkCandidate } from "./fixtures/desktop-work-candidate.mjs";
import { createQualityPolicyCandidate, promoteQualityPolicyBaseline, createQualityPolicyContext } from "../src/quality-policy.mjs";
import { prepareLocalQualityPolicyGate } from "../src/local-quality-policy-gate.mjs";
import { openDesktopLocalHost } from "../src/desktop-local-host.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createLocalHostCheckpointStore } from "../src/local-host-checkpoints.mjs";
import { materializeDesktopHostFixture } from "./fixtures/desktop-local-host.mjs";
import { materializeRequirementsChangeHostFixture } from "./fixtures/desktop-requirements-change-host.mjs";
import { architectureNativeBytes } from "./native-architecture-fixtures.mjs";
import { materializeDesktopArchitectureChain } from "./fixtures/desktop-architecture-chain.mjs";
import { materializeContractGateSubmission } from "./fixtures/desktop-contract-gate.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "devrelay-connected-host-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, ...materializeDesktopHostFixture(root) };
}
const output = (result) => result.result?.outputs ?? result.result;
let commandSequence = 0;
async function command(fx, operation, input = fx.input) {
  const progress = process.env.DEVRELAY_TEST_PROGRESS === "1";
  const sequence = ++commandSequence;
  const start = performance.now();
  const cpuStart = progress ? process.cpuUsage() : null;
  const delay = progress ? monitorEventLoopDelay({ resolution: 20 }) : null;
  delay?.enable();
  if (progress) console.error(JSON.stringify({ sequence, operation, phase: "start" }));
  let host, result;
  try {
    host = await openDesktopLocalHost({ ...fx, command: operation, platform: "win32" });
    result = await host.cli.execute({ command: operation, input, format: "json" });
    return result;
  } finally {
    host?.close(); delay?.disable();
    if (progress) {
      const cpu = process.cpuUsage(cpuStart);
      console.error(JSON.stringify({ sequence, operation, phase: "end", exitCode: result?.exitCode,
        elapsedMs: Math.round(performance.now() - start), cpuMs: Math.round((cpu.user + cpu.system) / 1000),
        eventLoopMaxDelayMs: Math.round(delay.max / 1e6) }));
    }
  }
}

async function executableCommand(fx, operation, input = fx.input) {
  if (process.env.DEVRELAY_TEST_IN_PROCESS === "1") return command(fx, operation, input);
  if (process.platform !== "win32") return command(fx, operation, input);
  const child = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/devrelay.mjs", import.meta.url)), operation,
    "--json", "--host", fx.configurationPath, "--host-digest", fx.configurationDigest, "--input", JSON.stringify(input)],
  // The full approved-project graph can take over a minute to validate on
  // Windows. This is a bounded test-process budget, not a runtime lease bypass.
  { encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });
  assert.ifError(child.error);
  const result = JSON.parse(child.stdout);
  assert.equal(child.status, result.exitCode, child.stdout);
  return result;
}

for (const requiredContracts of [true, false]) test(`Desktop discovery approval activates state and executes ArchitectureDesign ${requiredContracts ? "with contracts" : "without contracts"}`, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "devrelay-discovery-handoff-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { fx, configured, invocation } = materializeNativeDiscoveryHostFixture(root, { withDesign: true });
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
  structured.nativeArtifacts.content.entries.push({
    ...structuredClone(structured.nativeArtifacts.content.entries[0]),
    id: "NA-ORIGINAL-DISCOVERY", artifact: snapshotRef, role: "original-discovery",
    logicalPath: ".devrelay/discovery/original-snapshot.json",
    producedBy: { stage: "discovery", adapterId: invocation.plugin.id, adapterVersion: invocation.plugin.version,
      tool: { name: "DevRelay native discovery", version: invocation.plugin.version } },
  });
  structured.warnings = discovered.warnings;
  const nativeArtifacts = new Map();
  const collectNative = value => {
    if (!value || typeof value !== "object") return;
    if (value.schema && architectureNativeBytes.has(value.artifactId)) {
      const file = fx.write(`handoff/native-${value.artifactId}`, architectureNativeBytes.get(value.artifactId));
      assert.equal(file.digest, value.digest);
      nativeArtifacts.set(value.artifactId, { path: file.path, ref: value });
    }
    Object.values(value).forEach(collectNative);
  };
  collectNative(structured);
  const structuredFile = fx.json("handoff/structured.json", structured);
  const structuredRef = { artifactId: structured.snapshotId, schema: "https://devrelay.dev/artifacts/current-architecture-snapshot/v1", mediaType: "application/vnd.devrelay.current-architecture-snapshot+json", digest: structuredFile.digest, uri: "artifact://fixture/structured" };
  const candidate = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureDiscoveryInterpretation", interpretationId: "host-interpretation", authority: "candidate", discoverySnapshot: snapshotRef, structuredSnapshot: structuredRef, projectArchitectureState: structured.projectArchitectureState, requirementsBaseline: state.requirementsBaseline, projectOverviewBaseline: state.projectOverviewBaseline, observations: discovered.observations.map(observation => ({ observation, disposition: "unresolved", rationale: "Fixture interpretation remains unreviewed.", targetPointers: [] })), gaps: [] };
  const submit = (value, replacesInterpretation) => {
    const file = fx.json("handoff/interpretation.json", value);
    const ref = { artifactId: value.interpretationId, schema: "https://devrelay.dev/artifacts/architecture-discovery-interpretation/v1", mediaType: "application/json", digest: file.digest, uri: "artifact://fixture/interpretation" };
    return fx.json("handoff/submission.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopDiscoveryInterpretationSubmission", interpretation: { path: file.path, ref }, artifacts: [{ path: structuredFile.path, ref: structuredRef }, ...nativeArtifacts.values()], ...(replacesInterpretation ? { replacesInterpretation } : {}) });
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
  const staleActivation = await invoke("resume", { ...configured.input, checkpointDigest: output(prepared).checkpointDigest,
    activateDiscoveryGate: `sha256:${"f".repeat(64)}` });
  assert.equal(staleActivation.exitCode, 6, JSON.stringify(staleActivation));
  const activated = await invoke("resume", { ...configured.input, checkpointDigest: output(prepared).checkpointDigest,
    activateDiscoveryGate: preparedEvidence.discoveryGate.commitDigest });
  assert.equal(activated.exitCode, 5, JSON.stringify(activated));
  assert.equal(output(activated).state.status, "discovery-activated");
  const activatedEvidence = output(await invoke("evidence"));
  assert.deepEqual(activatedEvidence.discoveryActivation.state, preparedEvidence.discoveryGate.nextState.ref);
  assert.equal(activatedEvidence.discoveryActivation.lifecycleComplete, false);
  const activatedDatabase = readFileSync(join(root, "state/state.sqlite"));
  const activationVerified = await invoke("verify", { ...configured.input, subject: { kind: "checkpoint" } });
  assert.equal(activationVerified.exitCode, 0, JSON.stringify(activationVerified));
  assert.deepEqual(output(activationVerified).discoveryActivation, activatedEvidence.discoveryActivation);
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), activatedDatabase);
  const activationReplay = await invoke("resume", { ...configured.input, checkpointDigest: output(activated).checkpointDigest,
    activateDiscoveryGate: preparedEvidence.discoveryGate.commitDigest });
  assert.equal(activationReplay.exitCode, 5, JSON.stringify(activationReplay));
  assert.equal(output(activationReplay).version, output(activated).version);
  const staleInvocation = { ...invocation, invocationId: "stale-after-discovery", runId: "stale-after-discovery" };
  const staleRun = await invoke("run", { ...configured.input, runId: staleInvocation.runId,
    invocation: fx.json("handoff/stale-invocation.json", staleInvocation) });
  assert.equal(staleRun.exitCode, 6, JSON.stringify(staleRun));
  assert.match(JSON.stringify(staleRun), /architecture state is stale/);
  const contextPrepared = await invoke("resume", { ...configured.input, checkpointDigest: output(activated).checkpointDigest,
    prepareArchitectureContext: "2026-09-14T01:00:00Z" });
  assert.equal(contextPrepared.exitCode, 5, JSON.stringify(contextPrepared));
  const contextEvidence = output(await invoke("evidence"));
  const handoff = contextEvidence.architectureContext;
  assert.deepEqual(handoff.state, activatedEvidence.discoveryActivation.state);
  const route = JSON.parse(Buffer.from(handoff.files.find(file => file.ref.artifactId === handoff.route.artifactId).bytesBase64, "base64"));
  assert.deepEqual(route.selection, { kind: "operation", operation: "establish-baseline" });
  const originalConfiguration = readFileSync(configured.configurationPath);
  const published = await invoke("resume", { ...configured.input, checkpointDigest: output(contextPrepared).checkpointDigest,
    materializeArchitectureContext: handoff.handoffDigest });
  assert.equal(published.exitCode, 5, JSON.stringify(published));
  const nextConfiguration = output(published).nextConfiguration;
  assert.deepEqual(readFileSync(configured.configurationPath), originalConfiguration);
  const publishedDatabase = readFileSync(join(root, "state/state.sqlite"));
  const contextVerified = await invoke("verify", { ...configured.input, subject: { kind: "checkpoint" } });
  assert.equal(contextVerified.exitCode, 0, JSON.stringify(contextVerified));
  assert.deepEqual(output(contextVerified).architectureContextFiles, nextConfiguration);
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), publishedDatabase);
  const nextHost = { ...configured, ...nextConfiguration };
  assert.equal((await executableCommand(nextHost, "init", configured.input)).exitCode, 0);
  const design = JSON.parse(readFileSync(new URL("../examples/invocations/architecture-establish-baseline.invocation.json", import.meta.url)));
  design.invocationId = "desktop-design-from-discovery"; design.runId = "desktop-design";
  design.inputs = { ...invocation.inputs, "project-context": [state.projectContext], "project-architecture-state": [handoff.state],
    "current-architecture-snapshot": [handoff.discoverySnapshot], "routing-decision": [handoff.route] };
  for (const binding of design.adapters) {
    binding.plugin.id = `desktop-architecture-${binding.step}-fixture`;
    binding.config.projectRoot = root;
    binding.grants = [];
  }
  const designInput = { ...configured.input, runId: design.runId, nodeId: design.nodeId, invocation: fx.json("design/invocation.json", design) };
  const pendingDesign = await executableCommand(nextHost, "run", designInput);
  assert.equal(pendingDesign.exitCode, 5, JSON.stringify(pendingDesign));
  assert.equal(output(pendingDesign).state.status, "awaiting-desktop");
  assert.equal(output(pendingDesign).desktopRequest.invocation.step, "designer");
  assert.equal(output(pendingDesign).lifecycleComplete, false);
  const requirementsFile = configured.configuration.artifacts.find(entry => entry.ref.artifactId === state.requirementsBaseline.artifactId);
  const chain = materializeDesktopArchitectureChain({ fx, invocation: design, requiredContracts, requirements: JSON.parse(readFileSync(join(root, requirementsFile.path))) });
  let designProgress = pendingDesign;
  for (const expectedStep of ["designer", "modeler", "decision-recorder"]) {
    const current = output(designProgress);
    assert.equal(current.desktopRequest.invocation.step, expectedStep);
    const response = fx.json(`design/response-${expectedStep}.json`, { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopStepResponse",
      requestId: current.desktopRequest.requestId, requestDigest: canonicalJsonDigest(current.desktopRequest), result: chain.result(current.desktopRequest.invocation) });
    designProgress = await executableCommand(nextHost, "resume", { ...designInput, checkpointDigest: current.checkpointDigest, response, artifacts: chain.artifacts });
    assert.equal(designProgress.exitCode, expectedStep === "decision-recorder" ? 0 : 5, JSON.stringify(designProgress));
  }
  const completedDesign = output(designProgress);
  assert.equal(completedDesign.state.status, "module-completed");
  const completedEvidence = output(await executableCommand(nextHost, "evidence", designInput));
  assert.equal(completedEvidence.execution.moduleResult.outcome, "baseline_drafted");
  assert.deepEqual(completedEvidence.execution.moduleResult.outputs["architecture-draft"], [chain.draftRef]);
  assert.equal(completedEvidence.lifecycleComplete, false);
  const completedDatabase = readFileSync(join(root, "state/state.sqlite"));
  const designVerified = await executableCommand(nextHost, "verify", { ...designInput, subject: { kind: "checkpoint" } });
  assert.equal(designVerified.exitCode, 0, JSON.stringify(designVerified));
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), completedDatabase);
  const designReplay = await executableCommand(nextHost, "resume", { ...designInput, checkpointDigest: completedDesign.checkpointDigest });
  assert.equal(designReplay.exitCode, 0, JSON.stringify(designReplay));
  assert.equal(output(designReplay).version, completedDesign.version);
  const badGate = await executableCommand(nextHost, "resume", { ...designInput, checkpointDigest: completedDesign.checkpointDigest,
    architectureGate: chain.gateSubmission("wrong-revision") });
  assert.equal(badGate.exitCode, 6, JSON.stringify(badGate));
  const architectureGateSubmission = chain.gateSubmission(repository.revision);
  const approvedDesign = await executableCommand(nextHost, "resume", { ...designInput, checkpointDigest: completedDesign.checkpointDigest,
    architectureGate: architectureGateSubmission });
  assert.equal(approvedDesign.exitCode, 5, JSON.stringify(approvedDesign));
  assert.equal(output(approvedDesign).state.status, "awaiting-gate-activation");
  const approvalDatabase = readFileSync(join(root, "state/state.sqlite"));
  const approvalVerified = await executableCommand(nextHost, "verify", { ...designInput, subject: { kind: "checkpoint" } });
  assert.equal(approvalVerified.exitCode, 0, JSON.stringify(approvalVerified));
  assert.equal(output(approvalVerified).architectureGate.scope, "validated-architecture-baseline");
  assert.equal(output(approvalVerified).architectureGate.lifecycleComplete, false);
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), approvalDatabase);
  const approvalReplay = await executableCommand(nextHost, "resume", { ...designInput, checkpointDigest: output(approvedDesign).checkpointDigest,
    architectureGate: architectureGateSubmission });
  assert.equal(approvalReplay.exitCode, 5, JSON.stringify(approvalReplay));
  assert.equal(output(approvalReplay).version, output(approvedDesign).version);
  {
  const gateDigest = output(approvalVerified).architectureGate.commitDigest;
  const activatedDesign = await executableCommand(nextHost, "resume", { ...designInput,
    checkpointDigest: output(approvedDesign).checkpointDigest, activateArchitectureGate: gateDigest });
  assert.equal(activatedDesign.exitCode, 5, JSON.stringify(activatedDesign));
  assert.equal(output(activatedDesign).state.status, "architecture-activated");
  const activatedDatabase = readFileSync(join(root, "state/state.sqlite"));
  const activationVerified = await executableCommand(nextHost, "verify", { ...designInput, subject: { kind: "checkpoint" } });
  assert.equal(activationVerified.exitCode, 0, JSON.stringify(activationVerified));
  assert.ok(output(activationVerified).architectureActivation.applicationProof);
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), activatedDatabase);
  const activationReplay = await executableCommand(nextHost, "resume", { ...designInput,
    checkpointDigest: output(activatedDesign).checkpointDigest, activateArchitectureGate: gateDigest });
  assert.equal(activationReplay.exitCode, 5, JSON.stringify(activationReplay));
  assert.equal(output(activationReplay).version, output(activatedDesign).version);
  const planned = await executableCommand(nextHost, "resume", { ...designInput,
    checkpointDigest: output(activatedDesign).checkpointDigest, prepareContractPlanning: gateDigest });
  assert.equal(planned.exitCode, 5, JSON.stringify(planned));
  assert.equal(output(planned).state.status, "contract-planning-prepared");
  const planningDatabase = readFileSync(join(root, "state/state.sqlite"));
  const planningVerified = await executableCommand(nextHost, "verify", { ...designInput, subject: { kind: "checkpoint" } });
  assert.equal(planningVerified.exitCode, 0, JSON.stringify(planningVerified));
  assert.equal(output(planningVerified).contractPlanning.route.kind, requiredContracts ? "module" : "gate");
  assert.equal(output(planningVerified).contractPlanning.lifecycleComplete, false);
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), planningDatabase);
  const planningReplay = await executableCommand(nextHost, "resume", { ...designInput,
    checkpointDigest: output(planned).checkpointDigest, prepareContractPlanning: gateDigest });
  assert.equal(planningReplay.exitCode, 5, JSON.stringify(planningReplay));
  assert.equal(output(planningReplay).version, output(planned).version);
  if (!requiredContracts) {
    const save = (id, value, schema, mediaType) => {
      const file = fx.json(`no-contracts/${id}.json`, value);
      return { path: file.path, ref: { artifactId: id, schema, mediaType, digest: file.digest, uri: `fixture://no-contracts/${id}` } };
    };
    const evidence = save("no-contracts-evidence", { fixtureOnly: true, planningDigest: output(planningVerified).contractPlanning.planningDigest },
      "https://devrelay.dev/evidence/approval/v1", "application/json");
    const approval = save("ANA-HOST-NONE", { apiVersion: "devrelay.dev/v1alpha1", kind: "ApprovedNotApplicable", approvalId: "ANA-HOST-NONE",
      purpose: "contract-disposition", rationale: "Synthetic zero-contract approval fixture, not release acceptance.",
      authority: { id: "fixture-owner", role: "human-approver" }, approvalEvidence: [evidence.ref] },
    "https://devrelay.dev/artifacts/approved-not-applicable/v1", "application/vnd.devrelay.approved-not-applicable+json");
    const submission = fx.json("no-contracts/submission.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopContractNotApplicableSubmission",
      planningDigest: output(planningVerified).contractPlanning.planningDigest, approval, artifacts: [evidence] });
    const approvedNone = await executableCommand(nextHost, "resume", { ...designInput,
      checkpointDigest: output(planned).checkpointDigest, contractsNotApplicable: submission });
    assert.equal(approvedNone.exitCode, 5, JSON.stringify(approvedNone));
    assert.equal(output(approvedNone).state.status, "contract-not-applicable-prepared");
    const database = readFileSync(join(root, "state/state.sqlite"));
    const verifiedNone = await executableCommand(nextHost, "verify", { ...designInput, subject: { kind: "checkpoint" } });
    assert.equal(verifiedNone.exitCode, 0, JSON.stringify(verifiedNone));
    assert.equal(output(verifiedNone).contractsNotApplicable.scope, "validated-contract-not-applicable");
    assert.equal(output(verifiedNone).contractExecution, null);
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), database);
    const replayNone = await executableCommand(nextHost, "resume", { ...designInput,
      checkpointDigest: output(approvedNone).checkpointDigest, contractsNotApplicable: submission });
    assert.equal(replayNone.exitCode, 5, JSON.stringify(replayNone));
    assert.equal(output(replayNone).version, output(approvedNone).version);
    const noContractDigest = output(verifiedNone).contractsNotApplicable.commitDigest;
    const activatedNone = await executableCommand(nextHost, "resume", { ...designInput,
      checkpointDigest: output(replayNone).checkpointDigest, activateContractGate: noContractDigest });
    assert.equal(activatedNone.exitCode, 5, JSON.stringify(activatedNone));
    assert.equal(output(activatedNone).state.status, "contracts-activated");
    const activatedDatabase = readFileSync(join(root, "state/state.sqlite"));
    const verifiedActivation = await executableCommand(nextHost, "verify", { ...designInput, subject: { kind: "checkpoint" } });
    assert.equal(verifiedActivation.exitCode, 0, JSON.stringify(verifiedActivation));
    assert.equal(output(verifiedActivation).contractActivation.scope, "approved-contract-state-activation");
    assert.equal(output(verifiedActivation).contractExecution, null);
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), activatedDatabase);
    const replayActivation = await executableCommand(nextHost, "resume", { ...designInput,
      checkpointDigest: output(activatedNone).checkpointDigest, activateContractGate: noContractDigest });
    assert.equal(replayActivation.exitCode, 5, JSON.stringify(replayActivation));
    assert.equal(output(replayActivation).version, output(activatedNone).version);
    const catalog = save("CC-HOST-WORK", { apiVersion: "devrelay.dev/v1alpha1", kind: "CapabilityCatalog", catalogId: "CC-HOST-WORK", version: "1.0.0",
      capabilities: [{ id: "CAP-CODE", name: "Code", type: "code", description: "Synthetic code capability", providerNeutral: true }] },
    "https://devrelay.dev/artifacts/capability-catalog/v1", "application/vnd.devrelay.capability-catalog+json");
    const repository = JSON.parse(readFileSync(nextConfiguration.configurationPath)).artifacts.find(entry =>
      canonicalJsonDigest(entry.ref) === canonicalJsonDigest(design.inputs["repository-snapshot"][0]));
    assert.ok(repository, "work context must retain the exact discovered repository snapshot");
    const workSubmission = fx.json("work/submission.json", { kind: "DesktopWorkContextSubmission", activationDigest: noContractDigest,
      createdAt: "2026-09-14T02:00:00Z", capabilityCatalog: catalog, repositoryContext: repository, artifacts: [] });
    const workPrepared = await executableCommand(nextHost, "resume", { ...designInput,
      checkpointDigest: output(replayActivation).checkpointDigest, prepareWorkBreakdownContext: workSubmission });
    assert.equal(workPrepared.exitCode, 5, JSON.stringify(workPrepared));
    assert.equal(output(workPrepared).state.status, "work-context-prepared");
    const workVerified = await executableCommand(nextHost, "verify", { ...designInput, subject: { kind: "checkpoint" } });
    assert.equal(workVerified.exitCode, 0, JSON.stringify(workVerified));
    assert.equal(output(workVerified).workContext.kind, "DesktopWorkBreakdownContextHandoff");
    const workDigest = output(workVerified).workContext.handoffDigest;
    const workPublished = await executableCommand(nextHost, "resume", { ...designInput,
      checkpointDigest: output(workPrepared).checkpointDigest, materializeWorkBreakdownContext: workDigest });
    assert.equal(workPublished.exitCode, 5, JSON.stringify(workPublished));
    assert.equal(output(workPublished).state.status, "work-context-materialized");
    assert.equal(output(workPublished).nextConfiguration.kind, "DesktopWorkBreakdownContextMaterialization");
    const publishedVerified = await executableCommand(nextHost, "verify", { ...designInput, subject: { kind: "checkpoint" } });
    assert.equal(publishedVerified.exitCode, 0, JSON.stringify(publishedVerified));
    assert.equal(output(publishedVerified).workContextFiles.handoffDigest, workDigest);
    const replayWork = await executableCommand(nextHost, "resume", { ...designInput,
      checkpointDigest: output(workPublished).checkpointDigest, materializeWorkBreakdownContext: workDigest });
    assert.equal(replayWork.exitCode, 5, JSON.stringify(replayWork));
    assert.equal(output(replayWork).version, output(workPublished).version);
    const workHost = { ...nextHost, ...output(workPublished).nextConfiguration };
    const initializedWork = await executableCommand(workHost, "init", configured.input);
    assert.equal(initializedWork.exitCode, 0, JSON.stringify(initializedWork));
    const context = output(workVerified).workContext;
    const workState = JSON.parse(Buffer.from(context.files.find(entry => entry.ref.artifactId === context.state.artifactId).bytesBase64, "base64"));
    const workInvocation = JSON.parse(readFileSync(new URL("../examples/invocations/work-breakdown-establish-001.invocation.json", import.meta.url)));
    workInvocation.invocationId = "desktop-work-from-architecture";
    workInvocation.runId = "desktop-work";
    workInvocation.plugin = { id: "desktop-work-breakdown-fixture", version: "0.1.0" };
    workInvocation.config = {}; workInvocation.grants = [];
    workInvocation.inputs = { "project-work-breakdown-state": [context.state], "routing-decision": [context.route] };
    for (const [port, property] of [["requirements-baseline", "requirementsBaseline"], ["project-overview-baseline", "projectOverviewBaseline"],
      ["architecture-baseline", "architectureBaseline"], ["contract-disposition", "contractDisposition"], ["capability-catalog", "capabilityCatalog"], ["repository-context", "repositoryContext"]]) workInvocation.inputs[port] = [workState[property]];
    const workInput = { ...configured.input, runId: workInvocation.runId, nodeId: workInvocation.nodeId, invocation: fx.json("work/invocation.json", workInvocation) };
    const pendingWork = await executableCommand(workHost, "run", workInput);
    assert.equal(pendingWork.exitCode, 5, JSON.stringify(pendingWork));
    assert.equal(output(pendingWork).state.status, "awaiting-desktop");
    const workConfiguration = JSON.parse(readFileSync(workHost.configurationPath));
    const loadWork = ref => {
      const entry = workConfiguration.artifacts.find(entry => canonicalJsonDigest(entry.ref) === canonicalJsonDigest(ref));
      assert.ok(entry, `missing fixture artifact ${ref.artifactId}`);
      const bytes = readFileSync(resolve(root, entry.path));
      return { ref, bytes, value: JSON.parse(bytes) };
    };
    const loadedWorkInputs = Object.fromEntries(Object.entries(workInvocation.inputs).map(([role, refs]) => [role, refs.map(loadWork)]));
    const modelSection = loadedWorkInputs["architecture-baseline"][0].value.sections.architectureModel;
    const nativeWork = save("NATIVE-WORK-FIXTURE", { fixtureOnly: true }, "https://devrelay.dev/native/desktop-work-fixture/v1", "application/json");
    const candidate = desktopWorkCandidate({ loadedInputs: loadedWorkInputs, nativeRef: nativeWork.ref,
      architectureModelAttachment: modelSection.mode === "attached" ? loadWork(modelSection.artifact) : undefined });
    const candidateFile = save(candidate.draftId, candidate, "https://devrelay.dev/artifacts/work-breakdown-draft/v1", "application/vnd.devrelay.work-breakdown-draft+json");
    const workEvidence = output(await executableCommand(workHost, "evidence", workInput));
    const pendingRequest = workEvidence.pendingRequest;
    const result = { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleResult", invocationId: workInvocation.invocationId, status: "completed", outcome: "decomposed",
      outputs: { "work-breakdown-draft": [candidateFile.ref] }, diagnostics: [],
      evidence: ["work-breakdown/contract-validation", "work-breakdown/source-closure"].map(kind => ({ kind, subject: candidate.draftId, status: "pass", artifact: candidateFile.ref })) };
    const workResponse = fx.json("work/response.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopStepResponse",
      requestId: pendingRequest.requestId, requestDigest: canonicalJsonDigest(pendingRequest), result });
    const completedWork = await executableCommand(workHost, "resume", { ...workInput, checkpointDigest: output(pendingWork).checkpointDigest,
      response: workResponse, artifacts: [candidateFile, nativeWork] });
    assert.equal(completedWork.exitCode, 0, JSON.stringify(completedWork));
    assert.equal(output(completedWork).state.status, "module-completed");
    assert.equal(output(completedWork).lifecycleComplete, false);
    const baselineWork = save("WBB-DESKTOP-FIXTURE", { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkBreakdownBaseline", baselineId: "WBB-DESKTOP-FIXTURE", version: "1.0.0",
      approvedCandidate: candidateFile.ref, inputBindings: candidate.inputBindings, sourceRefs: candidate.sourceRefs,
      workItems: [...candidate.workItems].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      coverageDispositions: [...candidate.coverageDispositions].sort((a, b) => `${a.scopeKind}:${a.scopeRef}` < `${b.scopeKind}:${b.scopeRef}` ? -1 : 1), approvalEvidence: [evidence.ref] },
    "https://devrelay.dev/artifacts/work-breakdown-baseline/v1", "application/vnd.devrelay.work-breakdown-baseline+json");
    const workGateSubmission = fx.json("work/gate.json", { kind: "DesktopWorkBreakdownGateSubmission", baseline: baselineWork, artifacts: [evidence], noWorkApprovals: [] });
    const gatedWork = await executableCommand(workHost, "resume", { ...workInput, checkpointDigest: output(completedWork).checkpointDigest, workBreakdownGate: workGateSubmission });
    assert.equal(gatedWork.exitCode, 5, JSON.stringify(gatedWork));
    assert.equal(output(gatedWork).state.status, "awaiting-work-activation");
    const verifiedWorkGate = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(verifiedWorkGate.exitCode, 0, JSON.stringify(verifiedWorkGate));
    assert.equal(output(verifiedWorkGate).workGate.scope, "validated-work-breakdown-baseline");
    const activateWorkInput = { ...workInput, checkpointDigest: output(gatedWork).checkpointDigest,
      activateWorkBreakdownGate: output(verifiedWorkGate).workGate.commitDigest };
    const activatedWork = await executableCommand(workHost, "resume", activateWorkInput);
    assert.equal(activatedWork.exitCode, 5, JSON.stringify(activatedWork));
    assert.equal(output(activatedWork).state.status, "work-baseline-activated");
    const workDatabase = readFileSync(join(root, "state/state.sqlite"));
    const verifiedWorkActivation = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(verifiedWorkActivation.exitCode, 0, JSON.stringify(verifiedWorkActivation));
    assert.deepEqual(output(verifiedWorkActivation).workActivation.baseline, baselineWork.ref);
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), workDatabase);
    const replayedActivation = await executableCommand(workHost, "resume", { ...activateWorkInput, checkpointDigest: output(activatedWork).checkpointDigest });
    assert.equal(replayedActivation.exitCode, 5, JSON.stringify(replayedActivation));
    assert.equal(output(replayedActivation).version, output(activatedWork).version);
    const dependencySlices = save("CTXS-DESKTOP", { apiVersion: "devrelay.dev/v1alpha1", kind: "ContextSliceSet", sliceSetId: "CTXS-DESKTOP", slices: [] },
      "https://devrelay.dev/artifacts/context-slice-set/v1", "application/vnd.devrelay.context-slice-set+json");
    const wasmFile = fx.write("dependency/policy.wasm", readFileSync(new URL("../policies/work-dependency-analysis/policy.wasm", import.meta.url)));
    const wasm = { path: wasmFile.path, ref: { artifactId: "opa-wda-policy-wasm-0.1.0", schema: "https://devrelay.dev/native/opa-wasm/v1",
      mediaType: "application/wasm", digest: wasmFile.digest, uri: "artifact://desktop-fixture/dependency-policy" } };
    const dependencyPolicy = save("OPA-DESKTOP", { apiVersion: "devrelay.dev/v1alpha1", kind: "OpaPolicyBundle", policyId: "OPA-DESKTOP", version: "0.1.0",
      wasm: wasm.ref, entrypoint: "devrelay/work_dependency/decision", opaCompilerVersion: "1.16.2" },
      "https://devrelay.dev/artifacts/opa-policy-bundle/v1", "application/vnd.devrelay.opa-policy-bundle+json");
    const dependencySubmission = fx.json("dependency/submission.json", { kind: "DesktopDependencyContextSubmission",
      activationDigest: output(verifiedWorkActivation).workActivation.gateCommitDigest, createdAt: "2026-09-14T02:00:00Z",
      contextSliceSet: dependencySlices, policyBundle: dependencyPolicy, artifacts: [wasm] });
    const dependencyPrepared = await executableCommand(workHost, "resume", { ...workInput,
      checkpointDigest: output(activatedWork).checkpointDigest, prepareDependencyContext: dependencySubmission });
    assert.equal(dependencyPrepared.exitCode, 5, JSON.stringify(dependencyPrepared));
    assert.equal(output(dependencyPrepared).state.status, "dependency-context-prepared");
    const dependencyVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(dependencyVerified.exitCode, 0, JSON.stringify(dependencyVerified));
    const dependencyHandoff = output(dependencyVerified).dependencyContext;
    const dependencyPublished = await executableCommand(workHost, "resume", { ...workInput,
      checkpointDigest: output(dependencyPrepared).checkpointDigest, materializeDependencyContext: dependencyHandoff.handoffDigest });
    assert.equal(dependencyPublished.exitCode, 5, JSON.stringify(dependencyPublished));
    assert.equal(output(dependencyPublished).state.status, "dependency-context-materialized");
    const dependencyDatabase = readFileSync(join(root, "state/state.sqlite"));
    const dependencyFilesVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(dependencyFilesVerified.exitCode, 0, JSON.stringify(dependencyFilesVerified));
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), dependencyDatabase);
    const dependencyFiles = output(dependencyFilesVerified).dependencyContextFiles;
    const dependencyHost = { ...workHost, configurationPath: dependencyFiles.configurationPath, configurationDigest: dependencyFiles.configurationDigest };
    const dependencyInitialized = await executableCommand(dependencyHost, "init", { taskId: configured.input.taskId });
    assert.equal(dependencyInitialized.exitCode, 0, JSON.stringify(dependencyInitialized));
    const dependenciesExecuted = await executableCommand(workHost, "resume", { ...workInput,
      checkpointDigest: output(dependencyPublished).checkpointDigest, executeDependencyPlanning: dependencyHandoff.handoffDigest });
    assert.equal(dependenciesExecuted.exitCode, 5, JSON.stringify(dependenciesExecuted));
    assert.equal(output(dependenciesExecuted).state.status, "dependency-candidate-prepared");
    const executedDependencyDatabase = readFileSync(join(root, "state/state.sqlite"));
    const dependenciesVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(dependenciesVerified.exitCode, 0, JSON.stringify(dependenciesVerified));
    assert.equal(output(dependenciesVerified).dependencyExecution.execution.progressionAllowed, true);
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), executedDependencyDatabase);
    const dependenciesReplayed = await executableCommand(workHost, "resume", { ...workInput,
      checkpointDigest: output(dependenciesExecuted).checkpointDigest, executeDependencyPlanning: dependencyHandoff.handoffDigest });
    assert.equal(dependenciesReplayed.exitCode, 5, JSON.stringify(dependenciesReplayed));
    assert.equal(output(dependenciesReplayed).version, output(dependenciesExecuted).version);
    const dependencyResult = output(dependenciesVerified).dependencyExecution.execution;
    const dependencyCandidate = dependencyResult.candidate;
    const dependencyApproval = save("WDA-DESKTOP-APPROVAL", { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkDependencyGateApproval",
      approvalId: "WDA-DESKTOP-APPROVAL", authority: "project-owner", decision: "approve", policyVersion: "work-dependency-gate/0.1.0",
      candidate: dependencyResult.candidateRef, requiredEvidence: [evidence.ref] },
      "https://devrelay.dev/evidence/work-dependency-gate-approval/v1", "application/vnd.devrelay.work-dependency-gate-approval+json");
    const dependencyBaseline = save("WDB-DESKTOP", { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkDependencyBaseline", baselineId: "WDB-DESKTOP", version: "1.0.0",
      approvedCandidate: dependencyResult.candidateRef, workBreakdownBaseline: baselineWork.ref, nodes: dependencyCandidate.nodes, edges: dependencyCandidate.edges,
      graphDigest: dependencyCandidate.graphDigest, topologicalOrder: dependencyCandidate.topologicalOrder,
      policyEvidence: dependencyCandidate.policyDecisionSet, consistencyEvidence: dependencyCandidate.consistencyReview,
      approvalEvidence: [dependencyApproval.ref], sourceRefs: dependencyCandidate.sourceRefs },
      "https://devrelay.dev/artifacts/work-dependency-baseline/v1", "application/vnd.devrelay.work-dependency-baseline+json");
    const dependencyGateSubmission = fx.json("dependency/gate.json", { kind: "DesktopDependencyGateSubmission",
      baseline: dependencyBaseline, approval: dependencyApproval, artifacts: [evidence] });
    const dependencyGated = await executableCommand(workHost, "resume", { ...workInput,
      checkpointDigest: output(dependenciesExecuted).checkpointDigest, dependencyGate: dependencyGateSubmission });
    assert.equal(dependencyGated.exitCode, 5, JSON.stringify(dependencyGated));
    assert.equal(output(dependencyGated).state.status, "awaiting-dependency-activation");
    const dependencyGateDatabase = readFileSync(join(root, "state/state.sqlite"));
    const dependencyGateVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(dependencyGateVerified.exitCode, 0, JSON.stringify(dependencyGateVerified));
    assert.equal(output(dependencyGateVerified).dependencyGate.scope, "validated-work-dependency-baseline");
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), dependencyGateDatabase);
    const dependencyActivationInput = { ...workInput, checkpointDigest: output(dependencyGated).checkpointDigest,
      activateDependencyGate: output(dependencyGateVerified).dependencyGate.commitDigest };
    const dependenciesActivated = await executableCommand(workHost, "resume", dependencyActivationInput);
    assert.equal(dependenciesActivated.exitCode, 5, JSON.stringify(dependenciesActivated));
    assert.equal(output(dependenciesActivated).state.status, "dependency-baseline-activated");
    const dependencyActivationDatabase = readFileSync(join(root, "state/state.sqlite"));
    const dependencyActivationVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(dependencyActivationVerified.exitCode, 0, JSON.stringify(dependencyActivationVerified));
    assert.deepEqual(output(dependencyActivationVerified).dependencyActivation.baseline, dependencyBaseline.ref);
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), dependencyActivationDatabase);
    const dependencyActivationReplayed = await executableCommand(workHost, "resume", { ...dependencyActivationInput, checkpointDigest: output(dependenciesActivated).checkpointDigest });
    assert.equal(dependencyActivationReplayed.exitCode, 5, JSON.stringify(dependencyActivationReplayed));
    assert.equal(output(dependencyActivationReplayed).version, output(dependenciesActivated).version);
    const specialists = save("SC-DESKTOP", { kind: "SpecialistCatalog", catalogId: "SC-DESKTOP", profiles: [{ id: "FIXTURE-CODER",
      capabilityIds: [...new Set(candidate.workItems.flatMap(item => item["required-capabilities"]))], toolIds: [], grantIds: [] }] },
      "https://devrelay.dev/artifacts/specialist-catalog/v1", "application/vnd.devrelay.specialist-catalog+json");
    const assignmentPolicy = save("AP-DESKTOP", { kind: "AssignmentPolicy", policyId: "AP-DESKTOP", workItemRules: [], profilePriorities: [] },
      "https://devrelay.dev/artifacts/assignment-policy/v1", "application/vnd.devrelay.assignment-policy+json");
    const assignmentSubmission = fx.json("assignment/context.json", { kind: "DesktopAssignmentContextSubmission",
      activationDigest: output(dependencyActivationVerified).dependencyActivation.gateCommitDigest, createdAt: "2026-09-14T03:00:00Z",
      specialistCatalog: specialists, assignmentPolicy, artifacts: [] });
    const assignmentPrepared = await executableCommand(workHost, "resume", { ...workInput,
      checkpointDigest: output(dependenciesActivated).checkpointDigest, prepareAssignmentContext: assignmentSubmission });
    assert.equal(assignmentPrepared.exitCode, 5, JSON.stringify(assignmentPrepared));
    assert.equal(output(assignmentPrepared).state.status, "assignment-context-prepared");
    const assignmentDatabase = readFileSync(join(root, "state/state.sqlite"));
    const assignmentVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(assignmentVerified.exitCode, 0, JSON.stringify(assignmentVerified));
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), assignmentDatabase);
    const assignmentHandoff = output(assignmentVerified).assignmentContext;
    assert.equal(assignmentHandoff.plan.module.version, "3.0.0");
    for (const role of ["project-memory-baseline", "current-synopsis", "project-overview", "requirements-baseline"]) {
      assert.deepEqual(assignmentHandoff.snapshot.bindings.find(entry => entry.role === role), dependencyHandoff.snapshot.bindings.find(entry => entry.role === role));
    }
    const assignmentPublished = await executableCommand(workHost, "resume", { ...workInput,
      checkpointDigest: output(assignmentPrepared).checkpointDigest, materializeAssignmentContext: assignmentHandoff.handoffDigest });
    assert.equal(assignmentPublished.exitCode, 5, JSON.stringify(assignmentPublished));
    assert.equal(output(assignmentPublished).state.status, "assignment-context-materialized");
    const assignmentFilesDatabase = readFileSync(join(root, "state/state.sqlite"));
    const assignmentFilesVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(assignmentFilesVerified.exitCode, 0, JSON.stringify(assignmentFilesVerified));
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), assignmentFilesDatabase);
    const assignmentFiles = output(assignmentFilesVerified).assignmentContextFiles;
    assert.deepEqual(output(assignmentPublished).nextConfiguration, assignmentFiles);
    const assignmentHost = { ...workHost, configurationPath: assignmentFiles.configurationPath, configurationDigest: assignmentFiles.configurationDigest };
    const assignmentInitialized = await executableCommand(assignmentHost, "init", { taskId: configured.input.taskId });
    assert.equal(assignmentInitialized.exitCode, 0, JSON.stringify(assignmentInitialized));
    const assignmentExecutionInput = { ...workInput, checkpointDigest: output(assignmentPublished).checkpointDigest,
      executeAssignment: assignmentHandoff.handoffDigest };
    const assignmentExecuted = await executableCommand(workHost, "resume", assignmentExecutionInput);
    assert.equal(assignmentExecuted.exitCode, 5, JSON.stringify(assignmentExecuted));
    assert.equal(output(assignmentExecuted).state.status, "assignment-candidate-prepared");
    const assignmentExecutionDatabase = readFileSync(join(root, "state/state.sqlite"));
    const assignmentExecutionVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(assignmentExecutionVerified.exitCode, 0, JSON.stringify(assignmentExecutionVerified));
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), assignmentExecutionDatabase);
    assert.equal(output(assignmentExecutionVerified).assignmentExecution.execution.outcome, "assigned");
    assert.equal(output(assignmentExecutionVerified).assignmentExecution.execution.draft.value.assignments.length, candidate.workItems.length);
    const assignmentReplayed = await executableCommand(workHost, "resume", { ...assignmentExecutionInput, checkpointDigest: output(assignmentExecuted).checkpointDigest });
    assert.equal(assignmentReplayed.exitCode, 5, JSON.stringify(assignmentReplayed));
    assert.equal(output(assignmentReplayed).version, output(assignmentExecuted).version);
    const assignedExecution = output(assignmentExecutionVerified).assignmentExecution;
    const assignmentApproval = save("SA-APPROVAL-DESKTOP", { apiVersion: "devrelay.dev/v1alpha1", kind: "SpecialistAssignmentGateApproval",
      approvalId: "SA-APPROVAL-DESKTOP", authority: "project-owner", decision: "approve", policyVersion: "specialist-assignment-gate/3.0.0",
      candidate: assignedExecution.execution.draft.ref, checkpointDigest: assignedExecution.checkpointDigest,
      executionFingerprint: assignedExecution.execution.executionFingerprint, requiredEvidence: [evidence.ref] },
      "https://devrelay.dev/evidence/specialist-assignment-gate-approval/v3", "application/vnd.devrelay.specialist-assignment-gate-approval+json");
    const assignmentGateSubmission = fx.json("assignment/gate.json", { kind: "DesktopAssignmentGateSubmission", approval: assignmentApproval, artifacts: [evidence] });
    const assignmentGated = await executableCommand(workHost, "resume", { ...workInput,
      checkpointDigest: output(assignmentExecuted).checkpointDigest, assignmentGate: assignmentGateSubmission });
    assert.equal(assignmentGated.exitCode, 5, JSON.stringify(assignmentGated));
    assert.equal(output(assignmentGated).state.status, "awaiting-assignment-activation");
    const assignmentGateDatabase = readFileSync(join(root, "state/state.sqlite"));
    const assignmentGateVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(assignmentGateVerified.exitCode, 0, JSON.stringify(assignmentGateVerified));
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), assignmentGateDatabase);
    assert.equal(output(assignmentGateVerified).assignmentGate.baseline.value.version, "3.0.0");
    const assignmentActivationInput = { ...workInput, checkpointDigest: output(assignmentGated).checkpointDigest,
      activateAssignmentGate: output(assignmentGateVerified).assignmentGate.commitDigest };
    const assignmentActivated = await executableCommand(workHost, "resume", assignmentActivationInput);
    assert.equal(assignmentActivated.exitCode, 5, JSON.stringify(assignmentActivated));
    assert.equal(output(assignmentActivated).state.status, "assignment-baseline-activated");
    const assignmentActivationDatabase = readFileSync(join(root, "state/state.sqlite"));
    const assignmentActivationVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(assignmentActivationVerified.exitCode, 0, JSON.stringify(assignmentActivationVerified));
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), assignmentActivationDatabase);
    assert.deepEqual(output(assignmentActivationVerified).assignmentActivation.baseline, output(assignmentGateVerified).assignmentGate.baseline.ref);
    const assignmentActivationReplayed = await executableCommand(workHost, "resume", { ...assignmentActivationInput,
      checkpointDigest: output(assignmentActivated).checkpointDigest });
    assert.equal(assignmentActivationReplayed.exitCode, 5, JSON.stringify(assignmentActivationReplayed));
    assert.equal(output(assignmentActivationReplayed).version, output(assignmentActivated).version);
    const queueInput = { ...workInput, checkpointDigest: output(assignmentActivationReplayed).checkpointDigest,
      prepareWorkQueue: output(assignmentGateVerified).assignmentGate.commitDigest };
    const queue = await executableCommand(workHost, "resume", queueInput);
    assert.equal(queue.exitCode, 5, JSON.stringify(queue));
    assert.equal(output(queue).state.status, "work-queue-prepared");
    const queueDatabase = readFileSync(join(root, "state/state.sqlite"));
    const queueVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(queueVerified.exitCode, 0, JSON.stringify(queueVerified));
    assert.ok(output(queueVerified).workReadiness.readyWorkItemIds.length > 0);
    assert.equal(output(queueVerified).workReadiness.ledgerVersion, 0);
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), queueDatabase);
    const queueReplayed = await executableCommand(workHost, "resume", { ...queueInput, checkpointDigest: output(queue).checkpointDigest });
    assert.equal(queueReplayed.exitCode, 5, JSON.stringify(queueReplayed));
    assert.equal(output(queueReplayed).version, output(queue).version);
    const ready = output(queueVerified).workReadiness;
    const qualityItem = candidate.workItems.find(item => item.id === ready.readyWorkItemIds[0]);
    assert.ok(qualityItem);
    // Fixture-only policy approval; this is not human release acceptance.
    const policyCandidate = createQualityPolicyCandidate({ policyId: "QP-DESKTOP-FIXTURE", version: "1.0.0",
      rules: [{ id: "FIXTURE-WORK-TYPE", appliesTo: { workTypes: [qualityItem["work-type"]] },
        obligations: [{ id: "fixture-independent-review", lane: "review", evidenceKinds: ["review/independent"], independent: true }] }] });
    const qualityPolicy = promoteQualityPolicyBaseline({ candidate: policyCandidate, approval: { kind: "QualityPolicyGateApproval",
      authority: "fixture-owner", decision: "approve", candidateDigest: policyCandidate.candidateDigest } });
    const policySchema = "https://devrelay.dev/contracts/quality-policy-artifacts.schema.json";
    const policyCandidateFile = save(policyCandidate.policyId, policyCandidate, policySchema, "application/json");
    const policyApprovalFile = save("QUALITY-APPROVAL", qualityPolicy.approval, `${policySchema}#/oneOf/4/properties/approval`, "application/json");
    const policySubmission = fx.json("quality/policy-submission.json", { kind: "DesktopQualityPolicySubmission",
      candidate: policyCandidateFile, approval: policyApprovalFile, previousBaseline: null });
    const expectedPolicyGate = await prepareLocalQualityPolicyGate({ candidateRef: policyCandidateFile.ref, approvalRef: policyApprovalFile.ref,
      loadArtifact: ref => readFileSync(join(root, ref.digest === policyCandidateFile.ref.digest ? policyCandidateFile.path : policyApprovalFile.path)) });
    const policyPrepared = await executableCommand(workHost, "resume", { ...workInput, checkpointDigest: output(queueReplayed).checkpointDigest,
      qualityPolicyGate: policySubmission });
    assert.equal(policyPrepared.exitCode, 5, JSON.stringify(policyPrepared));
    assert.equal(output(policyPrepared).state.status, "quality-policy-prepared");
    const policyActivated = await executableCommand(workHost, "resume", { ...workInput, checkpointDigest: output(policyPrepared).checkpointDigest,
      activateQualityPolicy: expectedPolicyGate.preparationDigest });
    assert.equal(policyActivated.exitCode, 5, JSON.stringify(policyActivated));
    assert.equal(output(policyActivated).state.status, "quality-policy-activated");
    const qualityPolicyFile = { path: "quality/activated-policy.json", ref: expectedPolicyGate.baseline.ref };
    writeFileSync(join(root, qualityPolicyFile.path), Buffer.from(expectedPolicyGate.baseline.bytesBase64, "base64"));
    const qualityContext = createQualityPolicyContext({ acceptanceCriteria: qualityItem["acceptance-criterion-refs"] });
    const qualityContextFile = save("QC-DESKTOP-FIXTURE", qualityContext, "https://devrelay.dev/contracts/quality-policy-artifacts.schema.json", "application/json");
    const qualitySubmission = fx.json("quality/submission.json", { kind: "DesktopWorkQualitySubmission", readinessDigest: ready.readinessDigest,
      workItemId: qualityItem.id, qualityPolicy: qualityPolicyFile, qualityContext: qualityContextFile, artifacts: [] });
    const qualityInput = { ...workInput, checkpointDigest: output(policyActivated).checkpointDigest, prepareWorkQuality: qualitySubmission };
    const quality = await executableCommand(workHost, "resume", qualityInput);
    assert.equal(quality.exitCode, 5, JSON.stringify(quality));
    assert.equal(output(quality).state.status, "work-quality-prepared");
    const qualityDatabase = readFileSync(join(root, "state/state.sqlite"));
    const qualityVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(qualityVerified.exitCode, 0, JSON.stringify(qualityVerified));
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), qualityDatabase);
    const handoffQuality = output(qualityVerified).workQuality[qualityItem.id];
    assert.deepEqual(handoffQuality.prepared.resolution.appliedRuleIds, ["FIXTURE-WORK-TYPE"]);
    assert.deepEqual(handoffQuality.prepared.resolution.acceptanceCriterionIds, [...qualityItem["acceptance-criterion-refs"]].sort());
    const qualityReplayed = await executableCommand(workHost, "resume", { ...qualityInput, checkpointDigest: output(quality).checkpointDigest });
    assert.equal(qualityReplayed.exitCode, 5, JSON.stringify(qualityReplayed));
    assert.equal(output(qualityReplayed).version, output(quality).version);
    const unchangedQueue = await executableCommand(workHost, "resume", { ...queueInput, checkpointDigest: output(qualityReplayed).checkpointDigest });
    assert.equal(unchangedQueue.exitCode, 5, JSON.stringify(unchangedQueue));
    assert.equal(output(unchangedQueue).state.status, "work-quality-prepared");
    assert.equal(output(unchangedQueue).version, output(quality).version);
    const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(
      Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
    const assignmentBaseline = output(queueVerified).assignmentGate.baseline;
    const selected = assignmentBaseline.value.assignments.find(item => item.workItemRef === qualityItem.id);
    assert.ok(selected);
    const executorConfigurationDigest = canonicalJsonDigest({ fixtureExecutor: true });
    const executionPolicyValue = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "ExecutionPolicy", policyId: "EP-HOST-FIXTURE",
      version: "1.0.0", timeoutMilliseconds: 120000, allowedPermissions: [],
      outputPolicy: { maxEvidenceBytes: 1000000, maxNativeArtifactBytes: 1000000 } }, "policyDigest");
    const executionPolicyFile = save(executionPolicyValue.policyId, executionPolicyValue,
      "https://devrelay.dev/artifacts/execution-policy/v1", "application/vnd.devrelay.execution-policy+json");
    const bindingValue = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "ExecutionBinding", bindingId: "BIND-HOST-FIXTURE",
      workItemId: qualityItem.id, specialistProfileId: selected.specialistProfileRef, assignmentBaseline: assignmentBaseline.ref,
      executor: { id: "executor.desktop-fixture", version: "1.0.0" }, requiredCapabilities: selected.capabilityCoverage,
      requiredTools: selected.requiredTools, permissionDemands: [], executionPolicy: executionPolicyFile.ref,
      configurationDigest: executorConfigurationDigest }, "bindingDigest");
    const executionBindingFile = save(bindingValue.bindingId, bindingValue,
      "https://devrelay.dev/artifacts/execution-binding/v1", "application/vnd.devrelay.execution-binding+json");
    // Repository input is fixture evidence; no native workspace/worker is launched.
    const executionRepository = JSON.parse(readFileSync(new URL("../examples/artifacts/repository-snapshot-001.json", import.meta.url)));
    const executionRepositoryFile = save("REPOSITORY-EXECUTION-FIXTURE", executionRepository,
      "https://devrelay.dev/artifacts/repository-snapshot/v1", "application/vnd.devrelay.repository-snapshot+json");
    const executionSubmission = fx.json("execution/submission.json", { kind: "DesktopWorkExecutionSubmission",
      readinessDigest: ready.readinessDigest, qualityPreparationDigest: handoffQuality.preparationDigest,
      workItemId: qualityItem.id, attemptId: "ATT-HOST-EXECUTION", executionBinding: executionBindingFile,
      executionPolicy: executionPolicyFile, repositorySnapshot: executionRepositoryFile,
      workspaceBaseDigest: executionRepository.treeDigest, executorConfigurationDigest });
    const executionInput = { ...workInput, checkpointDigest: output(unchangedQueue).checkpointDigest, prepareWorkExecution: executionSubmission };
    const preparedExecution = await executableCommand(workHost, "resume", executionInput);
    assert.equal(preparedExecution.exitCode, 5, JSON.stringify(preparedExecution));
    assert.equal(output(preparedExecution).state.status, "work-execution-prepared");
    const preparedDatabase = readFileSync(join(root, "state/state.sqlite"));
    const executionVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(executionVerified.exitCode, 0, JSON.stringify(executionVerified));
    const preparedRecord = output(executionVerified).workExecutionPreparations["ATT-HOST-EXECUTION"];
    assert.equal(preparedRecord.dispatchAuthorized, false);
    const preparedInvocation = JSON.parse(Buffer.from(preparedRecord.artifacts.invocation.bytesBase64, "base64"));
    assert.equal(preparedInvocation.workItem.id, qualityItem.id);
    assert.deepEqual(preparedInvocation.executionBinding, executionBindingFile.ref);
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), preparedDatabase);
    const executionReplay = await executableCommand(workHost, "resume", { ...executionInput, checkpointDigest: output(preparedExecution).checkpointDigest });
    assert.equal(executionReplay.exitCode, 5, JSON.stringify(executionReplay));
    assert.equal(output(executionReplay).version, output(preparedExecution).version);
    const changedSubmission = JSON.parse(readFileSync(join(root, executionSubmission.path)));
    changedSubmission.workspaceBaseDigest = canonicalJsonDigest({ anotherWorkspace: true });
    const changedFile = fx.json("execution/changed-submission.json", changedSubmission);
    const rebound = await executableCommand(workHost, "resume", { ...executionInput,
      checkpointDigest: output(executionReplay).checkpointDigest, prepareWorkExecution: changedFile });
    assert.equal(rebound.exitCode, 6, JSON.stringify(rebound));
    assert.match(rebound.diagnostics[0].message, /attempt already binds/);
    assert.equal(output(await executableCommand(workHost, "status", workInput)).version, output(preparedExecution).version);
    const claimRequest = { attemptId: "ATT-HOST-EXECUTION", preparationDigest: preparedRecord.preparationDigest,
      owner: "desktop-fixture", leaseExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
      expectedHostVersion: 0, expectedIndexRevision: 0 };
    const claimInput = { ...workInput, checkpointDigest: output(executionReplay).checkpointDigest, claimWorkExecution: claimRequest };
    const claimedExecution = await executableCommand(workHost, "resume", claimInput);
    assert.equal(claimedExecution.exitCode, 5, JSON.stringify(claimedExecution));
    assert.equal(output(claimedExecution).state.status, "work-execution-claimed");
    const claimedDatabase = readFileSync(join(root, "state/state.sqlite"));
    const claimVerified = await executableCommand(workHost, "verify", { ...workInput, subject: { kind: "checkpoint" } });
    assert.equal(claimVerified.exitCode, 0, JSON.stringify(claimVerified));
    const claimRecord = output(claimVerified).workClaims[claimRequest.attemptId];
    assert.deepEqual(claimRecord.request, claimRequest);
    assert.equal(claimRecord.dispatchAuthorized, false);
    assert.equal(claimRecord.result.hostVersion, 1);
    assert.equal(claimRecord.result.indexRevision, 1);
    assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), claimedDatabase);
    const claimReplay = await executableCommand(workHost, "resume", { ...claimInput,
      checkpointDigest: output(claimedExecution).checkpointDigest });
    assert.equal(claimReplay.exitCode, 5, JSON.stringify(claimReplay));
    assert.equal(output(claimReplay).version, output(claimedExecution).version);
    const substitutedClaim = await executableCommand(workHost, "resume", { ...claimInput,
      checkpointDigest: output(claimReplay).checkpointDigest, claimWorkExecution: { ...claimRequest, owner: "different-owner" } });
    assert.notEqual(substitutedClaim.exitCode, 5, JSON.stringify(substitutedClaim));
    assert.match(substitutedClaim.diagnostics[0].message, /original claim evidence/);
    assert.equal(output(await executableCommand(workHost, "status", workInput)).version, output(claimedExecution).version);
    return;
  }
  const planningDigest = output(planningVerified).contractPlanning.planningDigest;
  const generated = await executableCommand(nextHost, "resume", { ...designInput,
    checkpointDigest: output(planned).checkpointDigest, executeContracts: planningDigest });
  assert.equal(generated.exitCode, 5, JSON.stringify(generated));
  assert.equal(output(generated).state.status, "contract-candidate-prepared");
  const contractDatabase = readFileSync(join(root, "state/state.sqlite"));
  const contractVerified = await executableCommand(nextHost, "verify", { ...designInput, subject: { kind: "checkpoint" } });
  assert.equal(contractVerified.exitCode, 0, JSON.stringify(contractVerified));
  assert.equal(output(contractVerified).contractExecution.execution.candidate.kind, "ContractDraftSet");
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), contractDatabase);
  const contractReplay = await executableCommand(nextHost, "resume", { ...designInput,
    checkpointDigest: output(generated).checkpointDigest, executeContracts: planningDigest });
  assert.equal(contractReplay.exitCode, 5, JSON.stringify(contractReplay));
  assert.equal(output(contractReplay).version, output(generated).version);
  const contractGateSubmission = materializeContractGateSubmission(fx, output(contractVerified).contractExecution.execution);
  const contractApproved = await executableCommand(nextHost, "resume", { ...designInput,
    checkpointDigest: output(generated).checkpointDigest, contractGate: contractGateSubmission });
  assert.equal(contractApproved.exitCode, 5, JSON.stringify(contractApproved));
  assert.equal(output(contractApproved).state.status, "awaiting-contract-activation");
  const gateDatabase = readFileSync(join(root, "state/state.sqlite"));
  const contractGateVerified = await executableCommand(nextHost, "verify", { ...designInput, subject: { kind: "checkpoint" } });
  assert.equal(contractGateVerified.exitCode, 0, JSON.stringify(contractGateVerified));
  assert.equal(output(contractGateVerified).contractGate.scope, "validated-contract-baseline");
  assert.equal(output(contractGateVerified).contractGate.lifecycleComplete, false);
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), gateDatabase);
  const contractApprovalReplay = await executableCommand(nextHost, "resume", { ...designInput,
    checkpointDigest: output(contractApproved).checkpointDigest, contractGate: contractGateSubmission });
  assert.equal(contractApprovalReplay.exitCode, 5, JSON.stringify(contractApprovalReplay));
  assert.equal(output(contractApprovalReplay).version, output(contractApproved).version);
  const contractGateDigest = output(contractGateVerified).contractGate.commitDigest;
  const contractsActivated = await executableCommand(nextHost, "resume", { ...designInput,
    checkpointDigest: output(contractApproved).checkpointDigest, activateContractGate: contractGateDigest });
  assert.equal(contractsActivated.exitCode, 5, JSON.stringify(contractsActivated));
  assert.equal(output(contractsActivated).state.status, "contracts-activated");
  const contractsDatabase = readFileSync(join(root, "state/state.sqlite"));
  const contractsVerified = await executableCommand(nextHost, "verify", { ...designInput, subject: { kind: "checkpoint" } });
  assert.equal(contractsVerified.exitCode, 0, JSON.stringify(contractsVerified));
  assert.equal(output(contractsVerified).contractActivation.scope, "approved-contract-state-activation");
  assert.deepEqual(readFileSync(join(root, "state/state.sqlite")), contractsDatabase);
  const contractsReplay = await executableCommand(nextHost, "resume", { ...designInput,
    checkpointDigest: output(contractsActivated).checkpointDigest, activateContractGate: contractGateDigest });
  assert.equal(contractsReplay.exitCode, 5, JSON.stringify(contractsReplay));
  assert.equal(output(contractsReplay).version, output(contractsActivated).version);
  }
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

test("separate work and dependency controls admit facade bindings but reject mixed commands", async (t) => {
  const fx = fixture(t);
  assert.equal((await command(fx, "init")).exitCode, 0);
  const pending = await command(fx, "run");
  assert.equal(pending.exitCode, 5, JSON.stringify(pending));
  const request = { ...fx.input, checkpointDigest: output(pending).checkpointDigest };
  for (const control of ["activateWorkBreakdownGate", "executeDependencyPlanning", "materializeAssignmentContext", "executeAssignment", "activateAssignmentGate", "prepareWorkQueue"]) {
    const validShape = await command(fx, "resume", { ...request, [control]: `sha256:${"a".repeat(64)}` });
    assert.notEqual(validShape.exitCode, 0, "request shape does not confer missing Gate or context authority");
    assert.ok(validShape.diagnostics.length, JSON.stringify(validShape));
    assert.doesNotMatch(validShape.diagnostics[0].message, /requires a separate/, JSON.stringify(validShape));
    const mixed = await command(fx, "resume", { ...request, [control]: `sha256:${"a".repeat(64)}`, response: { unrelated: true } });
    assert.equal(mixed.exitCode, 2, JSON.stringify(mixed));
    assert.match(mixed.diagnostics[0].message, /requires a separate/);
    const malformed = await command(fx, "resume", { ...request, [control]: "not-a-digest" });
    assert.equal(malformed.exitCode, 2, JSON.stringify(malformed));
  }
  assert.equal(output(await command(fx, "status")).checkpointDigest, request.checkpointDigest);
});

test("Desktop quality command rejects missing queue authority and mixed or open submissions", async t => {
  const fx = fixture(t);
  assert.equal((await command(fx, "init")).exitCode, 0);
  const pending = await command(fx, "run");
  assert.equal(pending.exitCode, 5);
  const digest = `sha256:${"a".repeat(64)}`;
  const ref = { artifactId: "QUALITY", digest, schema: "https://devrelay.dev/contracts/quality-policy-artifacts.schema.json", mediaType: "application/json", uri: "memory://quality" };
  const submission = { kind: "DesktopWorkQualitySubmission", readinessDigest: digest, workItemId: "WI-ONE",
    qualityPolicy: { path: "policy.json", ref }, qualityContext: { path: "context.json", ref }, artifacts: [] };
  const path = join(fx.root, "quality-submission.json");
  writeFileSync(path, JSON.stringify(submission));
  const input = { ...fx.input, checkpointDigest: output(pending).checkpointDigest,
    prepareWorkQuality: { path: "quality-submission.json", digest: sha256Digest(readFileSync(path)) } };
  const missing = await command(fx, "resume", input);
  assert.equal(missing.exitCode, 6, JSON.stringify(missing));
  assert.match(missing.diagnostics[0].message, /exact activated policy/);
  const mixed = await command(fx, "resume", { ...input, response: {} });
  assert.equal(mixed.exitCode, 2);
  assert.match(mixed.diagnostics[0].message, /separate/);
  writeFileSync(path, JSON.stringify({ ...submission, approved: true }));
  input.prepareWorkQuality.digest = sha256Digest(readFileSync(path));
  const open = await command(fx, "resume", input);
  assert.equal(open.exitCode, 2);
  assert.match(open.diagnostics[0].message, /closed contract/);
  assert.equal(output(await command(fx, "status")).checkpointDigest, input.checkpointDigest);
  const executionSubmission = { kind: "DesktopWorkExecutionSubmission", readinessDigest: digest, qualityPreparationDigest: digest,
    workItemId: "WI-ONE", attemptId: "ATT-ONE", workspaceBaseDigest: digest, executorConfigurationDigest: digest,
    executionBinding: { path: "binding.json", ref }, executionPolicy: { path: "execution-policy.json", ref }, repositorySnapshot: { path: "repository.json", ref } };
  writeFileSync(path, JSON.stringify(executionSubmission));
  const executionInput = { ...fx.input, checkpointDigest: input.checkpointDigest,
    prepareWorkExecution: { path: "quality-submission.json", digest: sha256Digest(readFileSync(path)) } };
  const missingExecution = await command(fx, "resume", executionInput);
  assert.equal(missingExecution.exitCode, 6, JSON.stringify(missingExecution));
  assert.match(missingExecution.diagnostics[0].message, /exact ready work and activated quality/);
  const mixedExecution = await command(fx, "resume", { ...executionInput, response: {} });
  assert.equal(mixedExecution.exitCode, 2);
  const claimInput = { ...fx.input, checkpointDigest: input.checkpointDigest,
    claimWorkExecution: { attemptId: "ATT-MISSING", preparationDigest: digest, owner: "fixture-owner",
      leaseExpiresAt: Date.now() + 60000, expectedHostVersion: 0, expectedIndexRevision: 0 } };
  const missingClaim = await command(fx, "resume", claimInput);
  assert.equal(missingClaim.exitCode, 6, JSON.stringify(missingClaim));
  assert.match(missingClaim.diagnostics[0].message, /exact saved preparation/);
  const openClaim = await command(fx, "resume", { ...claimInput, claimWorkExecution: { ...claimInput.claimWorkExecution, fingerprint: digest } });
  assert.equal(openClaim.exitCode, 2, JSON.stringify(openClaim));
  assert.equal(output(await command(fx, "status")).checkpointDigest, input.checkpointDigest);
});

test("Desktop quality policy controls prepare, activate and replay exact approval evidence", async t => {
  const fx = fixture(t);
  await command(fx, "init");
  const pending = await command(fx, "run");
  const candidate = createQualityPolicyCandidate({ policyId: "QP-CONTROL", version: "1.0.0",
    rules: [{ id: "TEST", obligations: [{ id: "test", lane: "test", evidenceKinds: ["test/pass"] }] }] });
  const approval = { kind: "QualityPolicyGateApproval", authority: "fixture-owner", decision: "approve", candidateDigest: candidate.candidateDigest };
  const owner = "https://devrelay.dev/contracts/quality-policy-artifacts.schema.json";
  const save = (value, id, schema) => {
    const bytes = Buffer.from(JSON.stringify(value)); const file = `${id}.json`;
    writeFileSync(join(fx.root, file), bytes);
    return { path: file, ref: { artifactId: id, schema, mediaType: "application/json", digest: sha256Digest(bytes), uri: `fixture://${id}` } };
  };
  const candidateFile = save(candidate, candidate.policyId, owner);
  const approvalFile = save(approval, "APP-CONTROL", `${owner}#/oneOf/4/properties/approval`);
  const submission = { kind: "DesktopQualityPolicySubmission", candidate: candidateFile, approval: approvalFile, previousBaseline: null };
  const bytes = Buffer.from(JSON.stringify(submission));
  writeFileSync(join(fx.root, "policy-submission.json"), bytes);
  const input = { ...fx.input, checkpointDigest: output(pending).checkpointDigest,
    qualityPolicyGate: { path: "policy-submission.json", digest: sha256Digest(bytes) } };
  const prepared = await command(fx, "resume", input);
  assert.equal(prepared.exitCode, 5, JSON.stringify(prepared));
  const expected = await prepareLocalQualityPolicyGate({ candidateRef: candidateFile.ref, approvalRef: approvalFile.ref,
    loadArtifact: ref => readFileSync(join(fx.root, ref.digest === candidateFile.ref.digest ? candidateFile.path : approvalFile.path)) });
  const activationInput = { ...fx.input, checkpointDigest: output(prepared).checkpointDigest, activateQualityPolicy: expected.preparationDigest };
  const activated = await command(fx, "resume", activationInput);
  assert.equal(activated.exitCode, 5, JSON.stringify(activated));
  assert.equal(output(activated).state.status, "quality-policy-activated");
  const replay = await command(fx, "resume", { ...activationInput, checkpointDigest: output(activated).checkpointDigest });
  assert.equal(replay.exitCode, 5, JSON.stringify(replay));
  assert.equal(output(replay).version, output(activated).version);
  const stale = await command(fx, "resume", { ...activationInput, checkpointDigest: output(replay).checkpointDigest,
    activateQualityPolicy: `sha256:${"a".repeat(64)}` });
  assert.equal(stale.exitCode, 6, JSON.stringify(stale));
  const databaseBefore = readFileSync(join(fx.root, "state/state.sqlite"));
  const evidence = await command(fx, "evidence", fx.input);
  assert.equal(evidence.exitCode, 0, JSON.stringify(evidence));
  assert.equal(output(evidence).qualityPolicyGate.preparationDigest, expected.preparationDigest);
  assert.deepEqual(output(evidence).qualityPolicyActivation.baseline, expected.baseline.ref);
  assert.equal(output(evidence).qualityPolicyActivation.dispatchAuthorized, false);
  assert.deepEqual(readFileSync(join(fx.root, "state/state.sqlite")), databaseBefore);
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

test("assignment verification uses the replay invocation and reports missing lineage without a scope error", async t => {
  const fx = fixture(t);
  assert.equal((await command(fx, "init")).exitCode, 0);
  const waiting = output(await command(fx, "run"));
  const response = fx.json("scope-response.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopStepResponse",
    requestId: waiting.desktopRequest.requestId, requestDigest: canonicalJsonDigest(waiting.desktopRequest), result: fx.result });
  const completed = await command(fx, "resume", { ...fx.input, checkpointDigest: waiting.checkpointDigest, response });
  assert.equal(completed.exitCode, 0, JSON.stringify(completed));
  // Deliberately incomplete lineage must reach the owning guard, not ReferenceError.
  const storage = createLocalHostStorage({ rootDirectory: join(fx.root, "state") });
  try {
    const run = storage.listRuns().find(entry => entry.state.recordKey && entry.state.invocationKey);
    assert.ok(run);
    const lease = storage.acquireLease({ runId: run.runId, owner: "scope-regression", expectedVersion: run.version });
    storage.commitTransition({ runId: run.runId, expectedVersion: run.version, leaseToken: lease.token,
      transition: { kind: "FixtureMissingAssignmentLineage" }, nextState: { ...run.state, assignmentContextKey: "missing-assignment" } });
    storage.releaseLease({ runId: run.runId, leaseToken: lease.token });
  } finally { storage.close(); }
  const before = readFileSync(join(fx.root, "state/state.sqlite"));
  const verified = await command(fx, "verify", { ...fx.input, subject: { kind: "checkpoint" } });
  assert.notEqual(verified.exitCode, 0);
  assert.match(verified.diagnostics[0].message, /assignment context requires an activated dependency baseline/);
  assert.doesNotMatch(verified.diagnostics[0].message, /not defined/);
  assert.deepEqual(readFileSync(join(fx.root, "state/state.sqlite")), before);
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
