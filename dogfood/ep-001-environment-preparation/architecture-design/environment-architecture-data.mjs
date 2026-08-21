const uniq = (...values) => [...new Set(values.flat())];

function element({ id, name, type, parentId, description, responsibilities, sourceRequirementIds, tags = [] }) {
  return {
    id, name, type, ...(parentId === undefined ? {} : { parentId }), description,
    technology: type === "software-system" ? "" : "Provider-neutral DevRelay contract",
    responsibilities, tags: [type === "container" ? "Container" : "Component", ...tags],
    properties: {}, sourceRequirementIds: uniq(sourceRequirementIds), sourceRefs: [],
  };
}
const container = (id, name, description, responsibilities, requirements, tags = []) =>
  element({ id, name, type: "container", parentId: "EL-DEVRELAY-SYSTEM", description, responsibilities, sourceRequirementIds: requirements, tags });
const component = (id, name, parentId, description, responsibilities, requirements, tags = []) =>
  element({ id, name, type: "component", parentId, description, responsibilities, sourceRequirementIds: requirements, tags });
const relationship = (id, sourceElementId, targetElementId, description, requirements) => ({
  id, sourceElementId, targetElementId, description, interactionStyle: "synchronous", tags: [], sourceRequirementIds: uniq(requirements), sourceRefs: [],
});
function interfaceIntent({ id, name, provider, consumers, inputs, outputs, requirements, failure, security }) {
  return {
    id, name, purpose: name, ownerBoundary: provider, providerElementId: provider,
    consumerElementIds: consumers, interactionStyle: "synchronous", semanticInputs: inputs, semanticOutputs: outputs,
    protocolConstraints: ["Exact artifact versions and content digests", "Canonical provider-neutral semantics", "Explicit grants, authority, and failure dispositions"],
    failureBehavior: failure,
    compatibilityObligations: ["Stable canonical behavior on ChatGPT/Codex Desktop for Windows", "Unproven technology adapters cannot create support claims"],
    securityPrivacyIntent: security,
    deliveryConsistencyIntent: ["Validate raw bytes and fingerprints before progression", "Preserve candidates, effects, receipts, approvals, checkpoints, and supersession"],
    contractGeneration: { required: true, suggestedKinds: ["json-schema"] },
    sourceRequirementIds: uniq(requirements), sourceRefs: [],
  };
}
function constraint(id, category, statement, appliesTo, requirements) {
  return {
    id, category, strength: "must", statement, rationale: statement, appliesTo,
    verificationIntent: "Dedicated positive, negative, drift, permission, rollback, secret, network, replay, concurrency, and Windows Desktop conformance fixtures.",
    sourceRequirementIds: uniq(requirements), sourceRefs: [],
  };
}
function baselineCoverage(baseSections, normativeIds) {
  const map = new Map(normativeIds.map((id) => [id, new Map()]));
  const cite = (kind, id, ids) => {
    for (const requirementId of ids ?? []) {
      const targets = map.get(requirementId);
      if (targets) targets.set(`${kind}:${id}`, { kind, id });
    }
  };
  for (const item of baseSections.architectureModel.content.elements) cite("element", item.id, item.sourceRequirementIds);
  for (const item of baseSections.architectureModel.content.relationships) cite("relationship", item.id, item.sourceRequirementIds);
  for (const item of baseSections.interfaceIntent.content.interfaces) cite("interface", item.id, item.sourceRequirementIds);
  for (const item of baseSections.architectureConstraints.content.constraints) cite("constraint", item.id, item.sourceRequirementIds);
  for (const item of baseSections.decisionRecords.content.decisions) cite("decision", item.id, item.sourceRequirementIds);
  return new Map([...map].map(([id, targets]) => [id, [...targets.values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))]));
}

export function buildEnvironmentArchitecture({ architectureBaseline, requirements }) {
  const EP = Object.freeze({
    profile: "US-DEV-ENVIRONMENT-PROFILE-001",
    prepare: "US-DEV-ENVIRONMENT-PREPARE-001",
    verify: "US-DEV-ENVIRONMENT-VERIFY-001",
    evidence: "US-DEV-ENVIRONMENT-EVIDENCE-001",
    deterministic: "NFR-EP-DETERMINISM-001",
    security: "NFR-EP-SECURITY-001",
    reliability: "NFR-EP-RELIABILITY-001",
    usability: "NFR-EP-USABILITY-001",
    performance: "NFR-EP-PERFORMANCE-001",
    authority: "CON-EP-AUTHORITY-001",
    host: "CON-EP-HOST-001",
    effects: "CON-EP-EFFECTS-001",
    secrets: "CON-EP-SECRETS-001",
    network: "CON-EP-NETWORK-001",
    trace: "CON-EP-TRACE-001",
  });
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missing = Object.values(EP).filter((id) => !declaredIds.has(id));
  if (missing.length) throw new Error(`EP-001 architecture drivers are absent: ${missing.join(", ")}`);

  const allNormativeIds = [
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ];
  const newNormativeIds = Object.values(EP);
  const baseSections = architectureBaseline.sections;
  const alreadyDesignedTargets = baselineCoverage(baseSections, allNormativeIds);
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-EP-001";

  model.elements.push(
    container("EL-EP-MODULE", "EnvironmentPreparation", "Semantic module that resolves profiles, inventories state, and proposes or performs capability-gated preparation without readiness authority.", ["Resolve exact host and project profiles", "Inventory current environment", "Build consolidated remediation", "Invoke bounded capability adapters", "Assemble redacted evidence"], [EP.profile, EP.prepare, EP.evidence, EP.effects], ["SemanticModule"]),
    component("EL-EP-PROFILE-RESOLVER", "Environment Profile Resolver", "EL-EP-MODULE", "Resolves approved host and named project profiles against work and assignment context.", ["Validate profile closure", "Bind required and optional checks", "Reject ambiguous selection"], [EP.profile, EP.verify, EP.deterministic]),
    component("EL-EP-INVENTORY-PORT", "Environment Inventory Port", "EL-EP-MODULE", "Defines bounded provider-neutral environment observation capabilities.", ["Invoke exact configured inventory adapter", "Preserve raw observations", "Normalize current facts"], [EP.profile, EP.evidence, EP.security]),
    component("EL-EP-NATIVE-WINDOWS-INVENTORY", "Native Windows Inventory Adapter", "EL-EP-MODULE", "Inventories the controlled Windows Desktop host and project-local toolchain without implying arbitrary target support.", ["Read OS, architecture, shells, runtimes, tools, services, paths, and presence metadata", "Emit exact command and version receipts", "Remain offline by default"], [EP.profile, EP.evidence, EP.host, EP.security]),
    component("EL-EP-PREPARATION-PLANNER", "Environment Preparation Planner", "EL-EP-MODULE", "Builds one deterministic consolidated plan for all required gaps.", ["Classify required and optional gaps", "Declare effects and grants", "Declare rollback, impact, and evidence obligations"], [EP.prepare, EP.usability, EP.effects]),
    component("EL-EP-CAPABILITY-BRIDGE", "Environment Capability Adapter Bridge", "EL-EP-MODULE", "Binds optional acquire, configure, service-check, and target-probe adapters by capability rather than product identity.", ["Resolve exact adapter maturity", "Reject undeclared effects", "Prevent tool-specific Core routing"], [EP.prepare, EP.security, EP.network, EP.effects]),
    component("EL-EP-EVIDENCE-ASSEMBLER", "Environment Evidence Assembler", "EL-EP-MODULE", "Normalizes redacted observation and effect receipts into the candidate preparation result.", ["Bind commands, versions, configuration, grants, durations, outputs, and fingerprints", "Reject secret values", "Produce deterministic diagnostics"], [EP.evidence, EP.deterministic, EP.security, EP.performance]),
    component("EL-EP-ROUTER", "Environment Operation Router", "EL-DEVRELAY-CORE", "Selects establish-environment, prepare-frontier, revalidate-frontier, or remediate-drift from exact project state.", ["Reject caller-selected operations", "Bind current baselines and frontier identity", "Route only declared transitions"], [EP.profile, EP.verify, EP.deterministic, EP.authority]),
    component("EL-EP-FINGERPRINT", "Environment Fingerprint Service", "EL-DEVRELAY-CORE", "Derives profile-scoped redacted fingerprints from validated current facts.", ["Bind repository and upstream baselines", "Bind adapters, tools, host, and target facts", "Detect expiry and drift"], [EP.verify, EP.evidence, EP.deterministic, EP.security]),
    component("EL-EP-CHECKPOINT", "Environment Effect Checkpoint Controller", "EL-DEVRELAY-CORE", "Durably checkpoints preparation effects and replays exact results without repeated mutations.", ["Checkpoint before progression", "Recover crashes and partial effects", "Preserve immutable attempts"], [EP.prepare, EP.deterministic, EP.reliability, EP.effects]),
    component("EL-EP-GATE", "Environment Verification Gate", "EL-DEVRELAY-CORE", "Evaluates exact current evidence and policy and alone authorizes the bound WorkExecution attempt.", ["Evaluate required and optional checks", "Reject stale or substituted evidence", "Emit closed readiness outcomes"], [EP.verify, EP.authority, EP.reliability]),
    component("EL-EP-READINESS-BINDER", "Execution Readiness Binder", "EL-DEVRELAY-CORE", "Binds an approved readiness receipt to one ready frontier and execution attempt.", ["Revalidate immediately before execution", "Prevent receipt reuse across attempts", "Expose exact authorization to WorkExecution input guard"], [EP.verify, EP.evidence, EP.authority, EP.deterministic]),
    component("EL-EP-TRACE-CONTRIBUTOR", "Environment Traceability Contributor", "EL-DEVRELAY-CORE", "Projects approved forward profile, work, readiness, and execution relationships.", ["Reject adapter-authored graph operations", "Merge after Gate approval", "Record graph checkpoint and merge proof"], [EP.evidence, EP.trace, EP.authority]),
  );

  model.relationships.push(
    relationship("REL-EP-SA-ROUTER", "EL-SA-GATE", "EL-EP-ROUTER", "Supplies approved assignments and the next dependency frontier for environment routing.", [EP.profile, EP.verify, EP.authority]),
    relationship("REL-EP-ROUTER-PROFILE", "EL-EP-ROUTER", "EL-EP-PROFILE-RESOLVER", "Invokes exact profile resolution for the bound frontier.", [EP.profile, EP.deterministic]),
    relationship("REL-EP-PROFILE-INVENTORY", "EL-EP-PROFILE-RESOLVER", "EL-EP-INVENTORY-PORT", "Supplies required and optional facts to inventory.", [EP.profile, EP.verify]),
    relationship("REL-EP-INVENTORY-NATIVE", "EL-EP-INVENTORY-PORT", "EL-EP-NATIVE-WINDOWS-INVENTORY", "Uses the V1 native Windows inventory binding.", [EP.profile, EP.host, EP.security]),
    relationship("REL-EP-INVENTORY-PLANNER", "EL-EP-INVENTORY-PORT", "EL-EP-PREPARATION-PLANNER", "Supplies normalized gaps without mutation authority.", [EP.prepare, EP.evidence]),
    relationship("REL-EP-PLANNER-BRIDGE", "EL-EP-PREPARATION-PLANNER", "EL-EP-CAPABILITY-BRIDGE", "Invokes only approved capability-scoped effects.", [EP.prepare, EP.effects, EP.network]),
    relationship("REL-EP-BRIDGE-CHECKPOINT", "EL-EP-CAPABILITY-BRIDGE", "EL-EP-CHECKPOINT", "Persists each exact effect result before progression.", [EP.prepare, EP.deterministic, EP.reliability]),
    relationship("REL-EP-CHECKPOINT-EVIDENCE", "EL-EP-CHECKPOINT", "EL-EP-EVIDENCE-ASSEMBLER", "Supplies restart-safe effect receipts and before/after state.", [EP.evidence, EP.reliability]),
    relationship("REL-EP-INVENTORY-EVIDENCE", "EL-EP-INVENTORY-PORT", "EL-EP-EVIDENCE-ASSEMBLER", "Supplies exact raw and normalized observation evidence.", [EP.evidence, EP.security]),
    relationship("REL-EP-EVIDENCE-FINGERPRINT", "EL-EP-EVIDENCE-ASSEMBLER", "EL-EP-FINGERPRINT", "Supplies redacted current facts for deterministic fingerprinting.", [EP.evidence, EP.deterministic, EP.security]),
    relationship("REL-EP-FINGERPRINT-GATE", "EL-EP-FINGERPRINT", "EL-EP-GATE", "Supplies current profile-bound fingerprints and drift diagnostics.", [EP.verify, EP.reliability, EP.authority]),
    relationship("REL-EP-EVIDENCE-GATE", "EL-EP-EVIDENCE-ASSEMBLER", "EL-EP-GATE", "Supplies exact policy evidence and warnings.", [EP.verify, EP.evidence, EP.authority]),
    relationship("REL-EP-GATE-BINDER", "EL-EP-GATE", "EL-EP-READINESS-BINDER", "Issues an exact ready receipt for one bound frontier and attempt.", [EP.verify, EP.authority, EP.deterministic]),
    relationship("REL-EP-BINDER-WE", "EL-EP-READINESS-BINDER", "EL-WE-INPUT-GUARD", "Authorizes WorkExecution only after immediate fingerprint revalidation.", [EP.verify, EP.authority, EP.reliability]),
    relationship("REL-EP-GATE-TRACE", "EL-EP-GATE", "EL-EP-TRACE-CONTRIBUTOR", "Supplies approved readiness facts for trusted forward graph contribution.", [EP.evidence, EP.trace, EP.authority]),
  );

  const viewFor = ({ viewKey, type, title, purpose, scopeElementId, elementIds }) => {
    const included = new Set(elementIds);
    return {
      viewKey, type, title, purpose, audience: ["engineering", "architecture", "verification", "operators"], scopeElementId, elementIds,
      relationshipIds: model.relationships.filter(({ sourceElementId, targetElementId }) => included.has(sourceElementId) && included.has(targetElementId)).map(({ id }) => id),
    };
  };
  const priorViews = baseSections.diagrams.content.views.map(({ renderings: _renderings, ...view }) => structuredClone(view));
  const children = (parentId) => model.elements.filter(({ type, parentId: parent }) => type === "component" && parent === parentId).map(({ id }) => id);
  const diagramViewSpecs = [
    ...priorViews,
    viewFor({ viewKey: "VIEW-EP-CONTAINERS", type: "container", title: "EP-001 top-level containers", purpose: "Show EnvironmentPreparation between assignment and execution boundaries.", scopeElementId: "EL-DEVRELAY-SYSTEM", elementIds: model.elements.filter(({ type, parentId }) => type === "container" && parentId === "EL-DEVRELAY-SYSTEM").map(({ id }) => id) }),
    viewFor({ viewKey: "VIEW-EP-MODULE-COMPONENTS", type: "component", title: "EnvironmentPreparation components", purpose: "Show profile, inventory, planning, capability adapter, and evidence boundaries.", scopeElementId: "EL-EP-MODULE", elementIds: children("EL-EP-MODULE") }),
    viewFor({ viewKey: "VIEW-EP-CORE-COMPONENTS", type: "component", title: "Environment Core services", purpose: "Show routing, fingerprinting, checkpointing, Gate, readiness binding, and trace authority.", scopeElementId: "EL-DEVRELAY-CORE", elementIds: children("EL-DEVRELAY-CORE").filter((id) => id.startsWith("EL-EP-")) }),
  ];

  const scope = {
    level: "change",
    boundary: "DevRelay EP-001 environment profile, preparation, readiness, evidence, and execution-authorization boundary.",
    in: ["host and named project profiles", "native Windows inventory", "capability-oriented adapters", "consolidated remediation", "granted preparation effects", "rollback and recovery", "redacted fingerprints", "EnvironmentVerificationGate", "per-frontier revalidation", "forward traceability"],
    out: ["product work execution", "dependency or assignment changes", "system verification", "deployment or staging success", "release packaging or promotion", "secret storage", "silent global mutation", "unproven host or technology support"],
  };
  const openSpecDesign = `# DevRelay EP-001 EnvironmentPreparation/Verification architecture change\n\n## Context\n\nWorkExecution can currently begin without one approved profile-bound proof that the exact host and project environment is safe and ready.\n\n## Decision\n\nAdd EnvironmentPreparation as a provider-neutral semantic module after SpecialistAssignmentGate. Keep profile resolution, inventory, remediation, and effect proposals in the module. Keep fingerprinting, checkpointing, EnvironmentVerificationGate, readiness-to-attempt binding, and traceability authority in Core.\n\n## Adapters\n\nShip a native Windows inventory/verifier for the controlled host. Expose inventory, acquire, configure, service-check, and target-probe capability slots so external tools remain optional bounded bindings.\n\n## Failure behavior\n\nUnknown or failed required checks, stale fingerprints, missing grants, unsafe rollback, secret leakage, undeclared network access, or adapter drift blocks WorkExecution. Exact replay performs zero effects.\n`;

  const interfaces = structuredClone(baseSections.interfaceIntent.content.interfaces);
  interfaces.push(
    interfaceIntent({ id: "IF-EP-PROFILE", name: "Environment profile resolution", provider: "EL-EP-PROFILE-RESOLVER", consumers: ["EL-EP-INVENTORY-PORT", "EL-EP-PREPARATION-PLANNER", "EL-EP-GATE"], inputs: ["Approved requirements, architecture, contracts, work, dependency, assignment, ProjectOverview, repository commit, host policy, and named profile set"], outputs: ["Exact host/project profile bindings, required and optional checks, freshness policy, and diagnostics"], requirements: [EP.profile, EP.verify, EP.deterministic], failure: "Block on missing, conflicting, unclosed, unsupported, or ambiguous profile selection.", security: ["Profiles contain secret references and presence metadata only"] }),
    interfaceIntent({ id: "IF-EP-INVENTORY", name: "Environment inventory", provider: "EL-EP-INVENTORY-PORT", consumers: ["EL-EP-NATIVE-WINDOWS-INVENTORY", "EL-EP-EVIDENCE-ASSEMBLER"], inputs: ["Exact profile facts, repository root, grants, adapter binding, and inventory policy"], outputs: ["Raw observation bundle, normalized current facts, command/version receipts, warnings, and gaps"], requirements: [EP.profile, EP.evidence, EP.security, EP.host], failure: "Fail closed on unreadable required facts, provider substitution, unsafe output, unapproved transmission, or missing provenance.", security: ["Offline and read-only by default", "Secret values are prohibited"] }),
    interfaceIntent({ id: "IF-EP-REMEDIATION", name: "Environment remediation plan", provider: "EL-EP-PREPARATION-PLANNER", consumers: ["EL-EP-CAPABILITY-BRIDGE", "EL-DEVRELAY-CORE"], inputs: ["Required and optional gaps, capability catalog, host policy, current fingerprints, and evidence obligations"], outputs: ["One consolidated ordered plan with effects, grants, impact, rollback, idempotency, evidence, and clarification"], requirements: [EP.prepare, EP.usability, EP.effects], failure: "Return clarification or unable-to-proceed for unresolved intent, unsupported rollback, missing capability, or conflicting remediation.", security: ["Machine-global actions require separate exact approval"] }),
    interfaceIntent({ id: "IF-EP-EFFECT", name: "Environment capability effect", provider: "EL-EP-CAPABILITY-BRIDGE", consumers: ["EL-EP-CHECKPOINT", "EL-EP-EVIDENCE-ASSEMBLER"], inputs: ["Exact capability operation, adapter/tool version, configuration, grants, mutation plan, rollback plan, idempotency key, and before fingerprint"], outputs: ["Raw effect result, after fingerprint, rollback state, duration, command receipt, artifacts, and diagnostics"], requirements: [EP.prepare, EP.security, EP.network, EP.effects, EP.reliability], failure: "Checkpoint failed or interrupted effects and never silently retry, escalate grants, change adapter, or fall back online.", security: ["Canonical least-privilege grants", "No secret value persistence"] }),
    interfaceIntent({ id: "IF-EP-VERIFY", name: "Environment readiness evaluation", provider: "EL-EP-GATE", consumers: ["EL-EP-READINESS-BINDER", "EL-EP-TRACE-CONTRIBUTOR"], inputs: ["Approved baseline, exact current fingerprints, required/optional check evidence, policy, receipts, freshness, checkpoint replay, and frontier identity"], outputs: ["Ready, needs-clarification, remediation-required, baseline-drift, or unable-to-proceed plus exact proof"], requirements: [EP.verify, EP.authority, EP.reliability, EP.deterministic], failure: "Any failed or unknown required check, drift, substitution, stale evidence, or policy mismatch blocks progression.", security: ["Only Gate-owned proof activates readiness"] }),
    interfaceIntent({ id: "IF-EP-READINESS", name: "Execution readiness binding", provider: "EL-EP-READINESS-BINDER", consumers: ["EL-WE-INPUT-GUARD"], inputs: ["Gate-owned readiness proof, frontier, work item, assignment, execution attempt, repository commit, and immediate current fingerprint"], outputs: ["Single-use EnvironmentReadinessReceipt or deterministic drift diagnostic"], requirements: [EP.verify, EP.evidence, EP.authority, EP.deterministic], failure: "Reject attempt, work, frontier, repository, profile, fingerprint, or receipt reuse mismatch before executor invocation.", security: ["Readiness grants no additional filesystem, process, network, or secret capability"] }),
    interfaceIntent({ id: "IF-EP-TRACE", name: "Environment traceability contribution", provider: "EL-EP-TRACE-CONTRIBUTOR", consumers: ["EL-DEVRELAY-CORE"], inputs: ["Validated profiles, approved readiness proof, work and attempt identities, evidence, and source artifacts"], outputs: ["Deterministic forward graph update, update digest, merge proof, and resulting checkpoint"], requirements: [EP.evidence, EP.trace, EP.authority], failure: "Reject adapter graph operations, inverse edges, unapproved profiles, stale readiness, or unknown endpoints.", security: ["Trusted contributor vocabulary only"] }),
  );

  const constraints = structuredClone(baseSections.architectureConstraints.content.constraints);
  constraints.push(
    constraint("CON-EP-GATE-AUTHORITY", "organizational", "EnvironmentVerificationGate alone authorizes the exact WorkExecution attempt; module and adapter outputs remain candidates and evidence.", [{ kind: "element", id: "EL-EP-GATE" }, { kind: "interface", id: "IF-EP-READINESS" }], [EP.verify, EP.authority]),
    constraint("CON-EP-PROJECT-LOCAL", "security", "Preparation defaults to project-local reversible state; machine-global changes require separate approval, exact grants, and supported rollback.", [{ kind: "element", id: "EL-EP-PREPARATION-PLANNER" }, { kind: "interface", id: "IF-EP-EFFECT" }], [EP.prepare, EP.effects, EP.security]),
    constraint("CON-EP-SECRET-BOUNDARY", "security", "Secret values cannot enter profiles, evidence, fingerprints, logs, graph facts, or receipts.", [{ kind: "element", id: "EL-EP-EVIDENCE-ASSEMBLER" }, { kind: "interface", id: "IF-EP-INVENTORY" }], [EP.evidence, EP.secrets, EP.security]),
    constraint("CON-EP-NETWORK-DEFAULT", "security", "Network is denied by default and requires exact destination and purpose grants; every attempt is receipt-bound.", [{ kind: "element", id: "EL-EP-CAPABILITY-BRIDGE" }, { kind: "interface", id: "IF-EP-EFFECT" }], [EP.prepare, EP.network, EP.security]),
    constraint("CON-EP-FINGERPRINT-CLOSURE", "data", "Readiness binds repository, upstream baselines, profiles, adapters, tools, host, target facts, and attempt identity and is revalidated before every frontier.", [{ kind: "element", id: "EL-EP-FINGERPRINT" }, { kind: "element", id: "EL-EP-READINESS-BINDER" }], [EP.verify, EP.deterministic, EP.reliability]),
    constraint("CON-EP-REPLAY", "operational", "Exact checkpoint replay performs zero preparation effects; drift or expiry creates a new immutable attempt.", [{ kind: "element", id: "EL-EP-CHECKPOINT" }, { kind: "interface", id: "IF-EP-EFFECT" }], [EP.prepare, EP.deterministic, EP.reliability]),
    constraint("CON-EP-SUPPORT-CLAIM", "operational", "Only the native Windows Desktop host is release-supported; project technology profiles require exact live adapter evidence before support is reported.", [{ kind: "element", id: "EL-EP-NATIVE-WINDOWS-INVENTORY" }, { kind: "interface", id: "IF-EP-PROFILE" }], [EP.profile, EP.host, EP.evidence]),
  );

  const technicalDesign = {
    technicalDesignId: "TD-EP-001",
    objective: "Prove the exact environment required by approved work is safely prepared and currently ready before WorkExecution begins.",
    scope,
    problemSummary: "A valid work plan and assignment do not prove that required runtimes, tools, services, configuration, permissions, and target facts are present or safe to use.",
    solutionSummary: "Add profile-based EnvironmentPreparation plus Core-owned fingerprinting, effect checkpoints, EnvironmentVerificationGate, readiness binding, and trusted traceability.",
    requirementsDrivers: ["Fail-closed readiness", "Windows Desktop release evidence", "Provider neutrality", "Least privilege", "Secret safety", "Drift detection", "Zero-effect replay", "Human-readable remediation"],
    behaviorFlows: ["Core resolves the exact host and project profiles after SpecialistAssignmentGate.", "Native and optional inventory adapters observe current state without readiness authority.", "The planner consolidates all required gaps and presents effects, grants, impact, rollback, and evidence.", "Approved capability adapters execute project-local effects and checkpoint each result.", "Core fingerprints current state and EnvironmentVerificationGate evaluates exact required and optional evidence.", "The readiness binder revalidates and authorizes one execution attempt.", "Every later frontier repeats fingerprint validation; drift creates a new immutable remediation cycle."],
    dataResponsibilities: ["EnvironmentProfile declares required and optional facts.", "EnvironmentBaseline owns approved profiles and policy.", "EnvironmentFingerprint is a redacted deterministic current-state identity.", "EnvironmentRemediationPlan owns proposed effects but no authority.", "EnvironmentReadinessReceipt is Gate-owned and single-attempt bound.", "Raw receipts preserve exact observations and effects without secret values."],
    failureHandling: ["Unknown or failed required checks block.", "Optional failures remain warnings.", "Missing grants, rollback, provenance, or adapters returns remediation or unable-to-proceed.", "Crash recovery uses exact effect checkpoints.", "Drift and expiry create a new attempt.", "No silent online fallback or global mutation."],
    securityPrivacy: ["Secret references and presence metadata only.", "Network denied by default.", "Canonical least-privilege grants.", "Project-local reversible changes by default.", "Adapters cannot access TraceabilityGraph or Gate authority."],
    performanceReliabilityOperability: ["Independent read checks may run with bounded parallelism.", "Effects remain serialized or isolated.", "Per-check duration, retries, cache hits, and bottlenecks are receipted.", "No universal V1 wall-clock SLA is asserted.", "Exact replay performs zero effects."],
    compatibilityMigrationRollout: ["Introduce EnvironmentNotInitialized for the current project.", "Establish the first profile baseline from the Windows host and EP-001 work requirements.", "Enable optional technology adapters only after conformance and live attestation.", "Insert revalidation before every WorkExecution frontier without changing static dependency DAG authority."],
    verificationIntent: ["Profile and route conformance.", "Required/optional policy truth tables.", "Permission, secret, network, path, rollback, crash, and replay matrices.", "Fingerprint drift and single-use receipt tests.", "Native Windows installed-package inventory.", "Full Desktop prepare, execute, drift, remediate, reverify, and replay dogfood."],
    interfaceIntentIds: interfaces.filter(({ id }) => id.startsWith("IF-EP-")).map(({ id }) => id),
    constraintIds: constraints.filter(({ id }) => id.startsWith("CON-EP-")).map(({ id }) => id),
    sourceRequirementIds: newNormativeIds,
    sourceRefs: [],
  };

  const decisionSpecs = [
    ["ADR-EP-001", "Separate EnvironmentPreparation candidates from EnvironmentVerificationGate authority", "OPT-EP-MODULE-GATE-SPLIT", "OPT-EP-PREPARER-SELF-APPROVES", [EP.prepare, EP.verify, EP.authority], [{ kind: "element", id: "EL-EP-GATE" }]],
    ["ADR-EP-002", "Model the DevRelay host and named project profiles as distinct layers", "OPT-EP-TWO-LAYER-PROFILES", "OPT-EP-SINGLE-HOST-INFERENCE", [EP.profile, EP.host, EP.deterministic], [{ kind: "element", id: "EL-EP-PROFILE-RESOLVER" }]],
    ["ADR-EP-003", "Ship native Windows inventory and capability-oriented optional adapters", "OPT-EP-NATIVE-PLUS-CAPABILITIES", "OPT-EP-TOOL-SPECIFIC-CORE", [EP.profile, EP.prepare, EP.host, EP.security], [{ kind: "element", id: "EL-EP-NATIVE-WINDOWS-INVENTORY" }, { kind: "element", id: "EL-EP-CAPABILITY-BRIDGE" }]],
    ["ADR-EP-004", "Default to project-local reversible preparation", "OPT-EP-PROJECT-LOCAL", "OPT-EP-GLOBAL-AUTOMATION", [EP.prepare, EP.effects, EP.security, EP.reliability], [{ kind: "interface", id: "IF-EP-EFFECT" }]],
    ["ADR-EP-005", "Bind readiness to exact fingerprints and revalidate every frontier", "OPT-EP-EXACT-REVALIDATION", "OPT-EP-SESSION-LONG-READY", [EP.verify, EP.deterministic, EP.reliability], [{ kind: "element", id: "EL-EP-FINGERPRINT" }, { kind: "element", id: "EL-EP-READINESS-BINDER" }]],
    ["ADR-EP-006", "Keep secret values absent and network denied by default", "OPT-EP-REFERENCES-OFFLINE", "OPT-EP-ENV-DUMP-ONLINE", [EP.evidence, EP.secrets, EP.network, EP.security], [{ kind: "element", id: "EL-EP-EVIDENCE-ASSEMBLER" }]],
    ["ADR-EP-007", "Use single-attempt readiness receipts and forward-only traceability", "OPT-EP-ATTEMPT-BOUND-RECEIPT", "OPT-EP-REUSABLE-READY-FLAG", [EP.verify, EP.evidence, EP.trace, EP.authority], [{ kind: "interface", id: "IF-EP-READINESS" }, { kind: "interface", id: "IF-EP-TRACE" }]],
  ].map(([id, title, chosen, rejected, requirements, targets]) => ({ id, title, chosen, rejected, requirements, targets, supersedes: [] }));

  const assumptions = [
    { id: "ASM-EP-BASELINE-CURRENT", statement: "The supplied PM-001 architecture baseline is the exact current approved DevRelay design baseline.", status: "confirmed", blocking: false },
    { id: "ASM-EP-WINDOWS-HOST", statement: "ChatGPT/Codex Desktop on Windows remains the only release-defining DevRelay host.", status: "confirmed", blocking: false },
    { id: "ASM-EP-ADAPTER-MATURITY", statement: "Technology-specific environment adapters cannot be reported live until exact external execution attestations pass.", status: "confirmed", blocking: false },
  ];
  const risks = [
    { id: "RISK-EP-HOST-DAMAGE", statement: "Preparation can destabilize a developer machine.", impact: "Work and unrelated software may be disrupted.", mitigation: "Project-local defaults, exact grants, separate global approval, rollback, idempotency, and effect checkpoints." },
    { id: "RISK-EP-SECRET-LEAK", statement: "Inventory can capture secret values.", impact: "Credentials may enter evidence or logs.", mitigation: "Profile-scoped allowlists, references/presence only, raw receipt redaction, and repository-wide secret scans." },
    { id: "RISK-EP-STALE-READY", statement: "Environment state can change after verification.", impact: "Execution may begin with invalid tools or configuration.", mitigation: "Single-attempt receipts and immediate fingerprint revalidation before every frontier." },
    { id: "RISK-EP-ADAPTER-SPRAWL", statement: "Tool-specific environment support can contaminate Core.", impact: "Module swapping and deterministic routing degrade.", mitigation: "Capability-oriented slots, generic Core scans, conformance suites, and honest maturity." },
    { id: "RISK-EP-SLOW-CHECKS", statement: "Comprehensive readiness checks can delay every frontier.", impact: "The workflow becomes costly to use.", mitigation: "Bounded parallel read checks, safe caching, exact drift invalidation, and measured telemetry." },
  ];

  return { DEV: {}, RUN: { inspect: EP.profile, deterministic: EP.deterministic }, EP, allNormativeIds, alreadyDesignedTargets, baseSections, model, scope, openSpecDesign, diagramViewSpecs, decisionSpecs, technicalDesign, interfaces, constraints, assumptions, risks, uniq };
}
