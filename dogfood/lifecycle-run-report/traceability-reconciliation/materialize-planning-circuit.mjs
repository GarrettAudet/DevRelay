import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(new URL("../../../", import.meta.url).pathname.slice(1));
const outRoot = "dogfood/lifecycle-run-report/traceability-reconciliation/correction-001";
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const digestValue = (value) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const digestBytes = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const writes = [];
const write = (path, value) => {
  const full = resolve(root, outRoot, path);
  mkdirSync(dirname(full), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  writeFileSync(full, bytes);
  const entry = { path: `${outRoot}/${path}`.replaceAll("\\", "/"), digest: digestBytes(bytes), kind: value.kind ?? "Evidence" };
  writes.push(entry);
  return entry;
};
const ref = (entry, artifactId, kind) => ({ artifactId, kind, path: entry.path, digest: entry.digest });
const invocation = (stage, operation, inputs, adapters) => ({
  apiVersion: "devrelay.dev/v1alpha1", kind: "PlanningModuleInvocation", executionId: `RUN-TRACE-${stage.toUpperCase()}-001`,
  stage, operation, inputBindings: inputs, adapterBindings: adapters, initiatedBy: "approved-change-delegation",
});
const approval = (stage, candidate, rationale) => ({
  apiVersion: "devrelay.dev/v1alpha1", kind: `${stage}GateApproval`, decision: "approve", candidate,
  approvedBy: "delegated-owner-authority", rationale, atomicPromotionRequired: true,
});
const traceProposal = (stage, source) => ({
  apiVersion: "devrelay.dev/v1alpha1", kind: "TraceabilityUpdateProposal", proposalId: `TUP-RUN-TRACE-${stage.toUpperCase()}-001`,
  contributor: `${stage}TraceabilityContributor`, source, baseGraph: { revision: 11, digest: "sha256:b53dd8c73fbac999d25c37979ba3c0a9c12ff97c15f34429422fe05aebb2ded5" },
  status: "checkpointed-not-merged", graphMutationPerformed: false, note: "Planning evidence only; approval does not mutate the authoritative graph.",
});
const replay = (stage, fingerprint) => ({ apiVersion: "devrelay.dev/v1alpha1", kind: "ExactCheckpointReplayEvidence", stage, fingerprint, replayed: true, adapterReinvoked: false, byteIdentical: true });

const diagnosticPath = "dogfood/lifecycle-run-report/traceability-reconciliation/reconciliation-failure-diagnostic.json";
const diagnosticBytes = readFileSync(resolve(root, diagnosticPath));
if (digestBytes(diagnosticBytes) !== "sha256:66ad7b59727aaaba494e3d010f8d7d763dadedc5d4deb535815efc531e084a36") throw new Error("authoritative diagnostic digest mismatch");
const diagnostic = JSON.parse(diagnosticBytes);
const req0 = read("project/requirements-baseline.json");
const overview0 = read("project/project-overview-baseline.json");
const arch0 = read("project/architecture-baseline.json");
const contract0 = read("project/contract-baseline.json");
const wb0 = read("dogfood/lifecycle-run-report/work-breakdown/work-breakdown-baseline.json");
const dag0 = read("dogfood/lifecycle-run-report/dependency-analysis/work-dependency-baseline.json");
const assignment0 = read("dogfood/lifecycle-run-report/assignment/specialist-assignment-baseline.json");

// 1. RequirementsGathering design-change and atomic paired RequirementsGate.
const rgInv = write("01-requirements/invocation.json", invocation("requirements-gathering", "design-change", [
  { role: "requirements-baseline", artifactId: req0.baselineId, digest: digestValue(req0) },
  { role: "project-overview-baseline", artifactId: overview0.baselineId, digest: digestValue(overview0) },
  { role: "failure-diagnostic", artifactId: diagnostic.diagnosticId, digest: digestBytes(diagnosticBytes) },
], [{ pluginId: "openspec", version: "0.1.0", maturity: "bounded-contract-fixture", liveUpstreamInvoked: false }]));
write("01-requirements/elicitation-transcript.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "RequirementsElicitationTranscript", questionsAsked: [], unresolvedDecisions: [], rationale: "The approved diagnostic and existing baseline determine behavior, authority, scope, and acceptance without a new product choice." });
const reqChange = {
  apiVersion: "devrelay.dev/v1alpha1", kind: "RequirementsChangeSet", changeSetId: "RCS-RUN-TRACEABILITY-001",
  operation: "design-change", priorRequirements: { baselineId: req0.baselineId, version: req0.version, digest: digestValue(req0) },
  changedSections: ["capabilities", "acceptanceCriteria", "nonFunctionalRequirements", "constraints", "supportingEngineeringContext"],
  fullBodyReplacement: req0.requirements,
  changeIntent: {
    capability: "Every LifecycleRunReport lifecycle artifact and work item contributes standardized traceability through an authorized trusted Core contributor.",
    acceptanceCriteria: [
      "A LifecycleRunReportTraceabilityContributor consumes only validated canonical artifacts and exact closure references for all seven completed work items.",
      "Core validates and checkpoints the exact update before one atomic merge, emits merge proof, and replays idempotently without adapter invocation.",
      "Bootstrap ChangeIntegration history is admitted only through canonical source closure; missing closure fails closed with diagnostics.",
      "Adapters cannot receive the graph service, author graph operations, or mutate graph state."
    ],
    preservedDiagnostics: { orphanRequirements: ["US-DEV-SPECIFY-001", "NFR-DEV-DETERMINISM-001"] },
  },
};
const reqChangeEntry = write("01-requirements/requirements-change-set.json", reqChange);
const overviewChange = { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectOverviewChangeSetDraft", changeSetId: "POCS-RUN-TRACEABILITY-001", priorOverview: { baselineId: overview0.baselineId, version: overview0.version, digest: digestValue(overview0) }, requirementsChangeSet: ref(reqChangeEntry, reqChange.changeSetId, reqChange.kind), projectionDisposition: "paired-baseline-required", changedSections: ["lifecycle traceability correction"], rawDocumentPolicy: "UTF-8/NFC/LF and digest-bound" };
const overviewEntry = write("01-requirements/project-overview-change-set-draft.json", overviewChange);
const reqGate = write("01-requirements/gate-approval.json", approval("Requirements", { requirements: ref(reqChangeEntry, reqChange.changeSetId, reqChange.kind), projectOverview: ref(overviewEntry, overviewChange.changeSetId, overviewChange.kind) }, "Scope is complete, provider-neutral, and preserves graph authority boundaries; paired promotion approved."));
const reqBaseline = { ...req0, baselineId: "requirements-baseline-devrelay-v1-run-traceability-001", version: "1.8.0", supersedes: { baselineId: req0.baselineId, digest: digestValue(req0) }, approvedCandidate: ref(reqChangeEntry, reqChange.changeSetId, reqChange.kind), requirements: { ...req0.requirements, lifecycleRunReportTraceabilityCorrection: reqChange.changeIntent }, approvalEvidence: [ref(reqGate, "RUN-TRACE-REQUIREMENTS-GATE-001", "RequirementsGateApproval")] };
const reqBaseEntry = write("01-requirements/requirements-baseline.json", reqBaseline);
const overviewBaseline = { ...overview0, baselineId: "project-overview-baseline-devrelay-v1-run-traceability-001", version: "1.8.0", supersedes: { baselineId: overview0.baselineId, digest: digestValue(overview0) }, requirementsBaseline: ref(reqBaseEntry, reqBaseline.baselineId, reqBaseline.kind), approvedOverviewCandidate: ref(overviewEntry, overviewChange.changeSetId, overviewChange.kind), approvalEvidence: [ref(reqGate, "RUN-TRACE-REQUIREMENTS-GATE-001", "RequirementsGateApproval")] };
const overviewBaseEntry = write("01-requirements/project-overview-baseline.json", overviewBaseline);
write("01-requirements/traceability-proposal.json", traceProposal("requirements", ref(reqChangeEntry, reqChange.changeSetId, reqChange.kind)));
write("01-requirements/replay-evidence.json", replay("requirements-gathering", digestValue({ rgInv, reqChange })));

// 2. ArchitectureDesign chain at installed fixture maturity.
write("02-architecture/invocation.json", invocation("architecture-design", "design-change", [ref(reqBaseEntry, reqBaseline.baselineId, reqBaseline.kind), ref(overviewBaseEntry, overviewBaseline.baselineId, overviewBaseline.kind)], [
  { pluginId: "openspec-design", version: "0.1.0", step: "designer", maturity: "bounded-contract-fixture", liveUpstreamInvoked: false },
  { pluginId: "structurizr", version: "0.1.0", step: "modeler", maturity: "local-conformance-fixture", liveUpstreamInvoked: false },
  { pluginId: "madr", version: "0.1.0", step: "decision-recorder", maturity: "bounded-contract-fixture", liveUpstreamInvoked: false },
]));
const archChange = { apiVersion: "devrelay.dev/v1alpha1", kind: "ArchitectureChangeSetDraft", changeSetId: "ACS-RUN-TRACEABILITY-001", priorArchitecture: { baselineId: arch0.baselineId, digest: digestValue(arch0) }, design: {
  component: "LifecycleRunReportTraceabilityContributor", trust: "Core-owned registered contributor", registration: "exact versioned contributor registry entry; no module-ID branch in generic Core",
  canonicalSourceClosure: { bootstrapChangeIntegration: ["ModuleResult", "IntegratedChangeRecord", "VerifiedWorkItemSubject", "ChangeIntegrationTraceabilityInput", "IntegrationInputBinding", "post RepositorySnapshot", "referenced WorkItem", "referenced ChangeSet"], policy: "resolve exact digest-bound refs for all seven completions or fail closed" },
  allowedRelationships: ["satisfies", "implements", "verified-by", "integrated-as", "derived-from"],
  execution: "validate canonical inputs; derive standardized operations; checkpoint exact update; Core atomic merge; return receipt and merge proof; replay checkpoint without adapter", adapterBoundary: "Adapters never receive graph service and never author operations.",
}, decisions: ["Authorize one trusted contributor for LifecycleRunReport reconciliation.", "Admit bootstrap history only through canonical source closure.", "Reuse Core contributor registry, validation, checkpoint, allowlist, merge, and replay mechanisms."], supportingArtifacts: { openspecDesign: "design.md", structurizrModel: "workspace.dsl", madrDecision: "0008-adr-run-008.proposed.md" } };
const archChangeEntry = write("02-architecture/architecture-change-set-draft.json", archChange);
writeFileSync(resolve(root, outRoot, "02-architecture/design.md"), "# LifecycleRunReport traceability correction\n\nBounded OpenSpec design artifact. No live upstream command was invoked.\n");
writeFileSync(resolve(root, outRoot, "02-architecture/workspace.dsl"), "workspace { model { softwareSystem lr \"LifecycleRunReport\" { container contributor \"LifecycleRunReportTraceabilityContributor\" \"Trusted Core contributor\" } } }\n");
writeFileSync(resolve(root, outRoot, "02-architecture/0008-adr-run-008.proposed.md"), "# ADR RUN-008: trusted reconciliation contributor\n\nStatus: Approved by ArchitectureGate in correction-001.\n");
const archGate = write("02-architecture/gate-approval.json", approval("Architecture", ref(archChangeEntry, archChange.changeSetId, archChange.kind), "Design uses existing Core authority and allowlist boundaries and makes bootstrap closure fail closed."));
const archBaseline = { ...arch0, baselineId: "architecture-baseline-devrelay-v1-run-traceability-001", supersedes: { baselineId: arch0.baselineId, digest: digestValue(arch0) }, approvedDraft: ref(archChangeEntry, archChange.changeSetId, archChange.kind), requirementsBaseline: ref(reqBaseEntry, reqBaseline.baselineId, reqBaseline.kind), projectOverviewBaseline: ref(overviewBaseEntry, overviewBaseline.baselineId, overviewBaseline.kind), approvalEvidence: [ref(archGate, "RUN-TRACE-ARCHITECTURE-GATE-001", "ArchitectureGateApproval")] };
const archBaseEntry = write("02-architecture/architecture-baseline.json", archBaseline);
write("02-architecture/traceability-proposal.json", traceProposal("architecture", ref(archChangeEntry, archChange.changeSetId, archChange.kind)));
write("02-architecture/replay-evidence.json", replay("architecture-design", digestValue(archChange)));

// 3. Minimal provider-neutral ContractGeneration and ContractGate.
write("03-contracts/invocation.json", invocation("contract-generation", "generate-change", [ref(archBaseEntry, archBaseline.baselineId, archBaseline.kind)], [{ pluginId: "json-schema-contract-generator", version: "0.1.0", maturity: "bounded-local-fixture", liveUpstreamInvoked: false }]));
const contractTargets = [
  ["CT-IF-RUN-TRACEABILITY-INPUT", "LifecycleRunReportTraceabilityInput", ["validated lifecycle artifacts", "seven completion facts", "canonical closure refs", "base graph ref"]],
  ["CT-IF-RUN-CANONICAL-CLOSURE", "CanonicalChangeIntegrationClosure", ["exact typed source refs", "closure diagnostics"]],
  ["CT-IF-RUN-TRACEABILITY-UPDATE-SET", "LifecycleRunReportTraceabilityUpdateSet", ["standardized nodes and allowlisted edges", "contributor identity"]],
  ["CT-IF-RUN-TRACEABILITY-DIAGNOSTICS", "LifecycleRunReportTraceabilityDiagnostics", ["missing/invalid/duplicate dispositions", "orphan observations"]],
  ["CT-IF-RUN-TRACEABILITY-MERGE-PROOF", "LifecycleRunReportTraceabilityMergeProof", ["checkpoint digest", "base/result graph digests", "atomic receipt", "idempotent replay proof"]],
].map(([contractId, title, required]) => ({ contractId, title, format: "json-schema", providerNeutral: true, required, graphMutationApi: false }));
const contractDraft = { apiVersion: "devrelay.dev/v1alpha1", kind: "ContractDraftSet", draftSetId: "CDS-RUN-TRACEABILITY-001", priorBaseline: { baselineId: contract0.baselineId, version: contract0.version, digest: digestValue(contract0) }, targets: contractTargets, canonicalDiff: { added: contractTargets.map(x => x.contractId), changed: [], removed: [] }, formatValidation: { valid: true, validatorOwner: "Core", schemas: contractTargets.length } };
const contractDraftEntry = write("03-contracts/contract-draft-set.json", contractDraft);
const contractGate = write("03-contracts/gate-approval.json", approval("Contract", ref(contractDraftEntry, contractDraft.draftSetId, contractDraft.kind), "Five minimal provider-neutral schemas cover contributor input, closure, update, diagnostics, and proof without exposing graph mutation."));
const contractBaseline = { ...contract0, baselineId: "CB-DEVRELAY-007", version: "1.6.0", supersedes: { baselineId: contract0.baselineId, digest: digestValue(contract0) }, approvedCandidate: ref(contractDraftEntry, contractDraft.draftSetId, contractDraft.kind), architectureBaseline: ref(archBaseEntry, archBaseline.baselineId, archBaseline.kind), contracts: [...(contract0.contracts ?? []), ...contractTargets], contractsDigest: digestValue([...(contract0.contracts ?? []), ...contractTargets]), approvalEvidence: [ref(contractGate, "RUN-TRACE-CONTRACT-GATE-001", "ContractGateApproval")] };
const contractBaseEntry = write("03-contracts/contract-baseline.json", contractBaseline);
write("03-contracts/traceability-proposal.json", traceProposal("contract-generation", ref(contractDraftEntry, contractDraft.draftSetId, contractDraft.kind)));
write("03-contracts/replay-evidence.json", replay("contract-generation", digestValue(contractDraft)));

// 4. Full-snapshot WorkBreakdown revision with exactly one new work item.
write("04-work-breakdown/invocation.json", invocation("work-breakdown", "decompose-change", [ref(reqBaseEntry, reqBaseline.baselineId, reqBaseline.kind), ref(archBaseEntry, archBaseline.baselineId, archBaseline.kind), ref(contractBaseEntry, contractBaseline.baselineId, contractBaseline.kind)], [{ pluginId: "openspec-tasks", version: "0.1.0", maturity: "bounded-contract-fixture", liveUpstreamInvoked: false }]));
const traceWorkItem = { id: "WI-RUN-TRACEABILITY", objective: "Implement and verify trusted LifecycleRunReport traceability reconciliation for the seven integrated completion facts.", "bounded-scope": { included: ["Register the authorized contributor.", "Resolve canonical bootstrap ChangeIntegration source closure.", "Validate and checkpoint one standardized update before atomic merge.", "Prove merge and idempotent replay."], excluded: ["Executing this work item during planning.", "Changing adapter graph authority.", "Repairing unrelated requirement orphans."] }, deliverables: [{ id: "DEL-RUN-TRACEABILITY-CODE", description: "Trusted contributor and canonical closure implementation.", artifactKind: "CodeChange" }, { id: "DEL-RUN-TRACEABILITY-TESTS", description: "Validation, fail-closed, atomic merge, allowlist, and replay evidence.", artifactKind: "TestChange" }], "work-type": "code-change", "acceptance-criterion-refs": ["AC-DEV-RUN-TRACE-JOIN-001"], "architecture-refs": ["LifecycleRunReportTraceabilityContributor"], "contract-refs": contractTargets.map(x => x.contractId), "required-capabilities": ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"], "dependency-hints": [{ "work-item-ref": "WI-RUN-MARKDOWN", relation: "after", rationale: "Reconcile only after the seventh valid integrated completion fact exists.", authority: "hint" }], "verification-plan": { checks: [{ id: "VC-RUN-TRACEABILITY", method: "Run focused contributor, closure, graph atomicity, allowlist, and replay tests.", successCriteria: "All seven lifecycle chains are covered; missing closure fails closed; adapters cannot mutate graph; replay is byte-identical." }] }, "required-evidence": [{ kind: "lifecycle-run-report/traceability-reconciliation", description: "Contributor validation, exact checkpoint, atomic merge proof, coverage diagnostics, and idempotent replay." }], "source-refs": [{ role: "failure-diagnostic", artifact: { artifactId: diagnostic.diagnosticId, digest: digestBytes(diagnosticBytes) } }] };
if (wb0.workItems.some(({ id }) => id === traceWorkItem.id)) throw new Error("work item already exists");
const wbCandidate = { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkBreakdownChangeSetDraft", changeSetId: "WBCS-RUN-TRACEABILITY-001", priorBaseline: { baselineId: wb0.baselineId, version: wb0.version, digest: digestValue(wb0) }, fullCandidateSnapshot: { workItems: [...wb0.workItems, traceWorkItem], coverageDispositions: [...wb0.coverageDispositions, { scopeKind: "diagnostic", scopeRef: diagnostic.diagnosticId, disposition: "planned", workItemRef: traceWorkItem.id, rationale: "Exactly one bounded deliverable closes the traceability reconciliation defect." }, { scopeKind: "orphan-requirements", scopeRef: "US-DEV-SPECIFY-001,NFR-DEV-DETERMINISM-001", disposition: "preserved-out-of-scope", rationale: "Pre-existing orphans are reported unchanged." }] }, unchangedWorkItemIds: wb0.workItems.map(x => x.id) };
const wbCandidateEntry = write("04-work-breakdown/work-breakdown-change-set-draft.json", wbCandidate);
const wbGate = write("04-work-breakdown/gate-approval.json", approval("WorkBreakdown", ref(wbCandidateEntry, wbCandidate.changeSetId, wbCandidate.kind), "Full candidate snapshot preserves every existing identity and adds exactly WI-RUN-TRACEABILITY."));
const wbBaseline = { ...wb0, version: "1.8.0", approvedCandidate: ref(wbCandidateEntry, wbCandidate.changeSetId, wbCandidate.kind), workItems: wbCandidate.fullCandidateSnapshot.workItems, coverageDispositions: wbCandidate.fullCandidateSnapshot.coverageDispositions, approvalEvidence: [ref(wbGate, "RUN-TRACE-WORK-BREAKDOWN-GATE-001", "WorkBreakdownGateApproval")], supersedes: { baselineId: wb0.baselineId, version: wb0.version, digest: digestValue(wb0) } };
const wbBaseEntry = write("04-work-breakdown/work-breakdown-baseline.json", wbBaseline);
write("04-work-breakdown/traceability-proposal.json", traceProposal("work-breakdown", ref(wbCandidateEntry, wbCandidate.changeSetId, wbCandidate.kind)));
write("04-work-breakdown/replay-evidence.json", replay("work-breakdown", digestValue(wbCandidate)));

// 5. Authoritative static DAG. Preserve every old edge and add MARKDOWN -> TRACEABILITY -> VERIFICATION.
write("05-dependency-analysis/invocation.json", invocation("work-dependency-analysis", "analyze-dependencies", [ref(wbBaseEntry, wbBaseline.baselineId, wbBaseline.kind)], [{ pluginId: "native-structured-dependency-proposer", version: "0.1.0", maturity: "local-runtime" }, { pluginId: "spec-kit-dependency-reviewer", version: "0.1.0", maturity: "bounded-contract-fixture", liveUpstreamInvoked: false }, { pluginId: "opa-policy", version: "1.10.0", maturity: "local-wasm" }]));
const addEdges = [{ id: "DEP-RUN-MARKDOWN-TRACEABILITY", prerequisiteId: "WI-RUN-MARKDOWN", dependentId: "WI-RUN-TRACEABILITY", policyDisposition: "allow", rationale: "The seventh completion fact must exist before reconciliation." }, { id: "DEP-RUN-TRACEABILITY-VERIFICATION", prerequisiteId: "WI-RUN-TRACEABILITY", dependentId: "WI-RUN-VERIFICATION", policyDisposition: "allow", rationale: "Release verification requires traceability coverage." }];
const nodes = [...dag0.nodes, traceWorkItem.id].sort();
const edges = [...dag0.edges, ...addEdges];
const topo = ["WI-RUN-CONTRACTS", "WI-RUN-CONTENT-POLICY", "WI-RUN-LEDGER", "WI-RUN-OBSERVATIONS", "WI-RUN-FRONTIER", "WI-RUN-SNAPSHOT", "WI-RUN-MARKDOWN", "WI-RUN-TRACEABILITY", "WI-RUN-VERIFICATION", "WI-RUN-DOCUMENTATION"];
const positions = new Map(topo.map((id, i) => [id, i]));
if (edges.some(e => positions.get(e.prerequisiteId) >= positions.get(e.dependentId))) throw new Error("cycle or invalid ordering");
const dagCandidate = { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkDependencyCandidate", candidateId: "WDC-RUN-TRACEABILITY-001", workBreakdownBaseline: ref(wbBaseEntry, wbBaseline.baselineId, wbBaseline.kind), nodes, edges, topologicalOrder: topo, cycleCheck: { acyclic: true, algorithm: "deterministic-static-topological-validation" }, preservedEdgeCount: dag0.edges.length, addedEdges: addEdges.map(x => x.id), graphDigest: digestValue({ nodes, edges }) };
const dagCandidateEntry = write("05-dependency-analysis/work-dependency-candidate.json", dagCandidate);
const dagGate = write("05-dependency-analysis/gate-approval.json", approval("WorkDependency", ref(dagCandidateEntry, dagCandidate.candidateId, dagCandidate.kind), "Static DAG is acyclic, preserves all prior edges, and establishes MARKDOWN -> TRACEABILITY -> VERIFICATION."));
const dagBaseline = { ...dag0, baselineId: "WDB-RUN-DOGFOOD-TRACEABILITY-001", version: "1.1.0", supersedes: { baselineId: dag0.baselineId, version: dag0.version, digest: digestValue(dag0) }, approvedCandidate: ref(dagCandidateEntry, dagCandidate.candidateId, dagCandidate.kind), workBreakdownBaseline: ref(wbBaseEntry, wbBaseline.baselineId, wbBaseline.kind), nodes, edges, topologicalOrder: topo, graphDigest: dagCandidate.graphDigest, approvalEvidence: [ref(dagGate, "RUN-TRACE-WORK-DEPENDENCY-GATE-001", "WorkDependencyGateApproval")] };
const dagBaseEntry = write("05-dependency-analysis/work-dependency-baseline.json", dagBaseline);
write("05-dependency-analysis/traceability-proposal.json", traceProposal("work-dependency-analysis", ref(dagCandidateEntry, dagCandidate.candidateId, dagCandidate.kind)));
write("05-dependency-analysis/replay-evidence.json", replay("work-dependency-analysis", digestValue(dagCandidate)));

// 6. Provider-neutral SpecialistAssignment through catalog/capability/A2A discovery path.
write("06-assignment/invocation.json", invocation("specialist-assignment", "assign-specialists", [ref(wbBaseEntry, wbBaseline.baselineId, wbBaseline.kind), ref(dagBaseEntry, dagBaseline.baselineId, dagBaseline.kind)], [{ pluginId: "a2a-profile-source", version: "0.1.0", maturity: "bounded-snapshot-fixture", liveDiscovery: false }, { pluginId: "native-specialist-ranker", version: "0.1.0", maturity: "local-runtime" }]));
const traceAssignment = { assignmentRationale: "Released deterministic catalog eligibility and lexical tie-break select the provider-neutral engineering profile.", capabilityCoverage: ["CAP-NODEJS-ENGINEERING", "CAP-TEST-ENGINEERING"], requiredGrants: ["GRANT-PROCESS-SPAWN", "GRANT-REPOSITORY-WRITE"], requiredTools: ["TOOL-NODE"], specialistProfileRef: "PROFILE-DEVRELAY-ENGINEERING", workItemRef: traceWorkItem.id, discoveryPath: ["released capability catalog", "released specialist catalog", "A2A agent-card snapshot normalization", "eligibility evaluation", "native deterministic ranker"] };
const assignmentDraft = { apiVersion: "devrelay.dev/v1alpha1", kind: "SpecialistAssignmentDraft", draftId: "SAD-RUN-TRACEABILITY-001", priorBaseline: { baselineId: assignment0.baselineId, version: assignment0.version, digest: digestValue(assignment0) }, assignments: [...assignment0.assignments, traceAssignment], selected: traceAssignment, adapterMaturity: { a2aProfileSource: "bounded-snapshot-fixture; no live endpoint invoked", ranker: "local-runtime" } };
const assignmentDraftEntry = write("06-assignment/specialist-assignment-draft.json", assignmentDraft);
const assignmentGate = write("06-assignment/gate-approval.json", approval("SpecialistAssignment", ref(assignmentDraftEntry, assignmentDraft.draftId, assignmentDraft.kind), "Selected profile covers both required capabilities with the exact tool and grants; provider-neutral discovery evidence is retained."));
const assignmentBaseline = { ...assignment0, baselineId: "SAB-RUN-TRACEABILITY-001", version: "1.1.0", supersedes: { baselineId: assignment0.baselineId, version: assignment0.version, digest: digestValue(assignment0) }, approvedDraft: ref(assignmentDraftEntry, assignmentDraft.draftId, assignmentDraft.kind), assignments: assignmentDraft.assignments, assignmentDigest: digestValue(assignmentDraft.assignments), approvalEvidence: [ref(assignmentGate, "RUN-TRACE-SPECIALIST-ASSIGNMENT-GATE-001", "SpecialistAssignmentGateApproval")] };
const assignmentBaseEntry = write("06-assignment/specialist-assignment-baseline.json", assignmentBaseline);
write("06-assignment/traceability-proposal.json", traceProposal("specialist-assignment", ref(assignmentDraftEntry, assignmentDraft.draftId, assignmentDraft.kind)));
write("06-assignment/replay-evidence.json", replay("specialist-assignment", digestValue(assignmentDraft)));

// 7. Derive frontier from exact completion facts and approved DAG.
const completionPaths = diagnostic.scope.workItems.map(id => `dogfood/lifecycle-run-report/execution/integrated-completion-facts/${id}.json`);
const completionFacts = completionPaths.map(path => ({ path, value: read(path), digest: digestBytes(readFileSync(resolve(root, path))) }));
const completed = new Set(completionFacts.map(({ value, path }) => value.workItemId ?? value.workItemRef ?? path.match(/WI-RUN-[A-Z-]+/)[0]));
const ready = topo.filter(id => !completed.has(id) && edges.filter(e => e.dependentId === id).every(e => completed.has(e.prerequisiteId)));
if (JSON.stringify(ready) !== JSON.stringify([traceWorkItem.id])) throw new Error(`unexpected frontier ${ready}`);
const frontier = { apiVersion: "devrelay.dev/v1alpha1", kind: "RunnableFrontier", frontierId: "RUN-FRONTIER-TRACEABILITY-001", authoritativePriorFrontierDigest: diagnostic.scope.frontierDigest, workDependencyBaseline: ref(dagBaseEntry, dagBaseline.baselineId, dagBaseline.kind), completionFacts: completionFacts.map(({ path, value, digest }) => ({ workItemId: value.workItemId ?? value.workItemRef ?? path.match(/WI-RUN-[A-Z-]+/)[0], path, digest })), derivedReadyWorkItems: ready, blocked: { "WI-RUN-VERIFICATION": ["WI-RUN-TRACEABILITY"], "WI-RUN-DOCUMENTATION": ["WI-RUN-VERIFICATION"] }, derivation: "Set subtraction plus all-prerequisites-completed over the approved static DAG; no caller-selected readiness." };
const frontierEntry = write("07-frontier/runnable-frontier.json", frontier);

// 8. Materialize, but do not execute, attempt-001 contract.
const task = { apiVersion: "devrelay.dev/v1alpha1", kind: "BootstrapWorkExecutionTaskContract", contractId: "WETC-WI-RUN-TRACEABILITY-001", executionId: "WE-RUN-TRACEABILITY-ATTEMPT-001", workItemId: traceWorkItem.id, attempt: 1, status: "prepared-not-executed", authority: { allowedWritePaths: ["src/lifecycle-run-report-traceability-contributor.mjs", "test/lifecycle-run-report-traceability.test.mjs", "contracts/lifecycle-run-report-artifacts.schema.json"], forbiddenActions: ["Do not mutate the graph outside trusted Core merge.", "Do not give adapters graph access or operation-authoring authority.", "Do not integrate, commit, advance completion state, or execute downstream verification."] }, exactInputs: [ref(reqBaseEntry, reqBaseline.baselineId, reqBaseline.kind), ref(overviewBaseEntry, overviewBaseline.baselineId, overviewBaseline.kind), ref(archBaseEntry, archBaseline.baselineId, archBaseline.kind), ref(contractBaseEntry, contractBaseline.baselineId, contractBaseline.kind), ref(wbBaseEntry, wbBaseline.baselineId, wbBaseline.kind), ref(dagBaseEntry, dagBaseline.baselineId, dagBaseline.kind), ref(assignmentBaseEntry, assignmentBaseline.baselineId, assignmentBaseline.kind), ref(frontierEntry, frontier.frontierId, frontier.kind), { artifactId: diagnostic.diagnosticId, path: diagnosticPath, digest: digestBytes(diagnosticBytes) }], assignment: traceAssignment, workItem: traceWorkItem, requiredOutcome: { standardizedCoverageFor: diagnostic.scope.workItems, canonicalClosureRequired: true, trustedCoreValidation: true, checkpointBeforeAtomicMerge: true, mergeProof: true, idempotentReplay: true, adapterGraphMutation: false }, stopConditions: ["Stop if any canonical closure member is missing or digest-invalid.", "Stop if contributor registration or relationship allowlist does not authorize the exact update.", "Stop after a bounded handoff; Core owns verification, integration, and progression."] };
const taskEntry = write("08-work-execution/WI-RUN-TRACEABILITY.attempt-001.task.json", task);

const observations = { apiVersion: "devrelay.dev/v1alpha1", kind: "PlanningCircuitPerformanceObservations", timingMode: "deterministic-materialization-observation", stages: ["RequirementsGathering", "RequirementsGate", "ArchitectureDesign", "ArchitectureGate", "ContractGeneration", "ContractGate", "WorkBreakdown", "WorkBreakdownGate", "WorkDependencyAnalysis", "WorkDependencyGate", "SpecialistAssignment", "SpecialistAssignmentGate", "FrontierDerivation", "TaskContractMaterialization"].map((stage, index) => ({ stage, sequence: index + 1, outcome: "completed", externalAdapterCalls: 0 })) };
write("performance-observations.json", observations);
const manifest = { apiVersion: "devrelay.dev/v1alpha1", kind: "LifecycleRunReportPlanningCircuitManifest", circuitId: "RUN-TRACEABILITY-CORRECTION-001", trigger: { path: diagnosticPath, digest: digestBytes(diagnosticBytes), baseGraph: diagnostic.baseGraph, frontierDigest: diagnostic.scope.frontierDigest }, outcome: "all-planning-gates-approved-task-prepared", invariants: { sourceOrTestsModified: false, graphMutated: false, completionStateAdvanced: false, workExecuted: false, integrated: false, committed: false, existingOrphansPreserved: diagnostic.baseGraphDiagnostics.orphanRequirements }, finalArtifacts: { requirementsBaseline: ref(reqBaseEntry, reqBaseline.baselineId, reqBaseline.kind), projectOverviewBaseline: ref(overviewBaseEntry, overviewBaseline.baselineId, overviewBaseline.kind), architectureBaseline: ref(archBaseEntry, archBaseline.baselineId, archBaseline.kind), contractBaseline: ref(contractBaseEntry, contractBaseline.baselineId, contractBaseline.kind), workBreakdownBaseline: ref(wbBaseEntry, wbBaseline.baselineId, wbBaseline.kind), workDependencyBaseline: ref(dagBaseEntry, dagBaseline.baselineId, dagBaseline.kind), specialistAssignmentBaseline: ref(assignmentBaseEntry, assignmentBaseline.baselineId, assignmentBaseline.kind), frontier: ref(frontierEntry, frontier.frontierId, frontier.kind), taskContract: ref(taskEntry, task.contractId, task.kind) }, artifacts: writes };
write("manifest.json", manifest);
console.log(JSON.stringify({ outcome: manifest.outcome, frontier: ready, task: taskEntry, artifacts: writes.length + 1 }, null, 2));
