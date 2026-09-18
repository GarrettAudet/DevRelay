import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { loadArtifactContent, loadArtifactBytes } from "./artifact-runtime.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "./module-registry.mjs";
import { validateWorkBreakdownGatePromotion } from "./work-breakdown-gate.mjs";

const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validate = compileArtifactSchema(read("local-work-breakdown-gate.schema.json"), [read("module-result.schema.json"), read("local-requirements-gate-commit.schema.json"), read("work-breakdown-artifacts.schema.json")]);

// The owning Gate derives candidate/operation/inputs from genuine Core replay.
// This is a validated commit candidate, not graph activation or execution consent.
export async function prepareLocalWorkBreakdownGate({ checkpointReplay, baselineRef, noWorkApprovals = [], loadArtifact }) {
  const replay = assertVerifiedCheckpointReplayReceipt(checkpointReplay);
  const baseline = await loadArtifactContent(baselineRef, { load: loadArtifact });
  const promotion = await validateWorkBreakdownGatePromotion({ checkpointReplay: replay,
    baseline: baseline.value, baselineBytes: baseline.bytes, baselineRef, noWorkApprovals,
    evidenceResolver: ref => loadArtifactBytes(ref, { load: loadArtifact }),
    architectureAttachmentResolver: ref => loadArtifactContent(ref, { load: loadArtifact }) });
  for (const ref of promotion.baseline.approvalEvidence) await loadArtifactBytes(ref, { load: loadArtifact });
  const body = { kind: "LocalWorkBreakdownGateCommit", invocationDigest: canonicalJsonDigest(replay.invocation),
    moduleResultDigest: canonicalJsonDigest(replay.moduleResult), candidateRef: promotion.candidateRef,
    baseline: promotion.commitPayload.baseline, noWorkApprovals: promotion.noWorkApprovals,
    scope: "validated-work-breakdown-baseline", lifecycleComplete: false };
  const result = { ...body, commitDigest: canonicalJsonDigest(body) };
  if (!validate(result)) throw new TypeError("work Gate commit violates its contract");
  return result;
}

export async function verifyLocalWorkBreakdownGate({ record, ...request }) {
  if (!validate(record)) throw new TypeError("stored work Gate commit violates its contract");
  const expected = await prepareLocalWorkBreakdownGate({ ...request, baselineRef: record.baseline.ref, noWorkApprovals: record.noWorkApprovals });
  if (canonicalJsonDigest(expected) !== canonicalJsonDigest(record)) throw new TypeError("work Gate commit differs from owning validation");
  return expected;
}
