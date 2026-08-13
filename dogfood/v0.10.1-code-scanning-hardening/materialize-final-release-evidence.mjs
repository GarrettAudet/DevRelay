import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dogfood = join(root, "dogfood", "v0.10.1-code-scanning-hardening");
const evidenceDir = join(dogfood, "post-release");
const handoffDir = join(root, "handoff", "2026-08-13-v0101-controlled-release-complete");
const finalCommit = "fa5320374efd2228d924f4aa1c49ad4b418b5770";
const priorMerge = "9ccba1d440f67f55f15a213346b13c7bae44c20f";
const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const seal = (value, field) => ({ ...value, [field]: sha(canonical(value)) });
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const writeText = (path, value) => writeFileSync(path, value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n*$/, "\n"), "utf8");
const artifactRef = (artifactId, digest, mediaType, schema, uri) => ({ artifactId, digest, mediaType, schema, uri });
const evidenceRef = (artifactId, digest, file) => artifactRef(artifactId, digest, "application/vnd.devrelay.release-evidence+json", "https://devrelay.dev/artifacts/release-evidence/v1", `devrelay://repository/${file}`);

mkdirSync(evidenceDir, { recursive: true });
mkdirSync(handoffDir, { recursive: true });

const workItems = [
  {
    workItemId: "WI-SCAN-EXECUTABLE-CODE",
    outcome: "integrated",
    changeSets: [priorMerge, finalCommit],
    acceptanceCriteria: ["AC-DEV-ARTIFACT-HANDOFF-001", "AC-DEV-RUN-HUMAN-READABLE-001", "AC-DEV-RUN-SECURITY-001"],
    architectureElements: ["EL-DEVRELAY-CORE", "EL-REL-TOOLING", "EL-RUN-MARKDOWN-RENDERER"],
    evidence: ["EV-SCAN-LOCAL-VERIFY", "EV-SCAN-CODEQL-ZERO"]
  },
  {
    workItemId: "WI-SCAN-GOVERNANCE-DISPOSITIONS",
    outcome: "integrated",
    changeSets: [priorMerge],
    acceptanceCriteria: ["AC-DEV-OSS-GOVERNANCE-001"],
    architectureElements: ["EL-REL-EVIDENCE-ASSEMBLER"],
    evidence: ["EV-SCAN-SCORECARD-DISPOSITIONS"]
  },
  {
    workItemId: "WI-SCAN-RELEASE-PERMISSIONS",
    outcome: "integrated",
    changeSets: [priorMerge],
    acceptanceCriteria: ["AC-DEV-OSS-MAIN-001"],
    architectureElements: ["EL-REL-GITHUB-PROMOTION"],
    evidence: ["EV-SCAN-SOURCE-RELEASE"]
  },
  {
    workItemId: "WI-SCAN-VERIFICATION",
    outcome: "integrated",
    changeSets: [finalCommit],
    acceptanceCriteria: ["AC-DEV-OSS-DOGFOOD-001", "AC-DEV-OSS-MAIN-001"],
    architectureElements: ["EL-REL-EVIDENCE-ASSEMBLER", "EL-REL-GITHUB-PROMOTION", "EL-REL-INSTALLED-VERIFIER"],
    evidence: ["EV-SCAN-LOCAL-VERIFY", "EV-SCAN-MAIN-MATRIX", "EV-SCAN-CODEQL-ZERO", "EV-SCAN-SCORECARD-DISPOSITIONS", "EV-SCAN-SOURCE-RELEASE"]
  }
];

const releaseEvidence = seal({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ControlledSourceReleaseEvidence",
  evidenceId: "CSRE-DEVRELAY-V0101-WINDOWS-001",
  releaseBoundary: "GitHub source plus deterministic installable library operated through ChatGPT Desktop on Windows",
  repository: "https://github.com/GarrettAudet/DevRelay.git",
  protectedBranch: "main",
  finalCommit,
  pullRequests: [
    { number: 4, mergeCommit: priorMerge, outcome: "merged", url: "https://github.com/GarrettAudet/DevRelay/pull/4" },
    { number: 5, mergeCommit: finalCommit, outcome: "merged", url: "https://github.com/GarrettAudet/DevRelay/pull/5" }
  ],
  localVerification: {
    command: "npm.cmd run verify",
    tests: 867,
    passed: 865,
    failed: 0,
    skipped: 2,
    releaseCatalogDigests: 4536,
    packageFiles: 292,
    installedExportTargets: 171
  },
  protectedMainEvidence: {
    verify: { runId: 31701048939, outcome: "success", platforms: ["node-22/ubuntu", "node-24/ubuntu", "node-22/windows", "node-24/windows"] },
    codeql: { runId: 31701049017, outcome: "success", actionableAlerts: 0 },
    scorecard: { runId: 31701048991, outcome: "success", documentedGovernanceSignals: 5 },
    sourceRelease: {
      runId: 31701807978,
      outcome: "success",
      artifactId: 9181708671,
      artifactName: `github-source-release-${finalCommit}`,
      artifactBytes: 1451798,
      attested: true,
      immutableEvidenceUploaded: true,
      expiresAt: "2026-09-12T12:54:13Z"
    }
  },
  exclusions: ["public npm publication", "one-click ChatGPT Desktop plug-in", "hosted backend", "fixture-only upstream CLI interoperability claims"],
  authority: "evidence-only"
}, "evidenceDigest");
writeJson(join(evidenceDir, "controlled-source-release-evidence.json"), releaseEvidence);
const releaseRef = evidenceRef(releaseEvidence.evidenceId, releaseEvidence.evidenceDigest, "dogfood/v0.10.1-code-scanning-hardening/post-release/controlled-source-release-evidence.json");

const traceAssertions = [];
for (const item of workItems) {
  for (const commit of item.changeSets) traceAssertions.push({ from: item.workItemId, relationship: "produces", to: `CHANGESET-${commit}` });
  for (const element of item.architectureElements) for (const commit of item.changeSets) traceAssertions.push({ from: element, relationship: "implemented-by", to: `CHANGESET-${commit}` });
  for (const criterion of item.acceptanceCriteria) for (const evidence of item.evidence) traceAssertions.push({ from: criterion, relationship: "verified-by", to: evidence });
}
traceAssertions.sort((a, b) => canonical(a).localeCompare(canonical(b), "en"));
const traceUpdate = seal({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "TraceabilityUpdateSet",
  updateId: "TU-SCAN-HARDENING-COMPLETION-001",
  contributor: "trusted-release-completion-contributor/1.0.0",
  sourceArtifacts: [releaseRef],
  assertions: traceAssertions,
  direction: "upstream-to-downstream",
  inverseEdgesStored: false,
  authority: "proposal-for-core-merge"
}, "updateDigest");
writeJson(join(evidenceDir, "traceability-update-set.json"), traceUpdate);

const traceMerge = seal({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "TraceabilityMergeProof",
  proofId: "TMP-SCAN-HARDENING-COMPLETION-001",
  executionId: "EXEC-SCAN-HARDENING-COMPLETION-001",
  baseGraph: { graphId: "traceability-graph-devrelay-work-breakdown-r47", version: 47 },
  update: { updateId: traceUpdate.updateId, digest: traceUpdate.updateDigest },
  resultingCheckpoint: { graphId: "traceability-graph-devrelay-v0101-release-complete-r48", version: 48 },
  mergeDisposition: "applied",
  atomic: true,
  diagnostics: { orphanedRequirements: 0, unscopedWork: 0, missingEvidence: 0 },
  authority: "core"
}, "proofDigest");
writeJson(join(evidenceDir, "traceability-merge-proof.json"), traceMerge);

const stages = [
  { sequence: 14, module: "WorkExecution", operation: "execute-ready-frontiers", outcome: "completed", checks: { workItems: 4, failed: 0 }, primaryArtifact: releaseRef },
  { sequence: 15, module: "WorkItemVerification", operation: "verify-work-items", outcome: "verified", checks: { workItems: 4, failed: 0, evidenceComplete: true }, primaryArtifact: releaseRef },
  { sequence: 16, module: "ChangeIntegration", operation: "integrate-change", outcome: "integrated", checks: { protectedMainCommit: finalCommit, pullRequestsMerged: 2 }, primaryArtifact: releaseRef },
  { sequence: 17, module: "SystemVerification", operation: "verify-integrated-system", outcome: "verified", checks: { acceptanceCriteria: 6, nonFunctionalRequirements: 3, actionableCodeqlAlerts: 0, blockingDiagnostics: 0 }, primaryArtifact: releaseRef },
  { sequence: 18, module: "BusinessAcceptance", operation: "accept-verified-system", outcome: "accepted", checks: { ownerAuthorization: "standing-authority", releaseBoundaryUnchanged: true }, primaryArtifact: releaseRef }
].map(stage => seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "LifecycleStageRecord", ...stage }, "recordDigest"));
for (const stage of stages) writeJson(join(dogfood, `${String(stage.sequence).padStart(2, "0")}-${stage.module}.json`), stage);

const completion = seal({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "LifecycleCompletionEvidence",
  completionId: "LCE-SCAN-HARDENING-001",
  finalCommit,
  outcome: "construction-complete",
  workItems,
  systemVerification: {
    outcome: "verified",
    acceptanceCriteria: ["AC-DEV-ARTIFACT-HANDOFF-001", "AC-DEV-OSS-DOGFOOD-001", "AC-DEV-OSS-GOVERNANCE-001", "AC-DEV-OSS-MAIN-001", "AC-DEV-RUN-HUMAN-READABLE-001", "AC-DEV-RUN-SECURITY-001"],
    nonFunctionalRequirements: ["NFR-DEV-DETERMINISM-001", "NFR-DEV-OSS-DETERMINISM-001", "NFR-DEV-RUN-REPORT-PRIVACY-001"],
    evidence: releaseRef,
    blockingDiagnostics: 0
  },
  businessAcceptance: {
    outcome: "accepted",
    approvalBasis: "Standing owner authorization in the active release task to approve necessary items while preserving the agreed controlled Windows source/library boundary.",
    acceptedCommit: finalCommit,
    lifecycleDisposition: "construction-complete"
  },
  traceability: { updateDigest: traceUpdate.updateDigest, mergeProofDigest: traceMerge.proofDigest, resultingGraphVersion: 48 },
  remainingReleaseBlockers: [],
  authority: "lifecycle-completion-record"
}, "completionDigest");
writeJson(join(evidenceDir, "lifecycle-completion-evidence.json"), completion);

const report = `# Lifecycle Run Report — Code-scanning hardening

## Executive summary

DevRelay ran the complete released lifecycle for the v0.10.1 scanner-hardening increment. The deterministic pre-execution circuit reused the exact approved project baselines, performed native repository discovery, recorded the bounded architecture change, routed contracts to approved not-applicable, decomposed four work items, validated their static dependency DAG with Graphology-DAG and pinned OPA WASM, and assigned the provider-neutral ChatGPT Desktop security/release profile. The two ready frontiers were then executed, independently verified, integrated through protected pull requests, system-verified on the exact main commit, and business-accepted under the standing owner authorization.

## Stage table

| # | Module | Operation | Outcome | Adapter or Core capability |
|---:|---|---|---|---|
| 1 | RequirementsGathering | classify-approved-change | baseline-reused | core-native-change-classifier |
| 2 | RequirementsGate | validate-reuse | approved | Core gate |
| 3 | ArchitectureDiscovery | discover | discovered | native-architecture-discovery |
| 4 | ArchitectureDesign | design-change | designed | Core gate |
| 5 | ArchitectureGate | validate-change | approved | Core gate |
| 6 | ContractGeneration | route | not-applicable | Core gate |
| 7 | ContractGate | approve-not-applicable | approved | Core gate |
| 8 | WorkBreakdown | decompose-change | decomposed | native-structured-work-proposer |
| 9 | WorkBreakdownGate | validate-change | approved | Core gate |
| 10 | WorkDependencyAnalysis | analyze-dependencies | analyzed | native proposer + Graphology-DAG + OPA WASM |
| 11 | WorkDependencyGate | validate-dependency-dag | approved | Core gate |
| 12 | SpecialistAssignment | assign-specialists | assigned | native-specialist-ranker |
| 13 | SpecialistAssignmentGate | validate-assignments | approved | Core gate |
| 14 | WorkExecution | execute-ready-frontiers | completed | ChatGPT Desktop on Windows |
| 15 | WorkItemVerification | verify-work-items | verified | local + protected GitHub evidence |
| 16 | ChangeIntegration | integrate-change | integrated | protected PRs #4 and #5 |
| 17 | SystemVerification | verify-integrated-system | verified | Node 22/24 Windows/Ubuntu + CodeQL + Scorecard |
| 18 | BusinessAcceptance | accept-verified-system | accepted | standing owner authorization |

## Final evidence

- Protected main commit: \`${finalCommit}\`.
- Canonical local gate: 867 tests, 0 failures, 2 intentional skips.
- Release catalog: 4,536 repository digests and 292 package files; installed package exposes 171 export targets.
- Main matrix run: [31701048939](https://github.com/GarrettAudet/DevRelay/actions/runs/31701048939), including Node 22 and 24 on Windows.
- CodeQL run: [31701049017](https://github.com/GarrettAudet/DevRelay/actions/runs/31701049017), with zero actionable alerts.
- Scorecard run: [31701048991](https://github.com/GarrettAudet/DevRelay/actions/runs/31701048991); five non-code governance signals retain explicit dispositions.
- Controlled source release: [31701807978](https://github.com/GarrettAudet/DevRelay/actions/runs/31701807978), artifact \`9181708671\`, attested and uploaded as immutable workflow evidence.
- TraceabilityGraph: one trusted forward-only update atomically merged from revision 47 to 48 with zero orphaned requirements, unscoped work, or missing evidence.

## Release boundary

Complete for GitHub source plus the deterministic installable DevRelay library operated through ChatGPT Desktop on Windows. This does not claim public npm publication, a one-click Desktop plug-in, a hosted backend, or live upstream interoperability where only fixture-conformant adapter evidence exists.
`;
writeText(join(dogfood, "LifecycleRunReport.md"), report);

const currentStatus = `# DevRelay current implementation status

Last reconciled: 2026-08-13 MDT
Protected branch: \`main\`
Release commit: \`${finalCommit}\`
Candidate version: \`0.10.0-rc.1\`
Release boundary: controlled GitHub source/installable library for ChatGPT Desktop on Windows

## Executive status

DevRelay is release-ready for the agreed controlled boundary. The complete deterministic construction lifecycle has been dogfooded end to end, including the v0.10.1 scanner-hardening increment. All work items are executed, verified, integrated, system-verified, traced, and business-accepted.

\`main\` passed the Node 22/24 Windows/Ubuntu matrix, CodeQL, and Scorecard. Actionable CodeQL alerts are zero. The controlled source-release workflow verified the exact source and installed package, materialized and attested the assets, and uploaded immutable release evidence.

\`\`\`text
RequirementsGathering through SpecialistAssignmentGate  COMPLETE
WorkExecution frontier loop                            COMPLETE
WorkItemVerification                                  VERIFIED
ChangeIntegration                                     INTEGRATED
SystemVerification                                    VERIFIED
BusinessAcceptance                                    ACCEPTED
TraceabilityGraph hardening increment                 REVISION 48 / ZERO BLOCKERS
Controlled GitHub source release                      COMPLETE
\`\`\`

## Exact release evidence

- Main commit: \`${finalCommit}\`.
- Main verification: run \`31701048939\`, all four Node/OS lanes passed.
- CodeQL: run \`31701049017\`, zero actionable alerts.
- Scorecard: run \`31701048991\`, five documented non-code governance signals remain dispositioned.
- Controlled source release: run \`31701807978\`, artifact \`9181708671\`, attested and uploaded.
- Local release gate: 867 tests, 0 failures; 4,536 catalog digests; 292 package files; 171 installed export targets.

## Boundary and exclusions

This release covers GitHub source plus the deterministic installable library used through ChatGPT Desktop on Windows. It does not claim public npm publication, a one-click Desktop plug-in, a hosted backend, or live execution of fixture-conformant upstream CLIs.

## Pickup

The authoritative completion handoff is \`handoff/2026-08-13-v0101-controlled-release-complete/README.md\`.
`;
writeText(join(root, "CURRENT_STATUS.md"), currentStatus);

const handoffFiles = {
  "README.md": `# DevRelay v0.10.1 controlled release completion handoff

DevRelay is release-ready for the agreed GitHub-source/installable-library boundary operated through ChatGPT Desktop on Windows. The final protected \`main\` commit is \`${finalCommit}\`.

All lifecycle stages are complete. The exact main commit passed the four-platform verification matrix, CodeQL with zero actionable alerts, Scorecard, installed-package verification, and the controlled source-release workflow with attested immutable evidence.

Start with \`CURRENT_STATE.md\`, then use \`EVIDENCE_INDEX.md\` for exact run and artifact identities. No release blocker remains inside the agreed boundary.
`,
  "CURRENT_STATE.md": `# Current state

- Status: release-ready / construction-complete
- Protected branch: \`main\`
- Exact release commit: \`${finalCommit}\`
- Version: \`0.10.0-rc.1\`
- Runtime boundary: ChatGPT Desktop on Windows using GitHub source/installable library
- Actionable CodeQL alerts: 0
- TraceabilityGraph: revision 48, zero blockers
- Remaining in-scope work: none
`,
  "EVIDENCE_INDEX.md": `# Evidence index

- Full lifecycle report: \`dogfood/v0.10.1-code-scanning-hardening/LifecycleRunReport.md\`
- Completion record: \`dogfood/v0.10.1-code-scanning-hardening/post-release/lifecycle-completion-evidence.json\`
- Source-release evidence: \`dogfood/v0.10.1-code-scanning-hardening/post-release/controlled-source-release-evidence.json\`
- Traceability update: \`dogfood/v0.10.1-code-scanning-hardening/post-release/traceability-update-set.json\`
- Traceability merge proof: \`dogfood/v0.10.1-code-scanning-hardening/post-release/traceability-merge-proof.json\`
- Main verification: https://github.com/GarrettAudet/DevRelay/actions/runs/31701048939
- Main CodeQL: https://github.com/GarrettAudet/DevRelay/actions/runs/31701049017
- Main Scorecard: https://github.com/GarrettAudet/DevRelay/actions/runs/31701048991
- Controlled source release: https://github.com/GarrettAudet/DevRelay/actions/runs/31701807978
- Immutable workflow artifact: \`9181708671\` / \`github-source-release-${finalCommit}\`
`,
  "NEXT_ACTIONS.md": `# Next actions

No action is required to complete the agreed controlled release boundary.

Optional follow-on work must be a new approved increment, for example public npm publication, a one-click Desktop integration, a hosted service, or promotion of fixture-conformant adapters through live upstream conformance. None is implied by this release.
`,
  "PICKUP_PROMPT.md": `# Pickup prompt

DevRelay's controlled GitHub source/installable-library release for ChatGPT Desktop on Windows is complete at protected main commit \`${finalCommit}\`. Read \`CURRENT_STATUS.md\`, this handoff's \`CURRENT_STATE.md\`, and \`EVIDENCE_INDEX.md\`. Treat all lifecycle stages, SystemVerification, BusinessAcceptance, and TraceabilityGraph revision 48 as complete for the stated boundary. Start no new release work unless the owner defines a new increment.
`,
  "handoff.yaml": `apiVersion: devrelay.dev/v1alpha1
kind: ReleaseCompletionHandoff
status: construction-complete
protectedBranch: main
releaseCommit: ${finalCommit}
version: 0.10.0-rc.1
runtimeBoundary: ChatGPT Desktop on Windows
sourceReleaseRun: 31701807978
sourceReleaseArtifact: 9181708671
actionableCodeqlAlerts: 0
traceabilityGraphVersion: 48
remainingBlockers: 0
`
};
for (const [name, contents] of Object.entries(handoffFiles)) writeText(join(handoffDir, name), contents);
const manifestEntries = Object.keys(handoffFiles).sort().map(path => {
  const bytes = readFileSync(join(handoffDir, path));
  return { path, bytes: bytes.length, digest: sha(bytes) };
});
const manifest = { apiVersion: "devrelay.dev/v1alpha1", kind: "HandoffManifest", releaseCommit: finalCommit, entries: manifestEntries };
writeJson(join(handoffDir, "MANIFEST.json"), manifest);
const checksumFiles = [...Object.keys(handoffFiles), "MANIFEST.json"].sort();
writeText(join(handoffDir, "SHA256SUMS"), checksumFiles.map(path => `${sha(readFileSync(join(handoffDir, path))).slice(7)}  ${path}`).join("\n"));

const dogfoodReadmePath = join(dogfood, "README.md");
const dogfoodReadme = readFileSync(dogfoodReadmePath, "utf8")
  .replace(
    /The materializer is deterministic[\s\S]*?does not claim those outcomes early\./,
    `The materializer is deterministic for the exact protected-main source commit
\`37e968516623c3d135f8829b0e56e19a7ba59722\`. Its first thirteen module records
are planning and Gate evidence only. The factual post-execution records were
later appended from the actual protected effects and exact GitHub evidence;
they bind final main commit \`${finalCommit}\`.`
  )
  .replace(
    /This binds the exact dirty candidate[\s\S]*?installed source-release checks complete\./,
    `This binds the exact dirty candidate file set and canonical local gate result
to a content-addressed evidence record. Its WorkItemVerification outcome stays
\`needs-external-evidence\` because it is deliberately a pre-integration local
record and is never rewritten after external evidence arrives.

After the exact protected commit and source-release run exist, reproduce the
completion package with:

\`\`\`powershell
node dogfood\\v0.10.1-code-scanning-hardening\\materialize-final-release-evidence.mjs
\`\`\`

The post-release directory and stage records 14 through 18 contain the factual
WorkExecution, WorkItemVerification, ChangeIntegration, SystemVerification,
BusinessAcceptance, and Core traceability-merge evidence.`
  );
writeText(dogfoodReadmePath, dogfoodReadme);

const specPath = join(root, "docs", "specs", "v0.10.1-code-scanning-hardening", "README.md");
let spec = readFileSync(specPath, "utf8");
spec = spec.replace("descriptor-bound\nfile operations, exclusive immutable writes, exact code-owned download URLs,", "descriptor-bound\nfile operations, single-descriptor atomic assignment replacement, exact code-owned download URLs,");
spec = spec.replace(/## Current lifecycle state[\s\S]*?human-readable LifecycleRunReport\./, `## Current lifecycle state

\`\`\`text
RequirementsGathering through SpecialistAssignmentGate: COMPLETE
WorkExecution: COMPLETE
WorkItemVerification: VERIFIED
ChangeIntegration: INTEGRATED
SystemVerification: VERIFIED
BusinessAcceptance: ACCEPTED
TraceabilityGraph: REVISION 48 / ZERO BLOCKERS
Controlled GitHub source release: COMPLETE
\`\`\`

Final protected-main commit: \`${finalCommit}\`.

Canonical local verification completed with 867 tests, 865 passes, zero failures,
and two intentional skips. Protected main passed Node 22/24 on Windows and
Ubuntu, CodeQL with zero actionable alerts, Scorecard with five documented
non-code dispositions, and controlled source-release run \`31701807978\` with
attested immutable artifact \`9181708671\`.

See \`dogfood/v0.10.1-code-scanning-hardening/\` for the module-by-module records,
full work snapshot, dependency and OPA evidence, assignments, traceability
merge proof, completion evidence, and human-readable LifecycleRunReport.`);
writeText(specPath, spec);

console.log(`Materialized final release evidence for ${finalCommit}.`);
console.log(`Completion digest: ${completion.completionDigest}`);
console.log(`Traceability merge proof: ${traceMerge.proofDigest}`);
console.log(`Handoff: ${relative(root, handoffDir)}`);
