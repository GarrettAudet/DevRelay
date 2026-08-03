# WorkBreakdown RequirementsGathering Transcript

This source preserves a semantically exact, normalized record of the
user-visible clarification exchange used to define WorkBreakdown. The original
Codex task remains the verbatim conversational source; the normalized answers
below retain every approved contract decision. The exchange used the configured
OpenSpec agent-command bridge; the OpenSpec CLI was not executed.

## Initial request

**User (normalized, semantically complete; superseded where noted below)**

> Build the next module, WorkBreakdown, by using RequirementsGathering and
> ArchitectureDesign. It receives approved requirements, architecture,
> ProjectOverview, optional contract and repository context, and emits work-item
> drafts, clarification controls, native artifacts, or diagnostics. Its initial
> outcomes are decomposed, needs-clarification, and unable-to-proceed. Each work
> item carries identity, objective, work type, scope, requirement, story,
> acceptance-criterion, architecture and contract references, deliverables,
> verification plan, and required evidence. Spec Kit establishes an initial
> breakdown and OpenSpec decomposes an approved change.

## Clarification 1: deterministic operations and adapter selection

**RequirementsGathering**

> Approve no WorkBreakdownBaseline selecting establish-breakdown and an existing
> baseline plus approved architecture change selecting decompose-change, with
> Spec Kit and OpenSpec as the respective adapters?

**User (normalized, semantically complete)**

> Approve with one correction: operations must never be permanently coupled to
> a product adapter. No WorkBreakdownBaseline selects establish-breakdown and a
> configured WorkBreakdownAdapter; Spec Kit is the default for greenfield and
> OpenSpec the default for an existing system. Existing WorkBreakdownBaseline
> plus ApprovedChangePackage selects decompose-change and a configured adapter,
> OpenSpec by default. ApprovedChangePackage includes the approved requirements
> change, architecture change, contract change when applicable, and relevant
> TraceabilityGraph references. Existing projects without a work baseline use
> establish-breakdown and do not reconstruct historical work. Replace the
> generic previous-draft input with explicit ClarificationContinuation and
> RevisionRequest artifacts.

## Clarification 2: exact inputs and drift

**RequirementsGathering**

> Approve exact establish and change input sets, explicit not-applicable contract
> disposition, full current baselines, and immutable graph references?

**User (normalized, semantically complete)**

> Approve with refinements. Establish-breakdown receives requirements-baseline,
> project-overview, architecture-baseline, a ContractBaseline or
> ApprovedNotApplicable contract disposition, and a RepositorySnapshot or
> ApprovedNotApplicable repository context. Decompose-change receives the exact
> current project baselines, current-work-breakdown-baseline,
> approved-change-package, and current-repository-snapshot. Rename previous to
> current so no stale version is implied. Pin every baseline and repository
> snapshot to an artifact version, content hash, or commit. Current baselines
> describe the approved current system; ApprovedChangePackage defines the
> authorized delta; WorkBreakdownBaseline describes existing planned work; and
> RepositorySnapshot reflects actual implementation state. Return baseline-drift
> when supplied baselines or repository commit no longer match the versions in
> the approved change package.

## Clarification 3: adapter and graph trust boundary

**RequirementsGathering**

> Should the adapter author TraceabilityUpdateSet directly, or should a trusted
> contributor derive it from a validated domain draft?

**User (normalized, semantically complete)**

> Use the stronger trust boundary. The adapter returns WorkBreakdownDraft with
> typed domain references. DevRelay validates the draft. A trusted
> WorkBreakdownTraceabilityContributor deterministically derives graph updates.
> Core validates and atomically merges them. ModuleExecutionRecord stores the
> merge proof. The adapter may declare only requirement, acceptance-criterion,
> architecture, and contract references. It cannot create nodes, choose arbitrary
> relationships, or submit graph operations. The proof binds execution, graph
> version, exact update digest, checkpoint, merge receipt, and result snapshot.

## Clarification 4: planned edge direction

**RequirementsGathering**

> Approve one upstream-to-downstream graph direction with no stored inverse
> edges?

**User (normalized, semantically complete)**

> Approve, but planning must not imply completion. Use AcceptanceCriterion to
> planned-by to WorkItem, ArchitectureElement to implementation-planned-by to
> WorkItem, and Contract to realization-planned-by to WorkItem. Later execution
> and verification modules add WorkItem to produces to ChangeSet,
> ArchitectureElement to implemented-by to ChangeSet, Contract to realized-by to
> ChangeSet, and AcceptanceCriterion to verified-by to Evidence. WorkBreakdown
> emits only the planning edges and stores no inverse edges.

## Clarification 5: work-item and gate boundary

**RequirementsGathering**

> Approve dependency references, provider-neutral capabilities, provenance, and
> mandatory coverage dispositions while leaving assignment and execution
> downstream?

**User (normalized, semantically complete)**

> Approve with one boundary correction: WorkBreakdown proposes dependency-hints;
> WorkDependencyAnalysis later owns the validated authoritative DAG and rejects
> cycles, missing dependencies, and impossible ordering. A WorkItemDraft carries
> required-capabilities from a pinned provider-neutral catalog, validated
> source-refs, and proposed dependency-hints. Mandatory coverage dispositions are
> planned with linked work items, already-satisfied with rationale and current
> evidence, or no-work-required with rationale and explicit approval.
> WorkBreakdownGate rejects unscoped work, uncovered authorized changes, and
> invalid source or traceability references. Assignment, ownership, estimates,
> scheduling, status, and produced changes stay downstream.

## Final WorkBreakdown clarification: primary purpose and output boundary

**User (normalized, semantically complete)**

> WorkBreakdown primarily splits approved scope into discrete, independently
> executable and verifiable actions. Each work item defines objective,
> bounded-scope, deliverables, work-type, acceptance-criterion, architecture and
> contract references, required-capabilities, dependency-hints, and source-refs.
> Coverage dispositions, hints, capabilities, and source references are control
> data supporting that purpose. WorkBreakdown defines actions;
> WorkDependencyAnalysis orders them; SpecialistAssignment chooses who or what
> executes; WorkExecution performs them; Verification proves completion. State
> the purpose simply: convert approved scope into a complete set of bounded,
> traceable, independently executable work items. WorkBreakdown must not execute
> or build code.

## Final contract normalization

The approved WorkItemDraft identity, verification-plan, and required-evidence
fields are retained because later modules and TraceabilityGraph require them.
The provisional activity-oriented work-type vocabulary is superseded by this
closed, deliverable-oriented V1 vocabulary:

- code-change
- configuration-change
- documentation-change
- infrastructure-change
- migration
- operational-readiness
- test-change

No blocking clarification remains. The requirements may progress to the paired
Requirements Gate and then ArchitectureDesign.

## Latest confirmation: authoritative fields and architecture delta

The following confirmation occurred after the RequirementsGathering field
boundary was clarified. Its field correction is incorporated into the
requirements candidate. Its change-set delta choice is preserved explicitly as
an ArchitectureDesign decision and is not attributed to RequirementsGathering.

**User (normalized, semantically complete)**

> The final authoritative WorkItemDraft fields are only: id, objective,
> bounded-scope, deliverables, work-type, acceptance-criterion-refs,
> architecture-refs, contract-refs, required-capabilities, dependency-hints,
> verification-plan, required-evidence, and source-refs. Remove direct
> requirement-refs and user-story-refs; upstream requirements and stories remain
> traceable transitively through acceptance-criterion-refs. I also approve a
> typed add, update, and retire delta for WorkBreakdownChangeSetDraft. Treat the
> exact delta representation as an ArchitectureDesign decision; it is not a
> RequirementsGathering behavior or schema decision.
