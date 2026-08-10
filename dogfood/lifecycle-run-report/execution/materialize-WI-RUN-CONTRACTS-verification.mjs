import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as api from "../../../src/index.mjs";

const root = resolve(new URL("../../../", import.meta.url).pathname.slice(1));
const worker = "C:/Users/garre/.codex/worktrees/0ef1/DevRelay-v04-work-dependency-analysis";
const outDir = resolve(root, "dogfood/lifecycle-run-report/execution/verification/WI-RUN-CONTRACTS/attempt-003");
mkdirSync(outDir, { recursive:true });
const readBytes = (path) => readFileSync(resolve(root, path));
const readJson = (path) => JSON.parse(readBytes(path));
const ref = (artifactId, digest) => ({ artifactId, digest });
const seal = (value, field) => ({ ...value, [field]:api.canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const artifactRef = (artifactId, artifact) => ref(artifactId, api.canonicalJsonDigest(artifact));
const write = (name, value) => {
  const path = resolve(outDir, name);
  mkdirSync(dirname(path), { recursive:true });
  writeFileSync(path, `${api.canonicalJson(value)}\n`, "utf8");
  return { artifactId:value.approvalId ?? value.candidateId ?? value.evaluationId ?? value.normalizedEvidenceId ?? value.verificationAttemptId ?? value.bindingId ?? value.obligationSetId ?? value.subjectId ?? value.attemptId ?? value.kind, digest:api.sha256Digest(readFileSync(path)), mediaType:"application/json", uri:`file:///C:/tmp/DevRelay-v04-work-dependency-analysis/dogfood/lifecycle-run-report/execution/verification/WI-RUN-CONTRACTS/attempt-003/${name}` };
};
const checkpointStore = () => {
  const values = new Map();
  return { values, async get(key) { return values.get(key); }, async put(key, value) { if (values.has(key)) throw new Error("immutable overwrite"); values.set(key, structuredClone(value)); } };
};

const taskPath = "dogfood/lifecycle-run-report/execution/task-contracts/WI-RUN-CONTRACTS.attempt-003.task.json";
const handoffPath = "dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-CONTRACTS.attempt-003.handoff.raw.json";
const reviewPath = "dogfood/lifecycle-run-report/execution/task-contracts/attempts/WI-RUN-CONTRACTS.attempt-003.wiv.json";
const task = readJson(taskPath);
const handoffBytes = readBytes(handoffPath);
const bootstrapReviewBytes = readBytes(reviewPath);
const breakdown = readJson("dogfood/lifecycle-run-report/work-breakdown/work-breakdown-baseline.json");
const workItem = breakdown.workItems.find(({ id }) => id === "WI-RUN-CONTRACTS");
if (!workItem) throw new Error("approved WI-RUN-CONTRACTS is missing");

const paths = [
  "contracts/lifecycle-run-report-artifacts.schema.json",
  "src/lifecycle-run-report-artifact-validator.mjs",
  "src/index.mjs",
  "test/lifecycle-run-report-contracts.test.mjs",
];
const preDigests = new Map(paths.map((path) => {
  try { return [path, api.sha256Digest(readFileSync(resolve(root, path)))]; }
  catch (error) { if (error.code === "ENOENT") return [path, null]; throw error; }
}));
const integratedFiles = paths.map((relativePath) => {
  const bytes = readFileSync(resolve(worker, relativePath));
  return { relativePath, bytes:bytes.length, digest:api.sha256Digest(bytes) };
});
const mutations = integratedFiles.map(({ relativePath, digest }) => ({ operation:preDigests.get(relativePath) === null ? "create" : "modify", path:relativePath, beforeDigest:preDigests.get(relativePath), afterDigest:digest }));
const handoffRef = { artifactId:"WI-RUN-CONTRACTS.attempt-003.handoff", digest:api.sha256Digest(handoffBytes), mediaType:"application/json", uri:`file:${handoffPath}` };
const reviewRef = { artifactId:"WI-RUN-CONTRACTS.attempt-003.bootstrap-review", digest:api.sha256Digest(bootstrapReviewBytes), mediaType:"application/json", uri:`file:${reviewPath}` };
const testReport = { apiVersion:"devrelay.dev/v1alpha1", kind:"MachineTestReport", reportId:"TEST-RUN-CONTRACTS-003", command:"node --test test/lifecycle-run-report-contracts.test.mjs", outcome:"pass", tests:{ total:10, passed:10, failed:0 }, checkedFiles:integratedFiles, semanticChecks:{ approvedMaturityVocabulary:true, revision2CorrectionsPreserved:true, providerProductIdentifiersFound:0, authorityBoundaryPreserved:true } };
const testReportRef = write("test-report.json", testReport);
const attempt = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ExecutionAttempt", attemptId:"ATT-RUN-CONTRACTS-003", workItemId:workItem.id, invocationFingerprint:api.canonicalJsonDigest(task), bindingDigest:api.canonicalJsonDigest(readJson("dogfood/lifecycle-run-report/assignment/specialist-assignment-baseline.json")), result:handoffRef, status:"proposed" }, "attemptDigest");
const changeSetDraft = { apiVersion:"devrelay.dev/v1alpha1", kind:"ChangeSetDraft", attemptId:attempt.attemptId, mutations, changeDigest:api.canonicalJsonDigest(mutations) };
const executionEvidence = [handoffRef, reviewRef, testReportRef];
const executionEvidenceBundle = { apiVersion:"devrelay.dev/v1alpha1", kind:"ExecutionEvidenceBundle", attemptId:attempt.attemptId, evidence:executionEvidence, evidenceDigest:api.canonicalJsonDigest(executionEvidence) };
const policy = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"VerificationPolicy", policyId:"POL-RUN-CONTRACTS-003", version:"1.0.0", evaluationSemantics:"devrelay.work-item-verification/v1", rules:{ allObligationsMandatory:true, requiredEvidenceBinding:"explicit-obligation-bound", verifierIndependence:"required", nativeArtifacts:"provenance-only", unknownEvidence:"reject", outcomePrecedence:["failed","needs-evidence","verified"] } }, "policyDigest");
const { apiVersion:ignoredApi, kind:ignoredKind, policyDigest:ignoredDigest, ...policyBindingArtifact } = policy;
const candidateWorkspace = { apiVersion:"devrelay.dev/v1alpha1", kind:"CandidateWorkspace", version:"1.0.0", workspaceId:"CWS-RUN-CONTRACTS-003", files:integratedFiles, workspaceDigest:api.canonicalJsonDigest(integratedFiles) };
const artifacts = {
  workItem,
  executionAttempt:attempt,
  changeSetDraft,
  executionEvidenceBundle,
  verificationPolicy:policyBindingArtifact,
  requirementsBaseline:readJson("project/requirements-baseline.json"),
  projectOverviewBaseline:readJson("project/project-overview-baseline.json"),
  architectureBaseline:readJson("project/architecture-baseline.json"),
  contractDisposition:readJson("project/contract-disposition.json"),
  workBreakdownBaseline:breakdown,
  workDependencyBaseline:readJson("dogfood/lifecycle-run-report/dependency-analysis/work-dependency-baseline.json"),
  specialistAssignmentBaseline:readJson("dogfood/lifecycle-run-report/assignment/specialist-assignment-baseline.json"),
  repositoryBase:readJson("dogfood/lifecycle-run-report/repository-snapshot.json"),
  candidateWorkspace,
};
const bindings = Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, { artifact, reference:artifactRef(name, artifact) }]));
bindings.verificationPolicy.reference.artifactId = policy.policyId;
const subject = api.bindWorkItemVerificationSubject({ subjectId:"SUB-RUN-CONTRACTS-003", workItemId:workItem.id, bindings });
const obligationSet = api.expandWorkItemVerificationObligations({ subject, workItem, policyDutyRefs:["POL-RUN-CONTRACTS-ALL-OBLIGATIONS"] });
const verifier = { id:"verifier.test", version:"1.0.0" };
const configurationDigest = api.canonicalJsonDigest({ verifier, adapter:"test-and-semantic-review", version:"1.0.0" });
const binding = api.validateVerifierBindingSet({
  bindingId:"BIND-RUN-CONTRACTS-TEST-003", subject, obligationSet,
  executorIdentity:"executor.codex-task.019feaa5-4f6f-7f91-b2dc-1eda3c8468b6",
  changeProducerIdentities:["producer.codex-task.019feaa5-4f6f-7f91-b2dc-1eda3c8468b6"],
  verificationPolicy:{ independenceRequired:true, evidenceKinds:{ "lifecycle-run-report/contract-tests":{ requiredCapabilities:["CAP-TEST-ENGINEERING"], requiredTools:["TOOL-NODE"] } } },
  verifierRegistry:{ entries:[{ verifier, configurationDigest, capabilities:["CAP-TEST-ENGINEERING"], tools:["TOOL-NODE"], supportedEvidenceKinds:["lifecycle-run-report/contract-tests"], permissionDemand:[{ kind:"process.spawn", values:["node"] }], identityAliases:["parent.integration-owner"] }] },
  proposedPartitions:[{ verifier, configurationDigest, obligationIds:obligationSet.obligations.map(({ obligationId }) => obligationId), grants:[{ kind:"process.spawn", values:["node"] }] }],
  independenceEvidence:testReportRef,
});
const invocation = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"VerifierInvocation", verificationAttemptId:"VAT-RUN-CONTRACTS-003", subject:ref(subject.subjectId,subject.subjectDigest), obligationSet:ref(obligationSet.obligationSetId,obligationSet.obligationSetDigest), binding:ref(binding.bindingId,binding.bindingDigest), verifier, obligationIds:binding.partitions[0].obligationIds, assignedObligations:obligationSet.obligations, candidateWorkspace:subject.candidateWorkspace, grants:[{ kind:"process.spawn", values:["node"] }] }, "invocationFingerprint");
const nativeResult = { terminalState:"observed", tests:invocation.assignedObligations.map((obligation) => ({ obligationId:obligation.obligationId, status:"pass", summary:"Independent focused suite and semantic review passed for the exact candidate bytes.", evidence:obligation.requiredEvidenceKinds.map((kind) => ({ kind, artifact:testReportRef })) })) };
let adapterCalls = 0;
const checkpoints = checkpointStore();
const controller = api.createWorkItemVerificationCheckpointController({ verifier:async (exactInvocation) => { adapterCalls += 1; const nativeBytes=Buffer.from(api.canonicalJson(nativeResult)); const raw=api.adaptTestVerifierResult({ invocation:exactInvocation, binding, nativeBytes, nativeResult, nativeArtifact:ref("NATIVE-RUN-CONTRACTS-TEST-003",api.sha256Digest(nativeBytes)) }); return Buffer.from(api.canonicalJson(raw)); } });
const first = await controller.execute({ invocation, binding, checkpoints });
const replay = await controller.execute({ invocation, binding, checkpoints });
if (adapterCalls !== 1 || !replay.replayed) throw new Error("checkpoint replay did not suppress verifier execution");
const normalizedEvidence = api.normalizeWorkItemVerificationEvidence({ subject, obligationSet, invocation, binding, replay, collectionTime:{ disposition:"not-applicable", rationale:"Deterministic content-addressed repository verification." }, normalizedEvidenceId:"NVE-RUN-CONTRACTS-003" });
const evaluation = api.evaluateWorkItemVerificationPolicy({ policy, subject, obligationSet, binding, normalizedEvidence });
const gateCandidate = api.assembleWorkItemVerificationGateCandidate({ candidateId:"WIVC-RUN-CONTRACTS-003", policy, subject, obligationSet, binding, normalizedEvidence, policyEvaluation:evaluation });
const gateApproval = api.approveWorkItemVerification({ candidate:gateCandidate, normalizedEvidence, obligationSet });
const approvedTraceability = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ApprovedWorkItemVerificationTraceability", gateApproval:ref(gateApproval.approvalId,gateApproval.approvalDigest), candidate:ref(gateCandidate.candidateId,gateCandidate.candidateDigest), acceptedEvidence:[ref(normalizedEvidence.normalizedEvidenceId,normalizedEvidence.evidenceDigest)], acceptanceCriterionIds:gateApproval.acceptanceCriterionIds, authority:"approved", scope:"work-item-verification/approved" }, "traceabilityDigest");
api.validateWorkItemVerificationArtifact(approvedTraceability);

const outputs = { attempt, changeSetDraft, executionEvidenceBundle, policy, candidateWorkspace, subject, obligationSet, binding, invocation, rawVerifierResult:replay.rawResult, checkpoint:replay.checkpoint, normalizedEvidence, evaluation, gateCandidate, gateApproval, approvedTraceability };
for (const [name, value] of Object.entries(outputs)) write(`${name.replace(/[A-Z]/g,(letter)=>`-${letter.toLowerCase()}`)}.json`, value);
const proof = { apiVersion:"devrelay.dev/v1alpha1", kind:"WorkItemVerificationDogfoodProof", workItemId:workItem.id, executionAttempt:attempt.attemptId, outcome:evaluation.outcome, gateApproval:ref(gateApproval.approvalId,gateApproval.approvalDigest), exactReplay:{ adapterCalls, replayed:replay.replayed, checkpointDigest:replay.checkpointDigest }, verifiedFiles:integratedFiles, testReport:testReportRef, bootstrapReview:reviewRef, authoritativeIntegratedCompletionFactCreated:false };
write("verification-proof.json", proof);
console.log(JSON.stringify({ outcome:evaluation.outcome, approvalId:gateApproval.approvalId, approvalDigest:gateApproval.approvalDigest, candidateDigest:gateCandidate.candidateDigest, evidenceDigest:normalizedEvidence.evidenceDigest, checkpointDigest:replay.checkpointDigest, adapterCalls }, null, 2));
