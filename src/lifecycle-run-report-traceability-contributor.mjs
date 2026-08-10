import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateLifecycleRunReportArtifact } from "./lifecycle-run-report-artifact-validator.mjs";

export const LIFECYCLE_RUN_REPORT_COMPLETION_WORK_ITEMS = Object.freeze([
  "WI-RUN-CONTRACTS",
  "WI-RUN-CONTENT-POLICY",
  "WI-RUN-LEDGER",
  "WI-RUN-OBSERVATIONS",
  "WI-RUN-FRONTIER",
  "WI-RUN-SNAPSHOT",
  "WI-RUN-MARKDOWN",
]);

const SCOPE = "lifecycle-run-report/integrated";
const WORK_ITEM_SCOPE = "work-breakdown/candidate";
const fail = (message) => { throw new TypeError(`lifecycle-run-report traceability contributor: ${message}`); };
const ref = (loaded) => ({ artifactId: loaded.ref.artifactId, digest: loaded.ref.digest });
const sameRef = (left, right) => left?.artifactId === right?.artifactId && left?.digest === right?.digest;
const endpoint = (kind, stableId, authority, scope) => ({ kind, stableId, authority, scope });
const sort = (values) => values.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));
const locator = (loaded, jsonPointer, entity) => ({ artifact: ref(loaded), jsonPointer, entityDigest: canonicalJsonDigest(entity) });

function allLoaded(context) {
  const found = [];
  const walk = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.ref && value.value && value.bytes !== undefined) { found.push(value); return; }
    for (const child of Object.values(value)) walk(child);
  };
  walk({
    loadedInputs: context?.loadedInputs,
    loadedOutputs: context?.loadedOutputs,
    loadedAttachments: context?.loadedAttachments,
    resolvedArtifacts: context?.resolvedArtifacts,
  });
  if (found.length === 0) walk(context?.loadedArtifacts);
  return found;
}

function exactLoaded(loaded, expectedRef, label) {
  if (!sameRef(loaded?.ref, expectedRef)) fail(`${label} ArtifactRef is missing or substituted`);
  if (!Buffer.isBuffer(loaded.bytes) && !(loaded.bytes instanceof Uint8Array)) fail(`${label} raw bytes are required`);
  const bytes = Buffer.from(loaded.bytes);
  if (sha256Digest(bytes) !== expectedRef.digest) fail(`${label} raw bytes do not match its digest`);
  let decoded;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(`${label} is not UTF-8 JSON`); }
  if (canonicalJson(decoded) !== canonicalJson(loaded.value)) fail(`${label} decoded value differs from the loaded semantic value`);
  return loaded;
}

function validateSealed(value, digestField, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const digest = value[digestField];
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", digestField].includes(key)));
  if (digest !== canonicalJsonDigest(body)) fail(`${label} ${digestField} does not bind canonical material`);
}

function oneKind(loaded, kind) {
  const matches = loaded.filter(({ value }) => value?.kind === kind);
  if (matches.length !== 1) fail(`exactly one loaded ${kind} is required`);
  return matches[0];
}

function requireSource(loaded, expectedRef, kind, workItemId) {
  const matches = loaded.filter((entry) => sameRef(entry.ref, expectedRef));
  if (matches.length !== 1) fail(`${workItemId} canonical closure member ${kind} is missing or duplicated`);
  const source = exactLoaded(matches[0], expectedRef, `${workItemId} ${kind}`);
  if (source.value?.kind !== kind) fail(`${workItemId} canonical closure member must be ${kind}`);
  return source;
}

export function resolveLifecycleRunReportCanonicalClosure(context) {
  const loaded = allLoaded(context);
  const identities = new Set();
  for (const entry of loaded) {
    const identity = `${entry.ref?.artifactId}\0${entry.ref?.digest}`;
    if (identities.has(identity)) fail(`duplicate loaded source ${entry.ref?.artifactId}`);
    identities.add(identity);
  }
  const inputLoaded = oneKind(loaded, "LifecycleRunReportTraceabilityInput");
  exactLoaded(inputLoaded, inputLoaded.ref, "traceability input");
  const input = inputLoaded.value;
  validateSealed(input, "inputDigest", "traceability input");
  if (input.authority !== "trusted-core-input" || input.completionFacts?.length !== 7 || input.canonicalClosures?.length !== 7) fail("traceability input must bind exactly seven completion facts and closures");
  const expected = [...LIFECYCLE_RUN_REPORT_COMPLETION_WORK_ITEMS].sort();
  const closures = input.canonicalClosures.map((closureRef) => requireSource(loaded, closureRef, "CanonicalChangeIntegrationClosure", closureRef.artifactId));
  const resolved = closures.map((closureLoaded) => {
    const closure = closureLoaded.value;
    validateSealed(closure, "closureDigest", `${closure.workItemId} closure`);
    const task = requireSource(loaded, closure.taskContract, "BootstrapWorkExecutionTaskContract", closure.workItemId);
    const handoff = requireSource(loaded, closure.handoff, "BootstrapWorkItemHandoff", closure.workItemId);
    const approval = requireSource(loaded, closure.verificationApproval, "WorkItemVerificationGateApproval", closure.workItemId);
    const integration = requireSource(loaded, closure.hostIntegration, "BootstrapWorkItemHostIntegrationReceipt", closure.workItemId);
    const completion = requireSource(loaded, closure.completionFact, "IntegratedCompletionFact", closure.workItemId);
    validateLifecycleRunReportArtifact(completion.value);
    if (task.value.workItemId !== closure.workItemId || handoff.value.workItemId !== closure.workItemId || integration.value.workItemId !== closure.workItemId || completion.value.workItem.artifactId !== closure.workItemId) fail(`${closure.workItemId} closure identities disagree`);
    if (handoff.value.outcome !== "pass" || integration.value.authoritativeIntegratedCompletionFactCreated !== true || completion.value.status !== "verified-and-integrated") fail(`${closure.workItemId} closure is not verified and integrated`);
    if (integration.value.adapter?.maturity !== closure.adapterMaturity || !["contract-defined", "fixture-conformant", "live-conformant", "release-ready"].includes(closure.adapterMaturity)) fail(`${closure.workItemId} adapter maturity is stale or invalid`);
    if (completion.value.changeSet.artifactId !== closure.changeSetId || completion.value.verification.artifactId !== approval.value.approvalId || completion.value.integration.artifactId !== integration.value.receiptId) fail(`${closure.workItemId} completion lineage is stale or substituted`);
    return { closureLoaded, task, handoff, approval, integration, completion };
  });
  const actual = resolved.map(({ closureLoaded }) => closureLoaded.value.workItemId).sort();
  if (new Set(actual).size !== 7 || canonicalJson(actual) !== canonicalJson(expected)) fail("canonical closures do not cover the exact seven lifecycle work items");
  const completionRefs = sort(resolved.map(({ completion }) => ref(completion)));
  if (canonicalJson(completionRefs) !== canonicalJson(sort(structuredClone(input.completionFacts)))) fail("traceability input completion-fact set differs from the canonical closures");
  return Object.freeze({ inputLoaded, closures: Object.freeze(resolved) });
}

function artifactBody(kind, digestField, body) {
  const value = { apiVersion: "devrelay.dev/v1alpha1", kind, ...structuredClone(body) };
  value[digestField] = canonicalJsonDigest(body);
  return validateLifecycleRunReportArtifact(value);
}

export function createLifecycleRunReportTraceabilityInput(body) {
  return artifactBody("LifecycleRunReportTraceabilityInput", "inputDigest", body);
}

export function createCanonicalChangeIntegrationClosure(body) {
  return artifactBody("CanonicalChangeIntegrationClosure", "closureDigest", body);
}

export function createLifecycleRunReportTraceabilityUpdateSet({ updateSetId, executionId, contributor, baseGraph, update } = {}) {
  if (!sameRef(update, { artifactId: update?.artifactId, digest: update?.digest })) fail("update set requires an exact update ArtifactRef");
  return artifactBody("LifecycleRunReportTraceabilityUpdateSet", "updateSetDigest", {
    updateSetId: updateSetId ?? `LRR-TUS-${update.digest.slice(7, 23)}`,
    executionId,
    contributor,
    baseGraph,
    update,
    updateDigest: update.digest,
    conflictSafety: "base-graph-cas",
    authority: "trusted-contributor-projection",
  });
}

export function createLifecycleRunReportTraceabilityDiagnostics({ diagnosticId, executionId, updateSet, dispositions = [], orphanObservations = [] } = {}) {
  const orderedDispositions = sort(structuredClone(dispositions));
  const orderedOrphans = sort(structuredClone(orphanObservations));
  return artifactBody("LifecycleRunReportTraceabilityDiagnostics", "diagnosticDigest", {
    diagnosticId: diagnosticId ?? `LRR-TD-${canonicalJsonDigest({ executionId, updateSet, dispositions: orderedDispositions, orphanObservations: orderedOrphans }).slice(7, 23)}`,
    executionId,
    updateSet,
    dispositions: orderedDispositions,
    orphanObservations: orderedOrphans,
    authority: "diagnostic-only",
  });
}

export function createLifecycleRunReportTraceabilityMergeProof({ proofId, executionId, updateSet, checkpoint, baseGraph, resultGraph, updateDigest, atomicReceipt, replayReceipt } = {}) {
  if (checkpoint?.digest === undefined) fail("merge proof requires the exact Core checkpoint ArtifactRef");
  return artifactBody("LifecycleRunReportTraceabilityMergeProof", "proofDigest", {
    proofId: proofId ?? `LRR-TMP-${checkpoint.digest.slice(7, 23)}`,
    executionId,
    updateSet,
    checkpoint,
    checkpointDigest: checkpoint.digest,
    baseGraph,
    resultGraph,
    updateDigest,
    atomicReceipt,
    replayReceipt,
    idempotentReplay: sameRef(atomicReceipt, replayReceipt),
    conflictSafety: "base-graph-cas",
    authority: "trusted-core-proof",
  });
}

function matches(context) {
  return context?.invocation?.module?.id === "lifecycle-run-report-reconciliation" &&
    context.invocation.module.version === "0.1.0" &&
    context.invocation.module.operation === "reconcile" &&
    allLoaded(context).some(({ value }) => value?.kind === "LifecycleRunReportTraceabilityInput");
}

export function createLifecycleRunReportTraceabilityContributor() {
  return Object.freeze({
    metadata: Object.freeze({ id: "devrelay.lifecycle-run-report", version: "1.0.0" }),
    authority: "approved",
    scope: SCOPE,
    ownership: Object.freeze({ authority: "approved", scope: SCOPE, nodeKinds: ["change-set", "integrated-change-record", "verification-evidence"], edgeKinds: ["integrated-as", "produces", "verified-by"] }),
    match: matches,
    async project(context) {
      if (!matches(context)) fail("project called for a nonmatching execution");
      const { closures } = resolveLifecycleRunReportCanonicalClosure(context);
      const nodes = [];
      const edges = [];
      for (const { closureLoaded, approval, integration, completion } of closures) {
        const closure = closureLoaded.value;
        const workItem = endpoint("work-item", closure.workItemId, "candidate", WORK_ITEM_SCOPE);
        const verification = endpoint("verification-evidence", approval.value.approvalId, "approved", SCOPE);
        const changeSet = endpoint("change-set", closure.changeSetId, "approved", SCOPE);
        const integrated = endpoint("integrated-change-record", integration.value.receiptId, "approved", SCOPE);
        const sources = [locator(closureLoaded, "", closure), locator(completion, "", completion.value)];
        nodes.push(
          { kind: "verification-evidence", stableId: approval.value.approvalId, label: approval.value.approvalId, attributes: { artifact: ref(approval), workItemId: closure.workItemId }, sourceLocators: [...sources, locator(approval, "", approval.value)] },
          { kind: "change-set", stableId: closure.changeSetId, label: closure.changeSetId, attributes: { artifact: structuredClone(completion.value.changeSet), workItemId: closure.workItemId }, sourceLocators: sources },
          { kind: "integrated-change-record", stableId: integration.value.receiptId, label: integration.value.receiptId, attributes: { artifact: ref(integration), adapter: structuredClone(integration.value.adapter), completionFact: ref(completion) }, sourceLocators: [...sources, locator(integration, "", integration.value)] },
        );
        edges.push(
          { kind: "verified-by", source: workItem, target: verification, rationale: "The Gate approved the exact verification evidence for this lifecycle report work item.", sourceLocators: sources },
          { kind: "produces", source: workItem, target: changeSet, rationale: "The verified lifecycle report work item produced this exact integrated change set.", sourceLocators: sources },
          { kind: "integrated-as", source: changeSet, target: integrated, rationale: "The bootstrap host incorporated the exact verified change set as this integration receipt.", sourceLocators: sources },
        );
      }
      return { horizon: "implementation", nodes: sort(nodes), edges: sort(edges) };
    },
  });
}

export const lifecycleRunReportTraceabilityContributor = createLifecycleRunReportTraceabilityContributor();
