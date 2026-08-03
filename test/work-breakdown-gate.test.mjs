import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import {
  applyWorkBreakdownChangeSet,
  validateWorkBreakdownArtifact,
  WORK_BREAKDOWN_ARTIFACT_CONTRACTS,
} from "../src/work-breakdown-artifact-validator.mjs";
import {
  validateWorkBreakdownGateCandidate,
  validateWorkBreakdownGatePromotion,
  WorkBreakdownGateValidationError,
} from "../src/work-breakdown-gate.mjs";

const root = new URL("../", import.meta.url);
const clone = (value) => structuredClone(value);
const digest = (character) => `sha256:${character.repeat(64)}`;

const [moduleDefinition, pluginDefinition] = await Promise.all([
  readFile(new URL("examples/modules/work-breakdown.module.json", root), "utf8").then(
    JSON.parse,
  ),
  readFile(new URL("examples/plugins/openspec-tasks.plugin.json", root), "utf8").then(
    JSON.parse,
  ),
]);

function artifactRef(artifactId, contract, bytes) {
  return {
    artifactId,
    schema: contract.schema,
    mediaType: contract.mediaType,
    digest: sha256Digest(bytes),
    uri: `artifact://work-breakdown-gate/${artifactId}`,
  };
}

function jsonArtifact(artifactId, contract, value) {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  return { value, bytes, ref: artifactRef(artifactId, contract, bytes) };
}

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

const contracts = {
  requirements: {
    schema: "https://devrelay.dev/artifacts/requirements-baseline/v1",
    mediaType: "application/vnd.devrelay.requirements-baseline+json",
  },
  overview: {
    schema: "https://devrelay.dev/artifacts/project-overview-baseline/v1",
    mediaType: "application/vnd.devrelay.project-overview-baseline+json",
  },
  architecture: {
    schema: "https://devrelay.dev/artifacts/architecture-baseline/v1",
    mediaType: "application/vnd.devrelay.architecture-baseline+json",
  },
  repository: {
    schema: "https://devrelay.dev/artifacts/repository-snapshot/v1",
    mediaType: "application/vnd.devrelay.repository-snapshot+json",
  },
  route: {
    schema: "https://devrelay.dev/artifacts/module-route-decision/v1",
    mediaType: "application/vnd.devrelay.module-route-decision+json",
  },
};

function fixture({ noWork = false, diagnostics = [] } = {}) {
  const requirements = jsonArtifact(
    "requirements-baseline-gate",
    contracts.requirements,
    {
      kind: "RequirementsBaseline",
      requirements: { acceptanceCriteria: [{ id: "AC-ONE" }] },
    },
  );
  const overview = jsonArtifact(
    "project-overview-baseline-gate",
    contracts.overview,
    { kind: "ProjectOverviewBaseline" },
  );
  const architecture = jsonArtifact(
    "architecture-baseline-gate",
    contracts.architecture,
    {
      kind: "ArchitectureBaseline",
      requirementsBaseline: requirements.ref,
      projectOverviewBaseline: overview.ref,
      sections: {
        architectureModel: {
          mode: "embedded",
          content: { elements: [{ id: "EL-ONE" }] },
        },
      },
    },
  );
  const contract = jsonArtifact(
    "CD-GATE-NONE",
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ContractDisposition,
    {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ContractDisposition",
      dispositionId: "CD-GATE-NONE",
      mode: "not-applicable",
      notApplicable: {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "ApprovedNotApplicable",
        approvalId: "ANA-GATE-CONTRACT",
        purpose: "contract-disposition",
        rationale: "The bounded Gate fixture has no interface contract.",
        authority: { id: "owner", role: "human-approver" },
        approvalEvidence: [
          {
            artifactId: "contract-na-evidence",
            schema: "https://devrelay.dev/evidence/approval/v1",
            mediaType: "application/json",
            digest: digest("8"),
            uri: "artifact://work-breakdown-gate/contract-na-evidence",
          },
        ],
      },
    },
  );
  const catalog = jsonArtifact(
    "CC-GATE",
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.CapabilityCatalog,
    {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "CapabilityCatalog",
      catalogId: "CC-GATE",
      version: "1.0.0",
      capabilities: [
        {
          id: "CAP-CODE",
          name: "Source change",
          type: "code",
          description: "Produce a bounded source change.",
          providerNeutral: true,
        },
      ],
    },
  );
  const repository = jsonArtifact(
    "repository-snapshot-gate",
    contracts.repository,
    {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "RepositorySnapshot",
      repository: "C:/example",
      revision: "abc123",
      treeDigest: digest("9"),
      includedPaths: ["src/**"],
      excludedPaths: ["node_modules/**"],
    },
  );
  const stateValue = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProjectWorkBreakdownState",
    stateId: "PWBS-GATE",
    state: "unbaselined",
    requirementsBaseline: requirements.ref,
    projectOverviewBaseline: overview.ref,
    architectureBaseline: architecture.ref,
    contractDisposition: contract.ref,
    capabilityCatalog: catalog.ref,
    repositoryContext: repository.ref,
  };
  const state = jsonArtifact(
    stateValue.stateId,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.ProjectWorkBreakdownState,
    stateValue,
  );
  const routeValue = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleRouteDecision",
    module: { id: "work-breakdown", version: "0.1.0" },
    state: {
      artifactId: state.ref.artifactId,
      schema: state.ref.schema,
      digest: state.ref.digest,
    },
    discriminator: { path: "/state", value: "unbaselined" },
    reasonCode: "WORK_BREAKDOWN_BASELINE_ABSENT",
    selection: { kind: "operation", operation: "establish-breakdown" },
  };
  const route = jsonArtifact("route-gate", contracts.route, routeValue);
  const loadedByPort = {
    "project-work-breakdown-state": state,
    "requirements-baseline": requirements,
    "project-overview-baseline": overview,
    "architecture-baseline": architecture,
    "contract-disposition": contract,
    "capability-catalog": catalog,
    "repository-context": repository,
  };
  const item = {
    id: "WI-ONE",
    objective: "Produce one bounded source change.",
    "bounded-scope": { included: ["The approved change."], excluded: [] },
    deliverables: [
      {
        id: "DEL-ONE",
        description: "One source change.",
        artifactKind: "source-change",
      },
    ],
    "work-type": "code-change",
    "acceptance-criterion-refs": noWork ? [] : ["AC-ONE"],
    "architecture-refs": ["EL-ONE"],
    "contract-refs": [],
    "required-capabilities": ["CAP-CODE"],
    "dependency-hints": [
      {
        "work-item-ref": "WI-UNKNOWN",
        relation: "after",
        rationale: "A non-authoritative downstream proposal.",
        authority: "hint",
      },
    ],
    "verification-plan": {
      checks: [
        {
          id: "VC-ONE",
          method: "Run one test.",
          successCriteria: "The acceptance criterion passes.",
        },
      ],
    },
    "required-evidence": [
      { kind: "test-report", description: "Exact test output." },
    ],
    "source-refs": [
      {
        role: "requirements-baseline",
        artifact: requirements.ref,
        jsonPointer: "/requirements/acceptanceCriteria/0",
      },
    ],
  };
  const candidateValue = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownDraft",
    draftId: "WBD-GATE",
    operation: "establish-breakdown",
    inputBindings: Object.entries(loadedByPort).map(([role, artifact]) => ({
      role,
      artifact: artifact.ref,
    })),
    workItems: [item],
    coverageDispositions: [
      noWork
        ? {
            scopeKind: "acceptance-criterion",
            scopeRef: "AC-ONE",
            disposition: "no-work-required",
            rationale: "Exact Gate approval is required.",
          }
        : {
            scopeKind: "acceptance-criterion",
            scopeRef: "AC-ONE",
            disposition: "planned",
            workItemRefs: ["WI-ONE"],
          },
      {
        scopeKind: "architecture",
        scopeRef: "EL-ONE",
        disposition: "planned",
        workItemRefs: ["WI-ONE"],
      },
    ],
    nativeArtifacts: [],
    sourceRefs: item["source-refs"],
  };
  const candidate = jsonArtifact(
    candidateValue.draftId,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownDraft,
    candidateValue,
  );
  const result = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleResult",
    invocationId: "invocation-work-breakdown-gate",
    status: "completed",
    outcome: "decomposed",
    outputs: { "work-breakdown-draft": [candidate.ref] },
    evidence: [
      {
        kind: "work-breakdown/contract-validation",
        subject: "work-breakdown-draft:WBD-GATE",
        status: "pass",
        artifact: candidate.ref,
        summary: "The candidate passed its canonical artifact contract.",
      },
      {
        kind: "work-breakdown/source-closure",
        subject: "work-breakdown-draft:WBD-GATE",
        status: "pass",
        artifact: candidate.ref,
        summary: "The candidate closes over exact invocation inputs.",
      },
    ],
    diagnostics,
  };
  const invocation = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleInvocation",
    invocationId: result.invocationId,
    runId: "run-work-breakdown-gate",
    nodeId: "work-breakdown",
    module: {
      id: "work-breakdown",
      version: "0.1.0",
      operation: "establish-breakdown",
    },
    plugin: { id: "openspec-tasks", version: "0.1.0" },
    inputs: {
      "project-work-breakdown-state": [state.ref],
      "routing-decision": [route.ref],
      "requirements-baseline": [requirements.ref],
      "project-overview-baseline": [overview.ref],
      "architecture-baseline": [architecture.ref],
      "contract-disposition": [contract.ref],
      "capability-catalog": [catalog.ref],
      "repository-context": [repository.ref],
    },
    options: {},
    config: {
      projectRoot: "C:/example",
      planningOutputRoot: "C:/example/planning",
      toolName: "OpenSpec",
      toolVersion: "fixture",
      changeName: "gate-fixture",
      schema: "devrelay-work-breakdown",
      artifact: "tasks.md",
      command: "/opsx:continue",
      bridge: "agent-command",
    },
    grants: [
      { kind: "filesystem.read", scope: "C:/example" },
      { kind: "filesystem.write", scope: "C:/example/planning" },
      { kind: "network.connect", scope: "host:implementation-engine" },
    ],
  };
  const artifactsById = new Map(
    [...Object.values(loadedByPort), route, candidate].map((artifact) => [
      artifact.ref.artifactId,
      artifact.bytes,
    ]),
  );
  const checkpoints = checkpointStore();
  let adapterCalls = 0;
  const runtimeContracts = [
    ...Object.values(contracts).filter(({ schema }) => schema !== contracts.route.schema).map(({ schema }) => ({
      schema,
      validate(value) {
        return value;
      },
    })),
    ...Object.values(WORK_BREAKDOWN_ARTIFACT_CONTRACTS).map(({ schema }) => ({
      schema,
      validate(value, context) {
        return validateWorkBreakdownArtifact(value, context);
      },
    })),
  ];
  const registry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: [
      {
        definition: pluginDefinition,
        adapter: {
          async invoke() {
            adapterCalls += 1;
            return clone(result);
          },
        },
      },
    ],
    artifactContracts: [
      ...new Map(runtimeContracts.map((entry) => [entry.schema, entry])).values(),
    ],
  });
  const artifacts = {
    async load(ref) {
      const bytes = artifactsById.get(ref.artifactId);
      if (!bytes) throw new Error(`missing artifact ${ref.artifactId}`);
      return Buffer.from(bytes);
    },
  };
  return {
    registry,
    invocation,
    result,
    artifacts,
    checkpoints,
    candidate,
    loadedByPort,
    calls: () => adapterCalls,
  };
}

async function verifiedFixture(options) {
  const runtime = fixture(options);
  await runtime.registry.execute(runtime.invocation, {
    artifacts: runtime.artifacts,
    checkpoints: runtime.checkpoints,
  });
  const checkpointReplay = await runtime.registry.verifyCheckpointedExecution(
    runtime.invocation,
    { artifacts: runtime.artifacts, checkpoints: runtime.checkpoints },
  );
  assert.equal(runtime.calls(), 1, "checkpoint replay must not invoke the adapter");
  return { runtime, checkpointReplay };
}

function gateEvidenceRef() {
  const bytes = Buffer.from("approved", "utf8");
  return artifactRef(
    "work-breakdown-gate-approval",
    {
      schema: "https://devrelay.dev/evidence/work-breakdown-gate/v1",
      mediaType: "text/plain",
    },
    bytes,
  );
}

function baselineRequest(runtime, checkpointReplay, noWorkApproval) {
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownBaseline",
    baselineId: "WBB-GATE",
    version: "1.0.0",
    approvedCandidate: runtime.candidate.ref,
    inputBindings: clone(runtime.candidate.value.inputBindings),
    workItems: clone(runtime.candidate.value.workItems),
    coverageDispositions: clone(runtime.candidate.value.coverageDispositions).map(
      (entry) =>
        entry.disposition === "no-work-required"
          ? { ...entry, approval: clone(noWorkApproval) }
          : entry,
    ),
    approvalEvidence: [gateEvidenceRef()],
    sourceRefs: clone(runtime.candidate.value.sourceRefs),
  };
  const bytes = Buffer.from(`${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  const ref = artifactRef(
    baseline.baselineId,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownBaseline,
    bytes,
  );
  return {
    checkpointReplay,
    baseline,
    baselineRef: ref,
    baselineBytes: bytes,
    noWorkApprovals: noWorkApproval ? [noWorkApproval] : [],
  };
}

function rebindBaseline(request) {
  request.baselineBytes = Buffer.from(
    `${JSON.stringify(request.baseline, null, 2)}\n`,
    "utf8",
  );
  request.baselineRef.digest = sha256Digest(request.baselineBytes);
}

async function verifiedChangeFixture() {
  const files = {
    "PWBS-AUTH-BASELINED-001":
      "examples/artifacts/project-work-breakdown-state-baselined-001.json",
    "work-breakdown-route-change-001":
      "examples/artifacts/module-route-decision-work-breakdown-change-001.json",
    "requirements-baseline-001":
      "examples/artifacts/requirements-baseline-001.json",
    "project-overview-baseline-001":
      "examples/artifacts/project-overview-baseline-001.json",
    "architecture-baseline-001":
      "examples/artifacts/architecture-baseline-001.json",
    "CD-AUTH-001":
      "examples/artifacts/contract-disposition-auth-001.json",
    "CC-WORK-BREAKDOWN-001":
      "examples/artifacts/capability-catalog-work-breakdown-001.json",
    "WBB-AUTH-001":
      "examples/artifacts/work-breakdown-baseline-auth-001.json",
    "ACP-AUTH-001":
      "examples/artifacts/approved-change-package-auth-001.json",
    "repository-snapshot-001":
      "examples/artifacts/repository-snapshot-001.json",
    "WBCS-AUTH-001":
      "examples/artifacts/work-breakdown-change-set-auth-001.json",
  };
  const store = new Map();
  const values = new Map();
  for (const [artifactId, relativePath] of Object.entries(files)) {
    const raw = await readFile(new URL(relativePath, root));
    store.set(artifactId, raw);
    values.set(artifactId, JSON.parse(raw.toString("utf8")));
  }
  const invocation = JSON.parse(
    await readFile(
      new URL(
        "examples/invocations/work-breakdown-decompose-change-001.invocation.json",
        root,
      ),
      "utf8",
    ),
  );
  const result = JSON.parse(
    await readFile(
      new URL(
        "examples/results/work-breakdown-decompose-change-001.result.json",
        root,
      ),
      "utf8",
    ),
  );
  const upstreamContracts = Object.values(invocation.inputs)
    .flat()
    .filter(
      ({ schema }) =>
        schema !== contracts.route.schema &&
        !Object.values(WORK_BREAKDOWN_ARTIFACT_CONTRACTS).some(
          (contract) => contract.schema === schema,
        ),
    )
    .map(({ schema }) => ({
      schema,
      validate(value) {
        return value;
      },
    }));
  const runtimeContracts = [
    ...upstreamContracts,
    ...Object.values(WORK_BREAKDOWN_ARTIFACT_CONTRACTS).map(({ schema }) => ({
      schema,
      validate(value, context) {
        return validateWorkBreakdownArtifact(value, context);
      },
    })),
  ];
  const checkpoints = checkpointStore();
  let adapterCalls = 0;
  const registry = createModuleRegistry({
    modules: [moduleDefinition],
    plugins: [
      {
        definition: pluginDefinition,
        adapter: {
          async invoke() {
            adapterCalls += 1;
            return clone(result);
          },
        },
      },
    ],
    artifactContracts: [
      ...new Map(runtimeContracts.map((entry) => [entry.schema, entry])).values(),
    ],
  });
  const artifacts = {
    async load(ref) {
      const raw = store.get(ref.artifactId);
      if (!raw) throw new Error(`missing artifact ${ref.artifactId}`);
      return Buffer.from(raw);
    },
  };
  await registry.execute(invocation, { artifacts, checkpoints });
  const checkpointReplay = await registry.verifyCheckpointedExecution(
    invocation,
    { artifacts, checkpoints },
  );
  assert.equal(adapterCalls, 1);
  return {
    checkpointReplay,
    candidate: values.get("WBCS-AUTH-001"),
    candidateRef: result.outputs["work-breakdown-change-set-draft"][0],
    previousBaseline: values.get("WBB-AUTH-001"),
    previousBaselineRef:
      invocation.inputs["current-work-breakdown-baseline"][0],
  };
}
test("Gate derives the candidate from a verified checkpoint and ignores dependency-hint semantics", async () => {
  const { checkpointReplay } = await verifiedFixture();
  const approved = await validateWorkBreakdownGateCandidate({ checkpointReplay });
  assert.equal(Object.isFrozen(approved), true);
  assert.equal(approved.operation, "establish-breakdown");
  assert.equal(approved.candidate.kind, "WorkBreakdownDraft");
  assert.equal(
    approved.candidate.workItems[0]["dependency-hints"][0]["work-item-ref"],
    "WI-UNKNOWN",
  );
});

test("Gate promotes only exact raw baseline bytes and returns an immutable commit payload", async () => {
  const { runtime, checkpointReplay } = await verifiedFixture();
  const request = baselineRequest(runtime, checkpointReplay);
  const promoted = await validateWorkBreakdownGatePromotion(request);
  assert.equal(Object.isFrozen(promoted), true);
  assert.deepEqual(promoted.baselineRef, request.baselineRef);
  assert.equal(
    promoted.commitPayload.baseline.bytesBase64,
    request.baselineBytes.toString("base64"),
  );
});

test("change promotion derives and applies the exact checkpointed current baseline", async () => {
  const active = await verifiedChangeFixture();
  const applied = applyWorkBreakdownChangeSet({
    baseline: active.previousBaseline,
    baselineRef: active.previousBaselineRef,
    changeSet: active.candidate,
  });
  const baseline = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkBreakdownBaseline",
    baselineId: "WBB-AUTH-002",
    version: "2.0.0",
    approvedCandidate: active.candidateRef,
    inputBindings: clone(active.candidate.inputBindings),
    workItems: clone(applied.workItems),
    coverageDispositions: clone(applied.coverageDispositions),
    approvalEvidence: [gateEvidenceRef()],
    sourceRefs: clone(active.candidate.sourceRefs),
  };
  const baselineBytes = Buffer.from(
    `${JSON.stringify(baseline, null, 2)}\n`,
    "utf8",
  );
  const baselineRef = artifactRef(
    baseline.baselineId,
    WORK_BREAKDOWN_ARTIFACT_CONTRACTS.WorkBreakdownBaseline,
    baselineBytes,
  );
  const promoted = await validateWorkBreakdownGatePromotion({
    checkpointReplay: active.checkpointReplay,
    baseline,
    baselineRef,
    baselineBytes,
  });
  assert.equal(promoted.operation, "decompose-change");
  assert.equal(promoted.baseline.version, "2.0.0");
  assert.equal(
    promoted.baseline.workItems.some(
      ({ id }) => id === "WI-AUTH-FAILURE-VERIFICATION",
    ),
    true,
  );
  assert.equal(
    promoted.baseline.workItems.some(
      ({ id }) => id === "WI-AUTH-FAILURE-TESTS",
    ),
    false,
  );
});
test("Gate rejects cloned receipts, plain ModuleResult data, and missing checkpoints", async () => {
  const { runtime, checkpointReplay } = await verifiedFixture();
  await assert.rejects(
    validateWorkBreakdownGateCandidate({
      checkpointReplay: clone(checkpointReplay),
    }),
    (error) =>
      error instanceof WorkBreakdownGateValidationError &&
      /verified checkpoint replay receipt/.test(error.message),
  );
  await assert.rejects(
    validateWorkBreakdownGateCandidate({ checkpointReplay: runtime.result }),
    WorkBreakdownGateValidationError,
  );

  const absent = fixture();
  await assert.rejects(
    () =>
      absent.registry.verifyCheckpointedExecution(absent.invocation, {
        artifacts: absent.artifacts,
        checkpoints: absent.checkpoints,
      }),
    (error) => error.code === "DR2213" && /exact terminal checkpoint/.test(error.message),
  );
  assert.equal(absent.calls(), 0);
});

test("Gate rejects stale candidate lineage and raw-byte digest or object substitution", async () => {
  const first = await verifiedFixture();
  const stale = baselineRequest(first.runtime, first.checkpointReplay);
  stale.baseline.approvedCandidate.digest = digest("f");
  rebindBaseline(stale);
  await assert.rejects(
    validateWorkBreakdownGatePromotion(stale),
    /approvedCandidate does not match the exact content-addressed artifact/,
  );

  const second = await verifiedFixture();
  const digestMismatch = baselineRequest(second.runtime, second.checkpointReplay);
  digestMismatch.baselineRef.digest = digest("0");
  await assert.rejects(
    validateWorkBreakdownGatePromotion(digestMismatch),
    /bytes do not match their ArtifactRef digest/,
  );

  const third = await verifiedFixture();
  const staleObject = baselineRequest(third.runtime, third.checkpointReplay);
  const changed = clone(staleObject.baseline);
  changed.version = "9.9.9";
  staleObject.baselineBytes = Buffer.from(
    `${JSON.stringify(changed, null, 2)}\n`,
    "utf8",
  );
  staleObject.baselineRef.digest = sha256Digest(staleObject.baselineBytes);
  await assert.rejects(
    validateWorkBreakdownGatePromotion(staleObject),
    /object does not match the exact raw JSON artifact/,
  );
});

test("no-work dispositions require exact separate Gate-owned approval and evidence", async () => {
  const { runtime, checkpointReplay } = await verifiedFixture({ noWork: true });
  const evidence = gateEvidenceRef();
  const approval = {
    authority: "work-breakdown-gate",
    candidate: runtime.candidate.ref,
    scopeKind: "acceptance-criterion",
    scopeRef: "AC-ONE",
    evidence,
  };
  await assert.rejects(
    validateWorkBreakdownGateCandidate({ checkpointReplay }),
    /lacks Gate approval/,
  );
  await assert.rejects(
    validateWorkBreakdownGateCandidate({
      checkpointReplay,
      noWorkApprovals: [approval],
      evidenceResolver: async () => ({ ref: runtime.candidate.ref }),
    }),
    /did not resolve the exact content-addressed evidence/,
  );
  const approved = await validateWorkBreakdownGateCandidate({
    checkpointReplay,
    noWorkApprovals: [approval],
    evidenceResolver: async (ref) => ({ ref }),
  });
  assert.deepEqual(approved.noWorkApprovals, [approval]);

  const request = baselineRequest(runtime, checkpointReplay, approval);
  request.evidenceResolver = async (ref) => ({ ref });
  const promotion = await validateWorkBreakdownGatePromotion(request);
  assert.equal(
    promotion.baseline.coverageDispositions[0].approval.authority,
    "work-breakdown-gate",
  );
});

test("blocking diagnostics are derived from replay and reject progression", async () => {
  const { checkpointReplay } = await verifiedFixture({
    diagnostics: [
      { severity: "error", code: "WB-BLOCK", message: "Blocking diagnostic." },
    ],
  });
  await assert.rejects(
    validateWorkBreakdownGateCandidate({ checkpointReplay }),
    /blocking diagnostics: WB-BLOCK/,
  );
});