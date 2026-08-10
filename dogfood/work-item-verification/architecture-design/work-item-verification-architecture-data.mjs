const uniq = (...values) => [...new Set(values.flat())];

function architectureElement({
  id,
  name,
  type,
  parentId,
  description,
  responsibilities,
  sourceRequirementIds,
  tags,
}) {
  return {
    id,
    name,
    type,
    ...(parentId === undefined ? {} : { parentId }),
    description,
    technology:
      type === "software-system" ? "" : "Provider-neutral DevRelay verification",
    responsibilities,
    tags,
    properties: {},
    sourceRequirementIds: uniq(sourceRequirementIds),
    sourceRefs: [],
  };
}

function component(
  id,
  name,
  parentId,
  description,
  responsibilities,
  sourceRequirementIds,
  tags = [],
) {
  return architectureElement({
    id,
    name,
    type: "component",
    parentId,
    description,
    responsibilities,
    sourceRequirementIds,
    tags: ["Component", ...tags],
  });
}

function relationship(
  id,
  sourceElementId,
  targetElementId,
  description,
  sourceRequirementIds,
) {
  return {
    id,
    sourceElementId,
    targetElementId,
    description,
    interactionStyle: "synchronous",
    tags: [],
    sourceRequirementIds: uniq(sourceRequirementIds),
    sourceRefs: [],
  };
}

function interfaceIntent({
  id,
  name,
  providerElementId,
  consumerElementIds,
  inputs,
  outputs,
  requirementIds,
  failureBehavior,
  securityPrivacyIntent,
}) {
  return {
    id,
    name,
    purpose: name,
    ownerBoundary: providerElementId,
    providerElementId,
    consumerElementIds,
    interactionStyle: "synchronous",
    semanticInputs: inputs,
    semanticOutputs: outputs,
    protocolConstraints: [
      "Exact artifact versions and SHA-256 digests",
      "Canonical provider-neutral verification-attempt semantics",
      "Closed subject, obligation, binding, evidence, policy, and authority dispositions",
    ],
    failureBehavior,
    compatibilityObligations: [
      "Stable canonical behavior across compatible executors and hosts",
      "Unknown bindings, fields, executor versions, or policy values fail closed",
    ],
    securityPrivacyIntent,
    deliveryConsistencyIntent: [
      "Validate canonical structured bytes before checkpoint or Gate preparation",
      "Preserve exact work-item, baseline, adapter, validator, and evidence lineage",
    ],
    contractGeneration: {
      required: true,
      suggestedKinds: ["json-schema"],
    },
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

function constraint(id, category, statement, appliesTo, requirementIds) {
  return {
    id,
    category,
    strength: "must",
    statement,
    rationale: statement,
    appliesTo,
    verificationIntent:
      "Dedicated positive, negative, drift, replay, subject-binding, obligation-coverage, evidence, policy, authority, and traceability conformance fixtures.",
    sourceRequirementIds: uniq(requirementIds),
    sourceRefs: [],
  };
}

export function buildWorkItemVerificationArchitecture({ architectureBaseline, requirements }) {
  const CG = Object.freeze({
    verify: "US-DEV-WORK-ITEM-VERIFICATION-001",
    deterministic: "NFR-DEV-WIV-DETERMINISM-001",
    evidenceClosure: "NFR-DEV-WIV-EVIDENCE-CLOSURE-001",
    isolation: "NFR-DEV-WIV-ISOLATION-001",
    authority: "CON-DEV-WIV-AUTHORITY-001",
    exactSubject: "CON-DEV-WIV-EXACT-SUBJECT-001",
    immutableAttempt: "CON-DEV-WIV-IMMUTABLE-ATTEMPT-001",
    noIntegration: "CON-DEV-WIV-NO-INTEGRATION-001",
    host: "CON-DEV-WIV-HOST-ENFORCEMENT-001",
  });
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missingIds = Object.values(CG).filter((id) => !declaredIds.has(id));
  if (missingIds.length) throw new Error("WorkItemVerification architecture drivers are absent from approved requirements: " + missingIds.join(", "));
  const allNormativeIds = [...declaredIds];
  const baseSections = architectureBaseline.sections;
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-WORK-ITEM-VERIFICATION-007";

  model.elements.push(
    architectureElement({
      id: "EL-WIV-MODULE", name: "WorkItemVerification", type: "container", parentId: "EL-DEVRELAY-SYSTEM",
      description: "Verifies one exact immutable WorkExecution result against approved obligations and prepares a Gate candidate without integration authority.",
      responsibilities: ["Invoke configured evidence-producing verifiers", "Return observations and native artifacts only", "Keep verification, progression, and graph authority in Core"],
      sourceRequirementIds: Object.values(CG), tags: ["Container", "LifecycleModule", "WorkItemVerification"],
    }),
    component("EL-WIV-VERIFIER-PORT", "Verifier Port", "EL-WIV-MODULE", "Provider-neutral boundary for evidence-producing verifier adapters.", ["Pass one immutable subject, obligation subset, workspace, policy, and binding", "Receive raw observations, evidence bytes, diagnostics, and native artifacts"], [CG.verify, CG.authority, CG.isolation], ["AdapterPort", "WorkItemVerification"]),
    component("EL-WIV-TEST-ADAPTER", "Test Verifier Adapter", "EL-WIV-MODULE", "Runs configured test capabilities and returns subject-bound raw evidence.", ["Execute only approved test obligations", "Return command identity, output bytes, result, producer, and subject bindings"], [CG.verify, CG.evidenceClosure, CG.host], ["AdapterBinding", "Tests"]),
    component("EL-WIV-REVIEW-ADAPTER", "Review Verifier Adapter", "EL-WIV-MODULE", "Runs configured static, security, documentation, or human-review capabilities through the same evidence contract.", ["Evaluate only assigned review obligations", "Return raw findings without approval or graph operations"], [CG.verify, CG.authority, CG.isolation], ["AdapterBinding", "Review"]),
    component("EL-WIV-INPUT-GUARD", "Verification Input Guard", "EL-DEVRELAY-CORE", "Binds one exact WorkItem, ExecutionAttempt, ChangeSetDraft, evidence bundle, policy, baselines, repository base, and candidate workspace.", ["Reject absent, duplicate, cross-item, cross-attempt, stale, or mutated subjects", "Forbid adapter-authored verification, integration, or completion claims"], [CG.verify, CG.exactSubject, CG.noIntegration], ["CoreAuthority", "WorkItemVerification"]),
    component("EL-WIV-OBLIGATION-EXPANDER", "Verification Obligation Expander", "EL-DEVRELAY-CORE", "Deterministically expands every approved verification-plan check and required-evidence obligation.", ["Combine WorkItem, acceptance, architecture, contract, and policy duties", "Require a closed disposition for every obligation"], [CG.verify, CG.evidenceClosure, CG.deterministic], ["CoreAuthority", "Coverage"]),
    component("EL-WIV-BINDING-VALIDATOR", "Verifier Binding Validator", "EL-DEVRELAY-CORE", "Selects and validates configured verifier adapters from approved evidence kinds and policy.", ["Bind adapter identity, version, configuration, permissions, and obligation subset", "Prove required producer or reviewer independence from the executor"], [CG.authority, CG.isolation, CG.host], ["CoreAuthority", "Validation"]),
    component("EL-WIV-EVIDENCE-NORMALIZER", "Evidence Normalizer", "EL-DEVRELAY-CORE", "Normalizes checkpointed verifier bytes into canonical subject-bound evidence and explicit obligation dispositions.", ["Validate provenance, raw bytes, producer, command, observed result, and subject digests", "Reject missing, stale, substituted, truncated, unrelated, or over-scoped evidence"], [CG.verify, CG.evidenceClosure, CG.exactSubject, CG.deterministic], ["CoreAuthority", "Canonicalization"]),
    component("EL-WIV-POLICY-EVALUATOR", "Verification Policy Evaluator", "EL-DEVRELAY-CORE", "Evaluates complete normalized evidence against the exact version-pinned VerificationPolicy.", ["Return closed verified, failed, needs-evidence, baseline-drift, or unable-to-proceed disposition", "Fail closed on unknown policy, uncovered obligation, or independence violation"], [CG.verify, CG.evidenceClosure, CG.authority, CG.deterministic], ["CoreAuthority", "Policy"]),
    component("EL-WIV-GATE", "WorkItemVerification Gate", "EL-DEVRELAY-CORE", "Independently validates the exact checkpointed candidate, policy result, evidence closure, and approval bytes.", ["Issue the only approved per-item verification result", "Allow progression only to ChangeIntegration without integration facts"], [CG.authority, CG.noIntegration, CG.evidenceClosure], ["CoreAuthority", "Gate"]),
    component("EL-WIV-CHECKPOINT", "Verification Checkpoint Controller", "EL-DEVRELAY-CORE", "Persists raw verifier results before canonical evaluation and replays exact inputs without reinvoking adapters.", ["Checkpoint every actual invocation", "Create a new linked VerificationAttempt for retry or additional evidence"], [CG.deterministic, CG.immutableAttempt, CG.authority], ["CoreAuthority", "Checkpoint"]),
    component("EL-WIV-CANDIDATE-TRACE", "Verification Candidate Traceability Contributor", "EL-DEVRELAY-GRAPH", "Projects candidate verification-attempt relationships from validated canonical artifacts only.", ["Link WorkItem, ExecutionAttempt, and ChangeSetDraft to VerificationAttempt", "Create no verified-by or integration facts"], [CG.verify, CG.authority, CG.noIntegration], ["TraceabilityContributor", "Candidate"]),
    component("EL-WIV-APPROVED-TRACE", "Approved Verification Traceability Contributor", "EL-DEVRELAY-GRAPH", "Projects approved evidence relationships only after exact Gate approval.", ["Link each acceptance criterion to accepted evidence", "Bind update, graph version, execution ID, and resulting checkpoint atomically"], [CG.evidenceClosure, CG.authority, CG.noIntegration], ["TraceabilityContributor", "Approved"]),
  );

  const relationships = [
    ["REL-WIV-GUARD-OBLIGATIONS", "EL-WIV-INPUT-GUARD", "EL-WIV-OBLIGATION-EXPANDER", "Releases one exact verified subject for deterministic obligation expansion.", [CG.verify, CG.exactSubject]],
    ["REL-WIV-OBLIGATIONS-BINDING", "EL-WIV-OBLIGATION-EXPANDER", "EL-WIV-BINDING-VALIDATOR", "Supplies the complete obligation set for deterministic verifier selection.", [CG.evidenceClosure, CG.deterministic]],
    ["REL-WIV-BINDING-PORT", "EL-WIV-BINDING-VALIDATOR", "EL-WIV-VERIFIER-PORT", "Supplies exact validated verifier bindings, obligation partitions, and permission demand.", [CG.authority, CG.isolation, CG.host]],
    ["REL-WIV-PORT-TEST", "EL-WIV-VERIFIER-PORT", "EL-WIV-TEST-ADAPTER", "Invokes configured test evidence capabilities.", [CG.verify, CG.evidenceClosure]],
    ["REL-WIV-PORT-REVIEW", "EL-WIV-VERIFIER-PORT", "EL-WIV-REVIEW-ADAPTER", "Invokes configured review evidence capabilities.", [CG.verify, CG.authority]],
    ["REL-WIV-PORT-CHECKPOINT", "EL-WIV-VERIFIER-PORT", "EL-WIV-CHECKPOINT", "Persists exact effect bytes before canonical evaluation.", [CG.deterministic, CG.immutableAttempt]],
    ["REL-WIV-CHECKPOINT-NORMALIZER", "EL-WIV-CHECKPOINT", "EL-WIV-EVIDENCE-NORMALIZER", "Supplies replay-verified raw results for evidence normalization.", [CG.deterministic, CG.evidenceClosure]],
    ["REL-WIV-NORMALIZER-POLICY", "EL-WIV-EVIDENCE-NORMALIZER", "EL-WIV-POLICY-EVALUATOR", "Supplies complete subject-bound evidence and obligation dispositions.", [CG.evidenceClosure, CG.exactSubject]],
    ["REL-WIV-POLICY-GATE", "EL-WIV-POLICY-EVALUATOR", "EL-WIV-GATE", "Supplies the closed policy disposition and exact candidate.", [CG.authority, CG.noIntegration]],
    ["REL-WIV-NORMALIZER-CANDIDATE-TRACE", "EL-WIV-EVIDENCE-NORMALIZER", "EL-WIV-CANDIDATE-TRACE", "Supplies validated attempt and evidence provenance for candidate traceability.", [CG.verify, CG.authority]],
    ["REL-WIV-GATE-APPROVED-TRACE", "EL-WIV-GATE", "EL-WIV-APPROVED-TRACE", "Supplies exact Gate approval for approved verification evidence projection.", [CG.evidenceClosure, CG.authority, CG.noIntegration]],
  ];
  model.relationships.push(...relationships.map(([id, source, target, description, ids]) => relationship(id, source, target, description, ids)));

  const viewFor = ({ viewKey, type, title, purpose, audience, scopeElementId, elementIds }) => {
    const included = new Set(elementIds);
    return { viewKey, type, title, purpose, audience, scopeElementId, elementIds, relationshipIds: model.relationships.filter(({ sourceElementId, targetElementId }) => included.has(sourceElementId) && included.has(targetElementId)).map(({ id }) => id) };
  };
  const priorViewSpecs = baseSections.diagrams.content.views.map(({ renderings: _renderings, ...view }) => structuredClone(view));
  const diagramViewSpecs = [
    ...priorViewSpecs,
    viewFor({ viewKey: "VIEW-WIV-CONTAINERS", type: "container", title: "DevRelay WorkItemVerification containers", purpose: "Show WorkItemVerification beside Generic Core and TraceabilityGraph.", audience: ["engineering", "architecture", "workflow-authors"], scopeElementId: "EL-DEVRELAY-SYSTEM", elementIds: model.elements.filter(({ type, parentId }) => type === "container" && parentId === "EL-DEVRELAY-SYSTEM").map(({ id }) => id) }),
    viewFor({ viewKey: "VIEW-WIV-CORE-COMPONENTS", type: "component", title: "Generic Core verification authority", purpose: "Show subject binding, obligation coverage, evidence normalization, policy, Gate, and checkpoint authority.", audience: ["engineering", "architecture", "security"], scopeElementId: "EL-DEVRELAY-CORE", elementIds: ["EL-WIV-INPUT-GUARD", "EL-WIV-OBLIGATION-EXPANDER", "EL-WIV-BINDING-VALIDATOR", "EL-WIV-EVIDENCE-NORMALIZER", "EL-WIV-POLICY-EVALUATOR", "EL-WIV-GATE", "EL-WIV-CHECKPOINT"] }),
    viewFor({ viewKey: "VIEW-WIV-MODULE-COMPONENTS", type: "component", title: "WorkItemVerification adapter boundary", purpose: "Show test and review evidence producers behind one verifier port.", audience: ["engineering", "adapter-authors"], scopeElementId: "EL-WIV-MODULE", elementIds: ["EL-WIV-VERIFIER-PORT", "EL-WIV-TEST-ADAPTER", "EL-WIV-REVIEW-ADAPTER"] }),
    viewFor({ viewKey: "VIEW-WIV-TRACEABILITY-COMPONENTS", type: "component", title: "Verification traceability", purpose: "Show separately authorized candidate and approved evidence projections.", audience: ["engineering", "audit"], scopeElementId: "EL-DEVRELAY-GRAPH", elementIds: ["EL-WIV-CANDIDATE-TRACE", "EL-WIV-APPROVED-TRACE"] }),
  ];

  const scope = {
    level: "change",
    boundary: "WorkItemVerification over one exact WorkItem and immutable WorkExecution result in one candidate workspace.",
    in: ["Exact per-item verification subject", "Deterministic obligation expansion", "Configured test and review verifier bindings", "Subject-bound raw and normalized evidence", "Version-pinned VerificationPolicy", "Immutable VerificationAttempt and checkpoint replay", "Independent WorkItemVerificationGate", "Candidate and approved traceability"],
    out: ["Work decomposition, dependency, assignment, or execution", "Adapter-authored obligation scope", "Mutation of the candidate change set", "Change integration or integrated-completion facts", "System verification or business acceptance", "Verifier-authored graph operations"],
  };
  const openSpecDesign = [
    "# WorkItemVerification design",
    "",
    "## Decision",
    "",
    "Core binds one exact WorkItem, ExecutionAttempt, ChangeSetDraft, ExecutionEvidenceBundle, policy, approved baselines, repository base, and candidate workspace. It expands every approved verification obligation, selects version-pinned verifier bindings, checkpoints raw results, normalizes subject-bound evidence, and evaluates closed policy outcomes. WorkItemVerificationGate alone approves progression to ChangeIntegration.",
    "",
    "## Adapter boundary",
    "",
    "Test, static-analysis, security, documentation, and human-review adapters produce observations and evidence only. They cannot reduce obligations, self-declare independence, approve verification, integrate changes, or author graph operations.",
    "",
    "## Consequences",
    "",
    "Every rerun or evidence continuation creates a new immutable VerificationAttempt. Exact replay invokes no verifier. Passing verification remains distinct from integration and integrated completion.",
  ].join("\n");

  const interfaces = structuredClone(baseSections.interfaceIntent.content.interfaces);
  const interfaceSpecs = [
    ["IF-WIV-INPUT-BINDING", "Exact verification-subject binding", "EL-WIV-INPUT-GUARD", ["EL-WIV-OBLIGATION-EXPANDER"], ["One approved WorkItem", "One immutable ExecutionAttempt", "One ChangeSetDraft and ExecutionEvidenceBundle", "Exact policy, baselines, repository base, and candidate workspace"], ["ValidatedVerificationSubject with canonical digest and drift dispositions"], [CG.verify, CG.exactSubject, CG.noIntegration], "Absent, duplicate, cross-item, cross-attempt, stale-baseline, changed-repository, or changed-workspace input fails before adapters.", ["Core reads immutable content-addressed inputs and rejects adapter-supplied lifecycle claims."]],
    ["IF-WIV-OBLIGATION-SET", "Complete verification-obligation expansion", "EL-WIV-OBLIGATION-EXPANDER", ["EL-WIV-BINDING-VALIDATOR"], ["ValidatedVerificationSubject", "WorkItem verification plan and required evidence", "Acceptance, architecture, contract, and policy duties"], ["Canonical VerificationObligationSet with one disposition slot per obligation"], [CG.verify, CG.evidenceClosure, CG.deterministic], "Missing, duplicate, contradictory, unknown, or adapter-suppressed obligation fails closed.", ["Only Core expands approved scope; adapters receive bounded partitions."]],
    ["IF-WIV-VERIFIER-BINDING", "Verifier binding and independence validation", "EL-WIV-BINDING-VALIDATOR", ["EL-WIV-VERIFIER-PORT"], ["VerificationObligationSet", "Configured adapter catalog and versions", "Executor identity and VerificationPolicy", "Declared host permission demand"], ["ValidatedVerifierBindingSet with exact obligation partitions and independence proof"], [CG.authority, CG.isolation, CG.host], "Missing capability, stale adapter, aliased identity, expanded permission, or required-independence failure blocks invocation.", ["Core validates identity and declarative demand; the external host enforces operating-system effects."]],
    ["IF-WIV-VERIFIER-INVOCATION", "Bounded verifier invocation", "EL-WIV-VERIFIER-PORT", ["EL-WIV-TEST-ADAPTER", "EL-WIV-REVIEW-ADAPTER"], ["One immutable VerificationAttempt request", "Exact obligation partition and subject", "Candidate workspace and declared grants", "Configured verifier identity and version"], ["RawVerifierResult with observations, raw evidence, diagnostics, native artifacts, and terminal state"], [CG.verify, CG.isolation, CG.immutableAttempt], "Host denial, interruption, timeout, malformed output, changed context, or authority claim produces a durable non-success attempt.", ["Adapters receive least privilege and cannot access Core Gate or TraceabilityGraph services."]],
    ["IF-WIV-EVIDENCE-NORMALIZATION", "Canonical subject-bound evidence", "EL-WIV-EVIDENCE-NORMALIZER", ["EL-WIV-POLICY-EVALUATOR", "EL-WIV-CANDIDATE-TRACE"], ["Checkpoint-replayed RawVerifierResult set", "Exact verification subject and obligation set", "Evidence schema and retention policy"], ["VerificationAttempt", "NormalizedEvidenceSet", "ObligationDispositionSet", "Diagnostics"], [CG.verify, CG.evidenceClosure, CG.exactSubject, CG.deterministic], "Missing provenance, wrong subject, unresolved bytes, unsupported observation, or incomplete disposition blocks progression.", ["Normalization is pure and cannot execute tools, approve results, or mutate the candidate."]],
    ["IF-WIV-POLICY-EVALUATION", "Closed verification-policy evaluation", "EL-WIV-POLICY-EVALUATOR", ["EL-WIV-GATE"], ["NormalizedEvidenceSet", "ObligationDispositionSet", "Exact VerificationPolicy", "Verifier independence proof"], ["VerificationCandidate with one closed outcome and policy decision evidence"], [CG.verify, CG.evidenceClosure, CG.authority, CG.deterministic], "Uncovered obligations, rejected evidence, stale policy, independence failure, or unknown outcome fails closed.", ["Policy evaluation is Core-owned and cannot be overridden by adapter prose."]],
    ["IF-WIV-GATE-CANDIDATE", "WorkItemVerification Gate candidate", "EL-WIV-GATE", ["EL-DEVRELAY-CORE"], ["Checkpointed VerificationCandidate", "Exact normalized evidence and policy decision", "Approval bytes and candidate digest"], ["ApprovedWorkItemVerification or exact rejection", "Progression authorization limited to ChangeIntegration"], [CG.authority, CG.noIntegration, CG.evidenceClosure], "Modified bytes, missing evidence, approval substitution, stale policy, or non-verified outcome denies progression.", ["Gate approval does not mutate repository or create integration facts."]],
    ["IF-WIV-CANDIDATE-TRACEABILITY", "Verification candidate traceability", "EL-WIV-CANDIDATE-TRACE", ["EL-DEVRELAY-GRAPH"], ["Validated WorkItem, ExecutionAttempt, ChangeSetDraft, VerificationAttempt, and evidence references"], ["Candidate forward relationships and atomic merge proof"], [CG.verify, CG.authority, CG.noIntegration], "Unknown references, arbitrary edges, graph drift, or missing contributor blocks the graph-aware execution record.", ["Trusted contributor accepts no adapter-authored graph operations and creates no approval fact."]],
    ["IF-WIV-APPROVED-TRACEABILITY", "Approved verification evidence traceability", "EL-WIV-APPROVED-TRACE", ["EL-DEVRELAY-GRAPH"], ["Exact WorkItemVerificationGate approval", "Accepted subject-bound evidence and acceptance-criterion references"], ["AcceptanceCriterion verified-by Evidence relationships and atomic merge proof"], [CG.evidenceClosure, CG.authority, CG.noIntegration], "Non-approved candidate, mismatched evidence, graph drift, or duplicate fact rejects the merge.", ["Only the approved contributor creates verified-by evidence facts; no integrated-by fact is permitted."]],
  ];
  for (const [id, name, provider, consumers, inputs, outputs, ids, failure, security] of interfaceSpecs) {
    interfaces.push(interfaceIntent({ id, name, providerElementId: provider, consumerElementIds: consumers, inputs, outputs, requirementIds: ids, failureBehavior: failure, securityPrivacyIntent: security }));
  }

  const constraints = structuredClone(baseSections.architectureConstraints.content.constraints);
  const constraintSpecs = [
    ["CON-WIV-ONE-SUBJECT", "operational", "One invocation verifies exactly one approved WorkItem and one immutable ExecutionAttempt, ChangeSetDraft, evidence bundle, repository base, and candidate workspace.", [{ kind: "element", id: "EL-WIV-INPUT-GUARD" }, { kind: "interface", id: "IF-WIV-INPUT-BINDING" }], [CG.verify, CG.exactSubject]],
    ["CON-WIV-CORE-OBLIGATIONS", "organizational", "Only Core expands the complete verification obligation set; adapters cannot add, remove, weaken, or approve dispositions.", [{ kind: "element", id: "EL-WIV-OBLIGATION-EXPANDER" }], [CG.verify, CG.evidenceClosure, CG.authority]],
    ["CON-WIV-ADAPTER-EVIDENCE-ONLY", "organizational", "Verifier adapters return observations and raw evidence only and cannot approve verification, progression, integration, or graph operations.", [{ kind: "element", id: "EL-WIV-VERIFIER-PORT" }, { kind: "interface", id: "IF-WIV-VERIFIER-INVOCATION" }], [CG.verify, CG.authority, CG.noIntegration]],
    ["CON-WIV-INDEPENDENCE", "security", "When policy requires independence, Core proves verifier identity differs from the exact executor identity and rejects aliases or missing identities.", [{ kind: "element", id: "EL-WIV-BINDING-VALIDATOR" }], [CG.authority, CG.isolation]],
    ["CON-WIV-HOST-BOUNDARY", "security", "Portable Core records declarative verifier permission demand while the external host alone claims workspace, process, network, filesystem, and secret enforcement.", [{ kind: "element", id: "EL-WIV-VERIFIER-PORT" }], [CG.host, CG.isolation]],
    ["CON-WIV-EVIDENCE-CLOSURE", "data", "Every obligation has one explicit disposition and every accepted evidence item binds exact subject, producer, invocation, raw bytes, and observed result.", [{ kind: "element", id: "EL-WIV-EVIDENCE-NORMALIZER" }, { kind: "interface", id: "IF-WIV-EVIDENCE-NORMALIZATION" }], [CG.evidenceClosure, CG.exactSubject]],
    ["CON-WIV-CLOSED-OUTCOMES", "operational", "Only verified, failed, needs-evidence, baseline-drift, and unable-to-proceed are valid policy outcomes; only verified may reach the Gate progression decision.", [{ kind: "element", id: "EL-WIV-POLICY-EVALUATOR" }], [CG.verify, CG.deterministic]],
    ["CON-WIV-GATE-AUTHORITY", "organizational", "WorkItemVerificationGate alone approves per-item verification after independently validating exact checkpoint, evidence closure, policy decision, and approval bytes.", [{ kind: "element", id: "EL-WIV-GATE" }, { kind: "interface", id: "IF-WIV-GATE-CANDIDATE" }], [CG.authority, CG.evidenceClosure]],
    ["CON-WIV-IMMUTABLE-RETRY", "data", "Every actual verifier invocation has a new immutable VerificationAttempt; retry or added evidence references but never overwrites its predecessor.", [{ kind: "element", id: "EL-WIV-CHECKPOINT" }], [CG.immutableAttempt, CG.deterministic]],
    ["CON-WIV-CHECKPOINT-REPLAY", "operational", "Exact retry replays checkpointed verifier bytes with zero adapter calls; changed subject, policy, workspace, or binding creates a new fingerprint and attempt.", [{ kind: "element", id: "EL-WIV-CHECKPOINT" }, { kind: "interface", id: "IF-WIV-VERIFIER-INVOCATION" }], [CG.deterministic, CG.immutableAttempt]],
    ["CON-WIV-NO-INTEGRATION", "organizational", "A verified result authorizes ChangeIntegration consideration only and cannot mutate the shared baseline or create an integrated-completion fact.", [{ kind: "element", id: "EL-WIV-GATE" }], [CG.noIntegration, CG.authority]],
    ["CON-WIV-TRACEABILITY-AUTHORITY", "organizational", "Only trusted contributors project candidate attempt links and Gate-approved verified-by evidence links; neither may create integration facts.", [{ kind: "element", id: "EL-WIV-CANDIDATE-TRACE" }, { kind: "element", id: "EL-WIV-APPROVED-TRACE" }], [CG.verify, CG.evidenceClosure, CG.authority, CG.noIntegration]],
  ];
  for (const [id, category, statement, appliesTo, ids] of constraintSpecs) constraints.push(constraint(id, category, statement, appliesTo, ids));

  const technicalDesign = {
    technicalDesignId: "TD-WIV-001",
    objective: "Independently verify one exact WorkExecution result through replaceable evidence producers while preserving Core obligation, evidence, policy, Gate, retry, and traceability authority.",
    scope,
    problemSummary: "Execution can propose changes and raw evidence, but no executor or verifier may self-certify complete, correct, independent, integrated work.",
    solutionSummary: "Core binds one exact subject, expands all obligations, validates version-pinned verifier bindings, checkpoints raw observations, normalizes subject-bound evidence, evaluates a closed policy, and lets WorkItemVerificationGate alone approve progression to ChangeIntegration.",
    requirementsDrivers: ["One exact immutable execution result per invocation", "Complete Core-owned obligation expansion", "Replaceable evidence-only verifiers", "Subject-bound evidence closure", "Core-owned policy and Gate authority", "Immutable retry and zero-call replay", "Strict integration barrier", "Trusted candidate and approved traceability"],
    behaviorFlows: ["Core validates the exact work item, execution result, baselines, repository base, and candidate workspace.", "Core expands every verification-plan, required-evidence, acceptance, architecture, contract, and policy obligation.", "Core selects and validates version-pinned verifier bindings and required independence.", "The host invokes evidence-producing adapters with bounded obligation partitions and least privilege.", "Raw verifier results are checkpointed before canonical evaluation.", "Core normalizes subject-bound evidence and evaluates the exact policy.", "WorkItemVerificationGate independently approves or rejects the exact candidate.", "Trusted contributors merge candidate links and, only after approval, verified-by evidence links; ChangeIntegration is next."],
    dataResponsibilities: ["ValidatedVerificationSubject binds every exact input digest.", "VerificationObligationSet is complete and adapter-immutable.", "ValidatedVerifierBindingSet binds adapter, version, configuration, permissions, obligation partition, and independence proof.", "VerificationAttempt and RawVerifierResult remain immutable and replayable.", "NormalizedEvidenceSet binds provenance, producer, command, bytes, observation, and exact subject.", "VerificationCandidate carries one closed outcome without integration authority.", "ApprovedWorkItemVerification binds Gate approval and authorizes only ChangeIntegration consideration."],
    failureHandling: ["Subject or baseline drift stops before verifier entry.", "Missing verifier capability, invalid binding, host denial, or independence failure produces no approved result.", "Failure, interruption, and needs-evidence remain durable terminal attempts.", "Malformed, stale, substituted, unrelated, or incomplete evidence fails before Gate approval.", "Retry or added evidence creates a new linked VerificationAttempt."],
    securityPrivacy: ["External host enforces declared verifier permissions and workspace isolation.", "Secrets are referenced, never embedded in portable artifacts.", "Verifier adapters cannot access Core Gate, policy authority, or TraceabilityGraph services.", "Evidence retention and redaction preserve raw digest identity and explicit transformations."],
    performanceReliabilityOperability: ["Independent verifier bindings may run in parallel for disjoint obligation partitions.", "Per-item attempts isolate failures and evidence continuations.", "Exact checkpoints prevent duplicate verifier effects.", "Closed obligation and evidence diagnostics make missing proof observable."],
    compatibilityMigrationRollout: ["V1 ships provider-neutral test and review verifier ports.", "Language-specific tests, linters, security scanners, documentation checks, and human review remain edge adapters.", "Adapter maturity is explicit: contract-defined, fixture-conformant, live-conformant, or release-ready.", "No provider identity enters canonical verification outcomes."],
    verificationIntent: ["Test exact and cross-subject input bindings.", "Test complete and adapter-suppressed obligation sets.", "Test verifier capability, version, permission, and independence bindings.", "Test valid, missing, stale, substituted, truncated, unrelated, and over-scoped evidence.", "Test all five closed outcomes.", "Test success, failure, interruption, retry, continuation, and zero-call replay.", "Reject verification self-approval and integration claims.", "Test candidate and approved traceability scopes and atomic merge."],
    interfaceIntentIds: interfaces.filter(({ id }) => id.startsWith("IF-WIV-")).map(({ id }) => id),
    constraintIds: constraints.filter(({ id }) => id.startsWith("CON-WIV-")).map(({ id }) => id),
    sourceRequirementIds: Object.values(CG),
    sourceRefs: [],
  };

  const decisionSpecs = [
    ["ADR-WIV-001", "Verify one exact immutable execution result per invocation", "OPT-WIV-ONE-SUBJECT", "OPT-WIV-MULTI-ITEM-BATCH", [CG.verify, CG.exactSubject], [{ kind: "constraint", id: "CON-WIV-ONE-SUBJECT" }]],
    ["ADR-WIV-002", "Keep obligation expansion, evidence validation, and policy evaluation in Core", "OPT-WIV-CORE-AUTHORITY", "OPT-WIV-ADAPTER-SELF-CERTIFICATION", [CG.verify, CG.evidenceClosure, CG.authority], [{ kind: "element", id: "EL-WIV-OBLIGATION-EXPANDER" }, { kind: "element", id: "EL-WIV-POLICY-EVALUATOR" }]],
    ["ADR-WIV-003", "Use evidence-only verifier adapters behind one provider-neutral port", "OPT-WIV-EVIDENCE-PORT", "OPT-WIV-PROVIDER-BRANCHES-IN-CORE", [CG.verify, CG.isolation, CG.host], [{ kind: "element", id: "EL-WIV-VERIFIER-PORT" }]],
    ["ADR-WIV-004", "Require Core-proven verifier independence when policy demands it", "OPT-WIV-CORE-INDEPENDENCE-PROOF", "OPT-WIV-ADAPTER-SELF-DECLARES-INDEPENDENCE", [CG.authority, CG.isolation], [{ kind: "element", id: "EL-WIV-BINDING-VALIDATOR" }]],
    ["ADR-WIV-005", "Separate verification approval from ChangeIntegration", "OPT-WIV-VERIFIED-NOT-INTEGRATED", "OPT-WIV-VERIFY-AND-INTEGRATE", [CG.authority, CG.noIntegration], [{ kind: "element", id: "EL-WIV-GATE" }, { kind: "constraint", id: "CON-WIV-NO-INTEGRATION" }]],
  ];
  const decisions = decisionSpecs.map(([id, title, chosen, rejected, requirements, targets]) => ({ id, title, chosen, rejected, requirements, targets, supersedes: [] }));

  const assumptions = [
    { id: "ASM-WIV-HOST-CONFORMANCE", statement: "The external host exposes enforceable verifier workspace and permission primitives and returns evidence of the exact policy applied.", status: "confirmed", blocking: false },
    { id: "ASM-WIV-EVIDENCE-KINDS", statement: "Approved verification plans and policies use controlled provider-neutral evidence-kind identifiers that configured adapters can declare.", status: "confirmed", blocking: false },
    { id: "ASM-WIV-INTEGRATION-DOWNSTREAM", statement: "ChangeIntegration consumes only exact Gate-approved verification artifacts and remains the sole owner of repository integration and integrated-completion facts.", status: "confirmed", blocking: false },
  ];
  const risks = [
    { id: "RISK-WIV-WRONG-SUBJECT", statement: "Valid evidence may describe different code, workspace, attempt, or repository bytes.", impact: "An unrelated result could approve the candidate.", mitigation: "Require exact subject digests on every accepted evidence record and reject implicit reuse." },
    { id: "RISK-WIV-INCOMPLETE-PLAN", statement: "An adapter may omit an expensive or failing obligation.", impact: "Partial evidence could appear complete.", mitigation: "Expand obligations in Core before adapter selection and require one explicit disposition per obligation." },
    { id: "RISK-WIV-SELF-REVIEW", statement: "The executor and verifier may be the same hidden identity.", impact: "Required independent review could be bypassed.", mitigation: "Bind canonical producer identities and let Core prove independence under policy." },
    { id: "RISK-WIV-DUPLICATE-EFFECT", statement: "Retry may rerun costly or externally effectful verification.", impact: "Duplicate jobs, cost, or inconsistent observations may result.", mitigation: "Checkpoint exact raw results before evaluation and use idempotency keys at adapter boundaries." },
    { id: "RISK-WIV-INTEGRATION-CONFLATION", statement: "A verified result may be mistaken for an integrated completion fact.", impact: "Core could unlock dependent work before the change is incorporated.", mitigation: "Use closed artifacts and traceability vocabularies that permit only ChangeIntegration consideration." },
  ];

  const alreadyDesignedTargets = new Map();
  for (const [kind, items, idOf] of [
    ["element", baseSections.architectureModel.content.elements, ({ id }) => id],
    ["relationship", baseSections.architectureModel.content.relationships, ({ id }) => id],
    ["interface", baseSections.interfaceIntent.content.interfaces, ({ id }) => id],
    ["constraint", baseSections.architectureConstraints.content.constraints, ({ id }) => id],
    ["decision", baseSections.decisionRecords.content.decisions, ({ id }) => id],
  ]) {
    for (const item of items) for (const requirementId of item.sourceRequirementIds ?? []) {
      const targets = alreadyDesignedTargets.get(requirementId) ?? [];
      targets.push({ kind, id: idOf(item) });
      alreadyDesignedTargets.set(requirementId, targets);
    }
  }

  alreadyDesignedTargets.set("US-DEV-SPECIFY-001", [
    { kind: "element", id: "EL-WB-MODULE" },
  ]);
  alreadyDesignedTargets.set("NFR-DEV-DETERMINISM-001", [
    { kind: "element", id: "EL-DEVRELAY-CORE" },
  ]);
  alreadyDesignedTargets.set("NFR-DEV-PORTABILITY-001", [
    { kind: "element", id: "EL-WB-ADAPTER-PORT" },
  ]);

  return {
    CG, allNormativeIds, alreadyDesignedTargets, baseSections, model, scope,
    openSpecDesign, diagramViewSpecs, decisionSpecs: decisions, technicalDesign,
    interfaces, constraints, assumptions, risks, uniq,
  };
}