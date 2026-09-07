# QC-001 architecture change

Status: **Architecture Gate approved**

QC-001 adds three independently versioned, cross-cutting Modules around the released construction lifecycle. They are not new lifecycle stages. Generic Core resolves declared, exact-version bindings at named lifecycle boundaries, validates their ports and dependency order, and invokes them without branching on a Module, operation, adapter, or product identity.

## Composition model

`CrossCuttingModuleBinding` declares an exact Module and operation version, boundary, input and output port mappings, configuration digest, grant digest, dependency IDs, failure behavior, and enabled state. The supported boundaries are `session-start`, `before-work-planning`, `before-task-dispatch`, `after-work-execution`, `before-integration`, `frontier-complete`, and `session-conclusion`.

Core validates the entire enabled binding set before execution, rejects duplicate IDs, missing dependencies, cycles, unknown boundaries, ambiguous output producers, undeclared ports, and configuration or grant drift. Resolution order is boundary order followed by dependency order and stable binding ID. Boundary inputs are explicit artifacts; no ambient prompt, transcript, provider cache, or undeclared plug-in hook is input authority.

## QualityPolicy Module

QualityPolicy establishes and evolves a project-wide quality policy baseline, then resolves exact work-item obligations from the approved policy, workflow profile, risk context, changed surfaces, technology evidence, and acceptance criteria. A resolution identifies required verification lanes, evidence kinds, independence constraints, thresholds, waivers, deferred obligations, and source references.

QualityPolicy owns policy candidates, approved policy baselines, and deterministic obligation resolution. It cannot approve work. WorkItemVerification, SystemVerification, ChangeIntegration, and BusinessAcceptance keep their existing authority and fail closed when required obligations or evidence are missing, stale, downgraded, or waived without the declared authority.

## WorkContinuity Module

WorkContinuity derives a collision-resistant fingerprint from the exact project, approved baselines, work item, target revision, dependency closure, assignment contract, resolved quality obligations, declared inputs, and implementation configuration. It records durable attempts, leases, outcomes, evidence, and artifact references under compare-and-swap revisions.

Exact fingerprints may produce automatic reuse only after identity, receipt, result, evidence, revision, and policy revalidation. Similarity may produce a candidate for owner review but never automatic reuse. Concurrent claims use one exact lease identity; expired, prepared, dispatched, or uncertain external effects require reconciliation instead of repetition. Historical records are superseded or retired, never silently overwritten.

## ProjectControl Module

ProjectControl projects an immutable, read-only snapshot from canonical lifecycle, DAG, assignment, task, worktree, quality, continuity, verification, traceability, roadmap, and memory references. It reports current phase, frontier, blockers, evidence gaps, dependency health, reuse, throughput, rework, and benchmark measurements with exact source references.

ProjectControl reconciles inconsistent observations into explicit diagnostics. It cannot mutate lifecycle state, select work, promote memory, activate graph facts, approve a gate, or authorize integration. LifecycleRunReport may embed its snapshot and benchmark assessment as a reporting projection.

## Integration ports

- Workflow profile resolution emits an optional `quality-policy-selection` reference.
- WorkBreakdown and WorkDependencyAnalysis accept continuity identity inputs and emit stable work/dependency material for fingerprinting.
- SpecialistAssignment emits exact assignment material consumed by the fingerprint.
- DesktopTaskPlan binds the exact quality resolution and continuity decision digests alongside its mandatory ProjectMemory context.
- WorkExecution emits attempt and output observations for WorkContinuity.
- WorkItemVerification and SystemVerification consume the exact quality resolution and report obligation coverage without transferring gate authority.
- ChangeIntegration consumes only verified continuity and quality receipts and retains its existing integration authority.
- LifecycleRunReport may consume a ProjectControl snapshot and productivity assessment.

Existing exact Module versions remain immutable. New optional ports appear only in new Module versions; compatibility fixtures prove old versions continue to validate and execute unchanged.

## Traceability and persistence

Trusted, versioned contributors project only schema-validated QC-001 artifacts in declared candidate or approved scopes. Adapters never receive the graph service and never submit graph operations. Approval gates alone activate approved policy facts. ProjectControl and WorkContinuity stores are reference implementations; durable atomic host persistence remains an explicit host responsibility.

## Failure and recovery

All derived artifacts are canonical-digest bound. Any baseline, configuration, grant, revision, checkpoint, or evidence drift fails closed. Prepared external effects are checkpointed before execution, and replay reuses the exact checkpoint. Restart reconciliation distinguishes safe reuse, resume, retry, quarantine, and owner decision. No failure path silently downgrades quality or repeats an uncertain effect.

## Scale and benchmark

Resolution is deterministic over sorted inputs. Index lookups target logarithmic or constant-time host operations; graph validation is linear in bindings plus dependency edges. Acceptance includes a repeatable local benchmark covering at least 10,000 continuity records, 1,000 project-control observations, and 100 cross-cutting bindings, recording p50/p95 duration and exact environment metadata without converting local results into universal performance claims.

## Gate findings

- PASS: all twelve QC-001 acceptance criteria and five non-functional requirements are allocated to explicit components and authorities.
- PASS: the released construction-stage sequence is unchanged.
- PASS: Generic Core composition is identity-neutral and preflights the complete enabled binding graph.
- PASS: exact-only automatic reuse prevents fuzzy or stale work from becoming completion authority.
- PASS: quality obligations are enforceable by existing verification and acceptance authorities.
- PASS: ProjectControl is a read-only projection, not a second mutable source of truth.
- PASS: candidate and approved trace scopes remain distinct and adapters receive no graph authority.
