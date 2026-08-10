import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateWorkItemVerificationArtifact } from "./work-item-verification-artifact-validator.mjs";

export class WorkItemVerificationVerifierBindingError extends Error {
  constructor(message) {
    super(`work item verification verifier binding is invalid: ${message}`);
    this.name = "WorkItemVerificationVerifierBindingError";
    this.code = "DR4072";
  }
}

const fail = (message) => { throw new WorkItemVerificationVerifierBindingError(message); };
const exact = (left, right) => canonicalJson(left) === canonicalJson(right);
const compare = (left, right) => left.localeCompare(right);
const verifierKey = ({ id, version } = {}) => `${id ?? ""}@${version ?? ""}`;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

function strings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.length === 0)) fail(`${label} must be strings`);
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
  return [...values].sort(compare);
}

function permissions(values, label) {
  if (!Array.isArray(values)) fail(`${label} must be an array`);
  const normalized = values.map((permission, index) => {
    if (!permission || typeof permission !== "object" || Array.isArray(permission) ||
        !["filesystem.read", "network.connect", "process.spawn"].includes(permission.kind)) fail(`${label}[${index}] is invalid`);
    return { kind: permission.kind, values: strings(permission.values, `${label}[${index}].values`) };
  }).sort((left, right) => compare(`${left.kind}\0${canonicalJson(left.values)}`, `${right.kind}\0${canonicalJson(right.values)}`));
  const keys = normalized.map((permission) => canonicalJson(permission));
  if (new Set(keys).size !== keys.length) fail(`${label} contains duplicate permissions`);
  return normalized;
}

function refsForObligation(obligation, policy) {
  const evidenceKinds = strings(obligation.requiredEvidenceKinds, `${obligation.obligationId}.requiredEvidenceKinds`);
  const capabilities = [...new Set(evidenceKinds.flatMap((kind) => policy.evidenceKinds?.[kind]?.requiredCapabilities ?? []))].sort(compare);
  const tools = [...new Set(evidenceKinds.flatMap((kind) => policy.evidenceKinds?.[kind]?.requiredTools ?? []))].sort(compare);
  for (const kind of evidenceKinds) if (!policy.evidenceKinds?.[kind]) fail(`no verifier policy exists for evidence kind ${kind}`);
  return { evidenceKinds, capabilities: [...new Set(capabilities)], tools: [...new Set(tools)] };
}

/**
 * Selects no scope itself: proposedPartitions must partition the exact validated
 * obligation set. Registry entries are immutable, version-pinned host
 * configuration; Core validates them and emits the closed canonical artifact.
 */
export function validateVerifierBindingSet({
  bindingId, subject, obligationSet, executorIdentity, changeProducerIdentities = [],
  verificationPolicy, verifierRegistry, proposedPartitions, independenceEvidence,
}) {
  validateWorkItemVerificationArtifact(subject);
  validateWorkItemVerificationArtifact(obligationSet);
  if (typeof bindingId !== "string" || bindingId.length === 0) fail("bindingId is required");
  if (typeof executorIdentity !== "string" || executorIdentity.length === 0) fail("executorIdentity is required");
  if (obligationSet.subject.artifactId !== subject.subjectId || obligationSet.subject.digest !== subject.subjectDigest) fail("obligation set does not bind the exact subject");
  if (!verificationPolicy || typeof verificationPolicy !== "object" || Array.isArray(verificationPolicy)) fail("verificationPolicy is required");
  if (!verifierRegistry || typeof verifierRegistry !== "object" || !Array.isArray(verifierRegistry.entries)) fail("verifierRegistry entries are required");
  if (!Array.isArray(proposedPartitions) || proposedPartitions.length === 0) fail("proposedPartitions are required");

  const producerIdentities = new Set(strings([executorIdentity, ...changeProducerIdentities], "change producer identities"));
  const entries = new Map();
  for (const entry of verifierRegistry.entries) {
    if (!entry?.verifier?.id || !VERSION.test(entry.verifier.version ?? "")) fail("registry verifier is not version-pinned");
    if (!DIGEST.test(entry.configurationDigest ?? "")) fail(`registry verifier ${verifierKey(entry.verifier)} has stale or missing configuration digest`);
    const key = verifierKey(entry.verifier);
    if (entries.has(key)) fail(`registry contains duplicate verifier ${key}`);
    entries.set(key, {
      ...entry,
      capabilities: strings(entry.capabilities ?? [], `${key} capabilities`),
      tools: strings(entry.tools ?? [], `${key} tools`),
      supportedEvidenceKinds: strings(entry.supportedEvidenceKinds ?? [], `${key} supported evidence kinds`),
      permissionDemand: permissions(entry.permissionDemand ?? [], `${key} permission demand`),
      identityAliases: strings(entry.identityAliases ?? [], `${key} identity aliases`),
    });
  }

  const obligations = new Map(obligationSet.obligations.map((entry) => [entry.obligationId, entry]));
  if (obligations.size !== obligationSet.obligations.length) fail("obligation set contains duplicate obligation IDs");
  const covered = new Set();
  const partitions = proposedPartitions.map((proposal, index) => {
    const key = verifierKey(proposal?.verifier);
    const entry = entries.get(key);
    if (!entry) fail(`partition ${index} substitutes unregistered verifier ${key}`);
    if (proposal.configurationDigest !== entry.configurationDigest) fail(`partition ${index} has stale verifier configuration`);
    const obligationIds = strings(proposal.obligationIds, `partition ${index} obligationIds`);
    const demands = permissions(proposal.grants ?? proposal.permissionDemand, `partition ${index} grants`);
    if (!exact(demands, entry.permissionDemand)) fail(`partition ${index} grants are missing or excessive`);
    const identities = new Set([entry.verifier.id, ...(entry.identityAliases ?? [])]);
    for (const identity of identities) if (producerIdentities.has(identity)) fail(`partition ${index} verifier conflicts with change producer identity ${identity}`);

    for (const obligationId of obligationIds) {
      const obligation = obligations.get(obligationId);
      if (!obligation) fail(`partition ${index} contains unauthorized obligation ${obligationId}`);
      if (covered.has(obligationId)) fail(`obligation ${obligationId} has duplicate coverage`);
      covered.add(obligationId);
      const required = refsForObligation(obligation, verificationPolicy);
      for (const kind of required.evidenceKinds) if (!entry.supportedEvidenceKinds.includes(kind)) fail(`${key} cannot produce required evidence kind ${kind}`);
      for (const capability of required.capabilities) if (!entry.capabilities.includes(capability)) fail(`${key} is missing capability ${capability}`);
      for (const tool of required.tools) if (!entry.tools.includes(tool)) fail(`${key} is missing tool ${tool}`);
    }
    return { verifier: structuredClone(entry.verifier), obligationIds, permissionDemand: demands };
  }).sort((left, right) => compare(
    `${verifierKey(left.verifier)}\0${left.obligationIds.join("\0")}`,
    `${verifierKey(right.verifier)}\0${right.obligationIds.join("\0")}`,
  ));
  const missing = [...obligations.keys()].filter((id) => !covered.has(id));
  if (missing.length) fail(`partial obligation coverage: ${missing.join(", ")}`);
  const required = verificationPolicy.independenceRequired !== false;
  if (required && !independenceEvidence) fail("required independence evidence is missing");
  const independence = { required, satisfied: true, ...(independenceEvidence ? { evidence: structuredClone(independenceEvidence) } : {}) };
  const result = {
    apiVersion: "devrelay.dev/v1alpha1", kind: "ValidatedVerifierBindingSet", bindingId,
    subject: { artifactId: subject.subjectId, digest: subject.subjectDigest },
    obligationSet: { artifactId: obligationSet.obligationSetId, digest: obligationSet.obligationSetDigest },
    executorIdentity, partitions, independence,
  };
  result.bindingDigest = canonicalJsonDigest(Object.fromEntries(Object.entries(result).filter(([key]) => !["apiVersion", "kind"].includes(key))));
  return validateWorkItemVerificationArtifact(result);
}
