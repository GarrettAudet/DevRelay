import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  PROJECT_OVERVIEW_DOCUMENT,
  PROJECT_OVERVIEW_PROJECTION,
  PROJECT_OVERVIEW_RENDERER,
  deriveProjectOverview,
  diffProjectOverviewSections,
  renderProjectOverviewMarkdownBytes,
} from "./project-overview.mjs";
import { validateProjectOverviewArtifact, validateProjectOverviewChangeSetAgainstBaseline } from "./project-overview-artifact-validator.mjs";
import { validateRequirementsArtifact } from "./requirements-artifact-validator.mjs";
import { validateSharedArtifact } from "./shared-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";
const MODULE = Object.freeze({ id: "requirements-gathering", version: "0.1.0", operation: "gather" });
const PLUGIN = Object.freeze({ id: "openspec", version: "0.1.0" });
const CAPABILITY = "openspec.requirements.gather/v1";
const SCHEMAS = Object.freeze({
  draft: "https://devrelay.dev/artifacts/requirements-draft/v1",
  change: "https://devrelay.dev/artifacts/requirements-change-set/v1",
  overview: "https://devrelay.dev/artifacts/project-overview-draft/v1",
  overviewChange: "https://devrelay.dev/artifacts/project-overview-change-set-draft/v1",
  clarification: "https://devrelay.dev/artifacts/clarification-request-set/v1",
  continuation: "https://devrelay.dev/artifacts/requirements-gathering-continuation/v1",
  native: "https://devrelay.dev/artifacts/native-source-bundle/v1",
});
const MEDIA = Object.freeze({
  draft: "application/vnd.devrelay.requirements-draft+json",
  change: "application/vnd.devrelay.requirements-change-set+json",
  overview: "application/vnd.devrelay.project-overview-draft+json",
  overviewChange: "application/vnd.devrelay.project-overview-change-set-draft+json",
  clarification: "application/vnd.devrelay.clarification-request-set+json",
  continuation: "application/vnd.devrelay.requirements-gathering-continuation+json",
  native: "application/vnd.devrelay.native-source-bundle+json",
});
const BASE_PORTS = Object.freeze(["goal", "project-context", "repository-snapshot", "requirements-baseline", "project-overview-baseline"]);
const FORBIDDEN_AUTHORITY_KEYS = new Set(["operation", "route", "gate", "approval", "promotion", "baselinePromotion", "graph", "graphOperations", "traceabilityUpdate", "provider"]);

export const OPENSPEC_REQUIREMENTS_CAPABILITY = CAPABILITY;
export const OPENSPEC_REQUIREMENTS_BINDING = Object.freeze({ module: MODULE, plugin: PLUGIN });

export class OpenSpecRequirementsAdapterError extends Error {
  constructor(message) {
    super(`OpenSpec requirements adapter rejected input: ${message}`);
    this.name = "OpenSpecRequirementsAdapterError";
    this.code = "DR4200";
  }
}
const fail = (message) => { throw new OpenSpecRequirementsAdapterError(message); };
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, allowed, required = allowed) => record(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.includes(key));
const pointer = (ref) => ({ artifactId: ref.artifactId, digest: ref.digest });
const immutable = (value) => Object.freeze(structuredClone(value));
const stableId = (prefix, value) => `${prefix}-${canonicalJsonDigest(value).slice(7, 31)}`;

function assertBinding(invocation) {
  if (!record(invocation) || invocation.kind !== "ModuleInvocation") fail("an exact ModuleInvocation is required");
  if (canonicalJson(invocation.module) !== canonicalJson(MODULE)) fail("module operation binding drifted");
  if (canonicalJson(invocation.plugin) !== canonicalJson(PLUGIN)) fail("plug-in identity or version drifted");
  const config = invocation.config;
  if (!record(config) || config.toolName !== "OpenSpec" || config.nativeOperation !== "requirements.gather" || config.schema !== "devrelay-requirements" || config.bridge !== "agent-command") fail("OpenSpec plug-in configuration drifted");
  if (typeof config.toolVersion !== "string" || !config.toolVersion || typeof config.changeName !== "string" || !config.changeName || typeof config.projectRoot !== "string" || !config.projectRoot) fail("OpenSpec plug-in configuration is incomplete");
  const expectedGrants = [
    ["filesystem.read", config.projectRoot],
    ["filesystem.write", `${config.projectRoot.replace(/[\\/]$/, "")}/openspec/changes`],
    ["network.connect", "host:implementation-engine"],
  ];
  if (!Array.isArray(invocation.grants) || expectedGrants.some(([kind, scope]) => !invocation.grants.some((grant) => grant?.kind === kind && grant?.scope === scope))) fail("capability grants do not satisfy the exact plug-in binding");
}

async function load(ref, loadArtifact, label) {
  if (typeof loadArtifact !== "function") fail("a host loadArtifact port is required");
  const supplied = await loadArtifact(immutable(ref));
  const bytes = Buffer.isBuffer(supplied) || supplied instanceof Uint8Array ? Buffer.from(supplied) : Buffer.from(supplied?.bytes ?? []);
  if (bytes.length === 0 || sha256Digest(bytes) !== ref.digest) fail(`${label} bytes do not match the exact invocation reference`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail(`${label} is not JSON`); }
  return { ref: structuredClone(ref), value };
}

async function loadInputs(invocation, loadArtifact) {
  const loaded = {};
  for (const [port, refs] of Object.entries(invocation.inputs ?? {})) {
    if (!Array.isArray(refs) || refs.length !== 1) fail(`input ${port} must have exact cardinality one`);
    loaded[port] = await load(refs[0], loadArtifact, port);
  }
  if (!loaded.goal || !loaded["project-context"]) fail("goal and project-context inputs are required");
  for (const port of ["goal", "project-context", "repository-snapshot", "requirements-baseline"]) if (loaded[port]) validateRequirementsArtifact(loaded[port].value);
  if (loaded["project-overview-baseline"]) validateProjectOverviewArtifact(loaded["project-overview-baseline"].value);
  if (Boolean(loaded["requirements-baseline"]) !== Boolean(loaded["project-overview-baseline"])) fail("baseline revision requires the exact approved requirements/project-overview pair");
  if (loaded["requirements-baseline"]) {
    const requirements = loaded["requirements-baseline"], overview = loaded["project-overview-baseline"];
    const pair = overview.value.requirementsBaseline;
    if (pair?.artifactId !== requirements.ref.artifactId || pair?.digest !== requirements.ref.digest) fail("approved project-overview baseline does not bind the exact requirements baseline bytes");
    if (canonicalJson(overview.value.overview) !== canonicalJson(deriveProjectOverview(requirements.value.requirements))) fail("approved baseline pair projection is inconsistent");
  }
  const triad = ["clarification-request", "clarification-responses", "continuation"];
  const present = triad.filter((port) => loaded[port]).length;
  if (present !== 0 && present !== 3) fail("clarification continuation requires the exact input trio");
  for (const port of triad) if (loaded[port]) validateRequirementsArtifact(loaded[port].value);
  return loaded;
}

function baseInputs(loaded) {
  return BASE_PORTS.filter((port) => loaded[port]).map((role) => ({ role, artifact: pointer(loaded[role].ref) }));
}

function collectSourceRefs(value, target = new Set()) {
  if (!record(value) && !Array.isArray(value)) return target;
  if (record(value) && Array.isArray(value.sourceRefs)) {
    for (const source of value.sourceRefs) target.add(canonicalJson(source));
  }
  for (const child of Object.values(value)) collectSourceRefs(child, target);
  return target;
}

function assertNoHiddenContext(value, allowedPointers, approvedHistoricalSourceRefs) {
  if (!record(value) && !Array.isArray(value)) return;
  if (record(value)) {
    for (const key of Object.keys(value)) if (FORBIDDEN_AUTHORITY_KEYS.has(key)) fail(`native output contains forbidden authority field ${key}`);
    if (Array.isArray(value.sourceRefs)) for (const source of value.sourceRefs) {
      const key = `${source?.artifact?.artifactId}\0${source?.artifact?.digest}`;
      const declaredBaseRef = allowedPointers.has(key) && BASE_PORTS.includes(source.role);
      const unchangedApprovedHistoricalRef = approvedHistoricalSourceRefs.has(canonicalJson(source));
      if (!declaredBaseRef && !unchangedApprovedHistoricalRef) fail("native output contains feature-specific hidden context or an unbound source reference");
    }
  }
  for (const child of Object.values(value)) assertNoHiddenContext(child, allowedPointers, approvedHistoricalSourceRefs);
}

function binding(invocation) {
  return {
    capability: CAPABILITY,
    module: structuredClone(MODULE),
    plugin: structuredClone(PLUGIN),
    tool: { name: invocation.config.toolName, version: invocation.config.toolVersion },
    nativeOperation: invocation.config.nativeOperation,
    schema: invocation.config.schema,
    changeName: invocation.config.changeName,
  };
}

function capabilityRequest(invocation, loaded, producer) {
  const continuation = loaded.continuation ? {
    request: structuredClone(loaded["clarification-request"]),
    responses: structuredClone(loaded["clarification-responses"]),
    continuation: structuredClone(loaded.continuation),
  } : undefined;
  return {
    apiVersion: API,
    kind: "OpenSpecRequirementsCapabilityRequest",
    binding: binding(invocation),
    invocation: { invocationId: invocation.invocationId, invocationFingerprint: producer?.invocationFingerprint, inputs: structuredClone(invocation.inputs) },
    inputs: Object.fromEntries(Object.entries(loaded).filter(([port]) => BASE_PORTS.includes(port)).map(([port, entry]) => [port, structuredClone(entry)])),
    ...(continuation ? { clarificationContinuation: continuation } : {}),
  };
}

function parseNativeResponse(response, expectedBinding) {
  if (!exactKeys(response, ["apiVersion", "kind", "binding", "requirements", "questions", "workingRequirements", "confirmedFacts", "nativeArtifacts"], ["apiVersion", "kind", "binding", "nativeArtifacts"])) fail("native response is malformed or contains undeclared authority");
  if (response.apiVersion !== API || !["OpenSpecRequirementsProposal", "OpenSpecRequirementsClarification"].includes(response.kind)) fail("native response kind is not supported");
  if (canonicalJson(response.binding) !== canonicalJson(expectedBinding)) fail("native response substituted the requested binding or provider");
  if (!Array.isArray(response.nativeArtifacts) || response.nativeArtifacts.length === 0) fail("native response must preserve at least one native artifact");
  for (const artifact of response.nativeArtifacts) {
    if (!exactKeys(artifact, ["role", "path", "mediaType", "content"]) || typeof artifact.role !== "string" || typeof artifact.path !== "string" || typeof artifact.mediaType !== "string" || typeof artifact.content !== "string") fail("native artifact is malformed");
    if (artifact.path.includes("\\") || artifact.path.startsWith("/") || artifact.path.split("/").some((part) => !part || part === "." || part === "..")) fail("native artifact path is not portable and bounded");
  }
  if (response.kind === "OpenSpecRequirementsProposal" && !record(response.requirements)) fail("proposal response requires a requirements body");
  if (response.kind === "OpenSpecRequirementsClarification" && (!Array.isArray(response.questions) || response.questions.length === 0 || !record(response.workingRequirements) || !Array.isArray(response.confirmedFacts))) fail("clarification response is incomplete");
  return structuredClone(response);
}

async function persist({ value, bytes, artifactId, schema, mediaType }, persistArtifact) {
  if (typeof persistArtifact !== "function") fail("a host persistArtifact port is required");
  const exactBytes = bytes ? Buffer.from(bytes) : Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const expected = { artifactId, schema, mediaType, digest: sha256Digest(exactBytes) };
  const ref = await persistArtifact({ ...expected, bytes: Buffer.from(exactBytes), ...(value === undefined ? {} : { value: immutable(value) }) });
  if (!record(ref) || ref.artifactId !== expected.artifactId || ref.schema !== schema || ref.mediaType !== mediaType || ref.digest !== expected.digest) fail(`persistArtifact did not return the exact reference for ${artifactId}`);
  return { ref: structuredClone(ref), value, bytes: exactBytes };
}

async function persistNativeSources(response, persistArtifact) {
  const sources = [];
  for (const native of response.nativeArtifacts) {
    const bytes = Buffer.from(native.content.normalize("NFC"), "utf8");
    const artifactId = stableId("openspec-native", { path: native.path, digest: sha256Digest(bytes) });
    const saved = await persist({ bytes, artifactId, schema: "https://devrelay.dev/artifacts/native-source/v1", mediaType: native.mediaType }, persistArtifact);
    sources.push({ role: native.role, path: native.path, artifact: pointer(saved.ref) });
  }
  return sources;
}

function moduleResult(invocation, outcome, outputs, evidence = []) {
  return { apiVersion: API, kind: "ModuleResult", invocationId: invocation.invocationId, status: "completed", outcome, outputs, evidence, diagnostics: [] };
}

async function persistBundle(invocation, sources, canonicalOutputs, persistArtifact) {
  const bundle = { apiVersion: API, kind: "NativeSourceBundle", plugin: structuredClone(PLUGIN), tool: { name: invocation.config.toolName, version: invocation.config.toolVersion }, operation: invocation.config.nativeOperation, sources, canonicalOutputs: canonicalOutputs.map(pointer), normalization: { warnings: [], unmappedContent: [] }, schema: invocation.config.schema };
  validateSharedArtifact(bundle);
  return persist({ value: bundle, artifactId: stableId("openspec-source-bundle", bundle), schema: SCHEMAS.native, mediaType: MEDIA.native }, persistArtifact);
}

async function proposalResult(invocation, loaded, response, persistArtifact) {
  if (loaded["requirements-baseline"]) return changeProposalResult(invocation, loaded, response, persistArtifact);
  const inputs = baseInputs(loaded), draft = { apiVersion: API, kind: "RequirementsDraft", draftId: stableId("requirements-draft", { inputs, requirements: response.requirements }), baseInputs: inputs, goal: pointer(loaded.goal.ref), projectContext: pointer(loaded["project-context"].ref), requirements: response.requirements };
  validateRequirementsArtifact(draft);
  const savedDraft = await persist({ value: draft, artifactId: draft.draftId, schema: SCHEMAS.draft, mediaType: MEDIA.draft }, persistArtifact);
  const overview = deriveProjectOverview(draft.requirements), markdownBytes = renderProjectOverviewMarkdownBytes(overview);
  const savedMarkdown = await persist({ bytes: markdownBytes, artifactId: stableId("project-overview-markdown", { draft: pointer(savedDraft.ref), digest: sha256Digest(markdownBytes) }), schema: PROJECT_OVERVIEW_DOCUMENT.schema, mediaType: PROJECT_OVERVIEW_DOCUMENT.mediaType }, persistArtifact);
  const overviewDraft = { apiVersion: API, kind: "ProjectOverviewDraft", draftId: stableId("project-overview-draft", { requirementsDraft: pointer(savedDraft.ref), overview }), requirementsDraft: pointer(savedDraft.ref), projection: { ...PROJECT_OVERVIEW_PROJECTION }, overview, renderedDocument: { path: PROJECT_OVERVIEW_DOCUMENT.path, schema: PROJECT_OVERVIEW_DOCUMENT.schema, mediaType: PROJECT_OVERVIEW_DOCUMENT.mediaType, artifact: pointer(savedMarkdown.ref), renderer: { ...PROJECT_OVERVIEW_RENDERER } } };
  validateProjectOverviewArtifact(overviewDraft);
  const savedOverview = await persist({ value: overviewDraft, artifactId: overviewDraft.draftId, schema: SCHEMAS.overview, mediaType: MEDIA.overview }, persistArtifact);
  const sources = await persistNativeSources(response, persistArtifact);
  const bundle = await persistBundle(invocation, sources, [savedDraft.ref, savedOverview.ref], persistArtifact);
  return moduleResult(invocation, "drafted", { "requirements-draft": [savedDraft.ref], "project-overview-draft": [savedOverview.ref], "native-source-bundle": [bundle.ref] }, [{ kind: "requirements/source-provenance", subject: `requirements-draft:${draft.draftId}`, status: "pass", artifact: bundle.ref, summary: "The canonical draft retains exact digest-bound OpenSpec proposal/spec artifacts returned by the host capability executor." }]);
}

function requirementsChangedSections(prior, replacement) {
  return Object.keys(replacement).filter((section) => canonicalJsonDigest(prior[section]) !== canonicalJsonDigest(replacement[section])).sort();
}

async function changeProposalResult(invocation, loaded, response, persistArtifact) {
  const inputs = baseInputs(loaded), requirementsBaseline = loaded["requirements-baseline"], overviewBaseline = loaded["project-overview-baseline"];
  const changedSections = requirementsChangedSections(requirementsBaseline.value.requirements, response.requirements);
  if (changedSections.length === 0) fail("baseline revision replacement must change at least one canonical requirements section");
  const change = {
    apiVersion: API,
    kind: "RequirementsChangeSet",
    changeSetId: stableId("requirements-change-set", { baseline: pointer(requirementsBaseline.ref), replacement: response.requirements }),
    baseInputs: inputs,
    baseline: pointer(requirementsBaseline.ref),
    expectedRequirementsDigest: canonicalJsonDigest(requirementsBaseline.value.requirements),
    replacement: response.requirements,
    changedSections,
    reason: loaded.goal.value.statement,
    compatibilityImpact: "unknown",
    risks: structuredClone(response.requirements.risks),
    requiredEvidence: structuredClone(response.requirements.requiredEvidence),
    sourceRefs: [
      { role: "goal", artifact: pointer(loaded.goal.ref) },
      { role: "requirements-baseline", artifact: pointer(requirementsBaseline.ref) },
    ],
  };
  validateRequirementsArtifact(change);
  const savedChange = await persist({ value: change, artifactId: change.changeSetId, schema: SCHEMAS.change, mediaType: MEDIA.change }, persistArtifact);
  const overview = deriveProjectOverview(change.replacement), overviewSections = diffProjectOverviewSections(overviewBaseline.value.overview, overview), markdownBytes = renderProjectOverviewMarkdownBytes(overview);
  const savedMarkdown = await persist({ bytes: markdownBytes, artifactId: stableId("project-overview-markdown", { requirementsChangeSet: pointer(savedChange.ref), digest: sha256Digest(markdownBytes) }), schema: PROJECT_OVERVIEW_DOCUMENT.schema, mediaType: PROJECT_OVERVIEW_DOCUMENT.mediaType }, persistArtifact);
  const overviewChange = {
    apiVersion: API,
    kind: "ProjectOverviewChangeSetDraft",
    changeSetId: stableId("project-overview-change-set", { baseOverview: pointer(overviewBaseline.ref), requirementsChangeSet: pointer(savedChange.ref), overview }),
    baseOverview: pointer(overviewBaseline.ref),
    requirementsChangeSet: pointer(savedChange.ref),
    changeDisposition: overviewSections.length === 0 ? "unchanged" : "changed",
    changedSections: overviewSections,
    projection: { ...PROJECT_OVERVIEW_PROJECTION },
    overview,
    renderedDocument: { path: PROJECT_OVERVIEW_DOCUMENT.path, schema: PROJECT_OVERVIEW_DOCUMENT.schema, mediaType: PROJECT_OVERVIEW_DOCUMENT.mediaType, artifact: pointer(savedMarkdown.ref), renderer: { ...PROJECT_OVERVIEW_RENDERER } },
  };
  validateProjectOverviewChangeSetAgainstBaseline({ projectOverviewChangeSet: overviewChange, requirementsChangeSet: change, requirementsChangeSetRef: savedChange.ref, baseOverview: overviewBaseline.value, baseOverviewRef: overviewBaseline.ref });
  const savedOverview = await persist({ value: overviewChange, artifactId: overviewChange.changeSetId, schema: SCHEMAS.overviewChange, mediaType: MEDIA.overviewChange }, persistArtifact);
  const sources = await persistNativeSources(response, persistArtifact);
  const bundle = await persistBundle(invocation, sources, [savedChange.ref, savedOverview.ref], persistArtifact);
  return moduleResult(invocation, "change_set_drafted", { "requirements-change-set": [savedChange.ref], "project-overview-change-set-draft": [savedOverview.ref], "native-source-bundle": [bundle.ref] }, [{ kind: "requirements/source-provenance", subject: `requirements-change-set:${change.changeSetId}`, status: "pass", artifact: bundle.ref, summary: "The canonical full-body replacement retains exact digest-bound OpenSpec proposal/spec artifacts returned by the host capability executor." }]);
}

async function clarificationResult(invocation, loaded, producer, response, persistArtifact) {
  if (!producer || producer.invocationId !== invocation.invocationId || canonicalJson(producer.plugin) !== canonicalJson(PLUGIN)) fail("effect producer identity is required for clarification lineage");
  const inputs = baseInputs(loaded), request = { apiVersion: API, kind: "ClarificationRequestSet", requestSetId: stableId("clarification-request", { inputs, questions: response.questions }), baseInputs: inputs, questions: response.questions };
  validateRequirementsArtifact(request);
  const savedRequest = await persist({ value: request, artifactId: request.requestSetId, schema: SCHEMAS.clarification, mediaType: MEDIA.clarification }, persistArtifact);
  const continuation = { apiVersion: API, kind: "RequirementsGatheringContinuation", continuationId: stableId("requirements-continuation", { request: pointer(savedRequest.ref), producer }), clarificationRequest: pointer(savedRequest.ref), baseInputs: inputs, sourceInvocation: { invocationId: producer.invocationId, invocationFingerprint: producer.invocationFingerprint, plugin: structuredClone(producer.plugin), stepInvocationDigest: producer.stepInvocationDigest }, workingRequirements: response.workingRequirements, confirmedFacts: response.confirmedFacts, unresolvedQuestionIds: response.questions.map(({ id }) => id), sourceRefs: inputs.map(({ role, artifact }) => ({ role, artifact })) };
  validateRequirementsArtifact(continuation);
  const savedContinuation = await persist({ value: continuation, artifactId: continuation.continuationId, schema: SCHEMAS.continuation, mediaType: MEDIA.continuation }, persistArtifact);
  const sources = await persistNativeSources(response, persistArtifact);
  const bundle = await persistBundle(invocation, sources, [savedRequest.ref, savedContinuation.ref], persistArtifact);
  return moduleResult(invocation, "needs_clarification", { "clarification-requests": [savedRequest.ref], continuation: [savedContinuation.ref], "native-source-bundle": [bundle.ref] });
}

export function createOpenSpecRequirementsAdapter({ executeCapability, executor, loadArtifact, persistArtifact } = {}) {
  const execute = executeCapability ?? executor;
  if (typeof execute !== "function") fail("a host executeCapability/executor port is required");
  if (typeof loadArtifact !== "function" || typeof persistArtifact !== "function") fail("host loadArtifact and persistArtifact ports are required");
  return Object.freeze({
    async invoke(invocation, _adapterContext, producer) {
      assertBinding(invocation);
      const loaded = await loadInputs(invocation, loadArtifact);
      const request = capabilityRequest(invocation, loaded, producer);
      let returned;
      try { returned = await execute(immutable(request)); } catch (error) { fail(`capability executor failed: ${error instanceof Error ? error.message : String(error)}`); }
      const response = parseNativeResponse(returned, request.binding);
      const allowed = new Set(baseInputs(loaded).map(({ artifact }) => `${artifact.artifactId}\0${artifact.digest}`));
      const approvedHistoricalSourceRefs = loaded["requirements-baseline"]
        ? collectSourceRefs(loaded["requirements-baseline"].value.requirements)
        : new Set();
      for (const field of ["requirements", "questions", "workingRequirements", "confirmedFacts"]) {
        if (response[field] !== undefined) assertNoHiddenContext(response[field], allowed, approvedHistoricalSourceRefs);
      }
      return response.kind === "OpenSpecRequirementsProposal" ? proposalResult(invocation, loaded, response, persistArtifact) : clarificationResult(invocation, loaded, producer, response, persistArtifact);
    },
  });
}

export class OpenSpecRequirementsAdapter {
  constructor(ports) { this.adapter = createOpenSpecRequirementsAdapter(ports); }
  invoke(invocation, adapterContext, producer) { return this.adapter.invoke(invocation, adapterContext, producer); }
}
