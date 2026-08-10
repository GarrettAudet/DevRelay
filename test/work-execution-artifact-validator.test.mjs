import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { documentValidators, validationDetail } from "../src/schema-validation.mjs";
import { validateWorkExecutionArtifact, WorkExecutionArtifactValidationError } from "../src/work-execution-artifact-validator.mjs";

const D = `sha256:${"a".repeat(64)}`;
const E = `sha256:${"b".repeat(64)}`;
const ref = (artifactId, digest = D) => ({ artifactId, digest });
const reject = (value, context) => assert.throws(() => validateWorkExecutionArtifact(value, context), WorkExecutionArtifactValidationError);
const bodySeal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const listSeal = (value, field, materialField) => ({ ...value, [field]: canonicalJsonDigest(value[materialField]) });
const task = JSON.parse(readFileSync(new URL("../dogfood/work-execution/execution/task-contracts/WI-WE-CONTRACTS.attempt-003.task.json", import.meta.url)));

const policy = bodySeal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ExecutionPolicy", policyId:"POL", version:"1.0.0", timeoutMilliseconds:1000, allowedPermissions:[{ kind:"filesystem.write", scope:{ values:["src/a.mjs"] } }], outputPolicy:{ maxEvidenceBytes:10, maxNativeArtifactBytes:10 } }, "policyDigest");
const binding = bodySeal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ExecutionBinding", bindingId:"BIND", workItemId:"WI-WE-CONTRACTS", specialistProfileId:"PROFILE", assignmentBaseline:ref("SAB"), executor:{ id:"executor.codex-task", version:"1.0.0" }, requiredCapabilities:["CAP-CONTRACT-AUTHORING"], requiredTools:["TOOL-NODE"], permissionDemands:[{ kind:"filesystem.write", scope:{ values:["src/a.mjs"] } }], executionPolicy:ref("POLICY", policy.policyDigest), configurationDigest:D }, "bindingDigest");
const invocation = bodySeal({ apiVersion:"devrelay.dev/v1alpha1", kind:"ExecutorInvocation", attemptId:"ATT-3", workItem:task.workItem, authoritativeInputs:[ref("WBB"),ref("WDB"),ref("COMPLETIONS"),ref("SAB"),ref("POLICY")].map((artifact,index)=>({name:`input-${index}`,artifact})), readinessProof:ref("READY"), executionBinding:ref("BINDING",binding.bindingDigest), executionPolicy:ref("POLICY",policy.policyDigest), projectOverviewBaseline:ref("POB"), repositorySnapshot:ref("REPO"), workspaceBaseDigest:D }, "invocationFingerprint");
const raw = { apiVersion:"devrelay.dev/v1alpha1", kind:"RawExecutorResult", attemptId:"ATT-3", invocationFingerprint:invocation.invocationFingerprint, bindingDigest:binding.bindingDigest, executor:{...binding.executor}, terminalState:"proposed", mutations:[{ operation:"modify", path:"src/a.mjs", beforeDigest:D, afterDigest:E }], evidence:[ref("EVIDENCE")], diagnostics:[], nativeArtifacts:[] };

test("module preserves the approved 0.1.0 surface and proposer-only executor", () => {
  const module = JSON.parse(readFileSync(new URL("../examples/modules/work-execution.module.json", import.meta.url)));
  assert.equal(documentValidators.moduleDefinition(module), true, validationDetail(documentValidators.moduleDefinition));
  assert.equal(module.metadata.version, "0.1.0");
  assert.deepEqual(module.operations[0].inputs.map(({name})=>name), ["work-item","work-breakdown-baseline","work-dependency-baseline","integrated-completion-facts","runnable-frontier-proof","specialist-assignment-baseline","execution-binding","execution-policy","project-overview-baseline","repository-snapshot","retry-lineage"]);
  assert.deepEqual(module.operations[0].extensionPorts, [{id:"executor",role:"proposer",inputSchema:"https://devrelay.dev/artifacts/executor-invocation/v1",outputSchema:"https://devrelay.dev/artifacts/raw-executor-result/v1",required:true}]);
});

test("permission demands use exactly the five canonical dotted kinds", () => {
  const kinds = ["filesystem.read","filesystem.write","network.connect","process.spawn","secrets.read"];
  for (const kind of kinds) assert.equal(validateWorkExecutionArtifact(bodySeal({...policy, allowedPermissions:[{kind,scope:{values:["bounded"]}}]},"policyDigest")).kind, "ExecutionPolicy");
  for (const kind of ["filesystem-read","filesystem-write","network-connect","process-execute","secret-read","repository.write"]) reject(bodySeal({...policy,allowedPermissions:[{kind,scope:{values:["bounded"]}}]},"policyDigest"));
});

test("canonical digest fields reject stale schema-valid mutations", () => {
  const frontier = bodySeal({apiVersion:"devrelay.dev/v1alpha1",kind:"RunnableFrontierProof",workItemId:"WI-X",workBreakdownBaseline:ref("WBB"),workDependencyBaseline:ref("WDB"),dependencyGraphDigest:D,prerequisiteCompletionFacts:[]},"readinessDigest");
  const completions = listSeal({apiVersion:"devrelay.dev/v1alpha1",kind:"IntegratedCompletionFactSet",facts:[]},"factsDigest","facts");
  const change = listSeal({apiVersion:"devrelay.dev/v1alpha1",kind:"ChangeSetDraft",attemptId:"ATT-3",mutations:raw.mutations},"changeDigest","mutations");
  const evidence = listSeal({apiVersion:"devrelay.dev/v1alpha1",kind:"ExecutionEvidenceBundle",attemptId:"ATT-3",evidence:raw.evidence},"evidenceDigest","evidence");
  const attempt = bodySeal({apiVersion:"devrelay.dev/v1alpha1",kind:"ExecutionAttempt",attemptId:"ATT-3",workItemId:"WI-X",invocationFingerprint:invocation.invocationFingerprint,bindingDigest:binding.bindingDigest,result:ref("RAW"),status:"proposed"},"attemptDigest");
  const retry = bodySeal({apiVersion:"devrelay.dev/v1alpha1",kind:"RetryLineage",attemptId:"ATT-3",predecessorAttempt:ref("ATT-2"),reason:"review-fix"},"retryDigest");
  const trace = bodySeal({apiVersion:"devrelay.dev/v1alpha1",kind:"ExecutionTraceabilityCandidate",attempt:ref("ATT-3"),workItemId:"WI-X",authority:"candidate",scope:"work-execution/attempt"},"traceabilityDigest");
  const cases = [
    [frontier, value=>value.workItemId="WI-Y"], [completions, value=>value.facts.push({workItemId:"WI-P",authority:"approved",integrationRef:ref("INT"),evidence:[ref("EV")]} )],
    [policy, value=>value.timeoutMilliseconds=2000], [binding, value=>value.configurationDigest=E], [invocation, value=>value.workspaceBaseDigest=E],
    [change, value=>value.mutations[0].path="src/b.mjs"], [evidence, value=>value.evidence.push(ref("OTHER"))], [attempt, value=>value.workItemId="WI-Y"],
    [retry, value=>value.reason="failure"], [trace, value=>value.workItemId="WI-Y"]
  ];
  for (const [valid, mutate] of cases) { assert.equal(validateWorkExecutionArtifact(valid), valid); const stale=structuredClone(valid); mutate(stale); reject(stale); }
});

test("RawExecutorResult is bound to the exact invocation, binding, and executor", () => {
  assert.equal(validateWorkExecutionArtifact(raw,{invocation,binding}),raw);
  reject({...raw,invocationFingerprint:E},{invocation,binding});
  reject({...raw,bindingDigest:E},{invocation,binding});
  reject({...raw,executor:{...raw.executor,id:"executor.substitute"}},{invocation,binding});
  reject({...raw,executor:{...raw.executor,version:"2.0.0"}},{invocation,binding});
  reject(raw);
});

test("ExecutorInvocation content-addresses workspace base", () => {
  assert.equal(validateWorkExecutionArtifact(invocation),invocation);
  const legacy={...invocation,workspaceBase:"C:/repo"}; delete legacy.workspaceBaseDigest; reject(legacy);
  reject({...invocation,workspaceBaseDigest:"C:/repo"});
});

test("prerequisites and mutation semantics preserve attempt-002 corrections", () => {
  const frontier=bodySeal({apiVersion:"devrelay.dev/v1alpha1",kind:"RunnableFrontierProof",workItemId:"WI-X",workBreakdownBaseline:ref("WBB"),workDependencyBaseline:ref("WDB"),dependencyGraphDigest:D,prerequisiteCompletionFacts:[{workItemId:"WI-P",authority:"approved",integrationRef:ref("INT"),evidence:[ref("EV")]}]},"readinessDigest");
  assert.equal(validateWorkExecutionArtifact(frontier),frontier);
  for (const path of ["C:/repo/a","C:\\repo\\a","/etc/a","\\rooted","\\\\server\\share\\a","../a","src/../a","src\\..\\a"]) reject({...raw,mutations:[{...raw.mutations[0],path}]},{invocation,binding});
  for (const mutation of [{operation:"create",beforeDigest:D,afterDigest:E},{operation:"modify",beforeDigest:null,afterDigest:E},{operation:"delete",beforeDigest:D,afterDigest:E}]) reject({...raw,mutations:[{...mutation,path:"a"}]},{invocation,binding});
});

test("executor output cannot claim downstream or graph authority", () => {
  for (const field of ["ready","verified","completed","integrated","graphUpdate"]) reject({...raw,[field]:true},{invocation,binding});
});
