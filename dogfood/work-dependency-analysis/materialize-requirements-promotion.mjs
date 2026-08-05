import { mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { validateRequirementsGatePromotion } from "../../src/requirements-gate.mjs";

const root = new URL("../../", import.meta.url);
const dogfood = new URL("./", import.meta.url);
const project = new URL("../../project/", import.meta.url);

const APPROVED = Object.freeze({
  requirementsChangeSet:
    "sha256:fd63abe4b76235b72c78624f380e3f0aacccbabdcd75f25de54523a63b583a5b",
  projectOverviewChangeSet:
    "sha256:635f89d6ff927ebe369db66a7ae71480d826d2853617ec44b7153f76634768b4",
  projectOverviewMarkdown:
    "sha256:4b9385d583f5b9d51782dd9a3a6e0b7a7daa08416e36b671153f7349e440c86a",
  nativeSourceBundle:
    "sha256:981b43ca88e4955abf883b421891dd45dbe31396d89510bf6b15a4e385b50c0d",
  terminalCheckpoint:
    "sha256:2ef7ded2d4efd9efe0e900277fd87db5cd1b7135a5be63b61ccbb89c3e20b3ef",
  repositoryRevision: "9cb4f2b8d340142557027fc0477440722d4f8286",
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
  readJson(new URL("history/1.0.0/requirements-baseline.json", project)),
  readJson(new URL("history/1.0.0/project-overview-baseline.json", project)),
]);
const candidateOverviewMarkdownBytes = await readFile(
  new URL("candidate/ProjectOverview.md", dogfood),
);
const previousOverviewMarkdownBytes = await readFile(
  new URL("history/1.0.0/ProjectOverview.md", project),
);

assertDigest(
  "RequirementsChangeSet",
  changeSetDocument.bytes,
  APPROVED.requirementsChangeSet,
);
assertDigest(
  "ProjectOverviewChangeSetDraft",
  overviewChangeDocument.bytes,
  APPROVED.projectOverviewChangeSet,
);
assertDigest(
  "candidate ProjectOverview.md",
  candidateOverviewMarkdownBytes,
  APPROVED.projectOverviewMarkdown,
);
assertDigest(
  "NativeSourceBundle",
  nativeBundleDocument.bytes,
  APPROVED.nativeSourceBundle,
);
assertDigest(
  "terminal checkpoint",
  checkpointDocument.bytes,
  APPROVED.terminalCheckpoint,
);
if (
  invocationDocument.value.inputs["repository-snapshot"][0].artifactId !==
    `repository-snapshot-devrelay-${APPROVED.repositoryRevision.slice(0, 7)}` ||
  JSON.parse(
    await readFile(new URL("repository-snapshot.json", dogfood), "utf8"),
  ).revision !== APPROVED.repositoryRevision
) {
  throw new Error("Repository snapshot does not match the approved revision.");
}

const bytesByArtifactId = new Map();
const add = (artifactId, bytes) => {
  bytesByArtifactId.set(artifactId, Buffer.from(bytes));
};
add(
  invocationDocument.value.inputs.goal[0].artifactId,
  await readFile(new URL("goal.json", dogfood)),
);
add(
  invocationDocument.value.inputs["project-context"][0].artifactId,
  await readFile(new URL("project-context.json", dogfood)),
);
add(
  invocationDocument.value.inputs["repository-snapshot"][0].artifactId,
  await readFile(new URL("repository-snapshot.json", dogfood)),
);
add(
  invocationDocument.value.inputs["requirements-baseline"][0].artifactId,
  previousRequirementsDocument.bytes,
);
add(
  invocationDocument.value.inputs["project-overview-baseline"][0].artifactId,
  previousOverviewDocument.bytes,
);
add(
  previousOverviewDocument.value.renderedDocument.artifact.artifactId,
  previousOverviewMarkdownBytes,
);
add(
  resultDocument.value.outputs["requirements-change-set"][0].artifactId,
  changeSetDocument.bytes,
);
add(
  resultDocument.value.outputs["project-overview-change-set-draft"][0].artifactId,
  overviewChangeDocument.bytes,
);
add(
  resultDocument.value.outputs["native-source-bundle"][0].artifactId,
  nativeBundleDocument.bytes,
);
add(
  overviewChangeDocument.value.renderedDocument.artifact.artifactId,
  candidateOverviewMarkdownBytes,
);
for (const source of nativeBundleDocument.value.sources) {
  const relativePath = source.path.replace(
    "dogfood/work-dependency-analysis/",
    "",
  );
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
    if (bytes === undefined) {
      throw new Error(`Missing promotion artifact ${ref.artifactId}.`);
    }
    return Buffer.from(bytes);
  },
});
const checkpointStore = Object.freeze({
  async get(key) {
    return key === checkpointDocument.value.checkpointKey
      ? checkpointDocument.value.checkpoint
      : undefined;
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
const checkpointReplay = await registry.verifyCheckpointedExecution(
  invocationDocument.value,
  { artifacts: artifactStore, checkpoints: checkpointStore },
);
if (adapterCalls !== 0) {
  throw new Error("Requirements Gate replay invoked the adapter.");
}

const approvalText =
  "# WorkDependencyAnalysis Requirements Gate approval\n\n" +
  "Status: **pass**\n\n" +
  "The product owner approved atomic promotion and ArchitectureDesign progression only for the exact artifacts below. Any byte or repository-revision change requires a new candidate and approval.\n\n" +
  `- RequirementsChangeSet: ${APPROVED.requirementsChangeSet}\n` +
  `- ProjectOverviewChangeSetDraft: ${APPROVED.projectOverviewChangeSet}\n` +
  `- Candidate ProjectOverview.md: ${APPROVED.projectOverviewMarkdown}\n` +
  `- NativeSourceBundle: ${APPROVED.nativeSourceBundle}\n` +
  `- Terminal checkpoint: ${APPROVED.terminalCheckpoint}\n` +
  `- Repository revision: ${APPROVED.repositoryRevision}\n`;
const approvalBytes = Buffer.from(approvalText.normalize("NFC"), "utf8");
const approvalRef = Object.freeze({
  artifactId: "requirements-gate-approval-work-dependency-analysis-v1",
  digest: sha256Digest(approvalBytes),
});

const previousRequirementsRef = invocationDocument.value.inputs[
  "requirements-baseline"
][0];
const previousOverviewRef = invocationDocument.value.inputs[
  "project-overview-baseline"
][0];
const requirementsChangeRef = resultDocument.value.outputs[
  "requirements-change-set"
][0];
const overviewChangeRef = resultDocument.value.outputs[
  "project-overview-change-set-draft"
][0];
const requirementsBaseline = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsBaseline",
  baselineId: "requirements-baseline-devrelay-v1-wda-001",
  version: "1.1.0",
  approvedCandidate: pointer(requirementsChangeRef),
  supersedes: pointer(previousRequirementsRef),
  requirements: changeSetDocument.value.replacement,
  approvalEvidence: [pointer(approvalRef)],
});
const requirementsBaselineBytes = jsonBytes(requirementsBaseline);
const requirementsBaselineRef = fullRef(
  {
    artifactId: requirementsBaseline.baselineId,
    digest: sha256Digest(requirementsBaselineBytes),
  },
  TYPES.requirementsBaseline[0],
  TYPES.requirementsBaseline[1],
  "file:///C:/repos/DevRelay/project/requirements-baseline.json",
);
const projectOverviewBaseline = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectOverviewBaseline",
  baselineId: "project-overview-baseline-devrelay-v1-wda-001",
  version: "1.1.0",
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
  {
    artifactId: projectOverviewBaseline.baselineId,
    digest: sha256Digest(projectOverviewBaselineBytes),
  },
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
  Buffer.from(
    promotion.commitPayload.requirementsBaseline.bytesBase64,
    "base64",
  ).compare(requirementsBaselineBytes) !== 0 ||
  Buffer.from(
    promotion.commitPayload.projectOverviewBaseline.bytesBase64,
    "base64",
  ).compare(projectOverviewBaselineBytes) !== 0
) {
  throw new Error("Gate commit payload does not match the promoted pair bytes.");
}

await mkdir(new URL("history/1.0.0/", project), { recursive: true });
await Promise.all([
  writeFile(
    new URL("history/1.0.0/requirements-baseline.json", project),
    previousRequirementsDocument.bytes,
  ),
  writeFile(
    new URL("history/1.0.0/project-overview-baseline.json", project),
    previousOverviewDocument.bytes,
  ),
  writeFile(
    new URL("history/1.0.0/ProjectOverview.md", project),
    previousOverviewMarkdownBytes,
  ),
]);

const pendingPromotion = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsPairPromotionJournal",
  promotionId: "requirements-promotion-work-dependency-analysis-v1",
  state: "prepared",
  previous: {
    requirementsBaseline: pointer(previousRequirementsRef),
    projectOverviewBaseline: pointer(previousOverviewRef),
  },
  next: {
    requirementsBaseline: pointer(requirementsBaselineRef),
    projectOverviewBaseline: pointer(projectOverviewBaselineRef),
    projectOverviewMarkdown: pointer(
      overviewChangeDocument.value.renderedDocument.artifact,
    ),
  },
  approval: pointer(approvalRef),
});
await writeFile(
  new URL("requirements-promotion.pending.json", project),
  jsonBytes(pendingPromotion),
);
await Promise.all([
  writeFile(new URL("requirements-baseline.json", project), requirementsBaselineBytes),
  writeFile(
    new URL("project-overview-baseline.json", project),
    projectOverviewBaselineBytes,
  ),
  writeFile(new URL("ProjectOverview.md", root), candidateOverviewMarkdownBytes),
  writeFile(
    new URL("requirements-gate-work-dependency-analysis-v1.md", project),
    approvalBytes,
  ),
]);

const promotionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGatePromotionProof",
  proofId: "requirements-promotion-work-dependency-analysis-v1",
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
await writeFile(
  new URL("requirements-gate-promotion-proof.json", dogfood),
  promotionProofBytes,
);
const committedPromotion = Object.freeze({
  ...pendingPromotion,
  state: "committed",
  proof: {
    artifactId: promotionProof.proofId,
    digest: sha256Digest(promotionProofBytes),
  },
});
await writeFile(
  new URL("requirements-promotion.commit.json", project),
  jsonBytes(committedPromotion),
);
await writeFile(
  new URL("requirements-promotion.pending.json", project),
  jsonBytes(committedPromotion),
);

process.stdout.write(
  `${JSON.stringify(
    {
      gateStatus: "pass",
      adapterCalls,
      requirementsBaselineDigest: requirementsBaselineRef.digest,
      projectOverviewBaselineDigest: projectOverviewBaselineRef.digest,
      projectOverviewMarkdownDigest: APPROVED.projectOverviewMarkdown,
      promotionProofDigest: sha256Digest(promotionProofBytes),
      architectureProgressionAllowed: true,
    },
    null,
    2,
  )}\n`,
);
