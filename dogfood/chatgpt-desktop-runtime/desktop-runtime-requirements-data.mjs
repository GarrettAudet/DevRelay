const collectionKeys = new Set([
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

const stringArrayKeys = new Set([
  "acceptanceCriterionIds",
  "aliases",
  "businessObjectiveIds",
  "capabilityIds",
  "deliverables",
  "dependencies",
  "interests",
  "needs",
  "requiredEvidence",
  "risks",
  "stakeholderIds",
  "userIds",
  "userJourneyIds",
]);

const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") {
      return entries.sort((left, right) =>
        compare(
          [left.role, left.artifact.artifactId, left.artifact.digest, left.location ?? ""].join("\u0000"),
          [right.role, right.artifact.artifactId, right.artifact.digest, right.location ?? ""].join("\u0000"),
        ),
      );
    }
    if (collectionKeys.has(key)) {
      return entries.sort((left, right) => compare(left.id, right.id));
    }
    if (stringArrayKeys.has(key) && entries.every((entry) => typeof entry === "string")) {
      return [...new Set(entries)].sort(compare);
    }
    return entries;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, canonicalize(child, childKey)]),
  );
}

export const ownerDecisions = Object.freeze([
  Object.freeze({
    questionId: "Q-DEV-DESKTOP-DISTRIBUTION-001",
    answer:
      "Ship V1 as a repository-backed local marketplace plugin installable in ChatGPT Desktop on Windows; public directory publication is not required (recommended)",
  }),
  Object.freeze({
    questionId: "Q-DEV-DESKTOP-WORK-ITEM-TASKS-001",
    answer:
      "Create one Codex task per runnable work item through local app-server while DevRelay Core retains DAG, Gate, and verified-handoff authority (recommended)",
  }),
  Object.freeze({
    questionId: "Q-DEV-DESKTOP-ACCEPTANCE-PROOF-001",
    answer:
      "Require one live path through every mandatory module plus a clean-install Desktop run that builds and accepts a real bounded software feature; keep alternative adapters maturity-labelled (recommended)",
  }),
]);

export function buildDesktopRuntimeRequirements(baseline, sourceRefs) {
  const requirements = structuredClone(baseline);
  const refs = () => structuredClone(sourceRefs);
  const append = (key, values) => {
    requirements[key] = [...requirements[key], ...values];
  };

  append("successMetrics", [
    {
      id: "SM-DEV-DESKTOP-E2E-001",
      name: "Desktop goal-to-acceptance completion",
      businessObjectiveIds: [
        "BO-DEV-DETERMINISM-001",
        "BO-DEV-MODULARITY-001",
        "BO-DEV-QUALITY-001",
        "BO-DEV-TRACEABILITY-001",
      ],
      measure:
        "Clean ChatGPT Desktop runs that use the installed DevRelay plugin and one live binding per mandatory lifecycle capability to build, verify, integrate, system-verify, and business-accept a real bounded feature.",
      target:
        "At least one complete release run with zero bypassed mandatory Gates, zero unverified handoffs, zero blocking traceability diagnostics, and a byte-reproducible run report.",
      measurementMethod:
        "Install from the repository marketplace in a clean Desktop session, execute the canonical lifecycle, reconcile every run-ledger entry and graph edge, and repeat deterministic Core operations from checkpoints.",
      sourceRefs: refs(),
    },
  ]);

  append("capabilities", [
    {
      id: "CAP-DEV-DESKTOP-RUNTIME-001",
      name: "ChatGPT Desktop lifecycle runtime",
      description:
        "Install and operate DevRelay through ChatGPT Desktop on Windows using a packaged workflow skill, local typed MCP bridge, persistent deterministic run state, and Codex app-server work-item tasks.",
      businessObjectiveIds: [
        "BO-DEV-DETERMINISM-001",
        "BO-DEV-MODULARITY-001",
        "BO-DEV-OBSERVABILITY-001",
        "BO-DEV-QUALITY-001",
        "BO-DEV-TRACEABILITY-001",
      ],
      userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
      audience: "user-facing",
      key: true,
      priority: "must",
      sourceRefs: refs(),
    },
  ]);

  append("userJourneys", [
    {
      id: "UJ-DEV-DESKTOP-GOAL-TO-ACCEPTANCE-001",
      name: "Build accepted software from ChatGPT Desktop",
      userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityIds: [
        "CAP-DEV-DESKTOP-RUNTIME-001",
        "CAP-DEV-LIFECYCLE-001",
        "CAP-DEV-RUN-REPORTING-001",
      ],
      trigger:
        "A user opens a local software project in ChatGPT Desktop, invokes the installed DevRelay plugin, and supplies a goal.",
      outcome:
        "The exact goal progresses through the configured deterministic lifecycle to a BusinessAcceptance record, or stops at an explicit clarification, Gate, verification failure, or blocked condition with resumable state.",
      steps: [
        {
          sequence: 1,
          action:
            "The Desktop plugin initializes or resumes a content-addressed DevRelay run and conducts the human-facing RequirementsGathering interaction.",
          expectedOutcome:
            "Every decision becomes a structured, version-pinned artifact rather than conversational memory.",
        },
        {
          sequence: 2,
          action:
            "DevRelay executes approved planning modules and Gates through the configured release-ready bindings.",
          expectedOutcome:
            "Architecture, contracts, work items, dependencies, and specialist assignments are valid and traceable before execution.",
        },
        {
          sequence: 3,
          action:
            "Core derives each runnable DAG frontier and the host starts one isolated Codex task for every ready work item.",
          expectedOutcome:
            "Each task receives an immutable contract and returns a raw, verifiable handoff without acquiring workflow authority.",
        },
        {
          sequence: 4,
          action:
            "DevRelay verifies, integrates, system-verifies, and business-accepts the resulting software while updating TraceabilityGraph and the human-readable run report.",
          expectedOutcome:
            "The user can prove exactly what was built, why it was built, how it was verified, and whether the business goal was accepted.",
        },
      ],
      sourceRefs: refs(),
    },
  ]);

  const acceptanceCriterionIds = [
    "AC-DEV-DESKTOP-DETERMINISM-001",
    "AC-DEV-DESKTOP-E2E-001",
    "AC-DEV-DESKTOP-HANDOFF-001",
    "AC-DEV-DESKTOP-INSTALL-001",
    "AC-DEV-DESKTOP-LIVE-PATH-001",
    "AC-DEV-DESKTOP-MATURITY-001",
    "AC-DEV-DESKTOP-MCP-001",
    "AC-DEV-DESKTOP-OBSERVABILITY-001",
    "AC-DEV-DESKTOP-RESUME-001",
    "AC-DEV-DESKTOP-SECURITY-001",
    "AC-DEV-DESKTOP-TASKS-001",
    "AC-DEV-DESKTOP-WINDOWS-001",
  ];
  append("userStories", [
    {
      id: "US-DEV-DESKTOP-RUNTIME-001",
      userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityId: "CAP-DEV-DESKTOP-RUNTIME-001",
      userJourneyIds: ["UJ-DEV-DESKTOP-GOAL-TO-ACCEPTANCE-001"],
      need:
        "Use DevRelay directly from ChatGPT Desktop on Windows to turn a software goal into production-quality accepted software through the complete deterministic lifecycle.",
      benefit:
        "The workflow is usable as an engineering system rather than only as a verified library or set of fixture-conformant contracts.",
      priority: "must",
      acceptanceCriterionIds,
      sourceRefs: refs(),
    },
  ]);

  const criterion = (id, statement, verification) => ({
    id,
    statement,
    verification,
    sourceRefs: refs(),
  });
  append("acceptanceCriteria", [
    criterion(
      "AC-DEV-DESKTOP-DETERMINISM-001",
      "Exact version-pinned run inputs, module and adapter bindings, policies, approvals, checkpoints, and host observations produce byte-identical Core-owned artifacts, route decisions, graph updates, and run-report projections.",
      "Repeat complete and resumed Desktop runs, reorder equivalent input collections, and compare canonical digests for every Core-owned artifact and decision.",
    ),
    criterion(
      "AC-DEV-DESKTOP-E2E-001",
      "Release acceptance includes a clean-install ChatGPT Desktop run that uses DevRelay to build a real bounded software feature from Goal through BusinessAcceptance without manually bypassing a mandatory module or Gate.",
      "Install the packaged plugin in a fresh Desktop session, execute the reference project, and reconcile its run ledger, Git history, tests, verification evidence, graph checkpoint, and BusinessAcceptance record.",
    ),
    criterion(
      "AC-DEV-DESKTOP-HANDOFF-001",
      "Every work-item task receives an immutable version-pinned contract and context bundle, and Core accepts its result only after raw-byte handoff validation, evidence closure, and dependency-aware integration assessment.",
      "Exercise valid, malformed, substituted, stale, incomplete, cross-work-item, non-pass, and replayed task handoffs.",
    ),
    criterion(
      "AC-DEV-DESKTOP-INSTALL-001",
      "The repository contains a valid local marketplace entry and installable DevRelay plugin package for ChatGPT Desktop on Windows, with documented install, upgrade, rollback, and uninstall procedures.",
      "Validate the plugin and marketplace schemas, install from a clean local marketplace, restart Desktop, invoke the plugin in a new task, then roll back and uninstall without leaving authoritative run state ambiguous.",
    ),
    criterion(
      "AC-DEV-DESKTOP-LIVE-PATH-001",
      "Every mandatory lifecycle module and Gate used by the reference circuit has at least one release-ready executable binding; conditional modules execute or produce an approved not-applicable disposition from exact state.",
      "Generate the release circuit inventory and fail acceptance when any mandatory capability resolves only to a contract-defined or fixture-conformant binding.",
    ),
    criterion(
      "AC-DEV-DESKTOP-MATURITY-001",
      "Alternative OpenSpec, Spec Kit, Structurizr, MADR, A2A, and other adapter bindings remain selectable only according to their evidence-backed maturity, and the product never presents fixture conformance as live interoperability.",
      "Inspect the packaged capability catalog and exercise selection attempts across every maturity state and unavailable optional adapter.",
    ),
    criterion(
      "AC-DEV-DESKTOP-MCP-001",
      "The plugin exposes a bounded local STDIO MCP surface with typed inputs and outputs for run creation, inspection, clarification, Gate decisions, progression, resume, and evidence retrieval while DevRelay Core remains the sole workflow authority.",
      "Validate MCP schemas and instructions, exercise every tool with positive and negative inputs, and prove no tool can caller-select routes, fabricate Gate authority, mutate graph state directly, or bypass checkpoints.",
    ),
    criterion(
      "AC-DEV-DESKTOP-OBSERVABILITY-001",
      "The Desktop experience continuously exposes the active stage, outcome, exact artifact links, Gate state, runnable frontier, task state, retries, rework, verification evidence, traceability diagnostics, and sourced performance observations in human-readable form.",
      "Run serial, conditional, interrupted, failed, retried, parallel-frontier, and completed reference cases and reconcile every source record with the rendered report.",
    ),
    criterion(
      "AC-DEV-DESKTOP-RESUME-001",
      "A Desktop or task-process interruption can resume from durable content-addressed run state without repeating a checkpointed effect, losing approval lineage, or applying one integrated change twice.",
      "Interrupt at each effect and Gate boundary, restart Desktop and the MCP server, resume the run, and prove zero-call replay plus exactly-once integration identities.",
    ),
    criterion(
      "AC-DEV-DESKTOP-SECURITY-001",
      "Filesystem, process, network, and secret access is least-privilege, explicit, bound to one run or task attempt, and enforced by the Desktop/Codex host rather than trusted to model instructions or adapter declarations.",
      "Exercise allowed and denied permission cases, source-transmission opt-in, path escape, command substitution, secret access, external network, and cross-workspace attempts.",
    ),
    criterion(
      "AC-DEV-DESKTOP-TASKS-001",
      "For every Core-derived runnable frontier, the Windows host creates one distinct Codex app-server task per work item, records its thread and attempt identity, and never lets a task select readiness, schedule unrelated work, approve itself, or integrate its own change.",
      "Execute serial and multi-item frontiers, compare task identities and context, and attempt readiness, approval, self-verification, and self-integration authority violations.",
    ),
    criterion(
      "AC-DEV-DESKTOP-WINDOWS-001",
      "The supported release path runs on the current ChatGPT Desktop for Windows host with documented Node and Codex CLI compatibility and no dependency on WSL, a hosted backend, or a second IDE.",
      "Run the complete release gate and clean-install proof on Windows using supported Node versions and the installed Codex CLI, with WSL and hosted services disabled.",
    ),
  ]);

  const nfr = (id, category, statement, measure, target, ids) => ({
    id,
    category,
    statement,
    applicability: { level: "project" },
    measure,
    target,
    priority: "must",
    acceptanceCriterionIds: ids,
    sourceRefs: refs(),
  });
  append("nonFunctionalRequirements", [
    nfr(
      "NFR-DEV-DESKTOP-DETERMINISM-001",
      "reliability",
      "The Desktop host may execute probabilistic implementation engines, but Core-owned lifecycle routing, validation, checkpoint replay, Gate preparation, traceability, and reporting must remain deterministic for exact inputs.",
      "Canonical digest equality across fresh process, reordered equivalent input, checkpoint replay, and Desktop restart cases.",
      "100 percent equality for Core-owned outputs and zero duplicate checkpointed effects.",
      ["AC-DEV-DESKTOP-DETERMINISM-001", "AC-DEV-DESKTOP-RESUME-001"],
    ),
    nfr(
      "NFR-DEV-DESKTOP-ISOLATION-001",
      "security",
      "Desktop orchestration and work-item tasks must use explicit least-privilege host-enforced grants and isolated workspaces with no undeclared cross-task access.",
      "Allowed and denied host conformance checks for every permission kind, workspace, task, and external transmission boundary.",
      "No undeclared access succeeds and every granted effect remains attributable to one exact attempt.",
      ["AC-DEV-DESKTOP-HANDOFF-001", "AC-DEV-DESKTOP-SECURITY-001", "AC-DEV-DESKTOP-TASKS-001"],
    ),
    nfr(
      "NFR-DEV-DESKTOP-WINDOWS-COMPATIBILITY-001",
      "compatibility",
      "The controlled release must operate from ChatGPT Desktop on Windows with the packaged local plugin, STDIO MCP server, supported Node runtime, and local Codex app-server.",
      "Clean-install and upgrade verification on the supported Windows Desktop host and Node compatibility matrix.",
      "One complete release run with no WSL, hosted-backend, or alternate-IDE dependency.",
      ["AC-DEV-DESKTOP-INSTALL-001", "AC-DEV-DESKTOP-WINDOWS-001"],
    ),
  ]);

  const constraint = (id, category, statement, rationale, ids) => ({
    id,
    category,
    statement,
    rationale,
    applicability: { level: "project" },
    acceptanceCriterionIds: ids,
    sourceRefs: refs(),
  });
  append("constraints", [
    constraint(
      "CON-DEV-DESKTOP-CORE-AUTHORITY-001",
      "business",
      "The Desktop plugin, MCP tools, app-server tasks, implementation models, and external adapters cannot select lifecycle routes, satisfy Gates, mutate TraceabilityGraph directly, or declare their own work verified or integrated.",
      "Host integration must expose DevRelay rather than becoming a second workflow authority or coding-agent wrapper.",
      ["AC-DEV-DESKTOP-MCP-001", "AC-DEV-DESKTOP-TASKS-001"],
    ),
    constraint(
      "CON-DEV-DESKTOP-LOCAL-FIRST-001",
      "security",
      "V1 runs locally on Windows and requires exact opt-in before repository content or secrets are transmitted beyond the configured ChatGPT/Codex host boundary.",
      "The reference release handles proprietary source and must not depend on an undeclared hosted orchestration service.",
      ["AC-DEV-DESKTOP-SECURITY-001", "AC-DEV-DESKTOP-WINDOWS-001"],
    ),
    constraint(
      "CON-DEV-DESKTOP-RELEASE-PATH-001",
      "technical",
      "Release readiness requires one live executable path through every mandatory lifecycle capability, but does not require every alternative adapter or public plugin-directory publication.",
      "A trustworthy minimum usable system is different from claiming universal live interoperability or public distribution.",
      ["AC-DEV-DESKTOP-INSTALL-001", "AC-DEV-DESKTOP-LIVE-PATH-001", "AC-DEV-DESKTOP-MATURITY-001"],
    ),
  ]);

  append("scope", [
    {
      id: "SCOPE-DEV-DESKTOP-PLUGIN-001",
      statement:
        "A repository-owned ChatGPT Desktop plugin package, local marketplace entry, workflow skill, local typed STDIO MCP runtime bridge, installation lifecycle, and Windows host documentation.",
      sourceRefs: refs(),
    },
    {
      id: "SCOPE-DEV-DESKTOP-EXECUTION-001",
      statement:
        "A Codex app-server execution host that creates one task per ready work item, supplies immutable contracts, persists task identities and raw handoffs, and returns control to DevRelay verification and integration.",
      sourceRefs: refs(),
    },
    {
      id: "SCOPE-DEV-DESKTOP-REFERENCE-RUN-001",
      statement:
        "A clean-install Windows Desktop reference run that builds a real bounded feature through every mandatory module, Gate, execution frontier, verification layer, integration step, SystemVerification, and BusinessAcceptance.",
      sourceRefs: refs(),
    },
  ]);

  append("nonGoals", [
    {
      id: "NG-DEV-DESKTOP-ALL-ADAPTERS-LIVE-001",
      statement:
        "Make every declared OpenSpec, Spec Kit, Structurizr, MADR, A2A, Task Master, or contract-format alternative release-ready in the first Desktop release.",
      rationale:
        "V1 requires one complete live reference path per mandatory capability while preserving honest maturity labels and replaceable alternative bindings.",
      sourceRefs: refs(),
    },
    {
      id: "NG-DEV-DESKTOP-PUBLIC-DIRECTORY-001",
      statement: "Publish DevRelay to the public universal OpenAI plugin directory in V1.",
      rationale:
        "Repository-backed local marketplace installation is the approved Windows Desktop distribution boundary for this release.",
      sourceRefs: refs(),
    },
  ]);

  append("terminology", [
    {
      id: "TERM-DEV-DESKTOP-RELEASE-PATH-001",
      term: "Desktop release path",
      definition:
        "The exact release-ready set of DevRelay Core, module and Gate versions, adapter bindings, plugin package, local MCP bridge, app-server executor, policies, and host versions used for the accepted Windows Desktop reference run.",
      aliases: ["release-ready binding path"],
      sourceRefs: refs(),
    },
  ]);

  append("assumptions", [
    {
      id: "ASM-DEV-DESKTOP-V1-001",
      statement:
        "V1 targets ChatGPT Desktop on Windows only, installs from a repository-backed local marketplace, launches one Codex app-server task per runnable work item, requires one live path through every mandatory lifecycle capability, and proves release readiness through a clean-install real-feature run.",
      status: "confirmed",
      blocking: false,
      sourceRefs: refs(),
    },
  ]);

  requirements.currentStatus = {
    lifecycle: "existing",
    phase: "implementation",
    summary:
      "The controlled library baseline is being extended into a release-ready ChatGPT Desktop for Windows product with an installable local plugin, typed local MCP bridge, one task per runnable work item, one live lifecycle path, and clean-install goal-to-BusinessAcceptance proof.",
    sourceRefs: refs(),
  };
  requirements.deliverables = [
    ...requirements.deliverables,
    "Repository-backed DevRelay local marketplace and installable ChatGPT Desktop plugin",
    "DevRelay workflow skill and typed local STDIO MCP runtime bridge",
    "Codex app-server work-item task executor with immutable handoff verification",
    "Release-ready binding path through every mandatory lifecycle capability",
    "Clean-install Windows Desktop end-to-end reference software run and acceptance evidence",
  ];
  requirements.dependencies = [
    ...requirements.dependencies,
    "Supported ChatGPT Desktop for Windows installation and local Codex CLI/app-server",
    "Supported Node runtime for the bundled STDIO MCP server",
    "Repository-backed local plugin marketplace and trusted local project configuration",
    "At least one release-ready implementation binding for every mandatory lifecycle capability",
  ];
  requirements.requiredEvidence = [
    ...requirements.requiredEvidence,
    "desktop/plugin-package-validation",
    "desktop/local-marketplace-install",
    "desktop/mcp-tool-conformance",
    "desktop/app-server-task-lifecycle",
    "desktop/work-item-handoff-verification",
    "desktop/checkpoint-resume",
    "desktop/permission-isolation",
    "desktop/live-binding-coverage",
    "desktop/clean-install-end-to-end-run",
    "desktop/business-acceptance",
  ];
  requirements.risks = [
    ...requirements.risks,
    "A Desktop skill could be mistaken for workflow authority unless every state transition is mediated by typed Core tools.",
    "Recursive app-server execution could create orphaned tasks or duplicate effects unless thread, attempt, checkpoint, and integration identities are durable and idempotent.",
    "A clean fixture run could overstate production readiness unless it exercises real repository changes, tests, Git integration, system verification, and business acceptance.",
    "Plugin installation or Node/Codex host drift could make an otherwise green library unusable from the supported Windows Desktop surface.",
    "Optional adapter names could mislead users unless the runtime exposes and enforces exact maturity and availability.",
  ];
  requirements.sourceRefs = [...requirements.sourceRefs, ...refs()];
  return canonicalize(requirements);
}
