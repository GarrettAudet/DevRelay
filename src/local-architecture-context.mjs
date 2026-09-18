import { readFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { createSessionContextSnapshot, refreshSessionContext, assertSessionContextReceipt } from "./session-bootstrap.mjs";
import { verifyLocalDiscoveryActivation, assertLocalArchitectureCurrentState } from "./local-discovery-activation.mjs";
import { publishLocalContextFile } from "./local-context-materialization.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const deps = [read("module-result.schema.json"), read("roadmap-management-artifacts.schema.json"), read("local-requirements-gate-commit.schema.json")];
const validateHandoff = compileArtifactSchema(read("architecture-context-handoff.schema.json"), deps);
const validateConfiguration = compileArtifactSchema(read("desktop-local-host-configuration.schema.json"), deps);
const validateBoundary = compileArtifactSchema(read("architecture-context-boundary.schema.json"), deps);
const validateMaterialization = compileArtifactSchema(read("architecture-context-materialization.schema.json"), deps);
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const keep = new Set(["requirements-baseline", "project-overview", "project-overview-projection", "project-memory-baseline", "current-synopsis", "traceability-context", "roadmap", "roadmap-projection"]);

export async function createLocalArchitectureContext({ storage, namespace, checkpointReplay, gate, activation,
  priorSnapshot, priorReceipt, loadArtifact, registry, createdAt }) {
  assertSessionContextReceipt({ receipt: priorReceipt, snapshot: priorSnapshot, currentBindings: priorSnapshot.bindings, currentRepositoryRevision: priorSnapshot.repositoryRevision });
  await verifyLocalDiscoveryActivation({ storage, namespace, checkpointReplay, gate, activation, loadArtifact });
  assertLocalArchitectureCurrentState({ storage, namespace, state: activation.state });
  for (const [role, port] of [["requirements-baseline", "requirements-baseline"], ["project-overview", "project-overview-baseline"]]) {
    if (!same(priorSnapshot.bindings.find(entry => entry.role === role)?.artifact, checkpointReplay.loadedInputs[port]?.[0]?.ref)) throw new TypeError("architecture context changes the approved project pair");
  }
  const files = [];
  const add = (ref, bytes) => {
    if (sha256Digest(bytes) !== ref.digest) throw new TypeError("architecture context bytes drifted");
    files.push({ ref, bytesBase64: bytes.toString("base64"), byteLength: bytes.length }); return ref;
  };
  const generated = (artifactId, schema, mediaType, value) => {
    const bytes = Buffer.from(canonicalJson(value));
    return add({ artifactId, schema, mediaType, digest: sha256Digest(bytes), uri: `artifact://architecture-context/${artifactId}` }, bytes);
  };
  add(activation.state, storage.getArtifact(activation.storedState));
  const state = JSON.parse(gate.nextState.utf8);
  const discoverySnapshot = add(state.currentArchitectureSnapshot, Buffer.from(await loadArtifact(state.currentArchitectureSnapshot)));
  // The module must already be declared in the host configuration. Core loads
  // the exact activated state and selects its route; no caller operation exists.
  const decision = await registry.selectOperation({ id: "architecture-design", version: "0.1.0" }, activation.state, { artifacts: { load: loadArtifact } });
  if (decision.selection.kind !== "operation" || decision.selection.operation !== "establish-baseline") throw new TypeError("activated discovery did not select ArchitectureDesign baseline establishment");
  const route = generated(`architecture-route-${activation.activationDigest.slice(7)}`, "https://devrelay.dev/artifacts/module-route-decision/v1", "application/vnd.devrelay.module-route-decision+json", decision);
  const invalidatedBindings = priorSnapshot.bindings.filter(entry => !keep.has(entry.role));
  const boundaryBody = { kind: "DesktopArchitectureContextBoundary", activationDigest: activation.activationDigest, state: activation.state, discoverySnapshot, route, lifecycleComplete: false };
  if (!validateBoundary(boundaryBody)) throw new TypeError("architecture context boundary violates its contract");
  const boundary = generated(`architecture-boundary-${activation.activationDigest.slice(7)}`, "https://devrelay.dev/host/architecture-context-boundary/v1", "application/json", boundaryBody);
  const snapshot = createSessionContextSnapshot({ ...priorSnapshot, createdAt,
    bindings: [...priorSnapshot.bindings.filter(entry => keep.has(entry.role)), { role: "lifecycle-status", artifact: boundary, artifactVersion: "1.0.0" }] });
  const receipt = await refreshSessionContext({ priorReceipt, nextSnapshot: snapshot,
    expectedProjectId: snapshot.projectId, expectedTaskId: snapshot.taskId, expectedWorkspaceId: snapshot.workspaceId, expectedRepositoryRevision: snapshot.repositoryRevision,
    artifactResolver: ref => { const file = files.find(entry => same(entry.ref, ref)); return file ? Buffer.from(file.bytesBase64, "base64") : loadArtifact(ref); } });
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopArchitectureContextHandoff", priorSnapshotDigest: priorReceipt.snapshot.digest,
    activationDigest: activation.activationDigest, snapshot, receipt, state: activation.state, discoverySnapshot, route, files, invalidatedBindings, lifecycleComplete: false };
  const handoff = { ...body, handoffDigest: canonicalJsonDigest(body) };
  if (!validateHandoff(handoff)) throw new TypeError("architecture context handoff violates its contract");
  return handoff;
}

export function materializeLocalArchitectureContext({ configuration, handoff, resolvePath, verifyOnly = false }) {
  const { handoffDigest, ...body } = handoff;
  if (!validateHandoff(handoff) || canonicalJsonDigest(body) !== handoffDigest || configuration.projectId !== handoff.snapshot.projectId || configuration.taskId !== handoff.snapshot.taskId) throw new TypeError("architecture context publication drifted");
  const directory = path.join(configuration.stateDirectory, "architecture-contexts", handoffDigest.slice(7));
  const files = handoff.files.map((entry, index) => {
    const bytes = Buffer.from(entry.bytesBase64, "base64");
    if (bytes.toString("base64") !== entry.bytesBase64 || bytes.length !== entry.byteLength || sha256Digest(bytes) !== entry.ref.digest) throw new TypeError("architecture context file drifted");
    return { path: path.join(directory, `artifact-${index}`), ref: entry.ref, bytes };
  });
  const snapshotBytes = Buffer.from(canonicalJson(handoff.snapshot));
  const sessionSnapshot = { path: path.join(directory, "session.json"), digest: sha256Digest(snapshotBytes) };
  const refs = new Set(files.map(entry => canonicalJsonDigest(entry.ref)));
  const next = { ...configuration, contractSet: "architecture", sessionSnapshot, artifacts: [...configuration.artifacts.filter(entry => !refs.has(canonicalJsonDigest(entry.ref))), ...files.map(({ path, ref }) => ({ path, ref }))] };
  if (!validateConfiguration(next)) throw new TypeError("next architecture configuration violates its contract");
  const bytes = Buffer.from(canonicalJson(next));
  const configPath = path.join(directory, "host.json");
  const publications = [...files, { path: sessionSnapshot.path, bytes: snapshotBytes }, { path: configPath, bytes }];
  for (const entry of publications) { resolvePath(entry.path, "filesystem.read"); if (!verifyOnly) resolvePath(entry.path, "filesystem.write"); }
  for (const entry of publications) {
    if (verifyOnly) { if (!readFileSync(resolvePath(entry.path, "filesystem.read")).equals(entry.bytes)) throw new TypeError("published architecture context drifted"); }
    else publishLocalContextFile(entry.path, entry.bytes, resolvePath);
  }
  const result = { kind: "DesktopArchitectureContextMaterialization", handoffDigest, configurationPath: resolvePath(configPath, "filesystem.read"), configurationDigest: sha256Digest(bytes), state: handoff.state, discoverySnapshot: handoff.discoverySnapshot, route: handoff.route, lifecycleComplete: false };
  if (!validateMaterialization(result)) throw new TypeError("architecture context materialization violates its contract");
  return result;
}
