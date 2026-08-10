import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import { validateWorkItemVerificationArtifact, WorkItemVerificationArtifactValidationError } from "../src/work-item-verification-artifact-validator.mjs";
import { bindWorkItemVerificationSubject, expandWorkItemVerificationObligations, WorkItemVerificationInputError } from "../src/work-item-verification-input-guard.mjs";

const D = "sha256:" + "1".repeat(64);
const ref = (artifactId, artifact) => ({ artifactId, digest: canonicalJsonDigest(artifact) });
const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const workItem = { id:"WI-ONE", objective:"x", "bounded-scope":{included:["x"],excluded:["y"]}, deliverables:[{id:"DEL-ONE",description:"x",artifactKind:"RuntimeLibrary"}], "work-type":"code-change", "acceptance-criterion-refs":["AC-Z","AC-A"], "architecture-refs":["EL-B"], "contract-refs":["CT-C"], "required-capabilities":["CAP-X"], "dependency-hints":[], "verification-plan":{checks:[{id:"VC-Z",method:"z",successCriteria:"z"},{id:"VC-A",method:"a",successCriteria:"a"}]}, "required-evidence":[{kind:"test-log",description:"x"},{kind:"review",description:"y"}], "source-refs":[{role:"requirements-baseline",artifact:{artifactId:"R",digest:D},jsonPointer:"/x"}] };
const attempt = seal({ apiVersion:"devrelay.dev/v1alpha1",kind:"ExecutionAttempt",attemptId:"EA-1",workItemId:"WI-ONE",invocationFingerprint:D,bindingDigest:D,result:{artifactId:"RAW",digest:D},status:"proposed" }, "attemptDigest");
const change = { apiVersion:"devrelay.dev/v1alpha1",kind:"ChangeSetDraft",attemptId:"EA-1",mutations:[],changeDigest:canonicalJsonDigest([]) };
const evidence = { apiVersion:"devrelay.dev/v1alpha1",kind:"ExecutionEvidenceBundle",attemptId:"EA-1",evidence:[],evidenceDigest:canonicalJsonDigest([]) };
const artifacts = { workItem, executionAttempt:attempt, changeSetDraft:change, executionEvidenceBundle:evidence, verificationPolicy:{kind:"VerificationPolicy",version:"1.2.3"}, requirementsBaseline:{kind:"RequirementsBaseline",version:"1.0.0"}, projectOverviewBaseline:{kind:"ProjectOverviewBaseline",version:"1.0.0"}, architectureBaseline:{kind:"ArchitectureBaseline",version:"1.0.0"}, contractDisposition:{kind:"ContractDisposition",version:"1.0.0"}, workBreakdownBaseline:{kind:"WorkBreakdownBaseline",version:"1.0.0",workItems:[workItem]}, workDependencyBaseline:{kind:"WorkDependencyBaseline",version:"1.0.0"}, specialistAssignmentBaseline:{kind:"SpecialistAssignmentBaseline",version:"1.0.0"}, repositoryBase:{kind:"RepositorySnapshot",version:"1.0.0"}, candidateWorkspace:{kind:"CandidateWorkspace",version:"1.0.0"} };
const bindings = () => Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, { artifact:structuredClone(artifact), reference:ref(name, artifact) }]));
const bind = (overrides={}) => bindWorkItemVerificationSubject({subjectId:"SUB-1",workItemId:"WI-ONE",bindings:{...bindings(),...overrides}});

test("binds the exact subject and expands a byte-stable complete obligation set", () => {
  const subject = bind();
  const one = expandWorkItemVerificationObligations({subject,workItem,policyDutyRefs:["POL-Z","POL-A"]});
  const two = expandWorkItemVerificationObligations({subject,workItem,policyDutyRefs:["POL-A","POL-Z"]});
  assert.equal(canonicalJson(one), canonicalJson(two));
  assert.match(one.obligationSetId, /^OBS-[0-9A-F]{16}$/);
  assert.equal(one.obligations.length, 10);
  assert.ok(one.obligations.every(({requiredEvidenceKinds}) => canonicalJson(requiredEvidenceKinds) === canonicalJson(["review","test-log"])));
});

test("rejects missing, duplicate, stale, mismatched, and cross-attempt inputs", () => {
  const missing=bindings(); delete missing.repositoryBase;
  assert.throws(()=>bindWorkItemVerificationSubject({subjectId:"SUB",workItemId:"WI-ONE",bindings:missing}), WorkItemVerificationInputError);
  assert.throws(()=>bind({extra:{artifact:{},reference:ref("x",{})}}), /exactly one/);
  const stale=bindings(); stale.candidateWorkspace.reference.digest=D;
  assert.throws(()=>bindWorkItemVerificationSubject({subjectId:"SUB",workItemId:"WI-ONE",bindings:stale}), /stale or mismatched/);
  const wrong=structuredClone(attempt); wrong.workItemId="WI-TWO";
  assert.throws(()=>bind({executionAttempt:{artifact:wrong,reference:ref("attempt",wrong)}}), /requested work item/);
  const other=structuredClone(change); other.attemptId="EA-2";
  assert.throws(()=>bind({changeSetDraft:{artifact:other,reference:ref("change",other)}}), /another attempt/);
});

test("rejects duplicate plan duties and incomplete, reordered, or unauthorized proposed obligations", () => {
  const subject=bind();
  const duplicate=structuredClone(workItem); duplicate["verification-plan"].checks.push(structuredClone(duplicate["verification-plan"].checks[0]));
  const duplicateBaseline={...artifacts.workBreakdownBaseline,workItems:[duplicate]};
  const duplicateSubject=bind({workItem:{artifact:duplicate,reference:ref("workItem",duplicate)},workBreakdownBaseline:{artifact:duplicateBaseline,reference:ref("workBreakdownBaseline",duplicateBaseline)}});
  assert.throws(()=>expandWorkItemVerificationObligations({subject:duplicateSubject,workItem:duplicate}), /duplicate verification check/);
  const exact=expandWorkItemVerificationObligations({subject,workItem});
  assert.equal(expandWorkItemVerificationObligations({subject,workItem,proposedObligations:exact.obligations}).obligationSetDigest, exact.obligationSetDigest);
  assert.throws(()=>expandWorkItemVerificationObligations({subject,workItem,proposedObligations:exact.obligations.slice(1)}), /incomplete/);
  assert.throws(()=>expandWorkItemVerificationObligations({subject,workItem,proposedObligations:[...exact.obligations].reverse()}), /reordered/);
  assert.throws(()=>expandWorkItemVerificationObligations({subject,workItem,proposedObligations:[...exact.obligations,{...exact.obligations[0],obligationId:"OB-UNAUTHORIZED"}]}), /unauthorized/);
});

test("obligation set identity is material-derived and identity or digest drift fails closed", () => {
  const subject=bind();
  const exact=expandWorkItemVerificationObligations({subject,workItem,policyDutyRefs:["POL-A"]});
  const repeat=expandWorkItemVerificationObligations({subject,workItem,policyDutyRefs:["POL-A"]});
  assert.equal(repeat.obligationSetId, exact.obligationSetId);
  assert.equal(repeat.obligationSetDigest, exact.obligationSetDigest);
  assert.throws(()=>validateWorkItemVerificationArtifact({...exact,obligationSetId:"OBS-SUBSTITUTED"}), WorkItemVerificationArtifactValidationError);
  assert.throws(()=>validateWorkItemVerificationArtifact({...exact,obligationSetDigest:D}), WorkItemVerificationArtifactValidationError);
  const changed=expandWorkItemVerificationObligations({subject,workItem,policyDutyRefs:["POL-B"]});
  assert.notEqual(changed.obligationSetId, exact.obligationSetId);
  assert.notEqual(changed.obligationSetDigest, exact.obligationSetDigest);
});
