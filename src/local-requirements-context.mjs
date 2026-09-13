import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { readFileSync } from "node:fs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { createSessionContextSnapshot, refreshSessionContext, assertSessionContextReceipt } from "./session-bootstrap.mjs";
import { assertLocalRequirementsCurrentPair, verifyLocalRequirementsActivation } from "./local-host-requirements-gate.mjs";

const unchangedRoles = new Set(["project-memory-baseline", "current-synopsis", "traceability-context", "roadmap", "roadmap-projection"]);
const replacedRoles = new Set(["requirements-baseline", "project-overview", "project-overview-projection", "lifecycle-status"]);
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const freeze = (value) => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const schema = (name) => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const dependencies = [schema("module-result.schema.json"), schema("roadmap-management-artifacts.schema.json"), schema("local-requirements-gate-commit.schema.json")];
const validateBoundary = compileArtifactSchema(schema("requirements-context-boundary.schema.json"), dependencies);
const validateHandoff = compileArtifactSchema(schema("requirements-context-handoff.schema.json"), dependencies);

// A verified context handoff, not a workflow route or a ProjectMemory promotion.
// The Desktop host must explicitly materialize/bind it at the next boundary.
export async function createLocalRequirementsContextHandoff({ storage, namespace, graph, checkpointReplay, record,
  resolveArtifact, priorSnapshot, priorReceipt, artifactResolver, createdAt }) {
  if (priorSnapshot.projectId !== graph.projectId) throw new TypeError("context belongs to another project");
  assertSessionContextReceipt({ receipt: priorReceipt, snapshot: priorSnapshot,
    currentBindings: priorSnapshot.bindings, currentRepositoryRevision: priorSnapshot.repositoryRevision });
  const activation = await verifyLocalRequirementsActivation({ storage, namespace, graph, checkpointReplay, record, resolveArtifact });
  const pair = { requirementsBaseline: record.commitPayload.requirementsBaseline.ref,
    projectOverviewBaseline: record.commitPayload.projectOverviewBaseline.ref };
  assertLocalRequirementsCurrentPair({ storage, namespace, projectId: graph.projectId, pair, required: true });
  for (const [role, port] of [["requirements-baseline", "requirements-baseline"], ["project-overview", "project-overview-baseline"]]) {
    const input = checkpointReplay.loadedInputs[port];
    if (input?.length !== 1 || !same(priorSnapshot.bindings.find((entry) => entry.role === role)?.artifact, input[0].ref)) {
      throw new TypeError("context handoff requires the exact prior change-pair bindings");
    }
  }
  const invalidatedBindings = priorSnapshot.bindings.filter(({ role }) => !unchangedRoles.has(role) && !replacedRoles.has(role));
  const files = [record.commitPayload.requirementsBaseline, record.commitPayload.projectOverviewBaseline].map((entry) => structuredClone(entry));
  const add = (id, schema, mediaType, bytes) => {
    const digest = sha256Digest(bytes);
    const ref = { artifactId: id, schema, mediaType, digest, uri: `memory://desktop/requirements-context/${digest.slice(7)}/${encodeURIComponent(id)}` };
    files.push({ ref, byteLength: bytes.length, bytesBase64: bytes.toString("base64") });
    return ref;
  };
  const markdown = add(`OVERVIEW-${record.commitDigest.slice(7, 23)}`, "https://devrelay.dev/artifacts/project-overview-markdown/v1", "text/markdown", Buffer.from(record.projectOverviewMarkdown.bytesBase64, "base64"));
  const boundary = { kind: "DesktopRequirementsContextBoundary", gateCommitDigest: record.commitDigest,
    runtimeGraph: activation.applicationProof.resultGraphRef, activationReceipt: activation.applicationProof.receiptRef,
    invalidatedBindings, progressionAllowed: false };
  if (!validateBoundary(boundary)) throw new TypeError("requirements context boundary violates its contract");
  const boundaryRef = add(`BOUNDARY-${record.commitDigest.slice(7, 23)}`, "https://devrelay.dev/host/requirements-context-boundary/v1", "application/json", Buffer.from(canonicalJson(boundary)));
  const version = JSON.parse(Buffer.from(record.commitPayload.requirementsBaseline.bytesBase64, "base64")).version;
  const bindings = [
    ...priorSnapshot.bindings.filter(({ role }) => unchangedRoles.has(role)),
    { role: "requirements-baseline", artifact: pair.requirementsBaseline, artifactVersion: version },
    { role: "project-overview", artifact: pair.projectOverviewBaseline, artifactVersion: version },
    { role: "project-overview-projection", artifact: markdown, artifactVersion: version },
    { role: "lifecycle-status", artifact: boundaryRef, artifactVersion: "1.0.0" },
  ];
  const snapshot = createSessionContextSnapshot({ ...priorSnapshot, bindings, createdAt });
  const receipt = await refreshSessionContext({ priorReceipt, nextSnapshot: snapshot,
    expectedProjectId: snapshot.projectId, expectedTaskId: snapshot.taskId,
    expectedWorkspaceId: snapshot.workspaceId, expectedRepositoryRevision: snapshot.repositoryRevision,
    artifactResolver: async (ref) => {
      const entry = files.find((file) => same(file.ref, ref));
      return entry ? Buffer.from(entry.bytesBase64, "base64") : artifactResolver(ref);
    } });
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopRequirementsContextHandoff",
    priorSnapshotDigest: priorReceipt.snapshot.digest, gateCommitDigest: record.commitDigest,
    snapshot, receipt, files, invalidatedBindings, lifecycleComplete: false };
  const handoff = { ...body, handoffDigest: canonicalJsonDigest(body) };
  if (!validateHandoff(handoff)) throw new TypeError("requirements context handoff violates its contract");
  return freeze(structuredClone(handoff));
}
