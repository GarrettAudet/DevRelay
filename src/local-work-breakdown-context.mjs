import { readFileSync } from "node:fs";
import path from "node:path";
import { publishLocalContextFile } from "./local-context-materialization.mjs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { createSessionContextSnapshot, refreshSessionContext, assertSessionContextReceipt } from "./session-bootstrap.mjs";
import { prepareLocalWorkBreakdownRoute, verifyLocalWorkBreakdownRoute, verifyWorkPredecessor, assertWorkPredecessorCurrent } from "./local-work-breakdown-planning.mjs";
import { loadArtifactContent } from "./artifact-runtime.mjs";
import { assertLocalArchitectureCurrentState, localArchitectureHeadId } from "./local-discovery-activation.mjs";
import { assertLocalContractCurrentState, localContractHeadId } from "./local-contract-activation.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const deps = [read("module-result.schema.json"), read("roadmap-management-artifacts.schema.json"), read("local-requirements-gate-commit.schema.json")];
const validateV1 = compileArtifactSchema(read("work-breakdown-context-handoff.schema.json"), deps);
const validateV2 = compileArtifactSchema(read("desktop-work-context-submission-v2.schema.json").$defs.handoff, deps);
const validate = value => value?.version === "2.0.0" ? validateV2(value) : validateV1(value);
const validateBoundary = compileArtifactSchema(read("work-breakdown-context-boundary.schema.json"), deps);
const validateConfiguration = compileArtifactSchema(read("desktop-local-host-configuration.schema.json"), deps);
const validateMaterialization = compileArtifactSchema(read("work-breakdown-context-materialization.schema.json"), deps);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const keep = new Set(["requirements-baseline", "project-overview", "project-overview-projection", "project-memory-baseline", "current-synopsis", "traceability-context", "roadmap", "roadmap-projection"]);

async function deriveContext({ priorSnapshot, priorReceipt, createdAt, ...request }, historical) {
  assertSessionContextReceipt({ receipt: priorReceipt, snapshot: priorSnapshot, currentBindings: priorSnapshot.bindings, currentRepositoryRevision: priorSnapshot.repositoryRevision });
  const expectedFile = historical?.files.find(entry => same(entry.ref, historical.state));
  const prepared = historical ? await verifyLocalWorkBreakdownRoute({ ...request,
    expectedState: { ref: historical.state, bytes: Buffer.from(expectedFile.bytesBase64, "base64") } }) : await prepareLocalWorkBreakdownRoute(request);
  const value = JSON.parse(prepared.state.bytes);
  const repository = JSON.parse(Buffer.from(await request.loadArtifact(value.repositoryContext ?? value.currentRepositorySnapshot)));
  if (repository.kind === "RepositorySnapshot" && repository.revision !== priorSnapshot.repositoryRevision) throw new TypeError("work context repository revision differs from session");
  for (const [role, ref] of [["requirements-baseline", value.requirementsBaseline], ["project-overview", value.projectOverviewBaseline]]) {
    if (!same(priorSnapshot.bindings.find(entry => entry.role === role)?.artifact, ref)) throw new TypeError("work context changes the approved project pair");
  }
  const files = [];
  const add = (ref, bytes) => {
    bytes = Buffer.from(bytes);
    if (sha256Digest(bytes) !== ref.digest) throw new TypeError("work context bytes drifted");
    files.push({ ref, bytesBase64: bytes.toString("base64"), byteLength: bytes.length });
    return ref;
  };
  const generated = (id, schema, mediaType, body) => {
    const bytes = Buffer.from(canonicalJson(body));
    return add({ artifactId: id, schema, mediaType, digest: sha256Digest(bytes), uri: `artifact://work-context/${id}` }, bytes);
  };
  add(prepared.state.ref, prepared.state.bytes);
  const route = generated(`work-route-${prepared.state.ref.digest.slice(7)}`, "https://devrelay.dev/artifacts/module-route-decision/v1", "application/vnd.devrelay.module-route-decision+json", prepared.route);
  const disposition = (request.contractGate ?? request.notApplicableCommit).disposition;
  add(value.architectureBaseline, Buffer.from(request.record.baseline.bytesBase64, "base64"));
  add(value.contractDisposition, Buffer.from(disposition.bytesBase64, "base64"));
  const refs = [value.capabilityCatalog, value.repositoryContext ?? value.currentRepositorySnapshot];
  if (value.currentWorkBreakdownBaseline) {
    refs.push(value.currentWorkBreakdownBaseline, value.approvedChangePackage);
    const change = JSON.parse(Buffer.from(await request.loadArtifact(value.approvedChangePackage)));
    refs.push(...change.approvalEvidence, change.approvedRequirementsChange, change.approvedArchitectureChange, change.approvedContractChangeDisposition);
  }
  for (const ref of refs) if (!files.some(entry => same(entry.ref, ref))) add(ref, await request.loadArtifact(ref));
  const boundaryBody = { kind: "DesktopWorkBreakdownContextBoundary", state: prepared.state.ref, route,
    architectureState: prepared.state.architectureState, contractState: prepared.state.contractState, lifecycleComplete: false };
  if (!validateBoundary(boundaryBody)) throw new TypeError("work context boundary violates its contract");
  const boundary = generated(`work-boundary-${prepared.state.ref.digest.slice(7)}`, "https://devrelay.dev/host/work-breakdown-context-boundary/v1", "application/json", boundaryBody);
  const invalidatedBindings = priorSnapshot.bindings.filter(entry => !keep.has(entry.role));
  const snapshot = createSessionContextSnapshot({ ...priorSnapshot, createdAt,
    bindings: [...priorSnapshot.bindings.filter(entry => keep.has(entry.role)), { role: "lifecycle-status", artifact: boundary, artifactVersion: "1.0.0" }] });
  const receipt = await refreshSessionContext({ priorReceipt, nextSnapshot: snapshot,
    expectedProjectId: snapshot.projectId, expectedTaskId: snapshot.taskId, expectedWorkspaceId: snapshot.workspaceId, expectedRepositoryRevision: snapshot.repositoryRevision,
    artifactResolver: ref => { const file = files.find(entry => same(entry.ref, ref)); return file ? Buffer.from(file.bytesBase64, "base64") : request.loadArtifact(ref); } });
  const body = { kind: "DesktopWorkBreakdownContextHandoff", ...(value.currentWorkBreakdownBaseline ? { version: "2.0.0" } : {}), priorSnapshotDigest: priorReceipt.snapshot.digest,
    snapshot, receipt, state: prepared.state.ref, route, files, invalidatedBindings, lifecycleComplete: false };
  const result = { ...body, handoffDigest: canonicalJsonDigest(body) };
  if (!validate(result)) throw new TypeError("work context handoff violates its contract");
  return result;
}

export async function createLocalWorkBreakdownContext(request) { return deriveContext(request); }

// Called only at a new downstream execution/response boundary, never to observe
// completed historical work. The host loads this exact session-bound artifact.
export function assertLocalWorkContextCurrent({ storage, namespace, boundary, state }) {
  if (!validateBoundary(boundary) || !same(boundary.state, state)) throw new TypeError("work invocation does not bind its exact session boundary");
  // Managed handoffs require activated heads, unlike an explicit legacy import.
  storage.readRun(localArchitectureHeadId(namespace));
  storage.readRun(localContractHeadId(namespace));
  assertLocalArchitectureCurrentState({ storage, namespace, state: boundary.architectureState });
  assertLocalContractCurrentState({ storage, namespace, state: boundary.contractState });
}

// Fresh work requests additionally bind the predecessor. Downstream requests
// observing the already activated result use only the upstream boundary check.
export async function assertLocalWorkInvocationCurrent(request) {
  assertLocalWorkContextCurrent(request);
  const loaded = await loadArtifactContent(request.state, { load: request.loadArtifact });
  const predecessor = await verifyWorkPredecessor({ ...request, currentWorkBreakdownBaseline: loaded.value.currentWorkBreakdownBaseline });
  assertWorkPredecessorCurrent({ ...request, predecessor });
}

export async function verifyLocalWorkBreakdownContext({ handoff, ...request }) {
  if (!validate(handoff)) throw new TypeError("historical work handoff violates its contract");
  if (!handoff.files.some(entry => same(entry.ref, handoff.state))) throw new TypeError("historical work state is missing");
  const expected = await deriveContext({ ...request, createdAt: handoff.snapshot.createdAt }, handoff);
  if (!same(expected, handoff)) throw new TypeError("historical work handoff differs from exact derivation");
  return expected;
}

export function materializeLocalWorkBreakdownContext({ configuration, handoff, resolvePath, verifyOnly = false }) {
  const { handoffDigest, ...body } = handoff;
  if (!validate(handoff) || canonicalJsonDigest(body) !== handoffDigest || configuration.projectId !== handoff.snapshot.projectId || configuration.taskId !== handoff.snapshot.taskId) throw new TypeError("work context publication drifted");
  const directory = path.join(configuration.stateDirectory, "work-contexts", handoffDigest.slice(7));
  const files = handoff.files.map((entry, index) => {
    const bytes = Buffer.from(entry.bytesBase64, "base64");
    if (bytes.toString("base64") !== entry.bytesBase64 || bytes.length !== entry.byteLength || sha256Digest(bytes) !== entry.ref.digest) throw new TypeError("work context file drifted");
    return { path: path.join(directory, `artifact-${index}`), ref: entry.ref, bytes };
  });
  const snapshotBytes = Buffer.from(canonicalJson(handoff.snapshot));
  const sessionSnapshot = { path: path.join(directory, "session.json"), digest: sha256Digest(snapshotBytes) };
  const refs = new Set(files.map(entry => canonicalJsonDigest(entry.ref)));
  const next = { ...configuration, contractSet: "work-breakdown", traceabilityVocabularyVersion: "1.9.0", sessionSnapshot,
    artifacts: [...configuration.artifacts.filter(entry => !refs.has(canonicalJsonDigest(entry.ref))), ...files.map(({ path, ref }) => ({ path, ref }))] };
  if (!validateConfiguration(next)) throw new TypeError("next work configuration violates its contract");
  const bytes = Buffer.from(canonicalJson(next));
  const configPath = path.join(directory, "host.json");
  const publications = [...files, { path: sessionSnapshot.path, bytes: snapshotBytes }, { path: configPath, bytes }];
  for (const entry of publications) { resolvePath(entry.path, "filesystem.read"); if (!verifyOnly) resolvePath(entry.path, "filesystem.write"); }
  for (const entry of publications) {
    if (verifyOnly) { if (!readFileSync(resolvePath(entry.path, "filesystem.read")).equals(entry.bytes)) throw new TypeError("published work context drifted"); }
    else publishLocalContextFile(entry.path, entry.bytes, resolvePath);
  }
  const result = { kind: "DesktopWorkBreakdownContextMaterialization", handoffDigest, configurationPath: resolvePath(configPath, "filesystem.read"),
    configurationDigest: sha256Digest(bytes), state: handoff.state, route: handoff.route, lifecycleComplete: false };
  if (!validateMaterialization(result)) throw new TypeError("work materialization violates its contract");
  return result;
}
