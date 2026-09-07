import os from "node:os";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { canonicalJson, canonicalJsonDigest } from "../src/content-digest.mjs";
import { createCrossCuttingCompositionPlan } from "../src/cross-cutting-composition.mjs";
import { createWorkContinuityIndex, deriveWorkFingerprint, findExactWorkReuse } from "../src/work-continuity.mjs";
import { createProjectControlSnapshot } from "../src/project-control.mjs";

const digest = (value) => canonicalJsonDigest({ value });
const percentile = (values, ratio) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];

export function runQualityContinuityBenchmark({ samples = 10, bindingCount = 100, workItemCount = 1_000, attemptCount = 10_000 } = {}) {
  const bindings = Array.from({ length: bindingCount }, (_, index) => ({
    id: `binding-${String(index).padStart(4, "0")}`,
    boundary: index < 34 ? "before-work-planning" : index < 67 ? "before-task-dispatch" : "frontier-complete",
    moduleId: `benchmark-module-${index}`,
    moduleVersion: "1.0.0",
    operationId: "observe",
    inputPorts: [`port-${index}`],
    outputPorts: [`port-${index + 1}`],
    dependsOn: index ? [`binding-${String(index - 1).padStart(4, "0")}`] : [],
    configurationDigest: digest(`configuration-${index}`),
    grantDigest: digest(`grant-${index}`),
    failureBehavior: "stop",
    enabled: true,
  }));
  const moduleDefinitions = bindings.map((binding) => ({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleDefinition",
    metadata: { id: binding.moduleId, version: binding.moduleVersion },
    operations: [{ id: binding.operationId, inputs: binding.inputPorts.map((name) => ({ name, required: true })), outputs: binding.outputPorts.map((name) => ({ name })) }],
  }));
  const qualityResolutionDigest = digest("quality-resolution");
  const targetWorkFingerprint = deriveWorkFingerprint({ projectId: "devrelay", requirementsBaselineDigest: digest("requirements"), projectOverviewBaselineDigest: digest("overview"), workItem: { id: `WI-${String((attemptCount - 1) % workItemCount).padStart(4, "0")}`, type: "code-change" }, targetRevision: "a".repeat(40), dependencyClosure: [], assignment: { profile: "benchmark" }, qualityResolutionDigest, inputs: [], implementationConfigurationDigest: digest("configuration") });
  const targetFingerprint = targetWorkFingerprint.fingerprint;
  const records = Array.from({ length: attemptCount }, (_, index) => ({
    attemptId: `ATT-${String(index).padStart(6, "0")}`,
    owner: "benchmark",
    fingerprint: index === attemptCount - 1 ? targetFingerprint : digest(`fingerprint-${index}`),
    workItemId: `WI-${String(index % workItemCount).padStart(4, "0")}`,
    workItemType: "code-change",
    targetRevision: "a".repeat(40),
    qualityResolutionDigest,
    leaseExpiresAt: 0,
    status: "completed",
    receiptDigest: digest(`receipt-${index}`),
    resultDigest: digest(`result-${index}`),
    evidenceDigest: digest(`evidence-${index}`),
    supersedesAttemptId: null,
  }));
  const index = createWorkContinuityIndex({ records });
  const workItems = Array.from({ length: workItemCount }, (_, index) => ({ id: `WI-${String(index).padStart(4, "0")}`, status: index % 4 === 0 ? "completed" : "ready" }));
  const dependencies = Array.from({ length: workItemCount - 1 }, (_, index) => ({ id: `EDGE-${index}`, from: workItems[index].id, to: workItems[index + 1].id }));
  const durations = [];
  let resultDigest;
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    const plan = createCrossCuttingCompositionPlan({ bindings, availablePorts: ["port-0"], moduleDefinitions });
    const last = records.at(-1);
    const reuse = findExactWorkReuse({ index, workFingerprint: targetWorkFingerprint, targetRevision: "a".repeat(40), qualityResolutionDigest, verifiedArtifactDigests: [last.receiptDigest, last.resultDigest, last.evidenceDigest] });
    const control = createProjectControlSnapshot({ projectId: "devrelay", lifecycle: { phase: "work-execution", sample }, workItems, dependencies, taskObservations: workItems });
    durations.push(performance.now() - started);
    resultDigest = canonicalJsonDigest({ planDigest: plan.planDigest, decisionDigest: reuse.decisionDigest, snapshotDigest: control.snapshotDigest });
  }
  const material = {
    samples,
    scale: { bindingCount, workItemCount, attemptCount },
    p50Milliseconds: percentile(durations, 0.5),
    p95Milliseconds: percentile(durations, 0.95),
    maximumMilliseconds: Math.max(...durations),
    thresholdMilliseconds: 500,
    outcome: percentile(durations, 0.95) <= 500 ? "pass" : "fail",
    environment: { platform: process.platform, architecture: process.arch, nodeVersion: process.version, cpuModel: os.cpus()[0]?.model ?? "unknown", logicalCpuCount: os.cpus().length },
    inputsDigest: canonicalJsonDigest({ bindings, moduleDefinitions, indexDigest: index.indexDigest, workItems, dependencies }),
    resultDigest,
    scope: "local-reference-host-only",
    universalPerformanceClaim: false,
  };
  return { apiVersion: "devrelay.dev/v1alpha1", kind: "QualityContinuityBenchmarkEvidence", ...material, evidenceDigest: canonicalJsonDigest(material) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${canonicalJson(runQualityContinuityBenchmark())}\n`);
}
