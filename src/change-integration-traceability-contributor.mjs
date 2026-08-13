import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateChangeIntegrationArtifact } from "./change-integration-artifact-validator.mjs";
import { documentValidators, validationDetail } from "./schema-validation.mjs";

const SCOPE = "change-integration/integrated";
const WORK_ITEM_SCOPE = "work-breakdown/candidate";
const ARCHITECTURE_SCOPE = "architecture/baseline";
const CONTRACT_SCOPE = "contracts/baseline";

function fail(message) {
  throw new TypeError(`change-integration traceability contributor: ${message}`);
}

function immutable(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (entry && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}

function allLoaded(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (value.ref && value.value && value.bytes !== undefined) {
    result.push(value);
    return result;
  }
  for (const child of Object.values(value)) allLoaded(child, result);
  return result;
}

function declaredLoaded(context) {
  return allLoaded({
    loadedInputs: context.loadedInputs,
    loadedOutputs: context.loadedOutputs,
    loadedAttachments: context.loadedAttachments,
    resolvedArtifacts: context.resolvedArtifacts,
  });
}

function exactRef(left, right) {
  return Boolean(left && right && canonicalJson(left) === canonicalJson(right));
}

function exactPointer(left, right) {
  return Boolean(left && right && left.artifactId === right.artifactId && left.digest === right.digest);
}

function canonicalLoaded(context, kind, label) {
  const matches = allLoaded({
    loadedInputs: context.loadedInputs,
    loadedOutputs: context.loadedOutputs,
    loadedAttachments: context.loadedAttachments,
    resolvedArtifacts: context.resolvedArtifacts,
  }).filter(({ value }) => value?.kind === kind);
  if (matches.length !== 1) fail(`${label} must contain exactly one loaded canonical ${kind}`);
  const loaded = matches[0];
  const bytes = Buffer.from(loaded.bytes);
  if (sha256Digest(bytes) !== loaded.ref.digest) fail(`${label} bytes do not match its ArtifactRef`);
  let decoded;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(`${label} bytes are not canonical JSON`); }
  if (canonicalJson(decoded) !== new TextDecoder().decode(bytes) || canonicalJson(decoded) !== canonicalJson(loaded.value)) {
    fail(`${label} bytes are not the exact canonical loaded value`);
  }
  return loaded;
}

function exactLoadedReference(context, expectedRef, label) {
  const candidates = declaredLoaded(context).filter(({ ref }) =>
    ref?.artifactId === expectedRef?.artifactId && ref?.digest === expectedRef?.digest,
  );
  if (candidates.length !== 1) fail(`${label} must resolve to exactly one loaded artifact`);
  if (!exactRef(candidates[0].ref, expectedRef)) fail(`${label} full ArtifactRef is stale or substituted`);
  const bytes = Buffer.from(candidates[0].bytes);
  let decoded;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(`${label} bytes are not canonical JSON`); }
  if (sha256Digest(bytes) !== expectedRef.digest || canonicalJson(decoded) !== new TextDecoder().decode(bytes) || canonicalJson(decoded) !== canonicalJson(candidates[0].value)) {
    fail(`${label} bytes are not the exact canonical loaded value`);
  }
  return candidates[0];
}

function locator(loaded, jsonPointer, entity) {
  return {
    artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest },
    jsonPointer,
    entityDigest: canonicalJsonDigest(entity),
  };
}

function endpoint(kind, stableId, authority, scope) {
  return { kind, stableId, authority, scope };
}

function assertResult(context, loaded) {
  const result = loaded.value;
  if (!documentValidators.moduleResult(result)) fail(`ModuleResult is invalid: ${validationDetail(documentValidators.moduleResult)}`);
  if (canonicalJson(result) !== canonicalJson(context.moduleResult)) fail("loaded ModuleResult does not equal the executed result");
  if (result.invocationId !== context.invocation.invocationId || result.status !== "completed" || result.outcome !== "integrated") fail("only the exact integrated ModuleResult may project integration facts");
  if (Object.keys(result.outputs).sort().join(",") !== "integrated-change-record,repository-snapshot") fail("integrated ModuleResult has missing or extra output ports");
  const recordRefs = result.outputs?.["integrated-change-record"];
  const snapshotRefs = result.outputs?.["repository-snapshot"];
  if (!Array.isArray(recordRefs) || recordRefs.length !== 1 || !Array.isArray(snapshotRefs) || snapshotRefs.length !== 1) {
    fail("integrated ModuleResult must identify exactly one record and post RepositorySnapshot");
  }
  for (const [kind, output] of [["change-integration/native-effect", recordRefs[0]], ["change-integration/post-state", snapshotRefs[0]]]) {
    if (!result.evidence.some((entry) => entry.kind === kind && entry.status === "pass" && exactRef(entry.artifact, output))) {
      fail(`integrated ModuleResult requires ${kind} pass evidence bound to its exact output`);
    }
  }
  return { result, recordRef: recordRefs[0], snapshotRef: snapshotRefs[0] };
}

function requireEntity(list, id, label) {
  const matches = Array.isArray(list) ? list.filter((entry) => entry?.id === id) : [];
  if (matches.length !== 1) fail(`${label} reference ${id} does not resolve exactly once in its approved baseline`);
  return matches[0];
}

function matches(context) {
  return Boolean(
    context?.invocation?.module?.id === "change-integration" &&
    context.invocation.module.version === "0.1.0" &&
    context.invocation.module.operation === "integrate-change" &&
    context?.moduleResult?.status === "completed" &&
    context.moduleResult.outcome === "integrated",
  );
}

export function createChangeIntegrationTraceabilityContributor() {
  return Object.freeze({
    metadata: immutable({ id: "devrelay.change-integration", version: "1.0.0" }),
    match: matches,
    authority: "approved",
    scope: SCOPE,
    ownership: immutable({
      authority: "approved",
      scope: SCOPE,
      nodeKinds: ["change-set", "integrated-change-record"],
      edgeKinds: ["produces", "implemented-by", "realized-by", "integrated-as"],
      retention: "append-only",
    }),
    async project(context) {
      if (!matches(context)) fail("project called for a nonmatching execution");
      const moduleResultLoaded = canonicalLoaded(context, "ModuleResult", "ModuleResult");
      const { recordRef, snapshotRef } = assertResult(context, moduleResultLoaded);
      const recordLoaded = canonicalLoaded(context, "IntegratedChangeRecord", "IntegratedChangeRecord");
      const snapshotLoaded = canonicalLoaded(context, "RepositorySnapshot", "post RepositorySnapshot");
      const subjectLoaded = canonicalLoaded(context, "VerifiedWorkItemSubject", "VerifiedWorkItemSubject");
      const traceLoaded = canonicalLoaded(context, "ChangeIntegrationTraceabilityInput", "ChangeIntegrationTraceabilityInput");
      const bindingLoaded = canonicalLoaded(context, "IntegrationInputBinding", "IntegrationInputBinding");
      const workItemLoaded = exactLoadedReference(context, subjectLoaded.value.workItem, "WorkItem");
      const changeSetLoaded = exactLoadedReference(context, subjectLoaded.value.changeSet, "ChangeSet");
      const architectureLoaded = exactLoadedReference(context, bindingLoaded.value.baselines.architectureBaseline, "architecture baseline");
      const contractLoaded = exactLoadedReference(context, bindingLoaded.value.baselines.contractDisposition, "contract disposition");
      validateChangeIntegrationArtifact(subjectLoaded.value);
      validateChangeIntegrationArtifact(bindingLoaded.value);
      validateChangeIntegrationArtifact(recordLoaded.value);
      validateChangeIntegrationArtifact(traceLoaded.value);
      if (!exactRef(recordLoaded.ref, recordRef) || !exactRef(snapshotLoaded.ref, snapshotRef)) fail("ModuleResult output refs do not equal the loaded record and post RepositorySnapshot");
      if (!exactPointer(recordLoaded.value.subject, { artifactId: subjectLoaded.value.subjectId, digest: subjectLoaded.value.subjectDigest })) fail("IntegratedChangeRecord substitutes its verified subject");
      if (snapshotLoaded.value.revision !== recordLoaded.value.postState.commit || snapshotLoaded.value.treeDigest !== recordLoaded.value.postState.treeDigest || snapshotLoaded.value.repository === undefined) fail("post RepositorySnapshot does not equal the IntegratedChangeRecord post-state");
      if (!exactPointer(traceLoaded.value.integratedChange, recordRef) || !exactPointer(traceLoaded.value.subject, { artifactId: subjectLoaded.value.subjectId, digest: subjectLoaded.value.subjectDigest }) || !exactPointer(traceLoaded.value.repositorySnapshot, snapshotRef) || traceLoaded.value.authority !== "approved" || traceLoaded.value.scope !== SCOPE) fail("traceability input is stale, substituted, or unauthorized");
      if (workItemLoaded.value.id !== subjectLoaded.value.workItem.artifactId) fail("verified subject and WorkItem identity differ");

      const changeSetId = changeSetLoaded.ref.artifactId;
      const recordId = recordLoaded.value.recordId;
      const common = [locator(traceLoaded, "", traceLoaded.value), locator(recordLoaded, "", recordLoaded.value)];
      const nodes = [
        { kind: "change-set", stableId: changeSetId, label: changeSetId, attributes: { artifact: immutable(changeSetLoaded.ref), workItemId: workItemLoaded.value.id }, sourceLocators: [locator(changeSetLoaded, "", changeSetLoaded.value), locator(subjectLoaded, "/changeSet", subjectLoaded.value.changeSet)] },
        { kind: "integrated-change-record", stableId: recordId, label: recordId, attributes: { artifact: immutable(recordLoaded.ref), repositorySnapshot: immutable(snapshotLoaded.ref) }, sourceLocators: common },
      ];
      const edges = [{ kind: "produces", source: endpoint("work-item", workItemLoaded.value.id, "candidate", WORK_ITEM_SCOPE), target: endpoint("change-set", changeSetId, "approved", SCOPE), rationale: "The verified work item produced the exact integrated change set.", sourceLocators: [locator(subjectLoaded, "/workItem", subjectLoaded.value.workItem), locator(subjectLoaded, "/changeSet", subjectLoaded.value.changeSet)] }];
      for (const [index, id] of (workItemLoaded.value["architecture-refs"] ?? []).entries()) {
        requireEntity(architectureLoaded.value?.sections?.architectureModel?.content?.elements, id, "architecture");
        edges.push({ kind: "implemented-by", source: endpoint("architecture-element", id, "approved", ARCHITECTURE_SCOPE), target: endpoint("change-set", changeSetId, "approved", SCOPE), rationale: "The exact approved architecture element is implemented by this integrated change set.", sourceLocators: [locator(workItemLoaded, `/architecture-refs/${index}`, id)] });
      }
      for (const [index, id] of (workItemLoaded.value["contract-refs"] ?? []).entries()) {
        requireEntity(contractLoaded.value?.contractTargets, id, "contract");
        edges.push({ kind: "realized-by", source: endpoint("contract", id, "approved", CONTRACT_SCOPE), target: endpoint("change-set", changeSetId, "approved", SCOPE), rationale: "The exact approved contract is realized by this integrated change set.", sourceLocators: [locator(workItemLoaded, `/contract-refs/${index}`, id)] });
      }
      edges.push({ kind: "integrated-as", source: endpoint("change-set", changeSetId, "approved", SCOPE), target: endpoint("integrated-change-record", recordId, "approved", SCOPE), rationale: "The exact change set was incorporated as this persisted integrated-change record.", sourceLocators: common });
      const sort = (values) => values.sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b), "en"));
      return { horizon: "implementation", nodes: sort(nodes), edges: sort(edges) };
    },
  });
}

export const changeIntegrationTraceabilityContributor = createChangeIntegrationTraceabilityContributor();
