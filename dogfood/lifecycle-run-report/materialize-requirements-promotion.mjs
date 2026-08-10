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
    "sha256:e5b3e637d80093b0ed05497f1b71903993f7230a43b1fb6d83628c9fccbbb8e1",
  projectOverviewChangeSet:
    "sha256:dce8060598f7e3139debd14b3090c9f7990253eb59b29c2295dc67531a7ff5b1",
  projectOverviewMarkdown:
    "sha256:a592c999205b8ffba0eb13327cc0f680e091910e9638b82bb6bb5ffd6ccdd930",
  nativeSourceBundle:
    "sha256:d53ea72274ccf9a67ba10f15378230a2e166c8123622aa4ba32202153753b16c",
  terminalCheckpoint:
    "sha256:49fad8f1cbfeb584d2404eb437da68ab028bcf7e60605c766cf041e489b8f606",
  repositorySnapshot:
    "sha256:7e15e070e21469126f2d1128d21075ecf3c12becc10d1b5492f1ac2cf0291c73",
  repositoryRevision: "4bda7fe707ba102bd22fe0001c83aa13ec03b0c5",
  repositoryTree:
    "sha256:6d27786016084029b7148e33d7200656366120cd986f046d32b9e406c12b33dd",
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
  readPreferredJson(
    new URL("history/1.1.0/requirements-baseline.json", project),
    new URL("requirements-baseline.json", project),
  ),
  readPreferredJson(
    new URL("history/1.1.0/project-overview-baseline.json", project),
    new URL("project-overview-baseline.json", project),
  ),
]);
const candidateOverviewMarkdownBytes = await readFile(
  new URL("candidate/ProjectOverview.md", dogfood),
);
const previousOverviewMarkdownBytes = await readPreferredBytes(
  new URL("history/1.1.0/ProjectOverview.md", project),
  new URL("../ProjectOverview.md", project),
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
const repositorySnapshotBytes = await readFile(
  new URL("repository-snapshot.json", dogfood),
);
const repositorySnapshot = JSON.parse(repositorySnapshotBytes.toString("utf8"));
assertDigest(
  "RepositorySnapshot",
  repositorySnapshotBytes,
  APPROVED.repositorySnapshot,
);
if (
  invocationDocument.value.inputs["repository-snapshot"][0].artifactId !==
    `repository-snapshot-devrelay-${APPROVED.repositoryRevision.slice(0, 7)}` ||
  repositorySnapshot.revision !== APPROVED.repositoryRevision ||
  repositorySnapshot.treeDigest !== APPROVED.repositoryTree
) {
  throw new Error(
    "Repository snapshot does not match the approved revision and tree.",
  );
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
  repositorySnapshotBytes,
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
    "dogfood/lifecycle-run-report/",
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

const approval = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGateApproval",
  approvalId: "requirements-gate-approval-lifecycle-run-report-v1",
  authority: "project-owner",
  decision: "approve",
  source: {
    channel: "chat",
    statement: "I approve",
  },
  approvedCandidate: {
    requirementsChangeSet: APPROVED.requirementsChangeSet,
    projectOverviewChangeSet: APPROVED.projectOverviewChangeSet,
    projectOverviewMarkdown: APPROVED.projectOverviewMarkdown,
    nativeSourceBundle: APPROVED.nativeSourceBundle,
    terminalCheckpoint: APPROVED.terminalCheckpoint,
    repositorySnapshot: APPROVED.repositorySnapshot,
    repositoryRevision: APPROVED.repositoryRevision,
    repositoryTree: APPROVED.repositoryTree,
  },
  authorizedActions: [
    "atomic-requirements-project-overview-promotion",
    "progress-to-architecture-design",
  ],
  modificationPolicy:
    "Any artifact, checkpoint, repository snapshot, revision, or tree change requires a new Gate candidate and owner approval.",
});
const approvalBytes = jsonBytes(approval);
const approvalRef = Object.freeze({
  artifactId: approval.approvalId,
  digest: sha256Digest(approvalBytes),
});
const approvalText =
  "# DevRelay V1 lifecycle and run-report Requirements Gate approval\n\n" +
  "Status: **pass**\n\n" +
  "The project owner approved atomic requirements/ProjectOverview promotion and ArchitectureDesign progression only for the exact digest-bound candidate recorded in requirements-gate-owner-approval.json.\n\n" +
  "- Approval artifact: " + approvalRef.digest + "\n" +
  "- RequirementsChangeSet: " + APPROVED.requirementsChangeSet + "\n" +
  "- ProjectOverviewChangeSetDraft: " + APPROVED.projectOverviewChangeSet + "\n" +
  "- Candidate ProjectOverview.md: " + APPROVED.projectOverviewMarkdown + "\n" +
  "- NativeSourceBundle: " + APPROVED.nativeSourceBundle + "\n" +
  "- Terminal checkpoint: " + APPROVED.terminalCheckpoint + "\n" +
  "- RepositorySnapshot: " + APPROVED.repositorySnapshot + "\n" +
  "- Repository revision: " + APPROVED.repositoryRevision + "\n" +
  "- Repository tree: " + APPROVED.repositoryTree + "\n";
const approvalTextBytes = Buffer.from(approvalText.normalize("NFC"), "utf8");
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
  baselineId: "requirements-baseline-devrelay-v1-lifecycle-001",
  version: "1.2.0",
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
  baselineId: "project-overview-baseline-devrelay-v1-lifecycle-001",
  version: "1.2.0",
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

await mkdir(new URL("history/1.1.0/", project), { recursive: true });
await Promise.all([
  writeFile(
    new URL("history/1.1.0/requirements-baseline.json", project),
    previousRequirementsDocument.bytes,
  ),
  writeFile(
    new URL("history/1.1.0/project-overview-baseline.json", project),
    previousOverviewDocument.bytes,
  ),
  writeFile(
    new URL("history/1.1.0/ProjectOverview.md", project),
    previousOverviewMarkdownBytes,
  ),
]);

await writeFile(
  new URL("requirements-gate-owner-approval.json", dogfood),
  approvalBytes,
);
const pendingPromotion = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsPairPromotionJournal",
  promotionId: "requirements-promotion-lifecycle-run-report-v1",
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
    new URL("requirements-gate-lifecycle-run-report-v1.md", project),
    approvalTextBytes,
  ),
]);

const promotionProof = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsGatePromotionProof",
  proofId: "requirements-promotion-lifecycle-run-report-v1",
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
