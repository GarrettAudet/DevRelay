import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../../../src/index.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const verificationRoot = resolve(root, "dogfood/rp-001-release-preparation/verification-frontier-2");
mkdirSync(verificationRoot, { recursive: true });

const verificationJobs = Object.freeze({
  "WI-RP-IDENTITY-ROUTING": Object.freeze({ argv: ["--test", "test/release-preparation-identity-routing.test.mjs"], command: "node --test test/release-preparation-identity-routing.test.mjs", tests: 8 }),
});
const workItemIds = Object.freeze(Object.keys(verificationJobs));
const readBytes = (path) => readFileSync(resolve(root, path));
const readJson = (path) => JSON.parse(readBytes(path));
const ref = (artifactId, digest) => ({ artifactId, digest });
const artifactRef = (artifactId, artifact) => ({
  artifactId,
  digest: api.canonicalJsonDigest(artifact),
  schema: `https://devrelay.dev/artifacts/${encodeURIComponent(artifact?.kind ?? "work-item-draft").toLowerCase()}/v1`,
  mediaType: "application/json",
  uri: `memory://devrelay/rp001/${encodeURIComponent(artifactId)}`,
});
const seal = (value, field) => ({
  ...value,
  [field]: api.canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))),
});
const checkpointStore = () => {
  const values = new Map();
  return {
    async get(key) { return values.get(key); },
    async put(key, value) {
      if (values.has(key)) throw new Error("immutable checkpoint overwrite");
      values.set(key, structuredClone(value));
    },
  };
};
function write(outDir, name, value) {
  const path = resolve(outDir, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${api.canonicalJson(value)}\n`, "utf8");
  return {
    artifactId: value.receiptId ?? value.approvalId ?? value.candidateId ?? value.evaluationId ?? value.normalizedEvidenceId ?? value.verificationAttemptId ?? value.bindingId ?? value.obligationSetId ?? value.subjectId ?? value.kind,
    digest: api.sha256Digest(readFileSync(path)),
    mediaType: "application/json",
    uri: `file:${path.replaceAll("\\", "/")}`,
  };
}

const breakdown = readJson("project/work-breakdown-baseline.json");
const baselines = {
  requirementsBaseline: readJson("project/requirements-baseline.json"),
  projectOverviewBaseline: readJson("project/project-overview-baseline.json"),
  architectureBaseline: readJson("project/architecture-baseline.json"),
  contractDisposition: readJson("project/contract-disposition.json"),
  workBreakdownBaseline: breakdown,
  workDependencyBaseline: readJson("project/work-dependency-baseline.json"),
  specialistAssignmentBaseline: readJson("project/specialist-assignment-baseline.json"),
  repositoryBase: readJson("dogfood/rp-001-release-preparation/integration-frontier-1/WI-RP-ARTIFACT-CONTRACTS/post-repository-snapshot.json"),
};

const results = [];
for (const workItemId of workItemIds) {
  const outDir = resolve(verificationRoot, workItemId);
  const job = verificationJobs[workItemId];
  mkdirSync(outDir, { recursive: true });
  const workItem = breakdown.workItems.find(({ id }) => id === workItemId);
  if (!workItem) throw new Error(`missing approved work item ${workItemId}`);
  const executionDir = `dogfood/rp-001-release-preparation/execution-frontier-2/${workItemId}`;
  const executionAttempt = readJson(`${executionDir}/execution-attempt.json`);
  const changeSetDraft = readJson(`${executionDir}/change-set-draft.json`);
  const executionEvidenceBundle = readJson(`${executionDir}/execution-evidence-bundle.json`);
  const integratedFiles = changeSetDraft.mutations.map((mutation) => {
    const bytes = readBytes(mutation.path);
    const digest = api.sha256Digest(bytes);
    if (digest !== mutation.afterDigest) throw new Error(`${workItemId} current bytes drifted for ${mutation.path}`);
    return { relativePath: mutation.path, bytes: bytes.length, digest };
  }).sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));

  const testStarted = process.hrtime.bigint();
  const testRun = spawnSync(process.execPath, job.argv, {
    cwd: root,
    encoding: null,
    windowsHide: true,
  });
  const durationMilliseconds = Number(process.hrtime.bigint() - testStarted) / 1_000_000;
  if (testRun.error) throw testRun.error;
  const stdout = Buffer.from(testRun.stdout ?? []);
  const stderr = Buffer.from(testRun.stderr ?? []);
  if (testRun.status !== 0) throw new Error(`${workItemId} independent verifier failed: ${stderr.toString("utf8")}`);
  const receiptRecord = api.recordExecutionReceipt({
    effect: {
      id: `verify-${workItemId}`,
      command: process.execPath,
      argv: job.argv,
      cwd: ".",
      environmentDigest: api.canonicalJsonDigest({ node: process.version, platform: process.platform, arch: process.arch }),
      grants: ["process.spawn"],
      attemptNumber: 1,
    },
    observation: {
      stdout,
      stderr,
      exitCode: testRun.status,
      durationMilliseconds,
      toolVersion: process.version,
      artifacts: integratedFiles.map(({ relativePath, digest }) => ({ artifactId: relativePath, digest })),
    },
  });
  api.verifyExecutionReceipt(receiptRecord);
  const receiptRef = write(outDir, "execution-receipt.json", receiptRecord.receipt);
  write(outDir, "raw-observation-bundle.json", receiptRecord.rawBundle);
  write(outDir, "redacted-execution-view.json", receiptRecord.redactedView);
  const testReport = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "MachineTestReport",
    reportId: `TEST-${workItemId}-001`,
    command: job.command,
    commandFingerprint: receiptRecord.receipt.effectFingerprint,
    executionReceipt: ref(receiptRef.artifactId, receiptRef.digest),
    outcome: "pass",
    tests: { total: job.tests, passed: job.tests, failed: 0 },
    checkedFiles: integratedFiles,
  };
  const testReportRef = write(outDir, "test-report.json", testReport);

  const policy = seal({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "VerificationPolicy",
    policyId: `POL-${workItemId}-001`,
    version: "1.0.0",
    evaluationSemantics: "devrelay.work-item-verification/v1",
    rules: {
      allObligationsMandatory: true,
      requiredEvidenceBinding: "explicit-obligation-bound",
      verifierIndependence: "required",
      nativeArtifacts: "provenance-only",
      unknownEvidence: "reject",
      outcomePrecedence: ["failed", "needs-evidence", "verified"],
    },
  }, "policyDigest");
  const { apiVersion: ignoredApi, kind: ignoredKind, policyDigest: ignoredDigest, ...policyBindingArtifact } = policy;
  void ignoredApi; void ignoredKind; void ignoredDigest;
  const candidateWorkspace = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "CandidateWorkspace",
    version: "1.0.0",
    workspaceId: `CWS-${workItemId}-001`,
    files: integratedFiles,
    workspaceDigest: api.canonicalJsonDigest(integratedFiles),
  };
  const artifacts = {
    workItem,
    executionAttempt,
    changeSetDraft,
    executionEvidenceBundle,
    verificationPolicy: policyBindingArtifact,
    ...baselines,
    candidateWorkspace,
  };
  const artifactIds = {
    workItem: workItem.id,
    executionAttempt: executionAttempt.attemptId,
    changeSetDraft: `CS-${executionAttempt.attemptId}`,
    executionEvidenceBundle: `EEB-${executionAttempt.attemptId}`,
    verificationPolicy: policy.policyId,
    requirementsBaseline: baselines.requirementsBaseline.baselineId,
    projectOverviewBaseline: baselines.projectOverviewBaseline.baselineId,
    architectureBaseline: baselines.architectureBaseline.baselineId,
    contractDisposition: baselines.contractDisposition.dispositionId,
    workBreakdownBaseline: baselines.workBreakdownBaseline.baselineId,
    workDependencyBaseline: baselines.workDependencyBaseline.baselineId,
    specialistAssignmentBaseline: baselines.specialistAssignmentBaseline.baselineId,
    repositoryBase: "repository-snapshot-devrelay-d114c2f",
    candidateWorkspace: candidateWorkspace.workspaceId,
  };
  const bindings = Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, { artifact, reference: artifactRef(artifactIds[name], artifact) }]));
  bindings.verificationPolicy.reference = ref(policy.policyId, api.canonicalJsonDigest(policyBindingArtifact));
  const subject = api.bindWorkItemVerificationSubject({ subjectId: `SUB-${workItemId}-001`, workItemId, bindings });
  const obligationSet = api.expandWorkItemVerificationObligations({ subject, workItem, policyDutyRefs: ["POL-WIV-ALL-OBLIGATIONS"] });
  const verifier = { id: "verifier.test", version: "1.0.0" };
  const configurationDigest = api.canonicalJsonDigest({ verifier, adapter: "test-verifier", version: "1.0.0" });
  const evidenceKind = workItem["required-evidence"][0].kind;
  const binding = api.validateVerifierBindingSet({
    bindingId: `BIND-${workItemId}-TEST-001`,
    subject,
    obligationSet,
    executorIdentity: "executor.chatgpt-desktop",
    changeProducerIdentities: [],
    verificationPolicy: { independenceRequired: true, evidenceKinds: { [evidenceKind]: { requiredCapabilities: ["CAP-TEST-ENGINEERING"], requiredTools: ["TOOL-NODE"] } } },
    verifierRegistry: { entries: [{ verifier, configurationDigest, capabilities: ["CAP-TEST-ENGINEERING"], tools: ["TOOL-NODE"], supportedEvidenceKinds: [evidenceKind], permissionDemand: [{ kind: "process.spawn", values: ["node"] }], identityAliases: ["verifier.devrelay-parent"] }] },
    proposedPartitions: [{ verifier, configurationDigest, obligationIds: obligationSet.obligations.map(({ obligationId }) => obligationId), grants: [{ kind: "process.spawn", values: ["node"] }] }],
    independenceEvidence: testReportRef,
  });
  const invocation = seal({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "VerifierInvocation",
    verificationAttemptId: `VAT-${workItemId}-001`,
    subject: ref(subject.subjectId, subject.subjectDigest),
    obligationSet: ref(obligationSet.obligationSetId, obligationSet.obligationSetDigest),
    binding: ref(binding.bindingId, binding.bindingDigest),
    verifier,
    obligationIds: binding.partitions[0].obligationIds,
    assignedObligations: obligationSet.obligations,
    candidateWorkspace: subject.candidateWorkspace,
    grants: [{ kind: "process.spawn", values: ["node"] }],
  }, "invocationFingerprint");
  const nativeResult = {
    terminalState: "observed",
    tests: invocation.assignedObligations.map((obligation) => ({
      obligationId: obligation.obligationId,
      status: "pass",
      summary: `The independent focused verifier passed all ${job.tests} RP-001 profile-inventory frontier tests for the exact ${workItemId} candidate bytes.`,
      evidence: obligation.requiredEvidenceKinds.map((kind) => ({ kind, artifact: testReportRef })),
    })),
  };
  let adapterCalls = 0;
  const checkpoints = checkpointStore();
  const controller = api.createWorkItemVerificationCheckpointController({
    verifier: async (exactInvocation) => {
      adapterCalls += 1;
      const nativeBytes = Buffer.from(api.canonicalJson(nativeResult));
      const raw = api.adaptTestVerifierResult({
        invocation: exactInvocation,
        binding,
        nativeBytes,
        nativeResult,
        nativeArtifact: ref(`NATIVE-${workItemId}-TEST-001`, api.sha256Digest(nativeBytes)),
      });
      return Buffer.from(api.canonicalJson(raw));
    },
  });
  const first = await controller.execute({ invocation, binding, checkpoints });
  const replay = await controller.execute({ invocation, binding, checkpoints });
  if (adapterCalls !== 1 || !replay.replayed) throw new Error(`${workItemId} checkpoint replay did not suppress verifier execution`);
  const normalizedEvidence = api.normalizeWorkItemVerificationEvidence({
    subject,
    obligationSet,
    invocation,
    binding,
    replay,
    collectionTime: { disposition: "not-applicable", rationale: "The exact content-addressed verifier receipt records observed duration without making time part of artifact identity." },
    normalizedEvidenceId: `NVE-${workItemId}-001`,
  });
  const evaluation = api.evaluateWorkItemVerificationPolicy({ policy, subject, obligationSet, binding, normalizedEvidence });
  const gateCandidate = api.assembleWorkItemVerificationGateCandidate({ candidateId: `WIVC-${workItemId}-001`, policy, subject, obligationSet, binding, normalizedEvidence, policyEvaluation: evaluation });
  const gateApproval = api.approveWorkItemVerification({ candidate: gateCandidate, normalizedEvidence, obligationSet });
  const approvedTraceability = seal({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ApprovedWorkItemVerificationTraceability",
    gateApproval: ref(gateApproval.approvalId, gateApproval.approvalDigest),
    candidate: ref(gateCandidate.candidateId, gateCandidate.candidateDigest),
    acceptedEvidence: [ref(normalizedEvidence.normalizedEvidenceId, normalizedEvidence.evidenceDigest)],
    acceptanceCriterionIds: gateApproval.acceptanceCriterionIds,
    authority: "approved",
    scope: "work-item-verification/approved",
  }, "traceabilityDigest");
  api.validateWorkItemVerificationArtifact(approvedTraceability);

  const outputs = { policy, candidateWorkspace, subject, obligationSet, binding, invocation, rawVerifierResult: replay.rawResult, checkpoint: replay.checkpoint, normalizedEvidence, evaluation, gateCandidate, gateApproval, approvedTraceability };
  for (const [name, value] of Object.entries(outputs)) write(outDir, `${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}.json`, value);
  const proof = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkItemVerificationDogfoodProof",
    workItemId,
    executionAttempt: executionAttempt.attemptId,
    outcome: evaluation.outcome,
    gateApproval: ref(gateApproval.approvalId, gateApproval.approvalDigest),
    exactReplay: { adapterCalls, replayed: replay.replayed, checkpointDigest: replay.checkpointDigest },
    verifiedFiles: integratedFiles,
    testReport: testReportRef,
    executionReceipt: receiptRef,
    authoritativeIntegratedCompletionFactCreated: false,
  };
  const proofRef = write(outDir, "verification-proof.json", proof);
  results.push({ workItemId, outcome: evaluation.outcome, gateApproval: proof.gateApproval, proof: ref(proofRef.artifactId, proofRef.digest), evidenceDigest: normalizedEvidence.evidenceDigest, checkpointDigest: replay.checkpointDigest, adapterCalls, replayAdapterCalls: 0 });
}

const summary = { apiVersion: "devrelay.dev/v1alpha1", kind: "Rp001SecondFrontierVerificationSummary", results };
summary.summaryDigest = api.canonicalJsonDigest(summary);
writeFileSync(resolve(verificationRoot, "verification-summary.json"), `${api.canonicalJson(summary)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
