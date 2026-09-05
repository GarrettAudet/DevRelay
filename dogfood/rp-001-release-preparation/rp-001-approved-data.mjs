const compareText = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedCollections = new Set([
  "acceptanceCriteria",
  "assumptions",
  "businessObjectives",
  "capabilities",
  "constraints",
  "nonFunctionalRequirements",
  "nonGoals",
  "scope",
  "stakeholders",
  "successMetrics",
  "terminology",
  "userJourneys",
  "userStories",
  "users",
]);
const sortedStringArrays = new Set([
  "acceptanceCriterionIds",
  "aliases",
  "businessObjectiveIds",
  "capabilityIds",
  "deliverables",
  "dependencies",
  "requiredEvidence",
  "risks",
  "stakeholderIds",
  "userIds",
  "userJourneyIds",
]);

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const values = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") {
      return values.sort((left, right) =>
        compareText(
          [
            left.role,
            left.artifact.artifactId,
            left.artifact.digest,
            left.location ?? "",
          ].join("\u0000"),
          [
            right.role,
            right.artifact.artifactId,
            right.artifact.digest,
            right.location ?? "",
          ].join("\u0000"),
        ),
      );
    }
    if (sortedCollections.has(key)) {
      return values.sort((left, right) => compareText(left.id, right.id));
    }
    if (
      sortedStringArrays.has(key) &&
      values.every((entry) => typeof entry === "string")
    ) {
      return [...new Set(values)].sort(compareText);
    }
    return values;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      canonicalize(child, childKey),
    ]),
  );
}

const sourced = (sourceRefs, value) => ({
  ...value,
  sourceRefs: structuredClone(sourceRefs),
});
const appendUnique = (entries, values) => [...new Set([...entries, ...values])];
const replaceById = (entries, id, update) => {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) throw new Error(`Missing required baseline entity ${id}.`);
  entries[index] = update(structuredClone(entries[index]));
};

export function buildReleasePreparationRequirements(
  currentRequirements,
  makeSourceRefs,
) {
  const requirements = structuredClone(currentRequirements);
  const sourceRefs =
    typeof makeSourceRefs === "function"
      ? makeSourceRefs()
      : structuredClone(makeSourceRefs);

  requirements.currentStatus = sourced(sourceRefs, {
    lifecycle: "existing",
    phase: "planning",
    summary:
      "RP-001 requirements are closed for deterministic release-candidate preparation, verification, readiness gating, immutable evidence, and human-controlled publication consideration after SystemVerification.",
  });

  requirements.businessObjectives.push(
    sourced(sourceRefs, {
      id: "BO-DEV-RELEASE-READINESS-001",
      statement:
        "Prevent a source/library candidate from reaching publication consideration until its exact bytes, prerequisites, and required verification evidence are complete and approved.",
      stakeholderIds: [
        "STK-DEV-MAINTAINER-001",
        "STK-DEV-OWNER-001",
        "STK-DEV-WORKFLOW-AUTHOR-001",
      ],
      priority: "must",
    }),
    sourced(sourceRefs, {
      id: "BO-DEV-RELEASE-INTEGRITY-001",
      statement:
        "Make release-candidate materialization deterministic, supply-chain aware, replay-safe, and separate from publication, deployment, and protected-branch authority.",
      stakeholderIds: [
        "STK-DEV-MAINTAINER-001",
        "STK-DEV-OWNER-001",
        "STK-DEV-WORKFLOW-AUTHOR-001",
      ],
      priority: "must",
    }),
  );

  requirements.successMetrics.push(
    sourced(sourceRefs, {
      id: "SM-DEV-RELEASE-READINESS-001",
      name: "Verified release readiness",
      businessObjectiveIds: ["BO-DEV-RELEASE-READINESS-001"],
      measure:
        "Release candidates with every required preparation and verification obligation satisfied by exact current evidence or an approved not-applicable disposition.",
      target:
        "100 percent; failed, missing, stale, unknown, or substituted required evidence blocks readiness.",
      measurementMethod:
        "Reconcile every candidate and Gate record against source state, approved baselines, readiness, policy, artifact bytes, and verification evidence.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-RELEASE-REPLAY-001",
      name: "Effect-safe release replay",
      businessObjectiveIds: ["BO-DEV-RELEASE-INTEGRITY-001"],
      measure:
        "Exact checkpoint replays that repeat no materialization, download, signing, upload, tag, publication, or branch effects.",
      target: "100 percent zero-call replay with byte-identical results.",
      measurementMethod:
        "Repeat candidate preparation and verification across success, failure, crash, retry, restart, and drift fixtures.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-RELEASE-EVIDENCE-001",
      name: "Complete release evidence",
      businessObjectiveIds: [
        "BO-DEV-RELEASE-INTEGRITY-001",
        "BO-DEV-RELEASE-READINESS-001",
      ],
      measure:
        "Gate decisions with complete source-resolving release evidence and zero secret values or unapproved effects.",
      target:
        "100 percent evidence coverage and zero rebuilt, substituted, secret-bearing, or authority-overreaching artifacts.",
      measurementMethod:
        "Validate commands, versions, digests, candidate bytes, policy dispositions, redaction, grants, checkpoints, and traceability coverage.",
    }),
  );

  const capabilities = [
    [
      "CAP-DEV-RELEASE-PREPARE-001",
      "Deterministic release preparation",
      "Materialize one exact source/library candidate and its release-supporting artifacts from approved state without publishing or promoting it.",
      "BO-DEV-RELEASE-INTEGRITY-001",
    ],
    [
      "CAP-DEV-RELEASE-VERIFY-001",
      "Release verification",
      "Evaluate packaging, exports, installation, documentation, supply-chain, evidence, and supported-host obligations against the exact candidate bytes.",
      "BO-DEV-RELEASE-READINESS-001",
    ],
    [
      "CAP-DEV-RELEASE-EVIDENCE-001",
      "Release evidence and traceability",
      "Preserve compact, redacted, content-addressed preparation and verification evidence with exact forward lifecycle provenance.",
      "BO-DEV-RELEASE-INTEGRITY-001",
    ],
  ];
  requirements.capabilities.push(
    ...capabilities.map(([id, name, description, objective]) =>
      sourced(sourceRefs, {
        id,
        name,
        description,
        businessObjectiveIds: [objective],
        userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
        audience: "user-facing",
        key: true,
        priority: "must",
      }),
    ),
  );

  requirements.userJourneys.push(
    sourced(sourceRefs, {
      id: "UJ-DEV-RELEASE-READINESS-001",
      name: "Prepare and prove an exact release candidate",
      userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityIds: capabilities.map(([id]) => id),
      trigger:
        "SystemVerification has passed for integrated source state and an accepted EnvironmentReadinessReceipt is current.",
      outcome:
        "The owner receives one immutable candidate, complete verification coverage, compact evidence, and a Gate-owned readiness record for publication consideration without any publication effect.",
      steps: [
        {
          sequence: 1,
          action:
            "Bind exact source, project baselines, version, configuration, toolchain, and environment readiness.",
          expectedOutcome:
            "Candidate identity and every prerequisite are explicit and current.",
        },
        {
          sequence: 2,
          action:
            "Materialize the installable package and required release-supporting artifacts under exact grants.",
          expectedOutcome:
            "All candidate bytes are deterministic, content-addressed, and checkpointed.",
        },
        {
          sequence: 3,
          action:
            "Run every required verification family against stored candidate bytes.",
          expectedOutcome:
            "Each obligation passes or carries an explicit policy-backed not-applicable disposition.",
        },
        {
          sequence: 4,
          action:
            "Evaluate ReleaseVerificationGate and project trusted traceability.",
          expectedOutcome:
            "Only exact current evidence produces release readiness for human consideration.",
        },
        {
          sequence: 5,
          action:
            "Present the compact candidate summary and proposed downstream effects.",
          expectedOutcome:
            "Publication remains an explicit separate owner-controlled action.",
        },
      ],
    }),
  );

  const stories = [
    [
      "US-DEV-RELEASE-PREPARE-001",
      "CAP-DEV-RELEASE-PREPARE-001",
      "Prepare one exact source/library candidate from approved integrated state.",
      "Candidate construction is reproducible and cannot silently publish, tag, or promote.",
      [
        "AC-RP-BOUNDARY-001",
        "AC-RP-SCOPE-001",
        "AC-RP-LIFECYCLE-001",
        "AC-RP-ENVIRONMENT-001",
        "AC-RP-IDENTITY-001",
        "AC-RP-DRIFT-001",
        "AC-RP-ARTIFACTS-001",
        "AC-RP-SOURCE-ARCHIVE-001",
      ],
    ],
    [
      "US-DEV-RELEASE-VERIFY-001",
      "CAP-DEV-RELEASE-VERIFY-001",
      "Verify every required release obligation against the exact stored candidate bytes.",
      "Publication consideration is blocked on missing, stale, failed, unknown, or substituted evidence.",
      [
        "AC-RP-VERIFICATION-001",
        "AC-RP-NOT-APPLICABLE-001",
        "AC-RP-GATE-001",
        "AC-RP-OWNER-AUTHORITY-001",
        "AC-RP-SUPPLY-CHAIN-001",
        "AC-RP-POLICY-001",
        "AC-RP-STORED-BYTES-001",
        "AC-RP-NATIVE-001",
      ],
    ],
    [
      "US-DEV-RELEASE-EVIDENCE-001",
      "CAP-DEV-RELEASE-EVIDENCE-001",
      "Understand exactly what was prepared, verified, authorized, and excluded for a candidate.",
      "Release readiness remains auditable without leaking secrets or inventing maturity or authority.",
      [
        "AC-RP-EVIDENCE-001",
        "AC-RP-TRACE-001",
        "AC-RP-REPLAY-001",
        "AC-RP-ADAPTER-SLOTS-001",
        "AC-RP-SUMMARY-001",
        "AC-RP-EFFECT-APPROVAL-001",
        "AC-RP-NFR-001",
        "AC-RP-TELEMETRY-001",
        "AC-RP-E2E-001",
      ],
    ],
  ];
  requirements.userStories.push(
    ...stories.map(
      ([id, capabilityId, need, benefit, acceptanceCriterionIds]) =>
        sourced(sourceRefs, {
          id,
          userId: "USR-DEV-WORKFLOW-AUTHOR-001",
          capabilityId,
          userJourneyIds: ["UJ-DEV-RELEASE-READINESS-001"],
          need,
          benefit,
          priority: "must",
          acceptanceCriterionIds,
        }),
    ),
  );

  const criteria = [
    ["AC-RP-BOUNDARY-001", "ReleasePreparation owns candidate preparation and verification proposals only; publication, deployment, protected-main promotion, tagging, and final release approval remain outside its authority.", "Scan contracts, adapters, and Core for forbidden effects, outcomes, route claims, and authority-bearing outputs."],
    ["AC-RP-SCOPE-001", "RP-001 covers GitHub source plus an installable library tarball operated through ChatGPT/Codex Desktop on Windows and does not claim public npm, one-click Desktop installation, hosted operation, or non-Windows support.", "Compare requirements, release policy, package metadata, documentation, reports, and evidence for exact scope consistency."],
    ["AC-RP-LIFECYCLE-001", "Core routes conditional ReleasePreparation after passing SystemVerification and routes its exact candidate to separate ReleaseVerificationGate before BusinessAcceptance.", "Run applicable, not-applicable, failure, clarification, replay, and lifecycle-order fixtures."],
    ["AC-RP-ENVIRONMENT-001", "Candidate materialization and every effectful release step require an exact accepted current EnvironmentReadinessReceipt bound to the attempt.", "Reject missing, failed, expired, drifted, substituted, wrong-profile, and cloned readiness evidence."],
    ["AC-RP-IDENTITY-001", "ReleaseCandidate binds exact source commit and tree, approved project baselines, package version, release configuration, toolchain identities, and EnvironmentReadinessReceipt.", "Mutate every identity independently and prove canonical validation fails before materialization or Gate progression."],
    ["AC-RP-DRIFT-001", "Any material source, configuration, version, tool, baseline, policy, or environment drift creates a new immutable candidate attempt and never rewrites historical evidence.", "Run drift, retry, restart, race, stale-read, and optimistic-concurrency matrices."],
    ["AC-RP-ARTIFACTS-001", "The required candidate set includes a deterministic installable tarball, release catalog, CycloneDX SBOM, SHA-256 ledger, release notes, license and notice material, and compact evidence index.", "Validate complete, missing, duplicate, reordered, malformed, mismatched, and extra-artifact candidate fixtures."],
    ["AC-RP-SOURCE-ARCHIVE-001", "GitHub-generated source archives remain external publication artifacts; RP-001 verifies expected source identity without predicting or self-certifying their final bytes.", "Reject fabricated archive digests and distinguish candidate evidence from later provider-produced publication receipts."],
    ["AC-RP-VERIFICATION-001", "ReleaseVerification evaluates static checks, the complete deterministic test suite, package exports, isolated installation and imports, SBOM and checksums, documentation links, secret scanning, and a clean Windows Desktop consumer run.", "Run passing and independently failing fixtures for every verification family against exact candidate bytes."],
    ["AC-RP-NOT-APPLICABLE-001", "Every verification family is required unless ReleaseVerificationGate records an explicit versioned policy-backed ApprovedNotApplicable disposition; failed, missing, stale, or unknown required evidence blocks readiness.", "Exercise exhaustive obligation dispositions, policy drift, fabricated exemptions, and partial evidence."],
    ["AC-RP-GATE-001", "ReleaseVerificationGate alone promotes an exact ReleaseReadinessBaseline or record that authorizes only downstream human-controlled publication consideration.", "Reject module, adapter, model, caller, serialized receipt, and substituted Gate authority and verify no branch, tag, upload, or publication effect."],
    ["AC-RP-OWNER-AUTHORITY-001", "Version selection, changelog approval, prerelease or stable designation, and final publication approval are explicit owner decisions and cannot be inferred by Core or adapters.", "Run absent, ambiguous, changed, conflicting, stale, and adapter-proposed owner-decision cases."],
    ["AC-RP-EVIDENCE-001", "Evidence binds exact commands, tool and adapter versions, configuration and input digests, exit codes, durations, stdout and stderr receipts or artifact digests, candidate bytes, and checkpoint identities.", "Reject missing, drifted, reordered, unsafe, substituted, and cross-candidate evidence."],
    ["AC-RP-TRACE-001", "Trusted contributors add only forward factual links from approved source and environment state through candidate artifacts, verification evidence, and Gate readiness; adapters receive no graph access.", "Validate ownership, scope, checkpoint-before-merge, replay, inverse-edge rejection, candidate-versus-approved authority, and horizon diagnostics."],
    ["AC-RP-SUPPLY-CHAIN-001", "Release execution is offline by default, network requires exact destination and purpose grants, artifacts and logs reject secrets, and acquired tools are project-local and checksum-pinned.", "Run network denial, redirect, checksum, path, secret, unsafe-output, overbroad-grant, and silent-fallback cases."],
    ["AC-RP-POLICY-001", "One versioned release policy fails closed on dependency, action-pin, license, provenance, SBOM, checksum, signature or attestation, and secret-scan violations.", "Exercise passing, failing, unavailable, stale-policy, malformed, warning-only, and substituted policy decisions."],
    ["AC-RP-REPLAY-001", "Candidate materialization checkpoints exact prepared outputs before merge or external effect; exact replay performs zero packaging, download, signing, upload, tagging, publication, or branch calls.", "Count all adapter and effect calls across success, failure, crash, restart, replay, and checkpoint corruption."],
    ["AC-RP-STORED-BYTES-001", "Verification reloads candidate bytes from content-addressed storage and rejects rebuilt, substituted, partially retrieved, or digest-mismatched artifacts.", "Validate retrieval, truncation, relocation, rebuild, equivalent-value-different-bytes, and store-corruption cases."],
    ["AC-RP-NATIVE-001", "V1 ships deterministic native Node and Windows implementations for cataloging, packing, checksum and SBOM validation, and installed-package verification while hosted release systems remain optional bounded adapters.", "Run clean installed-package Windows verification with optional hosted adapters absent and fixture-configured."],
    ["AC-RP-ADAPTER-SLOTS-001", "Release adapter roles are capability-oriented materialize, inspect, verify, attest, and publication-prerequisite-probe slots with no product-specific Core branch or silent fallback.", "Conformance-test interchangeable bindings and scan Generic Core for hosted release product or operation identifiers."],
    ["AC-RP-SUMMARY-001", "Desktop presents one compact candidate and readiness summary containing blockers, warnings, version and source identity, artifact digests, verification coverage, and direct evidence links.", "Review ready, blocked, warning, drift, replay, and unavailable Desktop transcripts."],
    ["AC-RP-EFFECT-APPROVAL-001", "All proposed network, signing, credential, filesystem, process, tag, and remote-repository effects are consolidated and shown for explicit approval before execution.", "Exercise no-op, local-only, network, credential, signing, remote, denied, resumed, and overbroad proposals."],
    ["AC-RP-NFR-001", "Deterministic byte equality, fail-closed validation, zero-call replay, crash recovery, redaction, isolated clean-install verification, and honest adapter maturity are release gates.", "Run canonical, corruption, concurrency, recovery, security, maturity, clean-install, and replay matrices."],
    ["AC-RP-TELEMETRY-001", "V1 records materialization and verification duration, cache hits, retries, artifact sizes, and bottlenecks without imposing an unevidenced universal wall-clock SLA.", "Validate measured values, explicit unavailable dispositions, aggregation, ordering, and compact reporting."],
    ["AC-RP-E2E-001", "A clean DevRelay checkout operated through ChatGPT/Codex Desktop on Windows loads current memory and baselines, proves environment readiness, prepares one exact installable candidate, verifies every obligation, replays with zero effects, rejects induced drift and substitution, and produces a Gate-ready compact evidence package without publishing.", "Reconcile the exact Desktop transcript, source state, baselines, readiness, grants, candidate bytes, checks, checkpoints, graph updates, replay, negative cases, and owner decisions."],
  ];
  requirements.acceptanceCriteria.push(
    ...criteria.map(([id, statement, verification]) =>
      sourced(sourceRefs, { id, statement, verification }),
    ),
  );

  const nfrs = [
    ["NFR-RP-DETERMINISM-001", "reliability", "Candidate identity, materialization, catalogs, checksums, verification decisions, diagnostics, evidence, graph updates, and replay are byte-stable for exact inputs.", "Repeat and reorder exact inputs across process restart and compare bytes, digests, ordering, and effect counts.", "100 percent equality and zero repeated effects on replay.", ["AC-RP-IDENTITY-001", "AC-RP-REPLAY-001", "AC-RP-NFR-001"]],
    ["NFR-RP-SECURITY-001", "security", "Preparation and verification enforce least privilege, secret non-disclosure, offline-by-default execution, safe paths, checksum-pinned tools, and explicit external-effect approval.", "Run permission, path, process, network, credential, secret, checksum, provenance, redaction, and remote-effect matrices.", "Zero unauthorized effects, disclosures, silent fallbacks, or accepted unsafe artifacts.", ["AC-RP-SUPPLY-CHAIN-001", "AC-RP-POLICY-001", "AC-RP-EFFECT-APPROVAL-001"]],
    ["NFR-RP-RELIABILITY-001", "reliability", "Partial materialization, crash, stale state, retrieval failure, cleanup failure, and concurrent attempts recover without false readiness or historical mutation.", "Inject failures before and after every checkpoint, artifact, verification, and Gate boundary.", "Zero false-ready outcomes and exact restart-safe recovery.", ["AC-RP-DRIFT-001", "AC-RP-REPLAY-001", "AC-RP-STORED-BYTES-001"]],
    ["NFR-RP-USABILITY-001", "usability", "Desktop presents one compact readiness summary and consolidated effect proposal with expandable exact evidence.", "Review standard, warning, blocked, drift, recovery, network, credential, and replay transcripts.", "One concise summary and one consolidated approval interaction per candidate attempt.", ["AC-RP-SUMMARY-001", "AC-RP-EFFECT-APPROVAL-001"]],
    ["NFR-RP-PERFORMANCE-001", "performance", "Materialization and verification record honest timings, cache behavior, retries, artifact sizes, and bottlenecks without inventing unavailable measurements or imposing an unevidenced universal SLA.", "Measure cold, warm, cached, failed, replayed, and unavailable paths on the Windows reference host.", "Complete sourced telemetry with no unbounded release check.", ["AC-RP-TELEMETRY-001", "AC-RP-NFR-001"]],
  ];
  requirements.nonFunctionalRequirements.push(
    ...nfrs.map(
      ([id, category, statement, measure, target, acceptanceCriterionIds]) =>
        sourced(sourceRefs, {
          id,
          category,
          statement,
          applicability: { level: "project" },
          measure,
          target,
          priority: "must",
          acceptanceCriterionIds,
        }),
    ),
  );

  requirements.constraints.push(
    sourced(sourceRefs, { id: "CON-RP-AUTHORITY-001", category: "business", statement: "ReleaseVerificationGate alone activates release readiness; modules, adapters, models, callers, and publication systems cannot self-authorize.", rationale: "Candidate production and verification cannot also own readiness authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-RP-GATE-001", "AC-RP-OWNER-AUTHORITY-001"] }),
    sourced(sourceRefs, { id: "CON-RP-HOST-001", category: "platform", statement: "ChatGPT/Codex Desktop on Windows is the only release-defining RP-001 host.", rationale: "Release claims must match exact live acceptance evidence.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-RP-SCOPE-001", "AC-RP-E2E-001"] }),
    sourced(sourceRefs, { id: "CON-RP-EFFECTS-001", category: "security", statement: "Release preparation is local and offline by default; network, credentials, signing, tags, remote repositories, and publication require separate exact approval and never follow from release readiness alone.", rationale: "Preparation evidence must not become implicit external authority.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-RP-BOUNDARY-001", "AC-RP-SUPPLY-CHAIN-001", "AC-RP-EFFECT-APPROVAL-001"] }),
    sourced(sourceRefs, { id: "CON-RP-STORED-BYTES-001", category: "technical", statement: "Verification and Gate promotion operate on exact content-addressed candidate bytes and cannot substitute rebuilt or parsed-value-equivalent artifacts.", rationale: "Release evidence proves bytes, not intent or semantic similarity.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-RP-IDENTITY-001", "AC-RP-STORED-BYTES-001"] }),
    sourced(sourceRefs, { id: "CON-RP-POLICY-001", category: "security", statement: "One versioned release policy owns required verification and supply-chain dispositions; adapters may only return observations and native evidence.", rationale: "Evidence producers cannot certify their own completeness or exemptions.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-RP-NOT-APPLICABLE-001", "AC-RP-POLICY-001"] }),
    sourced(sourceRefs, { id: "CON-RP-TRACE-001", category: "technical", statement: "Adapters cannot access TraceabilityGraph; trusted contributors derive only validated forward release relationships within declared candidate or approved scopes.", rationale: "Release plug-ins remain untrusted and graph authority remains Core-owned.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-RP-TRACE-001"] }),
  );

  replaceById(requirements.constraints, "CON-DEV-MODULE-INVENTORY-001", (entry) => ({
    ...entry,
    statement:
      "V1 lifecycle scope is limited to the twenty owner-approved components and repeating execution-frontier rule recorded in the project overview; TraceabilityGraph and LifecycleRunReport remain cross-cutting infrastructure rather than additional stages.",
    rationale:
      "The approved RP-001 change adds conditional ReleasePreparation and ReleaseVerificationGate between SystemVerification and BusinessAcceptance without adding deployment or publication stages.",
    sourceRefs: [...entry.sourceRefs, ...structuredClone(sourceRefs)],
  }));
  replaceById(requirements.acceptanceCriteria, "AC-DEV-FULL-V1-SCOPE-001", (entry) => ({
    ...entry,
    statement:
      "The approved V1 sequence contains exactly RequirementsGathering, RequirementsGate, conditional ArchitectureDiscovery, ArchitectureDesign, ArchitectureGate, conditional ContractGeneration, ContractGate, WorkBreakdown, WorkBreakdownGate, WorkDependencyAnalysis, WorkDependencyGate, SpecialistAssignment, SpecialistAssignmentGate, WorkExecution, WorkItemVerification, ChangeIntegration, SystemVerification, conditional ReleasePreparation, ReleaseVerificationGate, and BusinessAcceptanceGate, with execution, item verification, and integration repeated for each ready DAG frontier.",
    verification:
      "Compare requirements scope, generated ProjectOverview, circuit ledger, module registry, and end-to-end runs against the exact twenty-component sequence, conditional release route, and repeating frontier rule.",
    sourceRefs: [...entry.sourceRefs, ...structuredClone(sourceRefs)],
  }));

  requirements.scope.push(
    sourced(sourceRefs, { id: "SCOPE-DEV-V1-135-RELEASE-PREPARATION", statement: "ReleasePreparation [module; conditional]: ReleasePreparation materializes and verifies one exact source/library candidate after SystemVerification without publication, deployment, tag, or protected-branch authority." }),
    sourced(sourceRefs, { id: "SCOPE-DEV-V1-137-RELEASE-VERIFICATION-GATE", statement: "ReleaseVerificationGate [gate]: ReleaseVerificationGate validates exact candidate bytes, required verification and supply-chain policy, owner release intent, and promotion evidence before BusinessAcceptance." }),
    sourced(sourceRefs, { id: "SCOPE-RP-MODULE-001", statement: "ReleasePreparation module, ReleaseVerificationGate, candidate and readiness contracts, deterministic routing, checkpoints, policies, receipts, and trusted traceability contributors." }),
    sourced(sourceRefs, { id: "SCOPE-RP-NATIVE-WINDOWS-001", statement: "Deterministic native Node and Windows cataloging, packing, checksum, SBOM, export, installed-package, and consumer verification for the controlled Desktop release." }),
    sourced(sourceRefs, { id: "SCOPE-RP-ADAPTERS-001", statement: "Capability-oriented materialize, inspect, verify, attest, and publication-prerequisite probe adapter contracts with exact maturity and live-attestation reporting." }),
    sourced(sourceRefs, { id: "SCOPE-RP-DOGFOOD-001", statement: "Full released-circuit dogfood and clean-checkout Windows Desktop candidate preparation, verification, drift, substitution, recovery, replay, and no-publication acceptance." }),
  );
  requirements.nonGoals.push(
    sourced(sourceRefs, { id: "NG-RP-PUBLISH-001", statement: "Publish packages, create or push tags, create hosted releases, mutate protected main, or approve a final release.", rationale: "RP-001 stops at Gate-owned readiness for separate human-controlled publication consideration." }),
    sourced(sourceRefs, { id: "NG-RP-DEPLOY-001", statement: "Deploy software, operate a hosted service, or verify a production environment.", rationale: "Deployment and operations require separately approved lifecycle extensions." }),
    sourced(sourceRefs, { id: "NG-RP-NPM-001", statement: "Publish DevRelay to the public npm registry.", rationale: "The controlled distribution remains GitHub source plus an installable release tarball." }),
    sourced(sourceRefs, { id: "NG-RP-SOURCE-ARCHIVE-001", statement: "Predict or self-certify the final bytes of source archives produced later by a hosted publication provider.", rationale: "Provider-produced bytes require provider receipts after publication." }),
    sourced(sourceRefs, { id: "NG-RP-UNPROVEN-SUPPORT-001", statement: "Claim one-click Desktop installation, hosted operation, non-Windows support, signing, attestation, or provider interoperability without exact approved evidence.", rationale: "Release claims follow evidence and explicit scope rather than schemas or intent." }),
  );

  requirements.terminology.push(
    sourced(sourceRefs, { id: "TERM-RP-CANDIDATE-001", term: "ReleaseCandidate", definition: "An immutable content-addressed set of exact source/library artifacts and preparation evidence bound to one approved source state, configuration, toolchain, and environment readiness identity.", aliases: ["Release candidate"] }),
    sourced(sourceRefs, { id: "TERM-RP-ATTEMPT-001", term: "ReleasePreparationAttempt", definition: "One immutable invocation that prepares or verifies one exact candidate identity under explicit policy, configuration, grants, and checkpoints.", aliases: ["Release attempt"] }),
    sourced(sourceRefs, { id: "TERM-RP-READINESS-001", term: "ReleaseReadinessBaseline", definition: "Gate-owned proof that one exact candidate satisfies the approved release verification policy and may be considered for separate human-controlled publication.", aliases: ["Release readiness"] }),
    sourced(sourceRefs, { id: "TERM-RP-OBLIGATION-001", term: "ReleaseVerificationObligation", definition: "One versioned required release check with exact subject, evidence, disposition, policy, and not-applicable rules.", aliases: ["Release obligation"] }),
  );

  requirements.assumptions.push(
    sourced(sourceRefs, { id: "ASM-RP-OWNER-001", statement: "The owner approved all twenty-four RP-001 recommendations in clarification wave RQW-BF39D9028F6F9289.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-RP-HOST-001", statement: "ChatGPT/Codex Desktop on Windows remains the only release-defining host for RP-001.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-RP-PUBLISHED-ASSETS-001", statement: "Published 0.10.0-rc.3 assets are immutable historical evidence and are not candidate outputs for RP-001.", status: "confirmed", blocking: false }),
  );

  requirements.dependencies = appendUnique(requirements.dependencies, [
    "The accepted EP-001 EnvironmentPreparation baseline, Gate policy, current readiness receipts, drift rules, and installed-package Windows evidence.",
    "The current approved requirements, ProjectOverview, architecture, contract, work, dependency, assignment, integration, SystemVerification, BusinessAcceptance, memory, roadmap, and traceability baselines.",
    "ChatGPT/Codex Desktop on Windows host surfaces for displaying candidate identity, proposed effects, blockers, verification coverage, and exact evidence.",
    "Canonical DevRelay artifact registry, checkpoint store, graph service, local Git integration, package tooling, verification, and release policy contracts.",
  ]);
  requirements.risks = appendUnique(requirements.risks, [
    "Candidate evidence can become invalid when source, version, configuration, policy, toolchain, baseline, or environment identity drifts after preparation.",
    "Release automation can cross into publication or protected-branch authority unless module, Gate, host, and adapter effects are explicitly separated.",
    "Rebuilding or semantically normalizing candidate artifacts during verification can substitute bytes that were never prepared or approved.",
    "Supply-chain checks can create false assurance unless policy, inputs, tool versions, unavailable results, and not-applicable dispositions are exact and current.",
    "Hosted providers can produce source archives or attestations with bytes unavailable before publication and must not be self-certified from expected content.",
    "Release receipts can disclose credentials, signing material, source content, or unsafe logs unless redaction and secret scanning fail closed before persistence.",
  ]);
  requirements.deliverables = appendUnique(requirements.deliverables, [
    "ReleasePreparation and ReleaseVerificationGate contracts, schemas, routing, native Windows implementation, trusted contributors, fixtures, tests, documentation, and replay boundaries.",
    "ReleaseCandidate, ReleasePreparationAttempt, ReleaseVerificationObligation, ReleaseVerificationResult, ReleaseReadinessBaseline, policy, diagnostic, receipt, and evidence contracts.",
    "Capability-oriented materialize, inspect, verify, attest, and publication-prerequisite probe adapter manifests with honest maturity evidence.",
    "Clean-checkout ChatGPT/Codex Desktop Windows end-to-end evidence covering candidate preparation, verification, drift, substitution, recovery, replay, and the no-publication boundary.",
  ]);
  requirements.requiredEvidence = appendUnique(requirements.requiredEvidence, [
    "release-preparation/module-conformance",
    "release-preparation/gate-promotion",
    "release-preparation/native-windows-materialization",
    "release-preparation/candidate-identity",
    "release-preparation/package-export-completeness",
    "release-preparation/installed-package-verification",
    "release-preparation/sbom-checksum-policy",
    "release-preparation/supply-chain-policy",
    "release-preparation/permission-enforcement",
    "release-preparation/effect-approval",
    "release-preparation/stored-byte-verification",
    "release-preparation/drift-detection",
    "release-preparation/zero-call-replay",
    "release-preparation/secret-redaction",
    "release-preparation/network-denial",
    "release-preparation/traceability-projection",
    "release-preparation/compact-summary",
    "release-preparation/performance-telemetry",
    "dogfood/windows-desktop-release-preparation-cycle",
  ]);
  requirements.sourceRefs = canonicalize(sourceRefs, "sourceRefs");
  return canonicalize(requirements);
}
