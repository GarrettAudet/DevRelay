import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateChangeIntegrationArtifact } from "./change-integration-artifact-validator.mjs";
import { ChangeIntegrationInputError } from "./change-integration-input-guard.mjs";

const fail = (message) => { throw new ChangeIntegrationInputError(message); };
const ref = (artifactId, digest) => ({ artifactId, digest });
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const commit = (value) => typeof value === "string" && (/^[0-9a-f]{40}$/.test(value) || /^[0-9a-f]{64}$/.test(value));
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }

export function buildChangeIntegrationPlan({ planId, validatedInput, verifiedChangeBytes, sourceCommit, strategy, proposedPlan } = {}) {
  const { subject, binding, verifiedChangeBytesDigest, targetTreeDigest } = validatedInput ?? {};
  if (!planId || !subject || !binding) fail("planId and validated input are required");
  if (sha256Digest(Buffer.isBuffer(verifiedChangeBytes) ? verifiedChangeBytes : Buffer.from(verifiedChangeBytes ?? "")) !== verifiedChangeBytesDigest) fail("verified change bytes changed after input binding");
  if (!commit(sourceCommit) || !commit(binding.target.expectedCommit) || !["fast-forward", "merge-commit", "cherry-pick"].includes(strategy)) fail("source and target commits must be exactly 40 or 64 lowercase hex characters and use a known integration strategy");
  if (sourceCommit.length !== binding.target.expectedCommit.length) fail("source and target commits must use one Git object-id length");
  const transition = { targetRef:binding.target.ref, expectedTargetCommit:binding.target.expectedCommit, sourceCommit, strategy };
  const body = { apiVersion:"devrelay.dev/v1alpha1", kind:"IntegrationPlan", planId, subject:ref(subject.subjectId, subject.subjectDigest), binding:ref(binding.bindingId, binding.bindingDigest), verifiedChange:structuredClone(subject.changeSet), verifiedChangeDigest:verifiedChangeBytesDigest, baselines:structuredClone(binding.baselines), preState:{ ref:binding.target.ref, commit:binding.target.expectedCommit, treeDigest:targetTreeDigest }, adapter:structuredClone(binding.adapter), permissionDemands:structuredClone(binding.permissionDemands), transition, integrationPolicy:structuredClone(binding.integrationPolicy), idempotencyKey:binding.idempotencyKey };
  const plan = { ...body, planDigest:canonicalJsonDigest(Object.fromEntries(Object.entries(body).filter(([key]) => !["apiVersion", "kind"].includes(key)))) };
  validateChangeIntegrationArtifact(plan, { subject, binding });
  if (proposedPlan !== undefined && !same(proposedPlan, plan)) fail("proposed plan is incomplete, reordered, stale, or substituted");
  return deepFreeze(plan);
}

export const buildIntegrationPlan = buildChangeIntegrationPlan;
