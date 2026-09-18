import { canonicalJsonDigest } from "./content-digest.mjs";
import { assertVerifiedCheckpointReplayReceipt } from "./module-registry.mjs";
import { validateChangeIntegrationArtifact } from "./change-integration-artifact-validator.mjs";
import { validateWorkExecutionArtifact } from "./work-execution-artifact-validator.mjs";
import { readFileSync } from "node:fs";
import { compileArtifactSchema } from "./schema-validation.mjs";

const resultContract = JSON.parse(readFileSync(new URL("../contracts/module-result.schema.json", import.meta.url)));
const validateRef = compileArtifactSchema({ $ref: `${resultContract.$id}#/$defs/artifactRef` }, [resultContract]);

const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const pointer = ref => ({ artifactId: ref.artifactId, digest: ref.digest });
const fail = message => { throw new TypeError(`integration completion: ${message}`); };
const baselineRoles = ["requirementsBaseline", "projectOverviewBaseline", "architectureBaseline",
  "contractDisposition", "workBreakdownBaseline", "workDependencyBaseline", "specialistAssignmentBaseline"];
function one(ports, port) {
  if (!Array.isArray(ports?.[port]) || ports[port].length !== 1) fail(`exact ${port} artifact required`);
  return ports[port][0];
}

// A receipt-backed completion projection, NOT a complete ledger or permission
// to dispatch. The host must supply its exact activated baseline references and
// approved work-item projection, then durably register the result before deriving
// a frontier. In particular, callers cannot use this to assert ledger completeness.
export function deriveLocalIntegrationCompletion({ checkpointReplay, workItemRef, baselines }) {
  const replay = assertVerifiedCheckpointReplayReceipt(checkpointReplay);
  const { invocation, moduleResult: result } = replay;
  if (!same(invocation.module, { id: "change-integration", version: "0.1.0", operation: "integrate-change" }) ||
      result.invocationId !== invocation.invocationId || result.status !== "completed" || result.outcome !== "integrated") {
    fail("completed ChangeIntegration 0.1.0 replay required");
  }
  if (!baselines || !same(Object.keys(baselines).sort(), [...baselineRoles].sort())) fail("exact seven baseline bindings required");
  if (!validateRef(workItemRef) || baselineRoles.some(role => !validateRef(baselines[role]))) fail("full artifact references required");
  const subject = one(replay.loadedInputs, "verified-work-item-subject").value;
  const binding = one(replay.loadedInputs, "integration-input-binding").value;
  const overview = one(replay.loadedInputs, "project-overview-baseline");
  const integrated = one(replay.loadedOutputs, "integrated-change-record");
  const snapshot = one(replay.loadedOutputs, "repository-snapshot");
  [subject, binding, integrated.value].forEach(value => validateChangeIntegrationArtifact(value));
  if (subject.kind !== "VerifiedWorkItemSubject" || binding.kind !== "IntegrationInputBinding" ||
      integrated.value.kind !== "IntegratedChangeRecord" || integrated.value.recordId !== integrated.ref.artifactId) fail("integration artifact identity differs");
  if (!workItemRef || !same(subject.workItem, pointer(workItemRef))) fail("verified subject differs from approved work item");
  const subjectPointer = { artifactId: subject.subjectId, digest: subject.subjectDigest };
  if (!same(binding.subject, subjectPointer) || !same(integrated.value.subject, subjectPointer)) fail("integration subject lineage differs");
  for (const role of baselineRoles) {
    if (!baselines[role] || !same(binding.baselines[role], pointer(baselines[role]))) fail(`${role} differs from activated lineage`);
  }
  if (!same(overview.ref, baselines.projectOverviewBaseline)) fail("project overview input differs from activated context");
  const record = integrated.value;
  if (record.preState.ref !== binding.target.ref || record.preState.commit !== binding.target.expectedCommit ||
      record.postState.ref !== binding.target.ref || snapshot.value.kind !== "RepositorySnapshot" ||
      snapshot.value.revision !== record.postState.commit || snapshot.value.treeDigest !== record.postState.treeDigest) {
    fail("integration target or post-state lineage differs");
  }
  for (const [kind, artifact] of [["change-integration/native-effect", integrated], ["change-integration/post-state", snapshot]]) {
    const evidence = result.evidence.filter(entry => entry.kind === kind);
    if (evidence.length !== 1 || evidence[0].status !== "pass" || evidence[0].subject !== artifact.ref.artifactId ||
        !same(evidence[0].artifact, artifact.ref)) fail("exact successful integration evidence required");
  }
  const fact = { workItemId: workItemRef.artifactId, authority: "approved", integrationRef: integrated.ref,
    evidence: [integrated.ref, snapshot.ref] };
  validateWorkExecutionArtifact({ apiVersion: "devrelay.dev/v1alpha1", kind: "IntegratedCompletionFactSet",
    facts: [fact], factsDigest: canonicalJsonDigest([fact]) });
  return structuredClone(fact);
}
