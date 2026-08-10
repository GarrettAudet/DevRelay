import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as api from "../../../src/index.mjs";

const root = resolve(new URL("../../../", import.meta.url).pathname.slice(1));
const worker = "C:/Users/garre/.codex/worktrees/0ef1/DevRelay-v04-work-dependency-analysis";
const verificationDir = resolve(root, "dogfood/lifecycle-run-report/execution/verification/WI-RUN-CONTRACTS/attempt-003");
const outputDir = resolve(root, "dogfood/lifecycle-run-report/execution/host-integration");
const completionDir = resolve(root, "dogfood/lifecycle-run-report/execution/integrated-completion-facts");
mkdirSync(outputDir, { recursive:true });
mkdirSync(completionDir, { recursive:true });
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const ref = (artifactId, digest) => ({ artifactId, digest });
const seal = (value, field) => ({ ...value, [field]:api.canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });

const subject = readJson(resolve(verificationDir, "subject.json"));
const candidate = readJson(resolve(verificationDir, "gate-candidate.json"));
const approval = readJson(resolve(verificationDir, "gate-approval.json"));
const evidence = readJson(resolve(verificationDir, "normalized-evidence.json"));
const candidateWorkspace = readJson(resolve(verificationDir, "candidate-workspace.json"));
const binding = readJson(resolve(verificationDir, "binding.json"));
const obligations = readJson(resolve(verificationDir, "obligation-set.json"));
const policyEvaluation = readJson(resolve(verificationDir, "evaluation.json"));
api.validateWorkItemVerificationArtifact(subject);
api.validateWorkItemVerificationArtifact(candidate, { policyEvaluation, binding, subject, obligations, normalizedEvidence:evidence });

api.validateWorkItemVerificationArtifact(approval, { candidate, normalizedEvidence:evidence, obligations });
if (candidate.outcome !== "verified" || approval.decision !== "approved" || approval.authority !== "work-item-verification-gate") throw new Error("exact WorkItemVerification Gate approval is required");
if (approval.candidate.digest !== candidate.candidateDigest || candidate.normalizedEvidence.digest !== evidence.evidenceDigest) throw new Error("verification approval lineage is substituted");

const expectedPreimages = new Map([
  ["contracts/lifecycle-run-report-artifacts.schema.json", null],
  ["src/lifecycle-run-report-artifact-validator.mjs", null],
  ["src/index.mjs", "sha256:e7b82311138cf82c3c29df76f38d23339708d01e07821206929dba6d7ee691ba"],
  ["test/lifecycle-run-report-contracts.test.mjs", null],
]);
const candidateByPath = new Map(candidateWorkspace.files.map((entry) => [entry.relativePath, entry]));
if (candidateByPath.size !== expectedPreimages.size || [...expectedPreimages.keys()].some((path) => !candidateByPath.has(path))) throw new Error("candidate workspace changed after verification");

const pending = [];
for (const [relativePath, expectedBefore] of expectedPreimages) {
  const targetPath = resolve(root, relativePath);
  const sourcePath = resolve(worker, relativePath);
  const before = existsSync(targetPath) ? sha256(readFileSync(targetPath)) : null;
  if (before !== expectedBefore) throw new Error(`baseline-drift: ${relativePath}`);
  const bytes = readFileSync(sourcePath);
  const expected = candidateByPath.get(relativePath);
  if (sha256(bytes) !== expected.digest || bytes.length !== expected.bytes) throw new Error(`candidate substitution: ${relativePath}`);
  pending.push({ relativePath, targetPath, bytes, beforeDigest:before, afterDigest:expected.digest });
}

for (const entry of pending) {
  mkdirSync(dirname(entry.targetPath), { recursive:true });
  writeFileSync(entry.targetPath, entry.bytes);
}
for (const entry of pending) if (sha256(readFileSync(entry.targetPath)) !== entry.afterDigest) throw new Error(`post-state mismatch: ${entry.relativePath}`);

const workBreakdown = readJson(resolve(root, "dogfood/lifecycle-run-report/work-breakdown/work-breakdown-baseline.json"));
const workItem = workBreakdown.workItems.find(({ id }) => id === "WI-RUN-CONTRACTS");
const changeSetBytes = readFileSync(resolve(verificationDir, "change-set-draft.json"));
const approvalBytes = readFileSync(resolve(verificationDir, "gate-approval.json"));
const receiptBody = {
  apiVersion:"devrelay.dev/v1alpha1",
  kind:"BootstrapWorkItemHostIntegrationReceipt",
  receiptId:"CIHIR-WI-RUN-CONTRACTS-003",
  executionId:"WE-RUN-DOGFOOD-WI-RUN-CONTRACTS-ATTEMPT-003",
  workItemId:"WI-RUN-CONTRACTS",
  module:"ChangeIntegration",
  adapter:{ id:"bootstrap-exact-byte-host", version:"1.0.0", maturity:"fixture-conformant" },
  integrationMode:"verified-exact-byte-cas",
  compatibilityException:{ code:"DIRTY_BOOTSTRAP_BASELINE", disposition:"recorded-exception", detail:"The released local Git adapter requires a stable committed target. This bootstrap repository retains an approved content-pinned but uncommitted 0.9.0 baseline, so the external host performed exact-byte file CAS without claiming a Git merge." },
  verificationGateApproval:ref(approval.approvalId, approval.approvalDigest),
  integratedFiles:pending.map(({ relativePath, bytes, beforeDigest, afterDigest }) => ({ relativePath, bytes:bytes.length, beforeDigest, digest:afterDigest })),
  retryLineage:[
    { attempt:1, decision:"fix", taskDigest:"sha256:ba9516740ed8ff73a98ac8ad72f6081ea25d00f9c4625be3dd4a23140c36f0ee" },
    { attempt:2, decision:"fix", taskDigest:"sha256:3cb56e62a7779ddf8cb263084aa2df5f26e38dc05f9dd89fbe98c55bebfe3488" },
    { attempt:3, decision:"pass", taskDigest:"sha256:9906e17b8de104e87feb6ead8abb83990b3cb5d78012ecf1fbeda6133be61ca8" },
  ],
  lifecycleDisposition:"bootstrap-host-integrated",
  authoritativeVerifiedCompletionFactCreated:true,
  authoritativeIntegratedCompletionFactCreated:true,
  nextRunnableFrontier:["WI-RUN-CONTENT-POLICY","WI-RUN-LEDGER","WI-RUN-OBSERVATIONS"],
};
const receipt = { ...receiptBody, receiptDigest:api.canonicalJsonDigest(receiptBody) };
const receiptPath = resolve(outputDir, "WI-RUN-CONTRACTS.receipt.json");
writeFileSync(receiptPath, `${api.canonicalJson(receipt)}\n`, "utf8");
const completion = seal({
  apiVersion:"devrelay.dev/v1alpha1",
  kind:"IntegratedCompletionFact",
  completionId:"ICF-WI-RUN-CONTRACTS-003",
  workItem:ref(workItem.id, api.canonicalJsonDigest(workItem)),
  changeSet:ref("CHANGESET-WI-RUN-CONTRACTS-003", sha256(changeSetBytes)),
  verification:ref(approval.approvalId, sha256(approvalBytes)),
  integration:ref(receipt.receiptId, sha256(readFileSync(receiptPath))),
  status:"verified-and-integrated",
  authority:"factual-completion",
}, "completionDigest");
const { validateLifecycleRunReportArtifact } = await import("../../../src/lifecycle-run-report-artifact-validator.mjs");
validateLifecycleRunReportArtifact(completion);
const completionPath = resolve(completionDir, "WI-RUN-CONTRACTS.json");
writeFileSync(completionPath, `${api.canonicalJson(completion)}\n`, "utf8");
console.log(JSON.stringify({ receiptDigest:receipt.receiptDigest, receiptRawDigest:sha256(readFileSync(receiptPath)), completionDigest:completion.completionDigest, completionRawDigest:sha256(readFileSync(completionPath)), nextRunnableFrontier:receipt.nextRunnableFrontier }, null, 2));
