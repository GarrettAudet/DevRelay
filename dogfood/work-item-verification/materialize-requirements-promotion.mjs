import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { validateRequirementsGatePromotion } from "../../src/requirements-gate.mjs";

const root = new URL("../../", import.meta.url);
const dogfood = new URL("./", import.meta.url);
const project = new URL("../../project/", import.meta.url);
const replay = new URL("requirements-replay-v2/", dogfood);

const APPROVED = Object.freeze({
  gateCandidate:
    "sha256:58495561273982c09abaf07ff58c0a5cd787424283f3347ad1044824671ad77b",
  requirementsBaseline:
    "sha256:c66224db72ab53947d045720e87e0d6929d4fcb80fbf1fa2f4b607e967caae30",
  projectOverviewBaseline:
    "sha256:6cae194ccf525e5cd3190fd021aed052fc10f373fd1c1eb09d6b6ee002e844f7",
  confirmedDesignBasis:
    "sha256:68d51980901cd1bc88166f00f7ac30238a9a6a2356340fa07d0b708d397bb35c",
  requirementsChangeSet:
    "sha256:66937bc9738045ab4c4e4e83c0ac79d4ccad2097fdc7646164b5543af9ea0337",
  projectOverviewChangeSet:
    "sha256:9f259ee2e7bd6855fe3d78059705a5444805e66c0080e82ac051a7f6eb792add",
  projectOverviewMarkdown:
    "sha256:22ae4d9308324f437b3b02e614b2677d2f34bdcd8e7c992979a83e5e4b58e587",
  nativeSourceBundle:
    "sha256:36434f31c5d4387c41c9764b7d126eba77471131b6485c4f2755557b646e39e8",
  terminalCheckpoint:
    "sha256:ca33311a1c6b26199ab5b26e5a67234bde4ce1528521cf688067232ff32db23e",
  executionProof:
    "sha256:2469dd39db176841e39decbbde67acc080b8601f58d4ef7f704f3d02c7361d91",
  gateReview:
    "sha256:21c763bd7587c52864bac504e7bebfc5bc9d62fb37b3963b5079235cfff46811",
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
  executionProofDocument,
  previousRequirementsDocument,
  previousOverviewDocument,
  designBasisDocument,
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
  readJson(new URL("requirements-change.execution-proof.json", dogfood)),
  readPreferredJson(
    new URL("history/1.4.0/requirements-baseline.json", project),
    new URL("requirements-baseline.json", project),
  ),
  readPreferredJson(
    new URL("history/1.4.0/project-overview-baseline.json", project),
    new URL("project-overview-baseline.json", project),
  ),
  readFile(new URL("confirmed-design-basis.md", dogfood)).then((bytes) => ({
    bytes,
  })),
]);
const candidateOverviewMarkdownBytes = await readFile(
  new URL("candidate/ProjectOverview.md", dogfood),
);
const previousOverviewMarkdownBytes = await readPreferredBytes(
  new URL("history/1.4.0/ProjectOverview.md", project),
  new URL("../ProjectOverview.md", project),
);

for (const [label, document, digest] of [
  ["RequirementsGateCandidate", gateCandidateDocument, APPROVED.gateCandidate],
  ["RequirementsBaseline", previousRequirementsDocument, APPROVED.requirementsBaseline],
  ["ProjectOverviewBaseline", previousOverviewDocument, APPROVED.projectOverviewBaseline],
  ["Confirmed design basis", designBasisDocument, APPROVED.confirmedDesignBasis],
  ["RequirementsChangeSet", changeSetDocument, APPROVED.requirementsChangeSet],
  ["ProjectOverviewChangeSetDraft", overviewChangeDocument, APPROVED.projectOverviewChangeSet],
  ["NativeSourceBundle", nativeBundleDocument, APPROVED.nativeSourceBundle],
  ["Terminal checkpoint", checkpointDocument, APPROVED.terminalCheckpoint],
  ["Execution proof", executionProofDocument, APPROVED.executionProof],
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
  "Confirmed design basis": APPROVED.confirmedDesignBasis,
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
add(
  "confirmed-design-basis-work-item-verification-v1",
  designBasisDocument.bytes,
);
add(resultDocument.value.outputs["requirements-change-set"][0].artifactId, changeSetDocument.bytes);
add(
  resultDocument.value.outputs["project-overview-change-set-draft"][0].artifactId,
  overviewChangeDocument.bytes,
);
add(resultDocument.value.outputs["native-source-bundle"][0].artifactId, nativeBundleDocument.bytes);
add(overviewChangeDocument.value.renderedDocument.artifact.artifactId, candidateOverviewMarkdownBytes);
for (const source of nativeBundleDocument.value.sources) {
  const relativePath = source.path.replace("dogfood/work-item-verification/", "");
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
  approvalId: "requirements-gate-approval-work-item-verification-v1",
  authority: "project-owner",
  decision: "approve",
  source: {
    channel: "chat",
    statement: "Assume routine changes are approved; ask only for design questions or missing business requirements.",
  },
  approvedCandidate: { ...APPROVED },
  authorizedActions: [
    "atomic-requirements-project-overview-promotion",
    "progress-to-architecture-design",
  ],
  modificationPolicy:
    "Any artifact or checkpoint modification requires a new Gate candidate and approval.",
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
  baselineId: "requirements-baseline-devrelay-v1-work-item-verification-001",
  version: "1.5.0",
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
  baselineId: "project-overview-baseline-devrelay-v1-work-item-verification-001",
  version: "1.5.0",
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

await mkdir(replay, { recursive: true });
await mkdir(new URL("history/1.4.0/", project), { recursive: true });
await Promise.all([
  writeFile(new URL("history/1.4.0/requirements-baseline.json", project), previousRequirementsDocument.bytes),
  writeFile(new URL("history/1.4.0/project-overview-baseline.json", project), previousOverviewDocument.bytes),
  writeFile(new URL("history/1.4.0/ProjectOverview.md", project), previousOverviewMarkdownBytes),
]);

await writeFile(new URL("requirements-gate-owner-approval.json", dogfood), approvalBytes);
const pendingPromotion = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsPairPromotionJournal",
  promotionId: "requirements-promotion-work-item-verification-v1",
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
await writeFile(new URL("requirements-promotion.pending.json", replay), jsonBytes(pendingPromotion));
await Promise.all([
  writeFile(new URL("requirements-baseline.json", replay), requirementsBaselineBytes),
  writeFile(new URL("project-overview-baseline.json", replay), projectOverviewBaselineBytes),
  writeFile(new URL("ProjectOverview.md", replay), candidateOverviewMarkdownBytes),
]);

const approvalText =
  "# WorkItemVerification Requirements Gate approval\n\n" +
  "Status: **pass**\n\n" +
  "The standing owner instruction authorizes atomic requirements/ProjectOverview promotion and ArchitectureDesign progression for this exact digest-bound candidate; no blocking product clarification was identified.\n\n" +
  `- RequirementsGateCandidate: ${APPROVED.gateCandidate}\n` +
  `- RequirementsChangeSet: ${APPROVED.requirementsChangeSet}\n` +
  `- ProjectOverviewChangeSetDraft: ${APPROVED.projectOverviewChangeSet}\n` +
  `- Candidate ProjectOverview.md: ${APPROVED.projectOverviewMarkdown}\n` +
  `- Terminal checkpoint: ${APPROVED.terminalCheckpoint}\n` +
  `- Approval artifact: ${approvalRef.digest}\n`;
await writeFile(
  new URL("requirements-gate-work-item-verification-v1.md", project),
  Buffer.from(approvalText.normalize("NFC"), "utf8"),
);

const promotionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGatePromotionProof",
  proofId: "requirements-promotion-work-item-verification-v1",
  status: "pass",
  approvedDigests: APPROVED,
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
