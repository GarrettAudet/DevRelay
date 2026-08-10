const uniq = (...values) => [...new Set(values.flat())];
function element({ id, name, type, parentId, description, responsibilities, requirementIds, tags }) {
  return { id, name, type, ...(parentId ? { parentId } : {}), description,
    technology: type === "software-system" ? "" : "Provider-neutral DevRelay integration",
    responsibilities, tags, properties: {}, sourceRequirementIds: uniq(requirementIds), sourceRefs: [] };
}
const component = (id, name, parentId, description, responsibilities, requirementIds, tags = []) =>
  element({ id, name, type: "component", parentId, description, responsibilities, requirementIds, tags: ["Component", ...tags] });
const relationship = (id, sourceElementId, targetElementId, description, requirementIds) => ({
  id, sourceElementId, targetElementId, description, interactionStyle: "synchronous", tags: [], sourceRequirementIds: uniq(requirementIds), sourceRefs: [],
});
function interfaceIntent({ id, name, provider, consumers, inputs, outputs, requirementIds, failure, security }) {
  return { id, name, purpose: name, ownerBoundary: provider, providerElementId: provider, consumerElementIds: consumers,
    interactionStyle: "synchronous", semanticInputs: inputs, semanticOutputs: outputs,
    protocolConstraints: ["Exact artifact versions, raw bytes, SHA-256 digests, and Git object identities", "One verified work-item change and one configured target ref per invocation", "Closed integration, conflict, drift, recovery, and progression semantics"],
    failureBehavior: failure,
    compatibilityObligations: ["Stable provider-neutral behavior across compatible hosts and repository adapters", "Unknown fields, policies, adapter versions, target states, or outcome values fail closed"],
    securityPrivacyIntent: security,
    deliveryConsistencyIntent: ["Validate exact canonical inputs before integration authority", "Preserve pre-state, verified subject, native effect, post-state, checkpoint, and graph lineage"],
    contractGeneration: { required: true, suggestedKinds: ["json-schema"] }, sourceRequirementIds: uniq(requirementIds), sourceRefs: [] };
}
const archConstraint = (id, category, statement, appliesTo, requirementIds) => ({
  id, category, strength: "must", statement, rationale: statement, appliesTo,
  verificationIntent: "Dedicated positive, negative, drift, conflict, atomicity, recovery, replay, authority, and traceability conformance fixtures.",
  sourceRequirementIds: uniq(requirementIds), sourceRefs: [],
});

export function buildChangeIntegrationArchitecture({ architectureBaseline, requirements }) {
  const CG = Object.freeze({
    integrate: "US-DEV-CHANGE-INTEGRATION-001",
    atomicity: "NFR-DEV-CI-ATOMICITY-001",
    auditability: "NFR-DEV-CI-AUDITABILITY-001",
    idempotency: "NFR-DEV-CI-IDEMPOTENCY-001",
    localGit: "CON-DEV-CI-LOCAL-GIT-001",
    cas: "CON-DEV-CI-CAS-001",
    noAutoResolve: "CON-DEV-CI-NO-AUTO-RESOLVE-001",
    host: "CON-DEV-CI-HOST-ENFORCEMENT-001",
    noSystemAcceptance: "CON-DEV-CI-NO-SYSTEM-ACCEPTANCE-001",
  });
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missing = Object.values(CG).filter((id) => !declaredIds.has(id));
  if (missing.length) throw new Error("ChangeIntegration architecture drivers are absent from approved requirements: " + missing.join(", "));
  const allNormativeIds = [...declaredIds];
  const baseSections = architectureBaseline.sections;
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-CHANGE-INTEGRATION-008";

  model.elements.push(
    element({ id: "EL-CI-MODULE", name: "ChangeIntegration", type: "container", parentId: "EL-DEVRELAY-SYSTEM",
      description: "Incorporates one exactly verified work-item change into one configured local Git target without system-verification or business-acceptance authority.",
      responsibilities: ["Invoke one configured integration adapter through a provider-neutral port", "Return native effect observations and conflict evidence", "Never choose scope, alter verified bytes, approve verification, or author graph operations"],
      requirementIds: Object.values(CG), tags: ["Container", "LifecycleModule", "ChangeIntegration"] }),
    component("EL-CI-INTEGRATION-PORT", "Integration Adapter Port", "EL-CI-MODULE", "Provider-neutral boundary for one bounded repository integration effect.", ["Receive one Core-authorized integration plan and declarative grant set", "Return exact native Git observations, conflict evidence, diagnostics, and post-state claims"], [CG.integrate, CG.localGit, CG.host], ["AdapterPort", "ChangeIntegration"]),
    component("EL-CI-LOCAL-GIT-ADAPTER", "Local Git Integration Adapter", "EL-CI-MODULE", "V1 adapter that applies one verified change and conditionally updates one configured local Git ref.", ["Use the exact expected target commit and verified change bytes", "Perform an atomic conditional ref update or return no-mutation conflict/failure evidence"], [CG.integrate, CG.atomicity, CG.localGit, CG.cas, CG.noAutoResolve], ["AdapterBinding", "Git"]),
    component("EL-CI-INPUT-GUARD", "Integration Input Guard", "EL-DEVRELAY-CORE", "Binds one approved WorkItemVerification result, verified change, target snapshot, target ref, expected commit, policy, baselines, and grants.", ["Reject absent, duplicate, substituted, stale, cross-item, or over-authorized inputs", "Forbid adapter-authored approval, scope, system-verification, or business-acceptance claims"], [CG.integrate, CG.cas, CG.noSystemAcceptance], ["CoreAuthority", "ChangeIntegration"]),
    component("EL-CI-PLAN-BUILDER", "Integration Plan Builder", "EL-DEVRELAY-CORE", "Builds a deterministic immutable plan for one verified change and one target transition.", ["Pin pre-state, verified bytes, target ref, expected parent, integration policy, adapter binding, and idempotency identity", "Produce the only invocation payload permitted at the adapter port"], [CG.integrate, CG.auditability, CG.idempotency], ["CoreAuthority", "Planning"]),
    component("EL-CI-CAS-COORDINATOR", "Target Ref Compare-and-Swap Coordinator", "EL-DEVRELAY-CORE", "Owns target-state authority and requires an atomic conditional ref update through the host boundary.", ["Reject observed target mismatch before adapter mutation", "Require the adapter effect to prove expected pre-state and exactly one conditional transition"], [CG.atomicity, CG.cas, CG.localGit], ["CoreAuthority", "Concurrency"]),
    component("EL-CI-CHECKPOINT", "Integration Checkpoint Controller", "EL-DEVRELAY-CORE", "Persists prepared plans and native effect receipts and recovers uncertain effects without duplicate mutation.", ["Bind checkpoints to invocation, target pre-state, adapter, and idempotency identity", "Replay completed effects with zero adapter calls and reconcile crash-after-effect observations"], [CG.idempotency, CG.auditability, CG.atomicity], ["CoreAuthority", "Checkpoint"]),
    component("EL-CI-RESULT-VALIDATOR", "Integration Result Validator", "EL-DEVRELAY-CORE", "Normalizes adapter observations into closed canonical integration outcomes.", ["Prove post-state parentage, tree, ref, verified-change identity, and no-mutation failures", "Create IntegratedChangeRecord, updated RepositorySnapshot, IntegrationConflictSet, or closed diagnostic outcome"], [CG.integrate, CG.atomicity, CG.auditability, CG.noAutoResolve, CG.noSystemAcceptance], ["CoreAuthority", "Validation"]),
    component("EL-CI-TRACEABILITY", "Integrated Change Traceability Contributor", "EL-DEVRELAY-GRAPH", "Projects factual integration relationships only from a validated IntegratedChangeRecord.", ["Link WorkItem and ChangeSet to the exact integrated change", "Link architecture and contract elements to the resulting change without claiming system verification or business acceptance"], [CG.integrate, CG.auditability, CG.noSystemAcceptance], ["TraceabilityContributor", "Approved"]),
  );

  const rels = [
    ["REL-CI-GUARD-PLAN", "EL-CI-INPUT-GUARD", "EL-CI-PLAN-BUILDER", "Releases one exact approved verification subject for deterministic integration planning.", [CG.integrate, CG.auditability]],
    ["REL-CI-PLAN-CAS", "EL-CI-PLAN-BUILDER", "EL-CI-CAS-COORDINATOR", "Supplies the exact target ref, expected commit, policy, and idempotency identity.", [CG.atomicity, CG.cas, CG.idempotency]],
    ["REL-CI-CAS-PORT", "EL-CI-CAS-COORDINATOR", "EL-CI-INTEGRATION-PORT", "Authorizes one bounded conditional integration attempt only when target pre-state matches.", [CG.atomicity, CG.cas, CG.host]],
    ["REL-CI-PORT-GIT", "EL-CI-INTEGRATION-PORT", "EL-CI-LOCAL-GIT-ADAPTER", "Invokes the configured local Git integration capability.", [CG.integrate, CG.localGit]],
    ["REL-CI-PORT-CHECKPOINT", "EL-CI-INTEGRATION-PORT", "EL-CI-CHECKPOINT", "Persists exact effect observations before canonical success or failure projection.", [CG.auditability, CG.idempotency]],
    ["REL-CI-CHECKPOINT-VALIDATOR", "EL-CI-CHECKPOINT", "EL-CI-RESULT-VALIDATOR", "Supplies replay-verified native observations for closed outcome validation.", [CG.atomicity, CG.auditability, CG.idempotency]],
    ["REL-CI-VALIDATOR-TRACE", "EL-CI-RESULT-VALIDATOR", "EL-CI-TRACEABILITY", "Supplies only a validated factual integrated-change record for atomic graph projection.", [CG.integrate, CG.auditability, CG.noSystemAcceptance]],
  ];
  model.relationships.push(...rels.map(([id, source, target, description, ids]) => relationship(id, source, target, description, ids)));

  const viewFor = ({ viewKey, type, title, purpose, audience, scopeElementId, elementIds }) => {
    const included = new Set(elementIds);
    return { viewKey, type, title, purpose, audience, scopeElementId, elementIds,
      relationshipIds: model.relationships.filter(({ sourceElementId, targetElementId }) => included.has(sourceElementId) && included.has(targetElementId)).map(({ id }) => id) };
  };
  const priorViews = baseSections.diagrams.content.views.map(({ renderings: _renderings, ...view }) => structuredClone(view));
  const diagramViewSpecs = [
    ...priorViews,
    viewFor({ viewKey: "VIEW-CI-CONTAINERS", type: "container", title: "DevRelay ChangeIntegration containers", purpose: "Show ChangeIntegration beside Generic Core and TraceabilityGraph.", audience: ["engineering", "architecture", "workflow-authors"], scopeElementId: "EL-DEVRELAY-SYSTEM", elementIds: model.elements.filter(({ type, parentId }) => type === "container" && parentId === "EL-DEVRELAY-SYSTEM").map(({ id }) => id) }),
    viewFor({ viewKey: "VIEW-CI-CORE-COMPONENTS", type: "component", title: "Generic Core integration authority", purpose: "Show exact input binding, planning, compare-and-swap, checkpoint, and result-validation authority.", audience: ["engineering", "architecture", "security"], scopeElementId: "EL-DEVRELAY-CORE", elementIds: ["EL-CI-INPUT-GUARD", "EL-CI-PLAN-BUILDER", "EL-CI-CAS-COORDINATOR", "EL-CI-CHECKPOINT", "EL-CI-RESULT-VALIDATOR"] }),
    viewFor({ viewKey: "VIEW-CI-MODULE-COMPONENTS", type: "component", title: "ChangeIntegration adapter boundary", purpose: "Show the provider-neutral integration port and V1 local Git binding.", audience: ["engineering", "adapter-authors"], scopeElementId: "EL-CI-MODULE", elementIds: ["EL-CI-INTEGRATION-PORT", "EL-CI-LOCAL-GIT-ADAPTER"] }),
    viewFor({ viewKey: "VIEW-CI-TRACEABILITY-COMPONENTS", type: "component", title: "Integrated-change traceability", purpose: "Show factual post-integration graph projection without downstream acceptance claims.", audience: ["engineering", "audit"], scopeElementId: "EL-DEVRELAY-GRAPH", elementIds: ["EL-CI-TRACEABILITY"] }),
  ];

  const scope = { level: "change", boundary: "ChangeIntegration over one exact Gate-approved verified work-item change and one configured local Git target ref.",
    in: ["Exact approved verification subject", "Deterministic integration plan", "Configured local Git target and expected commit", "Core-owned compare-and-swap authority", "Bounded local Git adapter effect", "Immutable checkpoint and uncertain-effect recovery", "IntegratedChangeRecord or explicit no-mutation failure", "Factual integrated-change traceability"],
    out: ["Work decomposition, dependency, assignment, execution, or verification", "Automatic conflict resolution", "Batch integration", "Remote pull-request or hosted merge behavior in V1", "Deployment or release", "System verification or business acceptance", "Adapter-authored graph operations"] };
  const openSpecDesign = [
    "# ChangeIntegration design", "", "## Decision", "",
    "Core binds one exact WorkItemVerificationGate approval and verified change to one configured local Git ref, expected target commit, integration policy, adapter binding, and idempotency identity. Core owns the compare-and-swap decision, checkpoint recovery, result validation, traceability, and progression. The adapter performs only one bounded conditional Git effect.",
    "", "## Conflict boundary", "",
    "No V1 component resolves conflicts automatically. Any conflict returns an immutable IntegrationConflictSet with the target unchanged. Reconciliation creates new implementation bytes and therefore must return through WorkExecution and WorkItemVerification.",
    "", "## Consequences", "",
    "A successful result proves repository incorporation only. It returns an IntegratedChangeRecord and updated RepositorySnapshot, creates factual integration traceability, and permits Core to consider frontier recalculation and SystemVerification; it never claims either downstream outcome.",
  ].join("\n");

  const interfaces = structuredClone(baseSections.interfaceIntent.content.interfaces);
  const specs = [
    ["IF-CI-INPUT-BINDING", "Exact verified-change integration binding", "EL-CI-INPUT-GUARD", ["EL-CI-PLAN-BUILDER"], ["One approved WorkItem and WorkItemVerificationGate approval", "Exact verified ChangeSet bytes", "Target RepositorySnapshot, local ref, and expected commit", "IntegrationPolicy, project baselines, adapter binding, and grants"], ["ValidatedIntegrationSubject with canonical digest and drift dispositions"], [CG.integrate, CG.cas, CG.noSystemAcceptance], "Missing, duplicate, substituted, cross-item, stale, wrong-target, or over-authorized inputs fail before adapter entry.", ["Core loads exact content-addressed artifacts and rejects adapter-supplied lifecycle authority."]],
    ["IF-CI-INTEGRATION-PLAN", "Deterministic integration plan", "EL-CI-PLAN-BUILDER", ["EL-CI-CAS-COORDINATOR"], ["ValidatedIntegrationSubject", "Exact adapter version and configuration", "Integration policy and idempotency rules"], ["Immutable IntegrationPlan binding pre-state, verified bytes, target transition, adapter, grants, and idempotency identity"], [CG.integrate, CG.auditability, CG.idempotency], "Unknown policy, adapter, target transition, or idempotency identity fails closed.", ["The plan contains no credentials and grants no authority beyond one target transition."]],
    ["IF-CI-TARGET-CAS", "Target-ref compare-and-swap authorization", "EL-CI-CAS-COORDINATOR", ["EL-CI-INTEGRATION-PORT"], ["IntegrationPlan", "Live target-ref observation", "Expected target commit"], ["Authorized conditional integration request or baseline_drift result"], [CG.atomicity, CG.cas, CG.localGit], "Target mismatch, missing ref, rewritten history, or invalid observation yields baseline_drift with zero mutation calls.", ["Only the exact configured target ref is writable; host must provide an atomic conditional update primitive."]],
    ["IF-CI-ADAPTER-INVOCATION", "Bounded local repository integration", "EL-CI-INTEGRATION-PORT", ["EL-CI-LOCAL-GIT-ADAPTER"], ["One authorized IntegrationPlan", "Exact verified change bytes", "Expected target commit and conditional ref update", "Declared host grants"], ["RawIntegrationEffect with pre-state, operation, conflict or failure, post-state, and native evidence"], [CG.integrate, CG.atomicity, CG.localGit, CG.noAutoResolve, CG.host], "Conflict, host denial, interruption, partial effect, target change, malformed output, or authority claim produces a durable non-success observation.", ["Adapter cannot select another target, alter verified bytes, resolve conflicts, access graph services, or claim downstream acceptance."]],
    ["IF-CI-CHECKPOINT-RECOVERY", "Integration effect checkpoint and recovery", "EL-CI-CHECKPOINT", ["EL-CI-RESULT-VALIDATOR"], ["IntegrationPlan", "RawIntegrationEffect or uncertain-effect observation", "Idempotency identity and live repository observation"], ["Replay-verified effect receipt, recovered post-state, or unable-to-proceed diagnostic"], [CG.atomicity, CG.auditability, CG.idempotency], "Changed invocation, target, adapter, or idempotency identity cannot reuse a checkpoint; uncertain effects require exact repository reconciliation before retry.", ["Recovery observes only the declared repository and never repeats a proven completed mutation."]],
    ["IF-CI-RESULT-VALIDATION", "Canonical integration outcome validation", "EL-CI-RESULT-VALIDATOR", ["EL-DEVRELAY-CORE", "EL-CI-TRACEABILITY"], ["Replay-verified IntegrationPlan and RawIntegrationEffect", "Exact pre-state and post-state repository observations", "Closed outcome vocabulary"], ["IntegratedChangeRecord plus updated RepositorySnapshot, IntegrationConflictSet, baseline-drift, unable-to-proceed, or execution-failed result"], [CG.integrate, CG.atomicity, CG.auditability, CG.noAutoResolve, CG.noSystemAcceptance], "Invalid parent, tree, ref, verified subject, no-mutation claim, raw evidence, or unknown outcome fails closed.", ["Only validated integrated post-state may create completion and traceability facts; no system-verification claim is emitted."]],
    ["IF-CI-TRACEABILITY", "Factual integrated-change traceability", "EL-CI-TRACEABILITY", ["EL-DEVRELAY-GRAPH"], ["Validated IntegratedChangeRecord", "Exact WorkItem, ChangeSet, architecture, contract, and post-state references"], ["Forward factual integration relationships and atomic merge proof"], [CG.integrate, CG.auditability, CG.noSystemAcceptance], "Non-integrated outcome, unknown reference, arbitrary edge, graph drift, or duplicate fact rejects the merge.", ["Trusted contributor accepts no adapter-authored graph operations and creates no verification, system, or business-acceptance fact."]],
  ];
  for (const [id, name, provider, consumers, inputs, outputs, ids, failure, security] of specs) interfaces.push(interfaceIntent({ id, name, provider, consumers, inputs, outputs, requirementIds: ids, failure, security }));

  const constraints = structuredClone(baseSections.architectureConstraints.content.constraints);
  const constraintSpecs = [
    ["CON-CI-ONE-SUBJECT", "operational", "One invocation integrates exactly one approved WorkItemVerification result and one verified change into one configured local Git ref.", [{ kind: "element", id: "EL-CI-INPUT-GUARD" }, { kind: "interface", id: "IF-CI-INPUT-BINDING" }], [CG.integrate, CG.localGit]],
    ["CON-CI-CORE-AUTHORITY", "organizational", "Core alone binds inputs, builds the integration plan, authorizes compare-and-swap, validates effects, controls progression, and derives traceability; adapters perform no lifecycle authority.", [{ kind: "element", id: "EL-CI-PLAN-BUILDER" }, { kind: "element", id: "EL-CI-RESULT-VALIDATOR" }], [CG.integrate, CG.cas, CG.noSystemAcceptance]],
    ["CON-CI-ATOMIC-CAS", "operational", "The host effect must conditionally advance the exact target ref from the expected commit to one validated post-state or leave it unchanged.", [{ kind: "element", id: "EL-CI-CAS-COORDINATOR" }, { kind: "interface", id: "IF-CI-TARGET-CAS" }], [CG.atomicity, CG.cas]],
    ["CON-CI-NO-AUTO-CONFLICT", "organizational", "No Core or adapter component may synthesize conflict-resolution bytes; an IntegrationConflictSet routes through a new execution and verification attempt.", [{ kind: "element", id: "EL-CI-LOCAL-GIT-ADAPTER" }, { kind: "interface", id: "IF-CI-ADAPTER-INVOCATION" }], [CG.noAutoResolve]],
    ["CON-CI-HOST-BOUNDARY", "security", "Portable Core records declarative Git permission demand while the external host alone enforces filesystem, process, credential, workspace, and ref-update effects.", [{ kind: "element", id: "EL-CI-INTEGRATION-PORT" }], [CG.host, CG.localGit]],
    ["CON-CI-CHECKPOINT-REPLAY", "data", "Prepared plans, native effects, recovery observations, and canonical outcomes are immutable; exact replay performs zero adapter calls and never duplicates a completed target transition.", [{ kind: "element", id: "EL-CI-CHECKPOINT" }, { kind: "interface", id: "IF-CI-CHECKPOINT-RECOVERY" }], [CG.auditability, CG.idempotency]],
    ["CON-CI-CLOSED-OUTCOMES", "operational", "Only integrated, integration-conflict, baseline-drift, unable-to-proceed, and execution-failed are valid outcomes; only integrated creates completion and progression facts.", [{ kind: "element", id: "EL-CI-RESULT-VALIDATOR" }], [CG.integrate, CG.noSystemAcceptance]],
    ["CON-CI-NO-DOWNSTREAM-CLAIM", "organizational", "Integrated repository state is not SystemVerification or BusinessAcceptance and cannot create either downstream fact.", [{ kind: "element", id: "EL-CI-RESULT-VALIDATOR" }, { kind: "element", id: "EL-CI-TRACEABILITY" }], [CG.noSystemAcceptance]],
    ["CON-CI-TRACEABILITY-AUTHORITY", "organizational", "Only the trusted contributor projects factual integrated-change edges from a validated IntegratedChangeRecord; the adapter cannot choose nodes, edge types, or graph operations.", [{ kind: "element", id: "EL-CI-TRACEABILITY" }], [CG.integrate, CG.auditability, CG.noSystemAcceptance]],
  ];
  for (const [id, category, statement, appliesTo, ids] of constraintSpecs) constraints.push(archConstraint(id, category, statement, appliesTo, ids));

  const technicalDesign = {
    technicalDesignId: "TD-CI-001", objective: "Atomically incorporate one exactly verified work-item change into one configured local Git target while preserving Core compare-and-swap, recovery, result, traceability, and progression authority.", scope,
    problemSummary: "A verified candidate is not yet part of the shared repository, while target drift, conflicts, concurrent work, and uncertain effects can invalidate its evidence or duplicate mutation.",
    solutionSummary: "Core binds one exact subject, creates an immutable IntegrationPlan, authorizes a conditional target-ref transition, checkpoints native effect evidence, validates the exact post-state, and projects factual integration traceability; the local Git adapter performs only the bounded effect.",
    requirementsDrivers: ["One verified work item per invocation", "Configured local Git ref", "Core-owned compare-and-swap", "No automatic conflict resolution", "Atomic success or unchanged target", "Immutable effect recovery and zero-call replay", "Exact integrated post-state evidence", "No system-verification or business-acceptance authority"],
    behaviorFlows: ["Core validates the exact WorkItemVerificationGate approval, verified change, baselines, target snapshot, ref, expected commit, policy, adapter, and grants.", "Core builds one immutable IntegrationPlan and idempotency identity.", "Core compares the live target ref to the expected commit and authorizes one conditional effect only on an exact match.", "The host invokes the configured local Git adapter with bounded permissions.", "Native effect observations are checkpointed before canonical result projection.", "Core validates atomic parentage, tree, ref, verified subject, and no-mutation claims.", "A conflict leaves the target unchanged and returns to WorkExecution and WorkItemVerification; success returns exact post-state artifacts.", "The trusted contributor merges factual integration edges, then Core may recalculate the next ready frontier and later enter SystemVerification."],
    dataResponsibilities: ["ValidatedIntegrationSubject binds every exact input.", "IntegrationPlan binds the only authorized target transition, adapter, policy, grants, and idempotency identity.", "RawIntegrationEffect preserves native Git observations and raw evidence.", "IntegrationConflictSet records unresolved paths and reasons without resolution bytes.", "IntegratedChangeRecord binds pre-state, verified change, post-state commit, tree, ref, adapter, checkpoint, and evidence.", "Updated RepositorySnapshot represents the factual shared target after success."],
    failureHandling: ["Input or target drift stops before mutation.", "Conflict returns an immutable no-mutation artifact and requires re-execution and re-verification.", "Host denial, malformed output, or invalid post-state cannot create integration facts.", "Uncertain crash-after-effect state is reconciled from exact repository observations before retry.", "Exact replay reuses completed checkpoints without adapter calls."],
    securityPrivacy: ["External host enforces declared repository, process, credential, and ref-update permissions.", "Secrets are referenced and host-resolved, never embedded in portable artifacts.", "The adapter cannot access approval, progression, or TraceabilityGraph services.", "Native evidence redaction preserves original digest and explicit transformation provenance."],
    performanceReliabilityOperability: ["Independent ready items may prepare in parallel, but target-ref transitions serialize by compare-and-swap.", "One-item attempts isolate conflicts and recovery.", "Exact checkpoints prevent duplicate mutation.", "Closed drift, conflict, effect, and post-state diagnostics make every blocked transition observable."],
    compatibilityMigrationRollout: ["V1 ships a provider-neutral port with a local Git adapter contract.", "Remote PR and hosted merge adapters may bind later without changing canonical inputs or outcomes.", "Adapter maturity remains explicit and no repository vendor enters Core semantics.", "Batch integration, release, deployment, and production rollout remain later extensions."],
    verificationIntent: ["Test exact and substituted input bindings.", "Test exact, stale, rewritten, missing, and concurrently changed target refs.", "Test clean integration and every no-mutation conflict path.", "Test adapter failures before and after external effect and reconcile uncertain effects.", "Test exact post-state parent, tree, ref, and verified-change proofs.", "Test all five outcomes and reject unknown or downstream claims.", "Test zero-call replay and duplicate-idempotency rejection.", "Test factual traceability and atomic merge."],
    interfaceIntentIds: interfaces.filter(({ id }) => id.startsWith("IF-CI-")).map(({ id }) => id),
    constraintIds: constraints.filter(({ id }) => id.startsWith("CON-CI-")).map(({ id }) => id), sourceRequirementIds: Object.values(CG), sourceRefs: [],
  };

  const decisionSpecs = [
    ["ADR-CI-001", "Integrate one exactly verified work-item change per invocation", "OPT-CI-ONE-SUBJECT", "OPT-CI-BATCH-INTEGRATION", [CG.integrate], [{ kind: "constraint", id: "CON-CI-ONE-SUBJECT" }]],
    ["ADR-CI-002", "Use a provider-neutral port with a local Git adapter for V1", "OPT-CI-LOCAL-GIT-ADAPTER", "OPT-CI-REPOSITORY-VENDOR-IN-CORE", [CG.localGit, CG.host], [{ kind: "element", id: "EL-CI-INTEGRATION-PORT" }]],
    ["ADR-CI-003", "Require Core-owned target compare-and-swap and atomic host update", "OPT-CI-CORE-CAS", "OPT-CI-ADAPTER-CHOSES-TARGET", [CG.atomicity, CG.cas], [{ kind: "element", id: "EL-CI-CAS-COORDINATOR" }]],
    ["ADR-CI-004", "Return conflicts without automatic resolution", "OPT-CI-CONFLICT-ARTIFACT", "OPT-CI-AUTO-MERGE-RESOLUTION", [CG.noAutoResolve], [{ kind: "constraint", id: "CON-CI-NO-AUTO-CONFLICT" }]],
    ["ADR-CI-005", "Keep repository integration distinct from SystemVerification and BusinessAcceptance", "OPT-CI-INTEGRATED-NOT-ACCEPTED", "OPT-CI-INTEGRATE-AND-ACCEPT", [CG.noSystemAcceptance], [{ kind: "constraint", id: "CON-CI-NO-DOWNSTREAM-CLAIM" }]],
  ];
  const decisions = decisionSpecs.map(([id, title, chosen, rejected, reqs, targets]) => ({ id, title, chosen, rejected, requirements: reqs, targets, supersedes: [] }));
  const assumptions = [
    { id: "ASM-CI-HOST-CAS", statement: "The external host exposes an enforceable atomic local Git ref compare-and-swap primitive and exact pre/post observations.", status: "confirmed", blocking: false },
    { id: "ASM-CI-VERIFIED-BYTES", statement: "WorkItemVerificationGate approval binds resolvable exact change bytes and repository context suitable for one integration plan.", status: "confirmed", blocking: false },
    { id: "ASM-CI-SYSTEM-DOWNSTREAM", statement: "SystemVerification consumes only integrated repository snapshots and remains the next system-level evidence authority.", status: "confirmed", blocking: false },
  ];
  const risks = [
    { id: "RISK-CI-TOCTOU", statement: "Target state may change between observation and update.", impact: "Verified work could apply to unverified bytes.", mitigation: "Require one host-atomic conditional ref update and validate exact pre/post identities." },
    { id: "RISK-CI-UNVERIFIED-RESOLUTION", statement: "Conflict resolution may synthesize bytes absent from verification.", impact: "The integrated result may not be proven by prior evidence.", mitigation: "Return IntegrationConflictSet and require new WorkExecution plus WorkItemVerification." },
    { id: "RISK-CI-UNCERTAIN-EFFECT", statement: "A crash may occur after Git mutation but before checkpoint persistence.", impact: "Retry could duplicate the effect or lose audit evidence.", mitigation: "Use immutable idempotency identity and reconcile exact repository observations before any retry." },
    { id: "RISK-CI-FORGED-RECEIPT", statement: "An adapter may claim success without the exact target transition.", impact: "False completion could unlock dependent work.", mitigation: "Core validates parentage, tree, ref, verified subject, raw effect evidence, and post-state snapshot." },
    { id: "RISK-CI-ACCEPTANCE-CONFLATION", statement: "Repository integration may be mistaken for complete-system or business success.", impact: "Lifecycle could terminate without system evidence.", mitigation: "Use closed outcome and graph vocabulary that permits only integrated completion and downstream progression." },
  ];

  const alreadyDesignedTargets = new Map();
  for (const [kind, items] of [["element", baseSections.architectureModel.content.elements], ["relationship", baseSections.architectureModel.content.relationships], ["interface", baseSections.interfaceIntent.content.interfaces], ["constraint", baseSections.architectureConstraints.content.constraints], ["decision", baseSections.decisionRecords.content.decisions]]) {
    for (const item of items) for (const requirementId of item.sourceRequirementIds ?? []) {
      const targets = alreadyDesignedTargets.get(requirementId) ?? [];
      targets.push({ kind, id: item.id }); alreadyDesignedTargets.set(requirementId, targets);
    }
  }
  alreadyDesignedTargets.set("US-DEV-SPECIFY-001", [{ kind: "element", id: "EL-WB-MODULE" }]);
  alreadyDesignedTargets.set("NFR-DEV-DETERMINISM-001", [{ kind: "element", id: "EL-DEVRELAY-CORE" }]);
  alreadyDesignedTargets.set("NFR-DEV-PORTABILITY-001", [{ kind: "element", id: "EL-WB-ADAPTER-PORT" }]);
  return { CG, allNormativeIds, alreadyDesignedTargets, baseSections, model, scope, openSpecDesign,
    diagramViewSpecs, decisionSpecs: decisions, technicalDesign, interfaces, constraints, assumptions, risks, uniq };
}
