import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateBusinessAcceptanceArtifact } from "./business-acceptance-artifact-validator.mjs";

const PREFIX = "business-acceptance/evaluations";

export class BusinessAcceptanceCheckpointError extends Error {
  constructor(message, code = "DR4150") {
    super(`business acceptance checkpoint failed: ${message}`);
    this.name = "BusinessAcceptanceCheckpointError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new BusinessAcceptanceCheckpointError(message, code); };
const immutable = value => {
  const copy = structuredClone(value);
  const freeze = item => { if (item && typeof item === "object" && !Object.isFrozen(item)) { for (const child of Object.values(item)) freeze(child); Object.freeze(item); } return item; };
  return freeze(copy);
};
const keyFor = checkpointId => `${PREFIX}/${encodeURIComponent(checkpointId)}`;
const digest = value => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "checkpointDigest")));
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function requireStore(store) {
  if (!store || typeof store.get !== "function" || typeof store.put !== "function") fail("an immutable checkpoint store with get and put is required", "DR4151");
}

export function validateBusinessAcceptanceCheckpoint(value, expected = {}) {
  if (!value || value.apiVersion !== "devrelay.dev/v1alpha1" || value.kind !== "BusinessAcceptanceEvaluationCheckpoint") fail("checkpoint has an invalid envelope", "DR4153");
  if (value.checkpointDigest !== digest(value)) fail("checkpoint digest is invalid", "DR4153");
  if (value.subject?.kind !== "BusinessAcceptanceSubject" || value.subject.subjectDigest !== canonicalJsonDigest(Object.fromEntries(Object.entries(value.subject).filter(([key])=>!["apiVersion","kind","subjectDigest"].includes(key))))) fail("checkpoint subject is invalid", "DR4153");
  validateBusinessAcceptanceArtifact(value.policy);
  validateBusinessAcceptanceArtifact(value.evidence);
  validateBusinessAcceptanceArtifact(value.technicalCoverage,{requirementsBaseline:value.subject.requirementsBaseline,systemVerificationResult:value.systemVerificationResult,traceabilityCheckpoint:value.subject.traceabilityCheckpoint,approvedAcceptanceCriterionIds:value.technicalCoverage.approvedAcceptanceCriterionIds});
  validateBusinessAcceptanceArtifact(value.evaluation,{subject:value.subject,policy:value.policy,evidence:value.evidence,technicalCoverage:value.technicalCoverage});
  validateBusinessAcceptanceArtifact(value.candidate,{evaluation:value.evaluation});
  if (expected.checkpointId && value.checkpointId !== expected.checkpointId) fail("checkpoint identity does not match", "DR4153");
  if (expected.subjectId && value.subject.subjectId !== expected.subjectId) fail("checkpoint subject identity does not match", "DR4153");
  if (expected.subjectDigest && value.subject.subjectDigest !== expected.subjectDigest) fail("checkpoint subject digest does not match", "DR4153");
  return value;
}

export function createBusinessAcceptanceCheckpointController() {
  async function replay({ checkpointId="default", subjectId, subjectDigest, checkpoints }) {
    requireStore(checkpoints); const key=keyFor(checkpointId); let value;
    try { value=await checkpoints.get(key); } catch (error) { fail(`checkpoint read failed: ${error.message}`, "DR4151"); }
    if (value == null) fail("exact subject checkpoint does not exist", "DR4153");
    const checkpoint=immutable(value); validateBusinessAcceptanceCheckpoint(checkpoint,{checkpointId,subjectId,subjectDigest});
    return immutable({replayed:true,evaluationCalls:0,evidenceCalls:0,checkpointKey:key,checkpointDigest:checkpoint.checkpointDigest,evaluation:checkpoint.evaluation,candidate:checkpoint.candidate});
  }
  async function execute({ checkpointId="default", subject, systemVerificationResult, technicalCoverage, policy, evidence, checkpoints, evaluate, assemble }) {
    requireStore(checkpoints); const key=keyFor(checkpointId); let existing;
    try { existing=await checkpoints.get(key); } catch (error) { fail(`checkpoint read failed: ${error.message}`, "DR4151"); }
    if (existing != null) {
      const checkpoint=immutable(existing); validateBusinessAcceptanceCheckpoint(checkpoint,{checkpointId});
      if (!same(checkpoint.subject,subject)||!same(checkpoint.technicalCoverage,technicalCoverage)||!same(checkpoint.policy,policy)||!same(checkpoint.evidence,evidence)) fail("duplicate subject identity has changed pinned context", "DR4155");
      return replay({checkpointId,subjectId:subject.subjectId,subjectDigest:subject.subjectDigest,checkpoints});
    }
    const evaluation=evaluate(), candidate=assemble(evaluation);
    const material={apiVersion:"devrelay.dev/v1alpha1",kind:"BusinessAcceptanceEvaluationCheckpoint",checkpointId,subject:immutable(subject),systemVerificationResult:immutable(systemVerificationResult),technicalCoverage:immutable(technicalCoverage),policy:immutable(policy),evidence:immutable(evidence),evaluation:immutable(evaluation),candidate:immutable(candidate)};
    const checkpoint=immutable({...material,checkpointDigest:canonicalJsonDigest(material)});
    try { await checkpoints.put(key,checkpoint); } catch(error) { fail(`immutable checkpoint write failed: ${error.message}`,"DR4152"); }
    validateBusinessAcceptanceCheckpoint(checkpoint);
    return immutable({replayed:false,evaluationCalls:1,evidenceCalls:0,checkpointKey:key,checkpointDigest:checkpoint.checkpointDigest,evaluation,candidate});
  }
  return Object.freeze({execute,replay});
}

export { keyFor as businessAcceptanceCheckpointKey };
