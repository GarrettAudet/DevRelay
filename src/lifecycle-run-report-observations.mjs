import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateLifecycleRunReportArtifact } from "./lifecycle-run-report-artifact-validator.mjs";
import { validateProviderExecutionAttestation } from "./provider-execution-attestation.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const AVAILABILITIES = new Set(["measured", "estimated", "unavailable", "not-applicable"]);
const MATURITY = Object.freeze(["contract-defined", "fixture-conformant", "live-conformant", "release-ready"]);
const DIMENSIONS = Object.freeze(["module", "operation", "inputs", "policy", "circuit", "host"]);

export class LifecycleRunObservationError extends Error {
  constructor(message) {
    super(`lifecycle run observation is invalid: ${message}`);
    this.name = "LifecycleRunObservationError";
    this.code = "DR4410";
  }
}

const fail = message => { throw new LifecycleRunObservationError(message); };
const exact = value => canonicalJsonDigest(value);
const same = (left, right) => exact(left) === exact(right);

function assertMetric(metric) {
  if (!metric || typeof metric !== "object" || Array.isArray(metric)) fail("metric must be an object");
  if (!AVAILABILITIES.has(metric.availability)) fail(`unsupported availability ${metric.availability}`);
  const present = metric.availability === "measured" || metric.availability === "estimated";
  if (present && metric.provenance === undefined) fail(`${metric.name} ${metric.availability} value requires exact provenance`);
  if (!present && ("value" in metric || "unit" in metric || "provenance" in metric)) fail(`${metric.name} absence cannot carry a value, unit, or provenance`);
  return metric;
}

function seal(value, digestField) {
  const material = Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", digestField].includes(key)));
  return {...value, [digestField]: canonicalJsonDigest(material)};
}

export function ingestRunHostObservation({observationId, runId, metric, sensitivity = "internal"}) {
  assertMetric(metric);
  return validateLifecycleRunReportArtifact(seal({
    apiVersion: API_VERSION,
    kind: "RunHostObservation",
    observationId,
    runId,
    metric: structuredClone(metric),
    sensitivity,
    authority: "non-authoritative-observation"
  }, "observationDigest"));
}

export function ingestRunHostObservations(inputs) {
  if (!Array.isArray(inputs)) fail("observations must be an array");
  const observations = inputs.map(ingestRunHostObservation);
  const ids = observations.map(value => value.observationId);
  if (new Set(ids).size !== ids.length) fail("observation IDs must be unique");
  return observations;
}

export function resolveAdapterMaturity({adapter, evidence, comparability, trustedObservers=[]}) {
  if (!adapter || typeof adapter !== "object") fail("adapter binding is required");
  if (!Array.isArray(evidence) || evidence.length === 0) fail("adapter maturity requires declared evidence");
  const admitted = evidence.map(item => {
    if (!item?.artifact?.artifactId || !item.artifact.digest) fail("maturity evidence requires an exact artifact reference");
    if (!MATURITY.includes(item.maturity)) fail(`unsupported adapter maturity ${item.maturity}`);
    if (!same(item.adapter, adapter)) fail("maturity evidence adapter binding does not match the assessed binding");
    if (["live-conformant", "release-ready"].includes(item.maturity)) {
      if (!item.attestation) fail(`${item.maturity} evidence requires a trusted provider execution attestation`);
      const trustedObserver=trustedObservers.find(observer=>same(observer,item.attestation.observer));
      if (!trustedObserver) fail("attestation observer is not in the Core/host trust configuration");
      try { validateProviderExecutionAttestation(item.attestation, { expectedBinding: adapter, expectedObserver: trustedObserver }); } catch (error) { fail(error.message); }
      if (item.artifact.artifactId !== item.attestation.attestationId || item.artifact.digest !== item.attestation.attestationDigest) fail("maturity evidence does not reference the exact attestation");
      if (MATURITY.indexOf(item.attestation.maturity) < MATURITY.indexOf(item.maturity)) fail("attestation maturity is weaker than the claimed maturity");
    }
    return item;
  });
  const selected = admitted.reduce((best, item) => MATURITY.indexOf(item.maturity) > MATURITY.indexOf(best.maturity) ? item : best);
  if (!comparability || typeof comparability !== "object") fail("adapter assessment requires an explicit comparability disposition");
  return Object.freeze({
    assessment: Object.freeze({adapter: structuredClone(adapter), maturity: selected.maturity, comparability: structuredClone(comparability)}),
    evidence: Object.freeze(admitted.map(item => Object.freeze(structuredClone(item.artifact))))
  });
}

export function evaluateRunComparability({decisionId, leftRunId, rightRunId, left, right}) {
  if (!left || !right) fail("both comparison dimension sets are required");
  const dimensions = DIMENSIONS.map(name => {
    const leftDigest = left[name];
    const rightDigest = right[name];
    if (typeof leftDigest !== "string" || typeof rightDigest !== "string") fail(`comparison dimension ${name} requires both exact digests`);
    return {name, leftDigest, rightDigest, matches: leftDigest === rightDigest};
  });
  const reasons = dimensions.filter(value => !value.matches).map(value => `${value.name} digest differs`);
  return validateLifecycleRunReportArtifact(seal({
    apiVersion: API_VERSION,
    kind: "RunComparabilityDecision",
    decisionId,
    leftRunId,
    rightRunId,
    dimensions,
    disposition: reasons.length === 0 ? "comparable" : "not-comparable",
    reasons,
    authority: "comparison-only"
  }, "decisionDigest"));
}

