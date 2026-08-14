import { canonicalJsonDigest } from "./content-digest.mjs";

const VERSION = "devrelay.dev/v1alpha1";
const MATURITY = new Set(["unavailable", "contract-defined", "fixture-conformant", "live-conformant", "release-ready", "core-owned"]);
const OUTCOME = new Set(["pending", "passed", "promoted", "verified", "integrated", "accepted", "not-applicable", "failed"]);

export class ModuleQualityReportError extends Error {
  constructor(message) {
    super("Module quality report is invalid: " + message);
    this.name = "ModuleQualityReportError";
    this.code = "DR4890";
  }
}
function fail(message) { throw new ModuleQualityReportError(message); }
function text(value, label) { if (typeof value !== "string" || !value.trim()) fail(label + " is required"); return value.trim(); }
function clean(value) { return String(value).replaceAll("|", "\\|").replaceAll("\r", "").replace(/[^\x09\x0A\x20-\x7E]/gu, "?"); }

export function createModuleQualityReport({ reportId, runId, stages, workItems, providers, metrics, nextAction } = {}) {
  text(reportId, "reportId");
  text(runId, "runId");
  if (!Array.isArray(stages) || stages.length === 0) fail("stages are required");
  const normalizedStages = stages.map((stage) => {
    if (!Number.isInteger(stage.sequence) || stage.sequence < 1) fail("stage sequence is invalid");
    const maturity = text(stage.maturity, "stage maturity");
    const outcome = text(stage.outcome, "stage outcome");
    if (!MATURITY.has(maturity)) fail("unsupported maturity " + maturity);
    if (!OUTCOME.has(outcome)) fail("unsupported outcome " + outcome);
    return { sequence: stage.sequence, module: text(stage.module, "stage module"), operation: text(stage.operation, "stage operation"), plugin: text(stage.plugin, "stage plugin"), maturity, outcome, evidence: text(stage.evidence, "stage evidence") };
  }).sort((left, right) => left.sequence - right.sequence || left.module.localeCompare(right.module, "en"));
  if (new Set(normalizedStages.map((stage) => stage.sequence)).size !== normalizedStages.length) fail("stage sequences must be unique");
  const normalizedWorkItems = [...(workItems ?? [])].map((item) => ({ id: text(item.id, "work item id"), outcome: text(item.outcome, "work item outcome"), evidence: text(item.evidence, "work item evidence") })).sort((left, right) => left.id.localeCompare(right.id, "en"));
  const normalizedProviders = [...(providers ?? [])].map((provider) => {
    const maturity = text(provider.maturity, "provider maturity");
    if (!MATURITY.has(maturity)) fail("unsupported provider maturity " + maturity);
    return { id: text(provider.id, "provider id"), maturity, evidence: text(provider.evidence, "provider evidence") };
  }).sort((left, right) => left.id.localeCompare(right.id, "en"));
  const normalizedMetrics = [...(metrics ?? [])].map((metric) => ({ name: text(metric.name, "metric name"), value: text(String(metric.value), "metric value"), provenance: text(metric.provenance, "metric provenance") })).sort((left, right) => left.name.localeCompare(right.name, "en"));
  const body = { reportId, runId, stages: normalizedStages, workItems: normalizedWorkItems, providers: normalizedProviders, metrics: normalizedMetrics, nextAction: text(nextAction, "nextAction"), authority: "read-only", workflowAuthority: false };
  return Object.freeze({ apiVersion: VERSION, kind: "ModuleQualityReport", ...body, reportDigest: canonicalJsonDigest(body) });
}

export function renderModuleQualityReportMarkdown(report) {
  if (!report || report.kind !== "ModuleQualityReport") fail("report kind is invalid");
  const rebuilt = createModuleQualityReport(report);
  if (rebuilt.reportDigest !== report.reportDigest) fail("report digest changed");
  const integrated = report.workItems.filter((item) => item.outcome === "integrated").length;
  const lines = [
    "# DevRelay module-quality run",
    "",
    "Run: " + clean(report.runId),
    "Status: " + integrated + "/" + report.workItems.length + " work items integrated.",
    "Authority: read-only projection; canonical artifacts and Gate records remain authoritative.",
    "",
    "## Lifecycle",
    "",
    "| # | Module | Operation | Plug-in or Core binding | Maturity | Outcome | Evidence |",
    "|---:|---|---|---|---|---|---|",
    ...report.stages.map((stage) => "| " + stage.sequence + " | " + clean(stage.module) + " | " + clean(stage.operation) + " | " + clean(stage.plugin) + " | " + stage.maturity + " | " + stage.outcome + " | " + clean(stage.evidence) + " |"),
    "",
    "## Providers",
    "",
    ...report.providers.map((provider) => "- " + clean(provider.id) + ": " + provider.maturity + " -> " + clean(provider.evidence)),
    "",
    "## Performance",
    "",
    ...report.metrics.map((metric) => "- " + clean(metric.name) + ": " + clean(metric.value) + " (" + clean(metric.provenance) + ")"),
    "",
    "## Next action",
    "",
    clean(report.nextAction),
    "",
    "Report digest: " + report.reportDigest,
    "",
  ];
  return lines.join("\n");
}
