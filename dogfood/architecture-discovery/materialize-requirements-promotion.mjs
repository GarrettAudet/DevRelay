import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { validateRequirementsGatePromotion } from "../../src/requirements-gate.mjs";

const root = new URL("../../", import.meta.url);
const dogfood = new URL("./", import.meta.url);
const project = new URL("../../project/", import.meta.url);

const APPROVED = Object.freeze({
  gateCandidate:
    "sha256:af725fdd68978eb0f20c2836d7518a857d08bbd62143a61fcf15b32977945df1",
  requirementsBaseline:
    "sha256:91aacadde03d10378ec19cd4f99d70b0d6474d540f956ec96ed0650da5ba9098",
  projectOverviewBaseline:
    "sha256:07667d8fd97d050eda48995a1bc98a65c1b0b19c8c49e769868d931860c4ae73",
  clarificationRequest:
    "sha256:6aa1fe1016271cf1667689acce942944f1b6ec4d97d759967b8176f92289cc0e",
  clarificationResponse:
    "sha256:b632416e9cd0101c9d62e8e20a480930ef4fa19acfdd5b8511a6baa13ef57f47",
  continuation:
    "sha256:40a2bc4f14c46934f76bea6179a93f9835d7f304b6877d3c4545e8478a5946dc",
  requirementsChangeSet:
    "sha256:caf935d1e918e29ff9d6e27f417a75e1c952a3626761d3f933f7d9f51fbb2d83",
  projectOverviewChangeSet:
    "sha256:4b2c3bf77a2ce71c6954e6b87bbcd6cb2176c014feaae7c793fcfc6a94e7014a",
  projectOverviewMarkdown:
    "sha256:7f7140222639141d33d036a1f5a2189ef307f6e9c65ac1d1a213890376168515",
  nativeSourceBundle:
    "sha256:4f9db370b60eb2fba1728ad21bca0dc09c17f873b3272a8ef2e56109d1c71819",
  terminalCheckpoint:
    "sha256:1dc5c56c9383f11ab4d6783956754d1c99e8a1721dce6f6c2065c6fa2d1aed31",
  executionProof:
    "sha256:496358bb794eddff9e480acbf3a4ecfbee1d4b05c0b87757ab6efdfa72020732",
  gateReview:
    "sha256:61f45ac0834409816eff7c718cf4d2e45367451f23571a2bee39b843de1459c1",
});

const LINEAGE = Object.freeze({
  clarificationCheckpoint:
    "sha256:de9c0865e8a650566ba420b5fc59f18a84d91be43cb324474387472beeb25aa0",
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
    new URL("history/1.6.0/requirements-baseline.json", project),
    new URL("requirements-baseline.json", project),
  ),
  readPreferredJson(
    new URL("history/1.6.0/project-overview-baseline.json", project),
    new URL("project-overview-baseline.json", project),
  ),
]);
const candidateOverviewMarkdownBytes = await readFile(
  new URL("candidate/ProjectOverview.md", dogfood),
);
const previousOverviewMarkdownBytes = await readPreferredBytes(
  new URL("history/1.6.0/ProjectOverview.md", project),
  new URL("../ProjectOverview.md", project),
);

for (const [label, document, digest] of [
  ["RequirementsGateCandidate", gateCandidateDocument, APPROVED.gateCandidate],
  ["RequirementsBaseline", previousRequirementsDocument, APPROVED.requirementsBaseline],
  ["ProjectOverviewBaseline", previousOverviewDocument, APPROVED.projectOverviewBaseline],
  ["ClarificationRequest", clarificationRequestDocument, APPROVED.clarificationRequest],
  ["ClarificationResponse", clarificationResponseDocument, APPROVED.clarificationResponse],
  ["Continuation", continuationDocument, APPROVED.continuation],
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
  Continuation: APPROVED.continuation,
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
  const relativePath = source.path.replace("dogfood/architecture-discovery/", "");
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
  approvalId: "requirements-gate-approval-architecture-discovery-v1",
  authority: "project-owner",
  decision: "approve",
  source: { channel: "chat", statement: "I approve" },
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
  baselineId: "requirements-baseline-devrelay-v1-architecture-discovery-001",
  version: "1.7.0",
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
  baselineId: "project-overview-baseline-devrelay-v1-architecture-discovery-001",
  version: "1.7.0",
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

await mkdir(new URL("history/1.6.0/", project), { recursive: true });
await Promise.all([
  writeFile(new URL("history/1.6.0/requirements-baseline.json", project), previousRequirementsDocument.bytes),
  writeFile(new URL("history/1.6.0/project-overview-baseline.json", project), previousOverviewDocument.bytes),
  writeFile(new URL("history/1.6.0/ProjectOverview.md", project), previousOverviewMarkdownBytes),
]);

await writeFile(new URL("requirements-gate-owner-approval.json", dogfood), approvalBytes);
const pendingPromotion = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsPairPromotionJournal",
  promotionId: "requirements-promotion-architecture-discovery-v1",
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
  "# ArchitectureDiscovery Requirements Gate approval\n\n" +
  "Status: **pass**\n\n" +
  "The project owner approved atomic requirements/ProjectOverview promotion and ArchitectureDesign progression for the exact digest-bound candidate recorded in requirements-gate-owner-approval.json.\n\n" +
  `- RequirementsGateCandidate: ${APPROVED.gateCandidate}\n` +
  `- RequirementsChangeSet: ${APPROVED.requirementsChangeSet}\n` +
  `- ProjectOverviewChangeSetDraft: ${APPROVED.projectOverviewChangeSet}\n` +
  `- Candidate ProjectOverview.md: ${APPROVED.projectOverviewMarkdown}\n` +
  `- Terminal checkpoint: ${APPROVED.terminalCheckpoint}\n` +
  `- Approval artifact: ${approvalRef.digest}\n`;
await writeFile(
  new URL("requirements-gate-architecture-discovery-v1.md", project),
  Buffer.from(approvalText.normalize("NFC"), "utf8"),
);

const promotionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGatePromotionProof",
  proofId: "requirements-promotion-architecture-discovery-v1",
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
