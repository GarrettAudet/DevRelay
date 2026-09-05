import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { validateRequirementsGatePromotion } from "../../src/requirements-gate.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";

const root = new URL("../../", import.meta.url);
const dogfood = new URL("./", import.meta.url);
const project = new URL("../../project/", import.meta.url);
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = (ref) => Object.freeze({ artifactId: ref.artifactId, digest: ref.digest });
const readJson = async (url) => {
  const bytes = await readFile(url);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
};
const fullRef = (pointerValue, schema, mediaType, uri) => Object.freeze({ ...pointerValue, schema, mediaType, uri });

const [
  moduleDefinition,
  pluginDefinition,
  invocationDocument,
  resultDocument,
  checkpointDocument,
  changeSetDocument,
  overviewChangeDocument,
  nativeBundleDocument,
  gateCandidateDocument,
  repositorySnapshotDocument,
  ownerDecisionsDocument,
  closureAssessmentDocument,
  executionProofDocument,
  previousRequirementsDocument,
  previousOverviewDocument,
] = await Promise.all([
  readJson(new URL("examples/modules/requirements-gathering.module.json", root)),
  readJson(new URL("examples/plugins/openspec.plugin.json", root)),
  readJson(new URL("requirements-gathering.invocation.json", dogfood)),
  readJson(new URL("requirements-gathering.result.json", dogfood)),
  readJson(new URL("requirements-gathering.checkpoint.json", dogfood)),
  readJson(new URL("requirements-change-set.json", dogfood)),
  readJson(new URL("project-overview-change-set-draft.json", dogfood)),
  readJson(new URL("native-source-bundle.json", dogfood)),
  readJson(new URL("requirements-gate-candidate.json", dogfood)),
  readJson(new URL("repository-snapshot.json", dogfood)),
  readJson(new URL("owner-decisions.json", dogfood)),
  readJson(new URL("requirements-closure-assessment-approved.json", dogfood)),
  readJson(new URL("requirements-gathering.execution-proof.json", dogfood)),
  readJson(new URL("requirements-baseline.json", project)),
  readJson(new URL("project-overview-baseline.json", project)),
]);
const gateReviewBytes = await readFile(new URL("requirements-gate-review.md", dogfood));
const candidateOverviewMarkdownBytes = await readFile(new URL("candidate/ProjectOverview.md", dogfood));
const previousOverviewMarkdownBytes = await readFile(new URL("../../ProjectOverview.md", dogfood));

const approved = Object.freeze({
  gateCandidate: sha256Digest(gateCandidateDocument.bytes),
  requirementsBaseline: sha256Digest(previousRequirementsDocument.bytes),
  projectOverviewBaseline: sha256Digest(previousOverviewDocument.bytes),
  repositorySnapshot: sha256Digest(repositorySnapshotDocument.bytes),
  ownerDecisions: sha256Digest(ownerDecisionsDocument.bytes),
  requirementsClosureAssessment: sha256Digest(closureAssessmentDocument.bytes),
  requirementsChangeSet: sha256Digest(changeSetDocument.bytes),
  projectOverviewChangeSet: sha256Digest(overviewChangeDocument.bytes),
  projectOverviewMarkdown: sha256Digest(candidateOverviewMarkdownBytes),
  nativeSourceBundle: sha256Digest(nativeBundleDocument.bytes),
  terminalCheckpoint: sha256Digest(checkpointDocument.bytes),
  executionProof: sha256Digest(executionProofDocument.bytes),
  gateReview: sha256Digest(gateReviewBytes),
});
const expectedBindings = Object.freeze({
  RequirementsBaseline: approved.requirementsBaseline,
  ProjectOverviewBaseline: approved.projectOverviewBaseline,
  RepositorySnapshot: approved.repositorySnapshot,
  OwnerDecisions: approved.ownerDecisions,
  RequirementsClosureAssessment: approved.requirementsClosureAssessment,
  RequirementsChangeSet: approved.requirementsChangeSet,
  ProjectOverviewChangeSetDraft: approved.projectOverviewChangeSet,
  "Candidate ProjectOverview.md": approved.projectOverviewMarkdown,
  NativeSourceBundle: approved.nativeSourceBundle,
  "Terminal checkpoint": approved.terminalCheckpoint,
  "Execution proof": approved.executionProof,
});
if (
  gateCandidateDocument.value.reviewDigest !== approved.gateReview ||
  gateCandidateDocument.value.progressionAllowed !== false ||
  canonicalJsonDigest(gateCandidateDocument.value.exactBindings) !== canonicalJsonDigest(expectedBindings)
) {
  throw new Error("RP-001 RequirementsGate candidate bindings or pre-approval status changed.");
}
if (
  closureAssessmentDocument.value.outcome !== "closed" ||
  closureAssessmentDocument.value.weightedCoverage < 0.99 ||
  closureAssessmentDocument.value.blockingUnknowns.length !== 0 ||
  closureAssessmentDocument.value.unresolvedContradictions.length !== 0
) {
  throw new Error("RP-001 requirements closure is not promotable.");
}

const bytesByArtifactId = new Map();
const add = (artifactId, bytes) => bytesByArtifactId.set(artifactId, Buffer.from(bytes));
add(invocationDocument.value.inputs.goal[0].artifactId, await readFile(new URL("goal.json", dogfood)));
add(invocationDocument.value.inputs["project-context"][0].artifactId, await readFile(new URL("project-context.json", dogfood)));
add(invocationDocument.value.inputs["repository-snapshot"][0].artifactId, repositorySnapshotDocument.bytes);
add(invocationDocument.value.inputs["requirements-baseline"][0].artifactId, previousRequirementsDocument.bytes);
add(invocationDocument.value.inputs["project-overview-baseline"][0].artifactId, previousOverviewDocument.bytes);
add(previousOverviewDocument.value.renderedDocument.artifact.artifactId, previousOverviewMarkdownBytes);
add(resultDocument.value.outputs["requirements-change-set"][0].artifactId, changeSetDocument.bytes);
add(resultDocument.value.outputs["project-overview-change-set-draft"][0].artifactId, overviewChangeDocument.bytes);
add(resultDocument.value.outputs["native-source-bundle"][0].artifactId, nativeBundleDocument.bytes);
add(overviewChangeDocument.value.renderedDocument.artifact.artifactId, candidateOverviewMarkdownBytes);
for (const source of nativeBundleDocument.value.sources) {
  const relativePath = source.path.replace("dogfood/rp-001-release-preparation/", "");
  add(source.artifact.artifactId, await readFile(new URL(relativePath, dogfood)));
}

let adapterCalls = 0;
const registry = createModuleRegistry({
  modules: [moduleDefinition.value],
  plugins: [{
    definition: pluginDefinition.value,
    adapter: { async invoke() { adapterCalls += 1; throw new Error("Gate replay must not invoke the adapter."); } },
  }],
  artifactContracts: requirementsRuntimeArtifactContracts(),
});
const artifactStore = Object.freeze({
  async load(ref) {
    const bytes = bytesByArtifactId.get(ref.artifactId);
    if (bytes === undefined) throw new Error(`Missing promotion artifact ${ref.artifactId}.`);
    return Buffer.from(bytes);
  },
});
const checkpointStore = Object.freeze({
  async get(key) { return key === checkpointDocument.value.checkpointKey ? checkpointDocument.value.checkpoint : undefined; },
  async put() { throw new Error("Gate replay must not mutate the checkpoint."); },
});
const replayed = await registry.execute(invocationDocument.value, { artifacts: artifactStore, checkpoints: checkpointStore });
if (canonicalJsonDigest(replayed) !== canonicalJsonDigest(resultDocument.value)) throw new Error("Checkpoint replay changed the approved ModuleResult.");
const checkpointReplay = await registry.verifyCheckpointedExecution(invocationDocument.value, { artifacts: artifactStore, checkpoints: checkpointStore });
if (adapterCalls !== 0) throw new Error("RequirementsGate replay invoked the adapter.");

const approval = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGateApproval",
  approvalId: "requirements-gate-approval-rp-001-release-preparation-v1",
  authority: "project-owner",
  decision: "approve",
  source: {
    channel: "chat",
    statement: "Approve all; standing approval applies to routine in-scope lifecycle gates after exact validation.",
  },
  approvedCandidate: approved,
  authorizedActions: ["atomic-requirements-project-overview-promotion", "progress-to-architecture-design"],
  modificationPolicy: "Any artifact or checkpoint modification requires a newly validated candidate under the standing approval policy.",
});
const approvalBytes = jsonBytes(approval);
const approvalRef = Object.freeze({ artifactId: approval.approvalId, digest: sha256Digest(approvalBytes) });
const previousRequirementsRef = invocationDocument.value.inputs["requirements-baseline"][0];
const previousOverviewRef = invocationDocument.value.inputs["project-overview-baseline"][0];
const requirementsChangeRef = resultDocument.value.outputs["requirements-change-set"][0];
const overviewChangeRef = resultDocument.value.outputs["project-overview-change-set-draft"][0];

const requirementsBaseline = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsBaseline",
  baselineId: "requirements-baseline-devrelay-v1-rp-001-release-preparation-001",
  version: "2.4.0",
  approvedCandidate: pointer(requirementsChangeRef),
  supersedes: pointer(previousRequirementsRef),
  requirements: changeSetDocument.value.replacement,
  approvalEvidence: [pointer(approvalRef)],
});
const requirementsBaselineBytes = jsonBytes(requirementsBaseline);
const requirementsBaselineRef = fullRef(
  { artifactId: requirementsBaseline.baselineId, digest: sha256Digest(requirementsBaselineBytes) },
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
  "file:///C:/repos/DevRelay/project/requirements-baseline.json",
);
const projectOverviewBaseline = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewBaseline",
  baselineId: "project-overview-baseline-devrelay-v1-rp-001-release-preparation-001",
  version: "2.4.0",
  approvedOverviewCandidate: pointer(overviewChangeRef),
  supersedes: pointer(previousOverviewRef),
  requirementsBaseline: pointer(requirementsBaselineRef),
  projection: overviewChangeDocument.value.projection,
  overview: overviewChangeDocument.value.overview,
  renderedDocument: overviewChangeDocument.value.renderedDocument,
  approvalEvidence: [pointer(approvalRef)],
});
const projectOverviewBaselineBytes = jsonBytes(projectOverviewBaseline);
const projectOverviewBaselineRef = fullRef(
  { artifactId: projectOverviewBaseline.baselineId, digest: sha256Digest(projectOverviewBaselineBytes) },
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
  "file:///C:/repos/DevRelay/project/project-overview-baseline.json",
);

const promotion = validateRequirementsGatePromotion({
  checkpointReplay,
  requirementsBaseline,
  requirementsBaselineRef,
  requirementsBaselineBytes,
  projectOverviewBaseline,
  projectOverviewBaselineRef,
  projectOverviewBaselineBytes,
  projectOverviewMarkdownBytes: candidateOverviewMarkdownBytes,
});
if (
  Buffer.from(promotion.commitPayload.requirementsBaseline.bytesBase64, "base64").compare(requirementsBaselineBytes) !== 0 ||
  Buffer.from(promotion.commitPayload.projectOverviewBaseline.bytesBase64, "base64").compare(projectOverviewBaselineBytes) !== 0
) {
  throw new Error("Gate commit payload does not match the promoted pair bytes.");
}

await mkdir(new URL("history/2.3.0/", project), { recursive: true });
await Promise.all([
  writeFile(new URL("history/2.3.0/requirements-baseline.json", project), previousRequirementsDocument.bytes),
  writeFile(new URL("history/2.3.0/project-overview-baseline.json", project), previousOverviewDocument.bytes),
  writeFile(new URL("history/2.3.0/ProjectOverview.md", project), previousOverviewMarkdownBytes),
  writeFile(new URL("requirements-gate-owner-approval.json", dogfood), approvalBytes),
]);
const pendingPromotion = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsPairPromotionJournal",
  promotionId: "requirements-promotion-rp-001-release-preparation-v1",
  state: "prepared",
  previous: { requirementsBaseline: pointer(previousRequirementsRef), projectOverviewBaseline: pointer(previousOverviewRef) },
  next: {
    requirementsBaseline: pointer(requirementsBaselineRef),
    projectOverviewBaseline: pointer(projectOverviewBaselineRef),
    projectOverviewMarkdown: pointer(overviewChangeDocument.value.renderedDocument.artifact),
  },
  approval: pointer(approvalRef),
});
await writeFile(new URL("requirements-promotion.pending.json", project), jsonBytes(pendingPromotion));
await Promise.all([
  writeFile(new URL("requirements-baseline.json", project), requirementsBaselineBytes),
  writeFile(new URL("project-overview-baseline.json", project), projectOverviewBaselineBytes),
  writeFile(new URL("ProjectOverview.md", root), candidateOverviewMarkdownBytes),
]);

const approvalText =
  "# DevRelay RP-001 ReleasePreparation and ReleaseVerification Requirements Gate approval\n\n" +
  "Status: **pass**\n\n" +
  "The standing owner approval was applied after exact candidate, checkpoint replay, closure, and atomic pair validation.\n\n" +
  `- RequirementsGateCandidate: ${approved.gateCandidate}\n` +
  `- RequirementsChangeSet: ${approved.requirementsChangeSet}\n` +
  `- ProjectOverviewChangeSetDraft: ${approved.projectOverviewChangeSet}\n` +
  `- Candidate ProjectOverview.md: ${approved.projectOverviewMarkdown}\n` +
  `- RequirementsClosureAssessment: ${approved.requirementsClosureAssessment}\n` +
  `- Terminal checkpoint: ${approved.terminalCheckpoint}\n` +
  `- Approval artifact: ${approvalRef.digest}\n`;
await writeFile(new URL("requirements-gate-rp-001-release-preparation-v1.md", project), Buffer.from(approvalText.normalize("NFC"), "utf8"));

const promotionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGatePromotionProof",
  proofId: "requirements-promotion-rp-001-release-preparation-v1",
  status: "pass",
  approvedDigests: approved,
  replay: { adapterCallCount: adapterCalls, checkpointDigest: approved.terminalCheckpoint, moduleResultDigest: sha256Digest(resultDocument.bytes) },
  previous: pendingPromotion.previous,
  promoted: pendingPromotion.next,
  approvalEvidence: pointer(approvalRef),
  commitPayloadDigest: canonicalJsonDigest(promotion.commitPayload),
  architectureProgressionAllowed: true,
});
const promotionProofBytes = jsonBytes(promotionProof);
await writeFile(new URL("requirements-gate-promotion-proof.json", dogfood), promotionProofBytes);
const committedPromotion = Object.freeze({
  ...pendingPromotion,
  state: "committed",
  proof: { artifactId: promotionProof.proofId, digest: sha256Digest(promotionProofBytes) },
});
await Promise.all([
  writeFile(new URL("requirements-promotion.commit.json", project), jsonBytes(committedPromotion)),
  writeFile(new URL("requirements-promotion.pending.json", project), jsonBytes(committedPromotion)),
]);

process.stdout.write(`${JSON.stringify({
  gateStatus: "pass",
  adapterCalls,
  requirementsBaselineDigest: requirementsBaselineRef.digest,
  projectOverviewBaselineDigest: projectOverviewBaselineRef.digest,
  projectOverviewMarkdownDigest: approved.projectOverviewMarkdown,
  approvalDigest: approvalRef.digest,
  promotionProofDigest: sha256Digest(promotionProofBytes),
  architectureProgressionAllowed: true,
}, null, 2)}\n`);

