import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  canonicalJsonDigest,
  createEvidenceSealRecord,
  createImplementationSeal,
  sha256Digest,
  verifyTwoPhaseEvidenceSeal,
} from "../../../src/index.mjs";

const API = "devrelay.dev/v1alpha1";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const outputRoot = fileURLToPath(new URL("./", import.meta.url));
const targetRef = "refs/heads/codex/rp-001-release-ready";
const integrationSummaryPath = "dogfood/rp-001-release-preparation/integration-system-fix-4/integration-summary.json";
const executionSummaryPath = "dogfood/rp-001-release-preparation/execution-system-fix-4/execution-summary.json";
const finalAcceptancePath = "dogfood/rp-001-release-preparation/final-acceptance/final-acceptance-summary.json";
const windowsReceiptPath = "dogfood/rp-001-release-preparation/windows-e2e/installed-package-verification-receipt.json";
const git = (cwd, ...args) => execFileSync("git", ["-c", "core.longpaths=true", "-C", cwd, ...args], { encoding: "utf8", windowsHide: true }).trim();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${canonicalJson(value)}\n`, "utf8");
};
const artifactRef = (artifactId, value) => ({ artifactId, digest: canonicalJsonDigest(value) });

const integration = readJson(integrationSummaryPath);
const execution = readJson(executionSummaryPath);
const finalAcceptance = readJson(finalAcceptancePath);
const windowsReceipt = readJson(windowsReceiptPath);
assert.equal(finalAcceptance.blockingDiagnostics, 0);
assert.equal(finalAcceptance.promotionStatus, "pending-final-protected-main-checks");
assert.equal(windowsReceipt.outcome, "pass");
assert.equal(windowsReceipt.source.commit, integration.finalCommit);
assert.equal(integration.results.length, 1);
assert.equal(integration.results[0].outcome, "integrated");
assert.equal(integration.results[0].replayAdapterCalls, 0);
assert.equal(execution.executions.length, 1);
assert.equal(execution.executions[0].replayExecutorCalls, 0);

const implementationCommit = integration.finalCommit;
const parentCommit = integration.baseCommit;
assert.equal(git(root, "rev-parse", `${implementationCommit}^`), parentCommit);
const implementationTree = git(root, "rev-parse", `${implementationCommit}^{tree}`);
const implementationSeal = createImplementationSeal({
  repositoryId: "github.com/GarrettAudet/DevRelay",
  targetRef,
  parentCommit,
  implementationCommit,
  treeDigest: canonicalJsonDigest({ tree: implementationTree }),
  verifiedChangeSet: execution.executions[0].changeSet,
  integrationRecord: integration.results[0].integratedChange,
  worktreeClean: true,
});
writeJson(resolve(outputRoot, "implementation-seal.json"), implementationSeal);

let existingTarget = null;
try { existingTarget = git(root, "rev-parse", "--verify", targetRef); } catch {}
if (existingTarget !== null) throw new Error(`${targetRef} already exists at ${existingTarget}; refusing to overwrite a prior release seal`);

const temporaryRoot = mkdtempSync(join(tmpdir(), "dr-rp-seal-"));
const evidenceRepository = resolve(temporaryRoot, "r");
let evidenceCommit;
let evidenceManifest;
try {
  execFileSync("git", ["-c", "core.longpaths=true", "clone", "--quiet", "--shared", "--no-checkout", "--", root, evidenceRepository], { cwd: temporaryRoot, windowsHide: true });
  git(evidenceRepository, "checkout", "--quiet", "--detach", implementationCommit);
  git(evidenceRepository, "config", "user.name", "DevRelay Release Seal");
  git(evidenceRepository, "config", "user.email", "devrelay@invalid");
  cpSync(resolve(root, "dogfood/rp-001-release-preparation"), resolve(evidenceRepository, "dogfood/rp-001-release-preparation"), { recursive: true, force: true });
  git(evidenceRepository, "add", "--all", "--", "dogfood/rp-001-release-preparation");
  const stagedPaths = git(evidenceRepository, "diff", "--cached", "--name-only", "--diff-filter=ACMRT").split(/\r?\n/u).filter(Boolean).sort((left, right) => left.localeCompare(right, "en"));
  assert.ok(stagedPaths.length > 0, "the evidence seal must add or update evidence files");
  evidenceManifest = stagedPaths.map((path) => ({
    artifactId: `RP001-EVIDENCE-${path.replaceAll(/[^A-Za-z0-9]+/gu, "-").toUpperCase()}`,
    digest: sha256Digest(readFileSync(resolve(evidenceRepository, path))),
  }));
  git(evidenceRepository, "commit", "--quiet", "-m", "Seal RP-001 release evidence");
  evidenceCommit = git(evidenceRepository, "rev-parse", "HEAD");
  assert.equal(git(evidenceRepository, "rev-parse", `${evidenceCommit}^`), implementationCommit);
  assert.equal(git(evidenceRepository, "status", "--porcelain"), "");
  execFileSync("git", ["-C", root, "fetch", "--no-tags", "--force", "--", evidenceRepository, `HEAD:${targetRef}`], { windowsHide: true });
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

assert.equal(git(root, "rev-parse", "--verify", targetRef), evidenceCommit);
const evidenceSeal = createEvidenceSealRecord({
  implementationSeal,
  parentCommit: implementationCommit,
  evidenceCommit,
  evidence: evidenceManifest,
  worktreeClean: true,
});
assert.equal(verifyTwoPhaseEvidenceSeal({
  implementationSeal,
  evidenceSeal,
  observation: {
    targetRef,
    targetCommit: evidenceCommit,
    evidenceParentCommit: git(root, "rev-parse", `${evidenceCommit}^`),
    implementationParentCommit: git(root, "rev-parse", `${implementationCommit}^`),
    implementationTreeDigest: canonicalJsonDigest({ tree: git(root, "rev-parse", `${implementationCommit}^{tree}`) }),
    evidenceManifestDigest: evidenceSeal.evidenceManifestDigest,
    worktreeClean: true,
  },
}), true);
writeJson(resolve(outputRoot, "evidence-seal.json"), evidenceSeal);

const summary = {
  apiVersion: API,
  kind: "Rp001ReleaseSealSummary",
  targetRef,
  implementationCommit,
  evidenceCommit,
  implementationSeal: artifactRef(implementationSeal.sealId, implementationSeal),
  evidenceSeal: artifactRef(evidenceSeal.sealRecordId, evidenceSeal),
  finalAcceptance: finalAcceptance.businessAcceptance,
  systemVerification: finalAcceptance.systemVerification,
  windowsReceipt: { artifactId: windowsReceipt.kind, digest: windowsReceipt.receiptDigest },
  evidenceFiles: evidenceManifest.length,
  outcome: "release-ready",
};
summary.summaryDigest = canonicalJsonDigest(summary);
writeJson(resolve(outputRoot, "release-seal-summary.json"), summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
