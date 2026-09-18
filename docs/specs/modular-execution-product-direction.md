# Modular execution and harness optimization: product direction intake

Date: 2026-09-18
Status: candidate intake; owner direction captured; detailed requirements and architecture remain proposed.
Task: compare-meta-harness-zeroshot-20260918

## Owner direction

The owner wants DevRelay to be a modular software-execution product comparable
to Zeroshot, with interchangeable module configurations and Meta-Harness used
to improve sub-agent execution.

The owner selected this first-version customization scope in chat:

> Ready-made workflows with swappable modules and agent configurations (recommended)

This establishes the product direction and initial customization surface. It
does not establish an approved replacement RequirementsBaseline, architecture,
roadmap priority, optimizer policy, integration, or release acceptance.

The owner subsequently requested Zeroshot as the implementation tool and chose
to keep the existing Codex Desktop on Windows requirement for DevRelay's first
version. A Linux environment needed by the construction tool would not expand
DevRelay's supported product platforms. The optimization activation choice
(explicit experiment and review versus automatic policy-based activation)
remains awaiting the owner's answer.

## Proposed product promise

Choose a ready-made engineering workflow, configure its compatible modules and
agents, describe the work, and receive verified results. Repeated execution
provides evidence for Meta-Harness experiments that improve future sub-agent
strategies. DevRelay retains deterministic orchestration and explicit authority
while the user operates a compact execution product.

The primary experience should expose the selected workflow, configurable roles,
progress, decisions needing attention, results, and measured execution quality.
Exact artifacts and provenance should be expandable supporting evidence.

## Proposed configuration layers

| Layer | Responsibility | Configurable surface |
| --- | --- | --- |
| Workflow preset | Compose a supported engineering workflow and its obligations | Start with an existing-project software-change preset; add other presets after proving the first |
| Semantic Module | Define an engineering capability, typed ports, outcomes, and steps | Select exact compatible Module versions for declared preset slots |
| Implementation plug-in | Implement one exact Module operation or step | Choose an available, validated adapter and its explicit configuration |
| Agent execution configuration | Specify how a worker performs its assigned work | Pin the executor, provider/model where supported, harness, context strategy, declared tools, and budgets |
| Core and owning Gates | Validate composition, derive routes, enforce grants, checkpoint, and approve progression | Apply explicit policy; configuration never silently replaces this authority |

Module substitution and adapter substitution are distinct. A different
implementation of the same capability usually belongs behind the existing
Module contract. Replacing a semantic Module requires compatible inputs,
outputs, downstream obligations, and trusted traceability support.

Resolve and validate the complete selected configuration before effects. Store
its exact versions and digests with the run. Configuration changes take effect
at a declared new-run or migration boundary; an active run cannot silently
switch to a new harness or adapter.

Preset selection does not authorize arbitrary stage deletion, reordered
contracts, or bypassed Gates. Conditional routing and reuse of current approved
artifacts must follow explicit supported contracts. Additional composition
semantics require versioned design and conformance work.

## Proposed Meta-Harness integration

Use the upstream Meta-Harness approach and implementation where compatible,
behind an explicit replaceable optimizer binding. Its current Python examples
and Claude Code proposer wrapper are implementation dependencies to assess;
they are not an already working DevRelay/Desktop integration.

Two loops have separate responsibilities:

1. Execution: a pinned workflow runs agents, gathers independent verification,
   performs bounded repair, and reaches the existing acceptance boundaries.
2. Optimization: eligible completed-run traces and benchmark tasks inform
   candidate harness changes; independent evaluation determines whether a
   candidate qualifies for promotion into a future execution configuration.

Start with one bounded worker role, preferably coding-worker context selection
and task preparation. Proposed mutable behavior includes retrieval ranking,
context construction, prompt templates, and tool-use strategy within the
already declared capabilities. Freeze the base model for the initial experiment
so harness gains can be distinguished from model changes.

The optimizer cannot edit evaluation criteria, held-out tests, required reviews,
Module contracts, permissions, approvals, or its own promotion policy. It cannot
change the authoritative ProjectMemory baseline. Candidate code runs in an
isolated evaluation environment under explicit host grants and resource limits.

Preserve candidate source, exact model/configuration identity, task inputs,
scores, raw permitted diagnostic traces, and evaluator versions. Summaries aid
navigation but do not replace the diagnostic evidence. Trace eligibility and
external transmission must honor existing data and capability boundaries.

Keep search tasks separate from held-out evaluation by project or task family
where possible. Compare the current and candidate harness under comparable
budgets and repeated trials when evaluation is noisy. Acceptance quality and
authority compliance are required conditions; token cost or speed cannot
compensate for failed mandatory checks. Promote a new immutable version only
after the owning verification and approval process. Preserve the prior version
for future-run rollback.

Optimization cadence, exact budget, evaluator ownership, promotion thresholds,
and approval policy remain open detailed requirements. The proposed initial
mode is an explicitly started, bounded experiment between execution runs.

## Fit with current DevRelay

Existing Module and plug-in contracts already separate semantics from exact
implementation bindings, configuration, grants, and immutable invocation
inputs. SpecialistAssignment owns capability eligibility and profile selection;
execution binding and harness operation belong to the execution boundary.

Current quick, standard, assurance, and inspect profiles are fixed policy
profiles. `resolveWorkflowProfile` rejects requested overrides. They are not
already a customizable workflow-preset catalog; evolve configuration through
versioned contracts rather than relabeling current behavior.

Current status records rc.3 as published and rc.4 as incomplete. The composed
Desktop execution workflow, lifecycle reconciliation, host recovery, operator
latency, and installed-product acceptance still need completion. A new product
direction does not turn those component proofs into end-to-end acceptance.

## Proposed first demonstration

1. An existing-project software-change preset executes real approved work
   through implementation, independent verification, integration, and acceptance.
2. The same supported workflow accepts two compatible execution configurations
   without changes to Generic Core or loss of evidence and recovery guarantees.
3. Incompatible configuration is rejected before dispatch, and restart resumes
   the pinned configuration without repeating checkpointed effects.
4. A bounded Meta-Harness experiment produces and evaluates candidate worker
   strategies on separate search and held-out tasks.
5. A qualifying candidate becomes a new pinned configuration for subsequent
   runs. A non-qualifying candidate leaves the current configuration active.

Measure verified task completion, escaped defects, human intervention time,
elapsed time, and observed resource cost. Record unknown measurements as
unknown. A valid optimization experiment may find no improvement; do not
manufacture an improvement claim to complete the demonstration.

These are proposed acceptance targets for requirements intake. Implementation
must first evolve the current paired requirements/overview baseline through
its existing change lineage, then use the normal downstream lifecycle.

## Sources and continuity

- Owner messages in this task establish the desired product direction and the selected customization scope.
- [Module contract](../module-contract.md)
- [Current workflow-profile implementation](../../src/workflow-profiles.mjs)
- [SpecialistAssignment](../specialist-assignment.md)
- [Current implementation status](../../CURRENT_STATUS.md)
- [Runtime dogfood reconciliation](runtime-dogfood-reconciliation.md)
- [Zeroshot execution model](https://github.com/the-open-engine/zeroshot/blob/main/docs/concepts/execution.md)
- [Meta-Harness](https://github.com/stanford-iris-lab/meta-harness)
- [Meta-Harness onboarding and evaluation requirements](https://github.com/stanford-iris-lab/meta-harness/blob/main/ONBOARDING.md)

Bootstrap receipt: DPMBR-970CF851603A9370, outcome pass.
ProjectMemory baseline: PMB-MUC-7A172C974C0158E7.
Baseline digest: sha256:47eddea9836521b0b1557782740121feab15d5fbc9ad6556654172b0334a57e4.
Synopsis digest: sha256:4d1ec4b933d0736cb2d7ad568816788d50bcbc5dd018e7a95cce51fd83e6caab.
Graph checkpoint digest: sha256:1207f84ad9e7ea077f59f4a4d8731c31feb0b9e0ee8c22a75a02600e7d8dccee.
The inspected prior ProjectMemory session was concluded. This document is
candidate intake for later owning-Gate processing, not a memory promotion or
a managed-task dispatch receipt.
