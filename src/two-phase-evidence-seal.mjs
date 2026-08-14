import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";

export class TwoPhaseEvidenceSealError extends Error {
  constructor(message, code = "DR4830") {
    super(`two-phase evidence seal: ${message}`);
    this.name = "TwoPhaseEvidenceSealError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new TwoPhaseEvidenceSealError(message, code); };
const immutable = (value) => Object.freeze(structuredClone(value));
const commitPattern = /^[0-9a-f]{40}$/u;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;

function commit(value, label) {
  if (typeof value !== "string" || !commitPattern.test(value)) fail(`${label} must be an exact Git commit`);
  return value;
}

function artifactRef(value, label) {
  if (!value || typeof value.artifactId !== "string" || !value.artifactId || !digestPattern.test(value.digest)) {
    fail(`${label} must be an exact artifact reference`);
  }
  return structuredClone(value);
}

function manifestEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) fail("evidence manifest must be non-empty");
  const seen = new Set();
  return entries.map((entry, index) => {
    const ref = artifactRef(entry, `evidence[${index}]`);
    if (seen.has(ref.artifactId)) fail(`duplicate evidence artifact ${ref.artifactId}`);
    seen.add(ref.artifactId);
    return ref;
  }).sort((left, right) => left.artifactId.localeCompare(right.artifactId, "en"));
}

export function createImplementationSeal(input) {
  const implementationCommit = commit(input?.implementationCommit, "implementationCommit");
  const parentCommit = commit(input?.parentCommit, "parentCommit");
  if (implementationCommit === parentCommit) fail("implementation commit must advance its parent");
  if (input?.worktreeClean !== true) fail("implementation cannot be sealed from a dirty worktree", "DR4831");
  if (!digestPattern.test(input?.treeDigest)) fail("treeDigest must be an exact SHA-256 digest");
  if (typeof input?.repositoryId !== "string" || !input.repositoryId || typeof input?.targetRef !== "string" || !input.targetRef.startsWith("refs/")) {
    fail("repositoryId and a full target ref are required");
  }
  const material = {
    repositoryId: input.repositoryId,
    targetRef: input.targetRef,
    parentCommit,
    implementationCommit,
    treeDigest: input.treeDigest,
    verifiedChangeSet: artifactRef(input.verifiedChangeSet, "verifiedChangeSet"),
    integrationRecord: artifactRef(input.integrationRecord, "integrationRecord"),
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ImplementationSeal",
    sealId: `IS-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    ...material,
    sealDigest: canonicalJsonDigest(material),
  });
}

export function createEvidenceSealRecord(input) {
  const implementationSeal = input?.implementationSeal;
  if (implementationSeal?.kind !== "ImplementationSeal") fail("an ImplementationSeal is required");
  const { sealDigest, sealId, apiVersion, kind, ...sealMaterial } = implementationSeal;
  void sealId; void apiVersion; void kind;
  if (canonicalJsonDigest(sealMaterial) !== sealDigest) fail("implementation seal digest drifted");
  const evidenceCommit = commit(input?.evidenceCommit, "evidenceCommit");
  const parentCommit = commit(input?.parentCommit, "parentCommit");
  if (parentCommit !== implementationSeal.implementationCommit) fail("evidence commit must directly follow the sealed implementation commit", "DR4832");
  if (evidenceCommit === implementationSeal.implementationCommit) fail("evidence and implementation commits must be distinct");
  if (input?.worktreeClean !== true) fail("evidence cannot be sealed from a dirty worktree", "DR4831");
  const evidence = manifestEntries(input.evidence);
  if (canonicalJson(evidence).includes(evidenceCommit)) fail("evidence bytes cannot contain their own evidence commit identity", "DR4833");
  const evidenceManifestDigest = canonicalJsonDigest(evidence);
  const material = {
    implementationSealDigest: implementationSeal.sealDigest,
    repositoryId: implementationSeal.repositoryId,
    targetRef: implementationSeal.targetRef,
    parentCommit,
    evidenceCommit,
    evidenceManifestDigest,
    evidence,
    ancestry: "direct-parent",
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "EvidenceSealRecord",
    sealRecordId: `ES-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    ...material,
    recordDigest: canonicalJsonDigest(material),
  });
}

export function verifyTwoPhaseEvidenceSeal({ implementationSeal, evidenceSeal, observation }) {
  if (implementationSeal?.kind !== "ImplementationSeal" || evidenceSeal?.kind !== "EvidenceSealRecord") fail("both seal phases are required");
  const { sealDigest, sealId, apiVersion: implementationApi, kind: implementationKind, ...implementationMaterial } = implementationSeal;
  void sealId; void implementationApi; void implementationKind;
  if (canonicalJsonDigest(implementationMaterial) !== sealDigest) fail("implementation seal digest drifted");
  const { recordDigest, sealRecordId, apiVersion: evidenceApi, kind: evidenceKind, ...evidenceMaterial } = evidenceSeal;
  void sealRecordId; void evidenceApi; void evidenceKind;
  if (canonicalJsonDigest(evidenceMaterial) !== recordDigest) fail("evidence seal digest drifted");
  if (evidenceSeal.implementationSealDigest !== implementationSeal.sealDigest) fail("evidence seal is bound to another implementation seal");
  if (!observation || observation.targetRef !== evidenceSeal.targetRef || observation.targetCommit !== evidenceSeal.evidenceCommit) fail("target ref observation is stale", "DR4834");
  if (observation.evidenceParentCommit !== implementationSeal.implementationCommit || observation.implementationParentCommit !== implementationSeal.parentCommit) fail("observed ancestry does not match the two-phase seal", "DR4832");
  if (observation.implementationTreeDigest !== implementationSeal.treeDigest || observation.evidenceManifestDigest !== evidenceSeal.evidenceManifestDigest) fail("observed implementation or evidence bytes drifted", "DR4835");
  if (observation.worktreeClean !== true) fail("verification observed a dirty worktree", "DR4831");
  return true;
}
