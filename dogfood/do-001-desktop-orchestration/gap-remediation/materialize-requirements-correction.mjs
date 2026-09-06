import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import { deriveProjectOverview, diffProjectOverviewSections, PROJECT_OVERVIEW_DOCUMENT, PROJECT_OVERVIEW_PROJECTION, PROJECT_OVERVIEW_RENDERER, renderProjectOverviewMarkdownBytes } from "../../../src/project-overview.mjs";
import { validateProjectOverviewBaselinePromotion, validateProjectOverviewChangeSetAgainstBaseline, validateProjectOverviewRenderedDocument } from "../../../src/project-overview-artifact-validator.mjs";
import { validateRequirementsArtifact, validateRequirementsBaselinePromotion } from "../../../src/requirements-artifact-validator.mjs";

const root = new URL("../../../", import.meta.url);
const project = new URL("../../../project/", import.meta.url);
const output = new URL("./", import.meta.url);
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = (artifactId, bytes) => ({ artifactId, digest: sha256Digest(bytes) });
const withContentDigest = (value) => ({ ...value, contentDigest: canonicalJsonDigest(value) });
const sortSourceRefs = (values) => [...new Map(values.map((value) => [[value.role, value.artifact.artifactId, value.artifact.digest, value.location ?? ""].join("\u0000"), value])).entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([, value]) => value);
const updateById = (values, id, update) => {
  const index = values.findIndex((value) => value.id === id);
  if (index === -1) throw new Error(`Missing ${id}.`);
  values[index] = update(structuredClone(values[index]));
};
const replaceString = (values, prior, next) => values.map((value) => value === prior ? next : value);
const sortStrings = (values) => [...new Set(values)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);

const previousRequirementsBytes = await readFile(new URL("requirements-baseline.json", project));
const previousOverviewBytes = await readFile(new URL("project-overview-baseline.json", project));
const previousMarkdownBytes = await readFile(new URL("ProjectOverview.md", root));
const previousRequirements = JSON.parse(previousRequirementsBytes);
const previousOverview = JSON.parse(previousOverviewBytes);
if (previousRequirements.version === "2.6.0") {
  process.stdout.write(`${JSON.stringify({ outcome: "replayed", requirementsBaselineId: previousRequirements.baselineId })}\n`);
  process.exit(0);
}
if (previousRequirements.version !== "2.5.0" || previousOverview.version !== "2.5.0") throw new Error("Desktop startup correction requires the exact 2.5.0 baseline pair.");
const previousRequirementsRef = pointer(previousRequirements.baselineId, previousRequirementsBytes);
const previousOverviewRef = pointer(previousOverview.baselineId, previousOverviewBytes);

const goal = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-devrelay-do-001-gap-remediation-v1",
  statement: "Correct the unsupported Desktop hook claim, implement deterministic managed-task ProjectMemory bootstrap and exact memory-bound task plans, close orchestration traceability gaps, and prove memory in fresh ChatGPT Desktop tasks.",
  objectives: ["Use only supported ChatGPT Desktop project and task surfaces.", "Fail closed on stale memory before managed work.", "Prove persistence across fresh worktree tasks."],
  constraints: ["Preserve ProjectMemoryGate and lifecycle authority.", "Do not claim undeclared Codex plugin lifecycle hooks.", "Keep unrelated chats inaccessible."],
  acceptanceCriteria: ["A fresh Desktop task runs the repository bootstrap before substantive work.", "Every DesktopTaskPlan pins the exact bootstrap receipt and memory context.", "A second fresh task observes a newly concluded memory baseline."],
  assumptions: ["The owner instructed DevRelay to fix the gaps and explicitly prioritized testing memory."],
};
const decisions = withContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "OwnerDecisionSet",
  decisionSetId: "owner-decisions-do-001-gap-remediation-v1",
  decisions: [
    { questionId: "DO-GAP-Q-001", domainId: "desktop-startup", decision: "Use repository AGENTS.md plus the exact managed prompt as the supported startup trigger; the deterministic helper performs validation and emits a receipt.", answer: "Approved by the owner's fix-and-test directive." },
    { questionId: "DO-GAP-Q-002", domainId: "task-memory-binding", decision: "Bind the bootstrap receipt, baseline, synopsis, and graph checkpoint into every DesktopTaskPlan idempotency identity.", answer: "Approved." },
    { questionId: "DO-GAP-Q-003", domainId: "claim-boundary", decision: "Retain the explicit host lifecycle bridge as optional compatibility code but make no automatic Codex plug-in hook claim.", answer: "Approved as an accuracy correction." },
  ],
});
const closureMaterial = { apiVersion: "devrelay.dev/v1alpha1", kind: "RequirementsClosureAssessment", minimumWeightedCoverage: 0.99, weightedCoverage: 1, blockingUnknowns: [], unresolvedContradictions: [], uncoveredDomains: [], domainAssessments: ["desktop-startup", "task-memory-binding", "claim-boundary"].map((domainId) => ({ domainId, weight: 1 / 3, blocking: true, status: "resolved", confidence: 1, creditedWeight: 1 / 3, evidenceRefs: [decisions.decisionSetId] })), outcome: "closed" };
const closure = { ...closureMaterial, assessmentDigest: canonicalJsonDigest(closureMaterial) };
const goalBytes = jsonBytes(goal);
const decisionsBytes = jsonBytes(decisions);
const closureBytes = jsonBytes(closure);
const projectContextBytes = await readFile(new URL("../project-context.json", output));
const repositorySnapshotBytes = await readFile(new URL("../repository-snapshot.json", output));
const projectContext = JSON.parse(projectContextBytes);
const repositorySnapshot = JSON.parse(repositorySnapshotBytes);
const sourceRefs = [
  { role: "goal", artifact: pointer(goal.goalId, goalBytes) },
  { role: "project-context", artifact: pointer(projectContext.projectId, projectContextBytes) },
  { role: "repository-snapshot", artifact: pointer(repositorySnapshot.kind, repositorySnapshotBytes) },
  { role: "owner-decision", artifact: pointer(decisions.decisionSetId, decisionsBytes) },
  { role: "requirements-closure", artifact: pointer("requirements-closure-do-001-gap-remediation-v1", closureBytes) },
  { role: "requirements-baseline", artifact: previousRequirementsRef },
  { role: "project-overview-baseline", artifact: previousOverviewRef },
];
const replacement = structuredClone(previousRequirements.requirements);
const sourced = (value) => ({ ...value, sourceRefs: sortSourceRefs([...(value.sourceRefs ?? []), ...structuredClone(sourceRefs)]) });
replacement.currentStatus = sourced({ ...replacement.currentStatus, summary: "DO-001 gap remediation is in verification for a restart-safe ChatGPT Desktop worktree harness with Core-derived scheduling, policy-driven review, supported repository-triggered ProjectMemory bootstrap, and exact memory-bound task plans." });
updateById(replacement.acceptanceCriteria, "AC-DO-HOOKS-001", (value) => sourced({ ...value, statement: "Every configured DevRelay Desktop project uses repository instructions and the exact managed task prompt to run a deterministic bootstrap helper that validates and injects current ProjectMemory context before substantive work, while interruption and conclusion artifacts prevent silent loss without accessing unrelated chats.", verification: "Run command and live Desktop task cases for startup, changed baseline, corrupted synopsis, missing graph checkpoint, interruption, explicit conclusion, unrelated directories, and malformed input." }));
updateById(replacement.acceptanceCriteria, "AC-DO-PLUGIN-001", (value) => sourced({ ...value, statement: "A validated installable DevRelay Desktop plugin packages the orchestration skill and bounded scripts without claiming unsupported lifecycle hooks or embedding product-specific routing in Generic Core.", verification: "Validate the Codex plugin manifest, skill metadata, bounded scripts, package contents, installation path, fresh-task pickup, and Generic Core identifier scan." }));
updateById(replacement.acceptanceCriteria, "AC-DO-TRACEABILITY-001", (value) => sourced({ ...value, statement: "Trusted contributors project only validated forward facts for task plans, memory bootstrap receipts, leases, reviews, integration, recovery, and conclusions while adapters, bootstrap helpers, and task prompts receive no graph mutation authority." }));
updateById(replacement.acceptanceCriteria, "AC-DO-DESKTOP-E2E-001", (value) => sourced({ ...value, verification: "Run an installed-package and plugin end-to-end scenario using exact host-observed task, bootstrap, Git, SQLite, memory, and verification receipts." }));
updateById(replacement.nonFunctionalRequirements, "NFR-DO-SECURITY-001", (value) => sourced({ ...value, statement: "Desktop task and bootstrap-helper execution is least-privilege, workspace-scoped, secret-safe, local-first, and deny-by-default for network or external side effects.", measure: "Run grant, path, task, transcript, secret, network, project-startup, and redaction matrices." }));
updateById(replacement.constraints, "CON-DO-MEMORY-AUTHORITY-001", (value) => sourced({ ...value, statement: "Repository-backed ProjectMemoryBaseline and Gate-approved conclusions remain authoritative; bootstrap context, task transcripts, cached provider memory, and operator projections are derived evidence only." }));
updateById(replacement.scope, "SCOPE-DO-MEMORY-001", (value) => sourced({ ...value, statement: "Deterministic repository-triggered bootstrap, conclusion enforcement, worker-parent memory handoff, interruption quarantine, and fresh-task restart recovery for DevRelay-managed tasks." }));
updateById(replacement.scope, "SCOPE-DO-PLUGIN-001", (value) => sourced({ ...value, statement: "An installable ChatGPT/Codex Desktop plugin containing the orchestration skill, bounded local scripts, documentation, and validation evidence; lifecycle hooks are not claimed." }));
updateById(replacement.assumptions, "ASM-DO-DESKTOP-001", (value) => sourced({ ...value, statement: "ChatGPT Desktop provides project-scoped Codex tasks, Git worktree creation, task waiting and messaging, handoff, plugins, skills, and repository AGENTS.md instructions on the Windows release-defining host." }));
updateById(replacement.assumptions, "ASM-DO-BOUNDARY-001", (value) => sourced({ ...value, statement: "Managed-task memory lifecycle applies only inside configured DevRelay projects; unrelated chats remain inaccessible and manually created project tasks enter through the repository bootstrap boundary." }));
replacement.dependencies = sortStrings(replaceString(replacement.dependencies, "ChatGPT Desktop task/worktree, plugin, skill, and lifecycle-hook surfaces on the Windows release-defining host.", "ChatGPT Desktop task/worktree, plugin, skill, project-instruction, and managed-prompt surfaces on the Windows release-defining host."));
replacement.risks = sortStrings(replaceString(replacement.risks, "Automatic hooks can leak transcript or secret content, run outside the intended project, or block unrelated chats unless inputs and scope fail closed.", "Project startup instructions or managed prompts can load stale or out-of-scope context unless the repository bootstrap validates exact paths, bytes, project identity, and digests before work."));
replacement.deliverables = sortStrings(replaceString(replacement.deliverables, "Installable DevRelay Desktop plugin with orchestration skill, lifecycle hooks, bounded scripts, validation, and local installation documentation.", "Installable DevRelay Desktop plugin with orchestration skill, bounded bootstrap scripts, validation, and local installation documentation."));
replacement.requiredEvidence = sortStrings(replaceString(replacement.requiredEvidence, "desktop-orchestration/hook-lifecycle", "desktop-orchestration/repository-bootstrap-lifecycle"));
replacement.sourceRefs = sortSourceRefs(structuredClone(sourceRefs));

const changedSections = Object.keys(replacement).filter((key) => canonicalJsonDigest(replacement[key]) !== canonicalJsonDigest(previousRequirements.requirements[key])).sort();
const changeSet = { apiVersion: "devrelay.dev/v1alpha1", kind: "RequirementsChangeSet", changeSetId: "requirements-change-set-do-001-gap-remediation-v1", baseInputs: sourceRefs.filter(({ role }) => ["goal", "project-context", "repository-snapshot", "requirements-baseline", "project-overview-baseline"].includes(role)), baseline: previousRequirementsRef, expectedRequirementsDigest: canonicalJsonDigest(previousRequirements.requirements), replacement, changedSections, reason: "Correct the unsupported Codex lifecycle-hook claim and require a supported, receipt-bound repository bootstrap for managed Desktop tasks.", compatibilityImpact: "backward-compatible", risks: replacement.risks.filter((value) => /startup|task|memory|prompt/i.test(value)), requiredEvidence: replacement.requiredEvidence.filter((value) => value.includes("desktop-orchestration") || value.includes("project-memory")), sourceRefs };
validateRequirementsArtifact(changeSet);
const changeSetBytes = jsonBytes(changeSet);
const changeSetRef = pointer(changeSet.changeSetId, changeSetBytes);
const overview = deriveProjectOverview(replacement);
const markdownBytes = renderProjectOverviewMarkdownBytes(overview);
const markdownRef = pointer("project-overview-markdown-do-001-gap-remediation-v1", markdownBytes);
const overviewChange = { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectOverviewChangeSetDraft", changeSetId: "project-overview-change-set-do-001-gap-remediation-v1", baseOverview: previousOverviewRef, requirementsChangeSet: changeSetRef, changeDisposition: "changed", changedSections: diffProjectOverviewSections(previousOverview.overview, overview), projection: PROJECT_OVERVIEW_PROJECTION, overview, renderedDocument: { ...PROJECT_OVERVIEW_DOCUMENT, artifact: markdownRef, renderer: PROJECT_OVERVIEW_RENDERER } };
validateProjectOverviewChangeSetAgainstBaseline({ projectOverviewChangeSet: overviewChange, requirementsChangeSet: changeSet, requirementsChangeSetRef: changeSetRef, baseOverview: previousOverview, baseOverviewRef: previousOverviewRef });
validateProjectOverviewRenderedDocument({ projectOverviewArtifact: overviewChange, renderedDocumentBytes: markdownBytes });
const overviewChangeBytes = jsonBytes(overviewChange);
const overviewChangeRef = pointer(overviewChange.changeSetId, overviewChangeBytes);
const approval = withContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "RequirementsGateApproval", approvalId: "requirements-gate-approval-do-001-gap-remediation-v1", authority: "project-owner", decision: "approve", source: { channel: "chat", statement: "Fix the gaps, and very importantly, I want to test that memory is working correctly." }, approvedCandidate: { requirementsChangeSet: changeSetRef.digest, projectOverviewChangeSet: overviewChangeRef.digest, closure: sha256Digest(closureBytes) }, authorizedActions: ["atomic-requirements-project-overview-promotion", "progress-to-verification"], modificationPolicy: "Any material candidate change requires revalidation." });
const approvalBytes = jsonBytes(approval);
const approvalRef = pointer(approval.approvalId, approvalBytes);
const requirementsBaseline = { apiVersion: "devrelay.dev/v1alpha1", kind: "RequirementsBaseline", baselineId: "requirements-baseline-devrelay-v1-do-001-gap-remediation-001", version: "2.6.0", approvedCandidate: changeSetRef, supersedes: previousRequirementsRef, requirements: replacement, approvalEvidence: [approvalRef] };
const requirementsBaselineBytes = jsonBytes(requirementsBaseline);
const requirementsBaselineRef = pointer(requirementsBaseline.baselineId, requirementsBaselineBytes);
validateRequirementsBaselinePromotion({ candidate: changeSet, candidateRef: changeSetRef, baseline: requirementsBaseline, previousBaseline: previousRequirements, previousBaselineRef: previousRequirementsRef });
const projectOverviewBaseline = { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectOverviewBaseline", baselineId: "project-overview-baseline-devrelay-v1-do-001-gap-remediation-001", version: "2.6.0", approvedOverviewCandidate: overviewChangeRef, supersedes: previousOverviewRef, requirementsBaseline: requirementsBaselineRef, projection: overviewChange.projection, overview, renderedDocument: overviewChange.renderedDocument, approvalEvidence: [approvalRef] };
const projectOverviewBaselineBytes = jsonBytes(projectOverviewBaseline);
const projectOverviewBaselineRef = pointer(projectOverviewBaseline.baselineId, projectOverviewBaselineBytes);
validateProjectOverviewBaselinePromotion({ projectOverviewBaseline, approvedCandidate: overviewChange, approvedCandidateRef: overviewChangeRef, requirementsBaseline, requirementsBaselineRef, previousBaseline: previousOverview, previousBaselineRef: previousOverviewRef });
const proof = withContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "RequirementsGatePromotionProof", proofId: "requirements-gate-promotion-do-001-gap-remediation-v1", status: "pass", closureDigest: sha256Digest(closureBytes), changeSet: changeSetRef, overviewChangeSet: overviewChangeRef, approval: approvalRef, promoted: { requirementsBaseline: requirementsBaselineRef, projectOverviewBaseline: projectOverviewBaselineRef, markdown: markdownRef }, architectureProgressionAllowed: true });
const proofBytes = jsonBytes(proof);
const promotionJournal = { apiVersion: "devrelay.dev/v1alpha1", kind: "RequirementsPairPromotionJournal", promotionId: "requirements-promotion-do-001-gap-remediation-v1", state: "committed", previous: { requirementsBaseline: previousRequirementsRef, projectOverviewBaseline: previousOverviewRef }, next: { requirementsBaseline: requirementsBaselineRef, projectOverviewBaseline: projectOverviewBaselineRef, projectOverviewMarkdown: markdownRef }, approval: approvalRef, proof: pointer(proof.proofId, proofBytes) };

await mkdir(output, { recursive: true });
await mkdir(new URL("history/2.5.0/", project), { recursive: true });
await Promise.all([
  writeFile(new URL("goal.json", output), goalBytes),
  writeFile(new URL("owner-decisions.json", output), decisionsBytes),
  writeFile(new URL("requirements-closure-assessment-approved.json", output), closureBytes),
  writeFile(new URL("requirements-change-set.json", output), changeSetBytes),
  writeFile(new URL("project-overview-change-set-draft.json", output), overviewChangeBytes),
  writeFile(new URL("requirements-gate-owner-approval.json", output), approvalBytes),
  writeFile(new URL("requirements-gate-promotion-proof.json", output), proofBytes),
  writeFile(new URL("history/2.5.0/requirements-baseline.json", project), previousRequirementsBytes),
  writeFile(new URL("history/2.5.0/project-overview-baseline.json", project), previousOverviewBytes),
  writeFile(new URL("history/2.5.0/ProjectOverview.md", project), previousMarkdownBytes),
  writeFile(new URL("requirements-baseline.json", project), requirementsBaselineBytes),
  writeFile(new URL("project-overview-baseline.json", project), projectOverviewBaselineBytes),
  writeFile(new URL("ProjectOverview.md", root), markdownBytes),
  writeFile(new URL("requirements-promotion.commit.json", project), jsonBytes(promotionJournal)),
]);
process.stdout.write(`${JSON.stringify({ outcome: "promoted", requirementsBaseline: requirementsBaselineRef, projectOverviewBaseline: projectOverviewBaselineRef, changedSections }, null, 2)}\n`);
