import { canonicalJsonDigest } from "./content-digest.mjs";
import { verifyResolvedWorkflowProfile } from "./workflow-profiles.mjs";

export class QualityPolicyError extends Error {
  constructor(message, code = "DR7100") {
    super(`quality policy: ${message}`);
    this.name = "QualityPolicyError";
    this.code = code;
  }
}

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const fail = (message, code) => { throw new QualityPolicyError(message, code); };
function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
const sorted = (values = []) => [...new Set(values)].sort();
function optionalNames(values, label) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value)) fail(`${label} must contain non-empty names`, "DR7101");
  return sorted(values);
}
const matches = (allowed, actual) => !allowed?.length || actual.some((value) => allowed.includes(value));
function validateRules(rules) {
  if (!Array.isArray(rules) || !rules.length) fail("at least one rule is required", "DR7101");
  const ids = new Set();
  return rules.map((rule) => {
    if (!rule || typeof rule.id !== "string" || !rule.id || ids.has(rule.id)) fail("rule ids must be unique", "DR7101");
    ids.add(rule.id);
    if (!Array.isArray(rule.obligations) || !rule.obligations.length) fail(`rule ${rule.id} has no obligations`, "DR7101");
    return {
      id: rule.id,
      priority: Number.isSafeInteger(rule.priority) ? rule.priority : 0,
      appliesTo: {
        riskLevels: optionalNames(rule.appliesTo?.riskLevels, `rule ${rule.id} riskLevels`),
        workTypes: optionalNames(rule.appliesTo?.workTypes, `rule ${rule.id} workTypes`),
        technologies: optionalNames(rule.appliesTo?.technologies, `rule ${rule.id} technologies`),
        surfaces: optionalNames(rule.appliesTo?.surfaces, `rule ${rule.id} surfaces`),
      },
      obligations: rule.obligations.map((item, index, items) => {
        if (!item || typeof item.id !== "string" || !item.id || typeof item.lane !== "string" || !item.lane) fail(`rule ${rule.id} has an invalid obligation`, "DR7101");
        if (items.findIndex(({ id }) => id === item.id) !== index) fail(`rule ${rule.id} has duplicate obligation ${item.id}`, "DR7101");
        return {
        id: item.id,
        lane: item.lane,
        evidenceKinds: optionalNames(item.evidenceKinds, `obligation ${item.id} evidenceKinds`),
        minimumPassing: Number.isSafeInteger(item.minimumPassing) && item.minimumPassing > 0 ? item.minimumPassing : 1,
        independent: item.independent === true,
        deferAllowed: item.deferAllowed === true,
      }; }).map((item) => {
        if (!item.evidenceKinds.length) fail(`obligation ${item.id} has no evidence kinds`, "DR7101");
        return item;
      }).sort((a, b) => a.id.localeCompare(b.id)),
    };
  }).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function createQualityPolicyCandidate({ policyId, version, previousBaselineDigest = null, rules, sourceRefs = [] } = {}) {
  if (typeof policyId !== "string" || !policyId || typeof version !== "string" || !version) fail("policyId and version are required", "DR7101");
  if (previousBaselineDigest !== null && !DIGEST.test(previousBaselineDigest)) fail("previous baseline digest is invalid", "DR7101");
  const material = { policyId, version, previousBaselineDigest, rules: validateRules(rules), sourceRefs: sorted(sourceRefs) };
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "QualityPolicyCandidate", ...material, candidateDigest: canonicalJsonDigest(material), authority: "candidate-only" });
}

export function promoteQualityPolicyBaseline({ candidate, approval } = {}) {
  if (!candidate || candidate.kind !== "QualityPolicyCandidate") fail("candidate is required", "DR7102");
  const { apiVersion, kind, candidateDigest, authority, ...material } = candidate;
  void apiVersion; void kind; void authority;
  if (candidateDigest !== canonicalJsonDigest(material)) fail("candidate digest drifted", "DR7102");
  if (!approval || approval.kind !== "QualityPolicyGateApproval" || approval.decision !== "approve" || approval.candidateDigest !== candidateDigest || typeof approval.authority !== "string" || !approval.authority) {
    fail("an exact approval is required", "DR7103");
  }
  const body = { ...material, candidateDigest, approval: { kind: approval.kind, authority: approval.authority, decision: approval.decision, candidateDigest } };
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "QualityPolicyBaseline", ...body, baselineDigest: canonicalJsonDigest(body) });
}

export function createQualityPolicyContext({ riskContext = { level: "not-assessed", sourceRefs: [] }, changedSurfaces = [], technologies = [], acceptanceCriteria = [] } = {}) {
  if (!riskContext || typeof riskContext !== "object" || Array.isArray(riskContext) || typeof riskContext.level !== "string" || !riskContext.level || !Array.isArray(riskContext.sourceRefs) || riskContext.sourceRefs.some((item) => typeof item !== "string" || !item)) fail("risk context is invalid", "DR7104");
  const criterionIds = acceptanceCriteria.map((item) => typeof item === "string" ? item : item?.id);
  if (criterionIds.some((item) => typeof item !== "string" || !item)) fail("acceptance criteria are invalid", "DR7104");
  const material = { riskContext: { level: riskContext.level, sourceRefs: sorted(riskContext.sourceRefs) }, changedSurfaces: optionalNames(changedSurfaces, "changedSurfaces"), technologies: optionalNames(technologies, "technologies"), acceptanceCriterionIds: sorted(criterionIds) };
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "QualityPolicyContext", ...material, contextDigest: canonicalJsonDigest(material) });
}

export function resolveQualityObligations({ baseline, workflowProfile, context, riskContext = {}, workItem = {}, changedSurfaces = [], technologies = [], acceptanceCriteria = [] } = {}) {
  if (!baseline || baseline.kind !== "QualityPolicyBaseline") fail("approved baseline is required", "DR7104");
  const { apiVersion, kind, baselineDigest, ...body } = baseline;
  void apiVersion; void kind;
  if (baselineDigest !== canonicalJsonDigest(body)) fail("baseline digest drifted", "DR7104");
  try { verifyResolvedWorkflowProfile(workflowProfile); } catch { fail("resolved workflow profile is invalid or drifted", "DR7104"); }
  if (typeof workItem.id !== "string" || !workItem.id) fail("work item identity is required", "DR7104");
  let policyContext;
  if (context !== undefined) {
    if (context?.kind !== "QualityPolicyContext") fail("quality policy context is invalid", "DR7104");
    const { apiVersion: contextApiVersion, kind: contextKind, contextDigest, ...contextMaterial } = context;
    void contextApiVersion; void contextKind;
    if (!DIGEST.test(contextDigest) || contextDigest !== canonicalJsonDigest(contextMaterial)) fail("quality policy context digest drifted", "DR7104");
    policyContext = createQualityPolicyContext({ riskContext: context.riskContext, changedSurfaces: context.changedSurfaces, technologies: context.technologies, acceptanceCriteria: context.acceptanceCriterionIds });
  } else {
    policyContext = createQualityPolicyContext({ riskContext: { level: riskContext.level ?? "not-assessed", sourceRefs: riskContext.sourceRefs ?? [] }, changedSurfaces, technologies, acceptanceCriteria });
  }
  const matchContext = {
    riskLevels: [policyContext.riskContext.level],
    workTypes: [workItem.type ?? "unspecified"],
    technologies: policyContext.technologies,
    surfaces: policyContext.changedSurfaces,
  };
  const applicable = baseline.rules.filter((rule) => Object.entries(rule.appliesTo).every(([key, values]) => matches(values, matchContext[key])));
  const obligations = new Map();
  for (const rule of applicable) {
    for (const obligation of rule.obligations) {
      const existing = obligations.get(obligation.id);
      if (existing && canonicalJsonDigest(existing) !== canonicalJsonDigest(obligation)) fail(`conflicting obligation ${obligation.id}`, "DR7105");
      obligations.set(obligation.id, obligation);
    }
  }
  for (const lane of workflowProfile.verificationPolicy?.immediateLanes ?? []) {
    const id = `workflow-${lane}`;
    if (!obligations.has(id)) obligations.set(id, { id, lane, evidenceKinds: [`verification/${lane}`], minimumPassing: 1, independent: false, deferAllowed: false });
  }
  const material = {
    policyBaselineDigest: baseline.baselineDigest,
    workflowPolicyDigest: workflowProfile.policyDigest,
    workItemId: workItem.id,
    context: matchContext,
    qualityPolicyContextDigest: policyContext.contextDigest,
    acceptanceCriterionIds: policyContext.acceptanceCriterionIds,
    appliedRuleIds: applicable.map(({ id }) => id).sort(),
    obligations: [...obligations.values()].sort((a, b) => a.id.localeCompare(b.id)),
    authority: { definesObligations: true, approvesWork: false, activatesGraphFacts: false },
  };
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "QualityObligationResolution", ...material, resolutionDigest: canonicalJsonDigest(material) });
}

export function evaluateQualityEvidence({ resolution, evidence = [], waivers = [], changeProducerIdentities = [] } = {}) {
  if (!resolution || resolution.kind !== "QualityObligationResolution") fail("resolution is required", "DR7106");
  const { apiVersion, kind, resolutionDigest, ...material } = resolution;
  void apiVersion; void kind;
  if (resolutionDigest !== canonicalJsonDigest(material)) fail("resolution digest drifted", "DR7106");
  if (!Array.isArray(evidence) || !Array.isArray(waivers) || !Array.isArray(changeProducerIdentities) || changeProducerIdentities.some((identity) => typeof identity !== "string" || !identity)) fail("evidence, waivers, or changeProducerIdentities are invalid", "DR7106");
  const producers = new Set(changeProducerIdentities);
  const validWaivers = new Map(waivers.filter((waiver) => {
    if (waiver?.kind !== "QualityPolicyWaiverApproval" || waiver?.decision !== "approve" || typeof waiver?.authority !== "string" || !waiver.authority || waiver?.resolutionDigest !== resolutionDigest || typeof waiver?.obligationId !== "string" || !waiver.obligationId || typeof waiver?.rationale !== "string" || !waiver.rationale || !DIGEST.test(waiver?.approvalDigest)) return false;
    const { approvalDigest, ...body } = waiver;
    return approvalDigest === canonicalJsonDigest(body);
  }).map((waiver) => [waiver.obligationId, waiver]));
  const coverage = resolution.obligations.map((obligation) => {
    const passing = evidence.filter((item, index, items) => item?.status === "pass" && DIGEST.test(item?.digest) && obligation.evidenceKinds.includes(item.kind) && items.findIndex(({ digest }) => digest === item.digest) === index);
    const independent = !obligation.independent || passing.some((item) => {
      const producer = item.producerIdentity ?? item.producerTaskId;
      return item.independent === true && typeof producer === "string" && producer && !producers.has(producer);
    });
    const waived = validWaivers.has(obligation.id);
    const status = waived ? "waived" : passing.length >= obligation.minimumPassing && independent ? "pass" : "missing";
    return { obligationId: obligation.id, status, evidenceDigests: sorted(passing.map((item) => item.digest).filter((digest) => DIGEST.test(digest))), waiverDigest: waived ? canonicalJsonDigest(validWaivers.get(obligation.id)) : null };
  });
  const body = { resolutionDigest, coverage, decision: coverage.every(({ status }) => status !== "missing") ? "satisfied" : "block", authority: "evidence-assessment-only" };
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "QualityEvidenceAssessment", ...body, assessmentDigest: canonicalJsonDigest(body) });
}
