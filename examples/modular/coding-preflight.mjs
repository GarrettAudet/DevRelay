import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "../../src/module-registry.mjs";
import { validateRequirementsGatePromotion } from "../../src/requirements-gate.mjs";
import { validateArchitectureGatePromotion } from "../../src/architecture-gate.mjs";
import { validateWorkBreakdownGatePromotion } from "../../src/work-breakdown-gate.mjs";
import { compileArtifactSchema } from "../../src/schema-validation.mjs";
import { validateRelativePath } from "./coding-files.mjs";
import { validateCodingArtifact } from "./coding-contracts.mjs";

export const changeCardSchema = "https://devrelay.dev/examples/modular/coding/change-card/v1";
const object = properties => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const strings = (minItems = 0) => ({ type: "array", minItems, maxItems: 100, uniqueItems: true,
  items: { type: "string", minLength: 1, maxLength: 240 } });
const validateCard = compileArtifactSchema(object({
  workItemId: { type: "string", pattern: "^WI-[A-Z0-9-]+$" },
  criterionIds: strings(1), readPaths: strings(1), writePaths: strings(1), testFiles: strings(1),
  reuse: object({ disposition: { enum: ["reuse", "not-applicable"] },
    rationale: { type: "string", minLength: 1, maxLength: 4000 }, paths: strings() }),
}));
const sameRef = (left, right) => Boolean(left && right) &&
  ["artifactId", "schema", "mediaType", "digest"].every(key => left[key] === right[key]);
function fail(message) {
  const error = new Error("Governed coding preflight blocked: " + message);
  error.code = "DR_MODULAR_PREFLIGHT";
  throw error;
}
function exact(label, actual, expected) {
  if (!sameRef(actual, expected)) fail(label + " is missing, stale, or substituted");
}
function subset(label, values, allowed) {
  for (const value of values) if (!allowed.includes(value)) fail(label + " is outside the approved change card: " + value);
}
function immutable(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * A host preflight, not another Gate or approval store. Supply normal owning-Gate
 * arguments with genuine Core replay receipts and a trusted current-head reader.
 * Serialized receipts and caller-supplied approval booleans are not authority.
 */
export async function createCodingPreflight(governance) {
  if (!governance?.requirements || !governance.architecture || !governance.workBreakdown ||
      !governance.changeCard || typeof governance.readCurrentHeads !== "function") {
    fail("requires RequirementsGate, ArchitectureGate and WorkBreakdownGate evidence, a bound change card, and a host current-head reader; read-only inspection remains available");
  }
  const requirements = validateRequirementsGatePromotion(governance.requirements);
  const architecture = await validateArchitectureGatePromotion(governance.architecture);
  const work = await validateWorkBreakdownGatePromotion(governance.workBreakdown);
  exact("design requirements", architecture.baseline.requirementsBaseline, requirements.requirementsBaselineRef);
  exact("design project overview", architecture.baseline.projectOverviewBaseline, requirements.projectOverviewBaselineRef);
  const input = role => work.baseline.inputBindings.find(binding => binding.role === role)?.artifact;
  exact("work-item requirements", input("requirements-baseline"), requirements.requirementsBaselineRef);
  exact("work-item project overview", input("project-overview-baseline"), requirements.projectOverviewBaselineRef);
  exact("work-item design", input("architecture-baseline"), architecture.baselineRef);
  const repository = input("repository-context") ?? input("current-repository-snapshot");
  if (!architecture.baseline.repositorySnapshot || repository?.schema !== "https://devrelay.dev/artifacts/repository-snapshot/v1") {
    fail("this slice requires an approved existing-repository snapshot; greenfield or not-applicable repository context is not supported");
  }
  exact("work-item repository context", repository, architecture.baseline.repositorySnapshot);

  // Baselines deliberately omit nativeArtifacts. Follow their approvedCandidate
  // to the genuine replay-owned candidate instead of trusting a supplied object.
  const replay = assertVerifiedCheckpointReplayReceipt(governance.workBreakdown.checkpointReplay);
  const candidate = Object.values(replay.loadedOutputs).flat().find(entry => sameRef(entry.ref, work.candidateRef));
  exact("approved work candidate", work.baseline.approvedCandidate, candidate?.ref);
  const { ref, bytes } = governance.changeCard;
  if (!(bytes instanceof Uint8Array) || !ref || ref.schema !== changeCardSchema || ref.mediaType !== "application/json" ||
      sha256Digest(bytes) !== ref.digest || !candidate.value.nativeArtifacts.some(item => sameRef(item, ref))) {
    fail("change card must be exact bytes attached to the Gate-approved work candidate");
  }
  let card;
  try { card = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("change card is not UTF-8 JSON"); }
  if (!validateCard(card)) fail("invalid change card: " + JSON.stringify(validateCard.errors));
  if (!card.reuse.rationale.trim()) fail("reuse or not-applicable disposition needs a rationale");
  for (const path of [...card.readPaths, ...card.writePaths, ...card.testFiles, ...card.reuse.paths]) validateRelativePath(path);
  subset("write path", card.writePaths, card.readPaths);
  subset("test file", card.testFiles, card.readPaths);
  subset("reuse path", card.reuse.paths, card.readPaths);
  if ((card.reuse.disposition === "reuse") !== (card.reuse.paths.length > 0)) {
    fail("reuse needs explicit paths; not-applicable needs an empty path list");
  }
  const item = work.baseline.workItems.find(entry => entry.id === card.workItemId);
  if (!item || !item["bounded-scope"].included.some(value => value.trim())) fail("card must select one bounded approved work item");
  const criteria = item["acceptance-criterion-refs"];
  if (canonicalJsonDigest([...card.criterionIds].sort()) !== canonicalJsonDigest([...criteria].sort())) {
    fail("card must retain every acceptance criterion of the selected work item");
  }
  const approvedCriteria = requirements.requirementsBaseline.requirements.acceptanceCriteria.map(entry => entry.id);
  subset("acceptance criterion", criteria, approvedCriteria);
  if (!item["architecture-refs"].length) fail("selected work item requires approved design references");

  const heads = immutable(structuredClone({
    requirementsBaseline: requirements.requirementsBaselineRef,
    projectOverviewBaseline: requirements.projectOverviewBaselineRef,
    architectureBaseline: architecture.baselineRef,
    workBreakdownBaseline: work.baselineRef,
    projectContext: architecture.baseline.projectContext,
    repositorySnapshot: architecture.baseline.repositorySnapshot,
    contractDisposition: input("contract-disposition"),
    capabilityCatalog: input("capability-catalog"),
  }));
  const readCurrentHeads = governance.readCurrentHeads;
  const approvalDigest = canonicalJsonDigest({ heads, changeCard: ref });
  immutable(card);
  async function assertCurrent(request, inputs) {
    const current = await readCurrentHeads();
    for (const [name, expected] of Object.entries(heads)) exact("current " + name, current?.[name], expected);
    if (inputs) {
      exact("invocation requirements", inputs["requirements-baseline"]?.[0], heads.requirementsBaseline);
      exact("invocation project overview", inputs["project-overview-baseline"]?.[0], heads.projectOverviewBaseline);
    }
    if (request) {
      validateCodingArtifact("request", request);
      const paths = [...request.readPaths, ...request.changes.map(change => change.path), ...request.testFiles];
      subset("read path", paths, card.readPaths);
      subset("write path", request.changes.map(change => change.path), card.writePaths);
      subset("test effect", request.testFiles, card.testFiles);
      subset("required reuse inspection", card.reuse.paths, paths);
    }
    return { status: "eligible", workItemId: card.workItemId, criterionIds: [...card.criterionIds],
      approvalDigest, acceptance: "not-recorded" };
  }
  await assertCurrent();
  return Object.freeze({ approvalDigest, card, assertCurrent,
    // Derive the workflow's context from validated Gate payloads, not caller context.
    context: Object.freeze({
      requirementsBytes: Buffer.from(requirements.commitPayload.requirementsBaseline.bytesBase64, "base64"),
      overviewBytes: Buffer.from(requirements.commitPayload.projectOverviewBaseline.bytesBase64, "base64"),
      overviewMarkdownBytes: Buffer.from(governance.requirements.projectOverviewMarkdownBytes),
    }),
  });
}
