# SpecialistAssignment

SpecialistAssignment converts the complete approved work plan into one complete provider-neutral assignment candidate. It does not schedule work, calculate readiness, bind a concrete runtime, communicate with agents, execute work, or modify the dependency DAG.

## Deterministic flow

    WorkBreakdownBaseline + WorkDependencyBaseline
    + CapabilityCatalog + SpecialistCatalog + AssignmentPolicy
    + ProjectOverview + RepositoryContext
      -> configured profile sources
      -> Core eligibility
      -> configured ranker over exact eligible sets
      -> Core candidate assembly
      -> exact checkpoint replay
      -> SpecialistAssignmentGate
      -> SpecialistAssignmentBaseline

The module has one operation: assign-specialists. Every approved work item must receive exactly one eligible profile. If any work item has no eligible profile, the entire execution returns needs_clarification; partial assignment drafts cannot progress.

## Authority

CapabilityCatalog owns intrinsic capability-to-tool and capability-to-grant requirements. AssignmentPolicy may add project-specific requirements or deny profiles. SpecialistCatalog declares what each provider-neutral profile possesses. Core computes eligibility and records every exclusion reason. A replaceable ranker receives only exact eligible profile IDs, and Core rejects missing, extra, duplicate, stale, or ineligible selections.

The default ranker orders candidates by explicit policy priority and then lexical profile ID. A ranker cannot expand the eligible set or approve a candidate.

## Profile sources

The native file-based catalog is the offline default. A2AProfileAdapter is the first external binding. It imports an exact A2A 1.0 Agent Card and requires explicit A2A-skill-to-DevRelay-capability mappings. Descriptions and tags are never authoritative. The adapter is fixture-conformant; live endpoint discovery and task communication are deferred to WorkExecution.

## Traceability

The trusted candidate contributor adds:

    WorkItem -> proposed-assignment -> SpecialistProfile

After exact Gate promotion, a separate approved contributor adds:

    WorkItem -> assigned-to -> SpecialistProfile

Candidate and approved facts use separate scopes and coexist in TraceabilityGraph. Adapters cannot author graph operations.

## Evidence and replay

The checkpoint binds all input baselines, catalogs, policy, the configured ranker identity, Core eligibility, ranker selections, and exact candidate bytes. Replay validates all stored bytes and performs zero ranker calls. Gate promotion requires an approval bound to the exact candidate ArtifactRef and canonical raw bytes.
## Versioned Gate authority

`specialist-assignment@1.0.0` is retained as an immutable compatibility manifest. Its legacy promotion helper accepts a caller-supplied draft and is not the trusted release route.

`specialist-assignment@2.0.0` requires the in-process receipt returned by `verifyCheckpointedExecution`. The Gate derives the only promotable draft and its raw bytes from the validated checkpoint, requires content-addressed owner approval bound to the checkpoint digest and execution fingerprint, and creates the baseline itself. Plain results, cloned receipts, serialized receipts, changed input closure, and replay requiring another ranker call fail closed.
