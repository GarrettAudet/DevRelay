import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { businessAcceptanceTraceabilityContributor } from "../src/business-acceptance-traceability-contributor.mjs";
import { TRACEABILITY_VOCABULARY_V1_6, TRACEABILITY_VOCABULARY_V1_7 } from "../src/traceability-artifact-validator.mjs";
import { requirementsBaselineObserverContributor } from "../src/requirements-traceability-contributor.mjs";
import { createInMemoryTraceabilityStore, createTraceabilityGraphService, diagnoseTraceabilityGraph } from "../src/traceability-graph.mjs";

const API = "devrelay.dev/v1alpha1";
const D = `sha256:${"a".repeat(64)}`;
const shortRef = (artifactId, digest = D) => ({ artifactId, digest });
const seal = (value, field) => ({ ...value, [field]: canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const artifactRef = (artifactId, digest) => ({ artifactId, digest, schema: "https://devrelay.dev/fixture/v1", mediaType: "application/json", uri: `memory:///${artifactId}.json` });
const loaded = (value) => { const bytes = Buffer.from(canonicalJson(value)); return { value, bytes, ref: artifactRef(value.recordId ?? value.approvalId ?? value.candidateId ?? value.evaluationId ?? value.evidenceSetId ?? value.policyId ?? value.coverageId ?? value.resultId ?? value.subjectId, sha256Digest(bytes)) }; };
const replace = (entry, value) => { entry.value = value; entry.bytes = Buffer.from(canonicalJson(value)); entry.ref = artifactRef(value.recordId ?? value.approvalId ?? value.candidateId ?? value.evaluationId ?? value.evidenceSetId ?? value.policyId ?? value.coverageId ?? value.resultId ?? value.subjectId, sha256Digest(entry.bytes)); };

function fixture({ objectiveId = "BO-1", metricId = "SM-1", scopeId = "BS-1", scopeIds = [scopeId] } = {}) {
  const requirementsBaseline = shortRef("REQ"), projectOverviewBaseline = shortRef("PO"), architectureBaseline = shortRef("ARCH"), contractDisposition = shortRef("CONTRACT");
  const integrated = seal({ apiVersion: API, kind: "IntegratedSystemCandidate", subjectId: "INTEGRATED", repositorySnapshot: shortRef("REPO"), integratedChangeRecords: [shortRef("ICR")], integratedCompletionFactSet: shortRef("COMPLETE"), requirementsBaseline, projectOverviewBaseline, architectureBaseline, contractDisposition, workBreakdownBaseline: shortRef("WB"), workDependencyBaseline: shortRef("WD"), specialistAssignmentBaseline: shortRef("SA"), verificationEnvironment: { disposition: "approved-not-applicable", rationale: "fixture" }, systemVerificationPolicy: shortRef("SV-POL") }, "subjectDigest");
  const systemResult = seal({ apiVersion: API, kind: "SystemVerificationResult", resultId: "SVR", subject: shortRef(integrated.subjectId, integrated.subjectDigest), obligationSet: shortRef("SV-OBS"), policy: shortRef("SV-POL"), evidence: shortRef("SV-EVID"), evaluation: shortRef("SV-EVAL"), outcome: "verified", progression: "business-acceptance-gate", authority: "system-verification" }, "resultDigest");
  const policy = seal({ apiVersion: API, kind: "BusinessAcceptancePolicy", policyId: "BA-POL", version: "1.0.0", allObjectivesMandatory: true, allMetricsMandatory: true, allBusinessScopeMandatory: true, allAcceptanceCriteriaMandatory: true, unknownEvidence: "reject", outcomePrecedence: ["failed", "needs-evidence", "satisfied"] }, "policyDigest");
  const scopeEvidence = scopeIds.map((approvedScopeId, index) => ({ evidenceId: scopeIds.length === 1 ? "EV-BS" : `EV-BS-${String(index + 1).padStart(3, "0")}`, scopeKind: "business-scope", scopeId: approvedScopeId, status: "pass", artifact: shortRef(scopeIds.length === 1 ? "REPORT-BS" : `REPORT-BS-${String(index + 1).padStart(3, "0")}`), producer: { id: "owner-evidence", version: "1.0.0" } }));
  const evidence = seal({ apiVersion: API, kind: "BusinessAcceptanceEvidenceSet", evidenceSetId: "BA-EVID", requirementsBaseline, projectOverviewBaseline, systemVerificationResult: shortRef(systemResult.resultId, systemResult.resultDigest), items: [{ evidenceId: "EV-BO", scopeKind: "business-objective", scopeId: objectiveId, status: "pass", artifact: shortRef("REPORT-BO"), producer: { id: "owner-evidence", version: "1.0.0" } }, ...scopeEvidence, { evidenceId: "EV-SM", scopeKind: "success-metric", scopeId: metricId, status: "pass", artifact: shortRef("REPORT-SM"), producer: { id: "owner-evidence", version: "1.0.0" } }] }, "evidenceDigest");
  const technicalCoverage = seal({ apiVersion: API, kind: "BusinessAcceptanceTechnicalCoverage", coverageId: "BA-COVERAGE", requirementsBaseline, systemVerificationResult: shortRef(systemResult.resultId, systemResult.resultDigest), traceabilityCheckpoint: shortRef("GRAPH"), approvedAcceptanceCriterionIds: ["AC-1"], entries: [{ acceptanceCriterionId: "AC-1", status: "passing", evidence: shortRef("SV-EVIDENCE"), evidenceNodeId: `sha256:${"b".repeat(64)}`, pathNodeIds: [D, `sha256:${"b".repeat(64)}`], pathEdgeIds: [`sha256:${"c".repeat(64)}`] }], technicalAuthority: "system-verification", derivationAuthority: "business-acceptance-core" }, "coverageDigest");
  const subject = seal({ apiVersion: API, kind: "BusinessAcceptanceSubject", subjectId: "BA-SUBJECT", integratedSystemCandidate: shortRef(integrated.subjectId, integrated.subjectDigest), systemVerificationResult: shortRef(systemResult.resultId, systemResult.resultDigest), technicalCoverage: shortRef(technicalCoverage.coverageId, technicalCoverage.coverageDigest), requirementsBaseline, projectOverviewBaseline, architectureBaseline, contractDisposition, repositoryReleaseSnapshot: shortRef("RELEASE"), policy: shortRef(policy.policyId, policy.policyDigest), businessEvidence: shortRef(evidence.evidenceSetId, evidence.evidenceDigest), traceabilityCheckpoint: shortRef("GRAPH") }, "subjectDigest");
  const evaluation = seal({ apiVersion: API, kind: "BusinessAcceptanceEvaluation", evaluationId: "BA-EVAL", subject: shortRef(subject.subjectId, subject.subjectDigest), policy: shortRef(policy.policyId, policy.policyDigest), evidence: shortRef(evidence.evidenceSetId, evidence.evidenceDigest), technicalCoverage: shortRef(technicalCoverage.coverageId, technicalCoverage.coverageDigest), approvedBusinessObjectiveIds: [objectiveId], approvedSuccessMetricIds: [metricId], approvedBusinessScopeIds: scopeIds, dispositions: [{ scopeKind: "business-objective", scopeId: objectiveId, status: "satisfied", evidenceIds: ["EV-BO"] }, ...scopeEvidence.map(({ scopeId: approvedScopeId, evidenceId }) => ({ scopeKind: "business-scope", scopeId: approvedScopeId, status: "satisfied", evidenceIds: [evidenceId] })), { scopeKind: "success-metric", scopeId: metricId, status: "satisfied", evidenceIds: ["EV-SM"] }], outcome: "eligible-for-acceptance" }, "evaluationDigest");
  const candidate = seal({ apiVersion: API, kind: "BusinessAcceptanceCandidate", candidateId: "BA-CANDIDATE", subject: shortRef(subject.subjectId, subject.subjectDigest), policy: evaluation.policy, evidence: evaluation.evidence, evaluation: shortRef(evaluation.evaluationId, evaluation.evaluationDigest), outcome: "eligible-for-acceptance", authority: "candidate" }, "candidateDigest");
  const candidateRawDigest = sha256Digest(Buffer.from(canonicalJson(candidate)));
  const approval = seal({ apiVersion: API, kind: "BusinessAcceptanceOwnerApproval", approvalId: "BA-APPROVAL", candidate: shortRef(candidate.candidateId, candidate.candidateDigest), candidateRawDigest, decision: "approved", owner: { ownerId: "OWNER", authority: "business-owner" }, approvedContext: { subject: candidate.subject, policy: candidate.policy, evidence: candidate.evidence, technicalCoverage: subject.technicalCoverage } }, "approvalDigest");
  const record = seal({ apiVersion: API, kind: "BusinessAcceptanceRecord", recordId: "BA-RECORD", candidate: shortRef(candidate.candidateId, candidate.candidateDigest), approval: shortRef(approval.approvalId, approval.approvalDigest), subject: candidate.subject, outcome: "accepted", lifecycleDisposition: "construction-complete", authority: "business-acceptance-gate" }, "recordDigest");
  const artifacts = [integrated, systemResult, technicalCoverage, policy, evidence, subject, evaluation, candidate, approval, record].map(loaded);
  const context = { invocation: { invocationId: "BA-INV", module: { id: "business-acceptance-gate", version: "0.1.0", operation: "record-acceptance" } }, invocationFingerprint: D, moduleResult: { apiVersion: API, kind: "ModuleResult", invocationId: "BA-INV", status: "completed", outcome: "accepted", outputs: { "business-acceptance-record": [artifacts[9].ref] }, evidence: [], diagnostics: [] }, loadedInputs: { integrated: [artifacts[0]], verification: [artifacts[1]], coverage: [artifacts[2]], policy: [artifacts[3]], evidence: [artifacts[4]], subject: [artifacts[5]], evaluation: [artifacts[6]], candidate: [artifacts[7]], approval: [artifacts[8]] }, loadedOutputs: { record: [artifacts[9]] }, loadedAttachments: {} };
  return { context, artifacts };
}

function seedContributor(projection) {
  return { metadata: { id: "fixture.requirements", version: "1.0.0" }, authority: "approved", scope: "requirements/baseline", ownership: { authority: "approved", scope: "requirements/baseline", nodeKinds: ["business-objective", "business-scope", "success-metric"], edgeKinds: [] }, match: () => true, project: () => ({ horizon: "requirements", nodes: [{ kind: "business-objective", stableId: "BO-1", label: "BO-1", attributes: {}, sourceLocators: projection.edges[0].sourceLocators }, { kind: "business-scope", stableId: "BS-1", label: "BS-1", attributes: {}, sourceLocators: projection.edges[0].sourceLocators }, { kind: "success-metric", stableId: "SM-1", label: "SM-1", attributes: {}, sourceLocators: projection.edges[0].sourceLocators }], edges: [] }) };
}

test("exact accepted record projects forward objective, metric, and business-scope acceptance/evidence and merges atomically", async () => {
  const { context } = fixture();
  const projection = await businessAcceptanceTraceabilityContributor.project(context);
  assert.equal(projection.horizon, "acceptance");
  assert.deepEqual(projection.edges.map(({ source, kind, target }) => [source.kind, kind, target.kind]), [["business-objective", "accepted-by", "business-acceptance-record"], ["business-scope", "accepted-by", "business-acceptance-record"], ["success-metric", "accepted-by", "business-acceptance-record"], ["business-objective", "verified-by", "verification-evidence"], ["business-scope", "verified-by", "verification-evidence"], ["success-metric", "verified-by", "verification-evidence"]]);
  assert.equal(canonicalJson(projection).match(/candidate|rejected|inverse|deploy/), null);
  const seed = seedContributor(projection);
  const service = createTraceabilityGraphService({ graphId: "ba", projectId: "devrelay", store: createInMemoryTraceabilityStore(), contributors: [seed, businessAcceptanceTraceabilityContributor] });
  const seedContext = { ...context, invocation: { invocationId: "seed", module: { id: "seed", version: "1", operation: "seed" } }, moduleResult: { ...context.moduleResult, invocationId: "seed", outcome: "seed" } };
  await service.mergePrepared(await service.prepare({ ...seedContext, baseGraph: service.captureBase() }));
  const prepared = await service.prepare({ ...context, baseGraph: service.captureBase() });
  const first = await service.mergePrepared(prepared), replay = await service.mergePrepared(prepared);
  assert.equal(first.receipt.disposition, "merged");
  assert.deepEqual(first.receipt.resultGraph, replay.receipt.resultGraph);
  assert.equal(replay.snapshot.horizon, "acceptance");
  const evidenceNodes = replay.snapshot.nodes.filter(({ kind }) => kind === "verification-evidence");
  assert.deepEqual(evidenceNodes.map(({ stableId, verificationStatus }) => [stableId, verificationStatus]).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0), [["EV-BO", "pass"], ["EV-BS", "pass"], ["EV-SM", "pass"]]);
  for (const stableId of ["BO-1", "BS-1", "SM-1"]) {
    const source = replay.snapshot.nodes.find((node) => node.stableId === stableId);
    const verifiedBy = replay.snapshot.edges.find((edge) => edge.kind === "verified-by" && edge.sourceNodeId === source.nodeId);
    const target = replay.snapshot.nodes.find((node) => node.nodeId === verifiedBy?.targetNodeId);
    assert.equal(target?.verificationStatus, "pass", `${stableId} must reach passing evidence`);
  }
  const missing = diagnoseTraceabilityGraph(replay.snapshot).filter(({ code }) => code === "TG_MISSING_EVIDENCE");
  assert.equal(missing.some(({ subjectId }) => replay.snapshot.nodes.some((node) => node.nodeId === subjectId && new Set(["BO-1", "BS-1", "SM-1"]).has(node.stableId))), false);
});

test("v1.6 accepts forward BusinessAcceptance edges introduced in v1.5", async () => {
  const { context } = fixture();
  const projection = await businessAcceptanceTraceabilityContributor.project(context);
  const seed = seedContributor(projection);
  const service = createTraceabilityGraphService({
    graphId: "ba-v1-6",
    projectId: "devrelay",
    store: createInMemoryTraceabilityStore(),
    contributors: [seed, businessAcceptanceTraceabilityContributor],
    vocabulary: TRACEABILITY_VOCABULARY_V1_6,
  });
  const seedContext = { ...context, invocation: { invocationId: "seed-v1-6", module: { id: "seed", version: "1", operation: "seed" } }, moduleResult: { ...context.moduleResult, invocationId: "seed-v1-6", outcome: "seed" } };
  await service.mergePrepared(await service.prepare({ ...seedContext, baseGraph: service.captureBase() }));
  const prepared = await service.prepare({ ...context, baseGraph: service.captureBase() });
  const merged = await service.mergePrepared(prepared);
  assert.deepEqual(merged.snapshot.vocabulary, TRACEABILITY_VOCABULARY_V1_6);
  assert.deepEqual(merged.snapshot.edges.filter(({ kind }) => kind === "accepted-by").map(({ kind }) => kind), ["accepted-by", "accepted-by", "accepted-by"]);
});

test("v1.7 accepts forward BusinessAcceptance edges", async () => {
  const { context } = fixture();
  const projection = await businessAcceptanceTraceabilityContributor.project(context);
  const seed = seedContributor(projection);
  const service = createTraceabilityGraphService({
    graphId: "ba-v1-7",
    projectId: "devrelay",
    store: createInMemoryTraceabilityStore(),
    contributors: [seed, businessAcceptanceTraceabilityContributor],
    vocabulary: TRACEABILITY_VOCABULARY_V1_7,
  });
  const seedContext = { ...context, invocation: { invocationId: "seed-v1-7", module: { id: "seed", version: "1", operation: "seed" } }, moduleResult: { ...context.moduleResult, invocationId: "seed-v1-7", outcome: "seed" } };
  await service.mergePrepared(await service.prepare({ ...seedContext, baseGraph: service.captureBase() }));
  const merged = await service.mergePrepared(await service.prepare({ ...context, baseGraph: service.captureBase() }));
  assert.deepEqual(merged.snapshot.vocabulary, TRACEABILITY_VOCABULARY_V1_7);
  assert.deepEqual(merged.snapshot.edges.filter(({ kind }) => kind === "accepted-by").map(({ kind }) => kind), ["accepted-by", "accepted-by", "accepted-by"]);
});
test("production baselines compose Core and real contributors with exhaustive authoritative business-scope identities", async () => {
  const requirementsBytes = await readFile(new URL("../project/requirements-baseline.json", import.meta.url));
  const overviewBytes = await readFile(new URL("../project/project-overview-baseline.json", import.meta.url));
  const requirements = JSON.parse(requirementsBytes);
  const overview = JSON.parse(overviewBytes);
  const requirementsRef = artifactRef(requirements.baselineId, sha256Digest(requirementsBytes));
  const overviewRef = artifactRef(overview.baselineId, sha256Digest(overviewBytes));
  const requirementsContext = {
    projectId: "devrelay",
    invocation: { invocationId: "REQ-OBSERVE", module: { id: "architecture-design", version: "0.1.0", operation: "establish-baseline" } },
    invocationFingerprint: canonicalJsonDigest({ invocationId: "REQ-OBSERVE" }),
    moduleResult: { invocationId: "REQ-OBSERVE", status: "completed", outcome: "designed", outputs: {}, evidence: [], diagnostics: [] },
    loadedInputs: {
      "requirements-baseline": [{ ref: requirementsRef, value: requirements, bytes: requirementsBytes }],
      "project-overview-baseline": [{ ref: overviewRef, value: overview, bytes: overviewBytes }],
    },
    loadedOutputs: {},
  };
  const { deriveBusinessScopeIdentities } = await import("../src/business-acceptance-core.mjs");
  assert.equal(typeof deriveBusinessScopeIdentities, "function");
  const coreScopes = deriveBusinessScopeIdentities(requirements);
  const requirementsProjection = await requirementsBaselineObserverContributor.project(requirementsContext);
  const scopeNodes = requirementsProjection.nodes.filter(({ kind }) => kind === "business-scope");
  const expectedScopeIds = requirements.requirements.scope.map(({ id }) => id).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  assert.deepEqual(coreScopes.map(({ scopeId }) => scopeId), expectedScopeIds);
  assert.deepEqual(scopeNodes.map(({ stableId }) => stableId).sort((left, right) => left < right ? -1 : left > right ? 1 : 0), expectedScopeIds);
  for (const scope of coreScopes) {
    const source = requirements.requirements.scope.find(({ id }) => id === scope.scopeId);
    assert.ok(source);
    assert.equal(scope.statement, source.statement);
    assert.deepEqual(scope.sourceRefs, source.sourceRefs);
  }
  const objectiveId = requirements.requirements.businessObjectives[0].id;
  const metricId = requirements.requirements.successMetrics[0].id;
  const accepted = fixture({ objectiveId, metricId, scopeIds: expectedScopeIds });
  const service = createTraceabilityGraphService({
    graphId: "ba-real-cross-slice",
    projectId: "devrelay",
    store: createInMemoryTraceabilityStore(),
    contributors: [requirementsBaselineObserverContributor, businessAcceptanceTraceabilityContributor],
  });
  await service.mergePrepared(await service.prepare({ ...requirementsContext, baseGraph: service.captureBase() }));
  const merged = await service.mergePrepared(await service.prepare({ ...accepted.context, baseGraph: service.captureBase() }));
  const resolvedScopes = merged.snapshot.nodes.filter(({ kind }) => kind === "business-scope");
  assert.deepEqual(resolvedScopes.map(({ stableId }) => stableId).sort((left, right) => left < right ? -1 : left > right ? 1 : 0), expectedScopeIds);
  const scopeNodeIds = new Set(resolvedScopes.map(({ nodeId }) => nodeId));
  for (const resolvedScope of resolvedScopes) {
    const scopeEdges = merged.snapshot.edges.filter(({ sourceNodeId, kind }) => sourceNodeId === resolvedScope.nodeId && new Set(["accepted-by", "verified-by"]).has(kind));
    assert.deepEqual(scopeEdges.map(({ kind }) => kind).sort((left, right) => left < right ? -1 : left > right ? 1 : 0), ["accepted-by", "verified-by"]);
    for (const edge of scopeEdges) assert.ok(merged.snapshot.nodes.some(({ nodeId }) => nodeId === edge.targetNodeId));
  }
  const blockingScopeDiagnostics = diagnoseTraceabilityGraph(merged.snapshot).filter(({ blocking, code, subjectId }) => blocking && scopeNodeIds.has(subjectId) && new Set(["TG_ORPHAN_REQUIREMENT", "TG_MISSING_EVIDENCE"]).has(code));
  assert.deepEqual(blockingScopeDiagnostics, []);
});

test("candidate, rejected, missing-evidence, orphan, adapter-authored, and inverse facts fail closed", async () => {
  for (const outcome of ["eligible-for-acceptance", "rejected"]) { const { context } = fixture(); context.moduleResult = { ...context.moduleResult, outcome }; await assert.rejects(businessAcceptanceTraceabilityContributor.project(context), /nonmatching/); }
  const missing = fixture(); const changedEvaluation = seal({ ...missing.artifacts[6].value, dispositions: [{ ...missing.artifacts[6].value.dispositions[0], evidenceIds: ["EV-MISSING"] }, ...missing.artifacts[6].value.dispositions.slice(1)] }, "evaluationDigest"); replace(missing.artifacts[6], changedEvaluation); await assert.rejects(businessAcceptanceTraceabilityContributor.project(missing.context), /unknown evidence|missing, orphaned/);
  const orphan = fixture(); const changedEvidence = seal({ ...orphan.artifacts[4].value, items: [...orphan.artifacts[4].value.items, { ...orphan.artifacts[4].value.items[0], evidenceId: "EV-ORPHAN" }] }, "evidenceDigest"); replace(orphan.artifacts[4], changedEvidence); await assert.rejects(businessAcceptanceTraceabilityContributor.project(orphan.context), /stale|orphan evidence/);
  const adapter = fixture(); const authored = seal({ ...adapter.artifacts[4].value, graphOperations: [{ kind: "accepted-by" }] }, "evidenceDigest"); replace(adapter.artifacts[4], authored); await assert.rejects(businessAcceptanceTraceabilityContributor.project(adapter.context), /invalid|stale/);
  const projection = await businessAcceptanceTraceabilityContributor.project(fixture().context);
  const inverse = { ...businessAcceptanceTraceabilityContributor, metadata: { id: "inverse", version: "1.0.0" }, project: () => ({ horizon: "acceptance", nodes: projection.nodes, edges: [{ ...projection.edges[0], source: projection.edges[0].target, target: projection.edges[0].source }] }) };
  const service = createTraceabilityGraphService({ graphId: "inverse", projectId: "devrelay", store: createInMemoryTraceabilityStore(), contributors: [inverse] });
  await assert.rejects(service.prepare({ ...fixture().context, baseGraph: service.captureBase() }), /dangling endpoint|invalid known endpoints|invalid business-acceptance-record -> business-objective endpoints/);
});
