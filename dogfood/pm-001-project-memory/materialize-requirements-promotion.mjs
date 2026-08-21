import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { validateRequirementsGatePromotion } from "../../src/requirements-gate.mjs";

const root = new URL("../../", import.meta.url);
const dogfood = new URL("./", import.meta.url);
const project = new URL("../../project/", import.meta.url);

const APPROVED = Object.freeze({
  gateCandidate: "sha256:4545d004b008dac2b7f8edcdb5e201cd869a85aaa0ab0975fc5760d253a3f90c",
  requirementsBaseline: "sha256:c2420bde2e483dbd9e38509cae3eefa69b8f1c8032554a505e90b1dd087b33eb",
  projectOverviewBaseline: "sha256:9e1d862557194706eab075f677ea9c95b0cc153b6af4ca1423774aabbbf820c9",
  repositorySnapshot: "sha256:544787b3fa91b8c7b38594b1d0c7effc9feb2b4494dd1f63b6a93d58c0efe903",
  ownerDecisions: "sha256:dafac3641bde8f0fa427c450a05aa9e763bf6811db489edc8d14170fd5d531de",
  requirementsClosureAssessment: "sha256:65d6390c8532388587cbde71002a65fa1d2c909eec8e3ce16375591b1247ec44",
  requirementsChangeSet: "sha256:2508f336c7119948f3b0a731195082bd8526181dd3865119606a83de826b319f",
  projectOverviewChangeSet: "sha256:168d0709d451f706e0398c2ca28e3980c2986b03e6a7c3155c40b3f30bc073e1",
  projectOverviewMarkdown: "sha256:c0923de2f498c711d8e31d627dcbad9786c387ebc8de98451173dddc53aefd40",
  nativeSourceBundle: "sha256:a4b13b519944618c109c3f28044e5b37ad5355ca312b9c98bb89f47cf4fbcb33",
  terminalCheckpoint: "sha256:9a52db68f9cf4790bb58e24acf0fc0bd3d2098d3b266a5fd5dcf55871dc55728",
  executionProof: "sha256:d5b2960958088278892d641bb3cd05bac4a22bf5661295b41c50609987a4f73a",
  gateReview: "sha256:cc4540203a4159ec3ca2f21308d20ef88a6d3e51f69af724ab684463156836a7",
});

const TYPES = Object.freeze({
  requirementsBaseline: Object.freeze([
    "https://devrelay.dev/artifacts/requirements-baseline/v1",
    "application/vnd.devrelay.requirements-baseline+json",
  ]),
  projectOverviewBaseline: Object.freeze([
    "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    "application/vnd.devrelay.project-overview-baseline+json",
  ]),
});

const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const pointer = (ref) => Object.freeze({ artifactId: ref.artifactId, digest: ref.digest });

function assertDigest(label, bytes, expected) {
  const actual = sha256Digest(bytes);
  if (actual !== expected) throw new Error(`${label} digest ${actual} does not match approval ${expected}.`);
}

async function readJson(url) {
  const bytes = await readFile(url);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function fullRef(pointerValue, schema, mediaType, uri) {
  return Object.freeze({ ...pointerValue, schema, mediaType, uri });
}

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
  ownerDecisionsBytes,
  closureAssessmentDocument,
  executionProofDocument,
  gateReviewBytes,
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
  readFile(new URL("owner-decisions.md", dogfood)),
  readJson(new URL("requirements-closure-assessment.json", dogfood)),
  readJson(new URL("requirements-gathering.execution-proof.json", dogfood)),
  readFile(new URL("requirements-gate-review.md", dogfood)),
  readJson(new URL("requirements-baseline.json", project)),
  readJson(new URL("project-overview-baseline.json", project)),
]);
const candidateOverviewMarkdownBytes = await readFile(new URL("candidate/ProjectOverview.md", dogfood));
const previousOverviewMarkdownBytes = await readFile(new URL("../../ProjectOverview.md", dogfood));

for (const [label, bytes, digest] of [
  ["RequirementsGateCandidate", gateCandidateDocument.bytes, APPROVED.gateCandidate],
  ["RequirementsBaseline", previousRequirementsDocument.bytes, APPROVED.requirementsBaseline],
  ["ProjectOverviewBaseline", previousOverviewDocument.bytes, APPROVED.projectOverviewBaseline],
  ["RepositorySnapshot", repositorySnapshotDocument.bytes, APPROVED.repositorySnapshot],
  ["OwnerDecisions", ownerDecisionsBytes, APPROVED.ownerDecisions],
  ["RequirementsClosureAssessment", closureAssessmentDocument.bytes, APPROVED.requirementsClosureAssessment],
  ["RequirementsChangeSet", changeSetDocument.bytes, APPROVED.requirementsChangeSet],
  ["ProjectOverviewChangeSetDraft", overviewChangeDocument.bytes, APPROVED.projectOverviewChangeSet],
  ["Candidate ProjectOverview.md", candidateOverviewMarkdownBytes, APPROVED.projectOverviewMarkdown],
  ["NativeSourceBundle", nativeBundleDocument.bytes, APPROVED.nativeSourceBundle],
  ["Terminal checkpoint", checkpointDocument.bytes, APPROVED.terminalCheckpoint],
  ["Execution proof", executionProofDocument.bytes, APPROVED.executionProof],
  ["Gate review", gateReviewBytes, APPROVED.gateReview],
]) assertDigest(label, bytes, digest);

if (gateCandidateDocument.value.reviewDigest !== APPROVED.gateReview || gateCandidateDocument.value.progressionAllowed !== false) {
  throw new Error("RequirementsGate candidate review binding or status changed.");
}
const expectedBindings = Object.freeze({
  RequirementsBaseline: APPROVED.requirementsBaseline,
  ProjectOverviewBaseline: APPROVED.projectOverviewBaseline,
  RepositorySnapshot: APPROVED.repositorySnapshot,
  OwnerDecisions: APPROVED.ownerDecisions,
  RequirementsClosureAssessment: APPROVED.requirementsClosureAssessment,
  RequirementsChangeSet: APPROVED.requirementsChangeSet,
  ProjectOverviewChangeSetDraft: APPROVED.projectOverviewChangeSet,
  "Candidate ProjectOverview.md": APPROVED.projectOverviewMarkdown,
  NativeSourceBundle: APPROVED.nativeSourceBundle,
  "Terminal checkpoint": APPROVED.terminalCheckpoint,
  "Execution proof": APPROVED.executionProof,
});
if (canonicalJsonDigest(gateCandidateDocument.value.exactBindings) !== canonicalJsonDigest(expectedBindings)) {
  throw new Error("RequirementsGate candidate exact bindings changed after approval.");
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
  const relativePath = source.path.replace("dogfood/pm-001-project-memory/", "");
  add(source.artifact.artifactId, await readFile(new URL(relativePath, dogfood)));
}

let adapterCalls = 0;
const registry = createModuleRegistry({
  modules: [moduleDefinition.value],
  plugins: [{
    definition: pluginDefinition.value,
    adapter: { async invoke() { adapterCalls += 1; throw new Error("gate promotion must replay without adapter invocation"); } },
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
  async put() { throw new Error("gate promotion must not mutate the terminal checkpoint"); },
});
const replayed = await registry.execute(invocationDocument.value, { artifacts: artifactStore, checkpoints: checkpointStore });
if (canonicalJsonDigest(replayed) !== canonicalJsonDigest(resultDocument.value)) throw new Error("Checkpoint replay does not match the approved ModuleResult.");
const checkpointReplay = await registry.verifyCheckpointedExecution(invocationDocument.value, { artifacts: artifactStore, checkpoints: checkpointStore });
if (adapterCalls !== 0) throw new Error("RequirementsGate replay invoked the adapter.");

const approval = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGateApproval",
  approvalId: "requirements-gate-approval-pm-001-project-memory-v1",
  authority: "project-owner",
  decision: "approve",
  source: { channel: "chat", statement: "approve" },
  approvedCandidate: { ...APPROVED },
  authorizedActions: ["atomic-requirements-project-overview-promotion", "progress-to-architecture-design"],
  modificationPolicy: "Any artifact or checkpoint modification requires a new Gate candidate and owner approval.",
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
  baselineId: "requirements-baseline-devrelay-v1-pm-001-project-memory-001",
  version: "2.2.0",
  approvedCandidate: pointer(requirementsChangeRef),
  supersedes: pointer(previousRequirementsRef),
  requirements: changeSetDocument.value.replacement,
  approvalEvidence: [pointer(approvalRef)],
});
const requirementsBaselineBytes = jsonBytes(requirementsBaseline);
const requirementsBaselineRef = fullRef(
  { artifactId: requirementsBaseline.baselineId, digest: sha256Digest(requirementsBaselineBytes) },
  TYPES.requirementsBaseline[0], TYPES.requirementsBaseline[1], "file:///C:/repos/DevRelay/project/requirements-baseline.json",
);
const projectOverviewBaseline = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewBaseline",
  baselineId: "project-overview-baseline-devrelay-v1-pm-001-project-memory-001",
  version: "2.2.0",
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
  TYPES.projectOverviewBaseline[0], TYPES.projectOverviewBaseline[1], "file:///C:/repos/DevRelay/project/project-overview-baseline.json",
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
) throw new Error("Gate commit payload does not match the promoted pair bytes.");

await mkdir(new URL("history/2.1.0/", project), { recursive: true });
await Promise.all([
  writeFile(new URL("history/2.1.0/requirements-baseline.json", project), previousRequirementsDocument.bytes),
  writeFile(new URL("history/2.1.0/project-overview-baseline.json", project), previousOverviewDocument.bytes),
  writeFile(new URL("history/2.1.0/ProjectOverview.md", project), previousOverviewMarkdownBytes),
]);
await writeFile(new URL("requirements-gate-owner-approval.json", dogfood), approvalBytes);
const pendingPromotion = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsPairPromotionJournal",
  promotionId: "requirements-promotion-pm-001-project-memory-v1",
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
  "# DevRelay PM-001 ProjectMemory Requirements Gate approval\n\n" +
  "Status: **pass**\n\n" +
  "The project owner approved the exact PM-001 candidate, atomic requirements/ProjectOverview promotion, and ArchitectureDesign progression.\n\n" +
  `- RequirementsGateCandidate: ${APPROVED.gateCandidate}\n` +
  `- RequirementsChangeSet: ${APPROVED.requirementsChangeSet}\n` +
  `- ProjectOverviewChangeSetDraft: ${APPROVED.projectOverviewChangeSet}\n` +
  `- Candidate ProjectOverview.md: ${APPROVED.projectOverviewMarkdown}\n` +
  `- RequirementsClosureAssessment: ${APPROVED.requirementsClosureAssessment}\n` +
  `- Terminal checkpoint: ${APPROVED.terminalCheckpoint}\n` +
  `- Approval artifact: ${approvalRef.digest}\n`;
await writeFile(new URL("requirements-gate-pm-001-project-memory-v1.md", project), Buffer.from(approvalText.normalize("NFC"), "utf8"));

const promotionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGatePromotionProof",
  proofId: "requirements-promotion-pm-001-project-memory-v1",
  status: "pass",
  approvedDigests: APPROVED,
  replay: { adapterCallCount: adapterCalls, checkpointDigest: APPROVED.terminalCheckpoint, moduleResultDigest: sha256Digest(resultDocument.bytes) },
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
await writeFile(new URL("requirements-promotion.commit.json", project), jsonBytes(committedPromotion));
await writeFile(new URL("requirements-promotion.pending.json", project), jsonBytes(committedPromotion));

process.stdout.write(`${JSON.stringify({
  gateStatus: "pass",
  adapterCalls,
  requirementsBaselineDigest: requirementsBaselineRef.digest,
  projectOverviewBaselineDigest: projectOverviewBaselineRef.digest,
  projectOverviewMarkdownDigest: APPROVED.projectOverviewMarkdown,
  approvalDigest: approvalRef.digest,
  promotionProofDigest: sha256Digest(promotionProofBytes),
  architectureProgressionAllowed: true,
}, null, 2)}\n`);
