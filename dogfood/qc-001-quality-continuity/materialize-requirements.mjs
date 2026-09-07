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
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = (artifactId, bytes) => ({ artifactId, digest: sha256Digest(bytes) });
const withContentDigest = (value) => ({ ...value, contentDigest: canonicalJsonDigest(value) });
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
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
if (previousRequirements.version === "2.7.0") {
  process.stdout.write(`${JSON.stringify({ outcome: "replayed", requirementsBaselineId: previousRequirements.baselineId })}\n`);
  process.exit(0);
}
if (previousRequirements.version !== "2.6.0" || previousOverview.version !== "2.6.0") {
  throw new Error("QC-001 requires the exact 2.6.0 baseline pair.");
}
const previousRequirementsRef = pointer(previousRequirements.baselineId, previousRequirementsBytes);
const previousOverviewRef = pointer(previousOverview.baselineId, previousOverviewBytes);
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL("../../", import.meta.url), encoding: "utf8", windowsHide: true }).trim();
const trackedFiles = execFileSync("git", ["ls-files"], { cwd: new URL("../../", import.meta.url), encoding: "utf8", windowsHide: true }).trim().split(/\r?\n/u).filter(Boolean).sort(compare);

const goal = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-devrelay-qc-001-quality-continuity-v1",
  statement: "Add modular, deterministic quality policy, work continuity, and project control capabilities that scale engineering quality, prevent duplicate work, and preserve exact operational state without changing the construction lifecycle.",
  objectives: [
    "Make insufficiently evidenced code unable to advance through existing verification and integration gates.",
    "Prevent exact duplicate work and unsafe result reuse before a Desktop task or worktree is allocated.",
    "Provide one read-only reconciliation view over authoritative memory, lifecycle, graph, task, worktree, review, and Git state.",
    "Measure whether the quick, standard, and assurance profiles produce timely, high-quality outcomes without weakening required gates.",
  ],
  constraints: [
    "QualityPolicy, WorkContinuity, and ProjectControl are cross-cutting semantic Modules, not new construction stages.",
    "Generic Core cannot branch on Module or product identities or inject hidden context.",
    "Only exact deterministic equivalence is automatically reusable; semantic ambiguity requires owner review.",
    "Published Module versions remain immutable and upgraded consumers use explicit new ports and versions.",
  ],
  acceptanceCriteria: [
    "A stale or weaker quality policy cannot be substituted into an execution or verification attempt.",
    "An active or verified exact work intent is detected before duplicate dispatch.",
    "A fresh task can reconstruct current state and identify stale authority horizons without conversational memory.",
    "A live multi-worktree benchmark records quality, reuse, reconciliation, and cycle-time evidence.",
  ],
  assumptions: ["The owner's preceding decision wave approved the three-Module structure, unchanged lifecycle order, and bounded authority model."],
};
const decisions = withContentDigest({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "OwnerDecisionSet",
  decisionSetId: "owner-decisions-qc-001-quality-continuity-v1",
  decisions: [
    { questionId: "QC-Q-001", domainId: "module-boundary", decision: "Create QualityPolicy, WorkContinuity, and ProjectControl as independently versioned cross-cutting semantic Modules.", answer: "Approved by the owner's 'Proceed' after reviewing the exact three-Module proposal." },
    { questionId: "QC-Q-002", domainId: "lifecycle-composition", decision: "Keep the construction lifecycle unchanged and invoke cross-cutting Modules only through declared, version-pinned boundary bindings resolved generically by Core.", answer: "Approved." },
    { questionId: "QC-Q-003", domainId: "quality-authority", decision: "QualityPolicy owns policy candidates, baselines, and resolved obligations; existing verification and acceptance gates retain progression authority.", answer: "Approved." },
    { questionId: "QC-Q-004", domainId: "reuse-authority", decision: "Automatically block or reuse only exact deterministic work identities; semantic similarity produces an owner-review candidate and never declares completion.", answer: "Approved." },
    { questionId: "QC-Q-005", domainId: "control-authority", decision: "ProjectControl is read-only and reconciles references to existing authorities without becoming a second source of truth.", answer: "Approved." },
    { questionId: "QC-Q-006", domainId: "compatibility", decision: "Publish new immutable Module versions with explicit ports while retaining prior released versions and compatibility behavior.", answer: "Approved." },
    { questionId: "QC-Q-007", domainId: "evidence", decision: "Require adversarial tests, restart and drift fixtures, exact graph projection, and a live multi-worktree benchmark before acceptance.", answer: "Approved." },
  ],
});
const closureDomains = ["module-boundary", "lifecycle-composition", "quality-authority", "reuse-authority", "control-authority", "compatibility", "evidence"];
const closureMaterial = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsClosureAssessment",
  minimumWeightedCoverage: 0.99,
  weightedCoverage: 1,
  blockingUnknowns: [],
  unresolvedContradictions: [],
  uncoveredDomains: [],
  domainAssessments: closureDomains.map((domainId) => ({ domainId, weight: 1 / closureDomains.length, blocking: true, status: "resolved", confidence: 1, creditedWeight: 1 / closureDomains.length, evidenceRefs: [decisions.decisionSetId] })),
  outcome: "closed",
};
const closure = { ...closureMaterial, assessmentDigest: canonicalJsonDigest(closureMaterial) };
const projectContext = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary: "DevRelay 0.11.0-rc.1 has the complete deterministic construction lifecycle, ProjectMemory, TraceabilityGraph, and Desktop worktree orchestration. QC-001 adds modular quality, reuse, and operational continuity across those existing authorities.",
  stakeholders: ["DevRelay owner and maintainer", "ChatGPT Desktop engineering operators", "Module, adapter, host, verification, and integration authors"],
  domainConstraints: ["Existing gates retain authority.", "Cross-cutting invocations are explicit and version-pinned.", "Operational projections are read-only."],
  conventions: ["Use exact content digests.", "Fail closed on drift.", "Quarantine ambiguity.", "Prefer deterministic reuse over repeat execution."],
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
  { role: "project-context", artifact: pointer("project-context-devrelay-qc-001-v1", projectContextBytes) },
  { role: "repository-snapshot", artifact: pointer("repository-snapshot-devrelay-qc-001-v1", repositorySnapshotBytes) },
  { role: "owner-decision", artifact: pointer(decisions.decisionSetId, decisionsBytes), location: "Seven cross-cutting-module decisions approved across the preceding chat decision wave" },
  { role: "requirements-closure", artifact: pointer("requirements-closure-qc-001-v1", closureBytes) },
  { role: "requirements-baseline", artifact: previousRequirementsRef },
  { role: "project-overview-baseline", artifact: previousOverviewRef },
];
const sourced = (value) => ({ ...value, sourceRefs: sortSourceRefs([...(value.sourceRefs ?? []), ...structuredClone(sourceRefs)]) });
const replacement = structuredClone(previousRequirements.requirements);

addUniqueById(replacement.businessObjectives, [sourced({
  id: "BO-DEV-QUALITY-CONTINUITY-001",
  statement: "Scale production-quality engineering while preventing duplicate work and preserving exact current state across modules, tasks, worktrees, restarts, and releases.",
  stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"],
  priority: "must",
})]);
addUniqueById(replacement.successMetrics, [
  sourced({ id: "SM-QC-QUALITY-001", name: "Evidence-complete integration", businessObjectiveIds: ["BO-DEV-QUALITY-CONTINUITY-001"], measure: "Integration attempts lacking the exact resolved quality policy or all required evidence.", target: "Zero attempts.", measurementMethod: "Run quick, standard, assurance, stale-policy, missing-evidence, and downgrade fixtures." }),
  sourced({ id: "SM-QC-REUSE-001", name: "No exact duplicate dispatch", businessObjectiveIds: ["BO-DEV-QUALITY-CONTINUITY-001"], measure: "Concurrent task or worktree allocations for the same active exact WorkIntentFingerprint.", target: "Zero duplicate allocations.", measurementMethod: "Run concurrent, restart, replay, stale-target, semantic-near-match, and verified-result reuse fixtures." }),
  sourced({ id: "SM-QC-CONTROL-001", name: "Recoverable authoritative state", businessObjectiveIds: ["BO-DEV-QUALITY-CONTINUITY-001"], measure: "Fresh tasks that cannot identify the exact lifecycle stage, frontier, tasks, worktrees, memory conclusion, graph horizon, or blockers.", target: "Zero unresolved omissions for configured authorities.", measurementMethod: "Run fresh-task, restart, graph-lag, memory-lag, Git-drift, and uncertain-effect reconciliation fixtures." }),
]);
addUniqueById(replacement.capabilities, [
  sourced({ id: "CAP-DEV-QUALITY-POLICY-001", name: "Modular quality policy", description: "Establish, evolve, resolve, and assess digest-bound quality obligations through a cross-cutting semantic Module while existing verification gates retain progression authority.", businessObjectiveIds: ["BO-DEV-QUALITY-CONTINUITY-001", "BO-DEV-QUALITY-001"], userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"], audience: "user-facing", key: true, priority: "must" }),
  sourced({ id: "CAP-DEV-WORK-CONTINUITY-001", name: "Deterministic work identity and reuse", description: "Identify exact work intent, detect active or completed equivalents, preserve attempt lineage, and propose safe reuse before allocating duplicate work.", businessObjectiveIds: ["BO-DEV-QUALITY-CONTINUITY-001", "BO-DEV-DETERMINISM-001"], userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"], audience: "user-facing", key: true, priority: "must" }),
  sourced({ id: "CAP-DEV-PROJECT-CONTROL-001", name: "Reconciled project control", description: "Project one read-only, digest-bound view over authoritative roadmap, memory, graph, lifecycle, task, worktree, review, Git, and performance state.", businessObjectiveIds: ["BO-DEV-QUALITY-CONTINUITY-001", "BO-DEV-OBSERVABILITY-001"], userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"], audience: "user-facing", key: true, priority: "must" }),
]);
addUniqueById(replacement.userJourneys, [sourced({
  id: "UJ-QC-QUALITY-CONTINUITY-001",
  name: "Produce verified work without duplication or lost state",
  userId: "USR-DEV-WORKFLOW-AUTHOR-001",
  capabilityIds: ["CAP-DEV-QUALITY-POLICY-001", "CAP-DEV-WORK-CONTINUITY-001", "CAP-DEV-PROJECT-CONTROL-001"],
  trigger: "An approved dependency frontier becomes eligible for Desktop execution.",
  outcome: "Only uniquely identified, policy-bound, independently verified work integrates, and every fresh task can reconstruct its exact state.",
  steps: [
    { sequence: 1, action: "Core resolves declared cross-cutting bindings and reconciles current authorities.", expectedOutcome: "Drift or missing state blocks before dispatch." },
    { sequence: 2, action: "WorkContinuity computes exact intent and checks active, checkpointed, verified, and integrated attempts.", expectedOutcome: "Duplicate work is blocked, safely reused, or routed to owner review." },
    { sequence: 3, action: "QualityPolicy resolves immutable obligations for the exact work and profile.", expectedOutcome: "The task, reviewers, and gates share one policy identity." },
    { sequence: 4, action: "Existing execution, verification, integration, system, and acceptance stages consume the declared outputs.", expectedOutcome: "Progression follows evidence rather than conversational completion claims." },
    { sequence: 5, action: "ProjectControl projects state and metrics while ProjectMemory concludes approved semantic changes.", expectedOutcome: "The next fresh task resumes without guessing." },
  ],
})]);
addUniqueById(replacement.userStories, [
  sourced({ id: "US-QC-QUALITY-POLICY-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-QUALITY-POLICY-001", userJourneyIds: ["UJ-QC-QUALITY-CONTINUITY-001"], need: "Bind every task and verification attempt to an approved quality policy appropriate to its risk and technology.", benefit: "Fast profiles remain safe and high-risk changes cannot silently weaken evidence.", priority: "must", acceptanceCriterionIds: ["AC-QC-COMPOSITION-001", "AC-QC-QUALITY-BASELINE-001", "AC-QC-QUALITY-RESOLUTION-001", "AC-QC-QUALITY-ENFORCEMENT-001"] }),
  sourced({ id: "US-QC-WORK-CONTINUITY-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-WORK-CONTINUITY-001", userJourneyIds: ["UJ-QC-QUALITY-CONTINUITY-001"], need: "Know whether equivalent work is active, reusable, stale, or ambiguous before allocating another task.", benefit: "Time and tokens are not wasted and result reuse remains evidence-safe.", priority: "must", acceptanceCriterionIds: ["AC-QC-WORK-IDENTITY-001", "AC-QC-WORK-REUSE-001", "AC-QC-WORK-CONCURRENCY-001", "AC-QC-WORK-LINEAGE-001"] }),
  sourced({ id: "US-QC-PROJECT-CONTROL-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId: "CAP-DEV-PROJECT-CONTROL-001", userJourneyIds: ["UJ-QC-QUALITY-CONTINUITY-001"], need: "See and reconcile the exact current state across every authority without maintaining a second manual status record.", benefit: "Fresh tasks and operators cannot lose the current stage, work ownership, blockers, or next action.", priority: "must", acceptanceCriterionIds: ["AC-QC-CONTROL-SNAPSHOT-001", "AC-QC-CONTROL-RECONCILIATION-001", "AC-QC-CONTROL-AUTHORITY-001", "AC-QC-BENCHMARK-001"] }),
]);
addUniqueById(replacement.acceptanceCriteria, [
  sourced({ id: "AC-QC-COMPOSITION-001", statement: "A versioned CrossCuttingModuleBinding declares every boundary, exact Module operation and version, ports, configuration, grants, failure behavior, and ordered dependency without Generic Core branching on an identity.", verification: "Exercise multiple interchangeable cross-cutting Modules, invalid boundaries, cycles, missing ports, hidden context, reordered chains, and source scans for identity-specific Core routing." }),
  sourced({ id: "AC-QC-QUALITY-BASELINE-001", statement: "QualityPolicy establishes and evolves one approved QualityPolicyBaseline through an explicit Gate while published versions and prior baselines remain immutable.", verification: "Exercise establish, compatible change, incompatible change, stale baseline, forged approval, raw-byte drift, and replay fixtures." }),
  sourced({ id: "AC-QC-QUALITY-RESOLUTION-001", statement: "QualityPolicy deterministically resolves work, risk, profile, technology, architecture, contract, and acceptance inputs into one digest-bound obligation set.", verification: "Compare exact quick, standard, assurance, language-pack, missing-input, and reordered-input outputs." }),
  sourced({ id: "AC-QC-QUALITY-ENFORCEMENT-001", statement: "WorkExecution, WorkItemVerification, SystemVerification, and ReleaseVerification reject missing, stale, weaker, or substituted resolved quality obligations without granting QualityPolicy progression authority.", verification: "Run policy downgrade, stale subject, missing evidence, replay, and cross-module port-conformance matrices." }),
  sourced({ id: "AC-QC-WORK-IDENTITY-001", statement: "WorkContinuity deterministically fingerprints exact work intent from approved work, requirement, architecture, contract, verification, project, target-revision, and effect inputs.", verification: "Prove equality for reordered equivalent inputs and inequality for every authority-bearing input change." }),
  sourced({ id: "AC-QC-WORK-REUSE-001", statement: "Only an exact checkpointed and revalidated intent can be automatically joined, resumed, or reused; semantic similarity and conflicting evidence require explicit owner review.", verification: "Run exact match, near match, stale revision, changed policy, changed adapter, uncheckpointed result, failed result, and owner-review fixtures." }),
  sourced({ id: "AC-QC-WORK-CONCURRENCY-001", statement: "Concurrent attempts for one active exact work identity cannot acquire more than one task/worktree lease, including after restart or uncertain external effects.", verification: "Race allocations, restart between effect and receipt, repeat idempotency keys, and reconcile uncertain task creation." }),
  sourced({ id: "AC-QC-WORK-LINEAGE-001", statement: "Every join, resume, reuse, retry, supersession, rejection, and integration retains exact attempt and evidence lineage for verification and traceability.", verification: "Query forward and reverse paths across all continuity dispositions and reject orphan or cyclic lineage." }),
  sourced({ id: "AC-QC-CONTROL-SNAPSHOT-001", statement: "ProjectControl projects one deterministic current snapshot from exact roadmap, memory, graph, lifecycle ledger, task, worktree, review, Git, policy, continuity, and metrics references.", verification: "Reorder inputs, restart the host, and compare byte-identical projections with bounded unavailable dispositions." }),
  sourced({ id: "AC-QC-CONTROL-RECONCILIATION-001", statement: "ProjectControl diagnoses stale horizons, drift, unconcluded sessions, uncertain effects, duplicate leases, missing evidence, and inconsistent next actions without mutating their authorities.", verification: "Inject each mismatch independently and together, confirm stable diagnostics, and require existing owners to perform corrections." }),
  sourced({ id: "AC-QC-CONTROL-AUTHORITY-001", statement: "ProjectControl and its adapters are read-only projections and cannot alter roadmap, memory, graph, lifecycle, Gate, task, worktree, Git, verification, or integration state.", verification: "Attempt every forbidden mutation through inputs, outputs, adapters, and replay and require fail-closed rejection." }),
  sourced({ id: "AC-QC-BENCHMARK-001", statement: "A live Windows Desktop benchmark runs the approved lifecycle across multiple worktrees and records first-pass verification, rework, duplicate prevention, review findings, cycle time, restart recovery, and acceptance evidence.", verification: "Run fresh packaged quick, standard, and assurance scenarios and verify exact receipts, code tests, independent review, traceability, integration, and business acceptance." }),
]);
addUniqueById(replacement.nonFunctionalRequirements, [
  sourced({ id: "NFR-QC-DETERMINISM-001", category: "reliability", statement: "Bindings, policy resolution, work identity, continuity decisions, reconciliation diagnostics, projections, and replay are deterministic for exact version-pinned inputs.", applicability: { level: "project" }, measure: "Canonical digest equality across repeated and reordered-input executions.", target: "100 percent equality for Core- and Module-owned artifacts.", priority: "must", acceptanceCriterionIds: ["AC-QC-COMPOSITION-001", "AC-QC-QUALITY-RESOLUTION-001", "AC-QC-WORK-IDENTITY-001", "AC-QC-CONTROL-SNAPSHOT-001"] }),
  sourced({ id: "NFR-QC-SCALE-001", category: "performance", statement: "Quality, identity, and control checks remain bounded as modules, work items, attempts, and graph facts grow.", applicability: { level: "project" }, measure: "p95 cross-cutting preflight and frontier reconciliation on the Windows reference host.", target: "At most 500 ms for 1,000 work items and 10,000 attempt records, excluding external providers.", priority: "must", acceptanceCriterionIds: ["AC-QC-QUALITY-RESOLUTION-001", "AC-QC-WORK-CONCURRENCY-001", "AC-QC-CONTROL-SNAPSHOT-001"] }),
  sourced({ id: "NFR-QC-SECURITY-001", category: "security", statement: "Cross-cutting Modules and adapters use least privilege, redact secrets, remain project-scoped, and never broaden task grants or network authority.", applicability: { level: "project" }, measure: "Grant, path, redaction, provider, and malicious-artifact matrices.", target: "Zero unauthorized effects or secret-bearing exported evidence.", priority: "must", acceptanceCriterionIds: ["AC-QC-COMPOSITION-001", "AC-QC-CONTROL-AUTHORITY-001"] }),
  sourced({ id: "NFR-QC-MODULARITY-001", category: "maintainability", statement: "QualityPolicy, WorkContinuity, and ProjectControl remain independently replaceable through provider-neutral ports without Module identity branches in Generic Core.", applicability: { level: "project" }, measure: "Replacement fixtures and Generic Core identifier scans.", target: "All reference Modules replaceable; zero identity-specific Core branches.", priority: "must", acceptanceCriterionIds: ["AC-QC-COMPOSITION-001", "AC-QC-CONTROL-AUTHORITY-001"] }),
  sourced({ id: "NFR-QC-RECOVERY-001", category: "reliability", statement: "Restart, interruption, partial persistence, and uncertain external effects preserve exact idempotency and require reconciliation rather than blind repetition.", applicability: { level: "project" }, measure: "Crash injection at every persistence boundary.", target: "Zero duplicate effects and 100 percent explicit recovery dispositions.", priority: "must", acceptanceCriterionIds: ["AC-QC-WORK-REUSE-001", "AC-QC-WORK-CONCURRENCY-001", "AC-QC-CONTROL-RECONCILIATION-001"] }),
]);
addUniqueById(replacement.constraints, [
  sourced({ id: "CON-QC-NO-STAGE-001", category: "business", statement: "The three new cross-cutting Modules do not alter the approved construction stage order or create an alternate progression authority.", rationale: "Cross-cutting governance must improve every stage without making the workflow longer or ambiguous.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-QC-COMPOSITION-001", "AC-QC-CONTROL-AUTHORITY-001"] }),
  sourced({ id: "CON-QC-EXACT-REUSE-001", category: "technical", statement: "Automatic reuse requires exact authority-bearing identity and checkpoint evidence; fuzzy similarity can only produce a review candidate.", rationale: "Semantic guesses cannot safely substitute implementation or verification evidence.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-QC-WORK-IDENTITY-001", "AC-QC-WORK-REUSE-001"] }),
]);
addUniqueById(replacement.scope, [
  sourced({ id: "SCOPE-QC-COMPOSITION-001", statement: "Generic declared composition for versioned cross-cutting Module operations at lifecycle boundaries." }),
  sourced({ id: "SCOPE-QC-QUALITY-001", statement: "QualityPolicy Module, Gate, artifacts, native deterministic resolver, optional policy-pack ports, and verification integrations." }),
  sourced({ id: "SCOPE-QC-CONTINUITY-001", statement: "WorkContinuity Module, exact work identity, durable attempt index, reuse decisions, concurrency control, and lineage." }),
  sourced({ id: "SCOPE-QC-CONTROL-001", statement: "ProjectControl Module, deterministic operator snapshot, authority reconciliation, diagnostics, and productivity assessment." }),
  sourced({ id: "SCOPE-QC-BENCHMARK-001", statement: "Fresh packaged Windows Desktop multi-worktree benchmark with code, tests, review, integration, traceability, recovery, and acceptance evidence." }),
]);
addUniqueById(replacement.nonGoals, [
  sourced({ id: "NG-QC-BUG-FREE-001", statement: "Claim that any policy, model, test suite, or orchestration system can guarantee defect-free software.", rationale: "DevRelay guarantees evidence and authority boundaries, not omniscient correctness." }),
  sourced({ id: "NG-QC-AUTO-SEMANTIC-REUSE-001", statement: "Automatically reuse work based only on model-assessed semantic similarity.", rationale: "Non-exact equivalence requires human review and fresh verification." }),
  sourced({ id: "NG-QC-SECOND-STATE-STORE-001", statement: "Make ProjectControl a second mutable source for roadmap, memory, graph, lifecycle, task, worktree, Git, or Gate state.", rationale: "A consolidated view must not create split-brain authority." }),
]);
addUniqueById(replacement.assumptions, [
  sourced({ id: "ASM-QC-PROFILES-001", statement: "Quick, standard, assurance, and inspect profiles remain the supported policy selectors; quick may defer expensive lanes only as explicit obligations and cannot bypass required gates.", status: "confirmed", blocking: false }),
  sourced({ id: "ASM-QC-HOST-001", statement: "The controlled release target remains GitHub source and an installable library operated through ChatGPT/Codex Desktop on Windows.", status: "confirmed", blocking: false }),
]);
replacement.dependencies = addUniqueStrings(replacement.dependencies, [
  "Approved ProjectMemory, TraceabilityGraph, lifecycle-run ledger, Desktop orchestration, and worktree lease artifacts.",
  "Existing WorkItemVerification, SystemVerification, ChangeIntegration, ReleaseVerification, and BusinessAcceptance authorities.",
]);
replacement.risks = addUniqueStrings(replacement.risks, [
  "A broad quality policy can become slow or ceremonial unless obligations are risk-scaled, evidence-bound, and measured.",
  "Work fingerprints can create unsafe false equivalence unless every authority-bearing input is included and semantic matches require review.",
  "A consolidated control view can create split-brain state if it is allowed to mutate or outlive its exact source references.",
]);
replacement.deliverables = addUniqueStrings(replacement.deliverables, [
  "QualityPolicy cross-cutting Module, Gate, native resolver, contracts, fixtures, and verification integrations.",
  "WorkContinuity cross-cutting Module, exact identity and reuse contracts, durable index, concurrency guard, and lineage evidence.",
  "ProjectControl cross-cutting Module, reconciliation diagnostics, operator projection, and productivity assessment.",
  "CrossCuttingModuleBinding contracts and generic full-chain Core preflight.",
  "Fresh packaged Windows Desktop multi-worktree benchmark and acceptance evidence.",
]);
replacement.requiredEvidence = addUniqueStrings(replacement.requiredEvidence, [
  "quality-policy/baseline-resolution-enforcement",
  "work-continuity/identity-reuse-concurrency-lineage",
  "project-control/reconciliation-authority-performance",
  "cross-cutting/composition-preflight-replay",
  "quality-continuity/windows-desktop-multi-worktree-e2e",
]);
replacement.currentStatus = sourced({ ...replacement.currentStatus, phase: "planning", summary: "QC-001 requirements are closed and approved for three cross-cutting semantic Modules—QualityPolicy, WorkContinuity, and ProjectControl—composed through generic declared boundaries without changing the construction lifecycle." });
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
  changeSetId: "requirements-change-set-qc-001-quality-continuity-v1",
  baseInputs: sourceRefs.filter(({ role }) => ["goal", "project-context", "repository-snapshot", "requirements-baseline", "project-overview-baseline"].includes(role)),
  baseline: previousRequirementsRef,
  expectedRequirementsDigest: canonicalJsonDigest(previousRequirements.requirements),
  replacement,
  changedSections,
  reason: "Add modular quality governance, exact work continuity, and reconciled operational control before the next product increment.",
  compatibilityImpact: "backward-compatible",
  risks: replacement.risks.filter((value) => /quality|fingerprint|control view|reuse/i.test(value)),
  requiredEvidence: replacement.requiredEvidence.filter((value) => /quality-policy|work-continuity|project-control|cross-cutting|quality-continuity/i.test(value)),
  sourceRefs,
};
validateRequirementsArtifact(changeSet);
const changeSetBytes = jsonBytes(changeSet);
const changeSetRef = pointer(changeSet.changeSetId, changeSetBytes);
const overview = deriveProjectOverview(replacement);
const markdownBytes = renderProjectOverviewMarkdownBytes(overview);
const markdownRef = pointer("project-overview-markdown-qc-001-quality-continuity-v1", markdownBytes);
const overviewChange = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewChangeSetDraft",
  changeSetId: "project-overview-change-set-qc-001-quality-continuity-v1",
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
  approvalId: "requirements-gate-approval-qc-001-quality-continuity-v1",
  authority: "project-owner",
  decision: "approve",
  source: { channel: "chat", statement: "Proceed", context: "After approving QualityPolicy, WorkContinuity, and ProjectControl as cross-cutting Modules with the exact authority and delivery boundaries." },
  approvedCandidate: { requirementsChangeSet: changeSetRef.digest, projectOverviewChangeSet: overviewChangeRef.digest, closure: sha256Digest(closureBytes) },
  authorizedActions: ["atomic-requirements-project-overview-promotion", "progress-to-architecture"],
  modificationPolicy: "Any material candidate change requires revalidation.",
});
const approvalBytes = jsonBytes(approval);
const approvalRef = pointer(approval.approvalId, approvalBytes);
const requirementsBaseline = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsBaseline",
  baselineId: "requirements-baseline-devrelay-v1-qc-001-quality-continuity-001",
  version: "2.7.0",
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
  baselineId: "project-overview-baseline-devrelay-v1-qc-001-quality-continuity-001",
  version: "2.7.0",
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
  proofId: "requirements-gate-promotion-qc-001-quality-continuity-v1",
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
  promotionId: "requirements-promotion-qc-001-quality-continuity-v1",
  state: "committed",
  previous: { requirementsBaseline: previousRequirementsRef, projectOverviewBaseline: previousOverviewRef },
  next: { requirementsBaseline: requirementsBaselineRef, projectOverviewBaseline: projectOverviewBaselineRef, projectOverviewMarkdown: markdownRef },
  approval: approvalRef,
  proof: pointer(proof.proofId, proofBytes),
};

await mkdir(output, { recursive: true });
await mkdir(new URL("history/2.6.0/", project), { recursive: true });
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
  writeFile(new URL("history/2.6.0/requirements-baseline.json", project), previousRequirementsBytes),
  writeFile(new URL("history/2.6.0/project-overview-baseline.json", project), previousOverviewBytes),
  writeFile(new URL("history/2.6.0/ProjectOverview.md", project), previousMarkdownBytes),
  writeFile(new URL("requirements-baseline.json", project), requirementsBaselineBytes),
  writeFile(new URL("project-overview-baseline.json", project), projectOverviewBaselineBytes),
  writeFile(new URL("ProjectOverview.md", root), markdownBytes),
  writeFile(new URL("requirements-promotion.commit.json", project), jsonBytes(promotionJournal)),
]);
process.stdout.write(`${JSON.stringify({ outcome: "promoted", requirementsBaseline: requirementsBaselineRef, projectOverviewBaseline: projectOverviewBaselineRef, changedSections }, null, 2)}\n`);
