import { readFileSync } from "node:fs";
import path from "node:path";
import { publishLocalContextFile } from "./local-context-materialization.mjs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { assertSessionContextReceipt, createSessionContextSnapshot, refreshSessionContext } from "./session-bootstrap.mjs";
import { prepareLocalWorkDependencyRoute, verifyLocalWorkDependencyRoute } from "./local-work-dependency-planning.mjs";
import { assertLocalWorkBaselineCurrent } from "./local-work-baseline-activation.mjs";
import { assertLocalWorkContextCurrent } from "./local-work-breakdown-context.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const dependencies = ["module-result.schema.json", "roadmap-management-artifacts.schema.json", "local-requirements-gate-commit.schema.json", "work-breakdown-context-boundary.schema.json"].map(read);
const validate = compileArtifactSchema(read("work-dependency-context-handoff.schema.json"), dependencies);
const validateBoundary = compileArtifactSchema(read("work-dependency-context-boundary.schema.json"), dependencies);
const validateConfiguration = compileArtifactSchema(read("desktop-local-host-configuration.schema.json"), dependencies);
const validateMaterialization = compileArtifactSchema(read("work-dependency-context-materialization.schema.json"), dependencies);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const keep = new Set(["requirements-baseline", "project-overview", "project-overview-projection", "project-memory-baseline", "current-synopsis", "traceability-context", "roadmap", "roadmap-projection"]);

async function derive({ priorSnapshot, priorReceipt, createdAt, ...request }, historical) {
  assertSessionContextReceipt({ receipt: priorReceipt, snapshot: priorSnapshot, currentBindings: priorSnapshot.bindings, currentRepositoryRevision: priorSnapshot.repositoryRevision });
  const priorBoundary = priorSnapshot.bindings.find(entry => entry.role === "lifecycle-status")?.artifact;
  if (!priorBoundary) throw new TypeError("dependency handoff requires the prior work boundary");
  const boundaryBytes = Buffer.from(await request.loadArtifact(priorBoundary));
  if (sha256Digest(boundaryBytes) !== priorBoundary.digest || !same(JSON.parse(boundaryBytes), request.boundary)) throw new TypeError("dependency handoff changes the session work boundary");
  const expected = historical?.files.find(entry => same(entry.ref, historical.state));
  const prepared = historical ? await verifyLocalWorkDependencyRoute({ ...request, expectedState: { ref: historical.state, bytes: Buffer.from(expected.bytesBase64, "base64") } })
    : await prepareLocalWorkDependencyRoute(request);
  const value = JSON.parse(prepared.state.bytes);
  for (const [role, ref] of [["project-overview", value.projectOverviewBaseline], ["requirements-baseline", request.checkpointReplay.loadedInputs["requirements-baseline"][0].ref]]) {
    if (!same(priorSnapshot.bindings.find(entry => entry.role === role)?.artifact, ref)) throw new TypeError("dependency handoff changes the approved project pair");
  }
  const files = [];
  const add = (ref, source) => {
    const bytes = Buffer.from(source);
    if (sha256Digest(bytes) !== ref.digest) throw new TypeError("dependency handoff artifact bytes drifted");
    if (!files.some(entry => same(entry.ref, ref))) files.push({ ref, bytesBase64: bytes.toString("base64"), byteLength: bytes.length });
    return ref;
  };
  const generated = (id, schema, value, mediaType = "application/json") => {
    const bytes = Buffer.from(canonicalJson(value));
    return add({ artifactId: id, schema, mediaType, digest: sha256Digest(bytes), uri: `artifact://dependency-context/${id}` }, bytes);
  };
  add(prepared.state.ref, prepared.state.bytes);
  const route = generated(`dependency-route-${prepared.state.ref.digest.slice(7)}`, "https://devrelay.dev/artifacts/module-route-decision/v1", prepared.route, "application/vnd.devrelay.module-route-decision+json");
  for (const ref of [value.workBreakdownBaseline, value.projectOverviewBaseline, value.contextSliceSet, value.policyBundle]) add(ref, await request.loadArtifact(ref));
  const policy = JSON.parse(Buffer.from(await request.loadArtifact(value.policyBundle)));
  add(policy.wasm, await request.loadArtifact(policy.wasm));
  for (const slice of prepared.state.snapshot.contextSlices) add(slice.sourceArtifact, await request.loadArtifact(slice.sourceArtifact));
  const body = { kind: "DesktopWorkDependencyContextBoundary", state: prepared.state.ref, route,
    workBaseline: value.workBreakdownBaseline, workBoundary: request.boundary, lifecycleComplete: false };
  if (!validateBoundary(body)) throw new TypeError("dependency boundary violates its contract");
  const boundary = generated(`dependency-boundary-${prepared.state.ref.digest.slice(7)}`, "https://devrelay.dev/host/work-dependency-context-boundary/v1", body);
  const invalidatedBindings = priorSnapshot.bindings.filter(entry => !keep.has(entry.role));
  const snapshot = createSessionContextSnapshot({ ...priorSnapshot, createdAt,
    bindings: [...priorSnapshot.bindings.filter(entry => keep.has(entry.role)), { role: "lifecycle-status", artifact: boundary, artifactVersion: "1.0.0" }] });
  const receipt = await refreshSessionContext({ priorReceipt, nextSnapshot: snapshot,
    expectedProjectId: snapshot.projectId, expectedTaskId: snapshot.taskId, expectedWorkspaceId: snapshot.workspaceId, expectedRepositoryRevision: snapshot.repositoryRevision,
    artifactResolver: ref => { const file = files.find(entry => same(entry.ref, ref)); return file ? Buffer.from(file.bytesBase64, "base64") : request.loadArtifact(ref); } });
  const result = { kind: "DesktopWorkDependencyContextHandoff", priorSnapshotDigest: priorReceipt.snapshot.digest,
    snapshot, receipt, state: prepared.state.ref, route, files, invalidatedBindings, lifecycleComplete: false };
  const handoff = { ...result, handoffDigest: canonicalJsonDigest(result) };
  if (!validate(handoff)) throw new TypeError("dependency handoff violates its contract");
  return handoff;
}

export async function createLocalWorkDependencyContext(request) { return derive(request); }
export function assertLocalWorkDependencyContextCurrent({ storage, namespace, boundary, state }) {
  if (!validateBoundary(boundary) || !same(boundary.state, state)) throw new TypeError("dependency invocation does not bind its exact session boundary");
  assertLocalWorkBaselineCurrent({ storage, namespace, baseline: boundary.workBaseline });
  assertLocalWorkContextCurrent({ storage, namespace, boundary: boundary.workBoundary, state: boundary.workBoundary.state });
}
export async function verifyLocalWorkDependencyContext({ handoff, ...request }) {
  if (!validate(handoff) || !handoff.files.some(entry => same(entry.ref, handoff.state))) throw new TypeError("historical dependency handoff violates its contract");
  const expected = await derive({ ...request, createdAt: handoff.snapshot.createdAt }, handoff);
  if (!same(expected, handoff)) throw new TypeError("historical dependency handoff differs from exact derivation");
  return expected;
}

// Host must rederive the handoff before calling. Configuration is published
// last so an interrupted copy never exposes a partially populated next context.
export function materializeLocalWorkDependencyContext({ configuration, handoff, resolvePath, verifyOnly = false }) {
  const { handoffDigest, ...body } = handoff;
  if (!validate(handoff) || canonicalJsonDigest(body) !== handoffDigest || configuration.projectId !== handoff.snapshot.projectId || configuration.taskId !== handoff.snapshot.taskId) throw new TypeError("dependency publication identity or digest drifted");
  const directory = path.join(configuration.stateDirectory, "dependency-contexts", handoffDigest.slice(7));
  const files = handoff.files.map((entry, index) => {
    const bytes = Buffer.from(entry.bytesBase64, "base64");
    if (bytes.toString("base64") !== entry.bytesBase64 || bytes.length !== entry.byteLength || sha256Digest(bytes) !== entry.ref.digest) throw new TypeError("dependency publication bytes drifted");
    return { path: path.join(directory, `artifact-${index}`), ref: entry.ref, bytes };
  });
  const snapshotBytes = Buffer.from(canonicalJson(handoff.snapshot));
  const sessionSnapshot = { path: path.join(directory, "session.json"), digest: sha256Digest(snapshotBytes) };
  const refs = new Set(files.map(entry => canonicalJsonDigest(entry.ref)));
  const next = { ...configuration, contractSet: "work-dependency", traceabilityVocabularyVersion: "1.9.0", sessionSnapshot,
    artifacts: [...configuration.artifacts.filter(entry => !refs.has(canonicalJsonDigest(entry.ref))), ...files.map(({ path, ref }) => ({ path, ref }))] };
  if (!validateConfiguration(next)) throw new TypeError("dependency configuration violates its contract");
  const bytes = Buffer.from(canonicalJson(next));
  const configPath = path.join(directory, "host.json");
  const publications = [...files, { path: sessionSnapshot.path, bytes: snapshotBytes }, { path: configPath, bytes }];
  for (const entry of publications) { resolvePath(entry.path, "filesystem.read"); if (!verifyOnly) resolvePath(entry.path, "filesystem.write"); }
  for (const entry of publications) {
    if (verifyOnly) { if (!readFileSync(resolvePath(entry.path, "filesystem.read")).equals(entry.bytes)) throw new TypeError("published dependency context drifted"); }
    else publishLocalContextFile(entry.path, entry.bytes, resolvePath);
  }
  const result = { kind: "DesktopWorkDependencyContextMaterialization", handoffDigest, configurationPath: resolvePath(configPath, "filesystem.read"),
    configurationDigest: sha256Digest(bytes), state: handoff.state, route: handoff.route, lifecycleComplete: false };
  if (!validateMaterialization(result)) throw new TypeError("dependency materialization violates its contract");
  return result;
}
