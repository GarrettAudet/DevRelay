import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateDesktopOrchestrationArtifact } from "./desktop-orchestration-artifact-validator.mjs";
import { validateProjectMemoryArtifact } from "./project-memory-artifact-validator.mjs";

const MODULE = Object.freeze({ id: "desktop-orchestration", version: "0.1.0" });
const CANDIDATE_SCOPE = "desktop-orchestration/candidate";
const APPROVED_SCOPE = "desktop-orchestration/approved";
const REQUIREMENTS_SCOPE = "requirements/baseline";
const fail = (message) => { throw new TypeError(`desktop orchestration traceability contributor: ${message}`); };
const freeze = (value) => Object.freeze(structuredClone(value));
const endpoint = (kind, stableId, authority, scope) => ({ kind, stableId, authority, scope });
const sort = (values) => values.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));
const sameRef = (left, right) => left?.artifactId === right?.artifactId && left?.digest === right?.digest;

function allLoaded(context) {
  return [...Object.values(context?.loadedInputs ?? {}), ...Object.values(context?.loadedOutputs ?? {}), ...Object.values(context?.loadedAttachments ?? {})].flat();
}

function exactLoaded(context, kind, { multiple = false, projectMemory = false } = {}) {
  const matches = allLoaded(context).filter(({ value }) => value?.kind === kind);
  if ((!multiple && matches.length !== 1) || (multiple && matches.length === 0)) fail(`${kind} ${multiple ? "requires at least one" : "must resolve exactly once"}`);
  for (const loaded of matches) {
    if (!loaded?.ref || (!Buffer.isBuffer(loaded.bytes) && !(loaded.bytes instanceof Uint8Array))) fail(`${kind} requires exact bytes and ArtifactRef`);
    const bytes = Buffer.from(loaded.bytes);
    if (sha256Digest(bytes) !== loaded.ref.digest || canonicalJson(loaded.value) !== bytes.toString("utf8")) fail(`${kind} bytes or digest drifted`);
    if (projectMemory) validateProjectMemoryArtifact(loaded.value);
    else validateDesktopOrchestrationArtifact(loaded.value);
  }
  return multiple ? matches : matches[0];
}

function locator(loaded, jsonPointer = "", entity = loaded.value) {
  return { artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest }, jsonPointer, entityDigest: canonicalJsonDigest(entity) };
}
function artifactStableId(loaded) { return canonicalJsonDigest({ schema: loaded.ref.schema, artifactId: loaded.ref.artifactId, digest: loaded.ref.digest }); }
function artifactEndpoint(loaded) { return endpoint("artifact-reference", artifactStableId(loaded), "reference", "core/artifact-reference"); }
function artifactNode(loaded) { return { kind: "artifact-reference", attributes: { artifact: freeze(loaded.ref) } }; }
function matches(context, outcome) {
  return context?.projectId === "devrelay" && context?.invocation?.module?.id === MODULE.id && context.invocation.module.version === MODULE.version && context.invocation.module.operation === "project-run" && context?.moduleResult?.status === "completed" && context.moduleResult.outcome === outcome;
}

function candidateProjection(context) {
  const plan = exactLoaded(context, "DesktopOrchestrationPlan");
  const taskPlans = exactLoaded(context, "DesktopTaskPlan", { multiple: true });
  const leases = exactLoaded(context, "WorktreeLease", { multiple: true });
  const receipts = exactLoaded(context, "DesktopTaskReceipt", { multiple: true });
  const reviewRequirements = exactLoaded(context, "AdversarialReviewRequirement", { multiple: true });
  const recovery = exactLoaded(context, "DesktopOrchestrationRecovery");
  const conclusions = exactLoaded(context, "DesktopSessionConclusionCandidate", { multiple: true });
  const workItems = new Map(plan.value.workItems.map((item, index) => [item.id, { item, index }]));
  const nodes = [artifactNode(plan)];
  const edges = [];
  for (const { item, index } of workItems.values()) {
    if (!Array.isArray(item.acceptanceCriteria) || item.acceptanceCriteria.length === 0 || new Set(item.acceptanceCriteria).size !== item.acceptanceCriteria.length) fail(`work item ${item.id} requires unique acceptanceCriteria`);
    nodes.push({ kind: "work-item", stableId: item.id, label: item.id, attributes: { dependencies: freeze(item.dependencies), orchestrationPlan: freeze(plan.ref) }, sourceLocators: [locator(plan, `/workItems/${index}`, item)] });
    edges.push({ kind: "contains", source: artifactEndpoint(plan), target: endpoint("work-item", item.id, "candidate", CANDIDATE_SCOPE), rationale: "The exact Desktop orchestration plan contains this Core-derived work item.", sourceLocators: [locator(plan, `/workItems/${index}`, item)] });
    for (const [criterionIndex, criterionId] of item.acceptanceCriteria.entries()) edges.push({ kind: "planned-by", source: endpoint("acceptance-criterion", criterionId, "approved", REQUIREMENTS_SCOPE), target: endpoint("work-item", item.id, "candidate", CANDIDATE_SCOPE), rationale: "The approved acceptance criterion is planned by this exact Desktop work item.", sourceLocators: [locator(plan, `/workItems/${index}/acceptanceCriteria/${criterionIndex}`, criterionId)] });
  }
  const leaseByAttempt = new Map(leases.map((loaded) => [loaded.value.attemptId, loaded]));
  const taskPlanByAttempt = new Map();
  for (const taskPlan of taskPlans) {
    const value = taskPlan.value;
    if (!workItems.has(value.workItemId) || value.runId !== plan.value.runId) fail(`task plan ${value.attemptId} has invalid orchestration lineage`);
    const lease = leaseByAttempt.get(value.attemptId);
    if (!lease || canonicalJson(lease.value) !== canonicalJson(value.worktreeLease)) fail(`task plan ${value.attemptId} does not bind its exact loaded lease`);
    taskPlanByAttempt.set(value.attemptId, taskPlan);
    nodes.push(artifactNode(taskPlan), artifactNode(lease));
    edges.push({ kind: "derived-from", source: artifactEndpoint(taskPlan), target: artifactEndpoint(lease), rationale: "The Desktop task plan is bound to this exact durable worktree lease.", sourceLocators: [locator(taskPlan, "/worktreeLease", value.worktreeLease), locator(lease)] });
  }
  for (const receipt of receipts) {
    const taskPlan = taskPlanByAttempt.get(receipt.value.attemptId);
    if (!taskPlan || receipt.value.runId !== plan.value.runId || receipt.value.planDigest !== taskPlan.value.planDigest || receipt.value.idempotencyKey !== taskPlan.value.idempotencyKey) fail(`task receipt ${receipt.value.receiptDigest} has stale task-plan lineage`);
    nodes.push(artifactNode(receipt));
    edges.push({ kind: "derived-from", source: artifactEndpoint(receipt), target: artifactEndpoint(taskPlan), rationale: "The observation-only Desktop task receipt is derived from this exact bounded task plan.", sourceLocators: [locator(taskPlan), locator(receipt)] });
  }
  for (const requirement of reviewRequirements) {
    if (!workItems.has(requirement.value.workItemId)) fail("review requirement targets unknown work");
    nodes.push(artifactNode(requirement));
    edges.push({ kind: "derived-from", source: artifactEndpoint(requirement), target: artifactEndpoint(plan), rationale: "The policy-derived independent review requirement is bound to this exact orchestration plan.", sourceLocators: [locator(requirement), locator(plan)] });
  }
  nodes.push(artifactNode(recovery));
  edges.push({ kind: "derived-from", source: artifactEndpoint(recovery), target: artifactEndpoint(plan), rationale: "The exact recovery observation is derived from this orchestration run without authorizing progression.", sourceLocators: [locator(recovery), locator(plan)] });
  const receiptTaskIds = new Set(receipts.map(({ value }) => value.taskId));
  for (const conclusion of conclusions) {
    if (!receiptTaskIds.has(conclusion.value.taskId)) fail("session conclusion does not bind a recorded Desktop task");
    const taskReceipt = receipts.find(({ value }) => value.taskId === conclusion.value.taskId);
    const taskPlan = taskPlanByAttempt.get(taskReceipt.value.attemptId);
    nodes.push(artifactNode(conclusion));
    edges.push({ kind: "derived-from", source: artifactEndpoint(conclusion), target: artifactEndpoint(taskPlan), rationale: "The candidate-only durable session conclusion is derived from this managed Desktop task plan.", sourceLocators: [locator(conclusion), locator(taskPlan)] });
  }
  return { horizon: "verification", nodes: sort(nodes), edges: sort(edges) };
}

function approvedProjection(context) {
  const taskPlan = exactLoaded(context, "DesktopTaskPlan");
  const requirement = exactLoaded(context, "AdversarialReviewRequirement");
  const review = exactLoaded(context, "DesktopReviewReceipt");
  const readiness = exactLoaded(context, "DesktopMergeReadiness");
  const recovery = exactLoaded(context, "DesktopOrchestrationRecovery");
  const integration = exactLoaded(context, "DesktopChangeIntegrationRecord");
  if (review.value.workItemId !== taskPlan.value.workItemId || review.value.requirementDigest !== requirement.value.requirementDigest || review.value.disposition !== "pass") fail("review receipt is not passing for the exact task requirement");
  if (readiness.value.workItemId !== taskPlan.value.workItemId || readiness.value.requirementDigest !== requirement.value.requirementDigest || readiness.value.outcome !== "merge-ready") fail("merge readiness is not approved for the exact task requirement");
  if (integration.value.runId !== taskPlan.value.runId || integration.value.workItemId !== taskPlan.value.workItemId || !sameRef(integration.value.taskPlan, taskPlan.ref) || !sameRef(integration.value.mergeReadiness, readiness.ref) || integration.value.outcome !== "integrated") fail("integration record lineage is stale or incomplete");
  if (recovery.value.runId !== taskPlan.value.runId || recovery.value.outcome !== "recovered") fail("approved projection requires clean recovery");
  const nodes = [
    artifactNode(integration),
    ...[review, readiness, recovery].map((item) => ({ kind: "verification-evidence", stableId: item.ref.artifactId, label: item.ref.artifactId, verificationStatus: "pass", attributes: { artifact: freeze(item.ref), desktopKind: item.value.kind, workItemId: taskPlan.value.workItemId }, sourceLocators: [locator(item)] })),
    { kind: "change-set", stableId: `DESKTOP-CHANGE-${taskPlan.value.workItemId}-${taskPlan.value.planDigest.slice(7, 23)}`, label: taskPlan.value.workItemId, attributes: { taskPlan: freeze(taskPlan.ref), review: freeze(review.ref), mergeReadiness: freeze(readiness.ref) }, sourceLocators: [locator(taskPlan), locator(review), locator(readiness)] },
    { kind: "integrated-change-record", stableId: integration.value.integrationId, label: integration.value.integrationId, attributes: { artifact: freeze(integration.ref), implementationCommit: integration.value.implementationCommit }, sourceLocators: [locator(integration)] },
  ];
  const changeSetId = `DESKTOP-CHANGE-${taskPlan.value.workItemId}-${taskPlan.value.planDigest.slice(7, 23)}`;
  const edges = [
    ...[review, readiness].map((item) => ({ kind: "verified-by", source: endpoint("work-item", taskPlan.value.workItemId, "candidate", CANDIDATE_SCOPE), target: endpoint("verification-evidence", item.ref.artifactId, "approved", APPROVED_SCOPE), rationale: "Independent passing Desktop evidence verifies the exact orchestrated work item.", sourceLocators: [locator(item)] })),
    { kind: "verified-by", source: artifactEndpoint(taskPlan), target: endpoint("verification-evidence", recovery.ref.artifactId, "approved", APPROVED_SCOPE), rationale: "Clean restart reconciliation verifies the exact Desktop task plan without duplicate effects.", sourceLocators: [locator(recovery)] },
    { kind: "produces", source: endpoint("work-item", taskPlan.value.workItemId, "candidate", CANDIDATE_SCOPE), target: endpoint("change-set", changeSetId, "approved", APPROVED_SCOPE), rationale: "The independently verified Desktop work item produced this exact approved change set.", sourceLocators: [locator(taskPlan), locator(review), locator(readiness)] },
    { kind: "integrated-as", source: endpoint("change-set", changeSetId, "approved", APPROVED_SCOPE), target: endpoint("integrated-change-record", integration.value.integrationId, "approved", APPROVED_SCOPE), rationale: "The verified Desktop change set was safely incorporated by this exact integration record.", sourceLocators: [locator(integration)] },
  ];
  const concludeReceipts = allLoaded(context).filter(({ value }) => value?.kind === "ConcludeReceipt");
  for (const conclude of concludeReceipts) {
    exactLoaded({ loadedInputs: { conclude: [conclude] } }, "ConcludeReceipt", { projectMemory: true });
    if (conclude.value.outcome !== "concluded") fail("only a concluded ProjectMemory receipt may be projected");
    nodes.push(artifactNode(conclude));
    edges.push({ kind: "derived-from", source: artifactEndpoint(conclude), target: artifactEndpoint(integration), rationale: "The governed ProjectMemory conclusion is derived from this exact accepted integration record.", sourceLocators: [locator(integration), locator(conclude)] });
  }
  return { horizon: "verification", nodes: sort(nodes), edges: sort(edges) };
}

function contributor({ id, authority, scope, outcome, nodeKinds, edgeKinds, project }) {
  return Object.freeze({ metadata: freeze({ id, version: "1.0.0" }), authority, scope, ownership: freeze({ authority, scope, nodeKinds, edgeKinds, retention: "append-only" }), match: (context) => matches(context, outcome), async project(context) { if (!matches(context, outcome)) fail("project called for a nonmatching execution"); return project(context); } });
}

export const desktopOrchestrationCandidateTraceabilityContributor = contributor({ id: "devrelay.desktop-orchestration-candidate", authority: "candidate", scope: CANDIDATE_SCOPE, outcome: "planned", nodeKinds: ["work-item"], edgeKinds: ["contains", "derived-from", "planned-by"], project: candidateProjection });
export const desktopOrchestrationApprovedTraceabilityContributor = contributor({ id: "devrelay.desktop-orchestration-approved", authority: "approved", scope: APPROVED_SCOPE, outcome: "integrated", nodeKinds: ["change-set", "integrated-change-record", "verification-evidence"], edgeKinds: ["derived-from", "integrated-as", "produces", "verified-by"], project: approvedProjection });
export const desktopOrchestrationTraceabilityContributors = Object.freeze([desktopOrchestrationCandidateTraceabilityContributor, desktopOrchestrationApprovedTraceabilityContributor]);
