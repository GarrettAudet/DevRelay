import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateBusinessAcceptanceArtifact } from "./business-acceptance-artifact-validator.mjs";

const SCOPE = "business-acceptance/accepted";
const REQUIREMENTS_SCOPE = "requirements/baseline";
const fail = (message) => { throw new TypeError(`business-acceptance traceability contributor: ${message}`); };
const samePointer = (left, right) => left?.artifactId === right?.artifactId && left?.digest === right?.digest;
const pointer = (value, idField, digestField) => ({ artifactId: value[idField], digest: value[digestField] });
const endpoint = (kind, stableId, authority = "approved", scope = REQUIREMENTS_SCOPE) => ({ kind, stableId, authority, scope });
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sorted = (values) => values.sort((left, right) => compareText(canonicalJson(left), canonicalJson(right)));

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

function oneKind(context, kind) {
  const matches = allLoaded({
    loadedInputs: context.loadedInputs,
    loadedOutputs: context.loadedOutputs,
    loadedAttachments: context.loadedAttachments,
    resolvedArtifacts: context.resolvedArtifacts,
  }).filter(({ value }) => value?.kind === kind);
  if (matches.length !== 1) fail(`exactly one loaded ${kind} artifact is required`);
  const loaded = matches[0];
  if (!loaded.ref || (!Buffer.isBuffer(loaded.bytes) && !(loaded.bytes instanceof Uint8Array))) fail(`${kind} requires raw bytes and an ArtifactRef`);
  const bytes = Buffer.from(loaded.bytes);
  let decoded;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(`${kind} raw bytes are not UTF-8 JSON`); }
  if (sha256Digest(bytes) !== loaded.ref.digest || canonicalJson(decoded) !== new TextDecoder().decode(bytes) || canonicalJson(decoded) !== canonicalJson(loaded.value)) fail(`${kind} raw bytes or digest are stale`);
  return loaded;
}

function locator(loaded, jsonPointer, entity) {
  return {
    artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest },
    jsonPointer,
    entityDigest: canonicalJsonDigest(entity),
  };
}

function matches(context) {
  return Boolean(
    context?.invocation?.module?.id === "business-acceptance-gate" &&
    context?.moduleResult?.status === "completed" &&
    context.moduleResult.outcome === "accepted",
  );
}

function exactAcceptedContext(context) {
  const integratedSystemLoaded = oneKind(context, "IntegratedSystemCandidate");
  const systemVerificationLoaded = oneKind(context, "SystemVerificationResult");
  const technicalCoverageLoaded = oneKind(context, "BusinessAcceptanceTechnicalCoverage");
  const subjectLoaded = oneKind(context, "BusinessAcceptanceSubject");
  const policyLoaded = oneKind(context, "BusinessAcceptancePolicy");
  const evidenceLoaded = oneKind(context, "BusinessAcceptanceEvidenceSet");
  const evaluationLoaded = oneKind(context, "BusinessAcceptanceEvaluation");
  const candidateLoaded = oneKind(context, "BusinessAcceptanceCandidate");
  const approvalLoaded = oneKind(context, "BusinessAcceptanceOwnerApproval");
  const recordLoaded = oneKind(context, "BusinessAcceptanceRecord");
  const integratedSystemCandidate = integratedSystemLoaded.value;
  const systemVerificationResult = systemVerificationLoaded.value;
  const policy = validateBusinessAcceptanceArtifact(policyLoaded.value);
  const technicalCoverage = validateBusinessAcceptanceArtifact(technicalCoverageLoaded.value, {
    requirementsBaseline: integratedSystemCandidate.requirementsBaseline,
    systemVerificationResult,
    traceabilityCheckpoint: technicalCoverageLoaded.value.traceabilityCheckpoint,
    approvedAcceptanceCriterionIds: technicalCoverageLoaded.value.approvedAcceptanceCriterionIds,
  });
  const evidence = validateBusinessAcceptanceArtifact(evidenceLoaded.value, {
    requirementsBaseline: integratedSystemCandidate.requirementsBaseline,
    projectOverviewBaseline: integratedSystemCandidate.projectOverviewBaseline,
    systemVerificationResult,
  });
  const subject = validateBusinessAcceptanceArtifact(subjectLoaded.value, {
    integratedSystemCandidate,
    systemVerificationResult,
    policy,
    evidence,
    repositoryReleaseSnapshot: subjectLoaded.value.repositoryReleaseSnapshot,
    traceabilityCheckpoint: subjectLoaded.value.traceabilityCheckpoint,
    technicalCoverage,
  });
  const evaluation = validateBusinessAcceptanceArtifact(evaluationLoaded.value, { subject, policy, evidence, technicalCoverage });
  const candidate = validateBusinessAcceptanceArtifact(candidateLoaded.value, { evaluation });
  const approval = validateBusinessAcceptanceArtifact(approvalLoaded.value, { candidate, candidateRawDigest: sha256Digest(candidateLoaded.bytes), technicalCoverageRef: subject.technicalCoverage });
  const record = validateBusinessAcceptanceArtifact(recordLoaded.value, { candidate, approval });
  if (record.outcome !== "accepted" || record.lifecycleDisposition !== "construction-complete" || approval.decision !== "approved") fail("only an exact accepted BusinessAcceptanceRecord may project facts");
  if (!samePointer(subject.policy, pointer(policy, "policyId", "policyDigest")) || !samePointer(subject.businessEvidence, pointer(evidence, "evidenceSetId", "evidenceDigest"))) fail("subject policy or evidence lineage is stale or substituted");
  const outputs = context.moduleResult.outputs;
  const recordRefs = outputs?.["business-acceptance-record"];
  if (Object.keys(outputs ?? {}).join(",") !== "business-acceptance-record" || !Array.isArray(recordRefs) || recordRefs.length !== 1 || !samePointer(recordRefs[0], recordLoaded.ref)) fail("Gate result must contain only the exact BusinessAcceptanceRecord output");
  if (context.moduleResult.invocationId !== context.invocation.invocationId) fail("Gate result invocation is substituted");
  return { evidenceLoaded, evaluationLoaded, recordLoaded, evidence, evaluation, record };
}

export function createBusinessAcceptanceTraceabilityContributor() {
  return Object.freeze({
    metadata: immutable({ id: "devrelay.business-acceptance-gate", version: "1.0.0" }),
    authority: "approved",
    scope: SCOPE,
    ownership: immutable({
      authority: "approved",
      scope: SCOPE,
      nodeKinds: ["business-acceptance-record", "verification-evidence"],
      edgeKinds: ["accepted-by", "verified-by"],
    }),
    match: matches,
    async project(context) {
      if (!matches(context)) fail("project called for a nonmatching execution");
      const values = exactAcceptedContext(context);
      const evidenceById = new Map(values.evidence.items.map((item, index) => [item.evidenceId, { item, index }]));
      const nodes = [{
        kind: "business-acceptance-record",
        stableId: values.record.recordId,
        label: values.record.recordId,
        attributes: { lifecycleDisposition: values.record.lifecycleDisposition, record: immutable(values.recordLoaded.ref) },
        sourceLocators: [locator(values.recordLoaded, "", values.record)],
      }];
      const edges = [];
      const seenEvidence = new Set();
      for (const [index, disposition] of values.evaluation.dispositions.entries()) {
        if (disposition.status !== "satisfied" || disposition.evidenceIds.length === 0) fail(`accepted scope ${disposition.scopeKind}/${disposition.scopeId} lacks satisfied evidence`);
        const source = endpoint(disposition.scopeKind, disposition.scopeId);
        edges.push({
          kind: "accepted-by",
          source,
          target: endpoint("business-acceptance-record", values.record.recordId, "approved", SCOPE),
          rationale: "The exact owner-approved BusinessAcceptanceRecord accepts this approved business scope.",
          sourceLocators: [locator(values.evaluationLoaded, `/dispositions/${index}`, disposition), locator(values.recordLoaded, "", values.record)],
        });
        for (const evidenceId of disposition.evidenceIds) {
          const found = evidenceById.get(evidenceId);
          if (!found || found.item.scopeKind !== disposition.scopeKind || found.item.scopeId !== disposition.scopeId || found.item.status !== "pass") fail(`evidence ${evidenceId} is missing, orphaned, unrelated, or not passing`);
          if (!seenEvidence.has(evidenceId)) {
            seenEvidence.add(evidenceId);
            nodes.push({
              kind: "verification-evidence",
              stableId: evidenceId,
              label: evidenceId,
              verificationStatus: found.item.status,
              attributes: { artifact: immutable(found.item.artifact), producer: immutable(found.item.producer), businessAcceptanceRecord: immutable(values.recordLoaded.ref) },
              sourceLocators: [locator(values.evidenceLoaded, `/items/${found.index}`, found.item), locator(values.recordLoaded, "", values.record)],
            });
          }
          edges.push({
            kind: "verified-by",
            source,
            target: endpoint("verification-evidence", evidenceId, "approved", SCOPE),
            rationale: "The exact accepted BusinessAcceptanceRecord binds passing evidence to this approved business scope.",
            sourceLocators: [locator(values.evaluationLoaded, `/dispositions/${index}`, disposition), locator(values.evidenceLoaded, `/items/${found.index}`, found.item), locator(values.recordLoaded, "", values.record)],
          });
        }
      }
      if (seenEvidence.size !== values.evidence.items.length) fail("BusinessAcceptanceEvidenceSet contains orphan evidence not bound by the accepted evaluation");
      return { horizon: "acceptance", nodes: sorted(nodes), edges: sorted(edges) };
    },
  });
}

export const businessAcceptanceTraceabilityContributor = createBusinessAcceptanceTraceabilityContributor();
