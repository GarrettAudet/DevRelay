import { canonicalJsonDigest } from "./content-digest.mjs";

const API = "devrelay.dev/v1alpha1";
const CAPABILITIES = new Set(["materialize", "inspect", "verify", "attest", "publication-prerequisite-probe"]);
const MATURITY = ["contract-defined", "fixture-conformant", "live-conformant", "release-ready"];
const EFFECT_KINDS = new Set(["filesystem.read", "filesystem.write", "process.spawn", "network.connect", "secrets.read", "signing.use", "git.tag", "repository.remote-write"]);
const FORBIDDEN_EFFECTS = new Set(["signing.use", "git.tag", "repository.remote-write"]);
const FORBIDDEN_AUTHORITY = new Set(["approval", "gateDecision", "graphMutation", "graphOperations", "nextOperation", "publicationAuthorized", "readiness", "routeDecision", "workflowAuthority"]);

export class ReleasePreparationAdapterError extends Error {
  constructor(message, code = "DR5530") {
    super(`release preparation adapter failed: ${message}`);
    this.name = "ReleasePreparationAdapterError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new ReleasePreparationAdapterError(message, code); };
const ordered = (values, key) => [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
const effectKey = ({ capability, kind, scope, purpose }) => `${capability}\0${kind}\0${scope}\0${purpose}`;
const grantKey = ({ kind, scope, purpose }) => `${kind}\0${scope}\0${purpose}`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function validateSafe(value) {
  const visit = (entry, key = "") => {
    if (FORBIDDEN_AUTHORITY.has(key)) fail(`adapter output attempts lifecycle authority through ${key}`, "DR5531");
    if (Array.isArray(entry)) return entry.forEach((item) => visit(item, key));
    if (!entry || typeof entry !== "object") {
      if (/(?:secret|token|password|credential|api[-_]?key)/iu.test(key) && typeof entry !== "boolean") fail(`adapter output exposes sensitive field ${key}`, "DR5532");
      return;
    }
    for (const [childKey, child] of Object.entries(entry)) visit(child, childKey);
  };
  visit(value);
}

export function defineReleaseAdapterManifest({ id, version, capabilities, configurationDigest, maturity = "contract-defined", effectDemands = [] } = {}) {
  if (!id || !version || !configurationDigest?.startsWith("sha256:")) fail("adapter id, version, and configuration digest are required");
  if (!Array.isArray(capabilities) || capabilities.length === 0 || capabilities.some((item) => !CAPABILITIES.has(item)) || new Set(capabilities).size !== capabilities.length) fail("capabilities must be unique known release capabilities");
  if (!MATURITY.includes(maturity)) fail("adapter maturity is invalid");
  for (const effect of effectDemands) {
    if (!CAPABILITIES.has(effect.capability) || !capabilities.includes(effect.capability) || !EFFECT_KINDS.has(effect.kind) || !effect.scope || !effect.purpose) fail("effect demand must bind a declared capability, kind, scope, and purpose");
  }
  const sortedEffects = ordered(effectDemands, effectKey);
  if (new Set(sortedEffects.map(effectKey)).size !== sortedEffects.length) fail("effect demands must be unique");
  const body = { apiVersion: API, kind: "ReleaseAdapterManifest", id, version, capabilities: ordered(capabilities, (item) => item), configurationDigest, maturity, effectDemands: sortedEffects };
  return Object.freeze({ ...body, manifestDigest: canonicalJsonDigest(body) });
}

function validateManifest(manifest) {
  const rebuilt = defineReleaseAdapterManifest(manifest);
  if (rebuilt.manifestDigest !== manifest.manifestDigest) fail(`adapter manifest ${manifest.id} drifted`, "DR5533");
}

export function selectReleaseAdapter({ catalog, configuredAdapterId, capability } = {}) {
  if (!CAPABILITIES.has(capability)) fail(`unknown release capability ${capability}`);
  const matches = (catalog ?? []).filter(({ id }) => id === configuredAdapterId);
  if (matches.length !== 1) fail(`configured adapter ${configuredAdapterId} is unavailable or ambiguous`, "DR5534");
  validateManifest(matches[0]);
  if (!matches[0].capabilities.includes(capability)) fail(`adapter ${configuredAdapterId} does not provide ${capability}`, "DR5534");
  return Object.freeze({ manifest: matches[0], capability });
}

export function createReleaseEffectReview({ reviewId, selection, invocationFingerprint } = {}) {
  validateManifest(selection?.manifest);
  if (!selection.manifest.capabilities.includes(selection.capability) || !invocationFingerprint?.startsWith("sha256:")) fail("effect review requires an exact selection and invocation fingerprint");
  const effects = selection.manifest.effectDemands.filter(({ capability }) => capability === selection.capability).map((effect, index) => ({ id: `${reviewId}-E${index + 1}`, kind: effect.kind, scope: effect.scope, purpose: effect.purpose }));
  const body = { apiVersion: API, kind: "ReleaseEffectReview", reviewId, invocationFingerprint, adapter: { id: selection.manifest.id, version: selection.manifest.version, manifestDigest: selection.manifest.manifestDigest }, capability: selection.capability, effects, forbiddenEffects: effects.filter(({ kind }) => FORBIDDEN_EFFECTS.has(kind)).map(({ id }) => id), decision: effects.length ? "review-required" : "no-effects" };
  return Object.freeze({ ...body, reviewDigest: canonicalJsonDigest(body) });
}

export function approveReleaseEffects({ review, approvedEffectIds = [], authority = "human-owner" } = {}) {
  const { reviewDigest, ...reviewBody } = review ?? {};
  if (canonicalJsonDigest(reviewBody) !== reviewDigest || authority !== "human-owner") fail("exact human-owner effect review is required", "DR5535");
  if (review.forbiddenEffects.length) fail("release preparation cannot approve signing, tagging, or remote repository writes", "DR5535");
  const expected = review.effects.map(({ id }) => id).sort();
  const approved = [...approvedEffectIds].sort();
  if (!same(expected, approved)) fail("effect approval must cover the exact reviewed effect set", "DR5535");
  const body = { apiVersion: API, kind: "ReleaseEffectApproval", approvalId: `${review.reviewId}-APPROVAL`, authority, decision: "approved", reviewDigest, approvedEffects: review.effects.map((effect) => ({ effectId: effect.id, grants: [{ kind: effect.kind, scope: effect.scope, purpose: effect.purpose }] })) };
  return Object.freeze({ ...body, approvalDigest: canonicalJsonDigest(body) });
}

export function createReleaseAdapterInvocation({ invocationId, selection, request, effectReview, effectApproval } = {}) {
  validateManifest(selection?.manifest);
  if (effectReview.invocationFingerprint !== canonicalJsonDigest({ invocationId, adapter: selection.manifest.manifestDigest, capability: selection.capability, request })) fail("effect review does not bind the invocation", "DR5535");
  if (effectReview.effects.length) {
    const { approvalDigest, ...approvalBody } = effectApproval ?? {};
    if (canonicalJsonDigest(approvalBody) !== approvalDigest || effectApproval.reviewDigest !== effectReview.reviewDigest) fail("effect approval is missing or substituted", "DR5535");
  }
  const grants = (effectApproval?.approvedEffects ?? []).flatMap(({ grants: values }) => values);
  const body = { apiVersion: API, kind: "ReleaseAdapterInvocation", invocationId, adapter: { id: selection.manifest.id, version: selection.manifest.version, manifestDigest: selection.manifest.manifestDigest }, capability: selection.capability, request: structuredClone(request), configurationDigest: selection.manifest.configurationDigest, grants: ordered(grants, grantKey), reviewDigest: effectReview.reviewDigest, approvalDigest: effectApproval?.approvalDigest ?? null };
  return Object.freeze({ ...body, invocationFingerprint: canonicalJsonDigest(body) });
}

function validateInvocation(invocation, manifest) {
  const { invocationFingerprint, ...body } = invocation;
  if (canonicalJsonDigest(body) !== invocationFingerprint || invocation.adapter.id !== manifest.id || invocation.adapter.version !== manifest.version || invocation.adapter.manifestDigest !== manifest.manifestDigest || invocation.configurationDigest !== manifest.configurationDigest) fail("adapter invocation identity drifted", "DR5536");
  const expected = manifest.effectDemands.filter(({ capability }) => capability === invocation.capability).map(({ kind, scope, purpose }) => ({ kind, scope, purpose }));
  if (!same(ordered(expected, grantKey), ordered(invocation.grants, grantKey))) fail("invocation grants differ from manifest demands", "DR5536");
}

export function createInMemoryReleaseAdapterCheckpointStore() {
  const values = new Map();
  return Object.freeze({
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : undefined; },
    async put(key, value) { if (values.has(key)) fail(`checkpoint ${key} is immutable`, "DR5537"); values.set(key, structuredClone(value)); },
  });
}

export function createReleaseAdapterCheckpointController({ manifest, hostExecute, checkpoints } = {}) {
  validateManifest(manifest);
  if (typeof hostExecute !== "function" || !checkpoints?.get || !checkpoints?.put) fail("adapter controller requires a host executor and immutable checkpoints");
  return Object.freeze({
    async execute(invocation) {
      validateInvocation(invocation, manifest);
      const key = `release-adapter:${invocation.invocationId}:${invocation.invocationFingerprint}`;
      const existing = await checkpoints.get(key);
      if (existing) return Object.freeze({ ...structuredClone(existing), replayed: true, hostCalls: 0 });
      const raw = await hostExecute(structuredClone(invocation));
      if (!raw || raw.invocationFingerprint !== invocation.invocationFingerprint || !["completed", "unavailable", "failed"].includes(raw.status) || !Array.isArray(raw.evidence) || !Array.isArray(raw.diagnostics)) fail("adapter returned a malformed or substituted result", "DR5538");
      validateSafe(raw);
      const result = Object.freeze({ raw: structuredClone(raw), adapter: { id: manifest.id, version: manifest.version, maturity: manifest.maturity }, replayed: false, hostCalls: 1 });
      await checkpoints.put(key, result);
      return result;
    },
  });
}

export function assertReleaseAdapterMaturity({ manifest, requiredMaturity, liveReceipt } = {}) {
  validateManifest(manifest);
  const actual = MATURITY.indexOf(manifest.maturity);
  const required = MATURITY.indexOf(requiredMaturity);
  if (actual < 0 || required < 0 || actual < required) fail(`adapter maturity ${manifest.maturity} is below ${requiredMaturity}`, "DR5539");
  if (actual >= MATURITY.indexOf("live-conformant") && (!liveReceipt || liveReceipt.adapterId !== manifest.id || liveReceipt.adapterVersion !== manifest.version || liveReceipt.manifestDigest !== manifest.manifestDigest || !liveReceipt.receiptDigest?.startsWith("sha256:"))) fail("live maturity requires an exact provider receipt", "DR5539");
  return manifest;
}
