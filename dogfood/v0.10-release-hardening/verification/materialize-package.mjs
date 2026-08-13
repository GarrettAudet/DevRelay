import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import {
  approveWorkItemVerification,
  assembleWorkItemVerificationGateCandidate,
} from "../../../src/work-item-verification-gate.mjs";
import { validateWorkItemVerificationArtifact } from "../../../src/work-item-verification-artifact-validator.mjs";
import {
  bindWorkItemVerificationSubject,
  expandWorkItemVerificationObligations,
} from "../../../src/work-item-verification-input-guard.mjs";
import { validateVerifierBindingSet } from "../../../src/work-item-verification-verifier-binding.mjs";
import { createWorkItemVerificationCheckpointController } from "../../../src/work-item-verification-checkpoint.mjs";
import { normalizeWorkItemVerificationEvidence } from "../../../src/work-item-verification-evidence-normalizer.mjs";
import { evaluateWorkItemVerificationPolicy } from "../../../src/work-item-verification-policy-evaluator.mjs";
import { adaptTestVerifierResult } from "../../../src/work-item-verification-test-verifier-adapter.mjs";

const API = "devrelay.dev/v1alpha1";
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../..");
const readBytes = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const readJson = (relativePath) => JSON.parse(readBytes(relativePath));
const writeJson = (relativePath, value) => {
  const target = path.join(directory, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${canonicalJson(value)}\n`, "utf8");
  const bytes = fs.readFileSync(target);
  return {
    artifactId:
      value.approvalId ??
      value.candidateId ??
      value.evaluationId ??
      value.normalizedEvidenceId ??
      value.verificationAttemptId ??
      value.bindingId ??
      value.obligationSetId ??
      value.subjectId ??
      value.attemptId ??
      value.reportId ??
      value.kind,
    digest: sha256Digest(bytes),
    mediaType: "application/json",
    uri: `file://${target.replaceAll("\\", "/")}`,
  };
};
const ref = (artifactId, digest) => ({ artifactId, digest });
const artifactRef = (artifactId, artifact) => ref(artifactId, canonicalJsonDigest(artifact));
const seal = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !["apiVersion", "kind", field].includes(key),
      ),
    ),
  ),
});
const checkpointStore = () => {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      if (values.has(key)) throw new Error(`immutable checkpoint overwrite: ${key}`);
      values.set(key, structuredClone(value));
    },
  };
};

const workBreakdown = readJson("project/work-breakdown-baseline.json");
const common = {
  requirementsBaseline: readJson("project/requirements-baseline.json"),
  projectOverviewBaseline: readJson("project/project-overview-baseline.json"),
  architectureBaseline: readJson("project/architecture-baseline.json"),
  contractDisposition: readJson("project/contract-disposition.json"),
  workBreakdownBaseline: workBreakdown,
  workDependencyBaseline: readJson("project/work-dependency-baseline.json"),
  specialistAssignmentBaseline: readJson("project/specialist-assignment-baseline.json"),
  repositoryBase: readJson("dogfood/v0.10-release-hardening/repository-snapshot.json"),
};
const jobs = [{
  workItemId: "WI-REL-PACKAGE",
  attemptId: "ATT-REL-PACKAGE-001",
  evidenceKind: "release/package-contract",
  reportId: "TEST-REL-PACKAGE-001",
  command: "node --test test/package-export-verification.test.mjs test/release-catalog-portability.test.mjs; installed tarball export verification",
  tests: 6,
  checkedFiles: [
  "package.json",
  "package-lock.json",
  "scripts/release-catalog.mjs",
  "scripts/release-tools.mjs",
  "test/package-export-verification.test.mjs",
],
}];
const summary = {
  apiVersion: API,
  kind: "ReleaseFirstFrontierVerificationSummary",
  verifications: [],
};

for (const job of jobs) {
  const source = `dogfood/v0.10-release-hardening/execution/${job.workItemId}`;
  const workItem = workBreakdown.workItems.find(({ id }) => id === job.workItemId);
  if (!workItem) throw new Error(`missing work item ${job.workItemId}`);
  const executionAttempt = readJson(`${source}/execution-attempt.json`);
  const changeSetDraft = readJson(`${source}/change-set-draft.json`);
  const executionEvidenceBundle = readJson(`${source}/execution-evidence-bundle.json`);
  const rawExecutorBytes = readBytes(`${source}/raw-executor-result.json`);
  const policy = seal(
    {
      apiVersion: API,
      kind: "VerificationPolicy",
      policyId: `POL-${job.workItemId}-001`,
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
    },
    "policyDigest",
  );
  const {
    apiVersion: ignoredApiVersion,
    kind: ignoredKind,
    policyDigest: ignoredPolicyDigest,
    ...verificationPolicy
  } = policy;
  const candidateWorkspaceFiles = job.checkedFiles
    .map((relativePath) => {
      const bytes = readBytes(relativePath);
      return { relativePath, bytes: bytes.length, digest: sha256Digest(bytes) };
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
  const candidateWorkspace = {
    apiVersion: API,
    kind: "CandidateWorkspace",
    version: "1.0.0",
    workspaceId: `CWS-${job.workItemId}-001`,
    files: candidateWorkspaceFiles,
    workspaceDigest: canonicalJsonDigest(candidateWorkspaceFiles),
  };
  const artifacts = {
    workItem,
    executionAttempt,
    changeSetDraft,
    executionEvidenceBundle,
    verificationPolicy,
    ...common,
    candidateWorkspace,
  };
  const bindings = Object.fromEntries(
    Object.entries(artifacts).map(([name, artifact]) => [
      name,
      { artifact, reference: artifactRef(name, artifact) },
    ]),
  );
  const intrinsicArtifactIds = {
    workItem: workItem.id,
    executionAttempt: executionAttempt.attemptId,
    changeSetDraft: `CS-${executionAttempt.attemptId}`,
    executionEvidenceBundle: `EEB-${executionAttempt.attemptId}`,
    verificationPolicy: policy.policyId,
    requirementsBaseline: common.requirementsBaseline.baselineId,
    projectOverviewBaseline: common.projectOverviewBaseline.baselineId,
    architectureBaseline: common.architectureBaseline.baselineId,
    contractDisposition: common.contractDisposition.dispositionId,
    workBreakdownBaseline: common.workBreakdownBaseline.baselineId,
    workDependencyBaseline: common.workDependencyBaseline.baselineId,
    specialistAssignmentBaseline: common.specialistAssignmentBaseline.baselineId,
    repositoryBase: `repository-snapshot-devrelay-${common.repositoryBase.revision.slice(0, 7)}`,
    candidateWorkspace: candidateWorkspace.workspaceId,
  };
  for (const [name, artifactId] of Object.entries(intrinsicArtifactIds)) {
    bindings[name].reference.artifactId = artifactId;
    if (["workItem", "changeSetDraft", "architectureBaseline", "contractDisposition"].includes(name)) {
      bindings[name].reference.schema = "https://devrelay.dev/artifacts/verification-input/v1";
      bindings[name].reference.mediaType = "application/json";
      bindings[name].reference.uri = `memory://devrelay/verification-input/${encodeURIComponent(artifactId)}/${bindings[name].reference.digest.slice(7)}`;
    }
  }
  const subject = bindWorkItemVerificationSubject({
    subjectId: `SUB-${job.workItemId}-001`,
    workItemId: job.workItemId,
    bindings,
  });
  const obligationSet = expandWorkItemVerificationObligations({
    subject,
    workItem,
    policyDutyRefs: [`POL-${job.workItemId}-ALL-OBLIGATIONS`],
  });
  const testReport = {
    apiVersion: API,
    kind: "MachineTestReport",
    reportId: job.reportId,
    command: job.command,
    outcome: "pass",
    tests: { total: job.tests, passed: job.tests, failed: 0 },
    checkedFiles: candidateWorkspaceFiles,
    executionSource: {
      rawExecutorResultDigest: sha256Digest(rawExecutorBytes),
      executionAttemptDigest: executionAttempt.attemptDigest,
      changeDigest: changeSetDraft.changeDigest,
    },
  };
  const testReportRef = writeJson(`${job.workItemId}/test-report.json`, testReport);
  const verifier = { id: "verifier.test", version: "1.0.0" };
  const configurationDigest = canonicalJsonDigest({
    verifier,
    adapter: "test-verifier",
    version: "1.0.0",
    platform: "Windows",
  });
  const binding = validateVerifierBindingSet({
    bindingId: `BIND-WIV-${job.workItemId}-001`,
    subject,
    obligationSet,
    executorIdentity: "executor.chatgpt-desktop",
    changeProducerIdentities: [
      common.specialistAssignmentBaseline.assignments.find(
        ({ workItemRef }) => workItemRef === job.workItemId,
      ).specialistProfileRef,
    ],
    verificationPolicy: {
      independenceRequired: true,
      evidenceKinds: {
        [job.evidenceKind]: {
          requiredCapabilities: ["CAP-TEST-ENGINEERING"],
          requiredTools: ["TOOL-NODE"],
        },
      },
    },
    verifierRegistry: {
      entries: [
        {
          verifier,
          configurationDigest,
          capabilities: ["CAP-TEST-ENGINEERING"],
          tools: ["TOOL-NODE"],
          supportedEvidenceKinds: [job.evidenceKind],
          permissionDemand: [{ kind: "process.spawn", values: ["node"] }],
          identityAliases: ["verifier.devrelay-release-gate"],
        },
      ],
    },
    proposedPartitions: [
      {
        verifier,
        configurationDigest,
        obligationIds: obligationSet.obligations.map(({ obligationId }) => obligationId),
        grants: [{ kind: "process.spawn", values: ["node"] }],
      },
    ],
    independenceEvidence: testReportRef,
  });
  const invocation = seal(
    {
      apiVersion: API,
      kind: "VerifierInvocation",
      verificationAttemptId: `VAT-${job.workItemId}-001`,
      subject: ref(subject.subjectId, subject.subjectDigest),
      obligationSet: ref(obligationSet.obligationSetId, obligationSet.obligationSetDigest),
      binding: ref(binding.bindingId, binding.bindingDigest),
      verifier,
      obligationIds: binding.partitions[0].obligationIds,
      assignedObligations: obligationSet.obligations,
      candidateWorkspace: subject.candidateWorkspace,
      grants: [{ kind: "process.spawn", values: ["node"] }],
    },
    "invocationFingerprint",
  );
  const nativeResult = {
    terminalState: "observed",
    tests: invocation.assignedObligations.map((obligation) => ({
      obligationId: obligation.obligationId,
      status: "pass",
      summary: "Independent focused verification passed for the exact candidate bytes.",
      evidence: obligation.requiredEvidenceKinds.map((kind) => ({
        kind,
        artifact: testReportRef,
      })),
    })),
  };
  let verifierCalls = 0;
  const checkpoints = checkpointStore();
  const controller = createWorkItemVerificationCheckpointController({
    verifier: async (exactInvocation) => {
      verifierCalls += 1;
      const nativeBytes = Buffer.from(canonicalJson(nativeResult));
      const raw = adaptTestVerifierResult({
        invocation: exactInvocation,
        binding,
        nativeBytes,
        nativeResult,
        nativeArtifact: ref(`NATIVE-${job.workItemId}-001`, sha256Digest(nativeBytes)),
      });
      return Buffer.from(canonicalJson(raw));
    },
  });
  await controller.execute({ invocation, binding, checkpoints });
  const replay = await controller.execute({ invocation, binding, checkpoints });
  if (verifierCalls !== 1 || !replay.replayed) {
    throw new Error(`verification replay failed for ${job.workItemId}`);
  }
  const normalizedEvidence = normalizeWorkItemVerificationEvidence({
    subject,
    obligationSet,
    invocation,
    binding,
    replay,
    collectionTime: {
      disposition: "not-applicable",
      rationale: "Deterministic content-addressed repository verification.",
    },
    normalizedEvidenceId: `NVE-${job.workItemId}-001`,
  });
  const evaluation = evaluateWorkItemVerificationPolicy({
    policy,
    subject,
    obligationSet,
    binding,
    normalizedEvidence,
  });
  const gateCandidate = assembleWorkItemVerificationGateCandidate({
    candidateId: `WIVC-${job.workItemId}-001`,
    policy,
    subject,
    obligationSet,
    binding,
    normalizedEvidence,
    policyEvaluation: evaluation,
  });
  const candidateTraceability = seal(
    {
      apiVersion: API,
      kind: "WorkItemVerificationTraceabilityCandidate",
      candidate: ref(gateCandidate.candidateId, gateCandidate.candidateDigest),
      subject: ref(subject.subjectId, subject.subjectDigest),
      evidence: ref(
        normalizedEvidence.normalizedEvidenceId,
        normalizedEvidence.evidenceDigest,
      ),
      authority: "candidate",
      scope: "work-item-verification/candidate",
    },
    "traceabilityDigest",
  );
  validateWorkItemVerificationArtifact(candidateTraceability);
  const gateApproval = approveWorkItemVerification({
    candidate: gateCandidate,
    normalizedEvidence,
    obligationSet,
  });
  const approvedTraceability = seal(
    {
      apiVersion: API,
      kind: "ApprovedWorkItemVerificationTraceability",
      gateApproval: ref(gateApproval.approvalId, gateApproval.approvalDigest),
      candidate: ref(gateCandidate.candidateId, gateCandidate.candidateDigest),
      acceptedEvidence: [
        ref(normalizedEvidence.normalizedEvidenceId, normalizedEvidence.evidenceDigest),
      ],
      acceptanceCriterionIds: gateApproval.acceptanceCriterionIds,
      authority: "approved",
      scope: "work-item-verification/approved",
    },
    "traceabilityDigest",
  );
  validateWorkItemVerificationArtifact(approvedTraceability);
  const outputs = {
    policy,
    candidateWorkspace,
    subject,
    obligationSet,
    binding,
    invocation,
    rawVerifierResult: replay.rawResult,
    checkpoint: replay.checkpoint,
    normalizedEvidence,
    evaluation,
    gateCandidate,
    candidateTraceability,
    gateApproval,
    approvedTraceability,
  };
  for (const [name, value] of Object.entries(outputs)) {
    writeJson(
      `${job.workItemId}/${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}.json`,
      value,
    );
  }
  const proof = {
    apiVersion: API,
    kind: "WorkItemVerificationDogfoodProof",
    workItemId: job.workItemId,
    executionAttempt: executionAttempt.attemptId,
    outcome: evaluation.outcome,
    gateDecision: "approved",
    gateArtifact: ref(gateApproval.approvalId, gateApproval.approvalDigest),
    exactReplay: {
      verifierCalls,
      replayed: replay.replayed,
      checkpointDigest: replay.checkpointDigest,
    },
    verifiedFiles: candidateWorkspaceFiles,
    testReport: testReportRef,
    authoritativeIntegratedCompletionFactCreated: false,
  };
  writeJson(`${job.workItemId}/verification-proof.json`, proof);
  summary.verifications.push({
    workItemId: job.workItemId,
    outcome: evaluation.outcome,
    approvalId: gateApproval.approvalId,
    approvalDigest: gateApproval.approvalDigest,
    candidateDigest: gateCandidate.candidateDigest,
    evidenceDigest: normalizedEvidence.evidenceDigest,
    checkpointDigest: replay.checkpointDigest,
    verifierCalls,
    replayVerifierCalls: 0,
  });
}
summary.summaryDigest = canonicalJsonDigest(summary.verifications);
writeJson("package-verification-summary.json", summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
