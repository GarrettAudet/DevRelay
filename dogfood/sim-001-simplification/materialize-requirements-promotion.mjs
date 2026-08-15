import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { validateRequirementsGatePromotion } from "../../src/requirements-gate.mjs";

const root = new URL("../../", import.meta.url);
const dogfood = new URL("./", import.meta.url);
const project = new URL("../../project/", import.meta.url);

const APPROVED = Object.freeze({
  gateCandidate: "sha256:fd8aab6a43471afff38b0ea3c258721a249b87c7c87aba27d52533fe6134e431",
  requirementsBaseline: "sha256:8f586e039e70f614ccfbf9190cf8f712b2f158529fd0c1f530fa09e72b23eb32",
  projectOverviewBaseline: "sha256:59192795eeb773025158c16a21bc939f86b7113455974d61e5c5a31a5e8a4ffb",
  clarificationRequest: "sha256:c53019b4316839193d253da7af27ce04f3a1ca1532039d3ab2734c482cbdd782",
  clarificationResponse: "sha256:4f9e5336d77925f9f72928cedf7a3ed09d7de2f1dce70f792271688aa1c98ba2",
  requirementsClosureAssessment: "sha256:da1b83a44883ddf5a82e7d9c06f88d1ccf081e5e0c0d795d01a9812684ddcedb",
  continuation: "sha256:348a3f45bdd3de069ebe662021a9dc050bd3fcaf15f523b88d291afe29a58817",
  repositorySnapshot: "sha256:d683f78299576e36b4c57bd1f40b883f17abee07698f0920bcca013be9de97ca",
  requirementsChangeSet: "sha256:64e21a67be6df9451c12fd26336e8e3bfcef276928ff23437553622ae0f1d412",
  projectOverviewChangeSet: "sha256:9e42de9413063ff3fb6d0922fc1e7fe475516d6e21ae2f47e7cdf99532f750f8",
  projectOverviewMarkdown: "sha256:af7e523e23d22bfec31bf383d894c9510620a190888d2bc4560f6523c7d4fb74",
  nativeSourceBundle: "sha256:b53a5badb0fa9eb7c569b48def40f90b1562a05df92f304f33cefe9170e651c8",
  terminalCheckpoint: "sha256:624c3b0ec6b1cffd5789f80f99ba89eb86d158ccba4737cfd2e6aa6ee5fb0cdc",
  executionProof: "sha256:729ab49883f62f4d1b2f8a4e228e2ecbcc34a80bcba7956764792a69ecbf3ede",
  gateReview: "sha256:da9bc2bdd85ca415e0ebd494c05ddb5260222652b81c0b36f1f7d466458043bb"
});

const LINEAGE = Object.freeze({
  clarificationCheckpoint: "sha256:a69c072b3532785251a5826420fa3a5f7bfb5b59f000f93159fe246d9198e72b"
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

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pointer(ref) {
  return Object.freeze({ artifactId: ref.artifactId, digest: ref.digest });
}

function assertDigest(label, bytes, expected) {
  const actual = sha256Digest(bytes);
  if (actual !== expected) {
    throw new Error(`${label} digest ${actual} does not match approval ${expected}.`);
  }
}

async function readPreferredBytes(historyUrl, currentUrl) {
  try {
    return await readFile(historyUrl);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return readFile(currentUrl);
  }
}

async function readPreferredJson(historyUrl, currentUrl) {
  const bytes = await readPreferredBytes(historyUrl, currentUrl);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

async function readJson(url) {
  const bytes = await readFile(url);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function fullRef(pointerValue, schema, mediaType, uri) {
  return Object.freeze({
    artifactId: pointerValue.artifactId,
    schema,
    mediaType,
    digest: pointerValue.digest,
    uri,
  });
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
  clarificationRequestDocument,
  clarificationResponseDocument,
  continuationDocument,
  executionProofDocument,
  clarificationCheckpointDocument,
  previousRequirementsDocument,
  previousOverviewDocument,
] = await Promise.all([
  readJson(new URL("examples/modules/requirements-gathering.module.json", root)),
  readJson(new URL("examples/plugins/openspec.plugin.json", root)),
  readJson(new URL("requirements-change.invocation.json", dogfood)),
  readJson(new URL("requirements-change.result.json", dogfood)),
  readJson(new URL("requirements-change.checkpoint.json", dogfood)),
  readJson(new URL("requirements-change-set.json", dogfood)),
  readJson(new URL("project-overview-change-set-draft.json", dogfood)),
  readJson(new URL("native-source-bundle.json", dogfood)),
  readJson(new URL("requirements-gate-candidate.json", dogfood)),
  readJson(new URL("clarification-request.json", dogfood)),
  readJson(new URL("clarification-response.json", dogfood)),
  readJson(new URL("requirements-continuation.json", dogfood)),
  readJson(new URL("requirements-change.execution-proof.json", dogfood)),
  readJson(new URL("requirements-gathering.checkpoint.json", dogfood)),
  readPreferredJson(
    new URL("history/1.9.0/requirements-baseline.json", project),
    new URL("requirements-baseline.json", project),
  ),
  readPreferredJson(
    new URL("history/1.9.0/project-overview-baseline.json", project),
    new URL("project-overview-baseline.json", project),
  ),
]);
const closureAssessmentDocument = await readJson(new URL("docs/specs/sim-001-simplification/requirements-closure-assessment.json", root));
const repositorySnapshotDocument = await readJson(new URL("repository-snapshot.json", dogfood));
const candidateOverviewMarkdownBytes = await readFile(
  new URL("candidate/ProjectOverview.md", dogfood),
);
const previousOverviewMarkdownBytes = await readPreferredBytes(
  new URL("history/1.9.0/ProjectOverview.md", project),
  new URL("../ProjectOverview.md", project),
);

for (const [label, document, digest] of [
  ["RequirementsGateCandidate", gateCandidateDocument, APPROVED.gateCandidate],
  ["RequirementsBaseline", previousRequirementsDocument, APPROVED.requirementsBaseline],
  ["ProjectOverviewBaseline", previousOverviewDocument, APPROVED.projectOverviewBaseline],
  ["ClarificationRequest", clarificationRequestDocument, APPROVED.clarificationRequest],
  ["ClarificationResponse", clarificationResponseDocument, APPROVED.clarificationResponse],
  ["RequirementsClosureAssessment", closureAssessmentDocument, APPROVED.requirementsClosureAssessment],
  ["Continuation", continuationDocument, APPROVED.continuation],
  ["RepositorySnapshot", repositorySnapshotDocument, APPROVED.repositorySnapshot],
  ["RequirementsChangeSet", changeSetDocument, APPROVED.requirementsChangeSet],
  ["ProjectOverviewChangeSetDraft", overviewChangeDocument, APPROVED.projectOverviewChangeSet],
  ["NativeSourceBundle", nativeBundleDocument, APPROVED.nativeSourceBundle],
  ["Terminal checkpoint", checkpointDocument, APPROVED.terminalCheckpoint],
  ["Execution proof", executionProofDocument, APPROVED.executionProof],
  [
    "Clarification source checkpoint",
    clarificationCheckpointDocument,
    LINEAGE.clarificationCheckpoint,
  ],
]) {
  assertDigest(label, document.bytes, digest);
}
assertDigest(
  "candidate ProjectOverview.md",
  candidateOverviewMarkdownBytes,
  APPROVED.projectOverviewMarkdown,
);
if (
  gateCandidateDocument.value.reviewDigest !== APPROVED.gateReview ||
  gateCandidateDocument.value.progressionAllowed !== false
) {
  throw new Error("RequirementsGate candidate review binding or status changed.");
}
const expectedBindings = Object.freeze({
  RequirementsBaseline: APPROVED.requirementsBaseline,
  ProjectOverviewBaseline: APPROVED.projectOverviewBaseline,
  ClarificationRequest: APPROVED.clarificationRequest,
  ClarificationResponse: APPROVED.clarificationResponse,
  RequirementsClosureAssessment: APPROVED.requirementsClosureAssessment,
  Continuation: APPROVED.continuation,
  RepositorySnapshot: APPROVED.repositorySnapshot,
  RequirementsChangeSet: APPROVED.requirementsChangeSet,
  ProjectOverviewChangeSetDraft: APPROVED.projectOverviewChangeSet,
  "Candidate ProjectOverview.md": APPROVED.projectOverviewMarkdown,
  NativeSourceBundle: APPROVED.nativeSourceBundle,
  "Terminal checkpoint": APPROVED.terminalCheckpoint,
  "Execution proof": APPROVED.executionProof,
});
if (
  canonicalJsonDigest(gateCandidateDocument.value.exactBindings) !==
  canonicalJsonDigest(expectedBindings)
) {
  throw new Error("RequirementsGate candidate exact bindings changed after approval.");
}

const bytesByArtifactId = new Map();
const add = (artifactId, bytes) => bytesByArtifactId.set(artifactId, Buffer.from(bytes));
add(invocationDocument.value.inputs.goal[0].artifactId, await readFile(new URL("goal.json", dogfood)));
add(
  invocationDocument.value.inputs["project-context"][0].artifactId,
  await readFile(new URL("project-context.json", dogfood)),
);
add(invocationDocument.value.inputs["repository-snapshot"][0].artifactId, repositorySnapshotDocument.bytes);
add(invocationDocument.value.inputs["requirements-baseline"][0].artifactId, previousRequirementsDocument.bytes);
add(invocationDocument.value.inputs["project-overview-baseline"][0].artifactId, previousOverviewDocument.bytes);
add(previousOverviewDocument.value.renderedDocument.artifact.artifactId, previousOverviewMarkdownBytes);
add(invocationDocument.value.inputs["clarification-request"][0].artifactId, clarificationRequestDocument.bytes);
add(invocationDocument.value.inputs.continuation[0].artifactId, continuationDocument.bytes);
add(
  invocationDocument.value.inputs["clarification-responses"][0].artifactId,
  clarificationResponseDocument.bytes,
);
add(resultDocument.value.outputs["requirements-change-set"][0].artifactId, changeSetDocument.bytes);
add(
  resultDocument.value.outputs["project-overview-change-set-draft"][0].artifactId,
  overviewChangeDocument.bytes,
);
add(resultDocument.value.outputs["native-source-bundle"][0].artifactId, nativeBundleDocument.bytes);
add(overviewChangeDocument.value.renderedDocument.artifact.artifactId, candidateOverviewMarkdownBytes);
for (const source of nativeBundleDocument.value.sources) {
  const relativePath = source.path.replace("dogfood/sim-001-simplification/", "");
  add(source.artifact.artifactId, await readFile(new URL(relativePath, dogfood)));
}

let adapterCalls = 0;
const registry = createModuleRegistry({
  modules: [moduleDefinition.value],
  plugins: [
    {
      definition: pluginDefinition.value,
      adapter: {
        async invoke() {
          adapterCalls += 1;
          throw new Error("gate promotion must replay without adapter invocation");
        },
      },
    },
  ],
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
  async get(key) {
    if (key === checkpointDocument.value.checkpointKey) {
      return checkpointDocument.value.checkpoint;
    }
    if (key === clarificationCheckpointDocument.value.checkpointKey) {
      return clarificationCheckpointDocument.value.checkpoint;
    }
    return undefined;
  },
  async put() {
    throw new Error("gate promotion must not mutate the terminal checkpoint");
  },
});
const replayed = await registry.execute(invocationDocument.value, {
  artifacts: artifactStore,
  checkpoints: checkpointStore,
});
if (canonicalJsonDigest(replayed) !== canonicalJsonDigest(resultDocument.value)) {
  throw new Error("Checkpoint replay does not match the approved ModuleResult.");
}
const checkpointReplay = await registry.verifyCheckpointedExecution(invocationDocument.value, {
  artifacts: artifactStore,
  checkpoints: checkpointStore,
});
if (adapterCalls !== 0) throw new Error("RequirementsGate replay invoked the adapter.");

const approval = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGateApproval",
  approvalId: "requirements-gate-approval-sim-001-simplification-v1",
  authority: "project-owner",
  decision: "approve",
  source: { channel: "chat", statement: "i approve" },
  approvedCandidate: { ...APPROVED },
  requiredLineageEvidence: { ...LINEAGE },
  authorizedActions: [
    "atomic-requirements-project-overview-promotion",
    "progress-to-architecture-design",
  ],
  modificationPolicy:
    "Any artifact or checkpoint modification requires a new Gate candidate and owner approval.",
});
const approvalBytes = jsonBytes(approval);
const approvalRef = Object.freeze({
  artifactId: approval.approvalId,
  digest: sha256Digest(approvalBytes),
});
const previousRequirementsRef = invocationDocument.value.inputs["requirements-baseline"][0];
const previousOverviewRef = invocationDocument.value.inputs["project-overview-baseline"][0];
const requirementsChangeRef = resultDocument.value.outputs["requirements-change-set"][0];
const overviewChangeRef = resultDocument.value.outputs["project-overview-change-set-draft"][0];
const requirementsBaseline = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsBaseline",
  baselineId: "requirements-baseline-devrelay-v1-sim-001-simplification-001",
  version: "2.0.0",
  approvedCandidate: pointer(requirementsChangeRef),
  supersedes: pointer(previousRequirementsRef),
  requirements: changeSetDocument.value.replacement,
  approvalEvidence: [pointer(approvalRef)],
});
const requirementsBaselineBytes = jsonBytes(requirementsBaseline);
const requirementsBaselineRef = fullRef(
  { artifactId: requirementsBaseline.baselineId, digest: sha256Digest(requirementsBaselineBytes) },
  TYPES.requirementsBaseline[0],
  TYPES.requirementsBaseline[1],
  "file:///C:/repos/DevRelay/project/requirements-baseline.json",
);
const projectOverviewBaseline = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewBaseline",
  baselineId: "project-overview-baseline-devrelay-v1-sim-001-simplification-001",
  version: "2.0.0",
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
  TYPES.projectOverviewBaseline[0],
  TYPES.projectOverviewBaseline[1],
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
  Buffer.from(promotion.commitPayload.requirementsBaseline.bytesBase64, "base64").compare(
    requirementsBaselineBytes,
  ) !== 0 ||
  Buffer.from(promotion.commitPayload.projectOverviewBaseline.bytesBase64, "base64").compare(
    projectOverviewBaselineBytes,
  ) !== 0
) {
  throw new Error("Gate commit payload does not match the promoted pair bytes.");
}

await mkdir(new URL("history/1.9.0/", project), { recursive: true });
await Promise.all([
  writeFile(new URL("history/1.9.0/requirements-baseline.json", project), previousRequirementsDocument.bytes),
  writeFile(new URL("history/1.9.0/project-overview-baseline.json", project), previousOverviewDocument.bytes),
  writeFile(new URL("history/1.9.0/ProjectOverview.md", project), previousOverviewMarkdownBytes),
]);

await writeFile(new URL("requirements-gate-owner-approval.json", dogfood), approvalBytes);
const pendingPromotion = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsPairPromotionJournal",
  promotionId: "requirements-promotion-sim-001-simplification-v1",
  state: "prepared",
  previous: {
    requirementsBaseline: pointer(previousRequirementsRef),
    projectOverviewBaseline: pointer(previousOverviewRef),
  },
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
  "# DevRelay SIM-001 simplification Requirements Gate approval\n\n" +
  "Status: **pass**\n\n" +
  "The project owner approved the exact SIM-001 candidate, atomic requirements/ProjectOverview promotion, trusted traceability contribution, ArchitectureDiscovery, and ArchitectureDesign progression for the exact digest-bound candidate recorded in requirements-gate-owner-approval.json.\n\n" +
  `- RequirementsGateCandidate: ${APPROVED.gateCandidate}\n` +
  `- RequirementsChangeSet: ${APPROVED.requirementsChangeSet}\n` +
  `- ProjectOverviewChangeSetDraft: ${APPROVED.projectOverviewChangeSet}\n` +
  `- Candidate ProjectOverview.md: ${APPROVED.projectOverviewMarkdown}\n` +
  `- RequirementsClosureAssessment: ${APPROVED.requirementsClosureAssessment}\n` +
  `- Terminal checkpoint: ${APPROVED.terminalCheckpoint}\n` +
  `- Approval artifact: ${approvalRef.digest}\n`;
await writeFile(
  new URL("requirements-gate-sim-001-simplification-v1.md", project),
  Buffer.from(approvalText.normalize("NFC"), "utf8"),
);

const promotionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGatePromotionProof",
  proofId: "requirements-promotion-sim-001-simplification-v1",
  status: "pass",
  approvedDigests: APPROVED,
  lineageDigests: LINEAGE,
  replay: {
    adapterCallCount: adapterCalls,
    checkpointDigest: APPROVED.terminalCheckpoint,
    moduleResultDigest: sha256Digest(resultDocument.bytes),
  },
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

process.stdout.write(
  `${JSON.stringify(
    {
      gateStatus: "pass",
      adapterCalls,
      requirementsBaselineDigest: requirementsBaselineRef.digest,
      projectOverviewBaselineDigest: projectOverviewBaselineRef.digest,
      projectOverviewMarkdownDigest: APPROVED.projectOverviewMarkdown,
      approvalDigest: approvalRef.digest,
      promotionProofDigest: sha256Digest(promotionProofBytes),
      architectureProgressionAllowed: true,
    },
    null,
    2,
  )}\n`,
);
