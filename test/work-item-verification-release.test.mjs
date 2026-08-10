import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as api from "../src/index.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const json = (path) => JSON.parse(read(path));
const ref = (artifactId, digest) => ({ artifactId, digest });
const bodyDigest = (value, field) => api.canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));
const seal = (value, field) => ({ ...value, [field]: bodyDigest(value, field) });
const artifactRef = (artifactId, artifact) => ref(artifactId, api.canonicalJsonDigest(artifact));
const store = () => { const values = new Map(); return { values, async get(key) { return values.get(key); }, async put(key, value) { if (values.has(key)) throw new Error("immutable overwrite"); values.set(key, structuredClone(value)); } }; };

const receiptPath = "dogfood/work-execution/execution/host-integration/WI-WE-CONTRACTS.receipt.json";
const receiptBytes = read(receiptPath);
const receipt = JSON.parse(receiptBytes);
const receiptRawDigest = api.sha256Digest(receiptBytes);
const D = `sha256:${"a".repeat(64)}`;

function workExecutionSubject() {
  const task = json("dogfood/work-execution/execution/task-contracts/WI-WE-CONTRACTS.attempt-003.task.json");
  const workItem = {
    ...task.workItem,
    "verification-plan": { checks: [{ id:"VC-WI-WE-CONTRACTS-RELEASE", method:"Run the public WIV path", successCriteria:"Every exact obligation is verified." }] },
    "required-evidence": [{ kind:"test-report", description:"Deterministic machine verification" }, { kind:"review-record", description:"Independent review" }],
  };
  const attempt = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ExecutionAttempt", attemptId:"ATT-WI-WE-CONTRACTS-003", workItemId:workItem.id, invocationFingerprint:D, bindingDigest:D, result:ref("WI-WE-CONTRACTS.attempt-003.handoff", api.sha256Digest(read("dogfood/work-execution/execution/task-contracts/attempts/WI-WE-CONTRACTS.attempt-003.handoff.json"))), status:"proposed" }, "attemptDigest");
  const mutations = receipt.integratedFiles.map((file) => ({ operation:"create", path:file.relativePath, beforeDigest:null, afterDigest:file.digest }));
  const changeSetDraft = { apiVersion:"devrelay.dev/v1alpha1", kind:"ChangeSetDraft", attemptId:attempt.attemptId, mutations, changeDigest:api.canonicalJsonDigest(mutations) };
  const executionEvidenceBundle = { apiVersion:"devrelay.dev/v1alpha1", kind:"ExecutionEvidenceBundle", attemptId:attempt.attemptId, evidence:[{ artifactId:receipt.receiptId, digest:receiptRawDigest, mediaType:"application/json", uri:`file:${receiptPath}` }], evidenceDigest:api.canonicalJsonDigest([{ artifactId:receipt.receiptId, digest:receiptRawDigest, mediaType:"application/json", uri:`file:${receiptPath}` }]) };
  const verificationPolicy = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"VerificationPolicy", policyId:"POL-WIV-RELEASE", version:"1.0.0", evaluationSemantics:"devrelay.work-item-verification/v1", rules:{ allObligationsMandatory:true, requiredEvidenceBinding:"explicit-obligation-bound", verifierIndependence:"required", nativeArtifacts:"provenance-only", unknownEvidence:"reject", outcomePrecedence:["failed","needs-evidence","verified"] } }, "policyDigest");
  const { apiVersion:ignoredApi, kind:ignoredKind, policyDigest:ignoredDigest, ...verificationPolicyBinding } = verificationPolicy;
  const versioned = (kind, version="1.0.0", extra={}) => ({ apiVersion:"devrelay.dev/v1alpha1", kind, version, ...extra });
  const artifacts = {
    workItem,
    executionAttempt:attempt,
    changeSetDraft,
    executionEvidenceBundle,
    verificationPolicy:verificationPolicyBinding,
    requirementsBaseline:versioned("RequirementsBaseline"),
    projectOverviewBaseline:versioned("ProjectOverviewBaseline"),
    architectureBaseline:versioned("ArchitectureBaseline"),
    contractDisposition:versioned("ContractDisposition"),
    workBreakdownBaseline:versioned("WorkBreakdownBaseline", "1.4.0", { workItems:[workItem] }),
    workDependencyBaseline:versioned("WorkDependencyBaseline"),
    specialistAssignmentBaseline:versioned("SpecialistAssignmentBaseline"),
    repositoryBase:versioned("RepositorySnapshot"),
    candidateWorkspace:versioned("CandidateWorkspace"),
  };
  const bindings = Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, { artifact, reference:artifactRef(name, artifact) }]));
  bindings.verificationPolicy.reference.artifactId = verificationPolicy.policyId;
  const subject = api.bindWorkItemVerificationSubject({ subjectId:"SUB-WI-WE-CONTRACTS-003", workItemId:workItem.id, bindings });
  const obligationSet = api.expandWorkItemVerificationObligations({ subject, workItem, policyDutyRefs:["POL-WIV-RELEASE-GATE"] });
  return { artifacts, bindings, subject, obligationSet, workItem, verificationPolicy };
}

function bindingFor(subject, obligationSet, verifier) {
  const configurationDigest = api.canonicalJsonDigest(verifier);
  const entry = { verifier, configurationDigest, capabilities:["CAP-RELEASE-ENGINEERING","CAP-TEST-ENGINEERING"], tools:["TOOL-NODE"], supportedEvidenceKinds:["test-report","review-record"], permissionDemand:[], identityAliases:[`${verifier.id}.independent`] };
  return api.validateVerifierBindingSet({ bindingId:`BIND-${verifier.id.toUpperCase().replaceAll(".", "-")}`, subject, obligationSet, executorIdentity:"executor.wi-we-contracts", changeProducerIdentities:["producer.wi-we-contracts"], verificationPolicy:{ independenceRequired:true, evidenceKinds:{ "test-report":{ requiredCapabilities:["CAP-TEST-ENGINEERING"], requiredTools:["TOOL-NODE"] }, "review-record":{ requiredCapabilities:["CAP-RELEASE-ENGINEERING"], requiredTools:[] } } }, verifierRegistry:{ entries:[entry] }, proposedPartitions:[{ verifier, configurationDigest, obligationIds:obligationSet.obligations.map(({obligationId}) => obligationId), grants:[] }], independenceEvidence:ref("INDEPENDENCE-WIV-RELEASE", receiptRawDigest) });
}

function invocationFor(subject, obligationSet, binding, verifier, suffix) {
  const body = { apiVersion:"devrelay.dev/v1alpha1", kind:"VerifierInvocation", verificationAttemptId:`VAT-WIV-RELEASE-${suffix}`, subject:ref(subject.subjectId, subject.subjectDigest), obligationSet:ref(obligationSet.obligationSetId, obligationSet.obligationSetDigest), binding:ref(binding.bindingId, binding.bindingDigest), verifier, obligationIds:binding.partitions[0].obligationIds, assignedObligations:obligationSet.obligations, candidateWorkspace:subject.candidateWorkspace, grants:[] };
  return seal(body, "invocationFingerprint");
}

function nativeResult(invocation, adapterKind, status="pass") {
  const evidence = (obligation) => obligation.requiredEvidenceKinds.map((kind) => ({ kind, artifact:ref(`${adapterKind.toUpperCase()}-${kind.toUpperCase()}-${obligation.obligationId}`, receiptRawDigest) }));
  if (adapterKind === "test") return { terminalState:"observed", tests:invocation.assignedObligations.map((obligation) => ({ obligationId:obligation.obligationId, status, summary:`${status} public-boundary test observation`, evidence:status === "inconclusive" ? [] : evidence(obligation) })) };
  return { terminalState:"observed", findings:invocation.assignedObligations.map((obligation) => ({ obligationId:obligation.obligationId, disposition:status === "pass" ? "accepted" : status === "fail" ? "rejected" : "uncertain", summary:`${status} independent review observation`, evidence:status === "inconclusive" ? [] : evidence(obligation) })) };
}

async function checkpointedAdapter({ adapter, adapterKind, invocation, binding, status="pass" }) {
  let calls = 0;
  const checkpoints = store();
  const controller = api.createWorkItemVerificationCheckpointController({ verifier:async (exactInvocation) => {
    calls += 1;
    const native = nativeResult(exactInvocation, adapterKind, status);
    const nativeBytes = Buffer.from(api.canonicalJson(native));
    const raw = adapter({ invocation:exactInvocation, binding, nativeBytes, nativeResult:native, nativeArtifact:ref(`NATIVE-${adapterKind.toUpperCase()}-${status.toUpperCase()}`, api.sha256Digest(nativeBytes)) });
    return Buffer.from(api.canonicalJson(raw));
  } });
  const first = await controller.execute({ invocation, binding, checkpoints });
  const replay = await controller.execute({ invocation, binding, checkpoints });
  assert.equal(calls, 1);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(Buffer.from(replay.nativeBytes), Buffer.from(first.nativeBytes));
  assert.equal(api.canonicalJson(replay.rawResult), api.canonicalJson(first.rawResult));
  return { first, replay, calls };
}

function loaded(value, explicitId) {
  const bytes = Buffer.from(api.canonicalJson(value));
  const artifactId = explicitId ?? (value.traceabilityDigest ? `TRACE-${value.kind}` : undefined) ?? value.approvalId ?? value.normalizedEvidenceId ?? value.candidateId ?? value.subjectId ?? value.evaluationId ?? value.bindingId ?? value.obligationSetId ?? value.verificationAttemptId ?? value.policyId;
  return { value, bytes, ref:{ artifactId, digest:api.sha256Digest(bytes), schema:"https://devrelay.dev/test/v1", mediaType:"application/json", uri:`memory://${artifactId}` } };
}

function seedContributor(id, scope, authority, kind, stableId) { return { metadata:{id,version:"1.0.0"}, authority, scope, ownership:{authority,scope,nodeKinds:[kind],edgeKinds:[]}, match:({invocation})=>invocation.module.id===id, project:({loadedOutputs})=>({horizon:"verification",nodes:[{kind,stableId,label:stableId,attributes:{},sourceLocators:[{artifact:{artifactId:loadedOutputs.seed[0].ref.artifactId,digest:loadedOutputs.seed[0].ref.digest},jsonPointer:"",entityDigest:api.canonicalJsonDigest(loadedOutputs.seed[0].value)}]}],edges:[]})}; }
function seedRequirements(stableIds) { const id="seed-requirements"; return { metadata:{id,version:"1.0.0"}, authority:"approved", scope:"requirements/baseline", ownership:{authority:"approved",scope:"requirements/baseline",nodeKinds:["acceptance-criterion"],edgeKinds:[]}, match:({invocation})=>invocation.module.id===id, project:({loadedOutputs})=>({horizon:"verification",nodes:stableIds.map((stableId)=>({kind:"acceptance-criterion",stableId,label:stableId,attributes:{},sourceLocators:[{artifact:{artifactId:loadedOutputs.seed[0].ref.artifactId,digest:loadedOutputs.seed[0].ref.digest},jsonPointer:"",entityDigest:api.canonicalJsonDigest(loadedOutputs.seed[0].value)}]})),edges:[]})}; }

test("release boundary exposes every production operation required by the WIV path", () => {
  const required = ["validateWorkItemVerificationArtifact","bindWorkItemVerificationSubject","expandWorkItemVerificationObligations","validateVerifierBindingSet","createWorkItemVerificationCheckpointController","normalizeWorkItemVerificationEvidence","evaluateWorkItemVerificationPolicy","assembleWorkItemVerificationGateCandidate","approveWorkItemVerification","adaptTestVerifierResult","adaptReviewVerifierResult","workItemVerificationCandidateTraceabilityContributor","workItemVerificationApprovedTraceabilityContributor","createTraceabilityGraphService","createInMemoryTraceabilityStore"];
  assert.deepEqual(required.filter((name) => typeof api[name] === "undefined"), []);
});

test("package exposes the WIV and WorkExecution module definitions and WIV verifier plug-ins", () => {
  const pkg = json("package.json");
  const required = { "./modules/work-execution.module.json":"./examples/modules/work-execution.module.json", "./modules/work-item-verification.module.json":"./examples/modules/work-item-verification.module.json", "./plugins/test-verifier.plugin.json":"./examples/plugins/test-verifier.plugin.json", "./plugins/review-verifier.plugin.json":"./examples/plugins/review-verifier.plugin.json" };
  assert.deepEqual(Object.fromEntries(Object.keys(required).map((key) => [key, pkg.exports[key]])), required);
  for (const path of Object.values(required)) assert.ok(pkg.files.includes(path.replace(/^\.\//, "")));
});

test("exact WI-WE-CONTRACTS receipt traverses the public WIV boundary through atomic trace merge", async () => {
  assert.equal(receiptRawDigest, "sha256:9c527d427bbc106f2971b683445659337b820da8fe6e95b59d453e46cb2c69b2");
  assert.equal(receipt.receiptDigest, "sha256:c3d09b5b44ea81ee918319d73d0b92cb167f03f7d486f106d5b92d5aba9843f3");
  assert.equal(receipt.authoritativeIntegratedCompletionFactCreated, false);
  const context = workExecutionSubject();
  assert.equal(context.subject.executionEvidenceBundle.digest, api.canonicalJsonDigest(context.artifacts.executionEvidenceBundle));
  assert.deepEqual(context.artifacts.executionEvidenceBundle.evidence[0], { artifactId:receipt.receiptId, digest:receiptRawDigest, mediaType:"application/json", uri:`file:${receiptPath}` });

  const testVerifier = { id:"verifier.test", version:"1.0.0" };
  const testBinding = bindingFor(context.subject, context.obligationSet, testVerifier);
  const testInvocation = invocationFor(context.subject, context.obligationSet, testBinding, testVerifier, "TEST");
  const testRun = await checkpointedAdapter({ adapter:api.adaptTestVerifierResult, adapterKind:"test", invocation:testInvocation, binding:testBinding });
  const evidence = api.normalizeWorkItemVerificationEvidence({ subject:context.subject, obligationSet:context.obligationSet, invocation:testInvocation, binding:testBinding, replay:testRun.replay, collectionTime:{ disposition:"not-applicable", rationale:"Deterministic fixture-conformance release execution." }, normalizedEvidenceId:"NVE-WIV-RELEASE" });
  const evaluation = api.evaluateWorkItemVerificationPolicy({ policy:context.verificationPolicy, subject:context.subject, obligationSet:context.obligationSet, binding:testBinding, normalizedEvidence:evidence });
  assert.equal(evaluation.outcome, "verified");
  const candidate = api.assembleWorkItemVerificationGateCandidate({ candidateId:"WIVC-WI-WE-CONTRACTS-RELEASE", policy:context.verificationPolicy, subject:context.subject, obligationSet:context.obligationSet, binding:testBinding, normalizedEvidence:evidence, policyEvaluation:evaluation });
  assert.equal(candidate.authority, "candidate");
  const approval = api.approveWorkItemVerification({ candidate, normalizedEvidence:evidence, obligationSet:context.obligationSet });
  assert.throws(() => api.approveWorkItemVerification({ candidate, normalizedEvidence:evidence, obligationSet:context.obligationSet, proposedApproval:{...approval,approvalId:"WIVGA-FFFFFFFFFFFFFFFF"} }));

  const reviewVerifier = { id:"verifier.review", version:"1.0.0" };
  const reviewBinding = bindingFor(context.subject, context.obligationSet, reviewVerifier);
  const reviewInvocation = invocationFor(context.subject, context.obligationSet, reviewBinding, reviewVerifier, "REVIEW");
  const reviewRun = await checkpointedAdapter({ adapter:api.adaptReviewVerifierResult, adapterKind:"review", invocation:reviewInvocation, binding:reviewBinding });
  const reviewEvidence = api.normalizeWorkItemVerificationEvidence({ subject:context.subject, obligationSet:context.obligationSet, invocation:reviewInvocation, binding:reviewBinding, replay:reviewRun.replay, collectionTime:{ disposition:"not-applicable", rationale:"Deterministic independent review fixture." }, normalizedEvidenceId:"NVE-WIV-RELEASE-REVIEW" });
  assert.equal(reviewEvidence.items.length, context.obligationSet.obligations.length * 2);

  const candidateTrace = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"WorkItemVerificationTraceabilityCandidate", candidate:ref(candidate.candidateId,candidate.candidateDigest), subject:ref(context.subject.subjectId,context.subject.subjectDigest), evidence:ref(evidence.normalizedEvidenceId,evidence.evidenceDigest), authority:"candidate", scope:"work-item-verification/candidate" }, "traceabilityDigest");
  const approvedTrace = seal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ApprovedWorkItemVerificationTraceability", gateApproval:ref(approval.approvalId,approval.approvalDigest), candidate:ref(candidate.candidateId,candidate.candidateDigest), acceptedEvidence:[ref(evidence.normalizedEvidenceId,evidence.evidenceDigest)], acceptanceCriterionIds:approval.acceptanceCriterionIds, authority:"approved", scope:"work-item-verification/approved" }, "traceabilityDigest");
  api.validateWorkItemVerificationArtifact(candidateTrace);
  api.validateWorkItemVerificationArtifact(approvedTrace);
  const common = { policyArtifact:context.verificationPolicy, subject:context.subject, obligations:context.obligationSet, binding:testBinding, invocation:testInvocation, raw:testRun.replay.rawResult, evidence, evaluation, candidate, gateApproval:approval };
  const traceContext = (traceName, traceValue) => ({ invocation:{module:{id:"work-item-verification",version:"0.1.0",operation:"verify-work-item"}}, moduleResult:{status:"completed",outcome:"verified"}, loadedInputs:Object.fromEntries(Object.entries({...common,[traceName]:traceValue}).map(([name,value])=>[name,[loaded(value)]])), loadedOutputs:{} });
  const candidateProjection = await api.workItemVerificationCandidateTraceabilityContributor.project(traceContext("candidateTrace",candidateTrace));
  assert.deepEqual(candidateProjection.edges, []);
  assert.doesNotMatch(api.canonicalJson(candidateProjection), /integrat|completion|approved-by/);
  const approvedProjection = await api.workItemVerificationApprovedTraceabilityContributor.project(traceContext("approvedTrace",approvedTrace));
  assert.ok(approvedProjection.edges.every(({kind}) => kind === "verified-by"));

  const reqSeed = seedRequirements(approval.acceptanceCriterionIds);
  const workSeed = seedContributor("seed-work","work-breakdown/candidate","candidate","work-item",context.workItem.id);
  const service = api.createTraceabilityGraphService({ graphId:"wiv-release", projectId:"devrelay", store:api.createInMemoryTraceabilityStore(), contributors:[reqSeed,workSeed,api.workItemVerificationCandidateTraceabilityContributor,api.workItemVerificationApprovedTraceabilityContributor] });
  for (const contributor of [reqSeed,workSeed]) {
    const seed = loaded({apiVersion:"devrelay.dev/v1alpha1",kind:"Seed",id:contributor.metadata.id},contributor.metadata.id);
    const invocation = {invocationId:contributor.metadata.id,module:{id:contributor.metadata.id,version:"1",operation:"seed"}};
    const prepared = await service.prepare({baseGraph:service.captureBase(),invocation,invocationFingerprint:api.canonicalJsonDigest(invocation),moduleResult:{invocationId:invocation.invocationId,status:"completed",outcome:"seeded",outputs:{seed:[seed.ref]},evidence:[]},loadedOutputs:{seed:[seed]}});
    await service.mergePrepared(prepared);
  }
  const prepare = (ctx,id)=>service.prepare({baseGraph:service.captureBase(),invocation:{invocationId:id,...ctx.invocation},invocationFingerprint:api.canonicalJsonDigest({id}),moduleResult:{invocationId:id,...ctx.moduleResult,outputs:{},evidence:[]},loadedInputs:ctx.loadedInputs,loadedOutputs:{}});
  const candidatePrepared = await prepare(traceContext("candidateTrace",candidateTrace),"wiv-candidate");
  await service.mergePrepared(candidatePrepared);
  const approvedPrepared = await prepare(traceContext("approvedTrace",approvedTrace),"wiv-approved");
  const merged = await service.mergePrepared(approvedPrepared);
  assert.equal(merged.receipt.disposition, "merged");
  assert.match(merged.receipt.resultGraph.digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(merged.receipt.resultGraph.artifactId, /^traceability-graph-wiv-release-r\d+$/);
  assert.doesNotMatch(api.canonicalJson(merged.snapshot), /change-integration|integrated-completion|completion-fact/);
});

test("drift, independence, substitution, failed, and needs-evidence paths fail closed", async () => {
  const context = workExecutionSubject();
  const stale = structuredClone(context.bindings); stale.repositoryBase.reference.digest = D;
  assert.throws(() => api.bindWorkItemVerificationSubject({ subjectId:"SUB-DRIFT", workItemId:context.workItem.id, bindings:stale }), /stale or mismatched/);
  const verifier = {id:"verifier.test",version:"1.0.0"};
  assert.throws(() => bindingFor(context.subject,context.obligationSet,{id:"executor.wi-we-contracts",version:"1.0.0"}), /conflicts with change producer/);
  const binding = bindingFor(context.subject,context.obligationSet,verifier);
  const invocation = invocationFor(context.subject,context.obligationSet,binding,verifier,"NEGATIVE");
  const substitutedBody = {...invocation,verifier:{id:"verifier.review",version:"1.0.0"}}; delete substitutedBody.invocationFingerprint;
  const substituted = seal(substitutedBody,"invocationFingerprint");
  assert.throws(() => api.adaptTestVerifierResult({invocation:substituted,binding,nativeBytes:Buffer.from("{}"),nativeArtifact:ref("N",api.sha256Digest(Buffer.from("{}")))}), /substituted/);
  for (const [status,outcome] of [["fail","failed"],["inconclusive","needs-evidence"]]) {
    const run = await checkpointedAdapter({adapter:api.adaptTestVerifierResult,adapterKind:"test",invocation:invocationFor(context.subject,context.obligationSet,binding,verifier,status.toUpperCase()),binding,status});
    const evidence = api.normalizeWorkItemVerificationEvidence({subject:context.subject,obligationSet:context.obligationSet,invocation:run.replay.checkpoint.invocation,binding,replay:run.replay,collectionTime:{disposition:"not-applicable",rationale:"Negative outcome fixture."},normalizedEvidenceId:`NVE-${status.toUpperCase()}`});
    assert.equal(api.evaluateWorkItemVerificationPolicy({policy:context.verificationPolicy,subject:context.subject,obligationSet:context.obligationSet,binding,normalizedEvidence:evidence}).outcome,outcome);
  }
});

test("release evidence records executable attempt 002 without integration authority", () => {
  const evidence = json("dogfood/work-item-verification/release-verification/release-evidence.json");
  assert.equal(evidence.workItemId, "WI-WIV-VERIFICATION");
  assert.equal(evidence.attempt, 2);
  assert.equal(evidence.outcome, "pass");
  assert.equal(evidence.subject.rawBytesDigest, receiptRawDigest);
  assert.equal(evidence.liveProviderConformanceClaimed, false);
  assert.equal(evidence.changeIntegrationFactCreated, false);
  assert.equal(evidence.authoritativeVerificationCompletionFactCreated, false);
});
