const uniq = (...values) => [...new Set(values.flat())];

function element({
  id,
  name,
  type,
  parentId,
  description,
  responsibilities,
  sourceRequirementIds,
  tags = [],
}) {
  return {
    id,
    name,
    type,
    ...(parentId === undefined ? {} : { parentId }),
    description,
    technology:
      type === "software-system" ? "" : "Provider-neutral DevRelay contract",
    responsibilities,
    tags: [type === "container" ? "Container" : "Component", ...tags],
    properties: {},
    sourceRequirementIds: uniq(sourceRequirementIds),
    sourceRefs: [],
  };
}
const container = (
  id,
  name,
  description,
  responsibilities,
  requirements,
  tags = [],
) =>
  element({
    id,
    name,
    type: "container",
    parentId: "EL-DEVRELAY-SYSTEM",
    description,
    responsibilities,
    sourceRequirementIds: requirements,
    tags,
  });
const component = (
  id,
  name,
  parentId,
  description,
  responsibilities,
  requirements,
  tags = [],
) =>
  element({
    id,
    name,
    type: "component",
    parentId,
    description,
    responsibilities,
    sourceRequirementIds: requirements,
    tags,
  });
const relationship = (
  id,
  sourceElementId,
  targetElementId,
  description,
  requirements,
) => ({
  id,
  sourceElementId,
  targetElementId,
  description,
  interactionStyle: "synchronous",
  tags: [],
  sourceRequirementIds: uniq(requirements),
  sourceRefs: [],
});
function interfaceIntent({
  id,
  name,
  provider,
  consumers,
  inputs,
  outputs,
  requirements,
  failure,
  security,
}) {
  return {
    id,
    name,
    purpose: name,
    ownerBoundary: provider,
    providerElementId: provider,
    consumerElementIds: consumers,
    interactionStyle: "synchronous",
    semanticInputs: inputs,
    semanticOutputs: outputs,
    protocolConstraints: [
      "Exact artifact versions, raw bytes, and content digests",
      "Canonical provider-neutral semantics",
      "Explicit grants, authority, policy, and failure dispositions",
    ],
    failureBehavior: failure,
    compatibilityObligations: [
      "Stable canonical behavior on ChatGPT/Codex Desktop for Windows",
      "Unproven hosted or release-tool adapters cannot create maturity or support claims",
    ],
    securityPrivacyIntent: security,
    deliveryConsistencyIntent: [
      "Validate source, baselines, readiness, policy, and stored candidate bytes before progression",
      "Preserve candidates, effects, receipts, approvals, checkpoints, history, and supersession",
    ],
    contractGeneration: { required: true, suggestedKinds: ["json-schema"] },
    sourceRequirementIds: uniq(requirements),
    sourceRefs: [],
  };
}
function constraint(id, category, statement, appliesTo, requirements) {
  return {
    id,
    category,
    strength: "must",
    statement,
    rationale: statement,
    appliesTo,
    verificationIntent:
      "Dedicated positive, negative, drift, permission, policy, stored-byte, supply-chain, replay, crash, concurrency, and Windows Desktop conformance fixtures.",
    sourceRequirementIds: uniq(requirements),
    sourceRefs: [],
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
  for (const item of baseSections.architectureModel.content.elements) {
    cite("element", item.id, item.sourceRequirementIds);
  }
  for (const item of baseSections.architectureModel.content.relationships) {
    cite("relationship", item.id, item.sourceRequirementIds);
  }
  for (const item of baseSections.interfaceIntent.content.interfaces) {
    cite("interface", item.id, item.sourceRequirementIds);
  }
  for (const item of baseSections.architectureConstraints.content.constraints) {
    cite("constraint", item.id, item.sourceRequirementIds);
  }
  for (const item of baseSections.decisionRecords.content.decisions) {
    cite("decision", item.id, item.sourceRequirementIds);
  }
  return new Map(
    [...map].map(([id, targets]) => [
      id,
      [...targets.values()].sort((a, b) =>
        `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
      ),
    ]),
  );
}

export function buildReleaseArchitecture({ architectureBaseline, requirements }) {
  const RP = Object.freeze({
    prepare: "US-DEV-RELEASE-PREPARE-001",
    verify: "US-DEV-RELEASE-VERIFY-001",
    evidence: "US-DEV-RELEASE-EVIDENCE-001",
    deterministic: "NFR-RP-DETERMINISM-001",
    security: "NFR-RP-SECURITY-001",
    reliability: "NFR-RP-RELIABILITY-001",
    usability: "NFR-RP-USABILITY-001",
    performance: "NFR-RP-PERFORMANCE-001",
    authority: "CON-RP-AUTHORITY-001",
    host: "CON-RP-HOST-001",
    effects: "CON-RP-EFFECTS-001",
    bytes: "CON-RP-STORED-BYTES-001",
    policy: "CON-RP-POLICY-001",
    trace: "CON-RP-TRACE-001",
    lifecycle: "CON-DEV-MODULE-INVENTORY-001",
  });
  const declaredIds = new Set([
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ]);
  const missing = Object.values(RP).filter((id) => !declaredIds.has(id));
  if (missing.length) {
    throw new Error(`RP-001 architecture drivers are absent: ${missing.join(", ")}`);
  }

  const allNormativeIds = [
    ...requirements.requirements.userStories.map(({ id }) => id),
    ...requirements.requirements.nonFunctionalRequirements.map(({ id }) => id),
    ...requirements.requirements.constraints.map(({ id }) => id),
  ];
  const newNormativeIds = Object.values(RP);
  const baseSections = architectureBaseline.sections;
  const alreadyDesignedTargets = baselineCoverage(baseSections, allNormativeIds);
  const model = structuredClone(baseSections.architectureModel.content);
  model.modelId = "MODEL-DEVRELAY-RP-001";

  model.elements.push(
    container("EL-RP-MODULE", "ReleasePreparation", "Conditional semantic module that binds approved state, materializes one exact source/library candidate, and proposes verification evidence without publication authority.", ["Bind exact candidate identity", "Materialize deterministic candidate artifacts", "Invoke bounded release capabilities", "Assemble preparation and verification observations"], [RP.prepare, RP.verify, RP.evidence, RP.effects, RP.lifecycle], ["SemanticModule"]),
    component("EL-RP-SYSTEM-VERIFICATION-BOUNDARY", "SystemVerification Contract Boundary", "EL-DEVRELAY-CORE", "Represents the exact passing SystemVerification result consumed by RP-001 without claiming that the SystemVerification implementation is delivered by this change.", ["Expose the approved upstream verification subject and evidence", "Keep the upstream module outside RP-001 implementation ownership"], [RP.prepare, RP.verify, RP.lifecycle], ["ContractBoundary"]),
    component("EL-RP-BUSINESS-ACCEPTANCE-BOUNDARY", "BusinessAcceptance Contract Boundary", "EL-DEVRELAY-CORE", "Represents the downstream BusinessAcceptance input boundary without claiming that BusinessAcceptance implementation is delivered by this change.", ["Receive Gate-owned release readiness", "Keep publication and downstream acceptance authority outside RP-001"], [RP.verify, RP.authority, RP.lifecycle], ["ContractBoundary"]),
    component("EL-RP-IDENTITY", "Release Candidate Identity Resolver", "EL-RP-MODULE", "Resolves exact source, project baselines, version, configuration, toolchain, policy, and environment readiness into one immutable attempt identity.", ["Validate identity closure", "Reject drift and ambiguous version intent", "Bind owner-controlled release designation"], [RP.prepare, RP.deterministic, RP.reliability, RP.bytes]),
    component("EL-RP-MATERIALIZER-PORT", "Release Materializer Port", "EL-RP-MODULE", "Defines bounded provider-neutral candidate materialization capabilities.", ["Invoke the exact configured materializer", "Preserve native bytes and receipts", "Return candidates without publication authority"], [RP.prepare, RP.security, RP.effects]),
    component("EL-RP-NATIVE-WINDOWS", "Native Node and Windows Release Adapter", "EL-RP-MODULE", "Catalogs, packs, hashes, builds the SBOM, and verifies installed-package behavior on the controlled Windows Desktop host.", ["Run deterministic package tooling", "Remain offline by default", "Emit exact command, byte, and version receipts"], [RP.prepare, RP.verify, RP.host, RP.security, RP.deterministic]),
    component("EL-RP-EVIDENCE", "Release Evidence Assembler", "EL-RP-MODULE", "Normalizes materialization and verification observations into compact redacted evidence bound to stored candidate bytes.", ["Bind commands, versions, configuration, outputs, durations, and checkpoints", "Reject secret or unsafe output", "Preserve explicit unavailable and not-applicable dispositions"], [RP.evidence, RP.security, RP.usability, RP.performance]),
    component("EL-RP-ROUTER", "Release Operation Router", "EL-DEVRELAY-CORE", "Selects prepare-candidate, verify-candidate, resume-candidate, or approved-not-applicable from exact state after SystemVerification.", ["Reject caller-selected operations", "Bind SystemVerification and EnvironmentReadinessReceipt", "Route only declared conditional transitions"], [RP.prepare, RP.verify, RP.authority, RP.lifecycle, RP.deterministic]),
    component("EL-RP-CHECKPOINT", "Release Effect Checkpoint Controller", "EL-DEVRELAY-CORE", "Durably checkpoints exact prepared candidate outputs before merge or external effect and replays without repeated work.", ["Checkpoint candidate bytes and effect results", "Recover crashes and partial attempts", "Preserve immutable history"], [RP.prepare, RP.deterministic, RP.reliability, RP.effects, RP.bytes]),
    component("EL-RP-STORED-BYTE-VERIFIER", "Stored Candidate Byte Verifier", "EL-DEVRELAY-CORE", "Reloads content-addressed candidate bytes and expands the versioned release verification obligations.", ["Reject rebuilds, substitutions, truncation, and digest drift", "Bind every check to one candidate", "Normalize required and not-applicable dispositions"], [RP.verify, RP.bytes, RP.policy, RP.deterministic]),
    component("EL-RP-GATE", "Release Verification Gate", "EL-DEVRELAY-CORE", "Evaluates exact candidate, policy, evidence, maturity, and owner intent and alone activates release readiness before BusinessAcceptance.", ["Require complete obligation coverage", "Reject stale or substituted evidence", "Emit readiness or closed failure outcomes without publishing"], [RP.verify, RP.authority, RP.policy, RP.lifecycle, RP.reliability]),
    component("EL-RP-SUMMARY", "Release Readiness Summary Projector", "EL-DEVRELAY-CORE", "Projects one compact Desktop summary of candidate identity, artifacts, coverage, blockers, warnings, effects, and evidence links.", ["Keep exact evidence expandable", "Consolidate proposed external effects", "Avoid creating authority from presentation"], [RP.evidence, RP.usability, RP.effects]),
    component("EL-RP-TRACE-CONTRIBUTOR", "Release Traceability Contributor", "EL-DEVRELAY-CORE", "Projects candidate and approved forward release relationships from already validated canonical artifacts.", ["Reject adapter graph operations", "Separate candidate and approved scopes", "Merge after checkpoint and Gate authority"], [RP.evidence, RP.trace, RP.authority]),
  );

  model.relationships.push(
    relationship("REL-RP-SV-ROUTER", "EL-RP-SYSTEM-VERIFICATION-BOUNDARY", "EL-RP-ROUTER", "Supplies the exact passing SystemVerification subject and evidence for conditional release routing.", [RP.lifecycle, RP.prepare, RP.verify]),
    relationship("REL-RP-EP-ROUTER", "EL-EP-GATE", "EL-RP-ROUTER", "Supplies an accepted current EnvironmentReadinessReceipt for the release attempt.", [RP.prepare, RP.security, RP.reliability]),
    relationship("REL-RP-ROUTER-IDENTITY", "EL-RP-ROUTER", "EL-RP-IDENTITY", "Invokes exact candidate identity resolution.", [RP.prepare, RP.deterministic, RP.authority]),
    relationship("REL-RP-IDENTITY-MATERIALIZER", "EL-RP-IDENTITY", "EL-RP-MATERIALIZER-PORT", "Supplies the immutable attempt, source, version, configuration, policy, grants, and toolchain binding.", [RP.prepare, RP.effects, RP.security]),
    relationship("REL-RP-MATERIALIZER-NATIVE", "EL-RP-MATERIALIZER-PORT", "EL-RP-NATIVE-WINDOWS", "Uses the native controlled Windows materialization and verification binding.", [RP.prepare, RP.verify, RP.host, RP.security]),
    relationship("REL-RP-MATERIALIZER-CHECKPOINT", "EL-RP-MATERIALIZER-PORT", "EL-RP-CHECKPOINT", "Persists exact prepared candidate bytes and raw effect results before progression.", [RP.prepare, RP.deterministic, RP.reliability, RP.effects]),
    relationship("REL-RP-CHECKPOINT-EVIDENCE", "EL-RP-CHECKPOINT", "EL-RP-EVIDENCE", "Supplies restart-safe candidate, command, effect, and checkpoint receipts.", [RP.evidence, RP.reliability, RP.bytes]),
    relationship("REL-RP-CHECKPOINT-BYTES", "EL-RP-CHECKPOINT", "EL-RP-STORED-BYTE-VERIFIER", "Supplies content-addressed candidate bytes for exact verification.", [RP.verify, RP.bytes, RP.deterministic]),
    relationship("REL-RP-NATIVE-EVIDENCE", "EL-RP-NATIVE-WINDOWS", "EL-RP-EVIDENCE", "Supplies exact native materialization and verification observations.", [RP.evidence, RP.security, RP.performance]),
    relationship("REL-RP-BYTES-GATE", "EL-RP-STORED-BYTE-VERIFIER", "EL-RP-GATE", "Supplies obligation-complete verification over exact stored bytes.", [RP.verify, RP.bytes, RP.policy, RP.authority]),
    relationship("REL-RP-EVIDENCE-GATE", "EL-RP-EVIDENCE", "EL-RP-GATE", "Supplies exact preparation, verification, supply-chain, maturity, and policy evidence.", [RP.verify, RP.evidence, RP.policy, RP.authority]),
    relationship("REL-RP-GATE-BA", "EL-RP-GATE", "EL-RP-BUSINESS-ACCEPTANCE-BOUNDARY", "Supplies Gate-owned release readiness to BusinessAcceptance without publication authority.", [RP.lifecycle, RP.verify, RP.authority]),
    relationship("REL-RP-GATE-SUMMARY", "EL-RP-GATE", "EL-RP-SUMMARY", "Supplies readiness, blockers, warnings, obligations, and exact evidence links.", [RP.evidence, RP.usability, RP.authority]),
    relationship("REL-RP-GATE-TRACE", "EL-RP-GATE", "EL-RP-TRACE-CONTRIBUTOR", "Supplies approved readiness facts for trusted graph contribution.", [RP.evidence, RP.trace, RP.authority]),
  );

  const viewFor = ({ viewKey, type, title, purpose, scopeElementId, elementIds }) => {
    const included = new Set(elementIds);
    return {
      viewKey,
      type,
      title,
      purpose,
      audience: ["engineering", "architecture", "verification", "release", "operators"],
      scopeElementId,
      elementIds,
      relationshipIds: model.relationships
        .filter(
          ({ sourceElementId, targetElementId }) =>
            included.has(sourceElementId) && included.has(targetElementId),
        )
        .map(({ id }) => id),
    };
  };
  const priorViews = baseSections.diagrams.content.views.map(
    ({ renderings: _renderings, ...view }) => structuredClone(view),
  );
  const children = (parentId) =>
    model.elements
      .filter(({ type, parentId: parent }) => type === "component" && parent === parentId)
      .map(({ id }) => id);
  const diagramViewSpecs = [
    ...priorViews,
    viewFor({ viewKey: "VIEW-RP-CONTAINERS", type: "container", title: "RP-001 top-level containers", purpose: "Show conditional ReleasePreparation between SystemVerification and BusinessAcceptance.", scopeElementId: "EL-DEVRELAY-SYSTEM", elementIds: model.elements.filter(({ type, parentId }) => type === "container" && parentId === "EL-DEVRELAY-SYSTEM").map(({ id }) => id) }),
    viewFor({ viewKey: "VIEW-RP-MODULE-COMPONENTS", type: "component", title: "ReleasePreparation components", purpose: "Show candidate identity, materialization, native tooling, and evidence boundaries.", scopeElementId: "EL-RP-MODULE", elementIds: children("EL-RP-MODULE") }),
    viewFor({ viewKey: "VIEW-RP-CORE-COMPONENTS", type: "component", title: "Release Core services", purpose: "Show routing, checkpoints, stored-byte verification, Gate, summary, and trace authority.", scopeElementId: "EL-DEVRELAY-CORE", elementIds: children("EL-DEVRELAY-CORE").filter((id) => id.startsWith("EL-RP-")) }),
  ];

  const scope = {
    level: "change",
    boundary:
      "DevRelay RP-001 release-candidate identity, materialization, verification, evidence, Gate readiness, and no-publication boundary.",
    in: ["post-SystemVerification conditional routing", "current EnvironmentReadinessReceipt", "exact source and baseline identity", "deterministic package and supporting artifacts", "stored-byte verification", "versioned release and supply-chain policy", "ReleaseVerificationGate", "compact readiness summary", "forward candidate and approved traceability"],
    out: ["publication", "deployment", "protected-main mutation", "tag creation or push", "hosted release creation", "public npm publication", "one-click Desktop installation", "non-Windows support", "secret or signing-key storage", "self-certified provider-produced source archives"],
  };
  const openSpecDesign = `# DevRelay RP-001 ReleasePreparation and ReleaseVerification architecture change

## Context

SystemVerification can prove integrated software quality but does not materialize or prove one exact release candidate, and current release scripts do not provide a semantic module and Gate boundary for candidate readiness.

## Decision

Add conditional ReleasePreparation after SystemVerification and a separate Core-owned ReleaseVerificationGate before BusinessAcceptance. Keep candidate identity and bounded materialization in the module. Keep stored-byte verification, policy evaluation, checkpoints, readiness authority, compact summary, and traceability authority in Core.

## Adapters

Ship native Node and Windows catalog, pack, checksum, SBOM, export, installed-package, and consumer verification capabilities. Expose materialize, inspect, verify, attest, and publication-prerequisite-probe slots while keeping hosted publication systems optional and non-authoritative.

## Failure behavior

Missing or stale environment readiness, identity drift, failed or unknown obligations, rebuilt or substituted bytes, policy violations, unsafe grants, secret leakage, or adapter drift blocks release readiness. Exact replay performs zero release effects. No successful result publishes, tags, deploys, or mutates protected main.
`;

  const interfaces = structuredClone(baseSections.interfaceIntent.content.interfaces);
  interfaces.push(
    interfaceIntent({ id: "IF-RP-IDENTITY", name: "Release candidate identity", provider: "EL-RP-IDENTITY", consumers: ["EL-RP-MATERIALIZER-PORT", "EL-RP-CHECKPOINT", "EL-RP-GATE"], inputs: ["Passing SystemVerification, exact source commit and tree, approved project baselines, package version, release configuration and policy, toolchain identities, owner release intent, and accepted EnvironmentReadinessReceipt"], outputs: ["Immutable ReleasePreparationAttempt identity, candidate specification, exact grants, and deterministic drift diagnostics"], requirements: [RP.prepare, RP.deterministic, RP.reliability, RP.bytes, RP.authority], failure: "Block on missing, conflicting, stale, substituted, or ambiguous source, baseline, version, policy, toolchain, readiness, or owner intent.", security: ["Identity contains references and digests, never credential or signing-key values"] }),
    interfaceIntent({ id: "IF-RP-MATERIALIZE", name: "Release candidate materialization", provider: "EL-RP-MATERIALIZER-PORT", consumers: ["EL-RP-NATIVE-WINDOWS", "EL-RP-CHECKPOINT", "EL-RP-EVIDENCE"], inputs: ["Exact attempt, source state, candidate specification, adapter and tool versions, configuration, grants, and prior checkpoints"], outputs: ["Installable tarball, catalog, SBOM, checksum ledger, release notes, legal material, evidence index, raw receipts, and diagnostics"], requirements: [RP.prepare, RP.security, RP.effects, RP.deterministic], failure: "Checkpoint failed or interrupted effects and never silently change source, version, tool, adapter, grants, outputs, or publication state.", security: ["Offline and project-local by default", "No secret, tag, upload, publication, or protected-branch authority"] }),
    interfaceIntent({ id: "IF-RP-VERIFY", name: "Stored release candidate verification", provider: "EL-RP-STORED-BYTE-VERIFIER", consumers: ["EL-RP-GATE", "EL-RP-EVIDENCE"], inputs: ["Exact content-addressed candidate bytes, release policy, required obligations, verification adapter bindings, grants, and checkpoints"], outputs: ["Subject-bound verification results, evidence dispositions, policy observations, explicit not-applicable candidates, warnings, and diagnostics"], requirements: [RP.verify, RP.bytes, RP.policy, RP.deterministic, RP.security], failure: "Fail closed on rebuild, substitution, truncation, digest mismatch, missing obligation, policy drift, unsafe evidence, or unavailable required check.", security: ["Verification cannot expand grants or infer not-applicable status"] }),
    interfaceIntent({ id: "IF-RP-GATE", name: "Release readiness evaluation", provider: "EL-RP-GATE", consumers: ["EL-RP-BUSINESS-ACCEPTANCE-BOUNDARY", "EL-RP-SUMMARY", "EL-RP-TRACE-CONTRIBUTOR"], inputs: ["Exact candidate, SystemVerification, EnvironmentReadinessReceipt, owner intent, obligation-complete verification, supply-chain policy, adapter maturity, checkpoint replay, and raw-byte approval"], outputs: ["ReleaseReadinessBaseline, needs-clarification, remediation-required, candidate-drift, rejected, or unable-to-proceed plus exact proof"], requirements: [RP.verify, RP.authority, RP.policy, RP.reliability, RP.lifecycle], failure: "Any failed, missing, stale, unknown, substituted, unapproved, or self-certified required evidence blocks readiness and all publication effects.", security: ["Gate readiness authorizes publication consideration only"] }),
    interfaceIntent({ id: "IF-RP-TRACE", name: "Release traceability contribution", provider: "EL-RP-TRACE-CONTRIBUTOR", consumers: ["EL-DEVRELAY-CORE"], inputs: ["Validated source, baselines, readiness, candidate, obligation results, Gate decision, evidence, and exact artifact bytes"], outputs: ["Deterministic candidate or approved forward graph update, update digest, merge proof, and resulting checkpoint"], requirements: [RP.evidence, RP.trace, RP.authority, RP.bytes], failure: "Reject adapter graph operations, inverse edges, cross-candidate evidence, unapproved readiness, stale bytes, or unknown endpoints.", security: ["Trusted contributor vocabulary and declared authority scope only"] }),
  );

  const constraints = structuredClone(baseSections.architectureConstraints.content.constraints);
  constraints.push(
    constraint("CON-RP-GATE-AUTHORITY", "organizational", "ReleaseVerificationGate alone activates readiness for human publication consideration; module and adapter outputs remain candidates and evidence.", [{ kind: "element", id: "EL-RP-GATE" }, { kind: "interface", id: "IF-RP-GATE" }], [RP.verify, RP.authority, RP.lifecycle]),
    constraint("CON-RP-NO-PUBLICATION", "security", "Candidate preparation and readiness cannot create or push tags, mutate protected main, publish packages, create hosted releases, deploy, or use credentials without a separate future authority boundary.", [{ kind: "element", id: "EL-RP-MATERIALIZER-PORT" }, { kind: "interface", id: "IF-RP-MATERIALIZE" }], [RP.prepare, RP.effects, RP.security, RP.authority]),
    constraint("CON-RP-BYTE-IDENTITY", "data", "Every verification and Gate decision operates on exact stored candidate bytes; rebuilds, substitutions, parsed-value equivalence, and partial retrieval are invalid.", [{ kind: "element", id: "EL-RP-STORED-BYTE-VERIFIER" }, { kind: "interface", id: "IF-RP-VERIFY" }], [RP.verify, RP.bytes, RP.deterministic]),
    constraint("CON-RP-POLICY-CLOSURE", "operational", "Every release obligation is required unless the Gate validates an explicit versioned policy-backed not-applicable disposition.", [{ kind: "element", id: "EL-RP-GATE" }, { kind: "interface", id: "IF-RP-GATE" }], [RP.verify, RP.policy, RP.reliability]),
    constraint("CON-RP-SECURITY-BOUNDARY", "security", "Execution is offline by default, tools are project-local and checksum-pinned, network is exactly granted, and secret-bearing evidence fails before persistence.", [{ kind: "element", id: "EL-RP-NATIVE-WINDOWS" }, { kind: "element", id: "EL-RP-EVIDENCE" }, { kind: "interface", id: "IF-RP-MATERIALIZE" }], [RP.prepare, RP.security, RP.effects]),
    constraint("CON-RP-REPLAY", "operational", "Exact checkpoint replay performs zero packaging, download, signing, upload, tag, publication, or branch effects; drift creates a new immutable attempt.", [{ kind: "element", id: "EL-RP-CHECKPOINT" }, { kind: "interface", id: "IF-RP-MATERIALIZE" }], [RP.prepare, RP.deterministic, RP.reliability, RP.effects]),
    constraint("CON-RP-TRACE-AUTHORITY", "organizational", "Adapters have no graph access; trusted contributors project forward facts only after validation and within candidate or approved release scopes.", [{ kind: "element", id: "EL-RP-TRACE-CONTRIBUTOR" }, { kind: "interface", id: "IF-RP-TRACE" }], [RP.evidence, RP.trace, RP.authority]),
  );

  const technicalDesign = {
    technicalDesignId: "TD-RP-001",
    objective:
      "Prepare and prove one exact source/library release candidate after SystemVerification without taking publication, deployment, tag, or protected-branch authority.",
    scope,
    problemSummary:
      "Passing integrated-system evidence does not itself identify, materialize, verify, or Gate one immutable installable release candidate.",
    solutionSummary:
      "Add conditional ReleasePreparation plus Core-owned identity validation, exact effect checkpoints, stored-byte verification, versioned obligation policy, ReleaseVerificationGate, compact readiness projection, and trusted traceability.",
    requirementsDrivers: ["Exact candidate identity", "Windows Desktop release evidence", "Provider neutrality", "No publication authority", "Supply-chain policy", "Secret safety", "Stored-byte verification", "Zero-effect replay", "Compact readiness reporting"],
    behaviorFlows: ["Core routes passing SystemVerification and current EnvironmentReadinessReceipt to exact candidate identity resolution.", "The bounded materializer produces package and supporting bytes without external publication effects.", "Core checkpoints candidate bytes before progression and reloads them for verification.", "Native and optional verification capabilities produce subject-bound observations for every release obligation.", "ReleaseVerificationGate evaluates exact bytes, policy, evidence, maturity, owner intent, and checkpoint replay.", "BusinessAcceptance receives Gate-owned readiness, while publication remains separate.", "Trusted contributors project candidate or approved forward traceability after checkpoint and Gate authority."],
    dataResponsibilities: ["ReleasePreparationAttempt owns immutable identity and lineage.", "ReleaseCandidate owns exact source/library artifact bytes and references.", "ReleaseVerificationObligation owns one required policy check.", "ReleaseVerificationResult owns subject-bound observations and evidence dispositions.", "ReleaseReadinessBaseline is Gate-owned and authorizes consideration only.", "Raw receipts preserve exact commands and effects without secret values."],
    failureHandling: ["Missing or stale EnvironmentReadinessReceipt blocks.", "Identity or policy drift creates a new attempt.", "Missing, failed, stale, unknown, or substituted required evidence blocks.", "Rebuilt, truncated, or digest-mismatched bytes block.", "Crash recovery uses exact prepared checkpoints.", "No silent online, hosted-provider, tag, publication, or deployment fallback."],
    securityPrivacy: ["Secret and credential values never enter canonical artifacts.", "Network denied by default and exact-purpose granted.", "Project-local checksum-pinned tools.", "Adapters cannot access TraceabilityGraph, Gate authority, owner decisions, or publication authority."],
    performanceReliabilityOperability: ["Independent read-only verification may run with bounded parallelism.", "Materialization and effects remain serialized or isolated.", "Durations, retries, cache hits, artifact sizes, and bottlenecks are receipted.", "No universal V1 wall-clock SLA is asserted.", "Exact replay performs zero effects."],
    compatibilityMigrationRollout: ["Add conditional ReleasePreparation and ReleaseVerificationGate between SystemVerification and BusinessAcceptance.", "Initialize RP-001 contracts and native Windows bindings from the current approved source/library release boundary.", "Retain 0.10.0-rc.3 assets as immutable historical evidence.", "Enable optional hosted release adapters only after bounded conformance and exact live attestation."],
    verificationIntent: ["Route, identity, candidate, and Gate conformance.", "Complete obligation and not-applicable policy truth tables.", "Permission, network, secret, path, supply-chain, crash, stored-byte, and replay matrices.", "Package export and isolated installed-package verification.", "Native Windows clean-checkout candidate preparation.", "Full Desktop prepare, verify, drift, substitute, recover, replay, and no-publication dogfood."],
    interfaceIntentIds: interfaces.filter(({ id }) => id.startsWith("IF-RP-")).map(({ id }) => id),
    constraintIds: constraints.filter(({ id }) => id.startsWith("CON-RP-")).map(({ id }) => id),
    sourceRequirementIds: newNormativeIds,
    sourceRefs: [],
  };

  const decisionSpecs = [
    ["ADR-RP-001", "Place conditional ReleasePreparation after SystemVerification and keep ReleaseVerificationGate separate before BusinessAcceptance", "OPT-RP-MODULE-GATE-SPLIT", "OPT-RP-SCRIPTS-OR-SELF-APPROVAL", [RP.prepare, RP.verify, RP.authority, RP.lifecycle], [{ kind: "element", id: "EL-RP-GATE" }]],
    ["ADR-RP-002", "Bind one immutable candidate identity to source, baselines, version, policy, toolchain, and environment readiness", "OPT-RP-EXACT-IDENTITY", "OPT-RP-VERSION-AND-WORKSPACE-INFERENCE", [RP.prepare, RP.deterministic, RP.reliability, RP.bytes], [{ kind: "element", id: "EL-RP-IDENTITY" }]],
    ["ADR-RP-003", "Ship native Node and Windows release capabilities behind capability-oriented optional adapter slots", "OPT-RP-NATIVE-PLUS-CAPABILITIES", "OPT-RP-HOSTED-PRODUCT-CORE", [RP.prepare, RP.verify, RP.host, RP.security], [{ kind: "element", id: "EL-RP-NATIVE-WINDOWS" }, { kind: "element", id: "EL-RP-MATERIALIZER-PORT" }]],
    ["ADR-RP-004", "Checkpoint exact prepared candidate bytes before progression and replay with zero effects", "OPT-RP-PREPARED-BYTES-CHECKPOINT", "OPT-RP-REBUILD-ON-VERIFY", [RP.prepare, RP.bytes, RP.deterministic, RP.reliability, RP.effects], [{ kind: "element", id: "EL-RP-CHECKPOINT" }]],
    ["ADR-RP-005", "Verify stored bytes against one versioned obligation and supply-chain policy", "OPT-RP-STORED-BYTE-POLICY", "OPT-RP-ADAPTER-SELF-CERTIFICATION", [RP.verify, RP.bytes, RP.policy, RP.security], [{ kind: "element", id: "EL-RP-STORED-BYTE-VERIFIER" }, { kind: "element", id: "EL-RP-GATE" }]],
    ["ADR-RP-006", "Keep execution offline and project-local by default with no implicit publication or credential authority", "OPT-RP-OFFLINE-NO-PUBLICATION", "OPT-RP-CONVENIENT-HOSTED-AUTOMATION", [RP.prepare, RP.security, RP.effects, RP.authority], [{ kind: "interface", id: "IF-RP-MATERIALIZE" }]],
    ["ADR-RP-007", "Separate candidate and approved forward release traceability and keep adapters graph-blind", "OPT-RP-TRUSTED-FORWARD-SCOPES", "OPT-RP-ADAPTER-RELEASE-GRAPH", [RP.evidence, RP.trace, RP.authority], [{ kind: "interface", id: "IF-RP-TRACE" }]],
  ].map(([id, title, chosen, rejected, requirements, targets]) => ({
    id,
    title,
    chosen,
    rejected,
    requirements,
    targets,
    supersedes: [],
  }));

  const assumptions = [
    { id: "ASM-RP-BASELINE-CURRENT", statement: "The supplied EP-001 architecture baseline is the exact current approved DevRelay design baseline.", status: "confirmed", blocking: false },
    { id: "ASM-RP-WINDOWS-HOST", statement: "ChatGPT/Codex Desktop on Windows remains the only release-defining DevRelay host.", status: "confirmed", blocking: false },
    { id: "ASM-RP-PUBLISHED-HISTORY", statement: "Published 0.10.0-rc.3 artifacts remain immutable history and are never rematerialized as RP-001 candidate bytes.", status: "confirmed", blocking: false },
  ];
  const risks = [
    { id: "RISK-RP-AUTHORITY-CREEP", statement: "Release preparation can accidentally cross into publication, tag, credential, or protected-main authority.", impact: "Unapproved external state or public artifacts may be created.", mitigation: "Separate Gate, exact grants, no-publication outcomes, host enforcement, and negative effect tests." },
    { id: "RISK-RP-BYTE-SUBSTITUTION", statement: "Verification can rebuild or normalize artifacts instead of proving prepared bytes.", impact: "Evidence may certify a candidate that was never produced or approved.", mitigation: "Content-addressed storage, raw-byte loading, checkpoint binding, and substitution matrices." },
    { id: "RISK-RP-SUPPLY-CHAIN", statement: "Incomplete or stale policy can miss dependency, provenance, license, checksum, SBOM, or secret issues.", impact: "An unsafe candidate may appear ready.", mitigation: "Versioned complete obligation policy, fail-closed unavailable outcomes, exact tool versions, and Gate-owned dispositions." },
    { id: "RISK-RP-HOSTED-BYTES", statement: "Hosted providers can generate source archives or attestations only after publication.", impact: "Pre-publication evidence may fabricate future bytes.", mitigation: "Treat provider-produced artifacts as later external receipts and never predict their digest." },
    { id: "RISK-RP-COST", statement: "Complete release verification can be slow and storage intensive.", impact: "Candidate feedback and routine release work may become costly.", mitigation: "Safe caching, bounded parallel read checks, zero-call replay, compact evidence indexes, and measured telemetry." },
  ];

  return {
    DEV: {},
    RUN: { inspect: RP.prepare, deterministic: RP.deterministic },
    EP: RP,
    allNormativeIds,
    alreadyDesignedTargets,
    baseSections,
    model,
    scope,
    openSpecDesign,
    diagramViewSpecs,
    decisionSpecs,
    technicalDesign,
    interfaces,
    constraints,
    assumptions,
    risks,
    uniq,
  };
}
