import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateArchitectureDiscoveryArtifact } from "./architecture-discovery-artifact-validator.mjs";

export class ArchitectureDiscoveryGapPolicyError extends Error {
  constructor(message) {
    super(`architecture discovery gap policy is invalid: ${message}`);
    this.name = "ArchitectureDiscoveryGapPolicyError";
    this.code = "DR4315";
  }
}

const fail = (message) => { throw new ArchitectureDiscoveryGapPolicyError(message); };
const ordered = (values, key = canonicalJson) => [...values].sort((a, b) => key(a).localeCompare(key(b)));
const digestBody = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));
const ref = (gap) => ({
  artifactId: gap.gapId,
  digest: gap.gapDigest,
  schema: "https://devrelay.dev/contracts/architecture-discovery-artifacts.schema.json#/$defs/gap",
  mediaType: "application/vnd.devrelay.architecture-discovery-gap+json",
  uri: `artifact://architecture-discovery/gap/${gap.gapId}/${gap.gapDigest.slice(7)}.json`,
});

function validateInputs(snapshot, observations, rules) {
  try { validateArchitectureDiscoveryArtifact(snapshot); } catch (error) { fail(error.message); }
  if (snapshot.kind !== "CurrentArchitectureSnapshot") fail("snapshot must be a CurrentArchitectureSnapshot");
  if (!Array.isArray(observations) || !Array.isArray(rules)) fail("observations and Core-owned rules must be arrays");
  const expected = new Map(snapshot.observations.map((value) => [value.artifactId, value.digest]));
  for (const observation of observations) {
    try { validateArchitectureDiscoveryArtifact(observation); } catch (error) { fail(error.message); }
    if (observation.kind !== "ArchitectureObservation" || expected.get(observation.observationId) !== observation.observationDigest) fail("observations must exactly cover snapshot observation references");
  }
  if (observations.length !== expected.size || new Set(observations.map((value) => value.observationId)).size !== observations.length) fail("observations must cover the exact snapshot set once");
}

function triggered(rule, matches) {
  if (rule.condition === "missing") return matches.length === 0;
  if (rule.condition === "conflict") return new Set(matches.map((value) => value.finding.statement)).size > 1;
  if (rule.condition === "low-confidence") return matches.length === 0 || matches.some((value) => value.finding.confidence.score < rule.minimumScore || ["unknown", "analyzer-inferred"].includes(value.finding.confidence.disposition));
  fail(`rule ${rule.id ?? "<unknown>"} has an unsupported condition`);
}

function validateRule(rule) {
  if (!rule || typeof rule.id !== "string" || !rule.id || typeof rule.subject !== "string" || !rule.subject || typeof rule.reason !== "string" || !rule.reason) fail("each Core-owned rule requires id, subject, and reason");
  if (typeof rule.material !== "boolean") fail(`rule ${rule.id} must declare materiality in Core policy`);
  if (!Array.isArray(rule.sources) || rule.sources.length === 0) fail(`rule ${rule.id} requires policy evidence sources`);
  if ("adapter" in rule || "progression" in rule || "gateDecision" in rule) fail(`rule ${rule.id} contains forbidden adapter or progression authority`);
  if (rule.condition === "low-confidence" && (typeof rule.minimumScore !== "number" || rule.minimumScore < 0 || rule.minimumScore > 1)) fail(`rule ${rule.id} requires minimumScore from 0 to 1`);
}

function createGap(rule, matches) {
  const confidence = matches.length === 0
    ? { disposition:"unknown", score:0, rationale:"No normalized observation satisfies the declared Core-owned discovery requirement." }
    : ordered(matches, (value) => `${value.finding.confidence.score}:${value.observationId}`)[0].finding.confidence;
  const material = { ruleId:rule.id, subject:rule.subject, condition:rule.condition, material:rule.material, reason:rule.reason, observationDigests:ordered(matches.map((value) => value.observationDigest)) };
  const body = {
    apiVersion:"devrelay.dev/v1alpha1", kind:"ArchitectureDiscoveryGap",
    gapId:`AD-GAP-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    subject:rule.subject, material:rule.material, reason:rule.reason,
    confidence:structuredClone(confidence), sources:ordered(rule.sources),
  };
  const gap = { ...body, gapDigest:digestBody(body, "gapDigest") };
  try { validateArchitectureDiscoveryArtifact(gap); } catch (error) { fail(error.message); }
  return gap;
}

export function evaluateArchitectureDiscoveryGapPolicy({ snapshot, observations, rules = [] } = {}) {
  validateInputs(snapshot, observations, rules);
  const ids = new Set();
  const gaps = [];
  for (const rule of ordered(rules, (value) => value?.id ?? "")) {
    validateRule(rule);
    if (ids.has(rule.id)) fail(`duplicate rule ${rule.id}`);
    ids.add(rule.id);
    const matches = observations.filter((value) => value.finding.subject === rule.subject);
    if (triggered(rule, matches)) gaps.push(createGap(rule, matches));
  }
  const blocking = gaps.some((gap) => gap.material);
  if (blocking) return Object.freeze({ outcome:"needs_clarification", gaps:Object.freeze(gaps), diagnostics:Object.freeze(gaps.filter((gap) => gap.material).map((gap) => `Material discovery gap ${gap.gapId}: ${gap.reason}`)) });
  const body = {
    ...structuredClone(snapshot), gaps:ordered(gaps.map(ref), (value) => value.artifactId),
    warnings:ordered(new Set([...snapshot.warnings, ...gaps.map((gap) => `Non-material discovery gap ${gap.gapId} remains explicit for downstream Gate review: ${gap.reason}`)]), (value) => value),
  };
  delete body.snapshotDigest;
  const projected = { ...body, snapshotDigest:digestBody(body, "snapshotDigest") };
  try { validateArchitectureDiscoveryArtifact(projected); } catch (error) { fail(error.message); }
  return Object.freeze({ outcome:"discovered", gaps:Object.freeze(gaps), snapshot:Object.freeze(projected), diagnostics:Object.freeze([]) });
}

export const applyArchitectureDiscoveryGapPolicy = evaluateArchitectureDiscoveryGapPolicy;
