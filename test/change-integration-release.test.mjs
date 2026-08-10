import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { validateChangeIntegrationArtifact } from "../src/change-integration-artifact-validator.mjs";
import { bindChangeIntegrationInputs } from "../src/change-integration-input-guard.mjs";
import { buildChangeIntegrationPlan } from "../src/change-integration-plan-builder.mjs";
import { authorizeChangeIntegrationEffect } from "../src/change-integration-target-cas.mjs";
import { createLocalGitIntegrationAdapter, localGitIntegrationConfigurationDigest } from "../src/change-integration-local-git-adapter.mjs";
import { createChangeIntegrationCheckpointController } from "../src/change-integration-checkpoint.mjs";
import { validateChangeIntegrationResult } from "../src/change-integration-result-validator.mjs";
import { changeIntegrationTraceabilityContributor } from "../src/change-integration-traceability-contributor.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService } from "../src/traceability-graph.mjs";

const API = "devrelay.dev/v1alpha1";
const D = `sha256:${"a".repeat(64)}`;
const ref = (artifactId, digest = D) => ({ artifactId, digest });
const fullRef = (artifactId, digest, schema = "https://devrelay.dev/test/v1", mediaType = "application/json") => ({ artifactId, schema, mediaType, digest, uri: `memory://artifacts/${artifactId}` });
const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

function artifactStore() {
  const values = new Map();
  return {
    values,
    put(bytes, { artifactId, schema = "https://devrelay.dev/test/v1", mediaType = "application/json" }) {
      const buffer = Buffer.from(bytes); const digest = sha256Digest(buffer);
      const reference = fullRef(artifactId, digest, schema, mediaType); values.set(digest, buffer); return reference;
    },
    async persistArtifact(bytes, metadata) { return this.put(bytes, metadata); },
    async readArtifact(reference) { return Buffer.from(values.get(reference.digest)); },
  };
}
function checkpointStore() {
  const values = new Map();
  return { values, async get(key) { return values.get(key); }, async put(key, value) { assert.equal(values.has(key), false); values.set(key, structuredClone(value)); } };
}
function loaded(value, artifactId, schema = "https://devrelay.dev/test/v1") {
  const bytes = Buffer.from(canonicalJson(value)); return { value, bytes, ref: fullRef(artifactId, sha256Digest(bytes), schema) };
}
const artifactBinding = (entry) => ({ artifact:entry.value, reference:entry.ref });

test("the root package exports the complete bounded ChangeIntegration surface", async () => {
  const entries = { validateChangeIntegrationArtifact, bindChangeIntegrationInputs, buildChangeIntegrationPlan,
    authorizeChangeIntegrationEffect, createLocalGitIntegrationAdapter,
    createChangeIntegrationCheckpointController, validateChangeIntegrationResult,
    changeIntegrationTraceabilityContributor };
  const index = await readFile(new URL("../src/index.mjs", import.meta.url), "utf8");
  for (const [name, entry] of Object.entries(entries)) {
    assert.equal(typeof entry === "function" || typeof entry === "object", true, `${name} must load`);
    assert.match(index, new RegExp(`\\b${name}\\b`), `${name} must be re-exported by the root package`);
  }
  assert.doesNotMatch(index, /createRepositoryIncorporationProof/);
});

test("one exact verified change integrates, validates, traces, and replays without downstream authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "devrelay-ci-release-"));
  const repo = join(root, "repo");
  try {
    execFileSync("git", ["init", "-b", "main", repo]);
    git(repo, "config", "user.name", "DevRelay Release Test"); git(repo, "config", "user.email", "release@test.invalid");
    await writeFile(join(repo, "base.txt"), "base\n"); git(repo, "add", "base.txt"); git(repo, "commit", "-m", "base");
    const base = git(repo, "rev-parse", "HEAD"); const baseTree = git(repo, "rev-parse", `${base}^{tree}`);
    git(repo, "checkout", "-b", "verified-change");
    await writeFile(join(repo, "change.txt"), "Gate-approved verified change\n"); git(repo, "add", "change.txt"); git(repo, "commit", "-m", "verified change");
    const source = git(repo, "rev-parse", "HEAD"); git(repo, "checkout", "main");

    const artifacts = artifactStore(); const native = artifactStore(); let effectCalls = 0;
    const configuration = { repositoryPath: repo, gitExecutable: "git", timeoutMs: 30_000, maxOutputBytes: 1024 * 1024 };
    const adapterIdentity = { id: "local-git-integration", version: "0.1.0", configurationDigest: localGitIntegrationConfigurationDigest(configuration) };
    const permissionDemands = [{ kind: "process.spawn", scope: { values: ["git"] } }];
    const work = loaded({ id:"WI-CI-VERIFICATION", "architecture-refs":["EL-CI"], "contract-refs":["CT-CI"] }, "WI-CI-VERIFICATION");
    const change = loaded({ kind:"ChangeSetDraft", mutations:[{ path:"change.txt" }] }, "CHANGE");
    const architecture = loaded({ apiVersion:API, kind:"ArchitectureBaseline", baselineId:"AB", version:"1.0.0", sections:{ architectureModel:{ content:{ elements:[{ id:"EL-CI" }] } } } }, "AB");
    const contracts = loaded({ apiVersion:API, kind:"ContractDisposition", dispositionId:"CD", version:"1.0.0", contractTargets:[{ id:"CT-CI" }] }, "CD");
    const baselineSpecs = [["requirementsBaseline","RequirementsBaseline","RB"],["projectOverviewBaseline","ProjectOverviewBaseline","POB"],["workBreakdownBaseline","WorkBreakdownBaseline","WBB"],["workDependencyBaseline","WorkDependencyBaseline","WDB"],["specialistAssignmentBaseline","SpecialistAssignmentBaseline","SAB"]];
    const baselineLoads = baselineSpecs.map(([,kind,id]) => loaded({ apiVersion:API, kind, baselineId:id, version:"1.0.0" }, id));
    const baselineArtifacts = { requirementsBaseline:artifactBinding(baselineLoads[0]), projectOverviewBaseline:artifactBinding(baselineLoads[1]), architectureBaseline:artifactBinding(architecture), contractDisposition:artifactBinding(contracts), workBreakdownBaseline:artifactBinding(baselineLoads[2]), workDependencyBaseline:artifactBinding(baselineLoads[3]), specialistAssignmentBaseline:artifactBinding(baselineLoads[4]) };
    const baselineRefs = Object.fromEntries(Object.entries(baselineArtifacts).map(([name,value]) => [name,value.reference]));
    const verificationPolicy = seal({ apiVersion:API, kind:"VerificationPolicy", policyId:"WIV-POLICY", version:"1.0.0", evaluationSemantics:"devrelay.work-item-verification/v1", rules:{ allObligationsMandatory:true, requiredEvidenceBinding:"explicit-obligation-bound", verifierIndependence:"required", nativeArtifacts:"provenance-only", unknownEvidence:"reject", outcomePrecedence:["failed","needs-evidence","verified"] } }, "policyDigest");
    const verificationSubject = seal({ apiVersion:API, kind:"ValidatedVerificationSubject", subjectId:"WIV-SUBJECT", workItemId:work.value.id, workItem:work.ref, executionAttempt:ref("EXECUTION-ATTEMPT"), changeSetDraft:change.ref, executionEvidenceBundle:ref("EXECUTION-EVIDENCE"), verificationPolicy:ref(verificationPolicy.policyId,verificationPolicy.policyDigest), ...baselineRefs, repositoryBase:ref("REPOSITORY-BASE"), candidateWorkspace:ref("CANDIDATE-WORKSPACE") }, "subjectDigest");
    const obligations = seal({ apiVersion:API, kind:"VerificationObligationSet", obligationSetId:"WIV-OBLIGATIONS", subject:ref(verificationSubject.subjectId,verificationSubject.subjectDigest), obligations:[{ obligationId:"OB-CI-RELEASE", kind:"acceptance-criterion", sourceRef:"AC-DEV-CI-SUCCESS-001", requiredEvidenceKinds:["test-report"] }] }, "obligationSetDigest");
    const verifierBinding = seal({ apiVersion:API, kind:"ValidatedVerifierBindingSet", bindingId:"WIV-BINDING", subject:ref(verificationSubject.subjectId,verificationSubject.subjectDigest), obligationSet:ref(obligations.obligationSetId,obligations.obligationSetDigest), executorIdentity:"executor.release", partitions:[{ verifier:{ id:"verifier.release", version:"1.0.0" }, obligationIds:["OB-CI-RELEASE"], permissionDemand:[{ kind:"process.spawn", values:["node"] }] }], independence:{ required:true, satisfied:true, evidence:ref("INDEPENDENCE") } }, "bindingDigest");
    const normalized = seal({ apiVersion:API, kind:"NormalizedVerificationEvidence", normalizedEvidenceId:"WIV-EVIDENCE", verificationAttemptId:"WIV-ATTEMPT", subject:ref(verificationSubject.subjectId,verificationSubject.subjectDigest), invocationFingerprint:D, bindingDigest:verifierBinding.bindingDigest, checkpointDigest:D, rawResultDigest:D, collectionTime:{ disposition:"not-applicable", rationale:"release fixture" }, nativeArtifacts:[], items:[{ evidenceId:"WIV-EV-1", subjectDigest:verificationSubject.subjectDigest, observationId:"OBS-1", observationDigest:D, obligationId:"OB-CI-RELEASE", kind:"test-report", status:"pass", artifact:ref("TEST-REPORT"), producer:{ id:"verifier.release", version:"1.0.0" } }] }, "evidenceDigest");
    const policyEvaluation = seal({ apiVersion:API, kind:"VerificationPolicyEvaluation", evaluationId:"WIVPE-1111111111111111", subject:ref(verificationSubject.subjectId,verificationSubject.subjectDigest), obligationSet:ref(obligations.obligationSetId,obligations.obligationSetDigest), verificationPolicy:ref(verificationPolicy.policyId,verificationPolicy.policyDigest), verifierBinding:ref(verifierBinding.bindingId,verifierBinding.bindingDigest), normalizedEvidence:ref(normalized.normalizedEvidenceId,normalized.evidenceDigest), outcome:"verified", dispositions:[{ obligationId:"OB-CI-RELEASE", status:"satisfied", evidenceIds:["WIV-EV-1"] }], reasons:[{ code:"VERIFIED_ALL_OBLIGATIONS" }] }, "evaluationDigest");
    const verificationCandidate = seal({ apiVersion:API, kind:"WorkItemVerificationGateCandidate", candidateId:"WIV-CANDIDATE", subject:ref(verificationSubject.subjectId,verificationSubject.subjectDigest), obligationSet:ref(obligations.obligationSetId,obligations.obligationSetDigest), verifierBinding:ref(verifierBinding.bindingId,verifierBinding.bindingDigest), normalizedEvidence:ref(normalized.normalizedEvidenceId,normalized.evidenceDigest), policyEvaluation:ref(policyEvaluation.evaluationId,policyEvaluation.evaluationDigest), outcome:"verified", authority:"candidate" }, "candidateDigest");
    const approvalMaterial = { decision:"approved", candidate:ref(verificationCandidate.candidateId,verificationCandidate.candidateDigest), acceptedEvidence:[ref(normalized.normalizedEvidenceId,normalized.evidenceDigest)], acceptanceCriterionIds:["AC-DEV-CI-SUCCESS-001"], authority:"work-item-verification-gate" };
    const gateApproval = seal({ apiVersion:API, kind:"WorkItemVerificationGateApproval", approvalId:`WIVGA-${canonicalJsonDigest(approvalMaterial).slice(7,23).toUpperCase()}`, ...approvalMaterial }, "approvalDigest");
    const targetSnapshot = { apiVersion:API, kind:"RepositorySnapshot", repository:repo, revision:base, treeDigest:canonicalJsonDigest({ commit:base, tree:baseTree }), includedPaths:["base.txt"], excludedPaths:[".git"] };
    const targetLoaded = loaded(targetSnapshot,"PRE"); const policyBytes = Buffer.from("release integration policy\n"); const integrationPolicy = { kind:"IntegrationPolicy", version:"1.0.0" }; const integrationPolicyRef = fullRef("CI-POLICY",sha256Digest(policyBytes));
    const validatedInput = bindChangeIntegrationInputs({ subjectId:"CI-SUBJECT", bindingId:"CI-BINDING", workItem:work.value, workItemRef:work.ref, verificationSubject, verificationCandidate, verificationContext:{ policyEvaluation, subject:verificationSubject, obligations, binding:verifierBinding, normalizedEvidence:normalized }, gateApproval, verifiedChange:change.value, verifiedChangeRef:change.ref, verifiedChangeBytes:change.bytes, verificationEvidence:gateApproval.acceptedEvidence, baselines:baselineArtifacts, target:artifactBinding(targetLoaded), targetRef:"refs/heads/main", expectedCommit:base, integrationPolicy, integrationPolicyRef, integrationPolicyBytes:policyBytes, adapter:adapterIdentity, permissionDemands, hostGrants:permissionDemands, idempotencyKey:"CI-RELEASE-001" });
    const { subject } = validatedInput;
    const plan = buildChangeIntegrationPlan({ planId:"CI-PLAN", validatedInput, verifiedChangeBytes:change.bytes, sourceCommit:source, strategy:"fast-forward" });
    const localAdapter = createLocalGitIntegrationAdapter({ ...configuration,
      persistNativeEvidence: async (bytes) => native.put(bytes, { artifactId:`NATIVE-${native.values.size}`, mediaType:"application/vnd.devrelay.local-git-native-evidence+json" }),
      readNativeEvidence: native.readArtifact.bind(native) });
    const raw = artifactStore(); const checkpoints = checkpointStore(); let checkpointCalls = 0; let casCallbacks = 0;
    const controller = createChangeIntegrationCheckpointController({
      effect: async (request) => { effectCalls += 1; return localAdapter(request, { invocationFingerprint:request.invocationFingerprint, targetRef:plan.transition.targetRef, expectedTargetCommit:base }); },
      persistRawResult: async (bytes) => raw.put(bytes, { artifactId:"RAW", schema:"https://devrelay.dev/contracts/change-integration-artifacts.schema.json#/$defs/rawEffectResult", mediaType:"application/vnd.devrelay.raw-integration-effect-result+json" }),
      readRawResult: raw.readArtifact.bind(raw),
    });
    const coordinated = await authorizeChangeIntegrationEffect({ plan, invocationId:"CI-INVOCATION", observeTarget:async () => ({ ref:"refs/heads/main", commit:git(repo,"rev-parse","main") }), applyAtomicConditionalEffect:async ({ invocation }) => { casCallbacks += 1; checkpointCalls += 1; return controller.execute({ plan, invocation, checkpoints }); } });
    assert.equal(coordinated.outcome,"authorized-effect-result"); const invocation = coordinated.invocation; const first = coordinated.effectResult;
    checkpointCalls += 1; const replay = await controller.execute({ plan, invocation, checkpoints });
    assert.ok(first.rawResult, first.diagnostic?.message ?? "integration effect did not return a raw result");
    assert.equal(first.rawResult.terminalState, "integrated"); assert.equal(git(repo, "rev-parse", "main"), source);
    assert.equal(effectCalls, 1); assert.equal(casCallbacks,1); assert.equal(replay.effectCalls, 0); assert.deepEqual(replay.rawResult, first.rawResult);
    const beforeDrift = { effectCalls, checkpointCalls, casCallbacks };
    const drift = await authorizeChangeIntegrationEffect({ plan, invocationId:"CI-DRIFT", observeTarget:async () => ({ ref:"refs/heads/main", commit:source }), applyAtomicConditionalEffect:async () => { casCallbacks += 1; checkpointCalls += 1; return assert.fail("drift must not authorize an effect"); } });
    assert.equal(drift.outcome,"baseline-drift"); assert.deepEqual({ effectCalls, checkpointCalls, casCallbacks },beforeDrift);

    const snapshot = (revision, treeDigest) => ({ apiVersion:API, kind:"RepositorySnapshot", repository:"isolated-release-test", revision, treeDigest, includedPaths:["base.txt", "change.txt"], excludedPaths:[".git"] });
    const postSnapshot = snapshot(source, first.rawResult.postState.treeDigest); const postBytes = Buffer.from(canonicalJson(postSnapshot));
    const postRef = artifacts.put(postBytes, { artifactId:"POST", schema:"https://devrelay.dev/artifacts/repository-snapshot/v1", mediaType:"application/vnd.devrelay.repository-snapshot+json" });
    const proof = { apiVersion:API, kind:"RepositoryIncorporationProof", invocationId:invocation.invocationId, invocationFingerprint:invocation.invocationFingerprint, targetRef:"refs/heads/main", strategy:"fast-forward", expectedTargetCommit:base, sourceCommit:source, postCommit:source, postTreeDigest:first.rawResult.postState.treeDigest, parentCommits:[base], sourceIncorporated:true };
    const proofBytes = Buffer.from(canonicalJson(proof)); const proofRef = artifacts.put(proofBytes, { artifactId:"PROOF", schema:"https://devrelay.dev/internal/change-integration/repository-incorporation-proof/v1", mediaType:"application/vnd.devrelay.repository-incorporation-proof+json" });
    const rawRef = replay.checkpoint.rawResult;
    const readArtifact = async (reference) => {
      const bytes = artifacts.values.get(reference.digest) ?? raw.values.get(reference.digest);
      if (!bytes) throw new Error(`missing artifact ${reference.artifactId}`);
      return Buffer.from(bytes);
    };
    const result = await validateChangeIntegrationResult({ subject, plan, invocation, checkpointReplay:replay,
      rawResultArtifact:fullRef(rawRef.artifactId, rawRef.digest, "https://devrelay.dev/contracts/change-integration-artifacts.schema.json#/$defs/rawEffectResult", "application/vnd.devrelay.raw-integration-effect-result+json"),
      preRepositorySnapshot:snapshot(base, first.rawResult.preState.treeDigest), postRepositorySnapshotRef:postRef, postRepositorySnapshotBytes:postBytes,
      incorporationProofRef:proofRef, incorporationProofBytes:proofBytes, persistArtifact:artifacts.persistArtifact.bind(artifacts), readArtifact });
    assert.equal(result.outcome, "integrated"); assert.equal("systemVerified" in result, false); assert.equal("businessAccepted" in result, false);

    const recordRef = result.outputs["integrated-change-record"][0]; const record = JSON.parse((await artifacts.readArtifact(recordRef)).toString());
    const subjectLoaded = loaded(subject, subject.subjectId); const binding = validatedInput.binding;
    const bindingLoaded = loaded(binding, binding.bindingId); const recordLoaded = { value:record, bytes:await artifacts.readArtifact(recordRef), ref:recordRef }; const postLoaded = { value:postSnapshot, bytes:postBytes, ref:postRef };
    const resultLoaded = loaded(result, "CI-RESULT"); const trace = seal({ apiVersion:API, kind:"ChangeIntegrationTraceabilityInput", integratedChange:ref(recordRef.artifactId,recordRef.digest), subject:ref(subject.subjectId,subject.subjectDigest), repositorySnapshot:ref(postRef.artifactId,postRef.digest), authority:"approved", scope:"change-integration/integrated" }, "traceabilityDigest"); const traceLoaded = loaded(trace,"CI-TRACE");
    const context = { invocation:{ invocationId:invocation.invocationId, module:{ id:"change-integration", version:"0.1.0", operation:"integrate-change" } }, invocationFingerprint:invocation.invocationFingerprint, moduleResult:result,
      loadedInputs:{ "verified-work-item-subject":[subjectLoaded], "integration-input-binding":[bindingLoaded] }, loadedOutputs:{ "integrated-change-record":[recordLoaded], "repository-snapshot":[postLoaded] }, loadedAttachments:{ result:resultLoaded, trace:traceLoaded, work, change, architecture, contracts, baselineLoads } };
    const projected = await changeIntegrationTraceabilityContributor.project(context);
    const sources = [["work-breakdown/candidate","candidate","work-item","WI-CI-VERIFICATION"],["architecture/baseline","approved","architecture-element","EL-CI"],["contracts/baseline","approved","contract","CT-CI"]].map(([scope,authority,kind,stableId], i) => ({ metadata:{ id:`release.source-${i}`, version:"1.0.0" }, scope, authority, ownership:{ scope, authority, nodeKinds:[kind], edgeKinds:[] }, match:()=>true, project:()=>({ horizon:"implementation", nodes:[{ kind, stableId, label:stableId, attributes:{}, sourceLocators:projected.edges[0].sourceLocators }], edges:[] }) }));
    const graph = createTraceabilityGraphService({ graphId:"ci-release", projectId:"devrelay", store:createInMemoryTraceabilityStore(), contributors:[...sources, changeIntegrationTraceabilityContributor] });
    const prepared = await graph.prepare({ ...context, baseGraph:graph.captureBase() }); const merged = await graph.mergePrepared(prepared); const replayedMerge = await graph.mergePrepared(prepared);
    assert.equal(merged.receipt.disposition,"merged"); assert.deepEqual(replayedMerge.receipt,merged.receipt); assert.equal(graph.captureBase().revision,1);
    assert.equal(projected.edges.some(({ kind }) => kind === "verified-by"), false);
  } finally { await rm(root, { recursive:true, force:true }); }
});
