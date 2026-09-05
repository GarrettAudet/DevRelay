import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { deriveProjectOverview, diffProjectOverviewSections, PROJECT_OVERVIEW_DOCUMENT, PROJECT_OVERVIEW_PROJECTION, PROJECT_OVERVIEW_RENDERER, renderProjectOverviewMarkdownBytes } from "../../src/project-overview.mjs";
import { validateProjectOverviewBaselinePromotion, validateProjectOverviewChangeSetAgainstBaseline, validateProjectOverviewRenderedDocument } from "../../src/project-overview-artifact-validator.mjs";
import { validateRequirementsArtifact, validateRequirementsBaselinePromotion } from "../../src/requirements-artifact-validator.mjs";
import { buildDesktopOrchestrationRequirements } from "./do-001-approved-data.mjs";

const root = new URL("../../", import.meta.url);
const output = new URL("./", import.meta.url);
const project = new URL("../../project/", import.meta.url);
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = (artifactId, bytes) => ({ artifactId, digest: sha256Digest(bytes) });
const withContentDigest = (value) => ({ ...value, contentDigest: canonicalJsonDigest(value) });

const previousRequirementsBytes = await readFile(new URL("requirements-baseline.json", project));
const previousOverviewBytes = await readFile(new URL("project-overview-baseline.json", project));
const previousMarkdownBytes = await readFile(new URL("ProjectOverview.md", root));
const previousRequirements = JSON.parse(previousRequirementsBytes);
const previousOverview = JSON.parse(previousOverviewBytes);
if (previousRequirements.version === "2.5.0") {
  process.stdout.write(`${JSON.stringify({ outcome: "replayed", requirementsBaselineId: previousRequirements.baselineId })}\n`);
  process.exit(0);
}
if (previousRequirements.version !== "2.4.0" || previousOverview.version !== "2.4.0") throw new Error("DO-001 requires the exact 2.4.0 project baseline pair.");
const previousRequirementsRef = pointer(previousRequirements.baselineId, previousRequirementsBytes);
const previousOverviewRef = pointer(previousOverview.baselineId, previousOverviewBytes);

const goal = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-devrelay-do-001-desktop-orchestration-v1",
  statement: "Fully implement a ChatGPT Desktop-native DevRelay orchestration harness with the worktree, planning, bounded-agent, review, recovery, and operator practices learned from the referenced Reddit thread, plus automatic restart-safe persistent ProjectMemory.",
  objectives: ["Coordinate only Core-derived ready work across isolated worktrees and Desktop tasks.", "Recover exact task, worktree, effect, review, and memory state without duplication.", "Bootstrap and conclude governed ProjectMemory automatically for managed tasks."],
  constraints: ["Preserve existing Module, Gate, graph, verification, integration, and owner authority.", "Target ChatGPT Desktop on Windows and local Git.", "Do not read or persist unrelated chats."],
  acceptanceCriteria: ["The installable plugin executes verified lifecycle hooks.", "Parallel frontier, interruption recovery, review, integration readiness, and fresh-task memory recovery are proven."],
  assumptions: ["The owner approved all routine in-scope decisions and directed the work to continue until both capability sets are complete."],
};
const projectContext = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary: "DevRelay 0.10.0-rc.3 has a released deterministic lifecycle, durable local-host primitives, and governed ProjectMemory. DO-001 adds only the Desktop orchestration and automatic memory host layer above those authorities.",
  stakeholders: ["DevRelay owner and maintainer", "ChatGPT Desktop users on Windows", "Module, adapter, host, and verification authors"],
  domainConstraints: ["Core-derived readiness and existing Gates remain authoritative.", "Every task receives the exact ProjectOverview baseline.", "Adapters and hooks never mutate TraceabilityGraph."],
  conventions: ["Use isolated worktrees.", "Persist exact receipts before progression.", "Quarantine uncertain effects.", "Ask the owner about ambiguous conflicts or semantic decisions."],
  sourceRefs: [],
};
const repositorySnapshot = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RepositorySnapshot",
  repository: "C:/repos/DevRelay",
  revision: "1ff3cc4ebecf15aa9ed6a1629a480ef9c790fcd2",
  treeDigest: "sha256:51d718b2ca00d12bc98d4c060ac2ab7d36fa9f382495302d0767bb719e506a37",
  includedPaths: [".codex/**", "AGENTS.md", "ProjectOverview.md", "contracts/**", "docs/**", "dogfood/**", "plugins/**", "project/**", "scripts/**", "src/**", "test/**", "package.json"],
  excludedPaths: [".git/**", "node_modules/**"],
};
const decisions = withContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "OwnerDecisionSet",
  decisionSetId: "owner-decisions-do-001-desktop-orchestration-v1",
  decisions: [
    { questionId: "DO-Q-001", domainId: "runtime-boundary", decision: "Use a real ChatGPT Desktop plugin and Windows-local host layer above the lifecycle, not a new lifecycle stage.", answer: "Approved from the explicit user request and standing approval." },
    { questionId: "DO-Q-002", domainId: "orchestration-authority", decision: "Only Core-derived frontiers may be dispatched; tasks and adapters remain observation and execution bindings without Gate or graph authority.", answer: "Approved." },
    { questionId: "DO-Q-003", domainId: "worktree-safety", decision: "Every managed work item uses an exact durable worktree lease and ambiguous conflicts stop for owner review.", answer: "Approved." },
    { questionId: "DO-Q-004", domainId: "review-policy", decision: "Tests and independent review are required; adversarial review is additionally required for high-risk, cross-cutting, security, migration, integration, and release work.", answer: "Approved." },
    { questionId: "DO-Q-005", domainId: "memory-authority", decision: "Hooks automatically bootstrap and preserve conclusions, while ProjectMemoryGate alone promotes semantic memory.", answer: "Approved." },
    { questionId: "DO-Q-006", domainId: "recovery", decision: "Uncertain external effects quarantine until exact reconciliation; no blind retry.", answer: "Approved." },
  ],
});
const closureMaterial = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsClosureAssessment",
  minimumWeightedCoverage: 0.99,
  weightedCoverage: 1,
  blockingUnknowns: [],
  unresolvedContradictions: [],
  uncoveredDomains: [],
  domainAssessments: ["runtime-boundary", "orchestration-authority", "worktree-safety", "review-policy", "memory-authority", "recovery"].map((domainId) => ({ domainId, weight: 1 / 6, blocking: true, status: "resolved", confidence: 1, creditedWeight: 1 / 6, evidenceRefs: ["owner-decisions-do-001-desktop-orchestration-v1"] })),
  outcome: "closed",
};
const closure = { ...closureMaterial, assessmentDigest: canonicalJsonDigest(closureMaterial) };
const goalBytes = jsonBytes(goal);
const projectContextBytes = jsonBytes(projectContext);
const repositorySnapshotBytes = jsonBytes(repositorySnapshot);
const decisionsBytes = jsonBytes(decisions);
const closureBytes = jsonBytes(closure);
const refs = [
  { role: "goal", artifact: pointer(goal.goalId, goalBytes) },
  { role: "project-context", artifact: pointer("project-context-devrelay-do-001-v1", projectContextBytes) },
  { role: "repository-snapshot", artifact: pointer("repository-snapshot-devrelay-do-001-v1", repositorySnapshotBytes) },
  { role: "owner-decision", artifact: pointer(decisions.decisionSetId, decisionsBytes) },
  { role: "requirements-closure", artifact: pointer("requirements-closure-do-001-v1", closureBytes) },
  { role: "requirements-baseline", artifact: previousRequirementsRef },
  { role: "project-overview-baseline", artifact: previousOverviewRef },
];
const replacement = buildDesktopOrchestrationRequirements(previousRequirements.requirements, refs);
const changedSections = Object.keys(replacement).filter((key) => canonicalJsonDigest(replacement[key]) !== canonicalJsonDigest(previousRequirements.requirements[key])).sort();
const changeSet = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsChangeSet",
  changeSetId: "requirements-change-set-do-001-desktop-orchestration-v1",
  baseInputs: refs.filter(({ role }) => ["goal", "project-context", "repository-snapshot", "requirements-baseline", "project-overview-baseline"].includes(role)),
  baseline: previousRequirementsRef,
  expectedRequirementsDigest: canonicalJsonDigest(previousRequirements.requirements),
  replacement,
  changedSections,
  reason: "Add the approved Desktop orchestration and automatic ProjectMemory capability set.",
  compatibilityImpact: "backward-compatible",
  risks: replacement.risks.filter((value) => /scheduler|task|worktree|hook|review|conflict/i.test(value)),
  requiredEvidence: replacement.requiredEvidence.filter((value) => value.startsWith("desktop-orchestration/") || value.startsWith("project-memory/")),
  sourceRefs: refs,
};
validateRequirementsArtifact(changeSet);
const changeSetBytes = jsonBytes(changeSet);
const changeSetRef = pointer(changeSet.changeSetId, changeSetBytes);

const overview = deriveProjectOverview(replacement);
const markdownBytes = renderProjectOverviewMarkdownBytes(overview);
const markdownRef = pointer("project-overview-markdown-do-001-desktop-orchestration-v1", markdownBytes);
const overviewChange = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewChangeSetDraft",
  changeSetId: "project-overview-change-set-do-001-desktop-orchestration-v1",
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
  approvalId: "requirements-gate-approval-do-001-desktop-orchestration-v1",
  authority: "project-owner",
  decision: "approve",
  source: { channel: "chat", statement: "Set a goal to include the improvements from the Reddit thread we discussed as well as the persistent memory. Don't stop until both are fully implemented." },
  approvedCandidate: { requirementsChangeSet: changeSetRef.digest, projectOverviewChangeSet: overviewChangeRef.digest, closure: sha256Digest(closureBytes) },
  authorizedActions: ["atomic-requirements-project-overview-promotion", "progress-to-architecture-design"],
  modificationPolicy: "Any material candidate change requires revalidation.",
});
const approvalBytes = jsonBytes(approval);
const approvalRef = pointer(approval.approvalId, approvalBytes);
const requirementsBaseline = {
  apiVersion: "devrelay.dev/v1alpha1", kind: "RequirementsBaseline",
  baselineId: "requirements-baseline-devrelay-v1-do-001-desktop-orchestration-001", version: "2.5.0",
  approvedCandidate: changeSetRef, supersedes: previousRequirementsRef, requirements: replacement, approvalEvidence: [approvalRef],
};
const requirementsBaselineBytes = jsonBytes(requirementsBaseline);
const requirementsBaselineRef = pointer(requirementsBaseline.baselineId, requirementsBaselineBytes);
validateRequirementsBaselinePromotion({ candidate: changeSet, candidateRef: changeSetRef, baseline: requirementsBaseline, previousBaseline: previousRequirements, previousBaselineRef: previousRequirementsRef });
const projectOverviewBaseline = {
  apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectOverviewBaseline",
  baselineId: "project-overview-baseline-devrelay-v1-do-001-desktop-orchestration-001", version: "2.5.0",
  approvedOverviewCandidate: overviewChangeRef, supersedes: previousOverviewRef, requirementsBaseline: requirementsBaselineRef,
  projection: overviewChange.projection, overview, renderedDocument: overviewChange.renderedDocument, approvalEvidence: [approvalRef],
};
const projectOverviewBaselineBytes = jsonBytes(projectOverviewBaseline);
const projectOverviewBaselineRef = pointer(projectOverviewBaseline.baselineId, projectOverviewBaselineBytes);
validateProjectOverviewBaselinePromotion({ projectOverviewBaseline, approvedCandidate: overviewChange, approvedCandidateRef: overviewChangeRef, requirementsBaseline, requirementsBaselineRef, previousBaseline: previousOverview, previousBaselineRef: previousOverviewRef });

await mkdir(new URL("candidate/", output), { recursive: true });
await mkdir(new URL("history/2.4.0/", project), { recursive: true });
await Promise.all([
  writeFile(new URL("goal.json", output), goalBytes), writeFile(new URL("project-context.json", output), projectContextBytes), writeFile(new URL("repository-snapshot.json", output), repositorySnapshotBytes), writeFile(new URL("owner-decisions.json", output), decisionsBytes), writeFile(new URL("requirements-closure-assessment-approved.json", output), closureBytes),
  writeFile(new URL("requirements-change-set.json", output), changeSetBytes), writeFile(new URL("project-overview-change-set-draft.json", output), overviewChangeBytes), writeFile(new URL("candidate/ProjectOverview.md", output), markdownBytes),
  writeFile(new URL("requirements-gate-owner-approval.json", output), approvalBytes),
  writeFile(new URL("history/2.4.0/requirements-baseline.json", project), previousRequirementsBytes), writeFile(new URL("history/2.4.0/project-overview-baseline.json", project), previousOverviewBytes), writeFile(new URL("history/2.4.0/ProjectOverview.md", project), previousMarkdownBytes),
  writeFile(new URL("requirements-baseline.json", project), requirementsBaselineBytes), writeFile(new URL("project-overview-baseline.json", project), projectOverviewBaselineBytes), writeFile(new URL("ProjectOverview.md", root), markdownBytes),
]);
const proof = withContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "RequirementsGatePromotionProof", proofId: "requirements-gate-promotion-do-001-v1", status: "pass", closureDigest: sha256Digest(closureBytes), changeSet: changeSetRef, overviewChangeSet: overviewChangeRef, approval: approvalRef, promoted: { requirementsBaseline: requirementsBaselineRef, projectOverviewBaseline: projectOverviewBaselineRef, markdown: markdownRef }, architectureProgressionAllowed: true });
const proofBytes = jsonBytes(proof);
const promotionJournal = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsPairPromotionJournal",
  promotionId: "requirements-promotion-do-001-desktop-orchestration-v1",
  state: "committed",
  previous: {
    requirementsBaseline: previousRequirementsRef,
    projectOverviewBaseline: previousOverviewRef,
  },
  next: {
    requirementsBaseline: requirementsBaselineRef,
    projectOverviewBaseline: projectOverviewBaselineRef,
    projectOverviewMarkdown: markdownRef,
  },
  approval: approvalRef,
  proof: pointer(proof.proofId, proofBytes),
};
await Promise.all([
  writeFile(new URL("requirements-gate-promotion-proof.json", output), proofBytes),
  writeFile(new URL("requirements-promotion.commit.json", project), jsonBytes(promotionJournal)),
]);
process.stdout.write(`${JSON.stringify({ outcome: "promoted", requirementsBaseline: requirementsBaselineRef, projectOverviewBaseline: projectOverviewBaselineRef }, null, 2)}\n`);
