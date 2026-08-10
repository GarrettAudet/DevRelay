const sortedCollectionKeys = new Set([
  "acceptanceCriteria", "assumptions", "businessObjectives", "capabilities",
  "constraints", "nonFunctionalRequirements", "nonGoals", "scope",
  "stakeholders", "successMetrics", "terminology", "userJourneys",
  "userStories", "users",
]);
const sortedStringArrayKeys = new Set([
  "acceptanceCriterionIds", "aliases", "businessObjectiveIds", "capabilityIds",
  "deliverables", "dependencies", "interests", "needs", "requiredEvidence",
  "risks", "stakeholderIds", "userIds", "userJourneyIds",
]);

function compareText(left, right) {
  return left.localeCompare(right, "en", { sensitivity: "variant" });
}
function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") {
      return entries.sort((left, right) =>
        compareText(
          [left.role, left.artifact.artifactId, left.artifact.digest, left.location ?? ""].join("\u0000"),
          [right.role, right.artifact.artifactId, right.artifact.digest, right.location ?? ""].join("\u0000"),
        ),
      );
    }
    if (sortedCollectionKeys.has(key)) {
      return entries.sort((left, right) => compareText(left.id, right.id));
    }
    if (sortedStringArrayKeys.has(key) && entries.every((entry) => typeof entry === "string")) {
      return [...new Set(entries)].sort(compareText);
    }
    return entries;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [
    childKey, canonicalize(child, childKey),
  ]));
}
function sourced(sourceRefs, value) {
  return { ...value, sourceRefs: structuredClone(sourceRefs) };
}
function replaceById(entries, id, update) {
  let found = false;
  const result = entries.map((entry) => {
    if (entry.id !== id) return entry;
    found = true;
    return update(entry);
  });
  if (!found) throw new Error("Missing requirements record " + id + ".");
  return result;
}
function appendUnique(entries, values) {
  return [...new Set([...entries, ...values])];
}

export const ownerDecisions = Object.freeze([
  Object.freeze({ decisionId: "DEC-V1-LIFECYCLE-001", decision: "Freeze an eighteen-component V1 lifecycle with explicit Contract, WorkBreakdown, WorkDependency, SpecialistAssignment, and BusinessAcceptance Gates." }),
  Object.freeze({ decisionId: "DEC-V1-FRONTIER-001", decision: "After SpecialistAssignment, repeat WorkExecution, WorkItemVerification, and ChangeIntegration for each Core-derived ready DAG frontier, then recalculate readiness from factual integrated completion." }),
  Object.freeze({ decisionId: "DEC-SA-BOUNDARY-001", decision: "SpecialistAssignment matches every approved work item to a provider-neutral specialist profile and does not select readiness, schedule, execute, or bind a concrete runtime executor." }),
  Object.freeze({ decisionId: "DEC-ADAPTER-MATURITY-001", decision: "Describe adapter bindings with contract-defined, fixture-conformant, live-conformant, or release-ready maturity rather than implying that every declared plug-in is executable." }),
  Object.freeze({ decisionId: "DEC-RUN-REPORT-001", decision: "Make a dynamically generated human-readable LifecycleRunReport.md the primary run view, backed by structured records and TraceabilityGraph without controlling progression." }),
  Object.freeze({ decisionId: "DEC-V1-E2E-001", decision: "Build every V1 component, execute one complete end-to-end run, and optimize only after measured run evidence exists." }),
]);

export function buildLifecycleReportingRequirements(currentRequirements, makeSourceRefs) {
  const requirements = structuredClone(currentRequirements);
  const sourceRefs = makeSourceRefs();

  requirements.currentStatus = sourced(sourceRefs, {
    lifecycle: "existing",
    phase: "planning",
    summary: "The revised V1 lifecycle, repeating execution frontier, narrow SpecialistAssignment boundary, adapter maturity model, and human-readable dynamic run-report requirements are confirmed and ready for Requirements Gate review.",
  });

  requirements.businessObjectives.push(sourced(sourceRefs, {
    id: "BO-DEV-OBSERVABILITY-001",
    statement: "Make every DevRelay run understandable and measurable to a human across any configured number of modules, Gates, adapters, retries, and parallel frontiers.",
    stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"],
    priority: "must",
  }));
  requirements.successMetrics.push(
    sourced(sourceRefs, {
      id: "SM-DEV-RUN-COVERAGE-001",
      name: "Complete human-readable run coverage",
      businessObjectiveIds: ["BO-DEV-OBSERVABILITY-001"],
      measure: "Attempted and completed circuit components, outcomes, adapter bindings, artifacts, Gates, and rework represented in the generated report.",
      target: "100 percent of standardized run records represented without a hard-coded module inventory.",
      measurementMethod: "Generate reports for serial, conditional, skipped, failed, resumed, parallel, and repeating-frontier fixtures and reconcile every source record.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-RUN-EFFICIENCY-001",
      name: "Observable engineering efficiency",
      businessObjectiveIds: ["BO-DEV-OBSERVABILITY-001"],
      measure: "Captured execution time, human wait, adapter calls, retries, checkpoint hits, replay savings, tokens, cost, Gate rework, and coverage metrics.",
      target: "Every configured metric has an exact value or an explicit captured, not-reported, or not-applicable disposition.",
      measurementMethod: "Compare the structured run snapshot with host observations, checkpoint records, Gate proofs, and the rendered Markdown report.",
    }),
  );
  requirements.capabilities.push(sourced(sourceRefs, {
    id: "CAP-DEV-RUN-REPORTING-001",
    name: "Human-readable lifecycle run reporting",
    description: "Project standardized execution, Gate, observation, artifact, adapter-maturity, and traceability records into one dynamic human-readable run report.",
    businessObjectiveIds: ["BO-DEV-OBSERVABILITY-001"],
    userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
    audience: "user-facing",
    key: true,
    priority: "must",
  }));
  requirements.users = replaceById(requirements.users, "USR-DEV-WORKFLOW-AUTHOR-001", (entry) =>
    sourced(sourceRefs, {
      ...entry,
      needs: appendUnique(entry.needs, [
        "Read one concise report of what happened, why progression changed, and where the evidence lives.",
        "Gauge lifecycle and adapter performance without inspecting raw JSON or inventing unavailable metrics.",
      ]),
    }),
  );
  requirements.userJourneys = replaceById(requirements.userJourneys, "UJ-DEV-GOAL-TO-ACCEPTANCE-001", (entry) =>
    sourced(sourceRefs, {
      ...entry,
      capabilityIds: appendUnique(entry.capabilityIds, ["CAP-DEV-RUN-REPORTING-001"]),
      steps: [
        { sequence: 1, action: "Establish approved requirements, architecture, and a ContractBaseline or approved not-applicable disposition.", expectedOutcome: "Authorized scope, design, and interface obligations are explicit and traceable." },
        { sequence: 2, action: "Decompose and order work, then assign every approved work item to a provider-neutral specialist profile.", expectedOutcome: "The static DAG and complete assignment baseline are approved without selecting runtime readiness." },
        { sequence: 3, action: "For each Core-derived ready frontier, execute, verify, and integrate authorized work, then derive the next frontier from factual completion.", expectedOutcome: "Only verified and integrated prerequisite work unlocks downstream work." },
        { sequence: 4, action: "Verify the integrated system and obtain an exact BusinessAcceptanceGate disposition.", expectedOutcome: "Final acceptance is bound to objectives, criteria, success metrics, and passing evidence." },
        { sequence: 5, action: "Inspect the generated LifecycleRunReport and its evidence links.", expectedOutcome: "A human can understand what was done, where rework occurred, how adapters performed, and what should be optimized." },
      ],
    }),
  );
  requirements.userStories.push(
    sourced(sourceRefs, {
      id: "US-DEV-INSPECT-RUN-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityId: "CAP-DEV-RUN-REPORTING-001", userJourneyIds: ["UJ-DEV-GOAL-TO-ACCEPTANCE-001"],
      need: "Read one plain-language report covering every attempted lifecycle component, Gate, output, and next action.",
      benefit: "The workflow remains understandable without inspecting raw graph or JSON artifacts.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-RUN-DYNAMIC-001", "AC-DEV-RUN-HUMAN-READABLE-001", "AC-DEV-RUN-TRACE-JOIN-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-GAUGE-PERFORMANCE-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityId: "CAP-DEV-RUN-REPORTING-001", userJourneyIds: ["UJ-DEV-GOAL-TO-ACCEPTANCE-001"],
      need: "Distinguish active execution, human wait, retries, replay savings, calls, tokens, cost, Gate rework, and missing measurements.",
      benefit: "Optimization decisions use comparable measured evidence rather than impressions.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-ADAPTER-COMPARABILITY-001", "AC-DEV-RUN-METRICS-001", "AC-DEV-RUN-SECURITY-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-UNDERSTAND-ADAPTERS-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityId: "CAP-DEV-RUN-REPORTING-001", userJourneyIds: ["UJ-DEV-GOAL-TO-ACCEPTANCE-001"],
      need: "See whether each configured adapter binding is merely defined, fixture-tested, live-tested, or release-ready.",
      benefit: "Declared plug-ins are not mistaken for operational integrations.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-ADAPTER-MATURITY-001"],
    }),
    sourced(sourceRefs, {
      id: "US-DEV-RUN-FRONTIERS-001", userId: "USR-DEV-WORKFLOW-AUTHOR-001",
      capabilityId: "CAP-DEV-LIFECYCLE-001", userJourneyIds: ["UJ-DEV-GOAL-TO-ACCEPTANCE-001"],
      need: "Execute every dependency-ready frontier through work execution, item verification, and integration before recalculating readiness.",
      benefit: "Parallelism remains safe and the static DAG never contains mutable execution state.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-FRONTIER-LOOP-001", "AC-DEV-SPECIALIST-BOUNDARY-001"],
    }),
  );

  requirements.acceptanceCriteria = replaceById(requirements.acceptanceCriteria, "AC-DEV-FULL-V1-SCOPE-001", () => sourced(sourceRefs, {
    id: "AC-DEV-FULL-V1-SCOPE-001",
    statement: "The approved V1 sequence contains exactly RequirementsGathering, RequirementsGate, conditional ArchitectureDiscovery, ArchitectureDesign, ArchitectureGate, conditional ContractGeneration, ContractGate, WorkBreakdown, WorkBreakdownGate, WorkDependencyAnalysis, WorkDependencyGate, SpecialistAssignment, SpecialistAssignmentGate, WorkExecution, WorkItemVerification, ChangeIntegration, SystemVerification, and BusinessAcceptanceGate, with execution, item verification, and integration repeated for each ready DAG frontier.",
    verification: "Compare the requirements scope, generated ProjectOverview, circuit ledger, module registry, and end-to-end run against the exact eighteen-component sequence and repeating frontier rule.",
  }));
  requirements.acceptanceCriteria = replaceById(requirements.acceptanceCriteria, "AC-DEV-CONDITIONAL-ROUTING-001", () => sourced(sourceRefs, {
    id: "AC-DEV-CONDITIONAL-ROUTING-001",
    statement: "ArchitectureDiscovery runs only for an existing repository without a validated architecture baseline or current snapshot; ContractGeneration runs only when approved interface intent requires formal contracts; ContractGate always produces either an approved ContractBaseline or an authority-bearing ApprovedNotApplicable disposition.",
    verification: "Exercise every discovery and contract routing state, verify exact route decisions, and reject implicit bypass or missing ContractGate disposition.",
  }));
  requirements.acceptanceCriteria = replaceById(requirements.acceptanceCriteria, "AC-DEV-VERIFICATION-001", () => sourced(sourceRefs, {
    id: "AC-DEV-VERIFICATION-001",
    statement: "WorkItemVerification records scoped passing evidence before ChangeIntegration, SystemVerification records system-level passing evidence after the final integration, and BusinessAcceptanceGate binds its disposition to the exact verified system and business evidence.",
    verification: "Attempt item integration, system completion, and business acceptance with missing, stale, failing, or unrelated evidence and verify deterministic rejection.",
  }));
  requirements.acceptanceCriteria.push(
    sourced(sourceRefs, { id: "AC-DEV-RUN-DYNAMIC-001", statement: "LifecycleRunReport projection discovers components from standardized circuit and execution records and correctly represents any module count plus conditional, skipped, failed, resumed, parallel, and repeating-frontier activity without product-ID branches.", verification: "Generate reports from varied synthetic and dogfood circuits, reconcile every record, and scan projection Core for module, Gate, adapter, or product identifiers." }),
    sourced(sourceRefs, { id: "AC-DEV-RUN-HUMAN-READABLE-001", statement: "LifecycleRunReport.md is the primary user-facing artifact and begins with an executive summary and plain-language stage table covering what happened, selected operation, adapter bindings, outcome, Gate result, rework, performance, important outputs, and next action.", verification: "Render the completed DevRelay dogfood run and perform schema, snapshot, Markdown-byte, section-order, link-resolution, and owner readability review." }),
    sourced(sourceRefs, { id: "AC-DEV-RUN-METRICS-001", statement: "Every configured duration, human-wait, adapter-call, retry, checkpoint-hit, replay-saving, token, cost, Gate-rework, coverage, and artifact metric contains an exact value and provenance or an explicit captured, not-reported, or not-applicable disposition; no value is inferred from absence.", verification: "Exercise complete, partial, unsupported, delayed-approval, retry, replay, and parallel observations and compare every rendered metric with its immutable source record." }),
    sourced(sourceRefs, { id: "AC-DEV-RUN-TRACE-JOIN-001", statement: "The report joins operational history with the exact TraceabilityGraph snapshot to show readable business-objective through requirement, architecture, work, change, verification, integration, and acceptance paths plus orphan, unscoped-work, and missing-evidence diagnostics.", verification: "Reconcile report paths and coverage counts with deterministic graph queries and reject a graph, execution, or update reference outside the run lineage." }),
    sourced(sourceRefs, { id: "AC-DEV-RUN-NON-AUTHORITY-001", statement: "RunLedger observations and LifecycleRunReport projections are read-only cross-cutting infrastructure and cannot route modules, select adapters, mutate canonical artifacts, satisfy evidence, approve Gates, or alter progression.", verification: "Attempt report-driven routing, approval, graph mutation, evidence substitution, and artifact replacement and verify fail-closed rejection with unchanged workflow state." }),
    sourced(sourceRefs, { id: "AC-DEV-RUN-SECURITY-001", statement: "Run reports expose exact identities and aggregate performance evidence without embedding secret values, raw credentials, unrestricted prompts, or sensitive tool logs unless a separately approved redaction policy explicitly permits content.", verification: "Inject secrets and sensitive raw observations, verify deterministic redaction or omission dispositions, and prove that artifact links retain auditability without disclosing protected bytes." }),
    sourced(sourceRefs, { id: "AC-DEV-ADAPTER-MATURITY-001", statement: "Every adapter binding declares exactly one maturity status from contract-defined, fixture-conformant, live-conformant, or release-ready, with evidence appropriate to that status; Core-owned implementations are labeled separately from adapters.", verification: "Validate maturity manifests, reject unknown or unsupported claims, and verify that the human-readable report distinguishes adapters from Core-owned Graphology-DAG and OPA implementations." }),
    sourced(sourceRefs, { id: "AC-DEV-ADAPTER-COMPARABILITY-001", statement: "Performance comparisons between adapter bindings are permitted only when module version, operation, input artifact digests, policy, circuit version, and relevant host conditions satisfy an explicit comparability contract; otherwise the report marks them non-comparable.", verification: "Compare exact and mismatched runs across each comparability dimension and verify that only the exact comparable set produces relative performance claims." }),
    sourced(sourceRefs, { id: "AC-DEV-FRONTIER-LOOP-001", statement: "Core derives each runnable frontier from the immutable WorkDependencyBaseline plus separately approved integrated-completion facts, executes independent ready items concurrently where policy permits, and derives the next frontier only after required verification and integration facts are recorded.", verification: "Run branching, joining, serial, failed-item, retry, partial-frontier, and resumed fixtures and verify that no dependent item becomes ready from assignment, execution start, or unintegrated changes." }),
    sourced(sourceRefs, { id: "AC-DEV-SPECIALIST-BOUNDARY-001", statement: "SpecialistAssignment matches every approved work item to a provider-neutral specialist profile covering its required capabilities, tools, grant demands, rationale, and execution policy without selecting readiness, scheduling, modifying the DAG, executing work, or binding a concrete provider, model, human, or runtime process.", verification: "Validate complete assignment coverage and attempt readiness selection, scheduling, graph mutation, provider binding, and execution outputs from the assignment module." }),
  );

  requirements.nonFunctionalRequirements.push(
    sourced(sourceRefs, {
      id: "NFR-DEV-RUN-REPORT-DETERMINISM-001", category: "reliability",
      statement: "Given the same standardized run records, graph snapshot, maturity records, and rendering contract, Core must produce byte-identical structured and Markdown run reports.",
      applicability: { level: "project" }, measure: "Canonical snapshot digest and raw LifecycleRunReport.md digest equality across insertion orders and replays.",
      target: "100 percent equality for identical report inputs.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-RUN-DYNAMIC-001", "AC-DEV-RUN-HUMAN-READABLE-001"],
    }),
    sourced(sourceRefs, {
      id: "NFR-DEV-RUN-REPORT-OBSERVABILITY-001", category: "observability",
      statement: "The run-reporting surface must preserve enough sourced operational evidence to separate active work, queueing, human approval wait, retries, replay, rework, and unavailable measurements.",
      applicability: { level: "project" }, measure: "Percentage of configured report metrics carrying exact provenance or an explicit absence disposition.",
      target: "100 percent.", priority: "must", acceptanceCriterionIds: ["AC-DEV-RUN-METRICS-001"],
    }),
    sourced(sourceRefs, {
      id: "NFR-DEV-RUN-REPORT-PRIVACY-001", category: "privacy",
      statement: "Human-readable reports must minimize sensitive content while preserving content-addressed audit links and explicit redaction or omission dispositions.",
      applicability: { level: "project" }, measure: "Secret-scanning and redaction-policy conformance over structured and Markdown report fixtures.",
      target: "Zero unapproved secret or credential disclosures.", priority: "must", acceptanceCriterionIds: ["AC-DEV-RUN-SECURITY-001"],
    }),
  );

  requirements.constraints = replaceById(requirements.constraints, "CON-DEV-MODULE-INVENTORY-001", () => sourced(sourceRefs, {
    id: "CON-DEV-MODULE-INVENTORY-001", category: "business",
    statement: "V1 lifecycle scope is limited to the eighteen owner-approved components and repeating execution-frontier rule recorded in the project overview; TraceabilityGraph and LifecycleRunReport remain cross-cutting infrastructure rather than additional stages.",
    rationale: "A frozen V1 boundary enables one complete end-to-end run before evidence-driven optimization or later deployment and operations extensions.",
    applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-FULL-V1-SCOPE-001"],
  }));
  requirements.constraints.push(sourced(sourceRefs, {
    id: "CON-DEV-RUN-REPORT-NON-AUTHORITY-001", category: "technical",
    statement: "Run observations and reports cannot participate in semantic artifact identity, Gate authority, evidence satisfaction, routing, or progression.",
    rationale: "Operational telemetry may be incomplete or host-dependent and must not change deterministic engineering outcomes.",
    applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-RUN-NON-AUTHORITY-001"],
  }));

  const scopeUpdates = new Map([
    ["SCOPE-DEV-V1-060-CONTRACT-GENERATION", "ContractGeneration [module; conditional]: ContractGeneration produces candidate machine-readable API, schema, event, protocol, data, or other interface contracts only when approved architecture intent requires them."],
    ["SCOPE-DEV-V1-090-SPECIALIST-ASSIGNMENT", "SpecialistAssignment [module]: SpecialistAssignment matches every approved work item to a provider-neutral specialist profile satisfying required capabilities without selecting readiness, scheduling, or binding a concrete executor."],
    ["SCOPE-DEV-V1-100-WORK-EXECUTION", "WorkExecution [module; repeating frontier]: WorkExecution binds an authorized ready work item and approved specialist profile to an exact runtime executor, performs only that bounded work, and returns a candidate ChangeSet without owning verification or integration."],
    ["SCOPE-DEV-V1-110-WORK-ITEM-VERIFICATION", "WorkItemVerification [module; repeating frontier]: WorkItemVerification evaluates each executed work item against its verification plan, acceptance criteria, and required evidence before integration."],
    ["SCOPE-DEV-V1-120-CHANGE-INTEGRATION", "ChangeIntegration [module; repeating frontier]: ChangeIntegration incorporates verified ChangeSets under dependency-safe policy, records factual integrated completion, and enables Core to derive the next ready frontier."],
    ["SCOPE-DEV-V1-140-BUSINESS-ACCEPTANCE", "BusinessAcceptanceGate [gate]: BusinessAcceptanceGate evaluates the exact SystemVerification result against approved business objectives, success metrics, scope, acceptance criteria, and required evidence and records the final disposition."],
  ]);
  for (const [id, statement] of scopeUpdates) {
    requirements.scope = replaceById(requirements.scope, id, (entry) => sourced(sourceRefs, { ...entry, statement }));
  }
  requirements.scope.push(
    sourced(sourceRefs, { id: "SCOPE-DEV-V1-065-CONTRACT-GATE", statement: "ContractGate [gate]: ContractGate validates exact generated contracts or authorizes an explicit ApprovedNotApplicable disposition before work planning." }),
    sourced(sourceRefs, { id: "SCOPE-DEV-V1-075-WORK-BREAKDOWN-GATE", statement: "WorkBreakdownGate [gate]: WorkBreakdownGate validates complete approved-scope coverage and promotes the exact WorkBreakdownBaseline without deciding dependency order." }),
    sourced(sourceRefs, { id: "SCOPE-DEV-V1-085-WORK-DEPENDENCY-GATE", statement: "WorkDependencyGate [gate]: WorkDependencyGate validates graph mechanics, policy, consistency evidence, semantic completeness, and exact approval before promoting the static WorkDependencyBaseline." }),
    sourced(sourceRefs, { id: "SCOPE-DEV-V1-095-SPECIALIST-ASSIGNMENT-GATE", statement: "SpecialistAssignmentGate [gate]: SpecialistAssignmentGate validates complete work-item assignment coverage, capability satisfaction, policy, grants, rationale, and approval before runtime executor binding." }),
    sourced(sourceRefs, { id: "SCOPE-DEV-RUN-REPORTING-001", statement: "Cross-cutting RunLedger and LifecycleRunReport projection that dynamically records what happened, renders a primary human-readable Markdown report, joins exact traceability, and exposes sourced performance evidence without controlling the lifecycle." }),
  );

  requirements.nonGoals.push(
    sourced(sourceRefs, { id: "NG-DEV-RUN-REPORT-AUTHORITY-001", statement: "Turn the run report, operational telemetry, or performance score into a workflow controller or approval authority.", rationale: "Reporting observes trusted workflow facts; it does not create or promote them." }),
    sourced(sourceRefs, { id: "NG-DEV-METRIC-FABRICATION-001", statement: "Infer missing duration, token, cost, wait, success, or maturity values from absent or incomplete host observations.", rationale: "Explicit absence dispositions are more trustworthy than fabricated precision." }),
  );
  requirements.terminology.push(
    sourced(sourceRefs, { id: "TERM-DEV-ADAPTER-MATURITY-001", term: "Adapter binding maturity", definition: "The evidence-backed implementation state of one exact adapter binding: contract-defined, fixture-conformant, live-conformant, or release-ready.", aliases: ["Adapter maturity"] }),
    sourced(sourceRefs, { id: "TERM-DEV-LIFECYCLE-RUN-REPORT-001", term: "Lifecycle run report", definition: "The deterministic human-readable projection of one exact circuit run, its operational records, important artifacts, Gate decisions, performance observations, and traceability snapshot.", aliases: ["Run report"] }),
    sourced(sourceRefs, { id: "TERM-DEV-RUN-LEDGER-001", term: "Run ledger", definition: "An append-only, content-addressed sequence of standardized module, Gate, adapter, checkpoint, approval, observation, and progression records for one run.", aliases: ["Execution ledger"] }),
    sourced(sourceRefs, { id: "TERM-DEV-RUN-OBSERVATION-001", term: "Run observation", definition: "A non-authoritative host-recorded measurement such as duration, calls, tokens, cost, wait, retry, or checkpoint use, bound to an exact execution identity and explicit availability disposition.", aliases: ["Execution observation"] }),
  );

  requirements.assumptions = replaceById(requirements.assumptions, "ASM-DEV-CONDITIONAL-MODULES-001", () => sourced(sourceRefs, {
    id: "ASM-DEV-CONDITIONAL-MODULES-001",
    statement: "ArchitectureDiscovery and ContractGeneration remain conditional lifecycle modules, while ContractGate always records either an approved ContractBaseline or ApprovedNotApplicable disposition.",
    status: "confirmed", blocking: false,
  }));
  requirements.assumptions.push(
    sourced(sourceRefs, { id: "ASM-DEV-V1-SEQUENCE-REVISED-001", statement: "The eighteen-component sequence and repeating execution-frontier loop are the frozen V1 construction and dogfood target.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-DEV-RUN-METRICS-AVAILABILITY-001", statement: "Hosts may not expose every timing, token, or cost measurement; explicit not-reported and not-applicable dispositions are acceptable and remain visible.", status: "confirmed", blocking: false }),
  );

  requirements.dependencies = appendUnique(requirements.dependencies, [
    "Standardized content-addressed module, Gate, adapter, checkpoint, approval, and progression records.",
    "A trusted host observation boundary for optional timing, token, cost, queue, and approval-wait measurements.",
    "Exact TraceabilityGraph snapshots and deterministic query results for lifecycle lineage and coverage.",
  ]);
  requirements.risks = appendUnique(requirements.risks, [
    "A human-readable report may become misleading if missing measurements are silently treated as zero.",
    "Adapter performance comparisons may be invalid when inputs, policies, hosts, or circuit versions differ.",
    "Operational telemetry may leak secrets or sensitive logs unless report projection applies explicit content policy.",
    "A reporting service may accidentally acquire workflow authority unless its read-only boundary is enforced.",
    "Frontier completion may unlock dependent work too early unless only verified integrated-completion facts affect readiness.",
  ]);
  requirements.deliverables = appendUnique(requirements.deliverables, [
    "LifecycleRunSnapshot and RunLedger artifact contracts.",
    "Deterministic primary LifecycleRunReport.md renderer with exact artifact links.",
    "Dynamic report projection and adapter-maturity registry integration.",
    "One complete DevRelay V1 end-to-end dogfood report followed by evidence-driven optimization recommendations.",
  ]);
  requirements.requiredEvidence = appendUnique(requirements.requiredEvidence, [
    "run-report/dynamic-projection", "run-report/human-readability",
    "run-report/metric-provenance", "run-report/non-authority",
    "run-report/security-redaction", "run-report/traceability-reconciliation",
    "run-report/adapter-comparability", "lifecycle/frontier-recalculation",
    "specialist-assignment/boundary",
  ]);
  requirements.sourceRefs = canonicalize(sourceRefs, "sourceRefs");
  return canonicalize(requirements);
}

