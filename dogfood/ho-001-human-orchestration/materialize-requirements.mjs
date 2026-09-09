import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import {
  deriveProjectOverview,
  diffProjectOverviewSections,
  PROJECT_OVERVIEW_DOCUMENT,
  PROJECT_OVERVIEW_PROJECTION,
  PROJECT_OVERVIEW_RENDERER,
  renderProjectOverviewMarkdownBytes,
} from "../../src/project-overview.mjs";
import {
  validateProjectOverviewBaselinePromotion,
  validateProjectOverviewChangeSetAgainstBaseline,
  validateProjectOverviewRenderedDocument,
} from "../../src/project-overview-artifact-validator.mjs";
import {
  validateRequirementsArtifact,
  validateRequirementsBaselinePromotion,
} from "../../src/requirements-artifact-validator.mjs";

const root = new URL("../../", import.meta.url);
const project = new URL("../../project/", import.meta.url);
const output = new URL("./", import.meta.url);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = (artifactId, bytes) => ({ artifactId, digest: sha256Digest(bytes) });
const withContentDigest = (value) => ({ ...value, contentDigest: canonicalJsonDigest(value) });
const sortSourceRefs = (values) => [...new Map(values.map((value) => [
  [value.role, value.artifact.artifactId, value.artifact.digest, value.location ?? ""].join("\u0000"),
  value,
])).entries()].sort(([left], [right]) => compare(left, right)).map(([, value]) => value);
const addUniqueById = (values, additions) => {
  const ids = new Set(values.map(({ id }) => id));
  for (const value of additions) {
    if (ids.has(value.id)) throw new Error(`Duplicate requirements identity ${value.id}.`);
    values.push(value);
    ids.add(value.id);
  }
  values.sort((left, right) => compare(left.id, right.id));
};
const addUniqueStrings = (values, additions) => [...new Set([...values, ...additions])].sort(compare);

const previousRequirementsBytes = await readFile(new URL("requirements-baseline.json", project));
const previousOverviewBytes = await readFile(new URL("project-overview-baseline.json", project));
const previousMarkdownBytes = await readFile(new URL("ProjectOverview.md", root));
const previousRequirements = JSON.parse(previousRequirementsBytes);
const previousOverview = JSON.parse(previousOverviewBytes);
if (previousRequirements.version === "2.8.0") {
  process.stdout.write(`${JSON.stringify({ outcome: "replayed", requirementsBaselineId: previousRequirements.baselineId })}\n`);
  process.exit(0);
}
if (previousRequirements.version !== "2.7.0" || previousOverview.version !== "2.7.0") {
  throw new Error("HO-001 requires the exact 2.7.0 baseline pair.");
}
const previousRequirementsRef = pointer(previousRequirements.baselineId, previousRequirementsBytes);
const previousOverviewRef = pointer(previousOverview.baselineId, previousOverviewBytes);
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const trackedFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", windowsHide: true }).trim().split(/\r?\n/u).filter(Boolean).sort(compare);

const goal = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-devrelay-ho-001-human-orchestration-v1",
  statement: "Make multi-agent DevRelay work understandable and safely controllable from a ChatGPT Desktop conversation without changing the deterministic lifecycle or its authorities.",
  objectives: [
    "Show the complete agent and sub-agent topology, dependency-safe queue, active work, blockers, approvals, quality evidence, worktrees, and ProjectMemory continuity in one view.",
    "Translate explicit owner intent into typed, digest-bound, state-version-bound requests with auditable outcomes.",
    "Fail closed on stale views, missing host routes, ambiguous authority, duplicate requests, and topology drift.",
  ],
  constraints: [
    "HumanOrchestration is an independently versioned cross-cutting Module, not a construction stage or second control plane.",
    "Core remains the sole readiness source and existing Modules and Gates retain planning, approval, verification, integration, graph, and memory authority.",
    "The supported host surface remains ChatGPT/Codex Desktop on Windows with a deterministic library seam.",
  ],
  acceptanceCriteria: [
    "A single deterministic view projects the exact queue and nested task topology from durable state and bounded observations.",
    "Every control pins the displayed view digest and expected durable state version before dispatch.",
    "Exact retries do not repeat effects and unavailable or stale routes return explicit rejection receipts.",
  ],
  assumptions: ["The owner's repeated 'Proceed' directions approve the previously proposed read-only-first operator surface and bounded control model."],
};
const decisions = withContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "OwnerDecisionSet",
  decisionSetId: "owner-decisions-ho-001-human-orchestration-v1",
  decisions: [
    { questionId: "HO-Q-001", domainId: "module-boundary", decision: "Create HumanOrchestration as an independently versioned cross-cutting semantic Module.", answer: "Approved when the owner confirmed cross-cutting Modules must support the modular deterministic workflow and said Proceed." },
    { questionId: "HO-Q-002", domainId: "operator-surface", decision: "Use a conversation-native Desktop view first, backed by deterministic library artifacts rather than a hosted dashboard.", answer: "Approved." },
    { questionId: "HO-Q-003", domainId: "visibility", decision: "Show agent/sub-agent topology, the complete dependency queue, current work, blockers, approvals, quality, worktrees, and memory.", answer: "Approved." },
    { questionId: "HO-Q-004", domainId: "control", decision: "Represent message, pause, resume, cancel, retry, handoff, approve, reject, and reprioritize as typed requests routed to their existing authorities.", answer: "Approved." },
    { questionId: "HO-Q-005", domainId: "concurrency", decision: "Bind controls to exact view and state versions and reuse exact completed requests.", answer: "Approved." },
    { questionId: "HO-Q-006", domainId: "authority", decision: "HumanOrchestration remains read-only/request-only and never claims readiness, Gate, verification, integration, graph, or memory authority.", answer: "Approved." },
  ],
});
const domains = ["module-boundary", "operator-surface", "visibility", "control", "concurrency", "authority"];
const closureMaterial = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsClosureAssessment",
  minimumWeightedCoverage: 0.99,
  weightedCoverage: 1,
  blockingUnknowns: [],
  unresolvedContradictions: [],
  uncoveredDomains: [],
  domainAssessments: domains.map((domainId) => ({ domainId, weight: 1 / domains.length, blocking: true, status: "resolved", confidence: 1, creditedWeight: 1 / domains.length, evidenceRefs: [decisions.decisionSetId] })),
  outcome: "closed",
};
const closure = { ...closureMaterial, assessmentDigest: canonicalJsonDigest(closureMaterial) };
const projectContext = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary: "DevRelay v0.11.0-rc.2 is published with deterministic Desktop orchestration, worktrees, quality continuity, and persistent ProjectMemory. HO-001 adds the human-facing projection and bounded intervention seam across those existing authorities.",
  stakeholders: ["DevRelay owner and maintainer", "ChatGPT Desktop engineering operators", "Module, adapter, host, verification, and integration authors"],
  domainConstraints: ["Existing authorities retain all decisions.", "Operator views are derived and immutable.", "Effects require typed exact-state requests."],
  conventions: ["Use exact content digests.", "Fail closed on drift.", "Keep host bindings replaceable."],
  sourceRefs: [],
};
const repositorySnapshot = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RepositorySnapshot",
  repository: "C:/Users/SC/Documents/ChatGPT/DevRelay",
  revision,
  treeDigest: sha256Digest(Buffer.from(`${trackedFiles.join("\n")}\n`, "utf8")),
  includedPaths: ["contracts/**", "docs/**", "dogfood/**", "plugins/**", "project/**", "src/**", "test/**", "package.json"],
  excludedPaths: [".git/**", "node_modules/**"],
};
const goalBytes = jsonBytes(goal);
const decisionsBytes = jsonBytes(decisions);
const closureBytes = jsonBytes(closure);
const projectContextBytes = jsonBytes(projectContext);
const repositorySnapshotBytes = jsonBytes(repositorySnapshot);
const sourceRefs = [
  { role: "goal", artifact: pointer(goal.goalId, goalBytes) },
  { role: "project-context", artifact: pointer("project-context-devrelay-ho-001-v1", projectContextBytes) },
  { role: "repository-snapshot", artifact: pointer("repository-snapshot-devrelay-ho-001-v1", repositorySnapshotBytes) },
  { role: "owner-decision", artifact: pointer(decisions.decisionSetId, decisionsBytes), location: "Owner-approved human-orchestration decision sequence in ChatGPT Desktop" },
  { role: "requirements-closure", artifact: pointer("requirements-closure-ho-001-v1", closureBytes) },
  { role: "requirements-baseline", artifact: previousRequirementsRef },
  { role: "project-overview-baseline", artifact: previousOverviewRef },
];
const sourced = (value) => ({ ...value, sourceRefs: sortSourceRefs([...(value.sourceRefs ?? []), ...structuredClone(sourceRefs)]) });
const replacement = structuredClone(previousRequirements.requirements);

addUniqueById(replacement.businessObjectives, [sourced({
  id: "BO-DEV-HUMAN-ORCHESTRATION-001",
  statement: "Let one human confidently understand and guide many concurrent agents without losing deterministic workflow state, evidence quality, or authority boundaries.",
  stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"],
  priority: "must",
})]);
addUniqueById(replacement.successMetrics, [
  sourced({ id: "SM-HO-VISIBILITY-001", name: "Complete operator visibility", businessObjectiveIds: ["BO-DEV-HUMAN-ORCHESTRATION-001"], measure: "Configured tasks, queue items, blockers, approvals, quality records, worktrees, or memory sessions omitted from an exact operator view.", target: "Zero omissions.", measurementMethod: "Run nested-task, multi-frontier, worktree, approval, quality, restart, and memory fixtures." }),
  sourced({ id: "SM-HO-CONTROL-001", name: "Safe human intervention", businessObjectiveIds: ["BO-DEV-HUMAN-ORCHESTRATION-001"], measure: "Stale, duplicated, unavailable-route, or authority-bypassing intervention effects.", target: "Zero unauthorized or duplicate effects.", measurementMethod: "Run optimistic-concurrency, replay, routing, malformed-target, and missing-handler fixtures." }),
]);
addUniqueById(replacement.capabilities, [sourced({
  id: "CAP-DEV-HUMAN-ORCHESTRATION-001",
  name: "Conversation-native human orchestration",
  description: "Project the exact multi-agent run into one deterministic Desktop operator view and route typed human requests to existing authorities with optimistic concurrency and replay protection.",
  businessObjectiveIds: ["BO-DEV-HUMAN-ORCHESTRATION-001", "BO-DEV-QUALITY-CONTINUITY-001"],
  userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
  audience: "user-facing",
  key: true,
  priority: "must",
})]);
addUniqueById(replacement.userJourneys, [sourced({
  id: "UJ-HO-OPERATE-MULTI-AGENT-001",
  name: "Understand and guide a multi-agent DevRelay run",
  userId: "USR-DEV-WORKFLOW-AUTHOR-001",
  capabilityIds: ["CAP-DEV-HUMAN-ORCHESTRATION-001"],
  trigger: "One or more Desktop tasks are planned, active, blocked, or awaiting approval.",
  outcome: "The owner sees exact current state and any requested intervention is safely routed, rejected, or replayed with an auditable receipt.",
  steps: [
    { sequence: 1, action: "Load the exact ProjectMemory and durable orchestration state.", expectedOutcome: "The view is bound to current project and run identities." },
    { sequence: 2, action: "Project the full queue and task hierarchy with evidence and attention items.", expectedOutcome: "The owner can see who is doing what, what is next, and why anything is blocked." },
    { sequence: 3, action: "Express an intervention in conversation.", expectedOutcome: "DevRelay creates a typed request rather than performing an inferred effect." },
    { sequence: 4, action: "Revalidate state and dispatch to the declared authority.", expectedOutcome: "Stale or unavailable controls fail closed and exact retries do not repeat effects." },
  ],
})]);
addUniqueById(replacement.userStories, [
  sourced({ id: "US-HO-VIEW-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-HUMAN-ORCHESTRATION-001", userJourneyIds: ["UJ-HO-OPERATE-MULTI-AGENT-001"], need: "See every agent and sub-agent, their work, the queue, dependencies, blockers, approvals, quality, worktrees, and memory in one compact view.", benefit: "I can supervise parallel work without reconstructing state from multiple conversations.", priority: "must", acceptanceCriterionIds: ["AC-HO-VIEW-001", "AC-HO-TOPOLOGY-001", "AC-HO-QUEUE-001", "AC-HO-DESKTOP-001"] }),
  sourced({ id: "US-HO-CONTROL-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-HUMAN-ORCHESTRATION-001", userJourneyIds: ["UJ-HO-OPERATE-MULTI-AGENT-001"], need: "Message, pause, resume, cancel, retry, hand off, approve, reject, or reprioritize through explicit safe controls.", benefit: "I can guide work quickly without bypassing the deterministic lifecycle.", priority: "must", acceptanceCriterionIds: ["AC-HO-CONTROL-001", "AC-HO-STALE-001", "AC-HO-AUTHORITY-001"] }),
]);
addUniqueById(replacement.acceptanceCriteria, [
  sourced({ id: "AC-HO-VIEW-001", statement: "HumanOrchestration projects one digest-bound read-only view from the exact durable run plus bounded task, worktree, memory, approval, quality, and intervention observations.", verification: "Reorder exact sources, repeat projection, mutate each source after binding, and validate deterministic equality or fail-closed drift." }),
  sourced({ id: "AC-HO-TOPOLOGY-001", statement: "The operator view shows every configured Desktop task as an agent or sub-agent with exact parent, work item, role, title, status, depth, and attention state.", verification: "Exercise roots, multiple nesting levels, duplicate IDs, missing parents, cycles, and attention states." }),
  sourced({ id: "AC-HO-QUEUE-001", statement: "The operator view shows the complete work queue and derives readiness only from Core's exact Desktop frontier while distinguishing active, complete, terminal, dependency-waiting, and capacity-waiting work.", verification: "Exercise dependencies, concurrency limits, terminal states, reordered work, and forged readiness attempts." }),
  sourced({ id: "AC-HO-CONTROL-001", statement: "Every supported human action becomes a typed request with exact target, reason, payload, view digest, expected state version, deterministic authority route, and observation-only receipt.", verification: "Exercise all actions and target matrices, handler substitutions, malformed payloads, and receipt digest validation." }),
  sourced({ id: "AC-HO-STALE-001", statement: "State-version drift, unavailable handlers, failed handlers, and exact retries yield deterministic rejection, failure, or replay without duplicate effects.", verification: "Advance state before dispatch, remove each handler, inject failures, and issue concurrent identical requests." }),
  sourced({ id: "AC-HO-AUTHORITY-001", statement: "HumanOrchestration cannot alter readiness, dependency order, Gate decisions, verification, integration, graph activation, ProjectMemory promotion, or task state except through an explicitly bound authority handler.", verification: "Attempt every forbidden direct mutation through source, view, request, handler output, and replay." }),
  sourced({ id: "AC-HO-DESKTOP-001", statement: "The bundled ChatGPT Desktop skill renders the exact human-orchestration view and converts explicit owner controls into typed requests before calling host task operations.", verification: "Run a clean installed-plugin Desktop scenario with a parent task, sub-task, worktree, pending approval, memory session, message request, stale rejection, and replay proof." }),
]);
addUniqueById(replacement.nonFunctionalRequirements, [
  sourced({ id: "NFR-HO-DETERMINISM-001", category: "reliability", statement: "Human-orchestration bundles, views, requests, routes, receipts, and rendered status are deterministic for exact inputs.", applicability: { level: "project" }, measure: "Canonical digest and byte equality across repeated and reordered-input executions.", target: "100 percent equality.", priority: "must", acceptanceCriterionIds: ["AC-HO-VIEW-001", "AC-HO-CONTROL-001", "AC-HO-STALE-001"] }),
  sourced({ id: "NFR-HO-SCALE-001", category: "performance", statement: "Operator projection remains bounded as task hierarchy and work queues grow.", applicability: { level: "project" }, measure: "p95 projection time for 1,000 work items and 1,000 task observations on the Windows reference host.", target: "At most 500 ms excluding external providers.", priority: "must", acceptanceCriterionIds: ["AC-HO-TOPOLOGY-001", "AC-HO-QUEUE-001"] }),
  sourced({ id: "NFR-HO-SECURITY-001", category: "security", statement: "Human controls use least privilege and never expand the grants or authority of their target handler.", applicability: { level: "project" }, measure: "Target, route, grant, malformed-payload, and authority-bypass fixtures.", target: "Zero unauthorized effects.", priority: "must", acceptanceCriterionIds: ["AC-HO-CONTROL-001", "AC-HO-AUTHORITY-001"] }),
]);
addUniqueById(replacement.constraints, [
  sourced({ id: "CON-HO-NO-STAGE-001", category: "business", statement: "HumanOrchestration is cross-cutting and does not change the approved construction lifecycle order.", rationale: "Human usability must not create an alternate workflow.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-HO-AUTHORITY-001"] }),
  sourced({ id: "CON-HO-REQUEST-ONLY-001", category: "technical", statement: "An operator control is request-only until its exact existing authority accepts and records it.", rationale: "The view and conversation cannot manufacture approval or completion authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-HO-CONTROL-001", "AC-HO-AUTHORITY-001"] }),
]);
addUniqueById(replacement.scope, [
  sourced({ id: "SCOPE-HO-MODULE-001", statement: "HumanOrchestration Module, source bundle, operator view, renderer, intervention requests and receipts, controller, schema, exports, tests, and Desktop skill integration." }),
  sourced({ id: "SCOPE-HO-E2E-001", statement: "Clean installed-package and deliberately installed ChatGPT Desktop end-to-end evidence for nested tasks, worktrees, ProjectMemory, quality, approvals, control routing, stale rejection, and replay." }),
]);
addUniqueById(replacement.nonGoals, [
  sourced({ id: "NG-HO-HOSTED-DASHBOARD-001", statement: "Build a hosted web control plane or require a separate dashboard for the controlled release.", rationale: "The primary supported surface is conversation-native ChatGPT Desktop on Windows." }),
  sourced({ id: "NG-HO-AUTONOMOUS-AUTHORITY-001", statement: "Let agents, the operator projection, or a free-text command override Core, Gates, dependency analysis, verification, integration, graph, or memory authority.", rationale: "Human orchestration coordinates existing authorities; it does not replace them." }),
]);
addUniqueById(replacement.assumptions, [
  sourced({ id: "ASM-HO-DESKTOP-001", statement: "ChatGPT/Codex Desktop task operations remain the supported live host boundary and deterministic fixtures cover unavailable operations.", status: "confirmed", blocking: false }),
]);
replacement.dependencies = addUniqueStrings(replacement.dependencies, [
  "Approved Desktop orchestration, ProjectControl, ProjectMemory, WorkDependencyAnalysis, quality, worktree, Gate, and task-adapter artifacts.",
]);
replacement.risks = addUniqueStrings(replacement.risks, [
  "A convenient operator view can become a split-brain source unless it remains immutable, horizon-bound, and explicitly non-authoritative.",
  "Free-text controls can cause ambiguous effects unless translated into typed state-version-bound requests and exact target routes.",
]);
replacement.deliverables = addUniqueStrings(replacement.deliverables, [
  "HumanOrchestration cross-cutting Module, deterministic operator view, typed intervention controller, schema, package exports, tests, documentation, and Desktop skill integration.",
]);
replacement.requiredEvidence = addUniqueStrings(replacement.requiredEvidence, [
  "human-orchestration/view-topology-queue-determinism",
  "human-orchestration/intervention-routing-stale-replay-authority",
  "human-orchestration/chatgpt-desktop-e2e",
]);
replacement.currentStatus = sourced({ ...replacement.currentStatus, phase: "planning", summary: "HO-001 requirements are closed and approved for a conversation-native HumanOrchestration cross-cutting Module with deterministic multi-agent visibility and typed request-only controls." });
replacement.sourceRefs = sortSourceRefs(structuredClone(sourceRefs));
const canonicalStringArrayKeys = new Set(["acceptanceCriterionIds", "businessObjectiveIds", "capabilityIds", "stakeholderIds", "userIds", "userJourneyIds"]);
const canonicalizeNestedStringArrays = (value) => {
  if (Array.isArray(value)) {
    for (const item of value) canonicalizeNestedStringArrays(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (canonicalStringArrayKeys.has(key) && Array.isArray(child)) value[key] = [...new Set(child)].sort(compare);
    else canonicalizeNestedStringArrays(child);
  }
};
canonicalizeNestedStringArrays(replacement);

const changedSections = Object.keys(replacement).filter((key) => canonicalJsonDigest(replacement[key]) !== canonicalJsonDigest(previousRequirements.requirements[key])).sort(compare);
const changeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsChangeSet",
  changeSetId: "requirements-change-set-ho-001-human-orchestration-v1",
  baseInputs: sourceRefs.filter(({ role }) => ["goal", "project-context", "repository-snapshot", "requirements-baseline", "project-overview-baseline"].includes(role)),
  baseline: previousRequirementsRef,
  expectedRequirementsDigest: canonicalJsonDigest(previousRequirements.requirements),
  replacement,
  changedSections,
  reason: "Add conversation-native human visibility and bounded intervention routing over the existing deterministic multi-agent Desktop workflow.",
  compatibilityImpact: "backward-compatible",
  risks: replacement.risks.filter((value) => /operator view|free-text controls/i.test(value)),
  requiredEvidence: replacement.requiredEvidence.filter((value) => /human-orchestration/i.test(value)),
  sourceRefs,
};
validateRequirementsArtifact(changeSet);
const changeSetBytes = jsonBytes(changeSet);
const changeSetRef = pointer(changeSet.changeSetId, changeSetBytes);
const overview = deriveProjectOverview(replacement);
const markdownBytes = renderProjectOverviewMarkdownBytes(overview);
const markdownRef = pointer("project-overview-markdown-ho-001-human-orchestration-v1", markdownBytes);
const overviewChange = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewChangeSetDraft",
  changeSetId: "project-overview-change-set-ho-001-human-orchestration-v1",
  baseOverview: previousOverviewRef,
  requirementsChangeSet: changeSetRef,
  changeDisposition: "changed",
  changedSections: diffProjectOverviewSections(previousOverview.overview, overview),
  projection: PROJECT_OVERVIEW_PROJECTION,
  overview,
  renderedDocument: { ...PROJECT_OVERVIEW_DOCUMENT, artifact: markdownRef, renderer: PROJECT_OVERVIEW_RENDERER },
};
validateProjectOverviewChangeSetAgainstBaseline({ projectOverviewChangeSet: overviewChange, requirementsChangeSet: changeSet, requirementsChangeSetRef: changeSetRef, baseOverview: previousOverview, baseOverviewRef: previousOverviewRef });
validateProjectOverviewRenderedDocument({ projectOverviewArtifact: overviewChange, renderedDocumentBytes: markdownBytes });
const overviewChangeBytes = jsonBytes(overviewChange);
const overviewChangeRef = pointer(overviewChange.changeSetId, overviewChangeBytes);
const approval = withContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGateApproval",
  approvalId: "requirements-gate-approval-ho-001-human-orchestration-v1",
  authority: "project-owner",
  decision: "approve",
  source: { channel: "chat", statement: "Proceed", context: "After approving HumanOrchestration as a cross-cutting Module supporting the deterministic workflow and requesting easier agent, sub-agent, queue, and control visibility." },
  approvedCandidate: { requirementsChangeSet: changeSetRef.digest, projectOverviewChangeSet: overviewChangeRef.digest, closure: sha256Digest(closureBytes) },
  authorizedActions: ["atomic-requirements-project-overview-promotion", "progress-to-architecture"],
  modificationPolicy: "Any material candidate change requires revalidation.",
});
const approvalBytes = jsonBytes(approval);
const approvalRef = pointer(approval.approvalId, approvalBytes);
const requirementsBaseline = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsBaseline",
  baselineId: "requirements-baseline-devrelay-v1-ho-001-human-orchestration-001",
  version: "2.8.0",
  approvedCandidate: changeSetRef,
  supersedes: previousRequirementsRef,
  requirements: replacement,
  approvalEvidence: [approvalRef],
};
const requirementsBaselineBytes = jsonBytes(requirementsBaseline);
const requirementsBaselineRef = pointer(requirementsBaseline.baselineId, requirementsBaselineBytes);
validateRequirementsBaselinePromotion({ candidate: changeSet, candidateRef: changeSetRef, baseline: requirementsBaseline, previousBaseline: previousRequirements, previousBaselineRef: previousRequirementsRef });
const projectOverviewBaseline = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewBaseline",
  baselineId: "project-overview-baseline-devrelay-v1-ho-001-human-orchestration-001",
  version: "2.8.0",
  approvedOverviewCandidate: overviewChangeRef,
  supersedes: previousOverviewRef,
  requirementsBaseline: requirementsBaselineRef,
  projection: overviewChange.projection,
  overview,
  renderedDocument: overviewChange.renderedDocument,
  approvalEvidence: [approvalRef],
};
const projectOverviewBaselineBytes = jsonBytes(projectOverviewBaseline);
const projectOverviewBaselineRef = pointer(projectOverviewBaseline.baselineId, projectOverviewBaselineBytes);
validateProjectOverviewBaselinePromotion({ projectOverviewBaseline, approvedCandidate: overviewChange, approvedCandidateRef: overviewChangeRef, requirementsBaseline, requirementsBaselineRef, previousBaseline: previousOverview, previousBaselineRef: previousOverviewRef });
const proof = withContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGatePromotionProof",
  proofId: "requirements-gate-promotion-ho-001-human-orchestration-v1",
  status: "pass",
  closureDigest: sha256Digest(closureBytes),
  changeSet: changeSetRef,
  overviewChangeSet: overviewChangeRef,
  approval: approvalRef,
  promoted: { requirementsBaseline: requirementsBaselineRef, projectOverviewBaseline: projectOverviewBaselineRef, markdown: markdownRef },
  architectureProgressionAllowed: true,
});
const proofBytes = jsonBytes(proof);
const promotionJournal = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsPairPromotionJournal",
  promotionId: "requirements-promotion-ho-001-human-orchestration-v1",
  state: "committed",
  previous: { requirementsBaseline: previousRequirementsRef, projectOverviewBaseline: previousOverviewRef },
  next: { requirementsBaseline: requirementsBaselineRef, projectOverviewBaseline: projectOverviewBaselineRef, projectOverviewMarkdown: markdownRef },
  approval: approvalRef,
  proof: pointer(proof.proofId, proofBytes),
};

await mkdir(output, { recursive: true });
await mkdir(new URL("history/2.7.0/", project), { recursive: true });
await Promise.all([
  writeFile(new URL("goal.json", output), goalBytes),
  writeFile(new URL("owner-decisions.json", output), decisionsBytes),
  writeFile(new URL("requirements-closure-assessment-approved.json", output), closureBytes),
  writeFile(new URL("project-context.json", output), projectContextBytes),
  writeFile(new URL("repository-snapshot.json", output), repositorySnapshotBytes),
  writeFile(new URL("requirements-change-set.json", output), changeSetBytes),
  writeFile(new URL("project-overview-change-set-draft.json", output), overviewChangeBytes),
  writeFile(new URL("requirements-gate-owner-approval.json", output), approvalBytes),
  writeFile(new URL("requirements-gate-promotion-proof.json", output), proofBytes),
  writeFile(new URL("history/2.7.0/requirements-baseline.json", project), previousRequirementsBytes),
  writeFile(new URL("history/2.7.0/project-overview-baseline.json", project), previousOverviewBytes),
  writeFile(new URL("history/2.7.0/ProjectOverview.md", project), previousMarkdownBytes),
  writeFile(new URL("requirements-baseline.json", project), requirementsBaselineBytes),
  writeFile(new URL("project-overview-baseline.json", project), projectOverviewBaselineBytes),
  writeFile(new URL("ProjectOverview.md", root), markdownBytes),
  writeFile(new URL("requirements-promotion.commit.json", project), jsonBytes(promotionJournal)),
]);
process.stdout.write(`${JSON.stringify({ outcome: "promoted", requirementsBaseline: requirementsBaselineRef, projectOverviewBaseline: projectOverviewBaselineRef, changedSections }, null, 2)}\n`);
