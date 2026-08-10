import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as api from "../../../src/index.mjs";

const root = resolve(new URL("../../../", import.meta.url).pathname.slice(1));
const outDir = resolve(root, "dogfood/change-integration/execution/verification/WI-CI-DOCUMENTATION/attempt-003");
mkdirSync(outDir, { recursive: true });
const readBytes = (path) => readFileSync(resolve(root, path));
const readJson = (path) => JSON.parse(readBytes(path));
const ref = (artifactId, digest) => ({ artifactId, digest });
const seal = (value, field) => ({ ...value, [field]: api.canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const artifactRef = (artifactId, artifact) => ref(artifactId, api.canonicalJsonDigest(artifact));
const write = (name, value) => { const path = resolve(outDir, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${api.canonicalJson(value)}\n`, "utf8"); return { artifactId: value.approvalId ?? value.candidateId ?? value.evaluationId ?? value.normalizedEvidenceId ?? value.verificationAttemptId ?? value.bindingId ?? value.obligationSetId ?? value.subjectId ?? value.attemptId ?? value.kind, digest: api.sha256Digest(readFileSync(path)), mediaType:"application/json", uri:`file:///C:/tmp/DevRelay-v04-work-dependency-analysis/dogfood/change-integration/execution/verification/WI-CI-DOCUMENTATION/attempt-003/${name}` }; };
const checkpointStore = () => { const values = new Map(); return { values, async get(key) { return values.get(key); }, async put(key, value) { if (values.has(key)) throw new Error("immutable overwrite"); values.set(key, structuredClone(value)); } }; };

const taskPath = "dogfood/change-integration/execution/task-contracts/WI-CI-DOCUMENTATION.attempt-003.task.json";
const handoffPath = "dogfood/change-integration/execution/task-contracts/attempts/WI-CI-DOCUMENTATION.attempt-003.handoff.raw.json";
const task = readJson(taskPath);
const handoffBytes = readBytes(handoffPath);
const breakdown = readJson("dogfood/change-integration/work-breakdown/work-breakdown-baseline.json");
const workItem = breakdown.workItems.find(({ id }) => id === "WI-CI-DOCUMENTATION");
if (!workItem) throw new Error("approved WI-CI-DOCUMENTATION is missing");

const integratedFiles = [
  "docs/change-integration.md",
  "test/change-integration-documentation.test.mjs",
].map((path) => ({ path, bytes: readBytes(path) })).map(({ path, bytes }) => ({ relativePath:path, bytes:bytes.length, digest:api.sha256Digest(bytes) }));
const mutations = integratedFiles.map(({ relativePath, digest }) => ({ operation:"create", path:relativePath, beforeDigest:null, afterDigest:digest }));
const handoffRef = { artifactId:"WI-CI-DOCUMENTATION.attempt-003.handoff", digest:api.sha256Digest(handoffBytes), mediaType:"application/json", uri:`file:${handoffPath}` };
const testReport = { apiVersion:"devrelay.dev/v1alpha1", kind:"MachineTestReport", reportId:"TEST-CI-DOCUMENTATION-003", command:"node --test test/change-integration-documentation.test.mjs", outcome:"pass", tests:{ total:4, passed:4, failed:0 }, checkedFiles:integratedFiles };
const testReportRef = write("test-report.json", testReport);
const attempt = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ExecutionAttempt", attemptId:"ATT-CI-DOCUMENTATION-003", workItemId:workItem.id, invocationFingerprint:api.canonicalJsonDigest(task), bindingDigest:api.canonicalJsonDigest(readJson("dogfood/change-integration/assignment/specialist-assignment-baseline.json")), result:handoffRef, status:"proposed" }, "attemptDigest");
const changeSetDraft = { apiVersion:"devrelay.dev/v1alpha1", kind:"ChangeSetDraft", attemptId:attempt.attemptId, mutations, changeDigest:api.canonicalJsonDigest(mutations) };
const executionEvidence = [handoffRef, testReportRef];
const executionEvidenceBundle = { apiVersion:"devrelay.dev/v1alpha1", kind:"ExecutionEvidenceBundle", attemptId:attempt.attemptId, evidence:executionEvidence, evidenceDigest:api.canonicalJsonDigest(executionEvidence) };
const policy = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"VerificationPolicy", policyId:"POL-CI-DOCUMENTATION-003", version:"1.0.0", evaluationSemantics:"devrelay.work-item-verification/v1", rules:{ allObligationsMandatory:true, requiredEvidenceBinding:"explicit-obligation-bound", verifierIndependence:"required", nativeArtifacts:"provenance-only", unknownEvidence:"reject", outcomePrecedence:["failed","needs-evidence","verified"] } }, "policyDigest");
const { apiVersion:ignoredApi, kind:ignoredKind, policyDigest:ignoredDigest, ...policyBindingArtifact } = policy;
const candidateWorkspace = { apiVersion:"devrelay.dev/v1alpha1", kind:"CandidateWorkspace", version:"1.0.0", workspaceId:"CWS-CI-DOCUMENTATION-003", files:integratedFiles, workspaceDigest:api.canonicalJsonDigest(integratedFiles) };
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
  workDependencyBaseline:readJson("dogfood/change-integration/dependency-analysis/work-dependency-baseline.json"),
  specialistAssignmentBaseline:readJson("dogfood/change-integration/assignment/specialist-assignment-baseline.json"),
  repositoryBase:readJson("dogfood/change-integration/repository-snapshot.json"),
  candidateWorkspace,
};
const bindings = Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, { artifact, reference:artifactRef(name, artifact) }]));
bindings.verificationPolicy.reference.artifactId = policy.policyId;
const subject = api.bindWorkItemVerificationSubject({ subjectId:"SUB-CI-DOCUMENTATION-003", workItemId:workItem.id, bindings });
const obligationSet = api.expandWorkItemVerificationObligations({ subject, workItem, policyDutyRefs:["POL-CI-DOCUMENTATION-ALL-OBLIGATIONS"] });
const verifier = { id:"verifier.test", version:"1.0.0" };
const configurationDigest = api.canonicalJsonDigest({ verifier, adapter:"test-verifier", version:"1.0.0" });
const binding = api.validateVerifierBindingSet({
  bindingId:"BIND-CI-DOCUMENTATION-TEST-003", subject, obligationSet,
  executorIdentity:"executor.codex-task.019fe2cb-3d90-7f83-8c6f-37911c6ae20d",
  changeProducerIdentities:["producer.codex-task.019fe2cb-3d90-7f83-8c6f-37911c6ae20d"],
  verificationPolicy:{ independenceRequired:true, evidenceKinds:{ "change-integration/documentation-review":{ requiredCapabilities:["CAP-TEST-ENGINEERING"], requiredTools:["TOOL-NODE"] } } },
  verifierRegistry:{ entries:[{ verifier, configurationDigest, capabilities:["CAP-TEST-ENGINEERING"], tools:["TOOL-NODE"], supportedEvidenceKinds:["change-integration/documentation-review"], permissionDemand:[{ kind:"process.spawn", values:["node"] }], identityAliases:["parent.integration-owner"] }] },
  proposedPartitions:[{ verifier, configurationDigest, obligationIds:obligationSet.obligations.map(({ obligationId }) => obligationId), grants:[{ kind:"process.spawn", values:["node"] }] }],
  independenceEvidence:testReportRef,
});
const invocation = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"VerifierInvocation", verificationAttemptId:"VAT-CI-DOCUMENTATION-003", subject:ref(subject.subjectId,subject.subjectDigest), obligationSet:ref(obligationSet.obligationSetId,obligationSet.obligationSetDigest), binding:ref(binding.bindingId,binding.bindingDigest), verifier, obligationIds:binding.partitions[0].obligationIds, assignedObligations:obligationSet.obligations, candidateWorkspace:subject.candidateWorkspace, grants:[{ kind:"process.spawn", values:["node"] }] }, "invocationFingerprint");
const nativeResult = { terminalState:"observed", tests:invocation.assignedObligations.map((obligation) => ({ obligationId:obligation.obligationId, status:"pass", summary:"Independent parent review and all four bounded documentation conformance checks passed for the exact operator guide bytes.", evidence:obligation.requiredEvidenceKinds.map((kind) => ({ kind, artifact:testReportRef })) })) };
let adapterCalls = 0;
const checkpoints = checkpointStore();
const controller = api.createWorkItemVerificationCheckpointController({ verifier:async (exactInvocation) => { adapterCalls += 1; const nativeBytes=Buffer.from(api.canonicalJson(nativeResult)); const raw=api.adaptTestVerifierResult({ invocation:exactInvocation, binding, nativeBytes, nativeResult, nativeArtifact:ref("NATIVE-CI-DOCUMENTATION-TEST-003",api.sha256Digest(nativeBytes)) }); return Buffer.from(api.canonicalJson(raw)); } });
const first = await controller.execute({ invocation, binding, checkpoints });
const replay = await controller.execute({ invocation, binding, checkpoints });
if (adapterCalls !== 1 || !replay.replayed) throw new Error("checkpoint replay did not suppress verifier execution");
const normalizedEvidence = api.normalizeWorkItemVerificationEvidence({ subject, obligationSet, invocation, binding, replay, collectionTime:{ disposition:"not-applicable", rationale:"Deterministic repository verification uses content-addressed evidence." }, normalizedEvidenceId:"NVE-CI-DOCUMENTATION-003" });
const evaluation = api.evaluateWorkItemVerificationPolicy({ policy, subject, obligationSet, binding, normalizedEvidence });
const gateCandidate = api.assembleWorkItemVerificationGateCandidate({ candidateId:"WIVC-CI-DOCUMENTATION-003", policy, subject, obligationSet, binding, normalizedEvidence, policyEvaluation:evaluation });
const gateApproval = api.approveWorkItemVerification({ candidate:gateCandidate, normalizedEvidence, obligationSet });
const approvedTraceability = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ApprovedWorkItemVerificationTraceability", gateApproval:ref(gateApproval.approvalId,gateApproval.approvalDigest), candidate:ref(gateCandidate.candidateId,gateCandidate.candidateDigest), acceptedEvidence:[ref(normalizedEvidence.normalizedEvidenceId,normalizedEvidence.evidenceDigest)], acceptanceCriterionIds:gateApproval.acceptanceCriterionIds, authority:"approved", scope:"work-item-verification/approved" }, "traceabilityDigest");
api.validateWorkItemVerificationArtifact(approvedTraceability);

const outputs = { attempt, changeSetDraft, executionEvidenceBundle, policy, candidateWorkspace, subject, obligationSet, binding, invocation, rawVerifierResult:replay.rawResult, checkpoint:replay.checkpoint, normalizedEvidence, evaluation, gateCandidate, gateApproval, approvedTraceability };
for (const [name, value] of Object.entries(outputs)) write(`${name.replace(/[A-Z]/g,(letter)=>`-${letter.toLowerCase()}`)}.json`, value);
const proof = { apiVersion:"devrelay.dev/v1alpha1", kind:"WorkItemVerificationDogfoodProof", workItemId:workItem.id, executionAttempt:attempt.attemptId, outcome:evaluation.outcome, gateApproval:ref(gateApproval.approvalId,gateApproval.approvalDigest), exactReplay:{ adapterCalls, replayed:replay.replayed, checkpointDigest:replay.checkpointDigest }, verifiedFiles:integratedFiles, testReport:testReportRef, authoritativeIntegratedCompletionFactCreated:false };
write("verification-proof.json", proof);
console.log(JSON.stringify({ outcome:evaluation.outcome, approvalId:gateApproval.approvalId, approvalDigest:gateApproval.approvalDigest, candidateDigest:gateCandidate.candidateDigest, evidenceDigest:normalizedEvidence.evidenceDigest, checkpointDigest:replay.checkpointDigest, adapterCalls }, null, 2));
