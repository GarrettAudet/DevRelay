import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../src/index.mjs";

const API = "devrelay.dev/v1alpha1";
const ROOT = new URL("../../", import.meta.url);
const OUTPUT = new URL("./", import.meta.url);
const outputPath = "dogfood/v0.10.1-code-scanning-hardening/local-verification-evidence.json";

const status = execFileSync(
  "git",
  ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
  { cwd: ROOT, encoding: "utf8" },
);

const changedPaths = status
  .split("\0")
  .filter(Boolean)
  .flatMap((entry) => {
    const statusCode = entry.slice(0, 2);
    const path = entry.slice(3).replaceAll("\\", "/");
    return statusCode.includes("D") || path === outputPath ? [] : [path];
  })
  .sort((left, right) => left.localeCompare(right, "en"));

const changedFiles = changedPaths.map((path) => {
  const bytes = readFileSync(new URL(path, ROOT));
  return {
    path,
    bytes: statSync(new URL(path, ROOT)).size,
    digest: sha256Digest(bytes),
  };
});

const body = {
  apiVersion: API,
  kind: "LocalVerificationEvidence",
  evidenceId: "LVE-SCAN-HARDENING-001",
  branch: "codex/v0.10.1-code-scanning-hardening",
  baseCommit: "37e968516623c3d135f8829b0e56e19a7ba59722",
  candidateFiles: changedFiles,
  candidateFilesDigest: canonicalJsonDigest(changedFiles),
  workExecution: {
    outcome: "candidate-change-materialized",
    readyWorkItemRefs: [
      "WI-SCAN-EXECUTABLE-CODE",
      "WI-SCAN-GOVERNANCE-DISPOSITIONS",
      "WI-SCAN-RELEASE-PERMISSIONS",
    ],
    executorBinding: {
      specialistProfileRef: "PROFILE-CHATGPT-DESKTOP-SECURITY-RELEASE",
      runtime: "ChatGPT Desktop on Windows",
    },
  },
  workItemVerification: {
    outcome: "needs-external-evidence",
    localGate: {
      command: "npm.cmd run verify",
      tests: 866,
      passed: 864,
      failed: 0,
      skipped: 2,
      durationMilliseconds: 312529.7137,
      staticInventory: {
        jsonArtifacts: 3681,
        javascriptModules: 500,
        lfOnlyTextFiles: 4506,
        downstreamOperations: 13,
      },
    },
    remainingEvidence: [
      "Protected pull-request verification matrix",
      "CodeQL analysis for the exact candidate",
      "OpenSSF Scorecard reevaluation",
      "Installed-package and source-release verification",
    ],
  },
  authorityBoundary: "Local evidence cannot approve integration, protected-main verification, scanner closure, or BusinessAcceptance.",
};

const evidence = {
  ...body,
  evidenceDigest: canonicalJsonDigest(body),
};

writeFileSync(
  new URL("local-verification-evidence.json", OUTPUT),
  canonicalJson(evidence) + "\n",
  "utf8",
);

process.stdout.write(
  JSON.stringify(
    {
      outcome: evidence.workItemVerification.outcome,
      evidenceDigest: evidence.evidenceDigest,
      changedFiles: changedFiles.length,
      localTests: evidence.workItemVerification.localGate.tests,
      localFailures: evidence.workItemVerification.localGate.failed,
    },
    null,
    2,
  ) + "\n",
);
