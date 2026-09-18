import { readFileSync } from "node:fs";
import path from "node:path";
import { publishLocalContextFile } from "./local-context-materialization.mjs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { assertSessionContextReceipt, createSessionContextSnapshot, refreshSessionContext } from "./session-bootstrap.mjs";
import { prepareLocalSpecialistAssignmentInputs, verifyLocalSpecialistAssignmentInputs } from "./local-specialist-assignment-planning.mjs";
import { assertLocalDependencyBaselineCurrent } from "./local-dependency-baseline-activation.mjs";
import { assertLocalWorkBaselineCurrent } from "./local-work-baseline-activation.mjs";
import { assertLocalWorkContextCurrent } from "./local-work-breakdown-context.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const dependencies = ["module-result.schema.json", "roadmap-management-artifacts.schema.json", "local-requirements-gate-commit.schema.json",
  "work-breakdown-context-boundary.schema.json", "local-specialist-assignment-inputs.schema.json"].map(read);
const validate = compileArtifactSchema(read("specialist-assignment-context-handoff.schema.json"), dependencies);
const validateBoundary = compileArtifactSchema(read("specialist-assignment-context-boundary.schema.json"), dependencies);
const validatePriorBoundary = compileArtifactSchema(read("work-dependency-context-boundary.schema.json"), dependencies);
const validateConfiguration = compileArtifactSchema(read("desktop-local-host-configuration.schema.json"), dependencies);
const validateMaterialization = compileArtifactSchema(read("specialist-assignment-context-materialization.schema.json"), dependencies);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const keep = new Set(["requirements-baseline", "project-overview", "project-overview-projection", "project-memory-baseline", "current-synopsis", "traceability-context", "roadmap", "roadmap-projection"]);
const fail = message => { throw new TypeError(`assignment context: ${message}`); };

async function derive({ priorSnapshot, priorReceipt, createdAt, ...request }, historical) {
  assertSessionContextReceipt({ receipt: priorReceipt, snapshot: priorSnapshot, currentBindings: priorSnapshot.bindings, currentRepositoryRevision: priorSnapshot.repositoryRevision });
  const priorRef = priorSnapshot.bindings.find(entry => entry.role === "lifecycle-status")?.artifact;
  if (!priorRef) fail("prior dependency session boundary is required");
  const priorBytes = Buffer.from(await request.loadArtifact(priorRef));
  if (sha256Digest(priorBytes) !== priorRef.digest) fail("prior dependency boundary bytes drifted");
  const prior = JSON.parse(priorBytes);
  if (!validatePriorBoundary(prior) || !same(prior.state, request.expectedState.ref) || !same(prior.workBoundary, request.boundary)) fail("prior dependency boundary differs from approved lineage");
  const prepared = historical
    ? await verifyLocalSpecialistAssignmentInputs({ ...request, expectedPlan: historical.plan })
    : await prepareLocalSpecialistAssignmentInputs(request);
  const repository = prepared.loadedInputs["repository-context"][0].value;
  if (repository.kind === "RepositorySnapshot" && repository.revision !== priorSnapshot.repositoryRevision) fail("repository revision differs from the session");
  if (!same(prior.workBaseline, prepared.plan.inputs["work-breakdown-baseline"])) fail("prior dependency boundary changes approved work");
  for (const [role, ref] of [["project-overview", prepared.plan.inputs["project-overview-baseline"]], ["requirements-baseline", request.checkpointReplay.loadedInputs["requirements-baseline"][0].ref]]) {
    if (!same(priorSnapshot.bindings.find(entry => entry.role === role)?.artifact, ref)) fail("handoff changes the approved project pair");
  }
  const files = [];
  const add = (ref, source) => {
    const bytes = Buffer.from(source);
    if (sha256Digest(bytes) !== ref.digest) fail("artifact bytes drifted");
    if (!files.some(entry => same(entry.ref, ref))) files.push({ ref, bytesBase64: bytes.toString("base64"), byteLength: bytes.length });
  };
  for (const entries of Object.values(prepared.loadedInputs)) for (const entry of entries) add(entry.ref, entry.bytes);
  const body = { kind: "DesktopSpecialistAssignmentContextBoundary", plan: prepared.plan, workBoundary: request.boundary, lifecycleComplete: false };
  if (!validateBoundary(body)) fail("boundary violates its contract");
  const bytes = Buffer.from(canonicalJson(body));
  const id = `assignment-boundary-${sha256Digest(bytes).slice(7)}`;
  const boundary = { artifactId: id, schema: "https://devrelay.dev/host/specialist-assignment-context-boundary/v1",
    mediaType: "application/json", digest: sha256Digest(bytes), uri: `artifact://assignment-context/${id}` };
  add(boundary, bytes);
  const invalidatedBindings = priorSnapshot.bindings.filter(entry => !keep.has(entry.role));
  const snapshot = createSessionContextSnapshot({ ...priorSnapshot, createdAt,
    bindings: [...priorSnapshot.bindings.filter(entry => keep.has(entry.role)), { role: "lifecycle-status", artifact: boundary, artifactVersion: "1.0.0" }] });
  const receipt = await refreshSessionContext({ priorReceipt, nextSnapshot: snapshot,
    expectedProjectId: snapshot.projectId, expectedTaskId: snapshot.taskId, expectedWorkspaceId: snapshot.workspaceId, expectedRepositoryRevision: snapshot.repositoryRevision,
    artifactResolver: ref => { const file = files.find(entry => same(entry.ref, ref)); return file ? Buffer.from(file.bytesBase64, "base64") : request.loadArtifact(ref); } });
  const result = { kind: "DesktopSpecialistAssignmentContextHandoff", priorSnapshotDigest: priorReceipt.snapshot.digest,
    snapshot, receipt, plan: prepared.plan, files, invalidatedBindings, lifecycleComplete: false };
  const handoff = { ...result, handoffDigest: canonicalJsonDigest(result) };
  if (!validate(handoff)) fail("handoff violates its contract");
  return handoff;
}

export async function createLocalSpecialistAssignmentContext(request) { return derive(request); }
export async function verifyLocalSpecialistAssignmentContext({ handoff, ...request }) {
  if (!validate(handoff)) fail("historical handoff violates its contract");
  const expected = await derive({ ...request, createdAt: handoff.snapshot.createdAt }, handoff);
  if (!same(expected, handoff)) fail("historical handoff differs from exact derivation");
  return expected;
}
export function assertLocalSpecialistAssignmentContextCurrent({ storage, namespace, boundary, plan }) {
  if (!validateBoundary(boundary) || !same(boundary.plan, plan)) fail("invocation does not bind its exact session boundary");
  assertLocalDependencyBaselineCurrent({ storage, namespace, baseline: plan.inputs["work-dependency-baseline"] });
  assertLocalWorkBaselineCurrent({ storage, namespace, baseline: plan.inputs["work-breakdown-baseline"] });
  assertLocalWorkContextCurrent({ storage, namespace, boundary: boundary.workBoundary, state: boundary.workBoundary.state });
}

// Call only after exact host rederivation of the handoff. Publish artifacts and
// session first, then host.json: interrupted copies never expose partial context.
export function materializeLocalSpecialistAssignmentContext({ configuration, handoff, resolvePath, verifyOnly = false }) {
  const { handoffDigest, ...body } = handoff;
  if (!validate(handoff) || canonicalJsonDigest(body) !== handoffDigest || configuration.projectId !== handoff.snapshot.projectId ||
      configuration.taskId !== handoff.snapshot.taskId) fail("publication identity or digest drifted");
  const directory = path.join(configuration.stateDirectory, "assignment-contexts", handoffDigest.slice(7));
  const files = handoff.files.map((entry, index) => {
    const bytes = Buffer.from(entry.bytesBase64, "base64");
    if (bytes.toString("base64") !== entry.bytesBase64 || bytes.length !== entry.byteLength || sha256Digest(bytes) !== entry.ref.digest) fail("publication bytes drifted");
    return { path: path.join(directory, `artifact-${index}`), ref: entry.ref, bytes };
  });
  const snapshotBytes = Buffer.from(canonicalJson(handoff.snapshot));
  const sessionSnapshot = { path: path.join(directory, "session.json"), digest: sha256Digest(snapshotBytes) };
  const refs = new Set(files.map(entry => canonicalJsonDigest(entry.ref)));
  const next = { ...configuration, contractSet: "specialist-assignment", traceabilityVocabularyVersion: "1.9.0", sessionSnapshot,
    artifacts: [...configuration.artifacts.filter(entry => !refs.has(canonicalJsonDigest(entry.ref))), ...files.map(({ path, ref }) => ({ path, ref }))] };
  if (!validateConfiguration(next)) fail("configuration violates its contract");
  const bytes = Buffer.from(canonicalJson(next));
  const configurationPath = path.join(directory, "host.json");
  const publications = [...files, { path: sessionSnapshot.path, bytes: snapshotBytes }, { path: configurationPath, bytes }];
  for (const entry of publications) { resolvePath(entry.path, "filesystem.read"); if (!verifyOnly) resolvePath(entry.path, "filesystem.write"); }
  for (const entry of publications) {
    if (verifyOnly) {
      if (!readFileSync(resolvePath(entry.path, "filesystem.read")).equals(entry.bytes)) fail("published context drifted");
    } else publishLocalContextFile(entry.path, entry.bytes, resolvePath);
  }
  const result = { kind: "DesktopSpecialistAssignmentContextMaterialization", handoffDigest,
    configurationPath: resolvePath(configurationPath, "filesystem.read"), configurationDigest: sha256Digest(bytes), plan: handoff.plan, lifecycleComplete: false };
  if (!validateMaterialization(result)) fail("materialization violates its contract");
  return result;
}
