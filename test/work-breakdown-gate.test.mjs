import { exerciseDependencyReplacement } from "./fixtures/local-dependency-replacement.mjs";
import { exerciseAssignmentReplacement } from "./fixtures/local-assignment-replacement.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonDigest } from "../src/content-digest.mjs";
import { createLocalHostStorage } from "../src/local-host-storage.mjs";
import { prepareLocalExecutionBaselines } from "../src/local-execution-baselines.mjs";
import { initializeLocalCompletionLedger } from "../src/local-completion-ledger.mjs";
import { deriveLocalWorkReadiness } from "../src/local-work-readiness.mjs";
import { createLocalHostTraceabilityStore } from "../src/local-host-traceability.mjs";
import { createLocalHostCheckpointStore } from "../src/local-host-checkpoints.mjs";
import { prepareLocalWorkDependencyRoute, verifyLocalWorkDependencyRoute } from "../src/local-work-dependency-planning.mjs";
import { createContextSlice } from "../src/work-dependency-snapshot.mjs";
import { createLocalWorkDependencyContext, verifyLocalWorkDependencyContext, materializeLocalWorkDependencyContext, assertLocalWorkDependencyContextCurrent } from "../src/local-work-dependency-context.mjs";
import { createSessionContextSnapshot, executeSessionBootstrap } from "../src/session-bootstrap.mjs";
import { executeLocalWorkDependencyPlanning, verifyLocalWorkDependencyExecution, LOCAL_NATIVE_DEPENDENCY_BINDING } from "../src/local-work-dependency-execution.mjs";
import { prepareLocalWorkDependencyGate } from "../src/local-work-dependency-gate.mjs";
import { createWorkDependencyActivationTraceabilityContributor } from "../src/work-dependency-traceability-contributor.mjs";
import { activateLocalDependencyBaseline, verifyLocalDependencyBaselineActivation, localDependencyBaselineHeadId, assertLocalDependencyBaselineCurrent } from "../src/local-dependency-baseline-activation.mjs";
import { prepareLocalSpecialistAssignmentInputs, verifyLocalSpecialistAssignmentInputs } from "../src/local-specialist-assignment-planning.mjs";
import { createLocalSpecialistAssignmentContext, verifyLocalSpecialistAssignmentContext, assertLocalSpecialistAssignmentContextCurrent, materializeLocalSpecialistAssignmentContext } from "../src/local-specialist-assignment-context.mjs";
import { executeLocalSpecialistAssignment, verifyLocalSpecialistAssignmentExecution } from "../src/local-specialist-assignment-execution.mjs";
import { SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING } from "../src/specialist-assignment-runtime-v3.mjs";
import { prepareSpecialistAssignmentGateV3 } from "../src/specialist-assignment-gate-v3.mjs";
import { createSpecialistAssignmentActivationTraceabilityContributor } from "../src/specialist-assignment-traceability-contributor.mjs";
import { activateLocalAssignmentBaseline, verifyLocalAssignmentBaselineActivation, assertLocalAssignmentBaselineCurrent, localAssignmentBaselineHeadId } from "../src/local-assignment-baseline-activation.mjs";
import { WORK_DEPENDENCY_ARTIFACT_CONTRACTS, workDependencyRuntimeArtifactContracts } from "../src/work-dependency-artifact-validator.mjs";
import { createTraceabilityGraphService } from "../src/traceability-graph.mjs";
import { TRACEABILITY_VOCABULARY_V1_8, TRACEABILITY_VOCABULARY_V1_9 } from "../src/traceability-artifact-validator.mjs";
import { localArchitectureHeadId } from "../src/local-discovery-activation.mjs";
import { localContractHeadId } from "../src/local-contract-activation.mjs";
import { activateLocalWorkBaseline, verifyLocalWorkBaselineActivation, localWorkBaselineHeadId, assertLocalWorkBaselineCurrent } from "../src/local-work-baseline-activation.mjs";
import { prepareLocalWorkBreakdownGate, verifyLocalWorkBreakdownGate } from "../src/local-work-breakdown-gate.mjs";
import { compileArtifactSchema } from "../src/schema-validation.mjs";
import { desktopWorkCandidate } from "./fixtures/desktop-work-candidate.mjs";
import { createWorkBreakdownApprovalTraceabilityContributor } from "../src/work-breakdown-traceability-contributor.mjs";

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

test("Desktop work Gate submission is closed and requires explicit baseline and coverage approvals", async () => {
  const read = async name => JSON.parse(await readFile(new URL(`contracts/${name}`, root), "utf8"));
  const validate = compileArtifactSchema(await read("desktop-work-breakdown-gate-submission.schema.json"),
    await Promise.all(["desktop-local-host-configuration.schema.json", "module-result.schema.json", "work-breakdown-artifacts.schema.json"].map(read)));
  const submission = { kind: "DesktopWorkBreakdownGateSubmission", baseline: { path: "baseline.json", ref: gateEvidenceRef() }, artifacts: [], noWorkApprovals: [] };
  assert.equal(validate(submission), true);
  assert.equal(validate({ ...submission, approveEverything: true }), false);
  assert.equal(validate({ ...submission, noWorkApprovals: undefined }), false);
  assert.equal(validate({ ...submission, noWorkApprovals: [{ authority: "adapter" }] }), false);
});

test("Desktop dependency context submission requires explicit policy and rejects undeclared controls", async () => {
  const read = async name => JSON.parse(await readFile(new URL(`contracts/${name}`, root), "utf8"));
  const validate = compileArtifactSchema(await read("desktop-dependency-context-submission.schema.json"),
    await Promise.all(["desktop-local-host-configuration.schema.json", "module-result.schema.json"].map(read)));
  const file = { path: "fixture.json", ref: gateEvidenceRef() };
  const submission = { kind: "DesktopDependencyContextSubmission", activationDigest: digest("a"), createdAt: "2026-09-14T00:00:00Z",
    contextSliceSet: file, policyBundle: file, artifacts: [] };
  assert.equal(validate(submission), true);
  assert.equal(validate({ ...submission, policyBundle: undefined }), false);
  assert.equal(validate({ ...submission, approveDependencies: true }), false);
  assert.equal(validate({ ...submission, activationDigest: "latest" }), false);
  const gateValidate = compileArtifactSchema(await read("desktop-dependency-gate-submission.schema.json"),
    await Promise.all(["desktop-local-host-configuration.schema.json", "module-result.schema.json"].map(read)));
  const gate = { kind: "DesktopDependencyGateSubmission", baseline: file, approval: file, artifacts: [] };
  assert.equal(gateValidate(gate), true);
  assert.equal(gateValidate({ ...gate, approval: undefined }), false);
  assert.equal(gateValidate({ ...gate, activate: true }), false);
});

test("Desktop assignment context submission requires explicit catalog, policy and activation", async () => {
  const read = async name => JSON.parse(await readFile(new URL(`contracts/${name}`, root), "utf8"));
  const validate = compileArtifactSchema(await read("desktop-assignment-context-submission.schema.json"),
    await Promise.all(["desktop-local-host-configuration.schema.json", "module-result.schema.json"].map(read)));
  const file = { path: "fixture.json", ref: gateEvidenceRef() };
  const submission = { kind: "DesktopAssignmentContextSubmission", activationDigest: digest("a"), createdAt: "2026-09-14T00:00:00Z",
    specialistCatalog: file, assignmentPolicy: file, artifacts: [] };
  assert.equal(validate(submission), true);
  for (const key of ["specialistCatalog", "assignmentPolicy", "activationDigest"]) assert.equal(validate({ ...submission, [key]: undefined }), false);
  assert.equal(validate({ ...submission, execute: true }), false);
  assert.equal(validate({ ...submission, activationDigest: "latest" }), false);
  const gateValidate = compileArtifactSchema(await read("desktop-assignment-gate-submission.schema.json"),
    await Promise.all(["desktop-local-host-configuration.schema.json", "module-result.schema.json"].map(read)));
  const gate = { kind: "DesktopAssignmentGateSubmission", approval: file, artifacts: [] };
  assert.equal(gateValidate(gate), true);
  assert.equal(gateValidate({ ...gate, approval: undefined }), false);
  assert.equal(gateValidate({ ...gate, activate: true }), false);
  const validateBinding = compileArtifactSchema((await read("desktop-local-host-configuration.schema.json")).properties.assignmentBinding);
  assert.equal(validateBinding(SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING), true);
  assert.equal(validateBinding({ ...SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING, command: "launch" }), false);
  assert.equal(validateBinding({ ...SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING, version: "latest" }), false);
});

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

function fixture({ noWork = false, diagnostics = [], cleanHints = false } = {}) {
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
    cleanHints ? {
      ...JSON.parse(readFileSync(new URL("../examples/artifacts/project-overview-baseline-001.json", import.meta.url))),
      baselineId: "project-overview-baseline-gate",
    } : { kind: "ProjectOverviewBaseline" },
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
      revision: cleanHints ? "0".repeat(40) : "abc123",
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
    "dependency-hints": cleanHints ? [] : [
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
    workItems: cleanHints ? [item, { ...clone(item), id: "WI-TWO",
      deliverables: [{ id: "DEL-TWO", description: "A dependent fixture change.", artifactKind: "source-change" }],
      "verification-plan": { checks: [{ id: "VC-TWO", method: "Run dependent fixture test.", successCriteria: "The dependent check passes." }] },
      "dependency-hints": [{ "work-item-ref": "WI-ONE", relation: "after", rationale: "The second fixture requires the first.", authority: "hint" }] }] : [item],
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
            workItemRefs: cleanHints ? ["WI-ONE", "WI-TWO"] : ["WI-ONE"],
          },
      {
        scopeKind: "architecture",
        scopeRef: "EL-ONE",
        disposition: "planned",
        workItemRefs: cleanHints ? ["WI-ONE", "WI-TWO"] : ["WI-ONE"],
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

async function activationFixture(t, replacement = false) {
  const { runtime, checkpointReplay } = await verifiedFixture({ cleanHints: true });
  const request = baselineRequest(runtime, checkpointReplay);
  const loadArtifact = async ref => ref.artifactId === request.baselineRef.artifactId
    ? request.baselineBytes : ref.artifactId === gateEvidenceRef().artifactId
      ? Buffer.from("approved") : runtime.artifacts.load(ref);
  const record = await prepareLocalWorkBreakdownGate({ ...request, loadArtifact });
  const rootDirectory = mkdtempSync(join(tmpdir(), "devrelay-work-activation-"));
  let storage = createLocalHostStorage({ rootDirectory });
  t.after(() => { storage.close(); rmSync(rootDirectory, { recursive: true, force: true }); });
  const namespace = "synthetic-work-gate-recovery";
  // Explicit test-only upstream projections: not evidence of real upstream approval.
  const seeds = [
    ["requirements/baseline", "acceptance-criterion", "requirements-baseline", "/requirements/acceptanceCriteria/0", { id: "AC-ONE" }],
    ["architecture/baseline", "architecture-element", "architecture-baseline", "/sections/architectureModel/content/elements/0", { id: "EL-ONE" }],
  ].map(([scope, kind, port, jsonPointer, entity], index) => ({
    metadata: { id: `test.work-upstream-${index}`, version: "1.0.0" },
    match: () => true, scope, authority: "approved",
    ownership: { scope, authority: "approved", nodeKinds: [kind], edgeKinds: [] },
    project(context) {
      const ref = context.loadedInputs[port][0].ref;
      return { horizon: "implementation", nodes: [{ kind, stableId: entity.id, label: entity.id,
        attributes: {}, sourceLocators: [{ artifact: { artifactId: ref.artifactId, digest: ref.digest }, jsonPointer, entityDigest: canonicalJsonDigest(entity) }] }], edges: [] };
    },
  }));
  const connect = (vocabulary = TRACEABILITY_VOCABULARY_V1_9, contributors = [...seeds, createWorkBreakdownApprovalTraceabilityContributor(), createWorkDependencyActivationTraceabilityContributor(), createSpecialistAssignmentActivationTraceabilityContributor()]) => createTraceabilityGraphService({ graphId: "work-activation", projectId: "fixture", vocabulary,
    store: createLocalHostTraceabilityStore({ storage, namespace, graphId: "work-activation" }),
    contributors });
  let graph = connect();
  const state = checkpointReplay.loadedInputs["project-work-breakdown-state"][0].ref;
  const boundary = { kind: "DesktopWorkBreakdownContextBoundary", state,
    route: checkpointReplay.loadedInputs["routing-decision"][0].ref,
    architectureState: runtime.loadedByPort["architecture-baseline"].ref,
    contractState: runtime.loadedByPort["contract-disposition"].ref, lifecycleComplete: false };
  for (const [runId, kind, ref] of [
    [localArchitectureHeadId(namespace), "LocalArchitectureHead", boundary.architectureState],
    [localContractHeadId(namespace), "LocalContractHead", boundary.contractState],
  ]) storage.initializeRun({ runId, state: { kind, state: ref, activationDigest: null, pendingCommit: null } });
  const args = () => ({ storage, namespace, graph, boundary, checkpointReplay, record, loadArtifact });
  assert.throws(() => assertLocalWorkBaselineCurrent({ storage, namespace, baseline: request.baselineRef }), { code: "DR4920" });
  await assert.rejects(activateLocalWorkBaseline({ ...args(), graph: connect(TRACEABILITY_VOCABULARY_V1_8) }),
    { code: "TG_INVALID_EDGE_AUTHORITY" }, "published 1.8 authority policy remains unchanged");
  assert.throws(() => storage.readRun(localWorkBaselineHeadId(namespace)), { code: "DR4920" });
  const approved = createWorkBreakdownApprovalTraceabilityContributor();
  const candidateSeed = { ...seeds[0], authority: "candidate", ownership: { ...seeds[0].ownership, authority: "candidate" } };
  const badSource = { ...approved, async project(context) {
    const projection = await approved.project(context);
    return { ...projection, edges: projection.edges.map(edge => edge.kind === "planned-by"
      ? { ...edge, source: { ...edge.source, authority: "candidate" } } : edge) };
  } };
  await assert.rejects(activateLocalWorkBaseline({ ...args(), graph: connect(TRACEABILITY_VOCABULARY_V1_9, [candidateSeed, seeds[1], badSource]) }),
    { code: "TG_INVALID_EDGE_AUTHORITY" }, "candidate requirements cannot authorize approved planned work");
  assert.throws(() => storage.readRun(localWorkBaselineHeadId(namespace)), { code: "DR4920" });
  let merges = 0;
  const originalGraph = graph;
  await assert.rejects(activateLocalWorkBaseline({ ...args(), graph: { ...graph, async mergePrepared(prepared) {
    assert.ok(createLocalHostCheckpointStore({ storage, namespace }).get(`work-baseline-activation:${record.commitDigest}`));
    assert.equal(storage.readRun(localWorkBaselineHeadId(namespace)).state.pendingCommit, record.commitDigest);
    merges++;
    await originalGraph.mergePrepared(prepared);
    throw new Error("interrupted after work graph merge");
  } } }), /interrupted after work graph merge/);
  storage.close();
  storage = createLocalHostStorage({ rootDirectory });
  graph = connect();
  const recoveredGraph = graph;
  graph = { ...graph, async mergePrepared(prepared) { merges++; return recoveredGraph.mergePrepared(prepared); } };
  const activated = await activateLocalWorkBaseline(args());
  assert.equal(merges, 1, "recovery must reuse the exact durable graph receipt");
  assert.deepEqual(activated.baseline, request.baselineRef);
  assert.deepEqual(storage.getArtifact(activated.storedBaseline), request.baselineBytes);
  const head = storage.readRun(localWorkBaselineHeadId(namespace));
  assert.equal(head.state.pendingCommit, null);
  assert.deepEqual(assertLocalWorkBaselineCurrent({ storage, namespace, baseline: request.baselineRef }), head);
  assert.throws(() => assertLocalWorkBaselineCurrent({ storage, namespace, baseline: { ...request.baselineRef, digest: digest("f") } }), /stale|substituted/);
  assert.deepEqual(await verifyLocalWorkBaselineActivation(args()), activated);
  assert.deepEqual(await activateLocalWorkBaseline(args()), activated);
  assert.deepEqual(storage.readRun(localWorkBaselineHeadId(namespace)), head, "historical replay cannot mutate the head");
  assert.equal(runtime.calls(), 1);
  const slices = jsonArtifact("CTXS-LOCAL", WORK_DEPENDENCY_ARTIFACT_CONTRACTS.ContextSliceSet,
    { apiVersion: "devrelay.dev/v1alpha1", kind: "ContextSliceSet", sliceSetId: "CTXS-LOCAL", slices: [createContextSlice({
      id: "CTX-LOCAL-WORK", purpose: "Inspect the complete approved fixture work item scope.",
      source: { ref: request.baselineRef, bytes: request.baselineBytes, value: request.baseline }, sourceKind: "WorkBreakdownBaseline",
      sourceVersion: { kind: "artifact-version", value: "1.0.0" }, selector: "/workItems", coveredRefs: request.baseline.workItems.map(item => item.id),
    })] });
  const wasmBytes = readFileSync(new URL("policies/work-dependency-analysis/policy.wasm", root));
  const wasmRef = artifactRef("policy-wasm", { schema: "https://devrelay.dev/native/wasm/v1", mediaType: "application/wasm" }, wasmBytes);
  const policy = jsonArtifact("OPA-LOCAL", WORK_DEPENDENCY_ARTIFACT_CONTRACTS.OpaPolicyBundle,
    { apiVersion: "devrelay.dev/v1alpha1", kind: "OpaPolicyBundle", policyId: "OPA-LOCAL", version: "1.0.0",
      wasm: wasmRef, entrypoint: "devrelay/work_dependency/decision", opaCompilerVersion: "1.16.2" });
  const dependencyModule = JSON.parse(await readFile(new URL("examples/modules/work-dependency-analysis.module.json", root), "utf8"));
  const dependencyRegistry = createModuleRegistry({ modules: [dependencyModule], plugins: [], artifactContracts: workDependencyRuntimeArtifactContracts() });
  const planningArgs = { ...args(), registry: dependencyRegistry, contextSliceSet: slices.ref, policyBundle: policy.ref,
    loadArtifact: ref => ref.artifactId === slices.ref.artifactId ? slices.bytes : ref.artifactId === policy.ref.artifactId ? policy.bytes
      : ref.artifactId === wasmRef.artifactId ? wasmBytes : loadArtifact(ref) };
  const planned = await prepareLocalWorkDependencyRoute(planningArgs);
  assert.equal(planned.route.selection.operation, "analyze-dependencies");
  assert.deepEqual(planned.state.snapshot.workItemIds, request.baseline.workItems.map(item => item.id).sort());
  assert.deepEqual(planned.state.snapshot.contextSlices[0].extractedContent, request.baseline.workItems);
  assert.deepEqual(JSON.parse(planned.state.bytes).workBreakdownBaseline, activated.baseline);
  assert.deepEqual(await prepareLocalWorkDependencyRoute(planningArgs), planned);
  const executionArgs = { ...planningArgs, binding: LOCAL_NATIVE_DEPENDENCY_BINDING, expectedState: planned.state };
  await assert.rejects(executeLocalWorkDependencyPlanning({ ...executionArgs, binding: undefined }), /explicit supported pinned/);
  const executedDependencies = await executeLocalWorkDependencyPlanning(executionArgs);
  assert.equal(executedDependencies.replayed, false);
  const dependencyReplay = await executeLocalWorkDependencyPlanning(executionArgs);
  assert.equal(dependencyReplay.replayed, true);
  assert.equal(dependencyReplay.executionFingerprint, executedDependencies.executionFingerprint);
  const dependencyReceipt = await verifyLocalWorkDependencyExecution({ ...executionArgs, execution: executedDependencies });
  assert.equal(dependencyReceipt.kind, "VerifiedWorkDependencyCheckpointReplayReceipt");
  await assert.rejects(verifyLocalWorkDependencyExecution({ ...executionArgs, execution: { ...executedDependencies, progressionAllowed: !executedDependencies.progressionAllowed } }), /result differs/);
  await assert.rejects(verifyLocalWorkDependencyExecution({ ...executionArgs, execution: { ...executedDependencies, executionId: "substituted" } }), /identity differs/);
  assert.deepEqual(await verifyLocalWorkDependencyRoute({ ...planningArgs, expectedState: planned.state }), planned);
  await assert.rejects(verifyLocalWorkDependencyRoute({ ...planningArgs, expectedState: { ...planned.state, bytes: Buffer.from("{}") } }), /differs from exact derivation/);
  await assert.rejects(prepareLocalWorkDependencyRoute({ ...planningArgs, policyBundle: undefined }), /explicit context slices and policy/);
  const driftedSlices = jsonArtifact("CTXS-LOCAL", WORK_DEPENDENCY_ARTIFACT_CONTRACTS.ContextSliceSet,
    { ...slices.value, slices: [{ ...slices.value.slices[0], sourceVersion: { kind: "artifact-version", value: "9.9.9" } }] });
  await assert.rejects(prepareLocalWorkDependencyRoute({ ...planningArgs, contextSliceSet: driftedSlices.ref,
    loadArtifact: ref => ref.artifactId === driftedSlices.ref.artifactId ? driftedSlices.bytes : planningArgs.loadArtifact(ref) }), /version or commit drifted/);
  await assert.rejects(prepareLocalWorkDependencyRoute({ ...planningArgs, loadArtifact: ref => ref.artifactId === wasmRef.artifactId ? Buffer.from("tampered") : planningArgs.loadArtifact(ref) }), { code: "DR2103" });
  const priorBoundary = jsonArtifact("work-session-boundary", { schema: "https://devrelay.dev/host/work-breakdown-context-boundary/v1", mediaType: "application/json" }, boundary);
  const contextBytes = Buffer.from("Synthetic retained memory context");
  const contextRef = artifactRef("retained-context", { schema: "https://example.test/context/v1", mediaType: "text/plain" }, contextBytes);
  const sessionLoad = ref => ref.artifactId === priorBoundary.ref.artifactId ? priorBoundary.bytes
    : ref.artifactId === contextRef.artifactId ? contextBytes : planningArgs.loadArtifact(ref);
  const priorSnapshot = createSessionContextSnapshot({ projectId: "fixture", taskId: "dependency-handoff", workspaceId: "fixture-workspace",
    repositoryRevision: "0".repeat(40), createdAt: "2026-09-14T00:00:00Z", roadmapDisposition: "RoadmapNotInitialized",
    bindings: [...["project-memory-baseline", "current-synopsis", "traceability-context", "ready-frontier", "project-overview-projection"].map(role => ({ role, artifact: contextRef, artifactVersion: "fixture" })),
      { role: "lifecycle-status", artifact: priorBoundary.ref, artifactVersion: "1.0.0" },
      { role: "requirements-baseline", artifact: checkpointReplay.loadedInputs["requirements-baseline"][0].ref, artifactVersion: "1.0.0" },
      { role: "project-overview", artifact: checkpointReplay.loadedInputs["project-overview-baseline"][0].ref, artifactVersion: "1.0.0" }] });
  const priorReceipt = await executeSessionBootstrap({ snapshot: priorSnapshot, artifactResolver: sessionLoad,
    expectedProjectId: priorSnapshot.projectId, expectedTaskId: priorSnapshot.taskId, expectedWorkspaceId: priorSnapshot.workspaceId, expectedRepositoryRevision: priorSnapshot.repositoryRevision });
  const contextArgs = { ...planningArgs, loadArtifact: sessionLoad, priorSnapshot, priorReceipt, createdAt: "2026-09-14T01:00:00Z" };
  const handoff = await createLocalWorkDependencyContext(contextArgs);
  assert.equal(handoff.files.length, 8);
  const dependencyBoundaryRef = handoff.snapshot.bindings.find(entry => entry.role === "lifecycle-status").artifact;
  const dependencyBoundary = JSON.parse(Buffer.from(handoff.files.find(entry => entry.ref.artifactId === dependencyBoundaryRef.artifactId).bytesBase64, "base64"));
  const guardArgs = { storage, namespace, boundary: dependencyBoundary, state: handoff.state };
  assert.doesNotThrow(() => assertLocalWorkDependencyContextCurrent(guardArgs));
  assert.throws(() => assertLocalWorkDependencyContextCurrent({ ...guardArgs, state: { ...handoff.state, digest: digest("f") } }), /exact session boundary/);
  assert.deepEqual(handoff.snapshot.bindings.find(entry => entry.role === "project-memory-baseline").artifact, contextRef);
  assert.equal(handoff.snapshot.bindings.some(entry => entry.role === "ready-frontier"), false);
  assert.deepEqual(await verifyLocalWorkDependencyContext({ ...contextArgs, handoff }), handoff);
  await assert.rejects(verifyLocalWorkDependencyContext({ ...contextArgs, handoff: { ...handoff, handoffDigest: digest("f") } }), /differs from exact derivation/);
  const descriptor = { path: "fixture.json", digest: contextRef.digest };
  const configuration = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopLocalHostConfiguration", projectId: priorSnapshot.projectId,
    taskId: priorSnapshot.taskId, workspaceRoot: rootDirectory, stateDirectory: "published", graphId: "fixture-graph",
    sessionSnapshot: descriptor, memoryManifest: "fixture-memory.json", memorySessionState: descriptor,
    contractSet: "work-breakdown", modules: [descriptor], plugins: [descriptor], artifacts: [], grants: [] };
  const resolvePath = relative => {
    assert.ok(relative.startsWith("published"));
    assert.equal(relative.includes(".."), false);
    return join(rootDirectory, relative);
  };
  const publicationArgs = { configuration, handoff, resolvePath };
  const published = materializeLocalWorkDependencyContext(publicationArgs);
  const publishedConfiguration = JSON.parse(readFileSync(published.configurationPath));
  assert.equal(publishedConfiguration.contractSet, "work-dependency");
  assert.equal(publishedConfiguration.traceabilityVocabularyVersion, "1.9.0");
  assert.ok(publishedConfiguration.artifacts.every(entry => existsSync(resolvePath(entry.path))));
  assert.deepEqual(materializeLocalWorkDependencyContext(publicationArgs), published);
  assert.deepEqual(materializeLocalWorkDependencyContext({ ...publicationArgs, verifyOnly: true,
    resolvePath: (relative, capability) => { assert.equal(capability, "filesystem.read"); return resolvePath(relative); } }), published);
  assert.throws(() => materializeLocalWorkDependencyContext({ ...publicationArgs, handoff: { ...handoff, lifecycleComplete: true } }), /drifted/);
  const dependencyCandidate = executedDependencies.candidate;
  assert.equal(executedDependencies.progressionAllowed, true);
  assert.equal(dependencyCandidate.edges.length, 1, "recovery must exercise a real prerequisite edge between approved work nodes");
  const approval = jsonArtifact("WDA-RECOVERY-APPROVAL", { schema: "https://devrelay.dev/evidence/work-dependency-gate-approval/v1", mediaType: "application/vnd.devrelay.work-dependency-gate-approval+json" },
    { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkDependencyGateApproval", approvalId: "WDA-RECOVERY-APPROVAL", authority: "project-owner", decision: "approve",
      policyVersion: "work-dependency-gate/0.1.0", candidate: executedDependencies.candidateRef, requiredEvidence: [gateEvidenceRef()] });
  const dependencyBaseline = jsonArtifact("WDB-RECOVERY", WORK_DEPENDENCY_ARTIFACT_CONTRACTS.WorkDependencyBaseline,
    { apiVersion: "devrelay.dev/v1alpha1", kind: "WorkDependencyBaseline", baselineId: "WDB-RECOVERY", version: "1.0.0", approvedCandidate: executedDependencies.candidateRef,
      workBreakdownBaseline: activated.baseline, nodes: dependencyCandidate.nodes, edges: dependencyCandidate.edges, graphDigest: dependencyCandidate.graphDigest,
      topologicalOrder: dependencyCandidate.topologicalOrder, policyEvidence: dependencyCandidate.policyDecisionSet,
      consistencyEvidence: dependencyCandidate.consistencyReview, approvalEvidence: [approval.ref], sourceRefs: dependencyCandidate.sourceRefs });
  const gateLoad = ref => ref.artifactId === approval.ref.artifactId ? approval.bytes : ref.artifactId === dependencyBaseline.ref.artifactId ? dependencyBaseline.bytes : executionArgs.loadArtifact(ref);
  const dependencyGate = await prepareLocalWorkDependencyGate({ replayReceipt: dependencyReceipt, baselineRef: dependencyBaseline.ref, approvalRef: approval.ref, loadArtifact: gateLoad });
  const activationArgs = () => ({ ...executionArgs, storage, graph, execution: executedDependencies, dependencyGate, loadArtifact: gateLoad });
  assert.throws(() => assertLocalDependencyBaselineCurrent({ storage, namespace, baseline: dependencyBaseline.ref }), { code: "DR4920" });
  const beforeDependencyGraph = graph;
  let dependencyMerges = 0;
  await assert.rejects(activateLocalDependencyBaseline({ ...activationArgs(), graph: { ...graph, async mergePrepared(prepared) {
    assert.ok(createLocalHostCheckpointStore({ storage, namespace }).get(`dependency-baseline-activation:${dependencyGate.commitDigest}`));
    assert.equal(storage.readRun(localDependencyBaselineHeadId(namespace)).state.pendingCommit, dependencyGate.commitDigest);
    dependencyMerges++;
    await beforeDependencyGraph.mergePrepared(prepared);
    throw new Error("interrupted dependency activation after merge");
  } } }), /interrupted dependency activation after merge/);
  storage.close();
  storage = createLocalHostStorage({ rootDirectory });
  graph = connect();
  const reopenedDependencyGraph = graph;
  graph = { ...graph, async mergePrepared(prepared) { dependencyMerges++; return reopenedDependencyGraph.mergePrepared(prepared); } };
  const dependencyActivated = await activateLocalDependencyBaseline(activationArgs());
  assert.equal(dependencyMerges, 1);
  const dependencyHead = storage.readRun(localDependencyBaselineHeadId(namespace));
  assert.equal(dependencyHead.state.pendingCommit, null);
  assert.deepEqual(assertLocalDependencyBaselineCurrent({ storage, namespace, baseline: dependencyBaseline.ref }), dependencyHead);
  assert.throws(() => assertLocalDependencyBaselineCurrent({ storage, namespace, baseline: { ...dependencyBaseline.ref, digest: digest("f") } }), /stale|substituted/);
  assert.deepEqual(storage.getArtifact(dependencyActivated.storedBaseline), dependencyBaseline.bytes);
  assert.deepEqual(await verifyLocalDependencyBaselineActivation(activationArgs()), dependencyActivated);
  assert.deepEqual(await activateLocalDependencyBaseline(activationArgs()), dependencyActivated);
  assert.deepEqual(storage.readRun(localDependencyBaselineHeadId(namespace)), dependencyHead);
  if (replacement === "dependency") {
    await exerciseDependencyReplacement({ initial: activationArgs(), initialActivation: dependencyActivated,
      context: { ...contextArgs, storage, graph, loadArtifact: ref => ref.artifactId === dependencyBaseline.ref.artifactId ? dependencyBaseline.bytes : sessionLoad(ref) },
      configuration, resolvePath, jsonArtifact, evidenceRef: gateEvidenceRef(),
      reopen() { storage.close(); storage = createLocalHostStorage({ rootDirectory }); graph = connect(); return { storage, graph }; } });
    return;
  }
  const specialists = jsonArtifact("SC-RECOVERY", { schema: "https://devrelay.dev/artifacts/specialist-catalog/v1", mediaType: "application/vnd.devrelay.specialist-catalog+json" },
    { kind: "SpecialistCatalog", catalogId: "SC-RECOVERY", profiles: [{ id: "FIXTURE-CODER", capabilityIds: ["CAP-CODE"], toolIds: [], grantIds: [] }] });
  const assignmentPolicy = jsonArtifact("AP-RECOVERY", { schema: "https://devrelay.dev/artifacts/assignment-policy/v1", mediaType: "application/vnd.devrelay.assignment-policy+json" },
    { kind: "AssignmentPolicy", policyId: "AP-RECOVERY", workItemRules: [], profilePriorities: [] });
  const assignmentArgs = { ...activationArgs(), specialistCatalog: specialists.ref, assignmentPolicy: assignmentPolicy.ref,
    loadArtifact: ref => ref.artifactId === specialists.ref.artifactId ? specialists.bytes : ref.artifactId === assignmentPolicy.ref.artifactId ? assignmentPolicy.bytes : gateLoad(ref) };
  const assignmentInputs = await prepareLocalSpecialistAssignmentInputs(assignmentArgs);
  assert.equal(assignmentInputs.plan.module.version, "3.0.0");
  assert.equal(assignmentInputs.plan.operation, "assign-specialists");
  assert.equal(assignmentInputs.plan.lifecycleComplete, false);
  assert.equal(Object.keys(assignmentInputs.loadedInputs).length, 7);
  for (const role of ["project-overview-baseline", "capability-catalog", "repository-context"]) {
    assert.deepEqual(assignmentInputs.plan.inputs[role], assignmentArgs.checkpointReplay.loadedInputs[role][0].ref);
    assert.deepEqual(assignmentInputs.loadedInputs[role][0].bytes, await assignmentArgs.loadArtifact(assignmentArgs.checkpointReplay.loadedInputs[role][0].ref));
  }
  assert.deepEqual(await verifyLocalSpecialistAssignmentInputs({ ...assignmentArgs, expectedPlan: assignmentInputs.plan }), assignmentInputs);
  await assert.rejects(prepareLocalSpecialistAssignmentInputs({ ...assignmentArgs, specialistCatalog: undefined }), /explicit specialist catalog/);
  await assert.rejects(prepareLocalSpecialistAssignmentInputs({ ...assignmentArgs,
    loadArtifact: ref => ref.artifactId === specialists.ref.artifactId ? Buffer.from("tampered") : assignmentArgs.loadArtifact(ref) }), { code: "DR2103" });
  await assert.rejects(verifyLocalSpecialistAssignmentInputs({ ...assignmentArgs, expectedPlan: { ...assignmentInputs.plan, lifecycleComplete: true } }), /violates its contract/);
  await assert.rejects(verifyLocalSpecialistAssignmentInputs({ ...assignmentArgs, expectedPlan: { ...assignmentInputs.plan,
    inputs: { ...assignmentInputs.plan.inputs, "specialist-catalog": { ...specialists.ref, digest: digest("f") } } } }), /differs from exact derivation/);
  const assignmentContextArgs = { ...assignmentArgs, priorSnapshot: handoff.snapshot, priorReceipt: handoff.receipt, createdAt: "2026-09-14T02:00:00Z",
    loadArtifact: ref => {
      const file = handoff.files.find(entry => canonicalJsonDigest(entry.ref) === canonicalJsonDigest(ref));
      return file ? Buffer.from(file.bytesBase64, "base64") : ref.artifactId === contextRef.artifactId ? contextBytes : assignmentArgs.loadArtifact(ref);
    } };
  const assignmentHandoff = await createLocalSpecialistAssignmentContext(assignmentContextArgs);
  assert.equal(assignmentHandoff.files.length, 8);
  assert.deepEqual(assignmentHandoff.plan, assignmentInputs.plan);
  for (const role of ["project-memory-baseline", "current-synopsis", "traceability-context", "requirements-baseline", "project-overview"]) {
    assert.deepEqual(assignmentHandoff.snapshot.bindings.find(entry => entry.role === role), handoff.snapshot.bindings.find(entry => entry.role === role));
  }
  assert.equal(assignmentHandoff.snapshot.bindings.some(entry => entry.role === "ready-frontier"), false);
  assert.deepEqual(assignmentHandoff.invalidatedBindings.map(entry => entry.role), ["lifecycle-status"]);
  const assignmentBoundaryRef = assignmentHandoff.snapshot.bindings.find(entry => entry.role === "lifecycle-status").artifact;
  const assignmentBoundary = JSON.parse(Buffer.from(assignmentHandoff.files.find(entry => entry.ref.artifactId === assignmentBoundaryRef.artifactId).bytesBase64, "base64"));
  const assignmentGuardArgs = { storage, namespace, boundary: assignmentBoundary, plan: assignmentHandoff.plan };
  const assignmentPublicationArgs = { configuration: publishedConfiguration, handoff: assignmentHandoff, resolvePath };
  const assignmentDirectory = join(rootDirectory, "published", "assignment-contexts", assignmentHandoff.handoffDigest.slice(7));
  let interruptedWrites = 0;
  assert.throws(() => materializeLocalSpecialistAssignmentContext({ ...assignmentPublicationArgs,
    resolvePath(relative, capability) {
      if (relative.endsWith("artifact-2") && capability === "filesystem.write" && ++interruptedWrites === 2) throw new Error("interrupted assignment publication");
      return resolvePath(relative);
    } }), /interrupted assignment publication/);
  assert.equal(existsSync(join(assignmentDirectory, "artifact-0")), true);
  assert.equal(existsSync(join(assignmentDirectory, "host.json")), false, "configuration must not publish before every context file");
  const assignmentPublished = materializeLocalSpecialistAssignmentContext(assignmentPublicationArgs);
  const assignmentConfigBytes = readFileSync(assignmentPublished.configurationPath);
  const assignmentConfiguration = JSON.parse(assignmentConfigBytes);
  assert.equal(assignmentConfiguration.contractSet, "specialist-assignment");
  assert.deepEqual(assignmentConfiguration.grants, publishedConfiguration.grants, "publication cannot add grants");
  assert.deepEqual(assignmentConfiguration.modules, publishedConfiguration.modules, "publication cannot install modules implicitly");
  assert.deepEqual(materializeLocalSpecialistAssignmentContext(assignmentPublicationArgs), assignmentPublished);
  assert.deepEqual(materializeLocalSpecialistAssignmentContext({ ...assignmentPublicationArgs, verifyOnly: true,
    resolvePath(relative, capability) { assert.equal(capability, "filesystem.read"); return resolvePath(relative); } }), assignmentPublished);
  assert.deepEqual(readFileSync(assignmentPublished.configurationPath), assignmentConfigBytes);
  assert.throws(() => materializeLocalSpecialistAssignmentContext({ ...assignmentPublicationArgs,
    handoff: { ...assignmentHandoff, lifecycleComplete: true } }), /publication identity or digest drifted/);
  assert.doesNotThrow(() => assertLocalSpecialistAssignmentContextCurrent(assignmentGuardArgs));
  assert.throws(() => assertLocalSpecialistAssignmentContextCurrent({ ...assignmentGuardArgs, plan: { ...assignmentHandoff.plan, lifecycleComplete: true } }), /exact session boundary/);
  assert.deepEqual(await verifyLocalSpecialistAssignmentContext({ ...assignmentContextArgs, handoff: assignmentHandoff }), assignmentHandoff);
  await assert.rejects(verifyLocalSpecialistAssignmentContext({ ...assignmentContextArgs, handoff: { ...assignmentHandoff, handoffDigest: digest("f") } }), /differs from exact derivation/);
  await assert.rejects(createLocalSpecialistAssignmentContext({ ...assignmentContextArgs,
    loadArtifact: ref => ref.artifactId === dependencyBoundaryRef.artifactId ? Buffer.from("{}") : assignmentContextArgs.loadArtifact(ref) }), /boundary bytes drifted/);
  const driftedAssignmentSnapshot = createSessionContextSnapshot({ ...handoff.snapshot, repositoryRevision: "1".repeat(40) });
  const driftedAssignmentReceipt = await executeSessionBootstrap({ snapshot: driftedAssignmentSnapshot, artifactResolver: assignmentContextArgs.loadArtifact,
    expectedProjectId: driftedAssignmentSnapshot.projectId, expectedTaskId: driftedAssignmentSnapshot.taskId,
    expectedWorkspaceId: driftedAssignmentSnapshot.workspaceId, expectedRepositoryRevision: driftedAssignmentSnapshot.repositoryRevision });
  await assert.rejects(createLocalSpecialistAssignmentContext({ ...assignmentContextArgs,
    priorSnapshot: driftedAssignmentSnapshot, priorReceipt: driftedAssignmentReceipt }), /repository revision differs from the session/);
  const assignmentExecutionArgs = { ...assignmentArgs, assignmentPlan: assignmentInputs.plan, assignmentBinding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING };
  const assigned = await executeLocalSpecialistAssignment(assignmentExecutionArgs);
  assert.equal(assigned.outcome, "assigned");
  assert.equal(assigned.draft.value.assignments.length, 2);
  assert.deepEqual(assigned.draft.value.inputBindings.find(entry => entry.role === "repository-context").artifact,
    assignmentInputs.plan.inputs["repository-context"]);
  assert.equal((await executeLocalSpecialistAssignment(assignmentExecutionArgs)).replayed, true);
  const assignedReceipt = await verifyLocalSpecialistAssignmentExecution({ ...assignmentExecutionArgs, assignmentExecution: assigned });
  assert.equal(assignedReceipt.checkpoint.receipt.outcome, "assigned");
  const assignmentApproval = jsonArtifact("SA-RECOVERY-APPROVAL", { schema: "https://devrelay.dev/evidence/specialist-assignment-gate-approval/v3", mediaType: "application/vnd.devrelay.specialist-assignment-gate-approval+json" },
    { apiVersion: "devrelay.dev/v1alpha1", kind: "SpecialistAssignmentGateApproval", approvalId: "SA-RECOVERY-APPROVAL",
      authority: "project-owner", decision: "approve", policyVersion: "specialist-assignment-gate/3.0.0", candidate: assigned.draft.ref,
      checkpointDigest: assignedReceipt.checkpointDigest, executionFingerprint: assignedReceipt.executionFingerprint, requiredEvidence: [gateEvidenceRef()] });
  const assignmentGate = await prepareSpecialistAssignmentGateV3({ checkpointReplay: assignedReceipt, approvalRef: assignmentApproval.ref,
    loadArtifact: ref => ref.digest === assignmentApproval.ref.digest ? assignmentApproval.bytes : assignmentArgs.loadArtifact(ref) });
  const baselineLoaded = { ref: assignmentGate.baseline.ref, value: assignmentGate.baseline.value, bytes: Buffer.from(assignmentGate.baseline.bytesBase64, "base64") };
  const draftLoaded = { ref: assigned.draft.ref, value: assigned.draft.value, bytes: Buffer.from(assigned.draft.bytesBase64, "base64") };
  const assignmentProjectionContext = { invocation: checkpointReplay.invocation, moduleResult: checkpointReplay.moduleResult,
    invocationFingerprint: canonicalJsonDigest({ invocation: checkpointReplay.invocation, gateCommit: assignmentGate.commitDigest }),
    loadedInputs: checkpointReplay.loadedInputs,
    loadedOutputs: { ...checkpointReplay.loadedOutputs, "work-breakdown-baseline": assignmentInputs.loadedInputs["work-breakdown-baseline"],
      "specialist-catalog": assignmentInputs.loadedInputs["specialist-catalog"], "specialist-assignment-baseline": [baselineLoaded], "specialist-assignment-draft": [draftLoaded] },
    gate: { id: "specialist-assignment-gate", version: "3.0.0", outcome: "promoted", commitDigest: assignmentGate.commitDigest, baseline: baselineLoaded.ref } };
  const assignmentContributor = createSpecialistAssignmentActivationTraceabilityContributor();
  const assignmentProjection = await assignmentContributor.project(assignmentProjectionContext);
  assert.equal(assignmentProjection.nodes.length, 1, "one catalog profile may serve multiple separately assigned work items");
  assert.equal(assignmentProjection.edges.length, 2);
  assert.ok(assignmentProjection.edges.every(edge => edge.source.authority === "approved" && edge.source.scope === "work-breakdown/baseline"));
  assert.ok(assignmentProjection.nodes[0].sourceLocators.every(locator => locator.artifact.digest === specialists.ref.digest));
  await assert.rejects(assignmentContributor.project({ ...assignmentProjectionContext, gate: undefined }), /owning v3 Gate/);
  await assert.rejects(assignmentContributor.project({ ...assignmentProjectionContext,
    gate: { ...assignmentProjectionContext.gate, baseline: { ...baselineLoaded.ref, digest: digest("f") } } }), /differs from the Gate/);
  await assert.rejects(assignmentContributor.project({ ...assignmentProjectionContext, loadedOutputs: { ...assignmentProjectionContext.loadedOutputs,
    "specialist-catalog": [{ ...assignmentInputs.loadedInputs["specialist-catalog"][0], ref: { ...specialists.ref, digest: digest("f") } }] } }), /specialist-catalog lineage/);
  const graphBeforeAssignmentPreparation = graph.captureBase();
  const preparedAssignmentGraph = await graph.prepare({ ...assignmentProjectionContext, baseGraph: graphBeforeAssignmentPreparation,
    resolveArtifact: async ref => { const loaded = [baselineLoaded, draftLoaded, ...Object.values(assignmentInputs.loadedInputs).flat()].find(entry => canonicalJsonDigest(entry.ref) === canonicalJsonDigest(ref));
      return { ref, bytes: loaded?.bytes ?? await assignmentArgs.loadArtifact(ref) }; } });
  assert.ok(preparedAssignmentGraph.checkpoint);
  assert.deepEqual(graph.captureBase(), graphBeforeAssignmentPreparation, "preparing approved assignment graph evidence does not activate it");
  const assignmentActivationArgs = () => ({ ...assignmentExecutionArgs, storage, graph, assignmentExecution: assigned, assignmentGate,
    loadArtifact: ref => ref.digest === assignmentApproval.ref.digest ? assignmentApproval.bytes : assignmentExecutionArgs.loadArtifact(ref) });
  assert.throws(() => assertLocalAssignmentBaselineCurrent({ storage, namespace, baseline: baselineLoaded.ref }), { code: "DR4920" });
  let assignmentMerges = 0;
  const graphBeforeAssignmentMerge = graph;
  await assert.rejects(activateLocalAssignmentBaseline({ ...assignmentActivationArgs(), graph: { ...graph, async mergePrepared(prepared) {
    assert.ok(createLocalHostCheckpointStore({ storage, namespace }).get(`assignment-baseline-activation:${assignmentGate.commitDigest}`));
    assert.equal(storage.readRun(localAssignmentBaselineHeadId(namespace)).state.pendingCommit, assignmentGate.commitDigest);
    assignmentMerges++;
    await graphBeforeAssignmentMerge.mergePrepared(prepared);
    throw new Error("interrupted assignment activation after merge");
  } } }), /interrupted assignment activation after merge/);
  storage.close();
  storage = createLocalHostStorage({ rootDirectory });
  graph = connect();
  const reopenedAssignmentGraph = graph;
  graph = { ...graph, async mergePrepared(prepared) { assignmentMerges++; return reopenedAssignmentGraph.mergePrepared(prepared); } };
  for (const request of [planningArgs, executionArgs, contextArgs, guardArgs, assignmentArgs, assignmentExecutionArgs, assignmentContextArgs, assignmentGuardArgs]) {
    request.storage = storage; request.graph = graph;
  }
  const assignmentActivated = await activateLocalAssignmentBaseline(assignmentActivationArgs());
  assert.equal(assignmentMerges, 1);
  assert.deepEqual(storage.getArtifact(assignmentActivated.storedBaseline), baselineLoaded.bytes);
  const assignmentHead = assertLocalAssignmentBaselineCurrent({ storage, namespace, baseline: baselineLoaded.ref });
  assert.equal(assignmentHead.state.pendingCommit, null);
  assert.throws(() => assertLocalAssignmentBaselineCurrent({ storage, namespace, baseline: { ...baselineLoaded.ref, digest: digest("f") } }), /stale or substituted/);
  assert.deepEqual(await verifyLocalAssignmentBaselineActivation(assignmentActivationArgs()), assignmentActivated);
  assert.deepEqual(await activateLocalAssignmentBaseline(assignmentActivationArgs()), assignmentActivated);
  const executionBaselines = await prepareLocalExecutionBaselines(assignmentActivationArgs());
  assert.deepEqual(executionBaselines.specialistAssignmentBaseline, assignmentActivated.baseline);
  assert.deepEqual(executionBaselines.workBreakdownBaseline, assignmentActivationArgs().record.baseline.ref);
  const readinessRequest = { storage, namespace, baselines: executionBaselines,
    verifyIntegration: async () => assert.fail("empty completion ledger must not invoke integration"),
    loadArtifact: assignmentActivationArgs().loadArtifact };
  initializeLocalCompletionLedger(readinessRequest);
  const readiness = await deriveLocalWorkReadiness(readinessRequest);
  assert.deepEqual(readiness.readyWorkItemIds, ["WI-ONE"]);
  assert.deepEqual(readiness.dispositions.find(item => item.workItemId === "WI-TWO").blockingWorkItemIds, ["WI-ONE"]);
  await assert.rejects(prepareLocalExecutionBaselines({ ...assignmentActivationArgs(), baselines: executionBaselines }), /overrides are forbidden/);
  if (replacement) {
    await exerciseAssignmentReplacement({ initial: assignmentActivationArgs(), initialActivation: assignmentActivated, jsonArtifact, evidenceRef: gateEvidenceRef() });
    return;
  }
  const assignmentLease = storage.acquireLease({ runId: assignmentHead.runId, owner: "test-next-assignment-gate", expectedVersion: assignmentHead.version, durationMilliseconds: 120000 });
  storage.commitTransition({ runId: assignmentHead.runId, expectedVersion: assignmentHead.version, leaseToken: assignmentLease.token,
    transition: { kind: "TestPendingNextAssignmentGate" }, nextState: { ...assignmentHead.state, pendingCommit: digest("c") } });
  storage.releaseLease({ runId: assignmentHead.runId, leaseToken: assignmentLease.token });
  const pendingAssignment = storage.readRun(assignmentHead.runId);
  assert.throws(() => assertLocalAssignmentBaselineCurrent({ storage, namespace, baseline: baselineLoaded.ref }), /pending assignment Gate needs recovery/);
  await assert.rejects(prepareLocalExecutionBaselines(assignmentActivationArgs()), /pending assignment Gate needs recovery/);
  assert.deepEqual(await activateLocalAssignmentBaseline(assignmentActivationArgs()), assignmentActivated);
  assert.deepEqual(storage.readRun(assignmentHead.runId), pendingAssignment, "historical activation must not clear later pending assignment approval");
  await assert.rejects(executeLocalSpecialistAssignment({ ...assignmentExecutionArgs, assignmentBinding: undefined }), /explicit supported native binding/);
  await assert.rejects(verifyLocalSpecialistAssignmentExecution({ ...assignmentExecutionArgs,
    assignmentExecution: { ...assigned, lifecycleComplete: true } }), /differs from durable checkpoint/);
  const independentStorage = createLocalHostStorage({ rootDirectory });
  try {
    const reread = await verifyLocalSpecialistAssignmentExecution({ ...assignmentExecutionArgs, storage: independentStorage, assignmentExecution: assigned });
    assert.equal(reread.checkpointDigest, assignedReceipt.checkpointDigest, "independent storage connection reads the exact persisted assignment checkpoint");
  } finally { independentStorage.close(); }
  const nextAssignmentPolicy = jsonArtifact("AP-RECOVERY-NEXT", assignmentPolicy.ref,
    { kind: "AssignmentPolicy", policyId: "AP-RECOVERY-NEXT", workItemRules: [], profilePriorities: [] });
  const nextAssignmentArgs = { ...assignmentArgs, assignmentPolicy: nextAssignmentPolicy.ref,
    loadArtifact: ref => ref.digest === nextAssignmentPolicy.ref.digest ? nextAssignmentPolicy.bytes : assignmentArgs.loadArtifact(ref) };
  const nextAssignmentPlan = await prepareLocalSpecialistAssignmentInputs(nextAssignmentArgs);
  const dependencyLease = storage.acquireLease({ runId: dependencyHead.runId, owner: "test-next-dependency-gate", expectedVersion: dependencyHead.version, durationMilliseconds: 120000 });
  storage.commitTransition({ runId: dependencyHead.runId, expectedVersion: dependencyHead.version, leaseToken: dependencyLease.token,
    transition: { kind: "TestPendingNextDependencyGate" }, nextState: { ...dependencyHead.state, pendingCommit: digest("b") } });
  storage.releaseLease({ runId: dependencyHead.runId, leaseToken: dependencyLease.token });
  const pendingDependency = storage.readRun(dependencyHead.runId);
  assert.throws(() => assertLocalDependencyBaselineCurrent({ storage, namespace, baseline: dependencyBaseline.ref }), /pending dependency Gate needs recovery/);
  await assert.rejects(prepareLocalSpecialistAssignmentInputs(assignmentArgs), /pending dependency Gate needs recovery/);
  await assert.rejects(createLocalSpecialistAssignmentContext(assignmentContextArgs), /pending dependency Gate needs recovery/);
  assert.throws(() => assertLocalSpecialistAssignmentContextCurrent(assignmentGuardArgs), /pending dependency Gate needs recovery/);
  await assert.rejects(executeLocalSpecialistAssignment({ ...nextAssignmentArgs, assignmentPlan: nextAssignmentPlan.plan,
    assignmentBinding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING }), /pending dependency Gate needs recovery/);
  assert.equal((await executeLocalSpecialistAssignment(assignmentExecutionArgs)).replayed, true, "exact assigned execution replays without fresh progression during pending approval");
  assert.equal((await verifyLocalSpecialistAssignmentExecution({ ...assignmentExecutionArgs, assignmentExecution: assigned })).checkpointDigest, assignedReceipt.checkpointDigest);
  assert.deepEqual(await verifyLocalSpecialistAssignmentContext({ ...assignmentContextArgs, handoff: assignmentHandoff }), assignmentHandoff);
  assert.deepEqual(await verifyLocalSpecialistAssignmentInputs({ ...assignmentArgs, expectedPlan: assignmentInputs.plan }), assignmentInputs);
  assert.deepEqual(await verifyLocalDependencyBaselineActivation(activationArgs()), dependencyActivated);
  assert.deepEqual(await activateLocalDependencyBaseline(activationArgs()), dependencyActivated);
  assert.deepEqual(storage.readRun(dependencyHead.runId), pendingDependency, "historical assignment preparation and activation replay must not clear a later pending dependency Gate");
  // The remaining checks retain their exact arguments after reopening storage.
  for (const request of [planningArgs, executionArgs, contextArgs, guardArgs]) { request.storage = storage; request.graph = graph; }
  const lease = storage.acquireLease({ runId: head.runId, owner: "test-next-gate", expectedVersion: head.version, durationMilliseconds: 120000 });
  storage.commitTransition({ runId: head.runId, expectedVersion: head.version, leaseToken: lease.token,
    transition: { kind: "TestPendingNextGate" }, nextState: { ...head.state, pendingCommit: digest("a") } });
  storage.releaseLease({ runId: head.runId, leaseToken: lease.token });
  const pending = storage.readRun(head.runId);
  assert.throws(() => assertLocalWorkBaselineCurrent({ storage, namespace, baseline: request.baselineRef }), /needs recovery/);
  await assert.rejects(prepareLocalWorkDependencyRoute(planningArgs), /needs recovery/);
  await assert.rejects(createLocalWorkDependencyContext(contextArgs), /needs recovery/);
  assert.throws(() => assertLocalWorkDependencyContextCurrent(guardArgs), /needs recovery/);
  assert.equal((await executeLocalWorkDependencyPlanning(executionArgs)).replayed, true, "exact persisted execution remains replayable during later pending approval");
  assert.deepEqual(await verifyLocalWorkDependencyContext({ ...contextArgs, handoff }), handoff);
  assert.deepEqual(await verifyLocalWorkDependencyRoute({ ...planningArgs, expectedState: planned.state }), planned);
  assert.deepEqual(await verifyLocalWorkBaselineActivation(args()), activated);
  assert.deepEqual(await activateLocalWorkBaseline(args()), activated);
  assert.deepEqual(storage.readRun(head.runId), pending, "historical replay must not clear a later pending Gate");
}

test("work baseline activation recovers after graph merge with genuine Core receipt and reopened storage", t => activationFixture(t));
test("assignment replacement requires exact evidence and recovers through genuine runtime and Gate", t => activationFixture(t, true));

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

test("local work Gate binds genuine replay and raw approval evidence", async () => {
  const { runtime, checkpointReplay } = await verifiedFixture();
  const request = baselineRequest(runtime, checkpointReplay);
  const evidenceBytes = Buffer.from("Synthetic WorkBreakdown review evidence, not owner acceptance.");
  const evidenceRef = { ...gateEvidenceRef(), digest: sha256Digest(evidenceBytes) };
  request.baseline.approvalEvidence = [evidenceRef];
  rebindBaseline(request);
  const loadArtifact = ref => ref.artifactId === request.baselineRef.artifactId ? request.baselineBytes : evidenceBytes;
  const args = { checkpointReplay, baselineRef: request.baselineRef, loadArtifact };
  const record = await prepareLocalWorkBreakdownGate(args);
  assert.equal(record.scope, "validated-work-breakdown-baseline");
  assert.equal(record.lifecycleComplete, false);
  assert.deepEqual(await verifyLocalWorkBreakdownGate({ ...args, record }), record);
  const contributor = createWorkBreakdownApprovalTraceabilityContributor();
  const context = { invocation: checkpointReplay.invocation, moduleResult: checkpointReplay.moduleResult,
    loadedInputs: checkpointReplay.loadedInputs, loadedOutputs: { ...checkpointReplay.loadedOutputs,
      "work-breakdown-baseline": [{ ref: request.baselineRef, bytes: request.baselineBytes, value: request.baseline }] },
    gate: { id: "work-breakdown-gate", outcome: "promoted", commitDigest: record.commitDigest, baseline: request.baselineRef, noWorkApprovals: [] } };
  assert.equal(contributor.match(context), true);
  assert.equal(contributor.match({ ...context, gate: undefined }), false);
  const projection = await contributor.project(context);
  assert.equal(projection.nodes.filter(node => node.kind === "work-item").length, request.baseline.workItems.length);
  assert.ok(projection.edges.every(edge => edge.target.authority === "approved" && edge.target.scope === "work-breakdown/baseline"));
  await assert.rejects(contributor.project({ ...context, gate: { ...context.gate, baseline: { ...request.baselineRef, artifactId: "substituted" } } }), /differs/);
  await assert.rejects(prepareLocalWorkBreakdownGate({ ...args, checkpointReplay: { ...checkpointReplay },
    loadArtifact: () => { throw new Error("must reject before loading"); } }), /receipt|checkpoint/i);
  await assert.rejects(prepareLocalWorkBreakdownGate({ ...args, loadArtifact: ref => ref.artifactId === request.baselineRef.artifactId ? request.baselineBytes : Buffer.from("substituted") }), /match|digest/i);
  await assert.rejects(verifyLocalWorkBreakdownGate({ ...args, record: { ...record, lifecycleComplete: true } }), /contract/);
});

test("Desktop candidate fixture closes every exact approved scope without claiming completion", async () => {
  const { checkpointReplay } = await verifiedFixture();
  const candidate = desktopWorkCandidate({ loadedInputs: checkpointReplay.loadedInputs, nativeRef: gateEvidenceRef() });
  assert.ok(candidate.workItems.length > 0);
  assert.equal(candidate.workItems.length, candidate.coverageDispositions.length);
  assert.ok(candidate.coverageDispositions.every(entry => entry.disposition === "planned"));
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

test("dependency replacement preserves exact predecessor and recovers genuine Gate publication", t => activationFixture(t, "dependency"));
