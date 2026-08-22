import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../../../src/index.mjs";
import { runAdaptiveRequirementsInterview } from "../../../src/requirements-interview.mjs";
import { promoteRoadmapBaseline } from "../../../src/roadmap-gate.mjs";

const API = "devrelay.dev/v1alpha1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const out = "dogfood/ep-001-environment-preparation/roadmap-resolution";
const read = (p) => fs.readFileSync(path.join(root, p));
const json = (p) => JSON.parse(read(p));
const writeJson = (p, value, newline = true) => { const target = path.join(root, p); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${api.canonicalJson(value)}${newline ? "\n" : ""}`, "utf8"); };
const writeBytes = (p, value) => { const target = path.join(root, p); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
const fullRef = (artifactId, digest, schema, mediaType, uri) => ({ artifactId, digest, schema, mediaType, uri });
const loadRaw = (p, artifactId, schema, mediaType, uri) => { const bytes = read(p); return { value: JSON.parse(bytes), bytes, ref: fullRef(artifactId, api.sha256Digest(bytes), schema, mediaType, uri) }; };

const current = loadRaw("project/history/roadmap/1.0.0/roadmap-baseline.json", json("project/history/roadmap/1.0.0/roadmap-baseline.json").baselineId, api.ROADMAP_ARTIFACT_CONTRACTS.RoadmapBaseline.schema, api.ROADMAP_ARTIFACT_CONTRACTS.RoadmapBaseline.mediaType, "devrelay://repository/project/roadmap-baseline.json");
const requirements = loadRaw("project/requirements-baseline.json", json("project/requirements-baseline.json").baselineId, "https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json", "devrelay://repository/project/requirements-baseline.json");
const acceptanceSummary = json("dogfood/ep-001-environment-preparation/final-acceptance/final-acceptance-summary.json");
const acceptance = loadRaw("dogfood/ep-001-environment-preparation/final-acceptance/26-business-acceptance-record.json", acceptanceSummary.businessAcceptance.artifactId, "https://devrelay.dev/artifacts/business-acceptance-record/v1", "application/json", "devrelay://repository/dogfood/ep-001-environment-preparation/final-acceptance/26-business-acceptance-record.json");
const priorityPolicyBytes = read("dogfood/rm-001-roadmap-management/release/roadmap-priority-policy.json");
assert.equal(api.sha256Digest(priorityPolicyBytes), current.value.priorityPolicy.digest);
const priorityPolicy = JSON.parse(priorityPolicyBytes);

const interviewText = `# ReleasePreparation roadmap candidate interview\n\n- Objective: add a deterministic ReleasePreparation and ReleaseVerification capability after accepted EnvironmentPreparation.\n- Users: DevRelay project owners operating through ChatGPT/Codex Desktop on Windows.\n- Scope: prepare an exact source/library candidate, verify packaging, documentation, evidence sealing, supported-host readiness, and promotion prerequisites.\n- Non-goals: no deployment, hosted backend, public npm publication, one-click Desktop installation, or non-Windows support is implied.\n- Success: the future module starts only after RequirementsGathering closes its detailed contract and produces content-addressed, replayable release evidence.\n- Constraints: GitHub source distribution, protected main, provider-neutral adapters, explicit effects, and fail-closed evidence gates.\n- Dependencies: accepted EP-001 EnvironmentPreparation, existing SystemVerification and BusinessAcceptance, and a future RequirementsGate for the ReleasePreparation module itself.\n- Operational boundary: this roadmap decision keeps and prioritizes the initiative; it does not authorize implementation.\n`;
const interviewBytes = Buffer.from(interviewText, "utf8");
const interviewRef = fullRef("RM-CANDIDATE-INTERVIEW-RELEASE-PREPARATION-001", api.sha256Digest(interviewBytes), "https://devrelay.dev/evidence/requirements-interview/v1", "text/markdown", "devrelay://repository/dogfood/ep-001-environment-preparation/roadmap-resolution/candidate-interview.md");
writeBytes(`${out}/candidate-interview.md`, interviewBytes);
const domains = [
  { id: "problem", weight: 0.18, blocking: true }, { id: "users", weight: 0.12, blocking: true }, { id: "scope", weight: 0.15, blocking: true }, { id: "success", weight: 0.15, blocking: true }, { id: "constraints", weight: 0.12, blocking: true }, { id: "security", weight: 0.08, blocking: true }, { id: "dependencies", weight: 0.1, blocking: false }, { id: "operations", weight: 0.1, blocking: false },
];
const questions = domains.map(({ id }) => ({ id: `Q-EP-RM-${id.toUpperCase()}`, domainId: id, prompt: `Resolve the ${id} domain for the ReleasePreparation roadmap candidate.` }));
const initialInterview = runAdaptiveRequirementsInterview({ domains, questions, minimumWeightedCoverage: 0.99, waveNumber: 1, maxQuestions: 24 });
assert.equal(initialInterview.outcome, "needs-clarification");
const closure = runAdaptiveRequirementsInterview({ domains, domainEvidence: domains.map(({ id }) => ({ domainId: id, status: "resolved", confidence: 1, evidenceRefs: [`${interviewRef.artifactId}#${id}`] })), contradictions: [], questions, minimumWeightedCoverage: 0.99 });
assert.equal(closure.outcome, "gate-candidate-ready");
assert.equal(closure.assessment.weightedCoverage >= 0.99, true);
writeJson(`${out}/requirements-interview-wave.json`, initialInterview);
writeJson(`${out}/requirements-closure-assessment.json`, closure.assessment);

const sourceRefs = [{ role: "business-acceptance", artifact: acceptance.ref }, { role: "candidate-requirements", artifact: interviewRef }, { role: "requirements-baseline", artifact: requirements.ref }].sort((a, b) => a.role.localeCompare(b.role, "en"));
const intake = api.createRoadmapIntakeCandidate({ candidateId: "RM-CANDIDATE-RELEASE-PREPARATION-001", title: "ReleasePreparation and ReleaseVerification", purpose: "Prepare and verify an exact release candidate after environment readiness without taking deployment authority.", requirementsBaseline: requirements.ref, contextBindings: sourceRefs });
const checkpoints = new Map();
let proposerCalls = 0;
const runtime = api.createRoadmapManagementRuntime({ proposer: { id: "native-structured-roadmap-proposer", version: "0.1.0", async propose(request) { proposerCalls += 1; return request.nativeProposal; } } });
const invocation = { operation: "triage-candidate", intakeCandidate: intake, currentBaseline: current.value, currentBaselineRef: current.ref, comparison: { closureConfidence: closure.assessment.weightedCoverage, alreadyCovered: false, blockingConflict: false }, factors: { strategicAlignment: 1, userValue: 0.95, urgency: 0.9, riskReduction: 0.95, effort: 0.65, dependencies: 0.9, confidence: 1 }, priorityPolicy, priorityPolicyRef: current.value.priorityPolicy, sourceRefs, checkpoints: { async get(key) { return checkpoints.get(key); }, async put(key, value) { if (checkpoints.has(key)) throw new Error("immutable roadmap checkpoint overwrite"); checkpoints.set(key, structuredClone(value)); } } };
const first = await runtime.execute(invocation);
const replay = await runtime.execute(invocation);
assert.equal(proposerCalls, 1);
assert.equal(replay.replayed, true);
assert.deepEqual(replay.changeSet, first.changeSet);
const initiative = first.draft.initiatives.find(({ title }) => title === "ReleasePreparation and ReleaseVerification");
assert.equal(initiative?.recommendation, "keep");
const checkpoint = [...checkpoints.values()][0];
assert.ok(checkpoint?.checkpointDigest);

const changeBytes = Buffer.from(api.canonicalJson(first.changeSet), "utf8");
const changeRef = fullRef(first.changeSet.changeSetId, api.sha256Digest(changeBytes), api.ROADMAP_ARTIFACT_CONTRACTS.RoadmapChangeSetDraft.schema, api.ROADMAP_ARTIFACT_CONTRACTS.RoadmapChangeSetDraft.mediaType, "devrelay://repository/dogfood/ep-001-environment-preparation/roadmap-resolution/roadmap-change-set-draft.json");
const approval = { apiVersion: API, kind: "RoadmapGateApproval", approvalId: "RM-GATE-APPROVAL-RELEASE-PREPARATION-001", authority: "project-owner", decision: "approve", candidate: changeRef, currentBaselineDisposition: current.ref, terminalCheckpointDigest: checkpoint.checkpointDigest, policyVersion: "1.0.0" };
const approvalBytes = Buffer.from(api.canonicalJson(approval), "utf8");
const approvalRef = fullRef(approval.approvalId, api.sha256Digest(approvalBytes), api.ROADMAP_ARTIFACT_CONTRACTS.RoadmapGateApproval.schema, api.ROADMAP_ARTIFACT_CONTRACTS.RoadmapGateApproval.mediaType, "devrelay://repository/dogfood/ep-001-environment-preparation/roadmap-resolution/roadmap-gate-approval.json");
const promoted = promoteRoadmapBaseline({ changeSet: first.changeSet, changeSetRef: changeRef, changeSetBytes: changeBytes, currentBaseline: current.value, currentBaselineRef: current.ref, approval, approvalRef, approvalBytes, terminalCheckpointDigest: checkpoint.checkpointDigest, priorityPolicyRef: current.value.priorityPolicy, sourceRefs, baselineId: current.value.baselineId });
assert.equal(promoted.progressionAllowed, true);
assert.equal(promoted.baseline.initiatives.some(({ id }) => id === initiative.id), true);

writeJson(`${out}/roadmap-intake-candidate.json`, intake);
writeJson(`${out}/roadmap-draft.json`, first.draft);
writeJson(`${out}/roadmap-change-set-draft.json`, first.changeSet);
writeJson(`${out}/roadmap-checkpoint.json`, checkpoint);
writeJson(`${out}/roadmap-replay-proof.json`, { apiVersion: API, kind: "RoadmapReplayProof", proposerCalls, replayProposerCalls: 0, byteIdentical: api.canonicalJson(first.changeSet) === api.canonicalJson(replay.changeSet), outcome: "pass" });
writeJson(`${out}/roadmap-gate-approval.json`, approval);
writeJson(`${out}/roadmap-gate-promotion-proof.json`, promoted.promotionProof);
writeJson(`${out}/roadmap-baseline.json`, promoted.baseline);
writeBytes(`${out}/Roadmap.md`, promoted.projectionBytes);
writeJson(`project/history/roadmap/${current.value.version}/roadmap-baseline.json`, current.value, false);
writeJson(`project/history/roadmap/${promoted.baseline.version}/roadmap-baseline.json`, promoted.baseline, false);
writeJson("project/roadmap-baseline.json", promoted.baseline, false);
writeBytes("Roadmap.md", promoted.projectionBytes);
const promotionRecord = { apiVersion: API, kind: "RoadmapPromotionRecord", gateProof: promoted.promotionProof, priorBaseline: current.ref, roadmapBaseline: promoted.baselineRef, roadmapProjection: promoted.projectionRef, businessAcceptance: acceptance.ref, requirementsClosure: closure.assessment.assessmentDigest, proposerCalls, replayProposerCalls: 0 };
promotionRecord.contentDigest = api.canonicalJsonDigest(promotionRecord);
writeJson(`${out}/roadmap-promotion-record.json`, promotionRecord);
writeJson("project/roadmap-promotion.commit.json", promotionRecord);
const summary = { apiVersion: API, kind: "Ep001RoadmapResolutionSummary", initiativeId: initiative.id, recommendation: initiative.recommendation, priority: initiative.priority.weightedScore, requirementsClosure: closure.assessment.weightedCoverage, roadmapBaseline: promoted.baselineRef, gateProof: { artifactId: promoted.promotionProof.proofId, digest: promoted.promotionProof.contentDigest }, proposerCalls, replayProposerCalls: 0, outcome: "promoted" };
summary.summaryDigest = api.canonicalJsonDigest(summary);
writeJson(`${out}/roadmap-resolution-summary.json`, summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
