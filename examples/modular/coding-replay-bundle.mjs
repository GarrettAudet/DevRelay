import { readFile } from "node:fs/promises";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createModuleRegistry } from "../../src/module-registry.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { architectureRuntimeArtifactContracts } from "../../src/architecture-runtime-contracts.mjs";
import { workBreakdownRuntimeArtifactContracts } from "../../src/work-breakdown-runtime-contracts.mjs";
import { compileArtifactSchema } from "../../src/schema-validation.mjs";
import { createCodingPreflight } from "./coding-preflight.mjs";

const maximumBytes = 16 * 1024 * 1024;
const object = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const text = { type: "string", minLength: 1, maxLength: 4096 };
const ref = object({ artifactId: text, digest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
  schema: text, mediaType: text, uri: text }, ["artifactId", "digest"]);
const record = { type: "object" };
const validateBundle = compileArtifactSchema(object({
  formatVersion: { const: 1 },
  artifacts: { type: "array", minItems: 1, maxItems: 10000, items: object({ ref,
    bytesBase64: { type: "string", maxLength: maximumBytes * 2, pattern: "^[A-Za-z0-9+/]*={0,2}$" } }) },
  checkpoints: { type: "array", minItems: 1, maxItems: 1000, items: object({ key: text, value: record }) },
  invocations: object({ requirements: record, architecture: record, workBreakdown: record }),
  gates: object({ requirements: object({ requirementsBaseline: ref, projectOverviewBaseline: ref, projectOverviewMarkdown: ref }),
    architecture: object({ baseline: ref, ownerApproval: ref }), workBreakdown: object({ baseline: ref }) }),
  changeCard: ref,
}));
const modules = ["requirements-gathering", "architecture-design", "work-breakdown"];
const plugins = ["openspec", "github-spec-kit", "spec-kit-plan", "openspec-design", "structurizr", "madr", "openspec-tasks", "spec-kit-tasks"];
let catalog;
async function replayCatalog() {
  catalog ??= (async () => {
    const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
    const definitions = {
      modules: await Promise.all(modules.map(name => read(`../modules/${name}.module.json`))),
      plugins: await Promise.all(plugins.map(name => read(`../plugins/${name}.plugin.json`))),
    };
    const registries = [requirementsRuntimeArtifactContracts, architectureRuntimeArtifactContracts, workBreakdownRuntimeArtifactContracts].map((contracts, index) => createModuleRegistry({ modules: [definitions.modules[index]],
      plugins: definitions.plugins.filter(definition => definition.implements.every(item => item.module.id === modules[index])).map(definition => ({ definition, adapter: { async invoke() {
        throw new Error("Replay-only coding catalog cannot execute an adapter");
      } } })),
      artifactContracts: contracts(),
    }));
    return { registries, catalogDigest: canonicalJsonDigest(definitions) };
  })();
  return catalog;
}
function fail(message) {
  const error = new Error("Governed replay bundle blocked: " + message);
  error.code = "DR_MODULAR_REPLAY_BUNDLE";
  throw error;
}
function visitRefs(value, visit) {
  if (!value || typeof value !== "object") return;
  if (typeof value.artifactId === "string" && typeof value.digest === "string") visit(value);
  for (const child of Object.values(value)) visitRefs(child, visit);
}
function decodeJson(bytes, label) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(label + " must contain exact UTF-8 JSON"); }
}

/**
 * Import is evidence consistency, not independent authentication of the owner.
 * The trusted host supplies this bounded source bundle, never receipt JSON or a
 * caller-defined catalog. Only Core checkpoint verification creates authority.
 */
export async function validateCodingReplayBundle(input) {
  let encoded;
  try { encoded = canonicalJson(input); }
  catch { fail("bundle must be a JSON value"); }
  if (Buffer.byteLength(encoded) > maximumBytes) fail("bundle exceeds the 16 MiB limit");
  const bundle = JSON.parse(encoded);
  if (!validateBundle(bundle)) fail("invalid format: " + JSON.stringify(validateBundle.errors));
  const artifacts = new Map();
  let totalBytes = 0;
  for (const entry of bundle.artifacts) {
    const bytes = Buffer.from(entry.bytesBase64, "base64");
    if (bytes.toString("base64") !== entry.bytesBase64 || sha256Digest(bytes) !== entry.ref.digest) fail("artifact bytes or digest mismatch: " + entry.ref.artifactId);
    totalBytes += bytes.length;
    if (totalBytes > maximumBytes) fail("artifact bytes exceed the 16 MiB limit");
    const key = canonicalJson(entry.ref);
    if (artifacts.has(key)) fail("duplicate exact artifact reference: " + entry.ref.artifactId);
    artifacts.set(key, { ref: entry.ref, bytes });
  }
  const load = reference => {
    const entry = artifacts.get(canonicalJson(reference));
    if (!entry) fail("missing exact referenced artifact: " + reference?.artifactId);
    return Buffer.from(entry.bytes);
  };
  // Resolve the complete embedded reference closure, including opaque evidence
  // and native attachments that a particular validator may not otherwise read.
  const referenced = new Set();
  const requireRef = reference => { load(reference); referenced.add(canonicalJson(reference)); };
  visitRefs({ invocations: bundle.invocations, checkpoints: bundle.checkpoints, gates: bundle.gates, changeCard: bundle.changeCard }, requireRef);
  for (const entry of artifacts.values()) {
    let value;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes)); }
    catch { continue; }
    visitRefs(value, requireRef);
  }
  for (const key of artifacts.keys()) if (!referenced.has(key)) fail("unreferenced artifact in closed bundle: " + artifacts.get(key).ref.artifactId);
  const checkpoints = new Map();
  for (const entry of bundle.checkpoints) {
    if (checkpoints.has(entry.key)) fail("duplicate checkpoint identity");
    checkpoints.set(entry.key, entry.value);
  }
  const usedCheckpoints = new Set();
  const runtime = { artifacts: { load }, checkpoints: { async get(key) {
    usedCheckpoints.add(key);
    return checkpoints.get(key);
  } } };
  const { registries, catalogDigest } = await replayCatalog();
  const replay = {};
  for (const [index, name] of ["requirements", "architecture", "workBreakdown"].entries()) replay[name] = await registries[index].verifyCheckpointedExecution(bundle.invocations[name], runtime);
  if ([...checkpoints.keys()].some(key => !usedCheckpoints.has(key))) fail("unreferenced checkpoint in closed bundle");
  const json = reference => decodeJson(load(reference), reference.artifactId);
  const evidenceResolver = async reference => ({ ref: reference, bytes: load(reference) });
  const resolveAttached = reference => ({ ref: reference, bytes: load(reference), value: json(reference) });
  const req = bundle.gates.requirements;
  const arch = bundle.gates.architecture;
  const work = bundle.gates.workBreakdown;
  const requirements = { checkpointReplay: replay.requirements,
    requirementsBaseline: json(req.requirementsBaseline), requirementsBaselineRef: req.requirementsBaseline, requirementsBaselineBytes: load(req.requirementsBaseline),
    projectOverviewBaseline: json(req.projectOverviewBaseline), projectOverviewBaselineRef: req.projectOverviewBaseline, projectOverviewBaselineBytes: load(req.projectOverviewBaseline),
    projectOverviewMarkdownBytes: load(req.projectOverviewMarkdown) };
  const architecture = { checkpointReplay: replay.architecture, ownerApproval: json(arch.ownerApproval), ownerApprovalRef: arch.ownerApproval,
    ownerApprovalBytes: load(arch.ownerApproval), baseline: json(arch.baseline), baselineRef: arch.baseline, baselineBytes: load(arch.baseline), evidenceResolver, resolveAttached };
  const workBreakdown = { checkpointReplay: replay.workBreakdown, baseline: json(work.baseline), baselineRef: work.baseline,
    baselineBytes: load(work.baseline), evidenceResolver, architectureAttachmentResolver: evidenceResolver };
  const binding = role => workBreakdown.baseline.inputBindings.find(entry => entry.role === role)?.artifact;
  const heads = { requirementsBaseline: req.requirementsBaseline, projectOverviewBaseline: req.projectOverviewBaseline,
    architectureBaseline: arch.baseline, workBreakdownBaseline: work.baseline, projectContext: architecture.baseline.projectContext,
    repositorySnapshot: architecture.baseline.repositorySnapshot, contractDisposition: binding("contract-disposition"), capabilityCatalog: binding("capability-catalog") };
  const governance = { requirements, architecture, workBreakdown, changeCard: { ref: bundle.changeCard, bytes: load(bundle.changeCard) },
    readCurrentHeads: () => structuredClone(heads) };
  const preflight = await createCodingPreflight(governance);
  return { governance, heads: structuredClone(heads), approvalDigest: preflight.approvalDigest,
    context: preflight.context, preflight, catalogDigest, repositorySnapshot: json(heads.repositorySnapshot) };
}
