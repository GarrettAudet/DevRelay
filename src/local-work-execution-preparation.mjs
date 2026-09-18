import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { loadWorkExecutionInput, createCanonicalWorkExecutionInput, prepareWorkExecutionInvocation } from "./work-execution-runtime.mjs";
import { verifyLocalWorkQualityHandoff } from "./local-work-quality-handoff.mjs";
import { createWorkFingerprintInput, deriveWorkFingerprint } from "./work-continuity.mjs";

const fail = message => { throw new TypeError(`local execution preparation: ${message}`); };
const read = name => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url)));
const dependencies = [read("desktop-work-execution-submission.schema.json"), read("desktop-local-host-configuration.schema.json"), read("module-result.schema.json")];
export const validateDesktopWorkExecutionSubmission = compileArtifactSchema(dependencies[0], dependencies.slice(1));
const validateRecord = compileArtifactSchema(read("local-work-execution-preparation.schema.json"), dependencies);
const generated = (value, name) => createCanonicalWorkExecutionInput({ value, ref: {
  artifactId: `LOCAL-${name}-${canonicalJsonDigest(value).slice(7, 23)}`,
  schema: `https://devrelay.dev/artifacts/${name}/v1`, mediaType: `application/vnd.devrelay.${name}+json`,
  uri: `memory://local-execution/${canonicalJsonDigest(value).slice(7)}`,
} });

// The caller supplies a freshly reverified host queue, never caller-authored
// completion facts. This read-only bridge neither proves current heads nor
// reserves work: those host checks must surround claim and actual dispatch.
export async function prepareLocalWorkExecution(request) {
  const allowed = ["readiness", "attemptId", "workItemId", "executionBindingRef", "executionPolicyRef", "repositorySnapshotRef",
    "workspaceBaseDigest", "executorConfigurationDigest", "retryLineage", "loadArtifact"];
  if (!request || Object.keys(request).some(key => !allowed.includes(key))) fail("undeclared preparation input");
  const { workItemId, loadArtifact } = request;
  const readiness = structuredClone(request.readiness);
  const { readinessDigest, ...body } = readiness;
  if (canonicalJsonDigest(body) !== readinessDigest || !readiness.readyWorkItemIds.includes(workItemId)) fail("exact ready queue required");
  const proofs = readiness.proofs.filter(proof => proof.workItemId === workItemId);
  if (proofs.length !== 1) fail("one exact readiness proof required");
  const refs = {
    workBreakdownBaseline: readiness.baselines.workBreakdownBaseline,
    workDependencyBaseline: readiness.baselines.workDependencyBaseline,
    specialistAssignmentBaseline: readiness.baselines.specialistAssignmentBaseline,
    projectOverviewBaseline: readiness.baselines.projectOverviewBaseline,
    executionBinding: request.executionBindingRef, executionPolicy: request.executionPolicyRef,
    repositorySnapshot: request.repositorySnapshotRef,
  };
  const input = Object.fromEntries(await Promise.all(Object.entries(refs).map(async ([name, ref]) =>
    [name, loadWorkExecutionInput({ bytes: await loadArtifact(ref), ref, label: name })])));
  input.integratedCompletionFacts = generated(readiness.factSet, "integrated-completion-fact-set");
  input.runnableFrontierProof = generated(proofs[0], "runnable-frontier-proof");
  const prepared = prepareWorkExecutionInvocation({ attemptId: request.attemptId, workItemId, input,
    workspaceBaseDigest: request.workspaceBaseDigest, executorConfigurationDigest: request.executorConfigurationDigest,
    retryLineage: request.retryLineage });
  return { ...prepared, input };
}

export async function prepareLocalWorkDispatch({ projectId, executionRequest, qualityHandoff }) {
  const request = { ...executionRequest, readiness: structuredClone(executionRequest.readiness) };
  const quality = await verifyLocalWorkQualityHandoff({ record: qualityHandoff,
    readiness: request.readiness, loadArtifact: request.loadArtifact });
  if (quality.submission.workItemId !== request.workItemId) fail("quality belongs to different work");
  const execution = await prepareLocalWorkExecution(request);
  const { input, invocation } = execution;
  if (canonicalJsonDigest(quality.prepared.workItem) !== canonicalJsonDigest(invocation.workItem)) fail("quality and execution work differ");
  const requirements = input.workBreakdownBaseline.value.inputBindings.filter(entry => entry.role === "requirements-baseline");
  const overview = input.workBreakdownBaseline.value.inputBindings.filter(entry => entry.role === "project-overview-baseline");
  if (requirements.length !== 1 || overview.length !== 1 ||
      canonicalJsonDigest(overview[0].artifact) !== canonicalJsonDigest(input.projectOverviewBaseline.ref)) fail("approved project lineage differs");
  const assignment = input.specialistAssignmentBaseline.value.assignments.find(entry => entry.workItemRef === request.workItemId);
  const fingerprintInput = createWorkFingerprintInput({ projectId,
    requirementsBaselineDigest: requirements[0].artifact.digest,
    projectOverviewBaselineDigest: input.projectOverviewBaseline.ref.digest,
    workItem: { ...invocation.workItem, type: invocation.workItem["work-type"] },
    targetRevision: input.repositorySnapshot.value.revision, assignment,
    dependencyClosure: execution.readinessProof.prerequisiteCompletionFacts,
    qualityResolutionDigest: quality.prepared.resolution.resolutionDigest,
    implementationConfigurationDigest: input.executionBinding.value.configurationDigest,
    inputs: [requirements[0].artifact, ...Object.values(input).map(item => item.ref),
      quality.submission.qualityPolicy.ref, quality.submission.qualityContext.ref,
      { workspaceBaseDigest: invocation.workspaceBaseDigest }],
  });
  return { ...execution, qualityResolution: quality.prepared.resolution, workFingerprint: deriveWorkFingerprint(fingerprintInput) };
}

export async function prepareLocalWorkExecutionHandoff({ projectId, submission, readiness, qualityHandoff, loadArtifact }) {
  if (!validateDesktopWorkExecutionSubmission(submission)) fail("submission violates closed contract");
  if (submission.readinessDigest !== readiness.readinessDigest || submission.qualityPreparationDigest !== qualityHandoff.preparationDigest) fail("queue or quality preparation differs");
  const prepared = await prepareLocalWorkDispatch({ projectId, qualityHandoff, executionRequest: {
    readiness, attemptId: submission.attemptId, workItemId: submission.workItemId,
    executionBindingRef: submission.executionBinding.ref, executionPolicyRef: submission.executionPolicy.ref,
    repositorySnapshotRef: submission.repositorySnapshot.ref, workspaceBaseDigest: submission.workspaceBaseDigest,
    executorConfigurationDigest: submission.executorConfigurationDigest, loadArtifact,
  } });
  const pack = (value, name, owner) => {
    const loaded = generated(value, name);
    return { ref: { ...loaded.ref, ...(owner ? { schema: owner, mediaType: "application/json" } : {}) }, bytesBase64: loaded.bytes.toString("base64") };
  };
  const body = { kind: "LocalWorkExecutionPreparation", submission: structuredClone(submission), artifacts: {
    invocation: pack(prepared.invocation, "executor-invocation"),
    workFingerprint: pack(prepared.workFingerprint, "work-fingerprint", "https://devrelay.dev/contracts/work-continuity-artifacts.schema.json"),
    qualityResolution: pack(prepared.qualityResolution, "quality-obligation-resolution", "https://devrelay.dev/contracts/quality-policy-artifacts.schema.json"),
  }, dispatchAuthorized: false };
  const record = { ...body, preparationDigest: canonicalJsonDigest(body) };
  if (!validateRecord(record)) fail("preparation violates closed contract");
  return { record, input: prepared.input };
}

export async function verifyLocalWorkExecutionHandoff({ record, ...request }) {
  if (!validateRecord(record)) fail("preparation violates closed contract");
  const expected = await prepareLocalWorkExecutionHandoff({ ...request, submission: record.submission });
  if (canonicalJsonDigest(expected.record) !== canonicalJsonDigest(record)) fail("stored preparation differs from exact derivation");
  return expected;
}
