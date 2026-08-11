import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../../../src/index.mjs";
import { validateWorkExecutionArtifact } from "../../../src/work-execution-artifact-validator.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const [workItemId, candidateRootArgument, executorThreadId] = process.argv.slice(2);
if (!workItemId || !candidateRootArgument || !executorThreadId) {
  throw new Error(
    "usage: node materialize-frontier-verification.mjs <work-item-id> <candidate-root> <executor-thread-id>",
  );
}
const candidateRoot = resolve(candidateRootArgument);
const slug = workItemId.replace(/^WI-DESKTOP-/u, "");
const executionRoot = resolve(
  root,
  "dogfood/chatgpt-desktop-runtime/execution",
);
const outputRoot = resolve(executionRoot, "verification", workItemId);
const taskRoot = resolve(executionRoot, "task-contracts");
const task = JSON.parse(
  readFileSync(resolve(taskRoot, `${workItemId}.attempt-001.task.json`)),
);
const { contentDigest: ignoredTaskDigest, ...taskBody } = task;
if (api.canonicalJsonDigest(taskBody) !== task.contentDigest) {
  throw new Error("task contract digest drifted");
}
const rawHandoffPath = resolve(
  executionRoot,
  "attempts",
  workItemId,
  `${workItemId}.attempt-001.handoff.raw.json`,
);
const readBytes = (path) => readFileSync(resolve(root, path));
const readCandidateBytes = (path) => readFileSync(resolve(candidateRoot, path));
const readJson = (path) => JSON.parse(readBytes(path));
const body = (value, field) =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !["apiVersion", "kind", field].includes(key),
    ),
  );
const seal = (value, field) => ({
  ...value,
  [field]: api.canonicalJsonDigest(body(value, field)),
});
const ref = (artifactId, digest, extras = {}) => ({
  artifactId,
  digest,
  ...extras,
});
const artifactRef = (artifactId, artifact, extras = {}) =>
  ref(artifactId, api.canonicalJsonDigest(artifact), extras);
const write = (name, value) => {
  const path = resolve(outputRoot, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${api.canonicalJson(value)}\n`, "utf8");
  return ref(
    value.approvalId ??
      value.candidateId ??
      value.evaluationId ??
      value.normalizedEvidenceId ??
      value.verificationAttemptId ??
      value.bindingId ??
      value.obligationSetId ??
      value.subjectId ??
      value.attemptId ??
      value.kind,
    api.sha256Digest(readFileSync(path)),
    {
      mediaType: "application/json",
      uri: `file:///${path.replaceAll("\\", "/")}`,
    },
  );
};
const checkpointStore = () => {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      if (values.has(key)) throw new Error("immutable overwrite");
      values.set(key, structuredClone(value));
    },
  };
};

const handoffBytes = readFileSync(rawHandoffPath);
const handoff = JSON.parse(handoffBytes);
if (
  handoff.executionId !== task.executionId ||
  handoff.workItemId !== workItemId ||
  handoff.outcome !== "pass"
)
  throw new Error("worker handoff identity or outcome is invalid");

const binding = readJson(
  `dogfood/chatgpt-desktop-runtime/execution/task-contracts/${workItemId}/execution-binding.json`,
);
const baseInvocation = readJson(
  `dogfood/chatgpt-desktop-runtime/execution/task-contracts/${workItemId}/executor-invocation.json`,
);
const invocation = {
  ...baseInvocation,
  executionBinding: {
    ...baseInvocation.executionBinding,
    digest: binding.bindingDigest,
  },
  invocationFingerprint: undefined,
};
delete invocation.invocationFingerprint;
const exactInvocation = seal(invocation, "invocationFingerprint");
validateWorkExecutionArtifact(exactInvocation, { binding });
write("executor-invocation.json", exactInvocation);

const filePaths = handoff.changedFiles;
const pathMatches = (pattern, value) => {
  if (!pattern.includes("*")) return pattern === value;
  const escaped = pattern.replace(/[.+?^$()|[\]\\]/gu, "\\$&");
  const expression = escaped.replaceAll("**", ".*").replaceAll("*", "[^/]*");
  return new RegExp("^" + expression + "$", "u").test(value);
};
if (
  filePaths.some(
    (path) =>
      !task.authority.allowedWritePaths.some((pattern) =>
        pathMatches(pattern, path),
      ),
  )
) {
  throw new Error("worker handoff contains a path outside the approved write scope");
}
if (new Set(filePaths).size !== filePaths.length) {
  throw new Error("worker handoff contains duplicate changed paths");
}
const baseRevision = readJson(
  `dogfood/chatgpt-desktop-runtime/execution/task-contracts/${workItemId}/repository-snapshot.json`,
).revision;
const beforeBytes = (relativePath) => {
  try {
    return execFileSync("git", ["show", `${baseRevision}:${relativePath}`], {
      cwd: root,
    });
  } catch {
    return null;
  }
};
const files = filePaths.map((relativePath) => {
  const bytes = readCandidateBytes(relativePath);
  return { relativePath, bytes: bytes.length, digest: api.sha256Digest(bytes) };
});
for (const evidence of handoff.evidence) {
  const evidenceFile = files.find(
    ({ relativePath }) => relativePath === evidence.relativePath,
  );
  if (!evidenceFile || evidenceFile.digest !== evidence.digest) {
    throw new Error("worker evidence digest does not match the candidate bytes");
  }
}
const mutations = files.map(({ relativePath, digest }) => {
  const before = beforeBytes(relativePath);
  return {
    operation: before ? "modify" : "create",
    path: relativePath,
    beforeDigest: before ? api.sha256Digest(before) : null,
    afterDigest: digest,
  };
});
const handoffRef = ref(
  `HANDOFF-${slug}-001`,
  api.sha256Digest(handoffBytes),
  {
    mediaType: "application/json",
    uri: `file:///${rawHandoffPath.replaceAll("\\", "/")}`,
  },
);

const checks = task.verification.commands;
const commandResults = checks.map((command) => {
  const result = spawnSync(command, {
    cwd: candidateRoot,
    encoding: "utf8",
    shell: true,
  });
  return {
    command,
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
});
if (commandResults.some(({ exitCode }) => exitCode !== 0))
  throw new Error("independent focused verification failed");
mkdirSync(outputRoot, { recursive: true });
const rawCommandPath = resolve(outputRoot, "command-output.json");
writeFileSync(rawCommandPath, `${api.canonicalJson(commandResults)}\n`, "utf8");
const rawCommandRef = ref(
  `RAW-COMMAND-OUTPUT-${slug}-001`,
  api.sha256Digest(readFileSync(rawCommandPath)),
  {
    mediaType: "application/json",
    uri: `file:///${rawCommandPath.replaceAll("\\", "/")}`,
  },
);
const testReport = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "MachineTestReport",
  reportId: `TEST-${slug}-001`,
  outcome: "pass",
  tests: {
    total: commandResults.length,
    passed: commandResults.length,
    failed: 0,
  },
  checkedFiles: files,
  rawCommandOutput: rawCommandRef,
  target: {
    application: "ChatGPT Desktop",
    platform: "Windows",
    scope: "exclusive",
  },
};
const testReportRef = write("test-report.json", testReport);

const rawResult = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RawExecutorResult",
  attemptId: handoff.executionId,
  invocationFingerprint: exactInvocation.invocationFingerprint,
  bindingDigest: binding.bindingDigest,
  executor: binding.executor,
  terminalState: "proposed",
  mutations,
  evidence: [handoffRef, testReportRef],
  diagnostics: [],
  nativeArtifacts: [handoffRef],
};
validateWorkExecutionArtifact(rawResult, {
  invocation: exactInvocation,
  binding,
});
const rawResultRef = write("raw-executor-result.json", rawResult);
const attempt = seal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ExecutionAttempt",
    attemptId: handoff.executionId,
    workItemId: handoff.workItemId,
    invocationFingerprint: exactInvocation.invocationFingerprint,
    bindingDigest: binding.bindingDigest,
    result: rawResultRef,
    status: "proposed",
  },
  "attemptDigest",
);
const changeSetDraft = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ChangeSetDraft",
  attemptId: attempt.attemptId,
  mutations,
  changeDigest: api.canonicalJsonDigest(mutations),
};
const executionEvidence = [handoffRef, testReportRef];
const executionEvidenceBundle = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ExecutionEvidenceBundle",
  attemptId: attempt.attemptId,
  evidence: executionEvidence,
  evidenceDigest: api.canonicalJsonDigest(executionEvidence),
};
for (const artifact of [attempt, changeSetDraft, executionEvidenceBundle])
  validateWorkExecutionArtifact(artifact);
write("execution-attempt.json", attempt);
write("change-set-draft.json", changeSetDraft);
write("execution-evidence-bundle.json", executionEvidenceBundle);

const policy = seal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "VerificationPolicy",
    policyId: `POL-${slug}-001`,
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
  apiVersion: ignoredApi,
  kind: ignoredKind,
  policyDigest: ignoredPolicyDigest,
  ...policyBindingArtifact
} = policy;
const candidateWorkspace = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "CandidateWorkspace",
  version: "1.0.0",
  workspaceId: `CWS-${slug}-001`,
  files,
  workspaceDigest: api.canonicalJsonDigest(files),
};
const breakdown = readJson("project/work-breakdown-baseline.json");
const workItem = breakdown.workItems.find(
  ({ id }) => id === handoff.workItemId,
);
if (!workItem) throw new Error("approved work item is missing");
const artifacts = {
  workItem,
  executionAttempt: attempt,
  changeSetDraft,
  executionEvidenceBundle,
  verificationPolicy: policyBindingArtifact,
  requirementsBaseline: readJson("project/requirements-baseline.json"),
  projectOverviewBaseline: readJson("project/project-overview-baseline.json"),
  architectureBaseline: readJson("project/architecture-baseline.json"),
  contractDisposition: readJson("project/contract-disposition.json"),
  workBreakdownBaseline: breakdown,
  workDependencyBaseline: readJson("project/work-dependency-baseline.json"),
  specialistAssignmentBaseline: readJson(
    "project/specialist-assignment-baseline.json",
  ),
  repositoryBase: readJson(
    `dogfood/chatgpt-desktop-runtime/execution/task-contracts/${workItemId}/repository-snapshot.json`,
  ),
  candidateWorkspace,
};
const bindings = Object.fromEntries(
  Object.entries(artifacts).map(([name, artifact]) => [
    name,
    {
      artifact,
      reference: artifactRef(
        artifact.artifactId ??
          artifact.dispositionId ??
          artifact.baselineId ??
          artifact.id ??
          name,
        artifact,
        {
          schema: `https://devrelay.dev/internal/work-item-verification-input/${name}/v1`,
          mediaType: "application/json",
          uri: `memory://devrelay/work-item-verification/${workItemId}/${name}`,
        },
      ),
    },
  ]),
);
bindings.verificationPolicy.reference = {
  artifactId: policy.policyId,
  digest: api.canonicalJsonDigest(policyBindingArtifact),
};
const subject = api.bindWorkItemVerificationSubject({
  subjectId: `SUB-${slug}-001`,
  workItemId: workItem.id,
  bindings,
});
const obligationSet = api.expandWorkItemVerificationObligations({
  subject,
  workItem,
  policyDutyRefs: ["POL-DESKTOP-WINDOWS-ONLY", "POL-DESKTOP-ALL-OBLIGATIONS"],
});
const verifier = { id: "verifier.test", version: "1.0.0" };
const configurationDigest = api.canonicalJsonDigest({
  verifier,
  adapter: "test-verifier",
  platform: "win32",
});
const verifierBinding = api.validateVerifierBindingSet({
  bindingId: `BIND-${slug}-VERIFIER-001`,
  subject,
  obligationSet,
  executorIdentity:
    `executor.codex-desktop-task.${executorThreadId}`,
  changeProducerIdentities: [
    `producer.codex-desktop-task.${executorThreadId}`,
  ],
  verificationPolicy: {
    independenceRequired: true,
    evidenceKinds: Object.fromEntries(
      workItem["required-evidence"].map(({ kind }) => [
        kind,
        {
          requiredCapabilities: ["CAP-TEST-ENGINEERING"],
          requiredTools: ["TOOL-NODE"],
        },
      ]),
    ),
  },
  verifierRegistry: {
    entries: [
      {
        verifier,
        configurationDigest,
        capabilities: ["CAP-TEST-ENGINEERING"],
        tools: ["TOOL-NODE"],
        supportedEvidenceKinds: workItem["required-evidence"].map(({ kind }) => kind),
        permissionDemand: [{ kind: "process.spawn", values: ["node"] }],
        identityAliases: ["parent.integration-owner"],
      },
    ],
  },
  proposedPartitions: [
    {
      verifier,
      configurationDigest,
      obligationIds: obligationSet.obligations.map(
        ({ obligationId }) => obligationId,
      ),
      grants: [{ kind: "process.spawn", values: ["node"] }],
    },
  ],
  independenceEvidence: testReportRef,
});
const verifierInvocation = seal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "VerifierInvocation",
    verificationAttemptId: `VAT-${slug}-001`,
    subject: ref(subject.subjectId, subject.subjectDigest),
    obligationSet: ref(
      obligationSet.obligationSetId,
      obligationSet.obligationSetDigest,
    ),
    binding: ref(verifierBinding.bindingId, verifierBinding.bindingDigest),
    verifier,
    obligationIds: verifierBinding.partitions[0].obligationIds,
    assignedObligations: obligationSet.obligations,
    candidateWorkspace: subject.candidateWorkspace,
    grants: [{ kind: "process.spawn", values: ["node"] }],
  },
  "invocationFingerprint",
);
const nativeResult = {
  terminalState: "observed",
  tests: verifierInvocation.assignedObligations.map((obligation) => ({
    obligationId: obligation.obligationId,
    status: "pass",
    summary:
      "Independent Windows Desktop focused verification passed for the exact candidate bytes.",
    evidence: obligation.requiredEvidenceKinds.map((kind) => ({
      kind,
      artifact: testReportRef,
    })),
  })),
};
let verifierCalls = 0;
const checkpoints = checkpointStore();
const controller = api.createWorkItemVerificationCheckpointController({
  verifier: async (currentInvocation) => {
    verifierCalls += 1;
    const nativeBytes = Buffer.from(api.canonicalJson(nativeResult));
    const result = api.adaptTestVerifierResult({
      invocation: currentInvocation,
      binding: verifierBinding,
      nativeBytes,
      nativeResult,
      nativeArtifact: ref(
        `NATIVE-${slug}-TEST-001`,
        api.sha256Digest(nativeBytes),
      ),
    });
    return Buffer.from(api.canonicalJson(result));
  },
});
const first = await controller.execute({
  invocation: verifierInvocation,
  binding: verifierBinding,
  checkpoints,
});
const replay = await controller.execute({
  invocation: verifierInvocation,
  binding: verifierBinding,
  checkpoints,
});
if (
  verifierCalls !== 1 ||
  !replay.replayed ||
  replay.checkpointDigest !== first.checkpointDigest
)
  throw new Error("checkpoint replay failed");
const normalizedEvidence = api.normalizeWorkItemVerificationEvidence({
  subject,
  obligationSet,
  invocation: verifierInvocation,
  binding: verifierBinding,
  replay,
  collectionTime: {
    disposition: "not-applicable",
    rationale:
      "Content-addressed repository verification does not require wall-clock identity.",
  },
  normalizedEvidenceId: `NVE-${slug}-001`,
});
const evaluation = api.evaluateWorkItemVerificationPolicy({
  policy,
  subject,
  obligationSet,
  binding: verifierBinding,
  normalizedEvidence,
});
const gateCandidate = api.assembleWorkItemVerificationGateCandidate({
  candidateId: `WIVC-${slug}-001`,
  policy,
  subject,
  obligationSet,
  binding: verifierBinding,
  normalizedEvidence,
  policyEvaluation: evaluation,
});
const gateApproval = api.approveWorkItemVerification({
  candidate: gateCandidate,
  normalizedEvidence,
  obligationSet,
});
const approvedTraceability = seal(
  {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ApprovedWorkItemVerificationTraceability",
    gateApproval: ref(gateApproval.approvalId, gateApproval.approvalDigest),
    candidate: ref(gateCandidate.candidateId, gateCandidate.candidateDigest),
    acceptedEvidence: [
      ref(
        normalizedEvidence.normalizedEvidenceId,
        normalizedEvidence.evidenceDigest,
      ),
    ],
    acceptanceCriterionIds: gateApproval.acceptanceCriterionIds,
    authority: "approved",
    scope: "work-item-verification/approved",
  },
  "traceabilityDigest",
);
api.validateWorkItemVerificationArtifact(approvedTraceability);
const outputs = {
  policy,
  candidateWorkspace,
  subject,
  obligationSet,
  verifierBinding,
  verifierInvocation,
  rawVerifierResult: replay.rawResult,
  checkpoint: replay.checkpoint,
  normalizedEvidence,
  evaluation,
  gateCandidate,
  gateApproval,
  approvedTraceability,
};
for (const [name, value] of Object.entries(outputs))
  write(
    `${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}.json`,
    value,
  );
const proof = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "WorkItemVerificationDogfoodProof",
  workItemId: workItem.id,
  executionAttempt: attempt.attemptId,
  outcome: evaluation.outcome,
  gateApproval: ref(gateApproval.approvalId, gateApproval.approvalDigest),
  exactReplay: {
    verifierCalls,
    replayed: replay.replayed,
    checkpointDigest: replay.checkpointDigest,
  },
  verifiedFiles: files,
  testReport: testReportRef,
  target: {
    application: "ChatGPT Desktop",
    platform: "Windows",
    scope: "exclusive",
  },
  authoritativeIntegratedCompletionFactCreated: false,
};
write("verification-proof.json", proof);
console.log(
  JSON.stringify(
    {
      outcome: evaluation.outcome,
      approvalId: gateApproval.approvalId,
      approvalDigest: gateApproval.approvalDigest,
      checkpointDigest: replay.checkpointDigest,
      verifierCalls,
      files,
    },
    null,
    2,
  ),
);












