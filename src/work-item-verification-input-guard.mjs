import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateWorkExecutionArtifact } from "./work-execution-artifact-validator.mjs";
import { validateWorkItemVerificationArtifact } from "./work-item-verification-artifact-validator.mjs";

const INPUTS = Object.freeze([
  "workItem", "executionAttempt", "changeSetDraft", "executionEvidenceBundle",
  "verificationPolicy", "requirementsBaseline", "projectOverviewBaseline",
  "architectureBaseline", "contractDisposition", "workBreakdownBaseline",
  "workDependencyBaseline", "specialistAssignmentBaseline", "repositoryBase",
  "candidateWorkspace",
]);

export class WorkItemVerificationInputError extends Error {
  constructor(message) {
    super(`work item verification input is invalid: ${message}`);
    this.name = "WorkItemVerificationInputError";
    this.code = "DR4071";
  }
}

const fail = (message) => { throw new WorkItemVerificationInputError(message); };
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function validateBinding(name, binding) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) fail(`missing ${name}`);
  const keys = Object.keys(binding).sort();
  if (!same(keys, ["artifact", "reference"].sort())) fail(`${name} binding must contain only artifact and reference`);
  const { artifact, reference } = binding;
  if (!artifact || !reference || typeof reference.artifactId !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(reference.digest)) fail(`${name} requires an immutable reference`);
  const digest = canonicalJsonDigest(artifact);
  if (reference.digest !== digest) fail(`${name} reference is stale or mismatched`);
  return Object.freeze({ artifact, reference: structuredClone(reference) });
}

function requireVersion(name, artifact) {
  if (typeof artifact.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(artifact.version)) {
    fail(`${name} is not version-pinned`);
  }
}

export function bindWorkItemVerificationSubject({ subjectId, workItemId, bindings }) {
  if (typeof subjectId !== "string" || subjectId.length === 0) fail("subjectId is required");
  if (!/^WI-[A-Z0-9-]+$/.test(workItemId ?? "")) fail("workItemId is invalid");
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) fail("bindings are required");
  const names = Object.keys(bindings).sort();
  if (!same(names, [...INPUTS].sort())) fail("inputs must contain exactly one binding for every declared subject input");
  const resolved = Object.fromEntries(INPUTS.map((name) => [name, validateBinding(name, bindings[name])]));
  const workItem = resolved.workItem.artifact;
  const attempt = resolved.executionAttempt.artifact;
  const change = resolved.changeSetDraft.artifact;
  const evidence = resolved.executionEvidenceBundle.artifact;
  const breakdown = resolved.workBreakdownBaseline.artifact;
  if (workItem.id !== workItemId || attempt.workItemId !== workItemId) fail("work item and execution attempt do not bind the requested work item");
  if (change.attemptId !== attempt.attemptId || evidence.attemptId !== attempt.attemptId) fail("change draft or execution evidence belongs to another attempt");
  validateWorkExecutionArtifact(attempt);
  validateWorkExecutionArtifact(change);
  validateWorkExecutionArtifact(evidence);
  requireVersion("workBreakdownBaseline", breakdown);
  requireVersion("verificationPolicy", resolved.verificationPolicy.artifact);
  const approvedItems = breakdown.workItems?.filter(({ id }) => id === workItemId) ?? [];
  if (approvedItems.length !== 1 || !same(approvedItems[0], workItem)) fail("work item is not the exact uniquely approved baseline item");

  const refs = Object.fromEntries(INPUTS.map((name) => [name, resolved[name].reference]));
  const subject = {
    apiVersion: "devrelay.dev/v1alpha1", kind: "ValidatedVerificationSubject", subjectId, workItemId,
    workItem: refs.workItem, executionAttempt: refs.executionAttempt, changeSetDraft: refs.changeSetDraft,
    executionEvidenceBundle: refs.executionEvidenceBundle, verificationPolicy: refs.verificationPolicy,
    requirementsBaseline: refs.requirementsBaseline, projectOverviewBaseline: refs.projectOverviewBaseline,
    architectureBaseline: refs.architectureBaseline, contractDisposition: refs.contractDisposition,
    workBreakdownBaseline: refs.workBreakdownBaseline, workDependencyBaseline: refs.workDependencyBaseline,
    specialistAssignmentBaseline: refs.specialistAssignmentBaseline, repositoryBase: refs.repositoryBase,
    candidateWorkspace: refs.candidateWorkspace,
  };
  subject.subjectDigest = canonicalJsonDigest(Object.fromEntries(Object.entries(subject).filter(([key]) => !["apiVersion", "kind"].includes(key))));
  return validateWorkItemVerificationArtifact(subject);
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`duplicate ${label}`);
  return [...values].sort();
}

function obligationId(kind, sourceRef) {
  return `OB-${sha256Digest(Buffer.from(canonicalJson({ kind, sourceRef }), "utf8")).slice(7, 23).toUpperCase()}`;
}

export function expandWorkItemVerificationObligations({ subject, workItem, policyDutyRefs = [], proposedObligations }) {
  validateWorkItemVerificationArtifact(subject);
  if (workItem?.id !== subject.workItemId || canonicalJsonDigest(workItem) !== subject.workItem.digest) fail("work item does not match the validated subject");
  const evidenceKinds = unique((workItem["required-evidence"] ?? []).map(({ kind }) => kind), "required evidence kind");
  if (evidenceKinds.length === 0) fail("work item has no required evidence duties");
  const sources = [
    ...unique((workItem["verification-plan"]?.checks ?? []).map(({ id }) => id), "verification check").map((sourceRef) => ["work-item-plan", sourceRef]),
    ...evidenceKinds.map((sourceRef) => ["required-evidence", sourceRef]),
    ...unique(workItem["acceptance-criterion-refs"] ?? [], "acceptance criterion").map((sourceRef) => ["acceptance-criterion", sourceRef]),
    ...unique(workItem["architecture-refs"] ?? [], "architecture reference").map((sourceRef) => ["architecture", sourceRef]),
    ...unique(workItem["contract-refs"] ?? [], "contract reference").map((sourceRef) => ["contract", sourceRef]),
    ...unique(policyDutyRefs, "policy duty").map((sourceRef) => ["policy", sourceRef]),
  ];
  const identities = sources.map(([kind, sourceRef]) => `${kind}\0${sourceRef}`);
  if (new Set(identities).size !== identities.length) fail("duplicate obligation identity");
  const obligations = sources.map(([kind, sourceRef]) => ({ obligationId: obligationId(kind, sourceRef), kind, sourceRef, requiredEvidenceKinds: evidenceKinds }));
  obligations.sort((left, right) => left.obligationId.localeCompare(right.obligationId));
  if (proposedObligations !== undefined && !same(proposedObligations, obligations)) fail("proposed obligations are incomplete, reordered, or unauthorized");
  const material = { subject: { artifactId: subject.subjectId, digest: subject.subjectDigest }, obligations };
  const obligationSetId = `OBS-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`;
  const result = { apiVersion: "devrelay.dev/v1alpha1", kind: "VerificationObligationSet", obligationSetId, ...material };
  result.obligationSetDigest = canonicalJsonDigest({ obligationSetId, ...material });
  return validateWorkItemVerificationArtifact(result);
}
