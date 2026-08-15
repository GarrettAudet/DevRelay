import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { validateRequirementsGatePromotion } from "../../src/requirements-gate.mjs";

const root = new URL("../../", import.meta.url);
const dogfood = new URL("./", import.meta.url);
const project = new URL("../../project/", import.meta.url);

const APPROVED = Object.freeze({
  gateCandidate: "sha256:2016b564c567e8c2b2955202548bfd27fb5b8bb07780acce5e12f5b7323ff547",
  requirementsBaseline: "sha256:d6bf55b38cbe96d4c1fdca87d0ed07e2697a7a90e5ab33bb7c27098f88229de5",
  projectOverviewBaseline: "sha256:17fc515e1da2ed916692e87e73567ab18289eeb00b2dd4faecc7372e875bfa00",
  clarificationRequest: "sha256:007976edb3590812062b8696f05e2d71a2e5077ef0f1c53d23a67576799f6af4",
  clarificationResponse: "sha256:33ebbb007de3a6680c26789318249df1e4de4ac537b68bae14528dbebdb7ad47",
  requirementsClosureAssessment: "sha256:6ff38d6117883d8041c901a774a75940dfceb568bb14a081390353d3e65f098d",
  continuation: "sha256:ecdbceddd433cafc86a1f33f1d25932e232760af170fabec9f94af380c62fb57",
  repositorySnapshot: "sha256:9ce13359c2c00cd2c84d852fea04c34b7f6b9f0f99c7da6b2c02edc114cbd7db",
  requirementsChangeSet: "sha256:d9e351c3e63fe17b2fe9f81c1c410ce5ac5011b84bd93df6132fced18448d828",
  projectOverviewChangeSet: "sha256:f88747e028bc4326ba657c4fa87e45f18c1356972de1ef15d67cc78f91cc36af",
  projectOverviewMarkdown: "sha256:c843c6f8871d648ed34a30b33e3fd9043014f70601aa18f5b54defa49ed820d6",
  nativeSourceBundle: "sha256:ff5e5b5638e0f0c8d450db56306988e77f087e1bdff8e2804f01612e86f84564",
  terminalCheckpoint: "sha256:ed94fb8de614d5c27e18470ae8b78e381555d416941e502e843d2b8970d3f426",
  executionProof: "sha256:ebe42d33346beec480f5e2e6d6eb4d2d73640c82e9e48d22e5a1154f45de0be8",
  gateReview: "sha256:4e8e8055516ee9875836fa0350cde0861dcde94c3e1330e8330b88a160ad7ad2"
});

const LINEAGE = Object.freeze({
  clarificationCheckpoint: "sha256:e517a80f61340f11b237e0d75a9cf38f2cf582311edc196781ca5fe3746406a6"
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
    new URL("history/2.0.0/requirements-baseline.json", project),
    new URL("requirements-baseline.json", project),
  ),
  readPreferredJson(
    new URL("history/2.0.0/project-overview-baseline.json", project),
    new URL("project-overview-baseline.json", project),
  ),
]);
const closureAssessmentDocument = await readJson(new URL("docs/specs/rm-001-roadmap-management/requirements-closure-assessment.json", root));
const repositorySnapshotDocument = await readJson(new URL("repository-snapshot.json", dogfood));
const candidateOverviewMarkdownBytes = await readFile(
  new URL("candidate/ProjectOverview.md", dogfood),
);
const previousOverviewMarkdownBytes = await readPreferredBytes(
  new URL("history/2.0.0/ProjectOverview.md", project),
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
  const relativePath = source.path.replace("dogfood/rm-001-roadmap-management/", "");
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
  approvalId: "requirements-gate-approval-rm-001-roadmap-management-v1",
  authority: "project-owner",
  decision: "approve",
  source: { channel: "chat", statement: "Yes to all; approve the exact RM-001 candidate" },
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
  baselineId: "requirements-baseline-devrelay-v1-rm-001-roadmap-management-001",
  version: "2.1.0",
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
  baselineId: "project-overview-baseline-devrelay-v1-rm-001-roadmap-management-001",
  version: "2.1.0",
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

await mkdir(new URL("history/2.0.0/", project), { recursive: true });
await Promise.all([
  writeFile(new URL("history/2.0.0/requirements-baseline.json", project), previousRequirementsDocument.bytes),
  writeFile(new URL("history/2.0.0/project-overview-baseline.json", project), previousOverviewDocument.bytes),
  writeFile(new URL("history/2.0.0/ProjectOverview.md", project), previousOverviewMarkdownBytes),
]);

await writeFile(new URL("requirements-gate-owner-approval.json", dogfood), approvalBytes);
const pendingPromotion = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsPairPromotionJournal",
  promotionId: "requirements-promotion-rm-001-roadmap-management-v1",
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
  "# DevRelay RM-001 RoadmapManagement Requirements Gate approval\n\n" +
  "Status: **pass**\n\n" +
  "The project owner approved the exact RM-001 candidate, atomic requirements/ProjectOverview promotion, trusted traceability contribution, and ArchitectureDesign progression for the exact digest-bound candidate recorded in requirements-gate-owner-approval.json.\n\n" +
  `- RequirementsGateCandidate: ${APPROVED.gateCandidate}\n` +
  `- RequirementsChangeSet: ${APPROVED.requirementsChangeSet}\n` +
  `- ProjectOverviewChangeSetDraft: ${APPROVED.projectOverviewChangeSet}\n` +
  `- Candidate ProjectOverview.md: ${APPROVED.projectOverviewMarkdown}\n` +
  `- RequirementsClosureAssessment: ${APPROVED.requirementsClosureAssessment}\n` +
  `- Terminal checkpoint: ${APPROVED.terminalCheckpoint}\n` +
  `- Approval artifact: ${approvalRef.digest}\n`;
await writeFile(
  new URL("requirements-gate-rm-001-roadmap-management-v1.md", project),
  Buffer.from(approvalText.normalize("NFC"), "utf8"),
);

const promotionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGatePromotionProof",
  proofId: "requirements-promotion-rm-001-roadmap-management-v1",
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
