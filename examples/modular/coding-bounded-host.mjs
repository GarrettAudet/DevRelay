import { readFile } from "node:fs/promises";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { boundedWorkBinding, boundedWorkContracts, boundedWorkRoles, boundedWorkRuntimeArtifactContracts,
  sameBoundedRef, validateBoundedWorkArtifact } from "../../src/work-breakdown-bounded.mjs";
import { createConversationBoundedWorkAdapter, validateBoundedChangeCard } from "../../src/work-breakdown-bounded-adapter.mjs";
import { validateBoundedWorkGateCandidate, validateBoundedWorkGatePromotion } from "../../src/work-breakdown-bounded-gate.mjs";
import { createCodingFiles } from "./coding-files.mjs";
import { activateGovernedCodingProject, withGovernedCodingPreparation } from "./coding-governed-host.mjs";
import { validateCodingReplayBundle } from "./coding-replay-bundle.mjs";

const apiVersion = "devrelay.dev/v1alpha1";
const reviewKey = "bounded-work-review";
const observationSchema = "https://devrelay.dev/examples/modular/coding/bounded-inspection/v1";
const preparationSchema = "https://devrelay.dev/examples/modular/coding/bounded-preparation/v1";
function fail(message, code = "BOUNDED_WORK_INVALID") { const error = new Error(message); error.code = code; throw error; }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) fail("Invalid " + label);
}
function bounded(value) { const bytes = Buffer.byteLength(canonicalJson(value)); if (bytes > 16 * 1024 * 1024) fail("Preparation exceeds 16 MiB"); return structuredClone(value); }
function stable(prefix, value) { return prefix + canonicalJsonDigest(value).slice(7, 31).toUpperCase(); }
function document(value, artifactId, contract) {
  const bytes = Buffer.from(canonicalJson(value) + "\n");
  const ref = { artifactId, ...contract, digest: sha256Digest(bytes), uri: "artifact://modular-coding/" + sha256Digest(bytes).slice(7) };
  return { value, ref, bytesBase64: bytes.toString("base64") };
}
function persist(store, value, artifactId, contract) {
  const doc = document(value, artifactId, contract);
  store.putBytes(Buffer.from(doc.bytesBase64, "base64"), doc.ref.schema, doc.ref);
  return doc;
}
function importBytes(store, entries) {
  for (const entry of entries) {
    exactKeys(entry, ["ref", "bytesBase64"], "evidence entry");
    const bytes = Buffer.from(entry.bytesBase64, "base64");
    if (bytes.toString("base64") !== entry.bytesBase64 || sha256Digest(bytes) !== entry.ref?.digest) fail("Evidence digest mismatch");
    const saved = store.putBytes(bytes, entry.ref.schema, entry.ref);
    // Existing evidence may use full and short aliases for identical bytes.
    // Preserve each original exact reference; putBytes fills URI/media defaults.
    if (canonicalJson(saved) !== canonicalJson(entry.ref)) {
      const persisted = store.find("artifact:" + canonicalJsonDigest(saved));
      store.bind("artifact:" + canonicalJsonDigest(entry.ref), { ref: entry.ref, stored: persisted.stored }, [persisted.stored]);
    }
  }
}
function currentObservation(context, paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 100 || new Set(paths).size !== paths.length) fail("One to 100 unique inspection paths are required");
  const snapshot = { ...context.resolved.repositorySnapshot, ...context.repository };
  const repositorySnapshot = document(snapshot, stable("repository-snapshot-bounded-", snapshot), {
    schema: "https://devrelay.dev/artifacts/repository-snapshot/v1", mediaType: "application/vnd.devrelay.repository-snapshot+json" });
  const files = createCodingFiles(context.workspace);
  const observation = { formatVersion: 1, repositorySnapshot: repositorySnapshot.ref,
    files: [...paths].sort().map(path => files.read(path)) };
  const inspection = document(observation, stable("bounded-inspection-", observation), { schema: observationSchema, mediaType: "application/json" });
  return { repositorySnapshot, inspection };
}
function view(approved, requirements, headDigest, preparationId) {
  const item = approved.candidate.workItem;
  const criteria = requirements.requirements.acceptanceCriteria.filter(entry => approved.changeCard.criterionIds.includes(entry.id));
  return { preparationId, status: "ready-for-review", change: item.objective,
    criteria: criteria.map(({ id, ...criterion }) => ({ id, ...criterion })),
    reuse: approved.changeCard.reuse, touch: approved.changeCard.writePaths,
    verify: item["verification-plan"].checks, excludes: item["bounded-scope"].excluded,
    question: "Approve this exact work and reviewed design reuse?",
    evidence: { candidate: approved.candidateRef, changeCard: approved.changeCardRef, assessment: approved.assessmentRef, headDigest },
    acceptance: "not-recorded" };
}
function writeReview(store, state) {
  const existing = store.find(reviewKey);
  if (!existing) return store.host.initializeRun({ runId: reviewKey, state });
  const row = store.host.readRun(reviewKey);
  const lease = store.host.acquireLease({ runId: reviewKey, owner: "bounded-conversation", expectedVersion: row.version });
  try { return store.host.commitTransition({ runId: reviewKey, expectedVersion: row.version, leaseToken: lease.token,
    transition: { kind: "bounded-review-" + state.status, preparationId: state.preparationId }, nextState: state }); }
  finally { store.host.releaseLease({ runId: reviewKey, leaseToken: lease.token }); }
}
async function registry(store, proposal) {
  const module = JSON.parse(await readFile(new URL("../modules/work-breakdown-bounded.module.json", import.meta.url), "utf8"));
  const plugin = JSON.parse(await readFile(new URL("../plugins/conversation-bounded-work.plugin.json", import.meta.url), "utf8"));
  const adapter = proposal ? createConversationBoundedWorkAdapter({ loadArtifact: ref => store.load(ref),
    persistArtifact: ({ bytes, artifactId, schema, mediaType }) => store.putBytes(bytes, schema, { artifactId, mediaType }),
    executeCapability: async () => structuredClone(proposal) }) : { async invoke() { fail("Review is checkpoint-only; it cannot invoke authoring"); } };
  return createModuleRegistry({ modules: [module], plugins: [{ definition: plugin, adapter }], artifactContracts: boundedWorkRuntimeArtifactContracts() });
}
const evidenceResolver = store => async ref => ({ ref, bytes: store.load(ref) });
const attachmentResolver = store => async ref => ({ ref, bytes: store.load(ref), value: store.json(ref) });
function sameSnapshot(a, b) { return canonicalJsonDigest(a) === canonicalJsonDigest(b); }
function checkPreparation(context, preparation, pending, id) {
  if (!pending || pending.preparationId !== id || pending.status === "cancelled" || pending.status === "rejected") fail("This card was cancelled, rejected, or replaced; prepare the current exact work", "STALE_BOUNDED_REVIEW");
  if (preparation.expectedHeadDigest !== context.head.headDigest || !sameSnapshot(preparation.repository, context.repository)) fail("Prepared card or repository head is stale; inspect and prepare again", "STALE_GOVERNED_HEAD");
  createCodingFiles(context.workspace).assertCurrent(preparation.files);
}

/** Read-only inspection; never creates a project, baseline, approval, or source effect. */
export async function inspectBoundedCodingWork({ workspace, paths = [] }) {
  return withGovernedCodingPreparation({ workspace }, async context => {
    const pending = context.store.find(reviewKey);
    const result = { status: pending?.status ?? "needs-preparation", headDigest: context.head.headDigest,
      heads: context.head.heads, pending: pending ?? null, acceptance: "not-recorded" };
    if (paths.length) Object.assign(result, currentObservation(context, paths));
    return result;
  });
}

/** Conversation authors only an item/card and semantic evidence. The host owns
 * current heads, observation, route, exact invocation, persistence, and replay. */
export async function prepareBoundedCodingWork(input) {
  exactKeys(input, ["workspace", "preparationId", "assessment", "evidence", "proposal"], "bounded preparation input");
  const { workspace, preparationId, assessment, evidence, proposal } = bounded(input);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(preparationId)) fail("Invalid preparation identity");
  exactKeys(proposal, ["workItem", "changeCard"], "conversation proposal");
  validateBoundedChangeCard(proposal.changeCard, proposal.workItem);
  validateBoundedWorkArtifact(assessment);
  return withGovernedCodingPreparation({ workspace }, async context => {
    const { store, head, resolved } = context;
    const previousReview = store.find(reviewKey);
    const previousPreparation = store.find("bounded-preparation:" + preparationId);
    if (previousPreparation && (previousReview?.preparationId !== preparationId || ["cancelled", "rejected"].includes(previousReview.status))) {
      fail("This preparation was cancelled, rejected, or superseded; use a new preparation identity for a newly reviewed card", "STALE_BOUNDED_REVIEW");
    }
    if (previousReview?.preparationId === preparationId && ["cancelled", "rejected"].includes(previousReview.status)) fail("A cancelled/rejected card cannot be reopened; prepare new work with a new identity", "STALE_BOUNDED_REVIEW");
    if (previousReview?.preparationId === preparationId && previousReview.status === "exported" && previousPreparation && sameBoundedRef(previousReview.bundle, head.bundle)) {
      const saved = store.json(previousPreparation.preparation);
      const identity = store.find("bounded-invocation:" + preparationId);
      if (identity?.proposalDigest !== canonicalJsonDigest(proposal) || canonicalJsonDigest(store.json(saved.invocation.inputs["design-reuse-assessment"][0])) !== canonicalJsonDigest(assessment)) fail("A revised card needs a new preparation identity", "STALE_BOUNDED_REVIEW");
      return { ...saved.card, status: "already-authorized", headDigest: head.headDigest };
    }
    const observation = currentObservation(context, proposal.changeCard.readPaths);
    if (!sameBoundedRef(assessment.currentRepositorySnapshot, observation.repositorySnapshot.ref) ||
      !assessment.inspectionEvidence.some(ref => sameBoundedRef(ref, observation.inspection.ref))) fail("Semantic review must bind this exact current repository and inspected file bytes; inspect and review again", "NEEDS_CLARIFICATION");
    const baseBundle = store.json(head.bundle);
    if (baseBundle.formatVersion === 1 && baseBundle.invocations.workBreakdown.module.operation !== "establish-breakdown") {
      fail("This legacy change baseline lacks the original work invocation history needed for bounded export; restore complete approved work history before preparing this card", "BASELINE_ALIGNMENT_REQUIRED");
    }
    importBytes(store, baseBundle.artifacts);
    importBytes(store, evidence);
    importBytes(store, [observation.repositorySnapshot, observation.inspection].map(({ref,bytesBase64})=>({ref,bytesBase64})));
    const assessmentDocument = persist(store, assessment, assessment.assessmentId, boundedWorkContracts.assessment);
    const refs = { "requirements-baseline": head.heads.requirementsBaseline, "project-overview-baseline": head.heads.projectOverviewBaseline,
      "architecture-baseline": head.heads.architectureBaseline, "contract-disposition": head.heads.contractDisposition,
      "capability-catalog": head.heads.capabilityCatalog, "current-work-breakdown-baseline": head.heads.workBreakdownBaseline,
      "current-repository-snapshot": observation.repositorySnapshot.ref, "design-reuse-assessment": assessmentDocument.ref };
    const state = { apiVersion, kind: "BoundedWorkBreakdownState", stateId: stable("PWBS-", { preparationId, refs, head: head.headDigest }),
      state: "bounded-work", expectedHeadDigest: head.headDigest,
      ...Object.fromEntries(Object.entries(refs).map(([role,ref])=>[role.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),ref])) };
    refs["project-work-breakdown-state"] = persist(store, state, state.stateId, boundedWorkContracts.state).ref;
    const source = await registry(store, proposal);
    const route = await source.selectOperation({ id: boundedWorkBinding.module.id, version: boundedWorkBinding.module.version }, refs["project-work-breakdown-state"], { artifacts: store.artifacts });
    const routeRef = persist(store, route, stable("bounded-route-", route), { schema: "https://devrelay.dev/artifacts/module-route-decision/v1", mediaType: "application/vnd.devrelay.module-route-decision+json" }).ref;
    const invocation = { apiVersion, kind: "ModuleInvocation", invocationId: "bounded-" + preparationId, runId: "bounded-conversation", nodeId: "bounded-work",
      ...boundedWorkBinding, inputs: { ...Object.fromEntries(boundedWorkRoles.map(role=>[role,[refs[role]]])), "routing-decision": [routeRef] },
      options: {}, config: { planningOutputRoot: context.stateDirectory, authoringMethod: "conversation" }, grants: [{ kind: "filesystem.write", scope: context.stateDirectory }] };
    const identity = { invocation, proposalDigest: canonicalJsonDigest(proposal) };
    store.bind("bounded-invocation:" + preparationId, identity);
    const keys = new Set();
    const runtime = { artifacts: store.artifacts, checkpoints: {
      async get(key) { keys.add(key); return store.checkpoints.get(key); },
      async put(key,value) { keys.add(key); return store.checkpoints.put(key,value); } } };
    context.assertCurrent();
    const result = await source.execute(invocation, runtime);
    if (result.outcome !== "decomposed") { const diagnostic = result.diagnostics?.[0]; fail(diagnostic?.message ?? "Bounded work could not be prepared", diagnostic?.code ?? "NEEDS_CLARIFICATION"); }
    const checkpointReplay = await source.verifyCheckpointedExecution(invocation, runtime);
    const approved = await validateBoundedWorkGateCandidate({ checkpointReplay, evidenceResolver: evidenceResolver(store), architectureAttachmentResolver: attachmentResolver(store) });
    const card = view(approved, resolved.governance.requirements.requirementsBaseline, head.headDigest, preparationId);
    const preparation = { formatVersion: 1, preparationId, expectedHeadDigest: head.headDigest, repository: context.repository,
      sourceBundle: head.bundle, invocation, checkpoints: [...keys].sort(), candidate: approved.candidateRef,
      files: observation.inspection.value.files.map(({path,digest})=>({path,digest})), card };
    const saved = store.put(preparation, preparationSchema);
    store.bind("bounded-preparation:" + preparationId, { preparation: saved });
    const existing = store.find(reviewKey);
    if (existing?.preparationId === preparationId && ["approved", "exported"].includes(existing.status)) return { ...card, status: "already-authorized" };
    if (store.find("bounded-decision:" + preparationId)) fail("This decided card cannot be silently reopened; prepare a revised card with a new identity", "STALE_BOUNDED_REVIEW");
    writeReview(store, { preparationId, preparation: saved, status: "ready-for-review", headDigest: head.headDigest });
    return card;
  });
}

export async function cancelBoundedCodingWork({ workspace, preparationId, expectedHeadDigest }) {
  return withGovernedCodingPreparation({ workspace, expectedHeadDigest }, async ({ store }) => {
    const pending = store.find(reviewKey);
    if (pending?.preparationId !== preparationId || pending.status === "approved" || pending.status === "exported") fail("Only the exact undecided pending card can be cancelled", "STALE_BOUNDED_REVIEW");
    if (pending.status !== "cancelled") writeReview(store, { ...pending, status: "cancelled" });
    return { status: "cancelled", preparationId, acceptance: "not-recorded" };
  });
}

function exportClosure(store, bundle) {
  const refs = new Map();
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (typeof value.artifactId === "string" && typeof value.digest === "string") refs.set(canonicalJson(value), value);
    for (const child of Object.values(value)) visit(child);
  };
  visit(bundle);
  const artifacts = [];
  for (const ref of refs.values()) {
    let bytes;
    try { bytes = store.load(ref); }
    catch (error) {
      // Core route/provenance artifacts intentionally retain short identities.
      // Resolve only through an already declared fuller alias in this closure,
      // requiring every field present in the short reference to agree.
      const aliases = [...refs.values()].filter(candidate => candidate.artifactId === ref.artifactId && candidate.digest === ref.digest &&
        Object.keys(ref).every(field => candidate[field] === ref[field]));
      for (const alias of aliases) {
        try { bytes = store.load(alias); break; } catch { /* Try another declared alias. */ }
      }
      if (!bytes || sha256Digest(bytes) !== ref.digest) throw error;
    }
    artifacts.push({ ref, bytesBase64: bytes.toString("base64") });
    try { visit(JSON.parse(bytes)); } catch { /* Native evidence may be opaque. */ }
  }
  return { ...bundle, artifacts };
}

/** A trusted conversation host captures an original exact human decision. This
 * API does not authenticate caller-provided JSON; no CLI approval switch exists. */
export async function reviewBoundedCodingWork({ workspace, preparationId, expectedHeadDigest, captureDecision }) {
  const outcome = await withGovernedCodingPreparation({ workspace }, async context => {
    const { store, head } = context;
    const record = store.find("bounded-preparation:" + preparationId);
    if (!record) fail("No exact prepared work exists", "STALE_BOUNDED_REVIEW");
    const preparation = store.json(record.preparation), pending = store.find(reviewKey);
    if (pending?.preparationId === preparationId && pending.status === "exported" && sameBoundedRef(pending.bundle, head.bundle)) {
      if (expectedHeadDigest !== preparation.expectedHeadDigest && expectedHeadDigest !== head.headDigest) fail("Repeated decision does not bind the prepared or activated head", "STALE_GOVERNED_HEAD");
      return { status: "already-authorized", preparationId, headDigest: head.headDigest, acceptance: "not-recorded" };
    }
    if (head.headDigest !== expectedHeadDigest) fail("Prepared approval head changed", "STALE_GOVERNED_HEAD");
    checkPreparation(context, preparation, pending, preparationId);
    const source = await registry(store);
    const checkpointReplay = await source.verifyCheckpointedExecution(preparation.invocation, { artifacts: store.artifacts, checkpoints: store.checkpoints });
    const gateArgs = { checkpointReplay, evidenceResolver: evidenceResolver(store), architectureAttachmentResolver: attachmentResolver(store) };
    const approved = await validateBoundedWorkGateCandidate(gateArgs);
    let decision = store.find("bounded-decision:" + preparationId);
    if (!decision) {
      if (typeof captureDecision !== "function") fail("The trusted conversation host must capture the original exact human decision for this card", "HUMAN_DECISION_REQUIRED");
      decision = bounded(await captureDecision(structuredClone(preparation.card)));
      exactKeys(decision, ["decision", "originalMessage"], "captured human decision");
      exactKeys(decision.originalMessage, ["id", "author", "text", "timestamp"], "original human message");
      if (!["approve", "reject"].includes(decision.decision) || Object.values(decision.originalMessage).some(value=>typeof value !== "string" || !value.trim())) fail("Original exact human decision is incomplete", "HUMAN_DECISION_REQUIRED");
      context.assertCurrent();
      store.bind("bounded-human-message:" + decision.originalMessage.id, { preparationId, decision });
      store.bind("bounded-decision:" + preparationId, decision);
    }
    if (decision.decision === "reject") {
      writeReview(store, { ...pending, status: "rejected" });
      return { status: "rejected", preparationId, acceptance: "not-recorded" };
    }
    const ownerApproval = { apiVersion, kind: "WorkBreakdownBoundedApproval", approvalId: stable("WBA-", { preparationId, decision }),
      decision: "approve", candidate: approved.candidateRef, changeCard: approved.changeCardRef,
      designReuseAssessment: approved.assessmentRef, currentRepositorySnapshot: preparation.invocation.inputs["current-repository-snapshot"][0],
      expectedHeadDigest: head.headDigest, originalMessage: decision.originalMessage };
    const approvalDocument = persist(store, ownerApproval, ownerApproval.approvalId, boundedWorkContracts.approval);
    const prior = store.json(approved.priorBaselineRef), version = prior.version.split(".").map(Number); version[2]++;
    const baseline = { apiVersion, kind: "BoundedWorkBreakdownBaseline", baselineId: stable("WBB-", { candidate: approved.candidateRef, approval: approvalDocument.ref }), version: version.join("."),
      approvedCandidate: approved.candidateRef, previousBaseline: approved.priorBaselineRef, inputBindings: approved.candidate.inputBindings,
      workItems: approved.workItems, coverageDispositions: approved.coverageDispositions,
      approvalEvidence: [...prior.approvalEvidence, approvalDocument.ref], sourceRefs: approved.candidate.sourceRefs };
    const baselineDocument = document(baseline, baseline.baselineId, boundedWorkContracts.baseline);
    const promotion = await validateBoundedWorkGatePromotion({ ...gateArgs, baseline, baselineRef: baselineDocument.ref, baselineBytes: Buffer.from(baselineDocument.bytesBase64,"base64"),
      ownerApproval, ownerApprovalRef: approvalDocument.ref, ownerApprovalBytes: Buffer.from(approvalDocument.bytesBase64,"base64") });
    importBytes(store, [{ ref: promotion.commitPayload.baseline.ref, bytesBase64: promotion.commitPayload.baseline.bytesBase64 }]);
    const base = store.json(preparation.sourceBundle);
    const history = [...(base.workHistory ?? []), { invocation: base.invocations.workBreakdown, ...base.gates.workBreakdown }];
    const checkpoints = new Map(base.checkpoints.map(entry=>[entry.key,entry.value]));
    for (const key of preparation.checkpoints) {
      const value = await store.checkpoints.get(key);
      // Core may probe optional absent checkpoint keys. Only persisted records
      // belong in a replay bundle; verification still requires every real step.
      if (value !== undefined) checkpoints.set(key, value);
    }
    const bundle = exportClosure(store, { formatVersion: 2, invocations: { ...base.invocations, workBreakdown: preparation.invocation },
      gates: { ...base.gates, workBreakdown: { baseline: baselineDocument.ref, ownerApproval: approvalDocument.ref } },
      workHistory: history, checkpoints: [...checkpoints].map(([key,value])=>({key,value})), changeCard: approved.changeCardRef });
    await validateCodingReplayBundle(bundle);
    const bundleRef = store.put(bundle, "https://devrelay.dev/examples/modular/coding/replay-bundle/v2");
    writeReview(store, { ...pending, status: "exported", bundle: bundleRef });
    return { status: "exported", preparationId, bundle, expectedHeadDigest: head.headDigest };
  });
  if (outcome.status !== "exported") return outcome;
  const active = await activateGovernedCodingProject({ workspace, bundle: outcome.bundle, expectedHeadDigest: outcome.expectedHeadDigest });
  return { status: "already-authorized", preparationId, headDigest: active.headDigest, generation: active.generation, acceptance: "not-recorded" };
}
