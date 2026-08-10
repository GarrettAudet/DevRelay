import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const schema = JSON.parse(readFileSync(new URL("../contracts/change-integration-artifacts.schema.json", import.meta.url), "utf8"));
const validator = compileArtifactSchema(schema);

export const CHANGE_INTEGRATION_ARTIFACT_KINDS = Object.freeze(["VerifiedWorkItemSubject","IntegrationInputBinding","IntegrationPlan","IntegrationAdapterInvocation","RawIntegrationEffectResult","IntegrationConflictSet","IntegratedChangeRecord","IntegrationCheckpoint","ChangeIntegrationTraceabilityInput"]);
export class ChangeIntegrationArtifactValidationError extends Error { constructor(message) { super(`change integration artifact is invalid: ${message}`); this.name="ChangeIntegrationArtifactValidationError"; this.code="DR4090"; } }
const fail = message => { throw new ChangeIntegrationArtifactValidationError(message); };
const digestField = Object.freeze({VerifiedWorkItemSubject:"subjectDigest",IntegrationInputBinding:"bindingDigest",IntegrationPlan:"planDigest",IntegrationAdapterInvocation:"invocationFingerprint",IntegrationConflictSet:"conflictDigest",IntegratedChangeRecord:"recordDigest",IntegrationCheckpoint:"checkpointDigest",ChangeIntegrationTraceabilityInput:"traceabilityDigest"});
const bodyDigest = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion","kind",field].includes(key))));
const sameAdapter = (left, right) => left?.id===right?.id && left?.version===right?.version && left?.configurationDigest===right?.configurationDigest;
const sameRef = (left, artifactId, digest) => left?.artifactId===artifactId && left?.digest===digest;

export function validateChangeIntegrationArtifact(value, context={}) {
  if (!validator(value)) fail(validationDetail(validator));
  if (!CHANGE_INTEGRATION_ARTIFACT_KINDS.includes(value.kind)) fail(`unsupported kind ${value?.kind}`);
  const field=digestField[value.kind];
  if (field && value[field]!==bodyDigest(value,field)) fail(`${field} does not bind canonical material`);
  if (value.kind==="IntegrationPlan" && context.subject && context.binding) {
    if (!sameRef(value.subject,context.subject.subjectId,context.subject.subjectDigest) || !sameRef(value.binding,context.binding.bindingId,context.binding.bindingDigest)) fail("IntegrationPlan does not bind the exact subject and input binding");
    if (!sameRef(value.verifiedChange,context.subject.changeSet.artifactId,context.subject.changeSet.digest) || value.verifiedChangeDigest!==context.subject.changeSet.digest) fail("IntegrationPlan does not bind the exact verified change bytes");
    if (value.preState.ref!==context.binding.target.ref || value.preState.commit!==context.binding.target.expectedCommit || value.transition.targetRef!==context.binding.target.ref || value.transition.expectedTargetCommit!==context.binding.target.expectedCommit) fail("IntegrationPlan target pre-state and transition do not match the input binding");
    if (!sameAdapter(value.adapter,context.binding.adapter) || !sameRef(value.integrationPolicy,context.binding.integrationPolicy.artifactId,context.binding.integrationPolicy.digest) || value.idempotencyKey!==context.binding.idempotencyKey) fail("IntegrationPlan substitutes adapter, policy, or idempotency identity");
    if (canonicalJsonDigest(value.baselines)!==canonicalJsonDigest(context.binding.baselines)) fail("IntegrationPlan baseline identities do not exactly match the input binding");
    if (canonicalJsonDigest(value.permissionDemands)!==canonicalJsonDigest(context.binding.permissionDemands)) fail("IntegrationPlan permission demands do not exactly match the ordered input binding demands");
  }
  if (value.kind==="IntegrationAdapterInvocation" && context.plan && context.binding) {
    if (value.plan.digest!==context.plan.planDigest || !sameAdapter(value.adapter,context.binding.adapter)) fail("IntegrationAdapterInvocation substitutes its plan or adapter binding");
    if (JSON.stringify(value.permissionDemands)!==JSON.stringify(context.plan.permissionDemands) || JSON.stringify(value.operation.transition)!==JSON.stringify(context.plan.transition)) fail("IntegrationAdapterInvocation changes the authorized permissions or target transition");
  }
  if (value.kind==="RawIntegrationEffectResult") {
    const invocation=context.invocation;
    if (!invocation || invocation.kind!=="IntegrationAdapterInvocation") fail("RawIntegrationEffectResult requires exact invocation context");
    if (value.invocationId!==invocation.invocationId || value.invocationFingerprint!==invocation.invocationFingerprint || !sameAdapter(value.adapter,invocation.adapter)) fail("RawIntegrationEffectResult adapter binding does not match");
    if (JSON.stringify(value.operation)!==JSON.stringify(invocation.operation)) fail("RawIntegrationEffectResult operation details do not match the invocation");
    if (value.preState.ref!==invocation.operation.transition.targetRef || value.preState.commit!==invocation.operation.transition.expectedTargetCommit || (value.postState && value.postState.ref!==invocation.operation.transition.targetRef)) fail("RawIntegrationEffectResult target observation does not match the invocation");
  }
  if (value.kind==="IntegrationCheckpoint" && value.recoveryEvidence) {
    const { disposition, observedState, producedCommitAuthorization } = value.recoveryEvidence;
    const transition=value.operation.transition;
    if (observedState.ref!==transition.targetRef) fail("recoveryEvidence observedState ref does not match the authorized target");
    if (disposition==="not-applied" && observedState.commit!==transition.expectedTargetCommit) fail("not-applied recoveryEvidence must observe the expected target commit");
    if (disposition==="applied") {
      const exactFastForward=transition.strategy==="fast-forward" && observedState.commit===transition.sourceCommit;
      if (!exactFastForward && !producedCommitAuthorization) fail("applied recoveryEvidence requires produced-commit authorization for this strategy or commit");
      if (value.recoveryStatus!=="recovered") fail("applied recoveryEvidence must have recovered status");
    }
    if (disposition==="not-applied" && value.recoveryStatus!=="recovered") fail("not-applied recoveryEvidence must have recovered status");
    if (disposition==="unresolved" && value.recoveryStatus!=="needs-reconciliation") fail("unresolved recoveryEvidence must remain needs-reconciliation");
  }
  return value;
}
