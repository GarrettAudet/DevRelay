import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { bindWorkItemVerificationSubject, expandWorkItemVerificationObligations, WorkItemVerificationInputError } from "../src/work-item-verification-input-guard.mjs";
import { evaluateWorkItemVerificationPolicy } from "../src/work-item-verification-policy-evaluator.mjs";
import { approveWorkItemVerification, assembleWorkItemVerificationGateCandidate } from "../src/work-item-verification-gate.mjs";
import { bindChangeIntegrationInputs, ChangeIntegrationInputError } from "../src/change-integration-input-guard.mjs";

const API = { apiVersion: "devrelay.dev/v1alpha1" };
const D = `sha256:${"a".repeat(64)}`;
const COMMIT = "1".repeat(40);
const BASELINES = {
  requirementsBaseline: "RequirementsBaseline",
  projectOverviewBaseline: "ProjectOverviewBaseline",
  architectureBaseline: "ArchitectureBaseline",
  contractDisposition: "ContractDisposition",
  workBreakdownBaseline: "WorkBreakdownBaseline",
  workDependencyBaseline: "WorkDependencyBaseline",
  specialistAssignmentBaseline: "SpecialistAssignmentBaseline",
};
const ref = (artifactId, digest = D) => ({ artifactId, digest });
const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const canonicalBinding = (artifact, artifactId) => ({ artifact, reference: ref(artifactId, canonicalJsonDigest(artifact)) });

// Synthetic conformance artifacts exercise owning helpers. They attest no live
// verifier run, current project approval, integration effect, or release.
function fixture(format = (value) => `${JSON.stringify(value, null, 2)}\n`) {
  const workItem = {
    id: "WI-BYTE-HANDOFF", "acceptance-criterion-refs": ["AC-BYTE-HANDOFF"],
    "required-evidence": [{ kind: "test-report", description: "fixture evidence" }],
  };
  const attempt = seal({ ...API, kind: "ExecutionAttempt", attemptId: "EA-BYTE", workItemId: workItem.id, invocationFingerprint: D, bindingDigest: D, result: ref("RAW"), status: "proposed" }, "attemptDigest");
  const change = { ...API, kind: "ChangeSetDraft", attemptId: attempt.attemptId, mutations: [], changeDigest: canonicalJsonDigest([]) };
  const evidence = { ...API, kind: "ExecutionEvidenceBundle", attemptId: attempt.attemptId, evidence: [], evidenceDigest: canonicalJsonDigest([]) };
  const policyBody = {
    policyId: "VP-BYTE", version: "1.0.0", evaluationSemantics: "devrelay.work-item-verification/v1",
    rules: { allObligationsMandatory: true, requiredEvidenceBinding: "explicit-obligation-bound", verifierIndependence: "required", nativeArtifacts: "provenance-only", unknownEvidence: "reject", outcomePrecedence: ["failed", "needs-evidence", "verified"] },
  };
  const policy = seal({ ...API, kind: "VerificationPolicy", ...policyBody }, "policyDigest");
  const baselines = Object.fromEntries(Object.entries(BASELINES).map(([name, kind]) => {
    const artifactId = `BASELINE-${name}`;
    const idField = name === "contractDisposition" ? "dispositionId" : "baselineId";
    const artifact = { ...API, kind, [idField]: artifactId, version: "1.0.0", ...(name === "workBreakdownBaseline" ? { workItems: [workItem] } : {}) };
    const rawBytes = Buffer.from(format(artifact));
    return [name, { artifact, reference: ref(artifactId, sha256Digest(rawBytes)), rawBytes }];
  }));
  const snapshot = { ...API, kind: "RepositorySnapshot", repository: "C:/fixture", revision: COMMIT, treeDigest: D, includedPaths: ["src/**"], excludedPaths: [".git/**"] };
  const target = canonicalBinding(snapshot, "REPO-BYTE");
  const bindings = {
    workItem: canonicalBinding(workItem, workItem.id), executionAttempt: canonicalBinding(attempt, attempt.attemptId),
    changeSetDraft: canonicalBinding(change, "CHANGE-BYTE"), executionEvidenceBundle: canonicalBinding(evidence, "EXEC-EV-BYTE"),
    verificationPolicy: canonicalBinding(policyBody, policy.policyId), ...baselines,
    repositoryBase: target, candidateWorkspace: canonicalBinding({ kind: "CandidateWorkspace", version: "1.0.0" }, "WS-BYTE"),
  };
  const bindSubject = (overrides = {}) => bindWorkItemVerificationSubject({ subjectId: "SUB-BYTE", workItemId: workItem.id, bindings: { ...bindings, ...overrides } });

  function integrationInput(subject = bindSubject()) {
    const obligationSet = expandWorkItemVerificationObligations({ subject, workItem });
    const binding = seal({
      ...API, kind: "ValidatedVerifierBindingSet", bindingId: "VERIFIERS-BYTE", subject: ref(subject.subjectId, subject.subjectDigest),
      obligationSet: ref(obligationSet.obligationSetId, obligationSet.obligationSetDigest), executorIdentity: "fixture.executor",
      partitions: [{ verifier: { id: "fixture.verifier", version: "1.0.0" }, obligationIds: obligationSet.obligations.map(({ obligationId }) => obligationId), permissionDemand: [] }],
      independence: { required: true, satisfied: true, evidence: ref("FIXTURE-INDEPENDENCE") },
    }, "bindingDigest");
    const normalizedEvidence = seal({
      ...API, kind: "NormalizedVerificationEvidence", normalizedEvidenceId: "NE-BYTE", verificationAttemptId: "VAT-BYTE",
      subject: ref(subject.subjectId, subject.subjectDigest), invocationFingerprint: D, bindingDigest: binding.bindingDigest, checkpointDigest: D, rawResultDigest: D,
      collectionTime: { disposition: "not-applicable", rationale: "synthetic conformance fixture" }, nativeArtifacts: [],
      items: obligationSet.obligations.map(({ obligationId }, index) => ({
        evidenceId: `EV-${index}`, subjectDigest: subject.subjectDigest, observationId: `O-${index}`, observationDigest: D,
        obligationId, kind: "test-report", status: "pass", artifact: ref(`FIXTURE-TEST-${index}`), producer: { id: "fixture.verifier", version: "1.0.0" },
      })),
    }, "evidenceDigest");
    const context = { policy, subject, obligationSet, binding, normalizedEvidence };
    const policyEvaluation = evaluateWorkItemVerificationPolicy(context);
    const verificationCandidate = assembleWorkItemVerificationGateCandidate({ candidateId: "CANDIDATE-BYTE", ...context, policyEvaluation });
    const gateApproval = approveWorkItemVerification({ candidate: verificationCandidate, normalizedEvidence, obligationSet });
    const integrationPolicy = { kind: "IntegrationPolicy", version: "1.0.0" };
    const demands = [{ kind: "process.spawn", scope: { values: ["fixture-integrator"] } }];
    return {
      subjectId: "INTEGRATION-SUB-BYTE", bindingId: "INTEGRATION-BYTE", workItem, workItemRef: bindings.workItem.reference,
      verificationSubject: subject, verificationCandidate, verificationContext: { ...context, obligations: obligationSet, policyEvaluation }, gateApproval,
      verifiedChange: change, verifiedChangeRef: bindings.changeSetDraft.reference, verifiedChangeBytes: Buffer.from(canonicalJson(change)),
      verificationEvidence: gateApproval.acceptedEvidence, baselines, target, targetRef: "refs/heads/main", expectedCommit: COMMIT,
      integrationPolicy, integrationPolicyRef: ref("IP-BYTE", canonicalJsonDigest(integrationPolicy)),
      adapter: { id: "fixture.integrator", version: "1.0.0", configurationDigest: D }, permissionDemands: demands, hostGrants: demands, idempotencyKey: "BYTE-1",
    };
  }
  return { workItem, bindings, baselines, bindSubject, integrationInput };
}

function assertInputFailure(operation, ErrorType, code) {
  assert.throws(operation, (error) => error instanceof ErrorType && error.code === code);
}

test("seven noncanonical byte identities survive subject, owning Gate, and integration binding", () => {
  const formats = [
    (value) => JSON.stringify(value, null, 2),
    (value) => JSON.stringify(Object.fromEntries(Object.entries(value).reverse())),
    (value) => `${canonicalJson(value)}\n`,
  ];
  for (const format of formats) {
    const input = fixture(format);
    const subject = input.bindSubject();
    const args = input.integrationInput(subject);
    const integrated = bindChangeIntegrationInputs(args);
    for (const [name, entry] of Object.entries(input.baselines)) {
      assert.notEqual(entry.reference.digest, canonicalJsonDigest(entry.artifact), name);
      assert.deepEqual(subject[name], entry.reference, name);
      assert.deepEqual(integrated.binding.baselines[name], entry.reference, name);
      assert.equal(Object.isFrozen(integrated.binding.baselines[name]), true);
      assert.equal(args.verificationCandidate.subject.digest, subject.subjectDigest);
    }
    const before = canonicalJson(integrated);
    input.baselines.requirementsBaseline.reference.digest = D;
    input.baselines.requirementsBaseline.artifact.version = "9.0.0";
    input.baselines.requirementsBaseline.rawBytes.fill(0);
    assert.equal(canonicalJson(integrated), before, "result is detached from mutable input");
  }
});

test("Uint8Array baseline bytes have the same identity as Buffer bytes", () => {
  const input = fixture();
  const expected = input.bindSubject();
  for (const entry of Object.values(input.baselines)) entry.rawBytes = Uint8Array.from(entry.rawBytes);
  assert.deepEqual(input.bindSubject(), expected);
  assert.doesNotThrow(() => bindChangeIntegrationInputs(input.integrationInput()));
});

test("all seven bindings reject stale bytes, object substitution, and explicit malformed bytes", () => {
  const mutations = [
    (entry) => { entry.rawBytes = Buffer.concat([entry.rawBytes, Buffer.from(" ")]); },
    (entry) => { entry.artifact.version = "1.0.1"; },
    (entry) => { entry.rawBytes = undefined; },
    (entry) => { entry.rawBytes = null; },
    (entry) => { entry.rawBytes = entry.rawBytes.toString(); },
    (entry) => { entry.rawBytes = [...entry.rawBytes]; },
    (entry) => { entry.extra = true; },
    (entry) => { delete entry.reference; },
  ];
  for (const name of Object.keys(BASELINES)) {
    for (const mutate of mutations) {
      const input = fixture();
      const args = input.integrationInput();
      const changed = structuredClone(input.baselines[name]);
      mutate(changed);
      assertInputFailure(() => input.bindSubject({ [name]: changed }), WorkItemVerificationInputError, "DR4071");
      assertInputFailure(() => bindChangeIntegrationInputs({ ...args, baselines: { ...args.baselines, [name]: changed } }), ChangeIntegrationInputError, "DR4091");
    }
  }
});

test("matching digests cannot authorize malformed UTF-8, JSON, nonobjects, or substituted parsed values", () => {
  const values = [Buffer.from([0xc3, 0x28]), Buffer.from('{"kind":'), Buffer.from("{} {}"), Buffer.from("null"), Buffer.from("[]"), Buffer.from("42"), Buffer.from("{}")];
  const input = fixture();
  const args = input.integrationInput();
  for (const rawBytes of values) {
    const changed = { ...input.baselines.requirementsBaseline, rawBytes, reference: ref("BASELINE-requirementsBaseline", sha256Digest(rawBytes)) };
    assertInputFailure(() => input.bindSubject({ requirementsBaseline: changed }), WorkItemVerificationInputError, "DR4071");
    assertInputFailure(() => bindChangeIntegrationInputs({ ...args, baselines: { ...args.baselines, requirementsBaseline: changed } }), ChangeIntegrationInputError, "DR4091");
  }
});

test("explicit bad bytes never fall back when the canonical object/reference pair is valid", () => {
  const input = fixture(canonicalJson);
  const args = input.integrationInput();
  for (const rawBytes of [undefined, null, "{}", Buffer.from("{}")]) {
    const changed = { ...input.baselines.requirementsBaseline, rawBytes };
    assertInputFailure(() => input.bindSubject({ requirementsBaseline: changed }), WorkItemVerificationInputError, "DR4071");
    assertInputFailure(() => bindChangeIntegrationInputs({ ...args, baselines: { ...args.baselines, requirementsBaseline: changed } }), ChangeIntegrationInputError, "DR4091");
  }
});

test("content-valid replacement of any raw baseline fails approved-subject lineage", () => {
  const input = fixture();
  const args = input.integrationInput();
  for (const name of Object.keys(BASELINES)) {
    const original = input.baselines[name];
    const artifact = { ...original.artifact, version: "1.0.1" };
    const rawBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
    const changed = { artifact, rawBytes, reference: ref(original.reference.artifactId, sha256Digest(rawBytes)) };
    assert.throws(() => bindChangeIntegrationInputs({ ...args, baselines: { ...args.baselines, [name]: changed } }), new RegExp(`${name} does not match the exact approved`));
  }
});

test("raw baseline loading retains work-item and attempt rejection", () => {
  const input = fixture();
  const wrongItem = { ...input.workItem, id: "WI-OTHER" };
  assert.throws(() => input.bindSubject({ workItem: canonicalBinding(wrongItem, wrongItem.id) }), /requested work item/);
  for (const name of ["changeSetDraft", "executionEvidenceBundle"]) {
    const original = input.bindings[name];
    const artifact = { ...original.artifact, attemptId: "EA-OTHER" };
    assert.throws(() => input.bindSubject({ [name]: canonicalBinding(artifact, original.reference.artifactId) }), /another attempt/);
  }
  const args = input.integrationInput();
  assertInputFailure(() => bindChangeIntegrationInputs({ ...args, workItem: wrongItem }), ChangeIntegrationInputError, "DR4091");
  const changed = { ...args.verifiedChange, attemptId: "EA-OTHER" };
  assertInputFailure(() => bindChangeIntegrationInputs({ ...args, verifiedChange: changed, verifiedChangeRef: ref("CHANGE-BYTE", canonicalJsonDigest(changed)), verifiedChangeBytes: Buffer.from(canonicalJson(changed)) }), ChangeIntegrationInputError, "DR4091");
});
