import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";

const schema = (name) => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const dependencies = [schema("module-result.schema.json"), schema("roadmap-management-artifacts.schema.json"), schema("local-requirements-gate-commit.schema.json")];
const validateHandoff = compileArtifactSchema(schema("requirements-context-handoff.schema.json"), dependencies);
const validateConfiguration = compileArtifactSchema(schema("desktop-local-host-configuration.schema.json"), dependencies);
const validateResult = compileArtifactSchema(schema("requirements-context-materialization.schema.json"), [...dependencies, schema("desktop-local-host-configuration.schema.json")]);
const pointer = (ref) => canonicalJsonDigest({ artifactId: ref.artifactId, digest: ref.digest });

function publicationPlan(configuration, handoff) {
  if (!validateHandoff(handoff)) throw new TypeError("context handoff violates its closed contract");
  const { handoffDigest, ...body } = handoff;
  if (canonicalJsonDigest(body) !== handoffDigest) throw new TypeError("context handoff digest drifted");
  if (configuration.projectId !== handoff.snapshot.projectId || configuration.taskId !== handoff.snapshot.taskId) throw new TypeError("context publication identity differs from the host");
  const directory = path.join(configuration.stateDirectory, "contexts", handoffDigest.slice(7));
  const files = handoff.files.map((entry, index) => {
    const bytes = Buffer.from(entry.bytesBase64, "base64");
    if (bytes.toString("base64") !== entry.bytesBase64 || bytes.length !== entry.byteLength || sha256Digest(bytes) !== entry.ref.digest) throw new TypeError("context publication bytes drifted");
    return { path: path.join(directory, `artifact-${index}`), ref: entry.ref, bytes };
  });
  const replacements = new Set(files.map(({ ref }) => pointer(ref)));
  const snapshotBytes = Buffer.from(canonicalJson(handoff.snapshot));
  const snapshot = { path: path.join(directory, "session.json"), digest: sha256Digest(snapshotBytes) };
  const nextConfiguration = { ...configuration, sessionSnapshot: snapshot,
    artifacts: [...configuration.artifacts.filter(({ ref }) => !replacements.has(pointer(ref))), ...files.map(({ path: file, ref }) => ({ path: file, ref }))] };
  if (!validateConfiguration(nextConfiguration)) throw new TypeError("next host configuration violates its contract");
  const configurationBytes = Buffer.from(canonicalJson(nextConfiguration));
  return { files: [...files, { path: snapshot.path, bytes: snapshotBytes }], snapshot,
    configuration: { path: path.join(directory, "host.json"), digest: sha256Digest(configurationBytes) }, configurationBytes };
}

function exactFile(target, bytes) {
  if (!readFileSync(target).equals(bytes)) throw new TypeError("immutable context publication conflicts with existing bytes");
}

export function publishLocalContextFile(relative, bytes, resolvePath) {
  let target = resolvePath(relative, "filesystem.write");
  if (existsSync(target)) { exactFile(resolvePath(relative, "filesystem.read"), bytes); return; }
  mkdirSync(path.dirname(target), { recursive: true });
  target = resolvePath(relative, "filesystem.write");
  const temporaryRelative = `${relative}.tmp-${randomUUID()}`;
  const temporary = resolvePath(temporaryRelative, "filesystem.write");
  const fd = openSync(temporary, "wx");
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
  try {
    // Atomic no-clobber publication: never replace an existing context file.
    try { linkSync(temporary, target); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    exactFile(resolvePath(relative, "filesystem.read"), bytes);
  } finally { unlinkSync(temporary); }
}

function result(plan, handoff, resolvePath) {
  const value = { kind: "DesktopRequirementsContextMaterialization", handoffDigest: handoff.handoffDigest,
    configurationPath: resolvePath(plan.configuration.path, "filesystem.read"), configurationDigest: plan.configuration.digest,
    snapshot: plan.snapshot, lifecycleComplete: false };
  if (!validateResult(value)) throw new TypeError("context materialization violates its closed contract");
  return Object.freeze(value);
}

// resolvePath is the host's existing real-path confinement and explicit-grant
// boundary. The host rederives the genuine handoff before calling either entry.
export function materializeLocalRequirementsContext({ configuration, handoff, resolvePath }) {
  const plan = publicationPlan(configuration, handoff);
  // Preflight every destination and read grant before creating any directory.
  for (const entry of [...plan.files, plan.configuration]) {
    resolvePath(entry.path, "filesystem.read"); resolvePath(entry.path, "filesystem.write");
  }
  for (const entry of plan.files) publishLocalContextFile(entry.path, entry.bytes, resolvePath);
  // The usable host configuration is the final publication marker. Partial
  // artifact files from an interrupted attempt are immutable and safe to retry.
  publishLocalContextFile(plan.configuration.path, plan.configurationBytes, resolvePath);
  return result(plan, handoff, resolvePath);
}

export function verifyLocalRequirementsContextFiles({ configuration, handoff, resolvePath }) {
  const plan = publicationPlan(configuration, handoff);
  for (const entry of plan.files) exactFile(resolvePath(entry.path, "filesystem.read"), entry.bytes);
  exactFile(resolvePath(plan.configuration.path, "filesystem.read"), plan.configurationBytes);
  return result(plan, handoff, resolvePath);
}
