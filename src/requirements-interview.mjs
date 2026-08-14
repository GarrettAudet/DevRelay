import { canonicalJsonDigest } from "./content-digest.mjs";

export class RequirementsInterviewError extends Error {
  constructor(message, code = "DR4800") {
    super(`requirements interview: ${message}`);
    this.name = "RequirementsInterviewError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new RequirementsInterviewError(message, code); };
const immutable = (value) => Object.freeze(structuredClone(value));
const compare = (a, b) => String(a).localeCompare(String(b), "en");

function validateDomains(domains) {
  if (!Array.isArray(domains) || domains.length === 0) fail("domain catalog must be non-empty");
  const seen = new Set();
  let total = 0;
  for (const domain of domains) {
    if (!domain || typeof domain.id !== "string" || !domain.id) fail("every domain requires an id");
    if (seen.has(domain.id)) fail(`duplicate domain ${domain.id}`);
    seen.add(domain.id);
    if (typeof domain.weight !== "number" || domain.weight <= 0 || domain.weight > 1) {
      fail(`domain ${domain.id} has invalid weight`);
    }
    total += domain.weight;
  }
  if (Math.abs(total - 1) > 1e-9) fail("domain weights must sum to exactly 1");
  return seen;
}

export function assessRequirementsClosure({
  domains,
  domainEvidence = [],
  contradictions = [],
  minimumWeightedCoverage = 0.99,
}) {
  const domainIds = validateDomains(domains);
  if (typeof minimumWeightedCoverage !== "number" || minimumWeightedCoverage <= 0 || minimumWeightedCoverage > 1) {
    fail("minimumWeightedCoverage must be greater than 0 and at most 1");
  }
  const evidenceByDomain = new Map();
  for (const evidence of domainEvidence) {
    if (!domainIds.has(evidence?.domainId)) fail(`evidence references unknown domain ${evidence?.domainId}`);
    if (evidenceByDomain.has(evidence.domainId)) fail(`duplicate evidence for domain ${evidence.domainId}`);
    if (!new Set(["resolved", "partial", "unknown"]).has(evidence.status)) {
      fail(`domain ${evidence.domainId} has invalid evidence status`);
    }
    if (typeof evidence.confidence !== "number" || evidence.confidence < 0 || evidence.confidence > 1) {
      fail(`domain ${evidence.domainId} has invalid confidence`);
    }
    if (!Array.isArray(evidence.evidenceRefs)) fail(`domain ${evidence.domainId} requires evidenceRefs`);
    evidenceByDomain.set(evidence.domainId, evidence);
  }
  const unresolvedContradictions = contradictions
    .filter((item) => item?.status !== "resolved")
    .map((item) => item.id)
    .sort(compare);
  const assessments = domains.map((domain) => {
    const evidence = evidenceByDomain.get(domain.id) ?? {
      domainId: domain.id,
      status: "unknown",
      confidence: 0,
      evidenceRefs: [],
    };
    const creditedConfidence = evidence.status === "resolved" ? evidence.confidence : 0;
    return {
      domainId: domain.id,
      weight: domain.weight,
      blocking: domain.blocking === true,
      status: evidence.status,
      confidence: evidence.confidence,
      creditedWeight: domain.weight * creditedConfidence,
      evidenceRefs: [...evidence.evidenceRefs].sort(compare),
    };
  });
  const weightedCoverage = assessments.reduce((sum, item) => sum + item.creditedWeight, 0);
  const blockingUnknowns = assessments
    .filter((item) => item.blocking && (item.status !== "resolved" || item.confidence < 0.99))
    .map(({ domainId }) => domainId)
    .sort(compare);
  const uncoveredDomains = assessments
    .filter((item) => item.status !== "resolved" || item.confidence < 0.99)
    .map(({ domainId }) => domainId)
    .sort(compare);
  const closed =
    weightedCoverage + 1e-12 >= minimumWeightedCoverage &&
    blockingUnknowns.length === 0 &&
    unresolvedContradictions.length === 0;
  const material = {
    minimumWeightedCoverage,
    weightedCoverage,
    blockingUnknowns,
    unresolvedContradictions,
    uncoveredDomains,
    domainAssessments: assessments,
    outcome: closed ? "closed" : "clarify",
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RequirementsClosureAssessment",
    ...material,
    assessmentDigest: canonicalJsonDigest(material),
  });
}

export function createClarificationWave({ assessment, questions, waveNumber = 1, maxQuestions = 24 }) {
  if (assessment?.kind !== "RequirementsClosureAssessment") fail("closure assessment is required");
  if (assessment.outcome === "closed") fail("closed requirements cannot produce another clarification wave");
  if (!Number.isInteger(waveNumber) || waveNumber < 1) fail("waveNumber must be a positive integer");
  if (!Number.isInteger(maxQuestions) || maxQuestions < 1 || maxQuestions > 100) fail("maxQuestions must be 1 through 100");
  if (!Array.isArray(questions)) fail("questions must be an array");
  const unresolved = new Set(assessment.uncoveredDomains);
  const seen = new Set();
  const byDomain = new Map();
  for (const question of questions) {
    if (!question || typeof question.id !== "string" || typeof question.domainId !== "string" || typeof question.prompt !== "string") {
      fail("questions require id, domainId, and prompt");
    }
    if (seen.has(question.id)) fail(`duplicate question ${question.id}`);
    seen.add(question.id);
    if (!unresolved.has(question.domainId) && !assessment.unresolvedContradictions.includes(question.contradictionId)) continue;
    if (!byDomain.has(question.domainId)) byDomain.set(question.domainId, []);
    byDomain.get(question.domainId).push(structuredClone(question));
  }
  for (const values of byDomain.values()) values.sort((a, b) => compare(a.id, b.id));
  const domainOrder = [...byDomain.keys()].sort((a, b) => {
    const left = assessment.domainAssessments.find(({ domainId }) => domainId === a);
    const right = assessment.domainAssessments.find(({ domainId }) => domainId === b);
    return Number(right?.blocking) - Number(left?.blocking) || (right?.weight ?? 0) - (left?.weight ?? 0) || compare(a, b);
  });
  const selected = [];
  for (let depth = 0; selected.length < maxQuestions; depth += 1) {
    let added = false;
    for (const domainId of domainOrder) {
      const candidate = byDomain.get(domainId)[depth];
      if (candidate && selected.length < maxQuestions) {
        selected.push(candidate);
        added = true;
      }
    }
    if (!added) break;
  }
  const material = {
    waveNumber,
    assessmentDigest: assessment.assessmentDigest,
    questionMode: "breadth-first-waves",
    questions: selected,
    unresolvedDomains: assessment.uncoveredDomains,
    unresolvedContradictions: assessment.unresolvedContradictions,
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RequirementsClarificationWave",
    waveId: `RQW-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    ...material,
  });
}

export function runAdaptiveRequirementsInterview(input) {
  const assessment = assessRequirementsClosure(input);
  if (assessment.outcome === "closed") {
    return immutable({ outcome: "gate-candidate-ready", assessment, wave: null });
  }
  const wave = createClarificationWave({
    assessment,
    questions: input.questions ?? [],
    waveNumber: input.waveNumber ?? 1,
    maxQuestions: input.maxQuestions ?? 24,
  });
  return immutable({
    outcome: wave.questions.length > 0 ? "needs-clarification" : "unable-to-proceed",
    assessment,
    wave,
  });
}
