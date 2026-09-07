import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createCrossCuttingCompositionPlan, executeCrossCuttingBoundary } from "../src/cross-cutting-composition.mjs";
import { createDesktopOrchestrationPlan } from "../src/desktop-orchestration.mjs";
import { createDesktopTaskAdapter, createDesktopTaskPlan } from "../src/desktop-task-adapter.mjs";
import { createDesktopOperatorSnapshot } from "../src/desktop-operator-view.mjs";
import { loadDesktopProjectMemoryBootstrap } from "../src/desktop-project-memory-bootstrap.mjs";
import { createDurableGitWorktreeManager } from "../src/durable-worktree-manager.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { createProjectControlSnapshot, createProjectControlSourceBundle } from "../src/project-control.mjs";
import { createQualityPolicyCandidate, createQualityPolicyContext, evaluateQualityEvidence, promoteQualityPolicyBaseline, resolveQualityObligations } from "../src/quality-policy.mjs";
import { claimWorkAttempt, createDurableWorkContinuityStore, createWorkFingerprintInput, deriveWorkFingerprint, findExactWorkReuse, transitionWorkAttempt } from "../src/work-continuity.mjs";
import { resolveWorkflowProfile } from "../src/workflow-profiles.mjs";

const digest = (value) => canonicalJsonDigest({ value });
const sourceRoot = path.resolve(new URL("../", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)));
const loadJson = (relativePath) => JSON.parse(readFileSync(path.join(sourceRoot, relativePath), "utf8"));
const moduleDefinitions = ["quality-policy", "work-continuity", "project-control"].map((id) => loadJson(`examples/modules/${id}.module.json`));

test("quick, standard, and assurance Desktop scenarios preserve memory, isolation, quality, continuity, and operator evidence end to end", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "devrelay-qc-e2e-"));
  const repository = path.join(root, "repository");
  const worktreeRoot = path.join(root, "worktrees");
  const stateRoot = path.join(root, "state");
  execFileSync("git", ["init", repository], { stdio: "ignore", windowsHide: true });
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true }).trim();
  git(repository, "config", "user.name", "DevRelay QC Test");
  git(repository, "config", "user.email", "devrelay-qc@invalid");
  git(repository, "config", "core.autocrlf", "false");
  writeFileSync(path.join(repository, "quality.txt"), "base\n", "utf8");
  git(repository, "add", "quality.txt");
  git(repository, "commit", "-m", "base");
  const revision = git(repository, "rev-parse", "HEAD");
  let storage = createLocalHostStorage({ rootDirectory: stateRoot });
  t.after(() => { try { storage.close(); } catch {} rmSync(root, { recursive: true, force: true }); });
  const worktrees = createDurableGitWorktreeManager({ repositoryPath: repository, worktreeRoot, storage });
  let continuity = createDurableWorkContinuityStore({ storage, projectId: "devrelay-e2e" });
  const qualityCandidate = createQualityPolicyCandidate({ policyId: "QP-E2E", version: "1.0.0", rules: [{ id: "RULE-DEFAULT", obligations: [{ id: "focused-test", lane: "focused", evidenceKinds: ["test/focused"] }, { id: "independent-review", lane: "review", evidenceKinds: ["review/adversarial"], independent: true }] }] });
  const qualityBaseline = promoteQualityPolicyBaseline({ candidate: qualityCandidate, approval: { kind: "QualityPolicyGateApproval", authority: "QualityPolicyGate", decision: "approve", candidateDigest: qualityCandidate.candidateDigest } });
  const crossCuttingPlan = createCrossCuttingCompositionPlan({
    availablePorts: ["execution-binding", "project-control-source-bundle", "project-overview-baseline", "quality-policy-baseline", "quality-policy-context", "repository-snapshot", "requirements-baseline", "resolved-workflow-profile", "specialist-assignment-baseline", "work-continuity-index", "work-dependency-baseline", "work-item"],
    moduleDefinitions,
    bindings: [
      { id: "quality", boundary: "before-task-dispatch", moduleId: "quality-policy", moduleVersion: "0.1.0", operationId: "resolve-obligations", inputPorts: ["project-overview-baseline", "quality-policy-baseline", "resolved-workflow-profile", "quality-policy-context", "work-item"], outputPorts: ["quality-obligation-resolution"], dependsOn: [], configurationDigest: digest("quality-config"), grantDigest: digest("no-grants"), failureBehavior: "stop" },
      { id: "continuity", boundary: "before-task-dispatch", moduleId: "work-continuity", moduleVersion: "0.1.0", operationId: "decide-reuse", inputPorts: ["requirements-baseline", "project-overview-baseline", "work-item", "work-dependency-baseline", "specialist-assignment-baseline", "quality-obligation-resolution", "repository-snapshot", "execution-binding", "work-continuity-index"], outputPorts: ["work-fingerprint", "work-reuse-decision"], dependsOn: ["quality"], configurationDigest: digest("continuity-config"), grantDigest: digest("no-grants"), failureBehavior: "stop" },
      { id: "control", boundary: "frontier-complete", moduleId: "project-control", moduleVersion: "0.1.0", operationId: "project-snapshot", inputPorts: ["project-overview-baseline", "project-control-source-bundle"], outputPorts: ["project-control-snapshot"], dependsOn: ["continuity"], configurationDigest: digest("control-config"), grantDigest: digest("no-grants"), failureBehavior: "diagnostic" },
    ],
  });
  const adapter = createDesktopTaskAdapter({ providerId: "chatgpt.desktop-fixture", providerVersion: "1.0.0", handlers: Object.fromEntries(["create", "inspect", "wait", "message", "handoff"].map((operation) => [operation, async ({ taskId }, plan) => ({ taskId: taskId ?? `TASK-${plan.attemptId}`, status: operation === "create" ? "ready" : "completed", observation: { operation, providerMode: "fixture-conformant" } })])) });
  const outcomes = [];

  for (const [position, profileName] of ["quick", "standard", "assurance"].entries()) {
    const workItemId = `WI-QC-${profileName.toUpperCase()}`;
    const attemptId = `ATT-QC-${profileName.toUpperCase()}`;
    const workflowProfile = resolveWorkflowProfile({ profileName, projectRiskContext: { level: profileName === "assurance" ? "high" : "moderate", sourceRefs: [`RISK-${profileName}`] } });
    const workItem = { id: workItemId, type: "code-change", objective: `produce ${profileName} code`, changedSurfaces: ["src"], technologies: ["node"], acceptanceCriteria: [`AC-${profileName}`] };
    const qualityPolicyContext = createQualityPolicyContext({ riskContext: workflowProfile.projectRiskContext, changedSurfaces: workItem.changedSurfaces, technologies: workItem.technologies, acceptanceCriteria: workItem.acceptanceCriteria });
    const requirementsBaseline = { id: "REQ-E2E", digest: digest("requirements") };
    const projectOverviewBaseline = { id: "OVERVIEW-E2E", digest: digest("overview") };
    const workDependencyBaseline = { id: "DEP-E2E", dependencyClosure: [], digest: digest(`dependency-${profileName}`) };
    const specialistAssignmentBaseline = { id: "ASSIGN-E2E", assignment: { profile: "implementation", contractDigest: digest(`assignment-${profileName}`) }, digest: digest(`assignment-baseline-${profileName}`) };
    const repositorySnapshot = { id: "REPOSITORY-E2E", revision, digest: digest(revision) };
    const executionBinding = { id: "EXECUTION-E2E", digest: digest("implementation-v1") };
    const dispatchBoundary = await executeCrossCuttingBoundary({
      plan: crossCuttingPlan,
      boundary: "before-task-dispatch",
      artifacts: { "requirements-baseline": requirementsBaseline, "project-overview-baseline": projectOverviewBaseline, "quality-policy-baseline": qualityBaseline, "quality-policy-context": qualityPolicyContext, "resolved-workflow-profile": workflowProfile, "work-item": workItem, "work-dependency-baseline": workDependencyBaseline, "specialist-assignment-baseline": specialistAssignmentBaseline, "repository-snapshot": repositorySnapshot, "execution-binding": executionBinding, "work-continuity-index": continuity.read().state.index },
      invoke(item, inputs) {
        if (item.moduleId === "quality-policy") return { "quality-obligation-resolution": resolveQualityObligations({ baseline: inputs["quality-policy-baseline"], workflowProfile: inputs["resolved-workflow-profile"], context: inputs["quality-policy-context"], workItem: inputs["work-item"] }) };
        const fingerprintInput = createWorkFingerprintInput({ projectId: "devrelay", requirementsBaselineDigest: inputs["requirements-baseline"].digest, projectOverviewBaselineDigest: inputs["project-overview-baseline"].digest, workItem: inputs["work-item"], targetRevision: inputs["repository-snapshot"].revision, dependencyClosure: inputs["work-dependency-baseline"].dependencyClosure, assignment: inputs["specialist-assignment-baseline"].assignment, qualityResolutionDigest: inputs["quality-obligation-resolution"].resolutionDigest, inputs: [inputs["requirements-baseline"], inputs["project-overview-baseline"], inputs["work-dependency-baseline"], inputs["specialist-assignment-baseline"], inputs["repository-snapshot"], inputs["execution-binding"]], implementationConfigurationDigest: inputs["execution-binding"].digest });
        const workFingerprint = deriveWorkFingerprint(fingerprintInput);
        return { "work-fingerprint": workFingerprint, "work-reuse-decision": findExactWorkReuse({ index: inputs["work-continuity-index"], workFingerprint, targetRevision: inputs["repository-snapshot"].revision, qualityResolutionDigest: inputs["quality-obligation-resolution"].resolutionDigest }) };
      },
    });
    assert.equal(dispatchBoundary.receipts.length, 2);
    const qualityResolution = dispatchBoundary.artifacts["quality-obligation-resolution"];
    const fingerprint = dispatchBoundary.artifacts["work-fingerprint"];
    const initialDecision = dispatchBoundary.artifacts["work-reuse-decision"];
    assert.equal(initialDecision.decision, "execute");
    const claimed = claimWorkAttempt({ index: continuity.read().state.index, expectedRevision: continuity.read().state.index.revision, workFingerprint: fingerprint, attemptId, owner: "chatgpt.desktop-fixture", targetRevision: revision, qualityResolutionDigest: qualityResolution.resolutionDigest, leaseExpiresAt: Date.now() + 60_000 });
    let host = continuity.read();
    continuity.commit({ expectedHostVersion: host.version, expectedIndexRevision: host.state.index.revision, transition: { operation: "claim", attemptId }, nextIndex: claimed.index });
    const lease = worktrees.allocate({ attemptId, runId: `RUN-${profileName}`, workItemId, revision });
    const orchestrationPlan = createDesktopOrchestrationPlan({ runId: `RUN-${profileName}`, projectId: "devrelay-e2e", horizonDigest: digest(`horizon-${profileName}`), startingRevision: revision, maxConcurrency: 1, workItems: [{ id: workItemId, dependencies: [] }], crossCuttingPlan });
    const taskPlan = createDesktopTaskPlan({ runId: orchestrationPlan.runId, workItem: { id: workItemId }, projectId: "devrelay", startingRevision: revision, worktreeLease: lease, assignment: { profile: "implementation" }, executor: { id: "chatgpt.desktop-fixture" }, grants: [{ kind: "filesystem.write", scope: lease.workspace }], promptArtifact: { artifactId: `PROMPT-${profileName}`, digest: digest(`prompt-${profileName}`), schema: "https://devrelay.dev/test/prompt/v1", mediaType: "application/json", uri: `memory://qc/${profileName}/prompt` }, memoryBootstrap: loadDesktopProjectMemoryBootstrap({ projectRoot: sourceRoot, taskId: attemptId, repositoryRevision: revision }), qualityResolution, workFingerprint: fingerprint, workContinuityDecision: initialDecision });
    const taskReceipt = await adapter.invoke("create", { plan: taskPlan });
    worktrees.bindTask(attemptId, taskReceipt.taskId);
    writeFileSync(path.join(lease.workspace, "quality.txt"), `base\n${profileName}\n`, "utf8");
    assert.match(readFileSync(path.join(lease.workspace, "quality.txt"), "utf8"), new RegExp(profileName));
    git(lease.workspace, "add", "quality.txt");
    git(lease.workspace, "commit", "-m", `implement ${profileName}`);
    const evidence = qualityResolution.obligations.map((obligation) => ({ kind: obligation.evidenceKinds[0], status: "pass", independent: true, digest: digest(`${profileName}-${obligation.id}`), producerTaskId: obligation.independent ? `REVIEWER-${profileName}` : taskReceipt.taskId }));
    const qualityAssessment = evaluateQualityEvidence({ resolution: qualityResolution, evidence, changeProducerIdentities: [taskReceipt.taskId] });
    assert.equal(qualityAssessment.decision, "satisfied");
    for (const [fromStatus, toStatus] of [["prepared", "dispatched"], ["dispatched", "running"]]) {
      host = continuity.read();
      const next = transitionWorkAttempt({ index: host.state.index, expectedRevision: host.state.index.revision, attemptId, fromStatus, toStatus });
      continuity.commit({ expectedHostVersion: host.version, expectedIndexRevision: host.state.index.revision, transition: { operation: toStatus, attemptId }, nextIndex: next });
    }
    host = continuity.read();
    const completed = transitionWorkAttempt({ index: host.state.index, expectedRevision: host.state.index.revision, attemptId, fromStatus: "running", toStatus: "completed", receiptDigest: taskReceipt.receiptDigest, resultDigest: digest(git(lease.workspace, "rev-parse", "HEAD")), evidenceDigest: qualityAssessment.assessmentDigest });
    continuity.commit({ expectedHostVersion: host.version, expectedIndexRevision: host.state.index.revision, transition: { operation: "completed", attemptId }, nextIndex: completed });
    const reuse = findExactWorkReuse({ index: continuity.read().state.index, workFingerprint: fingerprint, targetRevision: revision, qualityResolutionDigest: qualityResolution.resolutionDigest, verifiedArtifactDigests: [taskReceipt.receiptDigest, digest(git(lease.workspace, "rev-parse", "HEAD")), qualityAssessment.assessmentDigest] });
    assert.equal(reuse.decision, "reuse-exact");
    const projectControlSourceBundle = createProjectControlSourceBundle({ projectId: "devrelay-e2e", lifecycle: { phase: "verification", profileName }, workItems: [{ id: workItemId, status: "completed" }], assignments: [{ id: workItemId, profile: "implementation" }], taskObservations: [{ id: workItemId, receiptDigest: taskReceipt.receiptDigest }], worktreeObservations: [{ id: workItemId, revision: git(lease.workspace, "rev-parse", "HEAD") }], qualityAssessments: [{ id: workItemId, ...qualityAssessment }], continuityRecords: [{ id: workItemId, ...reuse }] });
    const controlBoundary = await executeCrossCuttingBoundary({ plan: crossCuttingPlan, boundary: "frontier-complete", artifacts: { "project-overview-baseline": projectOverviewBaseline, "project-control-source-bundle": projectControlSourceBundle }, invoke(_item, inputs) { return { "project-control-snapshot": createProjectControlSnapshot(inputs["project-control-source-bundle"]) }; } });
    assert.equal(controlBoundary.receipts.length, 1);
    const control = controlBoundary.artifacts["project-control-snapshot"];
    const operator = createDesktopOperatorSnapshot({ orchestrationRun: { kind: "LocalHostRunState", version: position, state: { plan: orchestrationPlan, workState: { [workItemId]: { status: "completed", receipts: [taskReceipt] } }, blockers: [], recovery: "clean" } }, worktreeLeases: [worktrees.inspect(attemptId)], projectControlSnapshot: control });
    assert.equal(operator.projectControl.diagnostics.length, 0);
    assert.equal(taskPlan.memoryContext.projectMemoryBaseline.artifactId.length > 0, true);
    outcomes.push({ profileName, attemptId, taskId: taskReceipt.taskId, implementationCommit: git(lease.workspace, "rev-parse", "HEAD"), qualityAssessmentDigest: qualityAssessment.assessmentDigest, reuseDecisionDigest: reuse.decisionDigest, controlSnapshotDigest: control.snapshotDigest, operatorSnapshotDigest: operator.snapshotDigest });
    worktrees.dispose(attemptId, { disposition: "completed" });
  }

  storage.close();
  storage = createLocalHostStorage({ rootDirectory: stateRoot });
  continuity = createDurableWorkContinuityStore({ storage, projectId: "devrelay-e2e" });
  assert.equal(continuity.read().state.index.records.filter(({ status }) => status === "completed").length, 3);
  assert.deepEqual(outcomes.map(({ profileName }) => profileName), ["quick", "standard", "assurance"]);
  assert.ok(outcomes.every(({ taskId, implementationCommit }) => taskId && /^[0-9a-f]{40}$/u.test(implementationCommit)));
});
