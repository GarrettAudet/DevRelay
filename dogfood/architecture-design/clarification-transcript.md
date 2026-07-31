# ArchitectureDesign RequirementsGathering Transcript

This source preserves a semantically exact, normalized record of the
user-visible clarification exchange that replaced the invalid provisional
ArchitectureDesign requirements baseline. The original Codex task remains the
verbatim source; long answers below retain every contract decision while
omitting link metadata and repeated explanatory wording. The exchange used the
configured OpenSpec agent-command bridge; the OpenSpec CLI was not executed.

## Workflow instruction

**User (verbatim)**

> Proceed with the restart. Assume that, when I say use the module, use it with
> me as we would for the normal workflow

## Clarification 1: supported project states

**RequirementsGathering**

> Should the initial `ArchitectureDesign` contract support:
>
> 1. Both greenfield and existing projects, producing a complete scoped
>    `ArchitectureDraft` for either. Architecture change sets come later.
> 2. Greenfield drafts plus `ArchitectureChangeSet` for existing projects
>    immediately.
> 3. Only feature/change-level architecture for now.

**User (verbatim)**

> Answers:
> 1. Both, however, if there is an existing system, a required input is likely
> an architecture overview to feed into and then modify (open to approaches
> here to make optimal) as we will need that anyway for feature and
> change-level architecture

## Clarification 2: operation and plug-in structure

**RequirementsGathering**

> Do you approve a conditional `CurrentArchitecture` input and separate
> discovery fallback for an existing repository without an architecture
> baseline?

**User (normalized, semantically complete)**

> Keep one `ArchitectureDesign` module with two explicit operations:
>
> - `establish-baseline`
> - `design-change`
>
> Deterministic routing:
>
> - No architecture baseline → `establish-baseline` → `ArchitectureDraft` →
>   approval → `ArchitectureBaseline`.
> - Architecture baseline exists → `design-change` →
>   `ArchitectureChangeSetDraft` → approval → updated
>   `ArchitectureBaseline`.
>
> DevRelay should select the operation from project state, not let the AI
> decide.
>
> `establish-baseline` can use Spec Kit planning. `design-change` can use
> OpenSpec design capabilities. Both normalize into the same DevRelay
> architecture contract.
>
> An existing repository with no architecture baseline may first require an
> `ArchitectureDiscovery` capability to document the current system.
>
> One module, separate operations, shared contract. Separate greenfield and
> brownfield modules would duplicate logic and create an artificial boundary.
>
> Desired capability stack:
>
> - New-system architecture: Spec Kit planning.
> - Feature-level change: OpenSpec `design.md`.
> - Architecture model: LikeC4, with Structurizr as an alternative.
> - Decisions: MADR.
> - Interfaces: OpenAPI or AsyncAPI.
> - Architecture enforcement: language-specific tools such as
>   dependency-cruiser, Import Linter, ArchUnit, and NetArchTest.

## Clarification 3: canonical module definition

**RequirementsGathering**

> Should ArchitectureDesign keep interface contracts and enforcement
> downstream, or generate complete API contracts and enforcement rules itself?

**User (normalized, semantically complete)**

> Use this as the canonical definition:
>
> `ArchitectureDesign`
>
> Purpose: Convert approved requirements into either a new architecture
> baseline or a proposed change to an existing architecture.
>
> Operations:
>
> - `establish-baseline`
> - `design-change`
>
> Deterministic routing:
>
> - If no architecture baseline exists, use `establish-baseline` with
>   `SpecKitPlanAdapter`.
> - If an architecture baseline exists, use `design-change` with
>   `OpenSpecDesignAdapter`.
>
> Adapter sequence:
>
> - `designer`: SpecKitPlanAdapter for `establish-baseline`, or
>   OpenSpecDesignAdapter for `design-change`.
> - `modeler`: StructurizrAdapter, which materializes the architecture model
>   and diagrams.
> - `decision-recorder`: MADRAdapter, which records decisions, alternatives,
>   rationale, and consequences.
>
> DevRelay Core is not a configurable slot. It always selects the operation,
> selects the configured adapters, invokes them in sequence, normalizes their
> outputs, validates the resulting contract, and controls progression to the
> Architecture Gate.
>
> The module returns exactly one primary output:
>
> - `establish-baseline` → `ArchitectureDraft`
> - `design-change` → `ArchitectureChangeSetDraft`
>
> Supporting technical design, architecture model, diagrams, interface intent,
> architecture constraints, decision records, and native artifacts are fields
> or attachments within that primary output, not separate module outcomes.
>
> V1 defaults:
>
> - Designer: Spec Kit for baseline establishment and OpenSpec for
>   architectural changes.
> - Modeler: Structurizr.
> - Decision recorder: MADR.

## Clarification 4: discovery prerequisite and approval

**RequirementsGathering**

> For an existing repository with no `ArchitectureBaseline`, should DevRelay
> require `ArchitectureDiscovery → CurrentArchitectureSnapshot →
> ArchitectureDesign.establish-baseline`, while greenfield projects skip
> discovery?

**User (verbatim)**

> Alright build out that module then

The final response directly followed the discovery question and is recorded as
approval of the proposed prerequisite and authorization to progress through the
Requirements Gate. No unresolved blocking requirements remain.
