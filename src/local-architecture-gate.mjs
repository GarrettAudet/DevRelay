import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { loadArtifactBytes, loadArtifactContent } from "./artifact-runtime.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "./module-registry.mjs";
import { validateArchitectureGatePromotion } from "./architecture-gate.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validate = compileArtifactSchema(read("local-architecture-gate-commit.schema.json"), [read("module-result.schema.json"), read("local-requirements-gate-commit.schema.json")]);
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);

// Persisted documents never replace genuine Core or the owning Gate. This
// preparation publishes no architecture state, graph approval or next route.
export async function prepareLocalArchitectureGate({ checkpointReplay, ownerApprovalRef, baselineRef, loadArtifact }) {
  const replay = assertVerifiedCheckpointReplayReceipt(checkpointReplay);
  const approval = await loadArtifactContent(ownerApprovalRef, { load: loadArtifact });
  const baseline = await loadArtifactContent(baselineRef, { load: loadArtifact });
  const repository = replay.loadedInputs["repository-snapshot"]?.[0];
  if (repository && approval.value.repositoryRevision !== repository.value.revision) throw new TypeError("architecture owner approval repository revision differs from Core");
  const attached = new Map();
  const visit = async value => {
    if (!value || typeof value !== "object") return;
    if (value.mode === "attached" && value.artifact) {
      const key = canonicalJsonDigest(value.artifact);
      if (!attached.has(key)) {
        const loaded = await loadArtifactContent(value.artifact, { load: loadArtifact });
        attached.set(key, loaded); await visit(loaded.value);
      }
    }
    for (const child of Object.values(value)) await visit(child);
  };
  for (const outputs of Object.values(replay.loadedOutputs)) for (const output of outputs) await visit(output.value);
  await visit(baseline.value);
  const gate = await validateArchitectureGatePromotion({ checkpointReplay: replay, ownerApproval: approval.value,
    ownerApprovalRef, ownerApprovalBytes: approval.bytes, baseline: baseline.value, baselineRef, baselineBytes: baseline.bytes,
    evidenceResolver: ref => loadArtifactBytes(ref, { load: loadArtifact }), resolveAttached: ref => attached.get(canonicalJsonDigest(ref)) });
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalArchitectureGateCommit", invocationDigest: canonicalJsonDigest(replay.invocation),
    moduleResultDigest: canonicalJsonDigest(replay.moduleResult), candidateRef: gate.candidateRef,
    ownerApproval: { ref: ownerApprovalRef, byteLength: approval.bytes.length, bytesBase64: approval.bytes.toString("base64") },
    baseline: gate.commitPayload.baseline, scope: "validated-architecture-baseline", lifecycleComplete: false };
  const record = { ...body, commitDigest: canonicalJsonDigest(body) };
  if (!validate(record)) throw new TypeError("architecture Gate commit violates its closed contract");
  return record;
}

export async function verifyLocalArchitectureGate({ checkpointReplay, record, loadArtifact }) {
  if (!validate(record)) throw new TypeError("stored architecture Gate violates its contract");
  const verified = await prepareLocalArchitectureGate({ checkpointReplay, ownerApprovalRef: record.ownerApproval.ref, baselineRef: record.baseline.ref, loadArtifact });
  if (!same(verified, record)) throw new TypeError("architecture Gate commit differs from owning validation");
  return verified;
}
