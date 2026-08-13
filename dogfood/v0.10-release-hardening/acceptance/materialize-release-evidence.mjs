import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "../../../src/content-digest.mjs";

const API = "devrelay.dev/v1alpha1";
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../..");
const readBytes = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath));
const readJson = (relativePath) => JSON.parse(readBytes(relativePath));
const evidenceRef = (relativePath) => {
  const bytes = readBytes(relativePath);
  return {
    artifactId: `RELEASE-EVIDENCE-${canonicalJsonDigest(relativePath).slice(7, 23).toUpperCase()}`,
    digest: sha256Digest(bytes),
    path: relativePath.split(path.sep).join("/"),
    bytes: bytes.length,
  };
};
const writeJson = (name, value) =>
  fs.writeFileSync(
    path.join(directory, name),
    `${canonicalJson(value)}\n`,
    "utf8",
  );

const integratedWorkItems = [
  "WI-REL-WORK-EXECUTION-RUNTIME",
  "WI-REL-GOVERNANCE",
  "WI-REL-PACKAGE",
  "WI-REL-WINDOWS-VERIFY",
  "WI-REL-GITHUB-AUTOMATION",
  "WI-REL-PROTECTED-MAIN",
  "WI-REL-DESKTOP-DOGFOOD",
];
const completionFacts = integratedWorkItems.map((workItemId) => {
  const relativePath = `dogfood/v0.10-release-hardening/integration/${workItemId}/integrated-completion-fact.json`;
  const value = readJson(relativePath);
  if (
    value.workItem.artifactId !== workItemId ||
    value.status !== "verified-and-integrated"
  ) {
    throw new Error(`invalid integrated completion fact for ${workItemId}`);
  }
  return { workItemId, completion: evidenceRef(relativePath) };
});

const evidencePaths = [
  "dogfood/v0.10-release-hardening/execution/execution-summary.json",
  "dogfood/v0.10-release-hardening/verification/verification-summary.json",
  "dogfood/v0.10-release-hardening/integration/integration-summary.json",
  "dogfood/v0.10-release-hardening/traceability/traceability-summary.json",
  "dogfood/v0.10-release-hardening/execution/package-execution-summary.json",
  "dogfood/v0.10-release-hardening/verification/package-verification-summary.json",
  "dogfood/v0.10-release-hardening/integration/package-integration-summary.json",
  "dogfood/v0.10-release-hardening/traceability/package-traceability-summary.json",
  "dogfood/v0.10-release-hardening/execution/windows-execution-summary.json",
  "dogfood/v0.10-release-hardening/verification/windows-verification-summary.json",
  "dogfood/v0.10-release-hardening/integration/windows-integration-summary.json",
  "dogfood/v0.10-release-hardening/traceability/windows-traceability-summary.json",
  "dogfood/v0.10-release-hardening/execution/github-execution-summary.json",
  "dogfood/v0.10-release-hardening/verification/github-verification-summary.json",
  "dogfood/v0.10-release-hardening/integration/github-integration-summary.json",
  "dogfood/v0.10-release-hardening/traceability/github-traceability-summary.json",
  "dogfood/v0.10-release-hardening/protected-main/settings-receipt.json",
  "dogfood/v0.10-release-hardening/execution/protected-main-execution-summary.json",
  "dogfood/v0.10-release-hardening/verification/protected-main-verification-summary.json",
  "dogfood/v0.10-release-hardening/integration/protected-main-integration-summary.json",
  "dogfood/v0.10-release-hardening/traceability/protected-main-traceability-summary.json",
  "dogfood/v0.10-release-hardening/desktop-dogfood/provenance.json",
  "dogfood/v0.10-release-hardening/desktop-dogfood/evidence/desktop-dogfood-summary.json",
  "dogfood/v0.10-release-hardening/desktop-dogfood/evidence/LifecycleRunReport.md",
  "dogfood/v0.10-release-hardening/execution/desktop-dogfood-execution-summary.json",
  "dogfood/v0.10-release-hardening/verification/desktop-dogfood-verification-summary.json",
  "dogfood/v0.10-release-hardening/integration/desktop-dogfood-integration-summary.json",
  "dogfood/v0.10-release-hardening/traceability/desktop-dogfood-traceability-summary.json",
];
const evidence = evidencePaths.map(evidenceRef);
const requirements = readJson("project/requirements-baseline.json");
const releaseCriterionIds = [
  "AC-DEV-OSS-DISTRIBUTION-001",
  "AC-DEV-OSS-DOGFOOD-001",
  "AC-DEV-OSS-EXPORTS-001",
  "AC-DEV-OSS-GOVERNANCE-001",
  "AC-DEV-OSS-MAIN-001",
  "AC-DEV-OSS-SECURITY-001",
  "AC-DEV-OSS-WINDOWS-001",
];
const requirementsById = new Map(
  requirements.requirements.acceptanceCriteria.map((criterion) => [
    criterion.id,
    criterion,
  ]),
);
const criterionEvidence = {
  "AC-DEV-OSS-DISTRIBUTION-001": [
    "dogfood/v0.10-release-hardening/verification/package-verification-summary.json",
    "dogfood/v0.10-release-hardening/verification/github-verification-summary.json",
  ],
  "AC-DEV-OSS-DOGFOOD-001": [
    "dogfood/v0.10-release-hardening/desktop-dogfood/evidence/desktop-dogfood-summary.json",
    "dogfood/v0.10-release-hardening/desktop-dogfood/evidence/LifecycleRunReport.md",
  ],
  "AC-DEV-OSS-EXPORTS-001": [
    "dogfood/v0.10-release-hardening/verification/package-verification-summary.json",
  ],
  "AC-DEV-OSS-GOVERNANCE-001": [
    "dogfood/v0.10-release-hardening/integration/WI-REL-GOVERNANCE/integrated-completion-fact.json",
  ],
  "AC-DEV-OSS-MAIN-001": [
    "dogfood/v0.10-release-hardening/protected-main/settings-receipt.json",
  ],
  "AC-DEV-OSS-SECURITY-001": [
    "dogfood/v0.10-release-hardening/protected-main/settings-receipt.json",
    "dogfood/v0.10-release-hardening/verification/github-verification-summary.json",
  ],
  "AC-DEV-OSS-WINDOWS-001": [
    "dogfood/v0.10-release-hardening/verification/windows-verification-summary.json",
    "dogfood/v0.10-release-hardening/desktop-dogfood/evidence/desktop-dogfood-summary.json",
  ],
};
const coverage = releaseCriterionIds.map((criterionId) => {
  if (!requirementsById.has(criterionId))
    throw new Error(`missing criterion ${criterionId}`);
  return {
    criterionId,
    disposition: "satisfied",
    evidence: criterionEvidence[criterionId].map(evidenceRef),
  };
});
const desktopDogfoodSummary = readJson(
  "dogfood/v0.10-release-hardening/desktop-dogfood/evidence/desktop-dogfood-summary.json",
);

const body = {
  apiVersion: API,
  kind: "ReleaseCandidateEvidenceSet",
  evidenceSetId: "RCES-DEVRELAY-V010-DESKTOP-WINDOWS-001",
  workItemId: "WI-REL-ACCEPTANCE",
  releaseBoundary: {
    distribution: "GitHub source and deterministic installable tarball",
    supportedHost: "ChatGPT Desktop on Windows",
    repository: "https://github.com/GarrettAudet/DevRelay",
    defaultBranch: "main",
  },
  localVerification: {
    command: "npm.cmd run verify",
    outcome: "pass",
    staticCounts: {
      jsonFiles: 3558,
      javascriptModules: 492,
      lfOnlyTextFiles: 4363,
      downstreamOperationsWithProjectOverview: 13,
    },
    serializedTestCommand: "npm.cmd test",
    serializedTestOutcome: "pass",
  },
  githubEvidence: {
    verifiedSourceCommit: "430cb5c09f1aa69b60f48fb37b06f3c3d7d8213d",
    verifyRunId: "31676367056",
    codeQlRunId: "31676425288",
    scorecardRunId: "31676431243",
    sourceReleaseDryRunId: "31676437994",
  },
  correctedCandidateTarball: {
    digest: desktopDogfoodSummary.package.digest,
    status: "locally-installed-and-dogfooded",
    finalProtectedMatrix: "pending-after-acceptance-persistence",
  },
  completionFacts,
  evidence,
  coverage,
  exclusions: [
    "No public npm publication is claimed.",
    "No one-click ChatGPT Desktop plug-in is claimed.",
    "No hosted backend is claimed.",
    "Fixture-conformant upstream adapter bindings are not represented as live upstream CLI executions.",
  ],
  outcome: "candidate",
  authority: "evidence-assembly-only",
};
const candidate = { ...body, evidenceSetDigest: canonicalJsonDigest(body) };
writeJson("release-candidate-evidence-set.json", candidate);
const markdown = [
  "# V0.10 release candidate evidence",
  "",
  `- Evidence set: \`${candidate.evidenceSetId}\``,
  `- Digest: \`${candidate.evidenceSetDigest}\``,
  `- Integrated work items: ${completionFacts.length}`,
  `- Release criteria covered: ${coverage.length}`,
  "- Local kernel gate: pass",
  "- Serialized suite: pass",
  "- Independent Desktop dogfood: accepted and replayed",
  "- Final protected matrix: pending after exact candidate persistence",
  "",
  "The evidence set assembles a candidate only. It does not approve BusinessAcceptance or publish a release.",
  "",
].join("\n");
fs.writeFileSync(
  path.join(directory, "release-candidate-evidence.md"),
  markdown,
  "utf8",
);
process.stdout.write(`${JSON.stringify(candidate, null, 2)}\n`);
