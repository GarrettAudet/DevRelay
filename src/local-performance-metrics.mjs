import { canonicalJsonDigest } from "./content-digest.mjs";

export class LocalPerformanceMetricsError extends Error {
  constructor(message, code = "DR4840") {
    super(`local performance metrics: ${message}`);
    this.name = "LocalPerformanceMetricsError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new LocalPerformanceMetricsError(message, code); };
const immutable = (value) => Object.freeze(structuredClone(value));
const METRICS = Object.freeze([
  "cacheHits",
  "changedFiles",
  "cycleDurationMilliseconds",
  "receiptBytes",
  "retries",
  "testDurationMilliseconds",
  "tokenUsage",
  "toolCalls",
  "waitDurationMilliseconds",
]);

function normalizeObservation(observation, metric) {
  if (!observation || observation.metric !== metric) fail(`observation for ${metric} is missing or substituted`);
  if (!new Set(["measured", "unavailable"]).has(observation.disposition)) fail(`${metric} has an invalid disposition`);
  if (observation.disposition === "unavailable") {
    if (observation.value !== undefined) fail(`${metric} cannot invent a value when unavailable`);
    if (typeof observation.reason !== "string" || !observation.reason) fail(`${metric} requires an unavailable reason`);
    return { metric, disposition: "unavailable", reason: observation.reason, provenance: [] };
  }
  if (!Number.isFinite(observation.value) || observation.value < 0) fail(`${metric} must be a non-negative observed number`);
  if (!Array.isArray(observation.provenance) || observation.provenance.length === 0) fail(`${metric} requires exact provenance`);
  const provenance = [...new Set(observation.provenance)];
  if (provenance.length !== observation.provenance.length || provenance.some((value) => typeof value !== "string" || !value)) fail(`${metric} provenance is malformed`);
  return { metric, disposition: "measured", value: observation.value, provenance: provenance.sort() };
}

export function recordLocalPerformanceMetrics({ executionId, observations, selfOverheadMilliseconds, exportPolicy = "local-only" }) {
  if (typeof executionId !== "string" || !executionId) fail("executionId is required");
  if (!Array.isArray(observations)) fail("observations must be an array");
  if (!Number.isFinite(selfOverheadMilliseconds) || selfOverheadMilliseconds < 0) fail("self overhead must be observed and non-negative");
  if (exportPolicy !== "local-only") fail("V0.11 metrics are local-only", "DR4841");
  const byMetric = new Map();
  for (const observation of observations) {
    if (!METRICS.includes(observation?.metric)) fail(`unknown metric ${observation?.metric}`);
    if (byMetric.has(observation.metric)) fail(`duplicate metric ${observation.metric}`);
    byMetric.set(observation.metric, observation);
  }
  const metrics = METRICS.map((metric) => normalizeObservation(byMetric.get(metric) ?? {
    metric,
    disposition: "unavailable",
    reason: "host-did-not-observe",
  }, metric));
  const material = {
    executionId,
    authority: "non-authoritative-observation",
    exportPolicy,
    selfOverheadMilliseconds,
    metrics,
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "LocalPerformanceMetricsAttachment",
    attachmentId: `LPM-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    ...material,
    attachmentDigest: canonicalJsonDigest(material),
  });
}

export function verifyLocalPerformanceMetrics(attachment) {
  if (attachment?.kind !== "LocalPerformanceMetricsAttachment") fail("metrics attachment is required");
  const { attachmentId, attachmentDigest, apiVersion, kind, ...material } = attachment;
  void attachmentId; void apiVersion; void kind;
  if (attachmentDigest !== canonicalJsonDigest(material)) fail("metrics attachment digest drifted");
  if (attachment.authority !== "non-authoritative-observation" || attachment.exportPolicy !== "local-only") fail("metrics cannot acquire workflow authority or network export");
  if (attachment.metrics.length !== METRICS.length || attachment.metrics.some((item, index) => item.metric !== METRICS[index])) fail("metric coverage or ordering drifted");
  return true;
}
