const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

const sortedCollections = new Set([
  "acceptanceCriteria", "assumptions", "businessObjectives", "capabilities", "constraints",
  "nonFunctionalRequirements", "nonGoals", "scope", "stakeholders", "successMetrics",
  "terminology", "userJourneys", "userStories", "users",
]);
const sortedStringArrays = new Set([
  "acceptanceCriterionIds", "aliases", "businessObjectiveIds", "capabilityIds", "deliverables",
  "dependencies", "requiredEvidence", "risks", "stakeholderIds", "userIds", "userJourneyIds",
]);

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const values = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") {
      return values.sort((left, right) => compareText(
        [left.role, left.artifact.artifactId, left.artifact.digest, left.location ?? ""].join("\u0000"),
        [right.role, right.artifact.artifactId, right.artifact.digest, right.location ?? ""].join("\u0000"),
      ));
    }
    if (sortedCollections.has(key)) return values.sort((left, right) => compareText(left.id, right.id));
    if (sortedStringArrays.has(key) && values.every((entry) => typeof entry === "string")) {
      return [...new Set(values)].sort(compareText);
    }
    return values;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, canonicalize(child, childKey)]));
}

const sourced = (sourceRefs, value) => ({ ...value, sourceRefs: structuredClone(sourceRefs) });
const appendUnique = (entries, values) => [...new Set([...entries, ...values])];

export function buildEnvironmentPreparationRequirements(currentRequirements, makeSourceRefs) {
  const requirements = structuredClone(currentRequirements);
  const sourceRefs = typeof makeSourceRefs === "function" ? makeSourceRefs() : structuredClone(makeSourceRefs);

  requirements.currentStatus = sourced(sourceRefs, {
    lifecycle: "existing",
    phase: "planning",
    summary: "EP-001 requirements are closed for deterministic environment preparation, provider-neutral profiles, capability-gated effects, readiness verification, drift detection, and evidence-bound progression to WorkExecution.",
  });

  requirements.businessObjectives.push(
    sourced(sourceRefs, {
      id: "BO-DEV-ENVIRONMENT-READINESS-001",
      statement: "Prevent authorized work from beginning until its exact host and project environment requirements are demonstrably ready.",
      stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"],
      priority: "must",
    }),
    sourced(sourceRefs, {
      id: "BO-DEV-ENVIRONMENT-SAFETY-001",
      statement: "Make environment preparation reproducible, reversible, least-privilege, secret-safe, and replaceable across technology-specific adapters.",
      stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"],
      priority: "must",
    }),
  );

  requirements.successMetrics.push(
    sourced(sourceRefs, {
      id: "SM-DEV-ENVIRONMENT-READINESS-001",
      name: "Verified execution readiness",
      businessObjectiveIds: ["BO-DEV-ENVIRONMENT-READINESS-001"],
      measure: "Authorized execution attempts preceded by an exact current EnvironmentReadinessReceipt.",
      target: "100 percent; missing, failed, unknown, expired, or drifted required checks block execution.",
      measurementMethod: "Reconcile every WorkExecution attempt against the approved profile, baseline, fingerprints, Gate decision, and graph path.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-ENVIRONMENT-REPLAY-001",
      name: "Effect-safe replay",
      businessObjectiveIds: ["BO-DEV-ENVIRONMENT-SAFETY-001"],
      measure: "Exact checkpoint replays that repeat no preparation effects.",
      target: "100 percent zero-call replay with byte-identical results.",
      measurementMethod: "Repeat preparation and verification invocations across restart, crash, retry, and checkpoint recovery fixtures.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-ENVIRONMENT-EVIDENCE-001",
      name: "Complete redacted environment evidence",
      businessObjectiveIds: ["BO-DEV-ENVIRONMENT-READINESS-001", "BO-DEV-ENVIRONMENT-SAFETY-001"],
      measure: "Readiness decisions with complete source-resolving receipts and zero secret values.",
      target: "100 percent evidence completeness and zero secret disclosure or undeclared network effects.",
      measurementMethod: "Validate command, version, digest, duration, output, redaction, grant, fingerprint, and traceability coverage.",
    }),
  );

  const capabilities = [
    ["CAP-DEV-ENVIRONMENT-PROFILE-001", "Environment profiles", "Declare versioned host and project-specific build, test, staging, and work-target requirements without implying unsupported interoperability.", "BO-DEV-ENVIRONMENT-READINESS-001"],
    ["CAP-DEV-ENVIRONMENT-PREPARE-001", "Environment preparation", "Propose and perform explicitly granted, project-local, reversible, idempotent environment changes with rollback and mutation receipts.", "BO-DEV-ENVIRONMENT-SAFETY-001"],
    ["CAP-DEV-ENVIRONMENT-VERIFY-001", "Environment readiness verification", "Evaluate required and optional checks against exact current fingerprints and block WorkExecution on invalid state.", "BO-DEV-ENVIRONMENT-READINESS-001"],
    ["CAP-DEV-ENVIRONMENT-EVIDENCE-001", "Environment evidence and traceability", "Preserve redacted receipts, remediation diagnostics, performance telemetry, and forward links from profiles through readiness to execution.", "BO-DEV-ENVIRONMENT-SAFETY-001"],
  ];
  requirements.capabilities.push(...capabilities.map(([id, name, description, objective]) => sourced(sourceRefs, {
    id, name, description, businessObjectiveIds: [objective], userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
    audience: "user-facing", key: true, priority: "must",
  })));

  requirements.userJourneys.push(sourced(sourceRefs, {
    id: "UJ-DEV-ENVIRONMENT-READINESS-001",
    name: "Prepare and prove an execution environment",
    userId: "USR-DEV-WORKFLOW-AUTHOR-001",
    capabilityIds: capabilities.map(([id]) => id),
    trigger: "SpecialistAssignmentGate has approved work and Core is preparing the next executable dependency frontier.",
    outcome: "Every ready work item has an approved profile, safely prepared environment, current readiness receipt, visible remediation state, and exact evidence before WorkExecution.",
    steps: [
      { sequence: 1, action: "Resolve host and project profiles from the approved work and assignment baselines.", expectedOutcome: "Every required environment fact is explicit, versioned, and source-linked." },
      { sequence: 2, action: "Inventory the exact current environment and compare it with required and optional checks.", expectedOutcome: "Missing, incompatible, or unknown state is classified without mutation." },
      { sequence: 3, action: "Present and execute only approved preparation effects.", expectedOutcome: "Every mutation is granted, reversible, idempotent, fingerprinted, and receipt-bound." },
      { sequence: 4, action: "Run EnvironmentVerificationGate against current evidence and policy.", expectedOutcome: "Only exact ready state authorizes the bound execution attempt." },
      { sequence: 5, action: "Revalidate before each later frontier and route drift or missing requirements.", expectedOutcome: "Historical evidence remains immutable and stale readiness never propagates." },
    ],
  }));

  const stories = [
    ["US-DEV-ENVIRONMENT-PROFILE-001", "CAP-DEV-ENVIRONMENT-PROFILE-001", "Declare the exact host and project environments needed by approved work.", "Environment expectations are explicit rather than inferred by an executor.", ["AC-EP-MODEL-001", "AC-EP-PROFILE-001", "AC-EP-SUPPORT-001"]],
    ["US-DEV-ENVIRONMENT-PREPARE-001", "CAP-DEV-ENVIRONMENT-PREPARE-001", "Prepare missing environment capabilities through bounded replaceable adapters.", "Preparation is safe, reviewable, reversible, and independent of a specific tool ecosystem.", ["AC-EP-MUTATION-001", "AC-EP-ROLLBACK-001", "AC-EP-NATIVE-001", "AC-EP-PLUGIN-SLOTS-001", "AC-EP-UX-001"]],
    ["US-DEV-ENVIRONMENT-VERIFY-001", "CAP-DEV-ENVIRONMENT-VERIFY-001", "Block work until every required environment check is current and proven.", "Invalid environments cannot create downstream implementation or verification noise.", ["AC-EP-LIFECYCLE-001", "AC-EP-GATE-001", "AC-EP-CHECKS-001", "AC-EP-OUTCOMES-001", "AC-EP-DRIFT-001", "AC-EP-REPLAY-001"]],
    ["US-DEV-ENVIRONMENT-EVIDENCE-001", "CAP-DEV-ENVIRONMENT-EVIDENCE-001", "Understand what was checked, changed, authorized, and used for each execution attempt.", "Readiness decisions remain auditable without leaking secrets or inventing support claims.", ["AC-EP-EVIDENCE-001", "AC-EP-TRACE-001", "AC-EP-SECRETS-001", "AC-EP-NETWORK-001", "AC-EP-ATTESTATION-001", "AC-EP-REMEDIATION-001", "AC-EP-TELEMETRY-001", "AC-EP-E2E-001"]],
  ];
  requirements.userStories.push(...stories.map(([id, capabilityId, need, benefit, acceptanceCriterionIds]) => sourced(sourceRefs, {
    id, userId: "USR-DEV-WORKFLOW-AUTHOR-001", capabilityId,
    userJourneyIds: ["UJ-DEV-ENVIRONMENT-READINESS-001"], need, benefit, priority: "must", acceptanceCriterionIds,
  })));

  const criteria = [
    ["AC-EP-BOUNDARY-001", "EnvironmentPreparation owns environment preparation and readiness proposals only; WorkExecution, SystemVerification, deployment, and ReleasePreparation retain their existing authority.", "Scan contracts and Core for forbidden outcomes, ports, route claims, and cross-module mutation."],
    ["AC-EP-BASELINE-001", "The module proposes an EnvironmentBaseline or EnvironmentChangeSet plus per-use readiness evidence without claiming deployment, staging success, or release readiness.", "Validate establishment, change, no-op, clarification, drift, and unsupported-result fixtures."],
    ["AC-EP-LIFECYCLE-001", "Core establishes or updates environment state after SpecialistAssignmentGate, verifies it before the first execution frontier, and revalidates before every later frontier.", "Run multi-frontier lifecycle fixtures with unchanged, expired, and drifted environment state."],
    ["AC-EP-GATE-001", "EnvironmentVerificationGate alone activates ready state and authorizes progression to the exact bound WorkExecution attempt.", "Reject adapter, model, caller, cloned-receipt, stale-evidence, and substituted-Gate authority."],
    ["AC-EP-MODEL-001", "The contract distinguishes the DevRelay host profile from one or more named project-specific build, test, staging, or work-target profiles.", "Validate multi-profile identity, inheritance, closure, conflict, and profile-selection fixtures."],
    ["AC-EP-SUPPORT-001", "The release claims only ChatGPT/Codex Desktop on Windows while arbitrary technology profiles remain unsupported until adapter-specific live evidence exists.", "Compare maturity catalog, provider attestations, reports, and release claims for exact consistency."],
    ["AC-EP-MUTATION-001", "Preparation defaults to project-local reversible changes and requires explicit canonical grants for filesystem, process, network, and secret effects plus separate approval for machine-global changes.", "Exercise allowed, denied, overbroad, missing, substituted, and global-effect approval cases."],
    ["AC-EP-ROLLBACK-001", "Every preparation mutation declares rollback or cleanup, before/after fingerprints, and an idempotency key; unsupported rollback blocks machine-global changes.", "Inject partial failure, crash, cleanup lock, retry, duplicate identity, and rollback failure."],
    ["AC-EP-CHECKS-001", "Profiles classify checks as required or optional; any failed or unknown required check blocks while optional failures remain explicit warnings.", "Evaluate complete required/optional truth tables and reordered check delivery."],
    ["AC-EP-OUTCOMES-001", "Gate outcomes are exactly ready, needs-clarification, remediation-required, baseline-drift, or unable-to-proceed and each has closed progression semantics.", "Validate every outcome, forbidden output combination, diagnostics, and replay."],
    ["AC-EP-PROFILE-001", "Profiles can pin OS, architecture, shells, runtimes, package managers, SDKs, system tools, services, variables, filesystem prerequisites, and external attestations.", "Validate complete, partial, contradictory, duplicate, unsafe, and extension profile fixtures."],
    ["AC-EP-ATTESTATION-001", "A time-bounded non-native host or user attestation may satisfy an unreadable fact only when exact policy explicitly allows that attestation type and freshness window.", "Exercise native, attested, expired, unsigned, policy-denied, substituted, and unavailable facts."],
    ["AC-EP-EVIDENCE-001", "Evidence binds command/tool identity, versions, configuration, grants, exit code, duration, raw-output receipt or artifact digest, repository commit, profile digest, and resulting fingerprints.", "Reject missing fields, unbound output, drifted versions, digest substitution, unsafe controls, and reordered evidence."],
    ["AC-EP-TRACE-001", "Trusted contributors add only forward facts from EnvironmentProfile to required WorkItem and from EnvironmentReadinessReceipt to the authorized execution attempt.", "Validate graph ownership, approved scope, checkpoint-before-merge, replay, inverse-edge rejection, and orphan diagnostics."],
    ["AC-EP-SECRETS-001", "Profiles store secret references and presence metadata only; secret values never enter artifacts, logs, fingerprints, graph facts, or receipts.", "Run secret presence, missing, redaction, accidental output, hashing, exception, and persistence scans."],
    ["AC-EP-NETWORK-001", "Network is denied by default and requires exact destination and purpose grants; every attempt is recorded and no adapter silently falls back online.", "Run denied, allowlisted, redirected, DNS drift, retry, offline, and hidden-fallback cases."],
    ["AC-EP-DRIFT-001", "Readiness binds repository commit, upstream baseline digests, profile identity, adapter/tool versions, host fingerprint, and relevant target fingerprints; any material change invalidates it.", "Mutate every bound identity independently and prove deterministic baseline-drift before execution."],
    ["AC-EP-REPLAY-001", "Exact checkpoint replay performs zero preparation effects; expired or drifted state creates a new immutable attempt and never rewrites historical evidence.", "Count adapter/effect calls across success, failure, crash, restart, replay, expiry, and drift."],
    ["AC-EP-NATIVE-001", "V1 ships a deterministic native Windows inventory and verifier while acquisition, configuration, service, and technology probes remain optional adapters.", "Run installed-package Windows inventory and verification with optional adapters absent and present."],
    ["AC-EP-PLUGIN-SLOTS-001", "Adapter roles are capability-oriented inventory, acquire, configure, service-check, and target-probe slots with no tool-specific Core branch.", "Conformance-test interchangeable fixtures and scan generic Core for PowerShell, winget, Scoop, Chocolatey, Docker, mise, or product IDs."],
    ["AC-EP-REMEDIATION-001", "Missing or incompatible state produces one consolidated deterministic remediation plan and clarification wave rather than fragmented prompts.", "Compare multi-gap ordering, deduplication, conflicts, partial remediation, and continuation lineage."],
    ["AC-EP-UX-001", "Before effectful preparation, Desktop displays exact mutations, grants, impact, rollback, and evidence obligations for approval.", "Inspect standard, no-op, global, secret, network, denied, and resumed Desktop transcripts."],
    ["AC-EP-NFR-001", "Deterministic equality, fail-closed behavior, zero-call replay, redaction, crash recovery, and bounded parallel checking are release gates.", "Run canonical, corruption, concurrency, recovery, security, and replay matrices."],
    ["AC-EP-TELEMETRY-001", "V1 records per-check and per-profile duration, retries, cache hits, and bottlenecks without imposing an unevidenced universal wall-clock SLA.", "Validate complete telemetry, unavailable-value honesty, aggregation, ordering, and report compactness."],
    ["AC-EP-E2E-001", "An installed DevRelay package operated through ChatGPT/Codex Desktop on Windows loads ProjectMemory, resolves approved work, inventories and prepares a project-local environment, verifies readiness, executes one bounded item, detects induced drift, blocks, remediates, re-verifies, and replays with zero effects.", "Reconcile the exact clean-workspace Desktop transcript, profiles, grants, receipts, checkpoints, graph updates, work result, drift, remediation, replay, and owner approvals."],
  ];
  requirements.acceptanceCriteria.push(...criteria.map(([id, statement, verification]) => sourced(sourceRefs, { id, statement, verification })));

  const nfrs = [
    ["NFR-EP-DETERMINISM-001", "reliability", "Environment profiles, plans, fingerprints, readiness decisions, remediation, evidence, graph updates, and replay are byte-stable for exact inputs.", "Repeat and reorder exact inputs across process restart and compare bytes, digests, ordering, and effect counts.", "100 percent equality and zero repeated effects on replay.", ["AC-EP-DRIFT-001", "AC-EP-REPLAY-001", "AC-EP-NFR-001"]],
    ["NFR-EP-SECURITY-001", "security", "Preparation and verification enforce least privilege, secret non-disclosure, network deny-by-default, safe paths, and explicit global-change approval.", "Run permission, path, process, network, secret, injection, redaction, and global-mutation matrices.", "Zero unauthorized effects, disclosures, silent fallbacks, or unrecorded attempts.", ["AC-EP-MUTATION-001", "AC-EP-SECRETS-001", "AC-EP-NETWORK-001"]],
    ["NFR-EP-RELIABILITY-001", "reliability", "Partial preparation, crash, stale state, cleanup failure, and concurrent attempts recover without false readiness or historical mutation.", "Inject failures before and after every checkpoint and mutation boundary.", "Zero false-ready outcomes and exact restart-safe recovery.", ["AC-EP-ROLLBACK-001", "AC-EP-GATE-001", "AC-EP-REPLAY-001"]],
    ["NFR-EP-USABILITY-001", "usability", "Desktop presents one compact readiness summary, consolidated remediation plan, and expandable exact evidence rather than fragmented prompts.", "Review standard, warning, blocked, global-effect, drift, and recovery transcripts.", "One consolidated interaction per preparation wave with direct exact-artifact references.", ["AC-EP-REMEDIATION-001", "AC-EP-UX-001"]],
    ["NFR-EP-PERFORMANCE-001", "performance", "Checks run with bounded safe parallelism and record timings, retries, cache hits, and bottlenecks without inventing unavailable measurements.", "Measure cold, warm, cached, parallel, serialized, failed, and unavailable paths on the Windows reference host.", "Complete honest telemetry and no readiness decision delayed by an unbounded check.", ["AC-EP-TELEMETRY-001", "AC-EP-NFR-001"]],
  ];
  requirements.nonFunctionalRequirements.push(...nfrs.map(([id, category, statement, measure, target, acceptanceCriterionIds]) => sourced(sourceRefs, {
    id, category, statement, applicability: { level: "project" }, measure, target, priority: "must", acceptanceCriterionIds,
  })));

  requirements.constraints.push(
    sourced(sourceRefs, { id: "CON-EP-AUTHORITY-001", category: "technical", statement: "EnvironmentVerificationGate alone activates ready state; adapters, executors, models, callers, and WorkExecution cannot self-authorize.", rationale: "Preparation evidence cannot also own progression authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-EP-GATE-001"] }),
    sourced(sourceRefs, { id: "CON-EP-HOST-001", category: "platform", statement: "ChatGPT/Codex Desktop on Windows is the only release-defining DevRelay host; arbitrary project profiles do not create additional host support claims.", rationale: "Product claims must match live release evidence.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-EP-SUPPORT-001", "AC-EP-E2E-001"] }),
    sourced(sourceRefs, { id: "CON-EP-EFFECTS-001", category: "security", statement: "All environment effects use exact canonical grants; project-local reversible preparation is the default and machine-global mutation requires separate approval and rollback support.", rationale: "Environment automation has high host-impact potential.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-EP-MUTATION-001", "AC-EP-ROLLBACK-001"] }),
    sourced(sourceRefs, { id: "CON-EP-SECRETS-001", category: "security", statement: "Only secret references and presence metadata may enter EP-001 artifacts; secret values are prohibited from persistence, logs, graph facts, and evidence.", rationale: "Readiness proof does not require disclosure.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-EP-SECRETS-001"] }),
    sourced(sourceRefs, { id: "CON-EP-NETWORK-001", category: "security", statement: "Network access is denied by default and requires exact destination and purpose grants with attempt receipts.", rationale: "Preparation must not silently acquire tools or transmit project data.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-EP-NETWORK-001"] }),
    sourced(sourceRefs, { id: "CON-EP-TRACE-001", category: "technical", statement: "Adapters cannot access TraceabilityGraph; trusted contributors derive only approved forward readiness relationships from validated artifacts.", rationale: "Environment plug-ins remain untrusted and graph authority remains Core-owned.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-EP-TRACE-001"] }),
  );

  requirements.scope.push(
    sourced(sourceRefs, { id: "SCOPE-EP-MODULE-001", statement: "EnvironmentPreparation module, EnvironmentVerificationGate, profile and baseline contracts, deterministic routing, checkpoints, remediation, receipts, and trusted traceability contributors." }),
    sourced(sourceRefs, { id: "SCOPE-EP-NATIVE-WINDOWS-001", statement: "Deterministic native Windows host/project inventory and readiness verifier for the controlled Desktop release." }),
    sourced(sourceRefs, { id: "SCOPE-EP-ADAPTERS-001", statement: "Capability-oriented inventory, acquire, configure, service-check, and target-probe adapter contracts with exact maturity and live-attestation reporting." }),
    sourced(sourceRefs, { id: "SCOPE-EP-DOGFOOD-001", statement: "Full released-circuit dogfood and installed-package Windows Desktop preparation, readiness, execution, induced-drift, remediation, re-verification, and replay acceptance." }),
  );
  requirements.nonGoals.push(
    sourced(sourceRefs, { id: "NG-EP-EXECUTION-001", statement: "Execute product work, select ready DAG items, or modify work dependencies and assignments.", rationale: "Those authorities remain in Core, WorkDependencyAnalysis, SpecialistAssignment, and WorkExecution." }),
    sourced(sourceRefs, { id: "NG-EP-RELEASE-001", statement: "Package, publish, deploy, promote, or claim release readiness.", rationale: "ReleasePreparation and later deployment lifecycle extensions own those outcomes." }),
    sourced(sourceRefs, { id: "NG-EP-GLOBAL-MANAGER-001", statement: "Become a universal machine package manager or silently modify global host state.", rationale: "Preparation is bounded by approved profiles, grants, rollback, and host policy." }),
    sourced(sourceRefs, { id: "NG-EP-UNPROVEN-SUPPORT-001", statement: "Claim non-Windows DevRelay host or arbitrary technology interoperability from contract-only or fixture evidence.", rationale: "Support claims require exact live evidence." }),
    sourced(sourceRefs, { id: "NG-EP-SECRET-STORAGE-001", statement: "Store, synchronize, transform, or expose secret values.", rationale: "EP-001 verifies references and presence without becoming a secret manager." }),
  );

  requirements.terminology.push(
    sourced(sourceRefs, { id: "TERM-EP-PROFILE-001", term: "EnvironmentProfile", definition: "A versioned provider-neutral declaration of required and optional host or project environment facts and capabilities.", aliases: ["Environment profile"] }),
    sourced(sourceRefs, { id: "TERM-EP-BASELINE-001", term: "EnvironmentBaseline", definition: "The approved environment profile set and preparation policy against which current state and readiness evidence are evaluated.", aliases: ["Environment baseline"] }),
    sourced(sourceRefs, { id: "TERM-EP-FINGERPRINT-001", term: "EnvironmentFingerprint", definition: "A deterministic redacted identity of the exact environment facts relevant to a profile and execution attempt.", aliases: ["Environment fingerprint"] }),
    sourced(sourceRefs, { id: "TERM-EP-READINESS-001", term: "EnvironmentReadinessReceipt", definition: "Gate-owned proof that exact current evidence satisfies an approved profile and authorizes one bound execution attempt or frontier.", aliases: ["Readiness receipt"] }),
    sourced(sourceRefs, { id: "TERM-EP-REMEDIATION-001", term: "EnvironmentRemediationPlan", definition: "A deterministic consolidated proposal for resolving all current required environment gaps, including effects, grants, impact, rollback, and evidence obligations.", aliases: ["Remediation plan"] }),
  );

  requirements.assumptions.push(
    sourced(sourceRefs, { id: "ASM-EP-OWNER-001", statement: "The owner approved all twenty-four EP-001 recommendations in clarification wave RQW-0FEF4753B3072E01.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-EP-HOST-001", statement: "ChatGPT/Codex Desktop on Windows remains the only release-defining host for EP-001.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-EP-PROFILES-001", statement: "Project-specific profiles may describe arbitrary technologies, but support remains unclaimed until an exact live adapter execution proves it.", status: "confirmed", blocking: false }),
  );

  requirements.dependencies = appendUnique(requirements.dependencies, [
    "The immutable PM-001 evidence commit 1c01dfb5f58dfce2600dc5f184e6224756ee4a46 and its accepted ProjectMemory, requirements, architecture, contract, work, dependency, assignment, verification, and traceability baselines.",
    "ChatGPT/Codex Desktop on Windows host surfaces for displaying effects, grants, remediation, readiness, and exact evidence.",
    "Canonical DevRelay permission demands, artifact registry, checkpoint store, graph service, local Git integration, execution, and verification contracts.",
  ]);
  requirements.risks = appendUnique(requirements.risks, [
    "Environment fingerprints can leak secrets or unstable host details unless they use explicit redaction and profile-scoped canonical fields.",
    "Automatic preparation can damage or destabilize a machine unless project-local changes, exact grants, rollback, and global-change approval are enforced.",
    "A readiness receipt can become stale between verification and execution unless exact fingerprints and upstream identities are revalidated at the execution boundary.",
    "Technology-specific adapters can create hidden Core special cases unless capability-oriented ports and conformance suites remain mandatory.",
    "Non-native host attestations can create false confidence unless policy constrains issuer, type, freshness, and scope.",
    "Parallel checks can race over shared mutable state unless only independent read checks run concurrently and effects remain serialized or isolated.",
  ]);
  requirements.deliverables = appendUnique(requirements.deliverables, [
    "EnvironmentPreparation and EnvironmentVerificationGate contracts, schemas, routing, native Windows implementation, trusted contributors, fixtures, tests, documentation, and replay boundaries.",
    "EnvironmentProfile, EnvironmentBaseline, EnvironmentChangeSet, EnvironmentFingerprint, EnvironmentPreparationPlan, EnvironmentRemediationPlan, EnvironmentReadinessReceipt, and exact evidence contracts.",
    "Capability-oriented inventory, acquire, configure, service-check, and target-probe adapter manifests with honest maturity and live attestation.",
    "Installed-package ChatGPT/Codex Desktop Windows end-to-end evidence covering preparation, verification, execution, drift, remediation, recovery, and replay.",
  ]);
  requirements.requiredEvidence = appendUnique(requirements.requiredEvidence, [
    "environment/module-conformance", "environment/gate-promotion", "environment/native-windows-inventory",
    "environment/profile-validation", "environment/permission-enforcement", "environment/mutation-receipts",
    "environment/rollback-recovery", "environment/readiness-policy", "environment/drift-detection",
    "environment/zero-call-replay", "environment/secret-redaction", "environment/network-denial",
    "environment/traceability-projection", "environment/remediation-plan", "environment/performance-telemetry",
    "dogfood/windows-desktop-environment-cycle",
  ]);
  requirements.sourceRefs = canonicalize(sourceRefs, "sourceRefs");
  return canonicalize(requirements);
}
