// Synthetic test approvals, never owner acceptance. Every promotion below is
// derived from a real Core checkpoint replay using the owning runtime contracts.
// The existing authentication sample supplies real artifact contracts; arithmetic
// workspace tests exercise only preflight mechanics, not fulfillment of its ACs.
import { readFile } from "node:fs/promises";
import { canonicalJson, sha256Digest } from "../src/content-digest.mjs";
import { createModuleRegistry } from "../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../src/requirements-runtime-contracts.mjs";
import { architectureRuntimeArtifactContracts } from "../src/architecture-runtime-contracts.mjs";
import { workBreakdownRuntimeArtifactContracts } from "../src/work-breakdown-runtime-contracts.mjs";
import { validateRequirementsGatePromotion } from "../src/requirements-gate.mjs";
import { validateArchitectureGatePromotion } from "../src/architecture-gate.mjs";
import { validateWorkBreakdownGatePromotion } from "../src/work-breakdown-gate.mjs";
import { registerArchitectureNativeBytes } from "./native-architecture-fixtures.mjs";

const root = new URL("../", import.meta.url);
const apiVersion = "devrelay.dev/v1alpha1";
const readJson = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const clone = value => structuredClone(value);
const artifactSchema = name => `https://devrelay.dev/artifacts/${name}/v1`;
const artifactMediaType = name => `application/vnd.devrelay.${name}+json`;

export const governedCriterionIds = ["AC-AUTH-001", "AC-AUTH-DISCLOSURE-001", "AC-AUTH-PERFORMANCE-001"];
export const defaultGovernedChangeCard = {
  workItemId: "WI-CODING", criterionIds: governedCriterionIds,
  readPaths: ["add.mjs", "test/add.test.mjs"], writePaths: ["add.mjs"], testFiles: ["test/add.test.mjs"],
  reuse: { disposition: "not-applicable", rationale: "The synthetic bounded arithmetic fixture introduces no reusable component.", paths: [] },
};

function checkpointStore(values = new Map()) {
  return { async get(key) { return values.get(key); }, async put(key, value) { values.set(key, value); } };
}

function stepResult(invocation, body) {
  return { apiVersion, kind: "ModuleStepResult", invocationId: invocation.invocationId,
    invocationFingerprint: invocation.invocationFingerprint, chainFingerprint: invocation.chainFingerprint,
    stepInvocationDigest: invocation.stepInvocationDigest, step: invocation.step, plugin: invocation.plugin, ...body };
}

// Rebind only synthetic fixture lineage before any Core execution. Existing
// immutable project artifacts are never edited or promoted by this helper.
async function rebindFixtureRepository(bytesById, repositoryRevision, repositoryTreeDigest) {
  if (!repositoryRevision && !repositoryTreeDigest) return value => clone(value);
  if (!/^[0-9a-f]{40,64}$/.test(repositoryRevision ?? "") || !/^sha256:[0-9a-f]{64}$/.test(repositoryTreeDigest ?? "")) {
    throw new Error("Synthetic repository fixture requires an exact revision and tree digest");
  }
  const original = JSON.parse(bytesById.get("repository-snapshot-001"));
  const records = new Map();
  function references(value, found = []) {
    if (!value || typeof value !== "object") return found;
    if (typeof value.artifactId === "string" && typeof value.digest === "string") found.push(value);
    for (const child of Object.values(value)) references(child, found);
    return found;
  }
  // Materialize the original source closure first, including discovery history.
  for (const [id, bytes] of bytesById) {
    let value;
    try { value = JSON.parse(bytes); } catch { continue; }
    records.set(id, value);
    for (const ref of references(value)) if (!bytesById.has(ref.artifactId)) {
      if (!/^[A-Za-z0-9-]+$/.test(ref.artifactId)) throw new Error("Unsafe fixture reference");
      const bytes = await readFile(new URL(`examples/artifacts/${ref.artifactId}.json`, root));
      if (sha256Digest(bytes) !== ref.digest) throw new Error("Original fixture closure digest mismatch");
      bytesById.set(ref.artifactId, bytes);
    }
  }
  const complete = new Set();
  const visiting = new Set();
  function replace(value) {
    if (value === original.revision) return repositoryRevision;
    if (value === original.treeDigest) return repositoryTreeDigest;
    if (!value || typeof value !== "object") return value;
    const next = Array.isArray(value) ? value.map(replace) : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replace(child)]));
    if (typeof next.artifactId === "string" && typeof next.digest === "string" && bytesById.has(next.artifactId)) {
      rewrite(next.artifactId);
      next.digest = sha256Digest(bytesById.get(next.artifactId));
    }
    return next;
  }
  function rewrite(id) {
    if (complete.has(id) || !records.has(id)) return;
    if (visiting.has(id)) throw new Error("Synthetic fixture artifact reference cycle: " + id);
    visiting.add(id);
    const old = records.get(id);
    const next = replace(old);
    if (canonicalJson(old) !== canonicalJson(next)) bytesById.set(id, Buffer.from(`${JSON.stringify(next, null, 2)}\n`));
    visiting.delete(id);
    complete.add(id);
  }
  for (const id of records.keys()) rewrite(id);
  return replace;
}

/** A fixture-only host with current heads independent of the coding request. */
export async function createGovernedCodingFixture(cardValue = defaultGovernedChangeCard, { repositoryNotApplicable = false, repositoryRevision, repositoryTreeDigest } = {}) {
  const bytesById = new Map();
  const checkpoints = new Map();
  function addBytes(artifactId, bytes, schema, mediaType = "application/json") {
    bytes = Buffer.from(bytes);
    bytesById.set(artifactId, bytes);
    return { artifactId, schema, mediaType, digest: sha256Digest(bytes), uri: `artifact://governed-coding-test/${artifactId}` };
  }
  function add(artifactId, value, name) {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    registerArchitectureNativeBytes(value, bytesById);
    return { value, bytes, ref: addBytes(artifactId, bytes, artifactSchema(name), artifactMediaType(name)) };
  }
  async function fixtureDocument(artifactId, file = artifactId) {
    const bytes = await readFile(new URL(`examples/artifacts/${file}.json`, root));
    const value = JSON.parse(bytes);
    bytesById.set(artifactId, bytes);
    registerArchitectureNativeBytes(value, bytesById);
    return { value, bytes };
  }
  const artifacts = { async load(ref) {
    const bytes = bytesById.get(ref.artifactId);
    if (!bytes) throw new Error(`Missing exact fixture artifact ${ref.artifactId}`);
    return Buffer.from(bytes);
  } };
  async function replay(registry, invocation) {
    const context = { artifacts, checkpoints: checkpointStore(checkpoints) };
    await registry.execute(invocation, context);
    return registry.verifyCheckpointedExecution(invocation, context);
  }

  // Requirements fixture uses the published full-body requirements and overview,
  // not a permissive stand-in artifact validator.
  const [requirementsDocument, overviewDocument] = await Promise.all([
    fixtureDocument("requirements-baseline-001"), fixtureDocument("project-overview-baseline-001"),
  ]);
  await Promise.all(["goal-001", "project-context-001", "repository-snapshot-001", "requirements-draft-001",
    "project-overview-draft-001", "project-architecture-state-existing-discovered-001", "current-architecture-snapshot-001",
    "module-route-decision-establish-001", "architecture-designer-working-001", "architecture-modeler-working-001",
    "architecture-draft-001"].map(name => fixtureDocument(name)));
  await fixtureDocument("native-source-openspec-001", "native-source-bundle-001");
  const markdownBytes = await readFile(new URL("examples/artifacts/ProjectOverview.md", root));
  bytesById.set("project-overview-md-001", markdownBytes);
  bytesById.set("openspec-proposal-001", await readFile(new URL("examples/native/openspec/proposal.md", root)));
  bytesById.set("requirements-approval-001", await readFile(new URL("examples/artifacts/requirements-approval-001.md", root)));
  const replaceSourceRefs = await rebindFixtureRepository(bytesById, repositoryRevision, repositoryTreeDigest);
  for (const [document, id] of [[requirementsDocument, "requirements-baseline-001"], [overviewDocument, "project-overview-baseline-001"]]) {
    document.bytes = bytesById.get(id); document.value = JSON.parse(document.bytes);
  }
  const requirementsInvocation = replaceSourceRefs(await readJson("examples/invocations/requirements-openspec.invocation.json"));
  const requirementsResult = replaceSourceRefs(await readJson("examples/results/requirements-openspec.result.json"));
  const requirementsRegistry = createModuleRegistry({
    modules: [await readJson("examples/modules/requirements-gathering.module.json")],
    plugins: [{ definition: await readJson("examples/plugins/openspec.plugin.json"),
      adapter: { async invoke() { return clone(requirementsResult); } } }],
    artifactContracts: requirementsRuntimeArtifactContracts(),
  });
  const architectureInvocation = replaceSourceRefs(await readJson("examples/invocations/architecture-establish-baseline.invocation.json"));
  const requirements = {
    checkpointReplay: await replay(requirementsRegistry, requirementsInvocation),
    requirementsBaseline: requirementsDocument.value,
    requirementsBaselineRef: clone(architectureInvocation.inputs["requirements-baseline"][0]),
    requirementsBaselineBytes: requirementsDocument.bytes,
    projectOverviewBaseline: overviewDocument.value,
    projectOverviewBaselineRef: clone(architectureInvocation.inputs["project-overview-baseline"][0]),
    projectOverviewBaselineBytes: overviewDocument.bytes,
    projectOverviewMarkdownBytes: markdownBytes,
  };
  validateRequirementsGatePromotion(requirements);

  // Exercise the real configured designer -> modeler -> decision-recorder chain.
  const architectureResult = replaceSourceRefs(await readJson("examples/results/architecture-establish-baseline.result.json"));
  const draft = JSON.parse(bytesById.get("architecture-draft-001"));
  const designerRef = JSON.parse(bytesById.get("architecture-modeler-working-001")).designerWorkingArtifact;
  const modelerBytes = bytesById.get("architecture-modeler-working-001");
  const modelerRef = addBytes("architecture-modeler-working-001", modelerBytes,
    artifactSchema("architecture-modeler-working"), artifactMediaType("architecture-modeler-working"));
  const architectureRegistry = createModuleRegistry({
    modules: [await readJson("examples/modules/architecture-design.module.json")],
    plugins: await Promise.all(["spec-kit-plan", "structurizr", "madr"].map(async name => ({
      definition: await readJson(`examples/plugins/${name}.plugin.json`),
      adapter: { async invoke(invocation) {
        if (name === "madr") return stepResult(invocation, { disposition: "terminal", moduleResult: clone(architectureResult) });
        const [port, ref] = name === "spec-kit-plan"
          ? ["architecture-designer-working", designerRef] : ["architecture-modeler-working", modelerRef];
        return stepResult(invocation, { disposition: "continue", outputs: { [port]: [ref] }, evidence: [], diagnostics: [] });
      } },
    }))),
    artifactContracts: architectureRuntimeArtifactContracts(),
  });
  const architectureReplay = await replay(architectureRegistry, architectureInvocation);
  const candidateRef = architectureResult.outputs["architecture-draft"][0];
  const reviewRef = addBytes("test-architecture-review", "Synthetic fixture review; not real owner acceptance.\n",
    "https://devrelay.dev/evidence/architecture-gate-review/v1", "text/markdown");
  const evidenceRef = addBytes("test-architecture-evidence", '{"fixture":true,"status":"pass"}\n',
    "https://devrelay.dev/evidence/structurizr-conformance-proof/v1", "application/vnd.devrelay.structurizr-conformance-proof+json");
  const ownerApproval = {
    apiVersion, kind: "ArchitectureGateOwnerApproval", approvalId: "test-architecture-owner-approval",
    authority: "project-owner", decision: "approve", policyVersion: "architecture-gate/0.1.0",
    candidate: candidateRef, gateReview: reviewRef, requiredEvidence: [evidenceRef],
    repositoryRevision: JSON.parse(bytesById.get("repository-snapshot-001")).revision,
  };
  const ownerApprovalBytes = Buffer.from(`${JSON.stringify(ownerApproval, null, 2)}\n`);
  const ownerApprovalRef = addBytes(ownerApproval.approvalId, ownerApprovalBytes,
    "https://devrelay.dev/evidence/architecture-gate-owner-approval/v1", "application/vnd.devrelay.architecture-gate-owner-approval+json");
  const sections = clone(draft.sections);
  for (const decision of sections.decisionRecords.content.decisions) if (decision.status === "proposed") decision.status = "accepted";
  const architectureBaseline = add("architecture-baseline-governed-test", {
    apiVersion, kind: "ArchitectureBaseline", baselineId: "architecture-baseline-governed-test", approvedDraft: candidateRef,
    requirementsBaseline: requirements.requirementsBaselineRef, projectOverviewBaseline: requirements.projectOverviewBaselineRef,
    projectContext: draft.projectContext, repositorySnapshot: draft.repositorySnapshot, sections,
    approvalPolicyVersion: ownerApproval.policyVersion, approvalEvidence: [reviewRef, evidenceRef, ownerApprovalRef], sourceRefs: draft.sourceRefs,
  }, "architecture-baseline");
  const evidenceResolver = async ref => ({ ref, bytes: await artifacts.load(ref) });
  const architecture = { checkpointReplay: architectureReplay, ownerApproval, ownerApprovalBytes, ownerApprovalRef,
    baseline: architectureBaseline.value, baselineBytes: architectureBaseline.bytes, baselineRef: architectureBaseline.ref, evidenceResolver };
  await validateArchitectureGatePromotion(architecture);

  const card = clone(cardValue);
  const changeCardBytes = Buffer.from(`${JSON.stringify(card, null, 2)}\n`);
  const changeCardRef = addBytes("coding-card-one", changeCardBytes, "https://devrelay.dev/examples/modular/coding/change-card/v1");
  const approvalEvidence = addBytes("test-work-approval", "Synthetic fixture Gate approval, not owner acceptance.\n",
    "https://devrelay.dev/evidence/work-breakdown-gate/v1", "text/plain");
  const contract = add("CD-CODING", { apiVersion, kind: "ContractDisposition", dispositionId: "CD-CODING", mode: "not-applicable",
    notApplicable: { apiVersion, kind: "ApprovedNotApplicable", approvalId: "ANA-CODING-CONTRACT", purpose: "contract-disposition",
      rationale: "The synthetic coding fixture does not alter an interface contract.", authority: { id: "test-owner", role: "human-approver" },
      approvalEvidence: [approvalEvidence] } }, "contract-disposition");
  const catalog = add("CC-CODING", { apiVersion, kind: "CapabilityCatalog", catalogId: "CC-CODING", version: "1.0.0",
    capabilities: [{ id: "CAP-CODE", name: "Source change", type: "code", description: "Produce a bounded source change.", providerNeutral: true }] }, "capability-catalog");
  const repositoryContext = repositoryNotApplicable
    ? add("ANA-CODING-REPOSITORY", { apiVersion, kind: "ApprovedNotApplicable", approvalId: "ANA-CODING-REPOSITORY",
      purpose: "repository-context", rationale: "Synthetic coverage of the published WorkBreakdown repository N/A union member.",
      authority: { id: "test-owner", role: "human-approver" }, approvalEvidence: [approvalEvidence] }, "approved-not-applicable").ref
    : draft.repositorySnapshot;
  const state = add("PWBS-CODING", { apiVersion, kind: "ProjectWorkBreakdownState", stateId: "PWBS-CODING", state: "unbaselined",
    requirementsBaseline: requirements.requirementsBaselineRef, projectOverviewBaseline: requirements.projectOverviewBaselineRef,
    architectureBaseline: architectureBaseline.ref, contractDisposition: contract.ref, capabilityCatalog: catalog.ref,
    repositoryContext }, "project-work-breakdown-state");
  const refs = { "project-work-breakdown-state": state.ref, "requirements-baseline": requirements.requirementsBaselineRef,
    "project-overview-baseline": requirements.projectOverviewBaselineRef, "architecture-baseline": architectureBaseline.ref,
    "contract-disposition": contract.ref, "capability-catalog": catalog.ref, "repository-context": repositoryContext };
  const criterionIds = requirementsDocument.value.requirements.acceptanceCriteria.map(({ id }) => id);
  const architectureIds = architectureBaseline.value.sections.architectureModel.content.elements.map(({ id }) => id);
  const sourceRefs = [{ role: "requirements-baseline", artifact: requirements.requirementsBaselineRef, jsonPointer: "/requirements/acceptanceCriteria/0" }];
  const workItem = { id: "WI-CODING", objective: "Exercise one bounded coding effect under real Gate-derived test prerequisites.",
    "bounded-scope": { included: ["The exact coding card paths and tests."], excluded: ["Release, installation, integration, and owner acceptance."] },
    deliverables: [{ id: "DEL-CODING", description: "Reviewable source diff and raw test evidence.", artifactKind: "source-change" }],
    "work-type": "code-change", "acceptance-criterion-refs": criterionIds, "architecture-refs": architectureIds, "contract-refs": [],
    "required-capabilities": ["CAP-CODE"], "dependency-hints": [],
    "verification-plan": { checks: [{ id: "VC-CODING", method: "Run the card's bounded Node tests.", successCriteria: "Tests pass; this is not owner acceptance." }] },
    "required-evidence": [{ kind: "test-report", description: "Raw Node test output." }], "source-refs": sourceRefs };
  const workCandidate = add("WBD-CODING", { apiVersion, kind: "WorkBreakdownDraft", draftId: "WBD-CODING", operation: "establish-breakdown",
    inputBindings: Object.entries(refs).map(([role, artifact]) => ({ role, artifact })), workItems: [workItem],
    coverageDispositions: [...criterionIds.map(id => ["acceptance-criterion", id]), ...architectureIds.map(id => ["architecture", id])]
      .map(([scopeKind, scopeRef]) => ({ scopeKind, scopeRef, disposition: "planned", workItemRefs: ["WI-CODING"] })),
    nativeArtifacts: [changeCardRef], sourceRefs }, "work-breakdown-draft");
  const workResult = { apiVersion, kind: "ModuleResult", invocationId: "governed-coding-work-breakdown", status: "completed", outcome: "decomposed",
    outputs: { "work-breakdown-draft": [workCandidate.ref] }, evidence: ["contract-validation", "source-closure"].map(name => ({
      kind: `work-breakdown/${name}`, subject: "work-breakdown-draft:WBD-CODING", status: "pass", artifact: workCandidate.ref })), diagnostics: [] };
  const workRegistry = createModuleRegistry({ modules: [await readJson("examples/modules/work-breakdown.module.json")],
    plugins: [{ definition: await readJson("examples/plugins/openspec-tasks.plugin.json"), adapter: { async invoke() { return clone(workResult); } } }],
    artifactContracts: workBreakdownRuntimeArtifactContracts() });
  const route = add("route-coding-work-breakdown", await workRegistry.selectOperation({ id: "work-breakdown", version: "0.1.0" }, state.ref, { artifacts }), "module-route-decision");
  const workInvocation = { apiVersion, kind: "ModuleInvocation", invocationId: workResult.invocationId, runId: "governed-coding-test", nodeId: "work-breakdown",
    module: { id: "work-breakdown", version: "0.1.0", operation: "establish-breakdown" }, plugin: { id: "openspec-tasks", version: "0.1.0" },
    inputs: { ...Object.fromEntries(Object.entries(refs).map(([name, ref]) => [name, [ref]])), "routing-decision": [route.ref] }, options: {},
    config: { projectRoot: "/fixture", planningOutputRoot: "/fixture/planning", toolName: "OpenSpec", toolVersion: "fixture", changeName: "coding",
      schema: "devrelay-work-breakdown", artifact: "tasks.md", command: "/opsx:continue", bridge: "agent-command" },
    grants: [{ kind: "filesystem.read", scope: "/fixture" }, { kind: "filesystem.write", scope: "/fixture/planning" },
      { kind: "network.connect", scope: "host:implementation-engine" }] };
  const workReplay = await replay(workRegistry, workInvocation);
  const workBaseline = add("WBB-CODING", { apiVersion, kind: "WorkBreakdownBaseline", baselineId: "WBB-CODING", version: "1.0.0",
    approvedCandidate: workCandidate.ref, inputBindings: workCandidate.value.inputBindings, workItems: workCandidate.value.workItems,
    coverageDispositions: [...workCandidate.value.coverageDispositions].sort((a, b) => `${a.scopeKind}\0${a.scopeRef}`.localeCompare(`${b.scopeKind}\0${b.scopeRef}`)),
    approvalEvidence: [approvalEvidence], sourceRefs }, "work-breakdown-baseline");
  const workBreakdown = { checkpointReplay: workReplay, baseline: workBaseline.value, baselineRef: workBaseline.ref,
    baselineBytes: workBaseline.bytes, evidenceResolver };
  await validateWorkBreakdownGatePromotion(workBreakdown);
  const heads = clone({ requirementsBaseline: requirements.requirementsBaselineRef, projectOverviewBaseline: requirements.projectOverviewBaselineRef,
    architectureBaseline: architectureBaseline.ref, workBreakdownBaseline: workBaseline.ref, projectContext: draft.projectContext,
    repositorySnapshot: draft.repositorySnapshot, contractDisposition: contract.ref, capabilityCatalog: catalog.ref });
  const bundle = { formatVersion: 1, artifacts: [], checkpoints: [...checkpoints].map(([key, value]) => ({ key, value })),
    invocations: { requirements: requirementsInvocation, architecture: architectureInvocation, workBreakdown: workInvocation },
    gates: { requirements: { requirementsBaseline: requirements.requirementsBaselineRef, projectOverviewBaseline: requirements.projectOverviewBaselineRef,
      projectOverviewMarkdown: overviewDocument.value.renderedDocument.artifact },
    architecture: { baseline: architectureBaseline.ref, ownerApproval: ownerApprovalRef }, workBreakdown: { baseline: workBaseline.ref } }, changeCard: changeCardRef };
  const bundleRefs = new Map();
  function collect(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.artifactId === "string" && typeof value.digest === "string") bundleRefs.set(canonicalJson(value), value);
    for (const child of Object.values(value)) collect(child);
  }
  collect(bundle);
  const visited = new Set();
  for (const [, ref] of bundleRefs) {
    let bytes = bytesById.get(ref.artifactId);
    if (!bytes && /^[A-Za-z0-9-]+$/.test(ref.artifactId)) {
      bytes = await readFile(new URL(`examples/artifacts/${ref.artifactId}.json`, root));
      bytesById.set(ref.artifactId, bytes);
    }
    if (!bytes || sha256Digest(bytes) !== ref.digest) throw new Error("Missing exact bundle fixture artifact: " + ref.artifactId);
    bundle.artifacts.push({ ref: clone(ref), bytesBase64: bytes.toString("base64") });
    if (!visited.has(ref.artifactId)) {
      visited.add(ref.artifactId);
      try { collect(JSON.parse(bytes)); } catch {}
    }
  }
  return {
    bundle,
    governance: { requirements, architecture, workBreakdown, changeCard: { ref: changeCardRef, bytes: changeCardBytes }, readCurrentHeads: () => clone(heads) },
    context: { requirementsBytes: requirements.requirementsBaselineBytes, overviewBytes: requirements.projectOverviewBaselineBytes, overviewMarkdownBytes: markdownBytes },
    heads, card, workItem,
  };
}
