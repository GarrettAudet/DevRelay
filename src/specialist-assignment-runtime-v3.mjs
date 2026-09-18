import { readFileSync } from "node:fs";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { loadArtifactContent } from "./artifact-runtime.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { evaluateSpecialistEligibility, rankSpecialistsDeterministically, assembleSpecialistAssignmentDraft } from "./specialist-assignment.mjs";
import { SPECIALIST_ASSIGNMENT_ARTIFACT_CONTRACTS, validateSpecialistAssignmentArtifact } from "./specialist-assignment-artifact-validator.mjs";
import { validateWorkBreakdownArtifact } from "./work-breakdown-artifact-validator.mjs";
import { validateWorkDependencyArtifact } from "./work-dependency-artifact-validator.mjs";
import { validateProjectOverviewArtifact } from "./project-overview-artifact-validator.mjs";
import { validateRequirementsArtifact } from "./requirements-artifact-validator.mjs";
import { selectAssignmentRepositoryBinding } from "./specialist-assignment-repository-binding.mjs";

const moduleContract = JSON.parse(readFileSync(new URL("../contracts/module-result.schema.json", import.meta.url), "utf8"));
const validateRef = compileArtifactSchema({ $ref: `${moduleContract.$id}#/$defs/artifactRef` }, [moduleContract]);
const receipts = new WeakSet();
export const SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING = Object.freeze({ id: "devrelay.native-specialist-ranker", version: "1.0.0" });
const module = Object.freeze({ id: "specialist-assignment", version: "3.0.0", operation: "assign-specialists" });
const roles = Object.freeze({
  "work-breakdown-baseline": ["WorkBreakdownBaseline", "baselineId"],
  "work-dependency-baseline": ["WorkDependencyBaseline", "baselineId"],
  "capability-catalog": ["CapabilityCatalog", "catalogId"],
  "specialist-catalog": ["SpecialistCatalog", "catalogId"],
  "assignment-policy": ["AssignmentPolicy", "policyId"],
  "project-overview-baseline": ["ProjectOverviewBaseline", "baselineId"],
  "repository-context": ["RepositorySnapshot", null],
});
const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`assignment runtime v3: ${message}`); };
function immutable(value) {
  const result = structuredClone(value);
  const freeze = entry => { if (entry && typeof entry === "object") { Object.values(entry).forEach(freeze); Object.freeze(entry); } };
  freeze(result);
  return result;
}
function artifact(value) {
  validateSpecialistAssignmentArtifact(value);
  const bytes = Buffer.from(canonicalJson(value));
  const digest = sha256Digest(bytes);
  const artifactId = value.draftId ?? `${value.kind}-${digest.slice(7, 23)}`;
  return { ref: { artifactId, ...SPECIALIST_ASSIGNMENT_ARTIFACT_CONTRACTS[value.kind], digest,
    uri: `artifact://specialist-assignment-v3/${artifactId}/${digest.slice(7)}` }, value, bytesBase64: bytes.toString("base64") };
}
async function loadInputs(inputs, load) {
  if (!inputs || !same(Object.keys(inputs).sort(), Object.keys(roles).sort())) fail("exactly seven declared input roles are required");
  const records = {};
  for (const role of Object.keys(roles).sort()) {
    const ref = inputs[role];
    if (!validateRef(ref)) fail(`${role} has an invalid ArtifactRef`);
    const loaded = await loadArtifactContent(ref, { load });
    const [kind, id] = roles[role];
    const repositoryNA = role === "repository-context" && loaded.value.kind === "ApprovedNotApplicable";
    const schemaKind = role === "repository-context" ? repositoryNA ? "approved-not-applicable" : "repository-snapshot" : role;
    if ((!repositoryNA && loaded.value.kind !== kind) || (id && loaded.value[id] !== ref.artifactId) ||
        ref.schema !== `https://devrelay.dev/artifacts/${schemaKind}/v1` || ref.mediaType !== `application/vnd.devrelay.${schemaKind}+json`) fail(`${role} identity or contract differs`);
    if (role === "capability-catalog") validateWorkBreakdownArtifact(loaded.value, { ref: loaded.ref });
    if (role === "project-overview-baseline") validateProjectOverviewArtifact(loaded.value);
    if (role === "repository-context" && !repositoryNA) validateRequirementsArtifact(loaded.value);
    if (repositoryNA) {
      validateWorkBreakdownArtifact(loaded.value, { ref: loaded.ref });
      if (loaded.value.purpose !== "repository-context") fail("repository-context approval has the wrong purpose");
    }
    records[role] = { ref: loaded.ref, value: loaded.value, bytesBase64: loaded.bytes.toString("base64") };
  }
  const work = records["work-breakdown-baseline"].value;
  const dependency = records["work-dependency-baseline"].value;
  validateWorkBreakdownArtifact(work, { ref: records["work-breakdown-baseline"].ref });
  validateWorkDependencyArtifact(dependency, { ref: records["work-dependency-baseline"].ref });
  const policy = records["assignment-policy"].value;
  // Map-based ranking must not silently choose the last of conflicting rules.
  // Keep this input policy at the versioned assignment boundary, not in Core.
  for (const [field, identity] of [["workItemRules", "workItemId"], ["profilePriorities", "profileId"]]) {
    const entries = policy[field] === undefined ? [] : policy[field];
    if (!Array.isArray(entries) || entries.some(entry => typeof entry?.[identity] !== "string" || !entry[identity]) ||
        new Set(entries.map(entry => entry[identity])).size !== entries.length) fail(`assignment-policy ${field} requires unique nonempty ${identity} values`);
  }
  if (!same(dependency.workBreakdownBaseline, records["work-breakdown-baseline"].ref) ||
      !same(work.workItems.map(entry => entry.id).sort(), [...dependency.nodes].sort())) fail("dependency baseline changes approved work lineage or universe");
  for (const role of ["capability-catalog", "project-overview-baseline"]) {
    const bound = work.inputBindings.filter(entry => entry.role === role);
    if (bound.length !== 1 || !same(bound[0].artifact, records[role].ref)) fail(`${role} differs from approved work input`);
  }
  const repositoryBinding = selectAssignmentRepositoryBinding(work);
  const repository = records["repository-context"];
  if (!same(repositoryBinding.artifact, repository.ref)) fail("repository-context differs from approved work input");
  if (repositoryBinding.role === "current-repository-snapshot" && repository.value.kind !== "RepositorySnapshot") {
    fail("existing-project repository binding requires a RepositorySnapshot");
  }
  return records;
}
function derive(executionId, records) {
  const inputBindings = Object.entries(records).map(([role, entry]) => ({ role, artifact: entry.ref }));
  const executionFingerprint = canonicalJsonDigest({ executionId, module, inputBindings, binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING });
  const values = Object.fromEntries(Object.entries(records).map(([role, entry]) => [role, entry.value]));
  const eligibility = evaluateSpecialistEligibility({ workItems: values["work-breakdown-baseline"].workItems,
    capabilityCatalog: values["capability-catalog"], specialistCatalog: values["specialist-catalog"], assignmentPolicy: values["assignment-policy"] });
  const artifacts = [artifact(eligibility)];
  const blocked = eligibility.evaluations.filter(entry => !entry.eligibleProfileIds.length);
  if (!blocked.length) {
    const selections = rankSpecialistsDeterministically(eligibility, values["assignment-policy"]);
    artifacts.push(artifact(selections), artifact(assembleSpecialistAssignmentDraft({ eligibility, rankerSelections: selections, inputBindings })));
  }
  const receipt = { executionId, executionFingerprint, module, binding: SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING,
    outcome: blocked.length ? "needs-clarification" : "assigned", replayed: false,
    artifacts: artifacts.map(entry => entry.ref), ...(blocked.length ? {} : { draft: artifacts[2] }),
    diagnostics: blocked.map(({ workItemId }) => ({ code: "SA_NO_ELIGIBLE_PROFILE", workItemId })), lifecycleComplete: false };
  return { executionId, executionFingerprint, inputs: records, artifacts, receipt };
}
const keyFor = (id, fingerprint) => `specialist-assignment-v3/${id}/${fingerprint.slice(7)}`;
export function assertVerifiedSpecialistAssignmentReceiptV3(receipt) {
  if (!receipts.has(receipt)) fail("Gate requires a genuine checkpoint replay receipt");
  return receipt.checkpoint;
}

// Explicit native capability matching only. No scheduling, network, model,
// provider, integration or Gate approval is hidden in this implementation.
export function createSpecialistAssignmentRuntimeV3({ checkpointStore, binding, beforeFreshExecution = () => {} }) {
  if (!checkpointStore?.get || !checkpointStore?.put || !binding || !same(binding, SPECIALIST_ASSIGNMENT_V3_NATIVE_BINDING)) fail("explicit native binding and checkpoint store required");
  async function verify({ executionId, executionFingerprint }) {
    const key = keyFor(executionId, executionFingerprint);
    const stored = await checkpointStore.get(key);
    if (!stored) fail("exact durable checkpoint is required");
    const snapshot = immutable(stored);
    const inputRefs = Object.fromEntries(Object.entries(snapshot.inputs).map(([role, entry]) => [role, entry.ref]));
    const records = await loadInputs(inputRefs, ref => {
      const entry = Object.values(snapshot.inputs).find(item => same(item.ref, ref));
      const bytes = Buffer.from(entry.bytesBase64, "base64");
      if (bytes.toString("base64") !== entry.bytesBase64) fail("checkpoint input encoding drifted");
      return bytes;
    });
    const expected = derive(executionId, records);
    if (expected.executionFingerprint !== executionFingerprint || !same(expected, snapshot)) fail("checkpoint differs from its exact raw inputs and native derivation");
    const receipt = immutable({ kind: "VerifiedSpecialistAssignmentCheckpointReplayReceiptV3", executionId, executionFingerprint,
      checkpointKey: key, checkpointDigest: canonicalJsonDigest(snapshot), checkpoint: snapshot });
    receipts.add(receipt);
    return receipt;
  }
  return Object.freeze({
    async execute({ executionId, inputs, loadArtifact }) {
      if (typeof executionId !== "string" || !executionId.length) fail("execution identity required");
      const records = await loadInputs(inputs, loadArtifact);
      const expected = derive(executionId, records);
      const key = keyFor(executionId, expected.executionFingerprint);
      if (await checkpointStore.get(key)) {
        const verified = await verify(expected);
        return immutable({ ...verified.checkpoint.receipt, replayed: true });
      }
      await beforeFreshExecution();
      await checkpointStore.put(key, immutable(expected));
      const verified = await verify(expected);
      return verified.checkpoint.receipt;
    },
    verifyCheckpointedExecution: verify,
  });
}
