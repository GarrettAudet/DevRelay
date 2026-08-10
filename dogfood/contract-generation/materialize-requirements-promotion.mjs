import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { validateRequirementsGatePromotion } from "../../src/requirements-gate.mjs";

const root = new URL("../../", import.meta.url);
const dogfood = new URL("./", import.meta.url);
const replay = new URL("requirements-replay-v2/", dogfood);
const project = new URL("../../project/", import.meta.url);

const APPROVED = Object.freeze({
  gateCandidate:
    "sha256:bcf7015a4b54e54544dd3e0a69f88e5562956c70f3929dbc0701c0f1c6e7181f",
  requirementsBaseline:
    "sha256:c75fd7eab03c6409613cf2a9032794c133ca53aefccafeb6dd66931c16d0dff1",
  projectOverviewBaseline:
    "sha256:eb4a5ea9db4c67cff641ffdc50168ee2c4d257ab307be909fe515759ee88239e",
  clarificationRequest:
    "sha256:07df4b227925956dde96ccf136acdf6c2fbccb13fa279e3b3c56a81603a2ef6e",
  clarificationResponse:
    "sha256:9c647b96a5d4351fb8e64d5719394b6b8c0a56ac19d6d7a702293c93afdf9b51",
  continuation:
    "sha256:3d486fd9fbad18f9622ed84bfe1985fbd2eddc305300df5e22f59fcdafba8325",
  requirementsChangeSet:
    "sha256:98c7cb7a87b2e13f258250992faffe4105697d334eff67bc7efe664c8f532c72",
  projectOverviewChangeSet:
    "sha256:c33c06b4111db2db07f90f86c62187558a3ee58cfca0783fcd7c65ea2fcb851f",
  projectOverviewMarkdown:
    "sha256:2c23468dae2092bb133e78e45e725e647a7901fb90e400f149d929192446b6a3",
  nativeSourceBundle:
    "sha256:a09f3932e3d27042c7ea1ae2d0f995c62f6f198446625d5eb2faa59bc59cf9c6",
  terminalCheckpoint:
    "sha256:0940d530439e1088e6f43cbc88815156719ac5d17c9b4b0069a4e29a91424c77",
  executionProof:
    "sha256:fdf6c0a9b6029a2a93045197f711e45c7e72228e042310f265b65f32f40a20be",
  gateReview:
    "sha256:0ce4bdadd63740934c85978c01c5594abad5f9e74d974fab3b1a19f2283423a4",
});

const LINEAGE = Object.freeze({
  clarificationCheckpoint:
    "sha256:36b609c5d7a8209b0f473ec01d4033be1cd069918ef8be229a9ab560f3caede1",
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
    new URL("history/1.2.0/requirements-baseline.json", project),
    new URL("requirements-baseline.json", project),
  ),
  readPreferredJson(
    new URL("history/1.2.0/project-overview-baseline.json", project),
    new URL("project-overview-baseline.json", project),
  ),
]);
const candidateOverviewMarkdownBytes = await readFile(
  new URL("candidate/ProjectOverview.md", dogfood),
);
const previousOverviewMarkdownBytes = await readPreferredBytes(
  new URL("history/1.2.0/ProjectOverview.md", project),
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
  const relativePath = source.path.replace("dogfood/contract-generation/", "");
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
  approvalId: "requirements-gate-approval-contract-generation-v1",
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
  baselineId: "requirements-baseline-devrelay-v1-contract-generation-001",
  version: "1.3.0",
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
  baselineId: "project-overview-baseline-devrelay-v1-contract-generation-001",
  version: "1.3.0",
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

await mkdir(new URL("history/1.2.0/", project), { recursive: true });
await Promise.all([
  writeFile(new URL("history/1.2.0/requirements-baseline.json", project), previousRequirementsDocument.bytes),
  writeFile(new URL("history/1.2.0/project-overview-baseline.json", project), previousOverviewDocument.bytes),
  writeFile(new URL("history/1.2.0/ProjectOverview.md", project), previousOverviewMarkdownBytes),
]);

await writeFile(new URL("requirements-gate-owner-approval.json", dogfood), approvalBytes);
const pendingPromotion = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsPairPromotionJournal",
  promotionId: "requirements-promotion-contract-generation-v1",
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
await mkdir(replay, { recursive: true });
await writeFile(new URL("requirements-promotion.pending.json", replay), jsonBytes(pendingPromotion));
await Promise.all([
  writeFile(new URL("requirements-baseline.json", replay), requirementsBaselineBytes),
  writeFile(new URL("project-overview-baseline.json", replay), projectOverviewBaselineBytes),
  writeFile(new URL("ProjectOverview.md", replay), candidateOverviewMarkdownBytes),
]);

const approvalText =
  "# ContractGeneration Requirements Gate approval\n\n" +
  "Status: **pass**\n\n" +
  "The project owner approved atomic requirements/ProjectOverview promotion and ArchitectureDesign progression for the exact digest-bound candidate recorded in requirements-gate-owner-approval.json.\n\n" +
  `- RequirementsGateCandidate: ${APPROVED.gateCandidate}\n` +
  `- RequirementsChangeSet: ${APPROVED.requirementsChangeSet}\n` +
  `- ProjectOverviewChangeSetDraft: ${APPROVED.projectOverviewChangeSet}\n` +
  `- Candidate ProjectOverview.md: ${APPROVED.projectOverviewMarkdown}\n` +
  `- Terminal checkpoint: ${APPROVED.terminalCheckpoint}\n` +
  `- Approval artifact: ${approvalRef.digest}\n`;
await writeFile(
  new URL("requirements-gate-contract-generation-v1.md", replay),
  Buffer.from(approvalText.normalize("NFC"), "utf8"),
);

const promotionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGatePromotionProof",
  proofId: "requirements-promotion-contract-generation-v1",
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
await writeFile(new URL("requirements-promotion.commit.json", replay), jsonBytes(committedPromotion));
await writeFile(new URL("requirements-promotion.pending.json", replay), jsonBytes(committedPromotion));

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
