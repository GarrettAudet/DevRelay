import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../../../src/index.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const [workItemId, expectedCommit, sourceCommit] = process.argv.slice(2);
if (!workItemId || !expectedCommit || !sourceCommit) {
  throw new Error(
    "usage: node prepare-frontier-integration.mjs <work-item-id> <expected-commit> <source-commit>",
  );
}
const slug = workItemId.replace(/^WI-DESKTOP-/u, "");
const outputRoot = resolve(
  root,
  "dogfood/chatgpt-desktop-runtime/execution/integration",
  workItemId,
);
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const bytes = (value) => Buffer.from(api.canonicalJson(value), "utf8");
const ref = (artifactId, digest) => ({ artifactId, digest });
const seal = (value, field) => ({ ...value, [field]: api.canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key)))) });
const write = (name, value) => { const path = resolve(outputRoot, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${api.canonicalJson(value)}\n`, "utf8"); };

const targetRef = "refs/heads/codex/v0.10-chatgpt-desktop-runtime";
const workBreakdown = readJson("project/work-breakdown-baseline.json");
const workItem = workBreakdown.workItems.find(({ id }) => id === workItemId);
if (!workItem) throw new Error("approved WorkItem is missing");
const verificationSubject = readJson(`dogfood/chatgpt-desktop-runtime/execution/verification/${workItemId}/subject.json`);
const verificationCandidate = readJson(`dogfood/chatgpt-desktop-runtime/execution/verification/${workItemId}/gate-candidate.json`);
const gateApproval = readJson(`dogfood/chatgpt-desktop-runtime/execution/verification/${workItemId}/gate-approval.json`);
const verificationContext = { policyEvaluation: readJson(`dogfood/chatgpt-desktop-runtime/execution/verification/${workItemId}/evaluation.json`), subject: verificationSubject, obligations: readJson(`dogfood/chatgpt-desktop-runtime/execution/verification/${workItemId}/obligation-set.json`), binding: readJson(`dogfood/chatgpt-desktop-runtime/execution/verification/${workItemId}/verifier-binding.json`), normalizedEvidence: readJson(`dogfood/chatgpt-desktop-runtime/execution/verification/${workItemId}/normalized-evidence.json`) };
const verifiedChange = readJson(`dogfood/chatgpt-desktop-runtime/execution/verification/${workItemId}/change-set-draft.json`);
const verifiedChangeBytes = bytes(verifiedChange);
const taskRepositorySnapshot = readJson(
  `dogfood/chatgpt-desktop-runtime/execution/task-contracts/${workItemId}/repository-snapshot.json`,
);
const preRepositorySnapshot = {
  ...taskRepositorySnapshot,
  revision: expectedCommit,
  treeDigest: api.sha256Digest(
    execFileSync(
      "git",
      ["ls-tree", "-r", "--full-tree", expectedCommit],
      { cwd: root },
    ),
  ),
};
if (
  api.canonicalJsonDigest(preRepositorySnapshot) !==
  verificationSubject.repositoryBase.digest
) {
  throw new Error("verification subject does not bind the exact target snapshot");
}
const baselineArtifacts = { requirementsBaseline: readJson("project/requirements-baseline.json"), projectOverviewBaseline: readJson("project/project-overview-baseline.json"), architectureBaseline: readJson("project/architecture-baseline.json"), contractDisposition: readJson("project/contract-disposition.json"), workBreakdownBaseline: workBreakdown, workDependencyBaseline: readJson("project/work-dependency-baseline.json"), specialistAssignmentBaseline: readJson("project/specialist-assignment-baseline.json") };
const baselines = Object.fromEntries(Object.entries(baselineArtifacts).map(([name, artifact]) => [name, { artifact, reference: verificationSubject[name] }]));
const integrationPolicy = { apiVersion: "devrelay.dev/v1alpha1", kind: "IntegrationPolicy", policyId: "POL-DESKTOP-INTEGRATION-001", version: "1.0.0", strategy: "fast-forward", targetRef, exactTargetCas: true, platform: "win32" };
const integrationPolicyBytes = bytes(integrationPolicy);
const integrationPolicyRef = ref(integrationPolicy.policyId, api.sha256Digest(integrationPolicyBytes));
const adapter = { id: "integration.git-fast-forward", version: "1.0.0", configurationDigest: api.canonicalJsonDigest({ targetRef, strategy: "fast-forward", platform: "win32" }) };
const permissions = [{ kind: "filesystem.read", scope: { values: [".git/objects", ".git/refs"] } }, { kind: "filesystem.write", scope: { values: [targetRef] } }, { kind: "process.spawn", scope: { values: ["git"] } }];
const validated = api.bindChangeIntegrationInputs({ subjectId: `CI-SUB-${slug}-001`, bindingId: `CI-BIND-${slug}-001`, workItem, workItemRef: verificationSubject.workItem, verificationSubject, verificationCandidate, verificationContext, gateApproval, verifiedChange, verifiedChangeRef: verificationSubject.changeSetDraft, verifiedChangeBytes, verificationEvidence: gateApproval.acceptedEvidence, baselines, target: { artifact: preRepositorySnapshot, reference: verificationSubject.repositoryBase }, targetRef, expectedCommit, integrationPolicy, integrationPolicyRef, integrationPolicyBytes, adapter, permissionDemands: permissions, hostGrants: permissions, idempotencyKey: `CI-${slug}-001` });
const plan = api.buildChangeIntegrationPlan({ planId: `CI-PLAN-${slug}-001`, validatedInput: validated, verifiedChangeBytes, sourceCommit, strategy: "fast-forward" });
const invocation = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "IntegrationAdapterInvocation", invocationId: `CI-INV-${slug}-001`, plan: ref(plan.planId, plan.planDigest), adapter: plan.adapter, permissionDemands: plan.permissionDemands, operation: { operationId: `CI-INV-${slug}-001`, transition: plan.transition } }, "invocationFingerprint");
api.validateChangeIntegrationArtifact(invocation, { plan, binding: validated.binding });
const authorization = seal({ apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopIntegrationAuthorization", authorizationId: `CI-AUTH-${slug}-001`, workItemId: workItem.id, verificationGateApproval: ref(gateApproval.approvalId, gateApproval.approvalDigest), plan: ref(plan.planId, plan.planDigest), invocation: ref(invocation.invocationId, invocation.invocationFingerprint), targetRef, expectedCommit, sourceCommit, strategy: "fast-forward", evidencePreservationRequired: true, platform: "win32" }, "authorizationDigest");
for (const [name, value] of [["verified-subject.json", validated.subject], ["input-binding.json", validated.binding], ["integration-plan.json", plan], ["adapter-invocation.json", invocation], ["integration-authorization.json", authorization], ["integration-policy.json", integrationPolicy]]) write(name, value);
console.log(JSON.stringify({ workItemId: workItem.id, gateApproval: gateApproval.approvalId, planDigest: plan.planDigest, invocationFingerprint: invocation.invocationFingerprint, authorizationDigest: authorization.authorizationDigest, targetRef, expectedCommit, sourceCommit }, null, 2));




