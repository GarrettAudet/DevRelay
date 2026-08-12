import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const ARTIFACT_ROOT = path.resolve(process.argv[2] ?? "");
const TARGET_COMMIT = "9d2b0d8e6b358dd6aed922de420224fe9efc320c";
const VERIFY_RUN = "31564635275";
const MATERIALIZE_RUN = "31564607304";
const ARTIFACT_ID = "9129184024";
const ARTIFACT_ZIP_DIGEST = "sha256:137f05e9685d5c504f26b53c31c2814243b538ab0a7101d451afc1fed7b12ed6";
const CANDIDATE_ID = "BA-CANDIDATE-ed2476ac90e1359f796d1ab8";
const CANDIDATE_DIGEST = "sha256:92b25f9e6e898b780e126079ce945a92841bd3e8508dc18503d4d85f2d42ee22";
const CANDIDATE_RAW_DIGEST = "sha256:f0ed398f7abdd8c9540ba83842d88ecf728433011fbc2dbfe05bc751a99c8f04";
const COVERAGE_ID = "BA-TECH-COVERAGE-fb1044a00dcbd9cd94fe4243";
const COVERAGE_DIGEST = "sha256:8c1a9bb891a68aa66ce1d7e49b5860b821c07c1bccbbf355caa2b01e0baba88d";
const REQUEST_ID = "BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001";
const REQUEST_DIGEST = "sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e";
const PROOF_ID = "DEVRELAY-CONTROLLED-RELEASE-CANDIDATE-001";
const PROOF_DIGEST = "sha256:39794039b87830b5ad89aa37c9603680f3c64b90f852ed1c3260ffef13609265";
const GRAPH_ID = "traceability-graph-devrelay-work-breakdown-r3";
const GRAPH_DIGEST = "sha256:b0b64c6453fe02a9b7fbda50bd63139a7e71adcea28e0c3940db269a5974f754";
const SYSTEM_RESULT_ID = "SVR-3A6BA4ABED95BD19";
const SYSTEM_RESULT_DIGEST = "sha256:e2aec86627f6afbd1116dc16d1bfd96ff14e66f6679b66d9e2dc0ed9f74610f4";
const SOURCE_EVIDENCE_ID = "DEVRELAY-WINDOWS-DESKTOP-SOURCE-RELEASE-001";
const SOURCE_EVIDENCE_DIGEST = "sha256:39a2799af7a546c0ee990a931848373ad78efce9e1cdd2d155cc06dc05732291";
const HANDOFF = path.join(ROOT, "handoff", "2026-08-11-controlled-release-acceptance-pickup");
const SOURCE_CANDIDATE = path.join(ARTIFACT_ROOT, "dogfood", "release-acceptance", "candidate-001");
const DEST_CANDIDATE = path.join(ROOT, "dogfood", "release-acceptance", "candidate-001");

function normalizeJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite JSON number");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeJson(value[key])]));
  }
  throw new TypeError(`unsupported JSON value: ${typeof value}`);
}

const canonicalJson = (value) => JSON.stringify(normalizeJson(value));
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const bodyDigest = (value, field) => sha256(Buffer.from(canonicalJson(
  Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))),
), "utf8"));
const refEqual = (left, right) => left?.artifactId === right?.artifactId && left?.digest === right?.digest;
const markdown = (lines) => `${lines.join("\n")}\n`;

async function readCanonicalJson(filePath) {
  const bytes = await readFile(filePath);
  const value = JSON.parse(bytes.toString("utf8"));
  assert.equal(bytes.toString("utf8"), canonicalJson(value), `${path.relative(ROOT, filePath)} is not exact canonical JSON`);
  return { bytes, value };
}

async function exactFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  assert.ok(entries.every((entry) => entry.isFile()), "candidate directory must contain files only");
  return entries.map((entry) => entry.name).sort();
}

async function treesEqual(left, right) {
  try {
    const [leftFiles, rightFiles] = await Promise.all([exactFiles(left), exactFiles(right)]);
    if (JSON.stringify(leftFiles) !== JSON.stringify(rightFiles)) return false;
    for (const file of leftFiles) {
      const [a, b] = await Promise.all([readFile(path.join(left, file)), readFile(path.join(right, file))]);
      if (!a.equals(b)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const stems = [
  "release-evidence", "repository-release-snapshot", "approved-coverage-dispositions", "reconciliation-update",
  "reconciliation-merge-receipt", "integrated-completion-fact-set", "integrated-system-candidate",
  "system-verification-policy", "system-verification-obligations", "system-test-invocation", "system-review-invocation",
  "system-verification-evidence", "system-verification-evaluation", "system-verification-result",
  "system-verification-update", "system-verification-merge-receipt", "system-verification-graph",
  "business-acceptance-policy", "business-acceptance-evidence", "business-acceptance-technical-coverage",
  "business-acceptance-subject", "business-acceptance-evaluation", "business-acceptance-candidate",
  "business-acceptance-approval-request", "candidate-proof",
];
const expectedFiles = stems.map((stem, index) => `${String(index).padStart(2, "0")}-${stem}.json`);
assert.deepEqual(await exactFiles(SOURCE_CANDIDATE), expectedFiles, "candidate artifact file set drifted");
const loadedCandidateFiles = new Map();
for (const file of expectedFiles) loadedCandidateFiles.set(file, await readCanonicalJson(path.join(SOURCE_CANDIDATE, file)));

const summary = JSON.parse(await readFile(path.join(ARTIFACT_ROOT, ".devrelay", "candidate-materialization-summary.json"), "utf8"));
const releaseEvidence = loadedCandidateFiles.get(expectedFiles[0]);
const releaseSnapshot = loadedCandidateFiles.get(expectedFiles[1]);
const systemResult = loadedCandidateFiles.get(expectedFiles[13]);
const graph = loadedCandidateFiles.get(expectedFiles[16]);
const coverage = loadedCandidateFiles.get(expectedFiles[19]);
const candidate = loadedCandidateFiles.get(expectedFiles[22]);
const request = loadedCandidateFiles.get(expectedFiles[23]);
const proof = loadedCandidateFiles.get(expectedFiles[24]);

for (const [loaded, field] of [
  [releaseEvidence, "evidenceDigest"], [releaseSnapshot, "snapshotDigest"], [systemResult, "resultDigest"],
  [coverage, "coverageDigest"], [candidate, "candidateDigest"], [request, "requestDigest"], [proof, "proofDigest"],
]) assert.equal(loaded.value[field], bodyDigest(loaded.value, field), `${field} does not bind canonical material`);

assert.equal(summary.targetCommit, TARGET_COMMIT);
assert.deepEqual(summary.candidate, { artifactId: CANDIDATE_ID, digest: CANDIDATE_DIGEST });
assert.equal(summary.candidateRawDigest, CANDIDATE_RAW_DIGEST);
assert.equal(summary.requestDigest, REQUEST_DIGEST);
assert.equal(summary.systemVerification, "verified");
assert.equal(summary.acceptance, "eligible-for-acceptance");
assert.deepEqual(summary.coverage, {
  acceptanceCriteria: 81,
  nonFunctionalRequirements: 18,
  businessObjectives: 8,
  successMetrics: 9,
  businessScopes: 32,
});

assert.equal(releaseEvidence.value.targetCommit, TARGET_COMMIT);
assert.equal(String(releaseEvidence.value.verification.githubActions.runId), VERIFY_RUN);
assert.equal(releaseEvidence.value.evidenceId, SOURCE_EVIDENCE_ID);
assert.equal(releaseEvidence.value.evidenceDigest, "sha256:0b841d3557d8aa1968d261b311e3ed3f06f76190e3173da9199ae3c01201ef92");
assert.equal(releaseSnapshot.value.commit, TARGET_COMMIT);
assert.deepEqual(releaseSnapshot.value.evidence, { artifactId: SOURCE_EVIDENCE_ID, digest: SOURCE_EVIDENCE_DIGEST });
assert.equal(systemResult.value.resultId, SYSTEM_RESULT_ID);
assert.equal(systemResult.value.resultDigest, SYSTEM_RESULT_DIGEST);
assert.equal(systemResult.value.outcome, "verified");
assert.equal(systemResult.value.progression, "business-acceptance-gate");
assert.equal(graph.value.revision, 3);
assert.equal(sha256(graph.bytes), GRAPH_DIGEST);
assert.equal(coverage.value.coverageId, COVERAGE_ID);
assert.equal(coverage.value.coverageDigest, COVERAGE_DIGEST);
assert.equal(candidate.value.candidateId, CANDIDATE_ID);
assert.equal(candidate.value.candidateDigest, CANDIDATE_DIGEST);
assert.equal(candidate.value.outcome, "eligible-for-acceptance");
assert.equal(sha256(candidate.bytes), CANDIDATE_RAW_DIGEST);
assert.equal(request.value.requestId, REQUEST_ID);
assert.equal(request.value.requestDigest, REQUEST_DIGEST);
assert.equal(request.value.targetCommit, TARGET_COMMIT);
assert.equal(request.value.status, "awaiting-exact-owner-approval");
assert.equal(request.value.requestedDecision, "approved");
assert.ok(refEqual(request.value.candidate, { artifactId: CANDIDATE_ID, digest: CANDIDATE_DIGEST }));
assert.equal(request.value.candidateRawDigest, CANDIDATE_RAW_DIGEST);
assert.ok(refEqual(request.value.technicalCoverage, { artifactId: COVERAGE_ID, digest: COVERAGE_DIGEST }));
assert.equal(request.value.traceabilityCheckpoint.artifactId, GRAPH_ID);
assert.equal(request.value.traceabilityCheckpoint.digest, GRAPH_DIGEST);
assert.deepEqual(request.value.coverage, {
  acceptanceCriteria: 81,
  businessObjectives: 8,
  businessScopes: 32,
  nonFunctionalRequirements: 18,
  successMetrics: 9,
});
assert.deepEqual(request.value.exclusions, [
  "public npm publication",
  "one-click ChatGPT Desktop plug-in",
  "hosted backend",
]);
assert.equal(proof.value.proofId, PROOF_ID);
assert.equal(proof.value.proofDigest, PROOF_DIGEST);
assert.equal(proof.value.targetCommit, TARGET_COMMIT);
assert.equal(proof.value.nextGate, "exact-owner-approval");
assert.deepEqual(proof.value.sourceVerification, { artifactId: SOURCE_EVIDENCE_ID, digest: SOURCE_EVIDENCE_DIGEST });
assert.equal(proof.value.systemVerification.result.artifactId, SYSTEM_RESULT_ID);
assert.equal(proof.value.systemVerification.result.digest, SYSTEM_RESULT_DIGEST);
assert.equal(proof.value.systemVerification.obligationCount, 99);
assert.equal(proof.value.systemVerification.verifierCalls, 2);
assert.equal(proof.value.systemVerification.replayVerifierCalls, 0);
assert.ok(refEqual(proof.value.businessAcceptance.candidate, request.value.candidate));
assert.equal(proof.value.businessAcceptance.candidateRawDigest, CANDIDATE_RAW_DIGEST);
assert.ok(refEqual(proof.value.businessAcceptance.technicalCoverage, request.value.technicalCoverage));
assert.equal(proof.value.traceability.systemVerificationMerge.digest, GRAPH_DIGEST);

await mkdir(path.dirname(DEST_CANDIDATE), { recursive: true });
if (!(await treesEqual(SOURCE_CANDIDATE, DEST_CANDIDATE))) {
  await rm(DEST_CANDIDATE, { recursive: true, force: true });
  await cp(SOURCE_CANDIDATE, DEST_CANDIDATE, { recursive: true, force: false, errorOnExist: true });
}

const rootStatus = markdown([
  "# DevRelay current implementation status",
  "",
  "Last reconciled: 2026-08-11 MDT",
  "Active branch: `codex/lifecycle-run-report-completion`",
  `Exact verified release-source target: \`${TARGET_COMMIT}\``,
  `Exact verification run: \`${VERIFY_RUN}\``,
  "Active boundary: exact owner approval for the persisted corrected candidate",
  "",
  "This file is a human-readable status projection. Exact module artifacts, Gate records, graph checkpoints, release evidence, commits, and CI runs remain authoritative.",
  "",
  "## Executive status",
  "",
  "The portable DevRelay V1 source/library circuit is implemented through BusinessAcceptance. The exact cataloged source target passed Node 20 and 22 on Ubuntu and Windows. The corrected pre-approval lifecycle circuit completed through released APIs, and its exact 25-file candidate package is persisted under `dogfood/release-acceptance/candidate-001/`.",
  "",
  `Candidate \`${CANDIDATE_ID}\` is eligible for acceptance. Its semantic digest is \`${CANDIDATE_DIGEST}\`; its exact raw-byte digest is \`${CANDIDATE_RAW_DIGEST}\`. The exhaustive technical-coverage digest is \`${COVERAGE_DIGEST}\`.`,
  "",
  `Approval request \`${REQUEST_ID}\` has digest \`${REQUEST_DIGEST}\` and remains \`awaiting-exact-owner-approval\`. No BusinessAcceptanceGate record, acceptance traceability, publication, deployment, or final release claim has been created.`,
  "",
  "The transient verify run at evidence commit `8e280127` passed all 842 tests and failed only because `CURRENT_STATUS.md` had not yet been regenerated into the content-addressed catalog. This persistence transaction regenerates the catalog only after every candidate, status, handoff, and workflow byte is final.",
  "",
  "Current position:",
  "",
  "```text",
  "RequirementsGathering through ChangeIntegration     COMPLETE",
  "Historical graph recovery                            PROVEN",
  "Two owner-authorized designed-by links               PROVEN",
  "99-obligation SystemVerification                     VERIFIED",
  "SystemVerification zero-call replay                  VERIFIED",
  "Trusted verification traceability merge              VERIFIED",
  "BusinessAcceptance technical coverage                EXHAUSTIVE",
  "BusinessAcceptance evaluation and replay              VERIFIED",
  "Exact source matrix                                  PASS 4/4",
  "Corrected candidate package                          PERSISTED",
  "Exact approval request                               PERSISTED",
  "Exact owner approval                                  REQUIRED",
  "BusinessAcceptanceGate                                PENDING OWNER",
  "Trusted acceptance traceability merge                 PENDING GATE",
  "Final release evidence/catalog/matrix                 PENDING ACCEPTANCE",
  "```",
  "",
  "## Exact persisted evidence",
  "",
  `- Materialization run: \`${MATERIALIZE_RUN}\``,
  `- Workflow artifact: \`${ARTIFACT_ID}\``,
  `- Artifact ZIP digest: \`${ARTIFACT_ZIP_DIGEST}\``,
  `- Candidate proof: \`${PROOF_ID}\` / \`${PROOF_DIGEST}\``,
  `- SystemVerification result: \`${SYSTEM_RESULT_ID}\` / \`${SYSTEM_RESULT_DIGEST}\``,
  `- Traceability checkpoint: \`${GRAPH_ID}\` / \`${GRAPH_DIGEST}\``,
  "- Coverage: 81 acceptance criteria, 18 NFRs, 8 objectives, 9 metrics, and 32 business-scope identities.",
  "- Exclusions: public npm publication; one-click ChatGPT Desktop plug-in; hosted backend.",
  "",
  "## Owner boundary",
  "",
  "The previous exact approval named superseded source and cannot be reused. The owner must decide the exact persisted request above. Only an affirmative decision bound to these exact candidate bytes and approved context may be passed to BusinessAcceptanceGate.",
  "",
  "## Next trusted transition",
  "",
  "```text",
  "obtain exact owner decision over the persisted request",
  "-> execute BusinessAcceptanceGate and prove zero-call replay",
  "-> merge and replay trusted BusinessAcceptance traceability",
  "-> require zero blocking diagnostics",
  "-> persist final acceptance evidence and coherent handoff",
  "-> regenerate the content-addressed release catalog",
  "-> run and verify the final four-job release matrix",
  "```",
  "",
  "## Pickup",
  "",
  "Use `handoff/2026-08-11-controlled-release-acceptance-pickup/README.md`. The older `2026-08-10` package remains immutable historical context.",
]);

const currentState = markdown([
  "# Current state",
  "",
  "## Exact repository position",
  "",
  "- Branch: `codex/lifecycle-run-report-completion`",
  `- Verified source target: \`${TARGET_COMMIT}\``,
  `- Verify run: \`${VERIFY_RUN}\` (Node 20/22 on Ubuntu/Windows: 4/4 pass)`,
  "- Candidate path: `dogfood/release-acceptance/candidate-001/`",
  "- Active boundary: exact owner approval",
  "",
  "## Completed and persisted",
  "",
  "The complete pre-approval circuit is persisted and content-bound: graph recovery, two approved design links, 99-obligation SystemVerification, zero-call replay, trusted verification traceability, exhaustive technical coverage, BusinessAcceptance evaluation, and BusinessAcceptance zero-call replay.",
  "",
  `The exact persisted candidate is \`${CANDIDATE_ID}\` with semantic digest \`${CANDIDATE_DIGEST}\` and raw digest \`${CANDIDATE_RAW_DIGEST}\`.`,
  "",
  `The exact request is \`${REQUEST_ID}\` with digest \`${REQUEST_DIGEST}\`. It targets \`${TARGET_COMMIT}\`, binds coverage \`${COVERAGE_DIGEST}\`, and binds graph checkpoint \`${GRAPH_DIGEST}\`.`,
  "",
  "The candidate artifact was downloaded by exact workflow run, artifact ID, name, and ZIP digest, and every one of its 25 JSON files was revalidated as canonical before persistence. The repository catalog is regenerated after this state and the complete handoff package are written.",
  "",
  "## Not yet authoritative",
  "",
  "No exact corrected owner approval exists. Therefore no BusinessAcceptanceRecord, accepted lifecycle disposition, acceptance traceability update, final graph merge, publication, deployment, or complete-release claim exists.",
  "",
  "## Exact next action",
  "",
  "Present `23-business-acceptance-approval-request.json` to the owner and obtain an explicit approved or rejected decision over those exact bytes. Do not infer approval from the earlier superseded decision or from general instructions to continue.",
  "",
  "After an approved decision, execute the released BusinessAcceptanceGate, prove replay invokes the owner zero additional times, project and merge trusted BusinessAcceptance traceability, require zero blocking diagnostics, then complete final evidence/catalog/matrix verification.",
  "",
  "## Trust boundary",
  "",
  "Do not hand-author SystemVerificationResult, technical coverage, BusinessAcceptanceCandidate, owner approval, BusinessAcceptanceRecord, traceability updates, merge receipts, or final completion claims.",
]);

const evidenceIndex = markdown([
  "# Evidence index",
  "",
  "## Exact source verification",
  "",
  `- Source target: \`${TARGET_COMMIT}\``,
  `- GitHub Actions verify run: \`${VERIFY_RUN}\``,
  "- Matrix: Node 20 and Node 22 on Ubuntu and Windows, 4/4 pass.",
  "- Controlled delivery: source/library for ChatGPT Desktop on Windows.",
  "",
  "## Candidate materialization",
  "",
  `- Materialization run: \`${MATERIALIZE_RUN}\``,
  `- Artifact ID: \`${ARTIFACT_ID}\``,
  `- Artifact ZIP digest: \`${ARTIFACT_ZIP_DIGEST}\``,
  "- Persisted package: `dogfood/release-acceptance/candidate-001/` (25 canonical JSON files).",
  `- Candidate: \`${CANDIDATE_ID}\` / \`${CANDIDATE_DIGEST}\``,
  `- Candidate raw digest: \`${CANDIDATE_RAW_DIGEST}\``,
  `- Technical coverage: \`${COVERAGE_ID}\` / \`${COVERAGE_DIGEST}\``,
  `- Candidate proof: \`${PROOF_ID}\` / \`${PROOF_DIGEST}\``,
  "",
  "## Verification and traceability",
  "",
  `- SystemVerification result: \`${SYSTEM_RESULT_ID}\` / \`${SYSTEM_RESULT_DIGEST}\``,
  "- Obligations: 99; first execution verifier calls: 2; exact replay calls: 0.",
  `- SystemVerification graph checkpoint: \`${GRAPH_ID}\` / \`${GRAPH_DIGEST}\``,
  "- BusinessAcceptance outcome: `eligible-for-acceptance`; exact replay evaluation/evidence calls: 0.",
  "",
  "## Approval boundary",
  "",
  `- Request: \`${REQUEST_ID}\` / \`${REQUEST_DIGEST}\``,
  "- Status: `awaiting-exact-owner-approval`.",
  "- Requested decision: `approved`.",
  "- Coverage: 81 acceptance criteria, 18 NFRs, 8 objectives, 9 metrics, 32 business scopes.",
  "- Exclusions: public npm publication; one-click ChatGPT Desktop plug-in; hosted backend.",
  "",
  "No approval, BusinessAcceptanceRecord, accepted disposition, or final acceptance graph is listed because none is authoritative yet.",
]);

const nextActions = markdown([
  "# Next actions",
  "",
  "## 1. Obtain exact owner decision",
  "",
  `Present \`dogfood/release-acceptance/candidate-001/23-business-acceptance-approval-request.json\` (request digest \`${REQUEST_DIGEST}\`).`,
  "",
  "The owner must explicitly approve or reject the exact request. The prior approval is stale because it names superseded source. General authorization to continue is not a substitute for this byte-bound decision.",
  "",
  "## 2. Execute BusinessAcceptanceGate",
  "",
  "Use the exact canonical candidate bytes, exact candidate raw digest, exact evaluation, subject, policy, evidence, technical coverage, and exact owner approval. Persist the Gate checkpoint and authoritative BusinessAcceptanceRecord. Replay must invoke the owner zero additional times.",
  "",
  "## 3. Merge trusted acceptance traceability",
  "",
  "Project only from the exact accepted Gate execution using the released BusinessAcceptance contributor. Prepare, checkpoint, atomically merge, and replay the exact update. Require zero blocking diagnostics.",
  "",
  "## 4. Finalize release evidence",
  "",
  "Update root status, this handoff package, release evidence, and release metadata. Regenerate the content-addressed catalog, run `npm run release:check`, push, and verify Node 20/22 on Ubuntu/Windows.",
  "",
  "## Prohibited shortcuts",
  "",
  "Do not reuse the superseded approval, hand-author the approval/record/update/receipt, alter the accepted scope, expand excluded delivery claims, or call the release complete before the final Gate, graph, catalog, and matrix evidence exist.",
]);

const pickupPrompt = markdown([
  "# Pickup prompt",
  "",
  "Continue DevRelay from the exact persisted corrected candidate on branch `codex/lifecycle-run-report-completion`.",
  "",
  `The verified source target is \`${TARGET_COMMIT}\`; verify run \`${VERIFY_RUN}\` passed Node 20/22 on Ubuntu/Windows. The 25-file candidate package is persisted at \`dogfood/release-acceptance/candidate-001/\`.`,
  "",
  `The candidate is \`${CANDIDATE_ID}\` with semantic digest \`${CANDIDATE_DIGEST}\` and raw digest \`${CANDIDATE_RAW_DIGEST}\`. Technical coverage digest: \`${COVERAGE_DIGEST}\`.`,
  "",
  `The exact approval request is \`${REQUEST_ID}\` with digest \`${REQUEST_DIGEST}\` and status \`awaiting-exact-owner-approval\`.`,
  "",
  "First obtain an explicit owner decision over that exact request. Do not infer approval from the stale earlier approval or broad instructions. If approved, execute BusinessAcceptanceGate and zero-call replay, merge trusted BusinessAcceptance traceability and replay, require zero blocking diagnostics, then update final evidence/handoff/catalog and verify the four-job matrix.",
  "",
  "Preserve the exclusions: public npm publication, one-click ChatGPT Desktop plug-in, and hosted backend.",
]);

const readme = markdown([
  "# Controlled release acceptance pickup",
  "",
  "This package is the active resume point for the DevRelay controlled Windows source/library release.",
  "",
  `The exact verified source target is \`${TARGET_COMMIT}\`; verify run \`${VERIFY_RUN}\` passed all four Node/OS jobs. The corrected candidate package is persisted at \`dogfood/release-acceptance/candidate-001/\` and is eligible for acceptance.`,
  "",
  `The exact owner request is \`${REQUEST_ID}\` / \`${REQUEST_DIGEST}\`. It has not been approved or rejected.`,
  "",
  "Read in this order:",
  "",
  "1. `CURRENT_STATE.md`",
  "2. `EVIDENCE_INDEX.md`",
  "3. `NEXT_ACTIONS.md`",
  "4. `PICKUP_PROMPT.md`",
  "5. `handoff.yaml`",
  "",
  "`MANIFEST.json` and `SHA256SUMS` bind the package bytes. `candidate-materializer.wip.txt` is preserved implementation provenance, not current authority.",
]);

const handoffYaml = markdown([
  "apiVersion: devrelay.dev/v1alpha1",
  "kind: ControlledReleaseAcceptancePickup",
  "metadata:",
  "  id: controlled-release-acceptance-pickup-2026-08-11",
  "  date: \"2026-08-11\"",
  "repository:",
  "  url: https://github.com/GarrettAudet/DevRelay.git",
  "  branch: codex/lifecycle-run-report-completion",
  `  verifiedSourceCommit: ${TARGET_COMMIT}`,
  "target:",
  "  host: ChatGPT Desktop",
  "  operatingSystem: Windows",
  "  delivery: controlled-source-library",
  "  exclusions:",
  "    - public-npm-publication",
  "    - one-click-desktop-plugin",
  "    - hosted-backend",
  "verification:",
  "  githubActions:",
  `    runId: ${VERIFY_RUN}`,
  "    status: success",
  "    jobsPassed: 4",
  "    jobsTotal: 4",
  "  moduleCount: 11",
  "  pluginCount: 24",
  "candidate:",
  "  persisted: true",
  "  path: dogfood/release-acceptance/candidate-001",
  `  artifactId: ${CANDIDATE_ID}`,
  `  digest: ${CANDIDATE_DIGEST}`,
  `  rawDigest: ${CANDIDATE_RAW_DIGEST}`,
  `  proofDigest: ${PROOF_DIGEST}`,
  "  outcome: eligible-for-acceptance",
  "approval:",
  "  status: awaiting-exact-owner-approval",
  `  requestId: ${REQUEST_ID}`,
  `  requestDigest: ${REQUEST_DIGEST}`,
  "  priorApprovalIsStale: true",
  "  approvedCoverage:",
  "    acceptanceCriteria: 81",
  "    nonFunctionalRequirements: 18",
  "    businessObjectives: 8",
  "    successMetrics: 9",
  "    businessScopes: 32",
  "currentBoundary:",
  "  stage: exact-owner-approval",
  "  businessAcceptanceRecorded: false",
  "  finalTraceabilityMerged: false",
  "next:",
  "  - obtain-exact-owner-decision",
  "  - execute-business-acceptance-gate-and-replay",
  "  - merge-acceptance-traceability-and-diagnose",
  "  - update-final-release-evidence-catalog-and-matrix",
]);

await writeFile(path.join(ROOT, "CURRENT_STATUS.md"), rootStatus, "utf8");
await writeFile(path.join(HANDOFF, "CURRENT_STATE.md"), currentState, "utf8");
await writeFile(path.join(HANDOFF, "EVIDENCE_INDEX.md"), evidenceIndex, "utf8");
await writeFile(path.join(HANDOFF, "NEXT_ACTIONS.md"), nextActions, "utf8");
await writeFile(path.join(HANDOFF, "PICKUP_PROMPT.md"), pickupPrompt, "utf8");
await writeFile(path.join(HANDOFF, "README.md"), readme, "utf8");
await writeFile(path.join(HANDOFF, "handoff.yaml"), handoffYaml, "utf8");

const materializeWorkflowPath = path.join(ROOT, ".github", "workflows", "materialize-release-candidate.yml");
const materializeWorkflow = await readFile(materializeWorkflowPath, "utf8");
const pushStart = materializeWorkflow.indexOf("  push:\n");
const permissionsStart = materializeWorkflow.indexOf("\npermissions:\n", pushStart);
assert.ok(pushStart > 0 && permissionsStart > pushStart, "materializer push trigger boundary was not found");
const frozenWorkflow = `${materializeWorkflow.slice(0, pushStart)}\n${materializeWorkflow.slice(permissionsStart + 1)}`;
assert.ok(!frozenWorkflow.includes("\n  push:\n"), "materializer push trigger was not removed");
await writeFile(materializeWorkflowPath, frozenWorkflow, "utf8");

const manifestEntryNames = [
  "CURRENT_STATE.md",
  "EVIDENCE_INDEX.md",
  "NEXT_ACTIONS.md",
  "PICKUP_PROMPT.md",
  "README.md",
  "candidate-materializer.wip.txt",
  "handoff.yaml",
];
const manifestEntries = [];
for (const name of manifestEntryNames) {
  const absolute = path.join(HANDOFF, name);
  const bytes = await readFile(absolute);
  manifestEntries.push({
    path: path.relative(ROOT, absolute).split(path.sep).join("/"),
    byteLength: bytes.length,
    sha256: sha256(bytes),
  });
}
const manifest = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "HandoffManifest",
  metadata: {
    packageId: "devrelay-controlled-release-acceptance-pickup-2026-08-11",
    resumeBranch: "codex/lifecycle-run-report-completion",
    verifiedSourceCommit: TARGET_COMMIT,
    ciRunId: VERIFY_RUN,
  },
  entries: manifestEntries,
};
await writeFile(path.join(HANDOFF, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const checksumOrder = [
  "candidate-materializer.wip.txt",
  "CURRENT_STATE.md",
  "EVIDENCE_INDEX.md",
  "handoff.yaml",
  "MANIFEST.json",
  "NEXT_ACTIONS.md",
  "PICKUP_PROMPT.md",
  "README.md",
];
const checksums = [];
for (const name of checksumOrder) {
  const absolute = path.join(HANDOFF, name);
  checksums.push(`${sha256(await readFile(absolute)).slice(7)}  ${path.relative(ROOT, absolute).split(path.sep).join("/")}`);
}
await writeFile(path.join(HANDOFF, "SHA256SUMS"), `${checksums.join("\n")}\n`, "utf8");

await rm(path.join(ROOT, ".github", "workflows", "persist-release-candidate.yml"), { force: true });
await rm(path.join(ROOT, "scripts", "persist-release-candidate.mjs"), { force: true });

console.log(JSON.stringify({
  targetCommit: TARGET_COMMIT,
  verifyRun: VERIFY_RUN,
  materializationRun: MATERIALIZE_RUN,
  artifactId: ARTIFACT_ID,
  candidate: { artifactId: CANDIDATE_ID, digest: CANDIDATE_DIGEST, rawDigest: CANDIDATE_RAW_DIGEST },
  approvalRequest: { requestId: REQUEST_ID, requestDigest: REQUEST_DIGEST, status: "awaiting-exact-owner-approval" },
  persistedFiles: expectedFiles.length,
}, null, 2));
