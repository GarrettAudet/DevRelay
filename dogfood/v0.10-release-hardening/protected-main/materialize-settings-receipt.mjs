import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  canonicalJsonDigest,
} from "../../../src/content-digest.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = "GarrettAudet/DevRelay";
const expectedCommit = "430cb5c09f1aa69b60f48fb37b06f3c3d7d8213d";
const expectedChecks = [
  "Node 22.x on ubuntu-latest",
  "Node 22.x on windows-latest",
  "Node 24.x on ubuntu-latest",
  "Node 24.x on windows-latest",
];
const runIds = {
  codeql: 31676425288,
  scorecard: 31676431243,
  sourceRelease: 31676437994,
  verify: 31676367056,
};

const gh = (args, options = {}) =>
  execFileSync("gh", args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  }).trim();
const api = (endpoint) => JSON.parse(gh(["api", endpoint]));
const run = (runId) =>
  JSON.parse(
    gh([
      "run",
      "view",
      String(runId),
      "--json",
      "databaseId,workflowName,event,status,conclusion,headSha,url,jobs",
    ]),
  );
const passEndpoint = (endpoint) => {
  gh(["api", endpoint]);
  return true;
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const summarizeRun = (value) => ({
  runId: value.databaseId,
  workflow: value.workflowName,
  event: value.event,
  status: value.status,
  conclusion: value.conclusion,
  headSha: value.headSha,
  url: value.url,
  jobs: value.jobs.map((job) => ({
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    url: job.url,
  })),
});

const repo = api(`repos/${repository}`);
const main = api(`repos/${repository}/git/ref/heads/main`);
const protection = api(`repos/${repository}/branches/main/protection`);
const privateReporting = api(
  `repos/${repository}/private-vulnerability-reporting`,
);
const automatedFixes = api(`repos/${repository}/automated-security-fixes`);
const vulnerabilityAlerts = passEndpoint(
  `repos/${repository}/vulnerability-alerts`,
);
const workflowRuns = Object.fromEntries(
  Object.entries(runIds).map(([name, runId]) => [name, summarizeRun(run(runId))]),
);
const initialScorecardFailure = summarizeRun(run(31676367267));
const request = JSON.parse(
  fs.readFileSync(path.join(directory, "branch-protection-request.json"), "utf8"),
);

assert(repo.default_branch === "main", "main is not the default branch");
assert(main.object?.sha === expectedCommit, "main does not bind the verified commit");
assert(protection.enforce_admins?.enabled === true, "admin enforcement is disabled");
assert(protection.required_status_checks?.strict === true, "strict checks are disabled");
assert(
  canonicalJson([...protection.required_status_checks.contexts].sort()) ===
    canonicalJson([...expectedChecks].sort()),
  "required checks differ from the approved set",
);
assert(
  protection.required_pull_request_reviews?.required_approving_review_count === 0,
  "solo-maintainer pull-request policy changed",
);
assert(protection.required_linear_history?.enabled === true, "linear history is disabled");
assert(protection.allow_force_pushes?.enabled === false, "force pushes are enabled");
assert(protection.allow_deletions?.enabled === false, "branch deletion is enabled");
assert(
  protection.required_conversation_resolution?.enabled === true,
  "conversation resolution is disabled",
);
assert(privateReporting.enabled === true, "private vulnerability reporting is disabled");
assert(automatedFixes.enabled === true && automatedFixes.paused === false, "automated fixes are disabled");
assert(vulnerabilityAlerts, "vulnerability alerts are disabled");
assert(repo.security_and_analysis?.secret_scanning?.status === "enabled", "secret scanning is disabled");
assert(
  repo.security_and_analysis?.secret_scanning_push_protection?.status === "enabled",
  "secret scanning push protection is disabled",
);
assert(
  repo.security_and_analysis?.dependabot_security_updates?.status === "enabled",
  "Dependabot security updates are disabled",
);
for (const [name, value] of Object.entries(workflowRuns)) {
  assert(value.status === "completed" && value.conclusion === "success", `${name} workflow is not green`);
  assert(value.headSha === expectedCommit, `${name} workflow ran against another commit`);
}
assert(
  initialScorecardFailure.conclusion === "failure" &&
    initialScorecardFailure.headSha === expectedCommit,
  "initial Scorecard diagnostic is missing",
);

const material = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "OperationalReadinessEvidence",
  evidenceId: "EV-REL-PROTECTED-MAIN-001",
  repository,
  verifiedCommit: expectedCommit,
  defaultBranch: repo.default_branch,
  mainRef: main.ref,
  branchProtection: {
    requestDigest: canonicalJsonDigest(request),
    strictStatusChecks: protection.required_status_checks.strict,
    requiredChecks: [...protection.required_status_checks.contexts].sort(),
    pullRequestRequired: protection.required_pull_request_reviews !== null,
    requiredApprovingReviewCount:
      protection.required_pull_request_reviews.required_approving_review_count,
    enforceAdmins: protection.enforce_admins.enabled,
    requiredLinearHistory: protection.required_linear_history.enabled,
    allowForcePushes: protection.allow_force_pushes.enabled,
    allowDeletions: protection.allow_deletions.enabled,
    requireConversationResolution:
      protection.required_conversation_resolution.enabled,
  },
  security: {
    vulnerabilityAlerts,
    automatedSecurityFixes: automatedFixes.enabled && !automatedFixes.paused,
    dependabotSecurityUpdates:
      repo.security_and_analysis.dependabot_security_updates.status === "enabled",
    secretScanning:
      repo.security_and_analysis.secret_scanning.status === "enabled",
    secretScanningPushProtection:
      repo.security_and_analysis.secret_scanning_push_protection.status ===
      "enabled",
    privateVulnerabilityReporting: privateReporting.enabled,
  },
  workflowRuns,
  diagnosticHistory: [
    {
      run: initialScorecardFailure,
      classification: "default-branch-transition-race",
      disposition: "superseded-by-post-configuration-scorecard-run",
      supersedingRunId: runIds.scorecard,
    },
  ],
  outcome: "pass",
};
const receipt = {
  ...material,
  receiptDigest: canonicalJsonDigest(material),
};
fs.writeFileSync(
  path.join(directory, "settings-receipt.json"),
  `${canonicalJson(receipt)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
