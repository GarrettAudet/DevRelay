import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";
import {
  RequirementsGateValidationError,
  validateRequirementsGatePromotion,
} from "../src/requirements-gate.mjs";

const root = new URL("../", import.meta.url);
const clone = (value) => structuredClone(value);
const pointer = ({ artifactId, digest }) => ({ artifactId, digest });

async function document(relativePath) {
  const bytes = await readFile(new URL(relativePath, root));
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

const [
  moduleDocument,
  pluginDocument,
  initialInvocationDocument,
  changeInvocationDocument,
  initialResultDocument,
  changeResultDocument,
  goalDocument,
  changeGoalDocument,
  contextDocument,
  repositoryDocument,
  requirementsDraftDocument,
  requirementsBaselineOneDocument,
  requirementsBaselineTwoDocument,
  requirementsChangeDocument,
  overviewDraftDocument,
  overviewBaselineOneDocument,
  overviewBaselineTwoDocument,
  overviewChangeDocument,
  nativeInitialDocument,
  nativeChangeDocument,
  overviewMarkdownOne,
  overviewMarkdownTwo,
  nativeInitialBytes,
  nativeChangeBytes,
] = await Promise.all([
  document("examples/modules/requirements-gathering.module.json"),
  document("examples/plugins/openspec.plugin.json"),
  document("examples/invocations/requirements-openspec.invocation.json"),
  document("examples/invocations/requirements-openspec-change-set.invocation.json"),
  document("examples/results/requirements-openspec.result.json"),
  document("examples/results/requirements-openspec-change-set.result.json"),
  document("examples/artifacts/goal-001.json"),
  document("examples/artifacts/goal-change-001.json"),
  document("examples/artifacts/project-context-001.json"),
  document("examples/artifacts/repository-snapshot-001.json"),
  document("examples/artifacts/requirements-draft-001.json"),
  document("examples/artifacts/requirements-baseline-001.json"),
  document("examples/artifacts/requirements-baseline-002.json"),
  document("examples/artifacts/requirements-change-set-001.json"),
  document("examples/artifacts/project-overview-draft-001.json"),
  document("examples/artifacts/project-overview-baseline-001.json"),
  document("examples/artifacts/project-overview-baseline-002.json"),
  document("examples/artifacts/project-overview-change-set-draft-001.json"),
  document("examples/artifacts/native-source-bundle-001.json"),
  document("examples/artifacts/native-source-bundle-change-001.json"),
  readFile(new URL("examples/artifacts/ProjectOverview.md", root)),
  readFile(
    new URL("examples/artifacts/project-overview-change/ProjectOverview.md", root),
  ),
  readFile(new URL("examples/native/openspec/proposal.md", root)),
  readFile(new URL("examples/native/openspec/change-proposal.md", root)),
]);

const jsonDocuments = new Map([
  ["goal-001", goalDocument],
  ["goal-change-001", changeGoalDocument],
  ["project-context-001", contextDocument],
  ["repository-snapshot-001", repositoryDocument],
  ["requirements-draft-001", requirementsDraftDocument],
  ["requirements-baseline-001", requirementsBaselineOneDocument],
  ["requirements-baseline-002", requirementsBaselineTwoDocument],
  ["requirements-change-set-001", requirementsChangeDocument],
  ["project-overview-draft-001", overviewDraftDocument],
  ["project-overview-baseline-001", overviewBaselineOneDocument],
  ["project-overview-baseline-002", overviewBaselineTwoDocument],
  ["project-overview-change-set-draft-001", overviewChangeDocument],
  ["native-source-openspec-001", nativeInitialDocument],
  ["native-source-openspec-change-001", nativeChangeDocument],
]);

function baseArtifactStore() {
  const values = new Map(
    [...jsonDocuments].map(([artifactId, entry]) => [
      artifactId,
      Buffer.from(entry.bytes),
    ]),
  );
  values.set("project-overview-md-001", Buffer.from(overviewMarkdownOne));
  values.set("project-overview-md-002", Buffer.from(overviewMarkdownTwo));
  values.set("openspec-proposal-001", Buffer.from(nativeInitialBytes));
  values.set("openspec-change-proposal-001", Buffer.from(nativeChangeBytes));
  return values;
}

function refForDocument(entry, artifactId, schema, mediaType) {
  return {
    artifactId,
    schema,
    mediaType,
    digest: sha256Digest(entry.bytes),
    uri: `artifact://requirements-gate/${artifactId}`,
  };
}

const requirementsBaselineOneRef = refForDocument(
  requirementsBaselineOneDocument,
  "requirements-baseline-001",
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
);
const requirementsBaselineTwoRef = refForDocument(
  requirementsBaselineTwoDocument,
  "requirements-baseline-002",
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
);
const overviewBaselineOneRef = refForDocument(
  overviewBaselineOneDocument,
  "project-overview-baseline-001",
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
);
const overviewBaselineTwoRef = refForDocument(
  overviewBaselineTwoDocument,
  "project-overview-baseline-002",
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
);

function checkpointStore() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    },
  };
}

function harness(kind, { execute = true } = {}) {
  const initial = kind === "initial";
  const invocation = clone(
    initial ? initialInvocationDocument.value : changeInvocationDocument.value,
  );
  const result = clone(
    initial ? initialResultDocument.value : changeResultDocument.value,
  );
  const store = baseArtifactStore();
  const checkpoints = checkpointStore();
  let adapterCalls = 0;
  const registry = createModuleRegistry({
    modules: [moduleDocument.value],
    plugins: [
      {
        definition: pluginDocument.value,
        adapter: {
          async invoke() {
            adapterCalls += 1;
            return result;
          },
        },
      },
    ],
    artifactContracts: requirementsRuntimeArtifactContracts(),
  });
  const artifacts = {
    async load(ref) {
      const bytes = store.get(ref.artifactId);
      if (!bytes) throw new Error(`missing artifact ${ref.artifactId}`);
      return Buffer.from(bytes);
    },
  };
  return {
    invocation,
    result,
    registry,
    artifacts,
    checkpoints,
    store,
    execute,
    calls: () => adapterCalls,
  };
}

async function verifiedPromotion(kind) {
  const runtime = harness(kind);
  await runtime.registry.execute(runtime.invocation, {
    artifacts: runtime.artifacts,
    checkpoints: runtime.checkpoints,
  });
  const checkpointReplay = await runtime.registry.verifyCheckpointedExecution(
    runtime.invocation,
    {
      artifacts: runtime.artifacts,
      checkpoints: runtime.checkpoints,
    },
  );
  assert.equal(runtime.calls(), 1, "checkpoint verification must not invoke");
  const initial = kind === "initial";
  return {
    runtime,
    request: {
      checkpointReplay,
      requirementsBaseline: clone(
        initial
          ? requirementsBaselineOneDocument.value
          : requirementsBaselineTwoDocument.value,
      ),
      requirementsBaselineRef: clone(
        initial ? requirementsBaselineOneRef : requirementsBaselineTwoRef,
      ),
      requirementsBaselineBytes: Buffer.from(
        initial
          ? requirementsBaselineOneDocument.bytes
          : requirementsBaselineTwoDocument.bytes,
      ),
      projectOverviewBaseline: clone(
        initial ? overviewBaselineOneDocument.value : overviewBaselineTwoDocument.value,
      ),
      projectOverviewBaselineRef: clone(
        initial ? overviewBaselineOneRef : overviewBaselineTwoRef,
      ),
      projectOverviewBaselineBytes: Buffer.from(
        initial ? overviewBaselineOneDocument.bytes : overviewBaselineTwoDocument.bytes,
      ),
      projectOverviewMarkdownBytes: Buffer.from(
        initial ? overviewMarkdownOne : overviewMarkdownTwo,
      ),
    },
  };
}

function rebindBaselineDocument(request, field) {
  const bytes = Buffer.from(
    `${JSON.stringify(request[field], null, 2)}\n`,
    "utf8",
  );
  request[`${field}Bytes`] = bytes;
  request[`${field}Ref`].digest = sha256Digest(bytes);
}

test("checkpoint-only verification requires proof and never invokes an adapter", async () => {
  const runtime = harness("initial");
  await assert.rejects(
    () =>
      runtime.registry.verifyCheckpointedExecution(runtime.invocation, {
        artifacts: runtime.artifacts,
        checkpoints: runtime.checkpoints,
      }),
    (error) => error.code === "DR2213" && /exact terminal checkpoint/.test(error.message),
  );
  assert.equal(runtime.calls(), 0);
});

test("gate returns one immutable pair from an exact checkpoint replay", async () => {
  const { request } = await verifiedPromotion("initial");
  const result = validateRequirementsGatePromotion(request);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.requirementsBaseline), true);
  assert.deepEqual(result.requirementsBaselineRef, requirementsBaselineOneRef);
  assert.deepEqual(result.projectOverviewBaselineRef, overviewBaselineOneRef);
  assert.equal(Object.isFrozen(result.commitPayload), true);
  assert.equal(
    result.commitPayload.requirementsBaseline.bytesBase64,
    requirementsBaselineOneDocument.bytes.toString("base64"),
  );
  assert.equal(
    result.commitPayload.projectOverviewBaseline.bytesBase64,
    overviewBaselineOneDocument.bytes.toString("base64"),
  );
});

test("gate promotes a version-aligned change pair from its exact prior pair", async () => {
  const { request } = await verifiedPromotion("change");
  const result = validateRequirementsGatePromotion(request);
  assert.equal(result.requirementsBaseline.version, "2.0.0");
  assert.equal(result.projectOverviewBaseline.version, "2.0.0");
  assert.deepEqual(
    result.projectOverviewBaseline.supersedes,
    pointer(overviewBaselineOneRef),
  );
});

test("gate rejects a forged or serialized checkpoint receipt", async () => {
  const { request } = await verifiedPromotion("initial");
  const forged = clone(request);
  forged.checkpointReplay = clone(request.checkpointReplay);
  assert.throws(
    () => validateRequirementsGatePromotion(forged),
    (error) =>
      error instanceof RequirementsGateValidationError &&
      /verified checkpoint replay receipt/.test(error.message),
  );
});

test("gate requires aligned versions and exactly matching approval evidence", async () => {
  const versionMismatch = (await verifiedPromotion("initial")).request;
  versionMismatch.projectOverviewBaseline.version = "1.0.1";
  rebindBaselineDocument(versionMismatch, "projectOverviewBaseline");
  assert.throws(
    () => validateRequirementsGatePromotion(versionMismatch),
    /semantic versions do not match/,
  );

  const evidenceMismatch = (await verifiedPromotion("initial")).request;
  evidenceMismatch.projectOverviewBaseline.approvalEvidence[0] = {
    artifactId: "different-approval",
    digest: `sha256:${"f".repeat(64)}`,
  };
  rebindBaselineDocument(evidenceMismatch, "projectOverviewBaseline");
  assert.throws(
    () => validateRequirementsGatePromotion(evidenceMismatch),
    /exactly matching approvalEvidence/,
  );
});

test("gate content-binds both promoted baseline objects to exact raw bytes", async () => {
  const forgedRef = (await verifiedPromotion("initial")).request;
  forgedRef.requirementsBaselineRef.digest = `sha256:${"0".repeat(64)}`;
  assert.throws(
    () => validateRequirementsGatePromotion(forgedRef),
    /bytes do not match their ArtifactRef digest/,
  );

  const staleObject = (await verifiedPromotion("initial")).request;
  const changed = clone(staleObject.requirementsBaseline);
  changed.version = "9.9.9";
  staleObject.requirementsBaselineBytes = Buffer.from(
    `${JSON.stringify(changed, null, 2)}\n`,
    "utf8",
  );
  staleObject.requirementsBaselineRef.digest = sha256Digest(
    staleObject.requirementsBaselineBytes,
  );
  assert.throws(
    () => validateRequirementsGatePromotion(staleObject),
    /object does not match the exact raw JSON artifact/,
  );

  const malformed = (await verifiedPromotion("initial")).request;
  malformed.projectOverviewBaselineBytes = Buffer.from("{}\n", "utf8");
  malformed.projectOverviewBaselineRef.digest = sha256Digest(
    malformed.projectOverviewBaselineBytes,
  );
  assert.throws(
    () => validateRequirementsGatePromotion(malformed),
    /bytes do not contain a ProjectOverviewBaseline/,
  );
});

test("gate rejects baseline reuse and tampered ProjectOverview.md bytes", async () => {
  const reused = (await verifiedPromotion("change")).request;
  reused.projectOverviewBaseline.baselineId = "project-overview-baseline-001";
  reused.projectOverviewBaselineRef.artifactId = "project-overview-baseline-001";
  rebindBaselineDocument(reused, "projectOverviewBaseline");
  assert.throws(
    () => validateRequirementsGatePromotion(reused),
    /new overview baseline ID/,
  );

  const tampered = (await verifiedPromotion("initial")).request;
  tampered.projectOverviewMarkdownBytes = Buffer.from("tampered", "utf8");
  assert.throws(
    () => validateRequirementsGatePromotion(tampered),
    /bytes do not match their declared digest/,
  );
});

test("contradictory candidate lineage cannot produce a promotable receipt", async () => {
  const runtime = harness("initial");
  const draft = clone(requirementsDraftDocument.value);
  draft.baseInputs[0].artifact = {
    artifactId: "different-goal",
    digest: `sha256:${"0".repeat(64)}`,
  };
  const draftBytes = Buffer.from(`${JSON.stringify(draft, null, 2)}\n`, "utf8");
  const draftRef = clone(runtime.result.outputs["requirements-draft"][0]);
  draftRef.digest = sha256Digest(draftBytes);
  runtime.store.set(draftRef.artifactId, draftBytes);

  const overview = clone(overviewDraftDocument.value);
  overview.requirementsDraft = pointer(draftRef);
  const overviewBytes = Buffer.from(`${JSON.stringify(overview, null, 2)}\n`, "utf8");
  const overviewRef = clone(runtime.result.outputs["project-overview-draft"][0]);
  overviewRef.digest = sha256Digest(overviewBytes);
  runtime.store.set(overviewRef.artifactId, overviewBytes);

  const native = clone(nativeInitialDocument.value);
  native.canonicalOutputs = [pointer(draftRef), pointer(overviewRef)];
  const nativeBytes = Buffer.from(`${JSON.stringify(native, null, 2)}\n`, "utf8");
  const nativeRef = clone(runtime.result.outputs["native-source-bundle"][0]);
  nativeRef.digest = sha256Digest(nativeBytes);
  runtime.store.set(nativeRef.artifactId, nativeBytes);

  runtime.result.outputs = {
    "requirements-draft": [draftRef],
    "project-overview-draft": [overviewRef],
    "native-source-bundle": [nativeRef],
  };
  runtime.result.evidence[0].artifact = clone(nativeRef);

  await assert.rejects(
    () =>
      runtime.registry.execute(runtime.invocation, {
        artifacts: runtime.artifacts,
        checkpoints: runtime.checkpoints,
      }),
    /requirements draft base input goal/,
  );
  assert.equal(runtime.checkpoints.values.size, 0);
  await assert.rejects(
    () =>
      runtime.registry.verifyCheckpointedExecution(runtime.invocation, {
        artifacts: runtime.artifacts,
        checkpoints: runtime.checkpoints,
      }),
    (error) => error.code === "DR2213",
  );
  assert.equal(runtime.calls(), 1, "verification must not retry the failed adapter");
});
