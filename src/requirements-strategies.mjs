import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateProviderExecutionAttestation } from "./provider-execution-attestation.mjs";

export class RequirementsStrategyError extends Error {
  constructor(message, code = "DR4850") {
    super(`requirements strategy: ${message}`);
    this.name = "RequirementsStrategyError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new RequirementsStrategyError(message, code); };
const immutable = (value) => Object.freeze(structuredClone(value));
const STRATEGY_IDS = Object.freeze(["bmad", "gsd", "openspec", "spec-kit", "superpowers"]);
const FORBIDDEN = new Set(["approval", "gate", "graph", "graphOperations", "progression", "route", "traceabilityUpdate"]);

function noAuthority(value) {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value)) for (const key of Object.keys(value)) if (FORBIDDEN.has(key)) fail(`strategy returned forbidden authority field ${key}`);
  for (const child of Object.values(value)) noAuthority(child);
}

function validateContribution(value, expected) {
  noAuthority(value);
  if (!value || value.apiVersion !== "devrelay.dev/v1alpha1" || value.kind !== "RequirementsStrategyContribution") fail("strategy contribution envelope is invalid");
  if (value.strategy?.id !== expected.id || value.strategy?.version !== expected.version || value.strategy?.maturity !== expected.maturity) fail("strategy identity or maturity drifted");
  if (!Array.isArray(value.questions) || !Array.isArray(value.assumptions) || !Array.isArray(value.nativeArtifacts)) fail("strategy contribution collections are required");
  const seen = new Set();
  for (const question of value.questions) {
    if (!question || typeof question.id !== "string" || typeof question.domainId !== "string" || typeof question.prompt !== "string" || !question.prompt) fail("strategy question is malformed");
    if (seen.has(question.id)) fail(`duplicate strategy question ${question.id}`);
    seen.add(question.id);
  }
  return structuredClone(value);
}

function builtIn(id, domains) {
  const prompts = {
    bmad: "Which stakeholder outcome, measurable value, and product boundary remain unresolved?",
    gsd: "What is the smallest demonstrable outcome, its concrete constraints, and its completion proof?",
    openspec: "What exact current-to-target delta, scenario, and out-of-scope behavior must the specification preserve?",
    "spec-kit": "Which constitution constraint, user journey, interface intent, and non-functional obligation governs this scope?",
    superpowers: "Which assumption is most likely to invalidate the proposed behavior, and what adversarial example would expose it?",
  };
  return domains.map((domain, index) => ({
    id: `RSQ-${id.toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
    domainId: domain.id,
    prompt: `${prompts[id]} [${domain.id}]`,
    answerType: "free-text",
    provenance: `${id}:native-composite/v1`,
  }));
}

export function createRequirementsStrategyRegistry({ liveAdapters = {}, attestations = {} } = {}) {
  const definitions = Object.fromEntries(STRATEGY_IDS.map((id) => {
    const live = liveAdapters[id];
    const candidate = attestations[id];
    let attestation;
    if (candidate !== undefined) {
      try {
        attestation = validateProviderExecutionAttestation(candidate);
      } catch (error) {
        fail(`${id} live attestation is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (attestation.binding.id !== id || !attestation.capability.startsWith(`${id}.requirements.`)) {
        fail(`${id} live attestation does not bind the expected requirements capability`);
      }
    }
    const verifiedLive = typeof live === "function" && attestation !== undefined;
    const maturity = verifiedLive
      ? attestation.maturity
      : id === "openspec" || id === "spec-kit"
        ? "contract-defined"
        : "fixture-conformant";
    const definition = {
      id,
      version: "1.0.0",
      maturity,
      provider: typeof live === "function" ? "external-bounded-adapter" : "devrelay-native-composite",
    };
    if (verifiedLive) {
      definition.executionAttestation = {
        attestationId: attestation.attestationId,
        attestationDigest: attestation.attestationDigest,
        capability: attestation.capability,
      };
    }
    return [id, immutable(definition)];
  }));
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RequirementsStrategyRegistry",
    strategies: definitions,
    registryDigest: canonicalJsonDigest(definitions),
  });
}

export async function runRequirementsStrategyChain({ registry, strategyOrder, domains, priorAnswers = [], coverageState, invocationId }, { liveAdapters = {} } = {}) {
  if (registry?.kind !== "RequirementsStrategyRegistry" || registry.registryDigest !== canonicalJsonDigest(registry.strategies)) fail("strategy registry is stale");
  if (!Array.isArray(strategyOrder) || strategyOrder.length === 0 || new Set(strategyOrder).size !== strategyOrder.length) fail("strategy order must be explicit and unique");
  if (strategyOrder.some((id) => !STRATEGY_IDS.includes(id) || !registry.strategies[id])) fail("strategy order references an undeclared strategy");
  if (!Array.isArray(domains) || domains.length === 0 || domains.some((domain) => typeof domain?.id !== "string" || !domain.id)) fail("decision domains are required");
  if (typeof invocationId !== "string" || !invocationId || !coverageState || typeof coverageState !== "object") fail("invocation and coverage state are required");
  const contributions = [];
  for (const id of strategyOrder) {
    const definition = registry.strategies[id];
    const request = immutable({
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "RequirementsStrategyRequest",
      invocationId,
      strategy: definition,
      domains: structuredClone(domains),
      priorAnswers: structuredClone(priorAnswers),
      coverageState: structuredClone(coverageState),
    });
    const adapter = liveAdapters[id];
    const raw = typeof adapter === "function" ? await adapter(request) : {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "RequirementsStrategyContribution",
      strategy: definition,
      questions: builtIn(id, domains),
      assumptions: [],
      nativeArtifacts: [],
      sourceRequestDigest: canonicalJsonDigest(request),
    };
    const contribution = validateContribution(raw, definition);
    if (contribution.sourceRequestDigest !== canonicalJsonDigest(request)) fail(`${id} contribution is bound to another request`);
    contributions.push(contribution);
  }
  const questions = contributions.flatMap((item) => item.questions).sort((left, right) => left.id.localeCompare(right.id, "en"));
  const questionIds = new Set();
  for (const question of questions) {
    if (questionIds.has(question.id)) fail(`cross-strategy duplicate question ${question.id}`);
    questionIds.add(question.id);
  }
  const material = {
    invocationId,
    registryDigest: registry.registryDigest,
    strategyOrder: [...strategyOrder],
    contributions,
    questions,
    closureAuthority: "core-only",
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RequirementsStrategyChainResult",
    resultId: `RSC-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    ...material,
    resultDigest: canonicalJsonDigest(material),
  });
}
