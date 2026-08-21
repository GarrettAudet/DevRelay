import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { loadProjectMemoryArtifact } from "./project-memory.mjs";
import { validateProjectMemoryArtifact, withProjectMemoryContentDigest } from "./project-memory-artifact-validator.mjs";

export class ProjectMemoryConcludeError extends Error { constructor(message, code = "DR5360") { super(`project memory conclude failed: ${message}`); this.name = "ProjectMemoryConcludeError"; this.code = code; } }
const fail = (message, code) => { throw new ProjectMemoryConcludeError(message, code); };
const sameRef = (a, b) => a?.artifactId === b?.artifactId && a?.schema === b?.schema && a?.mediaType === b?.mediaType && a?.digest === b?.digest;
const nextVersion = (version) => { const [a,b,c] = version.split(".").map(Number); return `${a}.${b}.${c + 1}`; };

export function createSessionConclusion({ projectId, sessionId, taskId, producerType, parentTaskId, startingBaseline, startingGraphCheckpoint, contextReceipt, completedArtifacts = [], evidence = [], pendingDecisions = [], workerConclusions = [], memoryCandidate } = {}) {
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "SessionConclusion", conclusionId: `SC-${canonicalJsonDigest({ projectId, sessionId, taskId, memoryCandidate }).slice(7,23).toUpperCase()}`, projectId, sessionId, taskId, producerType, ...(parentTaskId ? { parentTaskId } : {}), startingBaseline: structuredClone(startingBaseline), startingGraphCheckpoint: structuredClone(startingGraphCheckpoint), contextReceipt: structuredClone(contextReceipt), completedArtifacts: structuredClone(completedArtifacts), evidence: structuredClone(evidence), pendingDecisions: [...pendingDecisions].sort(), ...(workerConclusions.length ? { workerConclusions: structuredClone(workerConclusions) } : {}), memoryCandidate: structuredClone(memoryCandidate) };
  return validateProjectMemoryArtifact(withProjectMemoryContentDigest(body));
}

export function createProjectMemoryGateApproval({ candidate, candidateRef, terminalCheckpointDigest, decisions, policyVersion = "1.0.0" } = {}) {
  const body = { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectMemoryGateApproval", approvalId: `PMGA-${canonicalJsonDigest({ candidateRef, terminalCheckpointDigest, decisions }).slice(7,23).toUpperCase()}`, authority: "project-owner", candidate: structuredClone(candidateRef), baseBaseline: structuredClone(candidate.baseBaseline), decisions: structuredClone(decisions).sort((a,b)=>a.changeId.localeCompare(b.changeId,"en")), terminalCheckpointDigest, policyVersion };
  return validateProjectMemoryArtifact(withProjectMemoryContentDigest(body), { candidate, candidateRef });
}

function applyApprovedChanges(base, candidate, approval) {
  const records = new Map(base.records.map((record) => [record.id, structuredClone(record)]));
  const decisions = new Map(approval.decisions.map((decision) => [decision.changeId, decision]));
  for (const change of candidate.changes) {
    const decision = decisions.get(change.changeId);
    if (decision.decision !== "approve") continue;
    if (change.disposition === "add") records.set(change.proposedMemory.id, structuredClone(change.proposedMemory));
    if (["replace", "supersede"].includes(change.disposition)) {
      const prior = records.get(change.targetMemoryId);
      if (!prior) fail(`target memory ${change.targetMemoryId} is absent`, "DR5361");
      records.set(prior.id, { ...prior, status: "superseded" });
      records.set(change.proposedMemory.id, { ...structuredClone(change.proposedMemory), supersedes: [...new Set([...(change.proposedMemory.supersedes ?? []), prior.id])].sort() });
    }
  }
  return [...records.values()].sort((a,b)=>a.id.localeCompare(b.id,"en"));
}

export function renderCurrentSynopsis(baseline) {
  validateProjectMemoryArtifact(baseline);
  const active = baseline.records.filter((r)=>["active","retained"].includes(r.status)).sort((a,b)=>a.category.localeCompare(b.category,"en")||a.id.localeCompare(b.id,"en"));
  const lines = ["# Current Synopsis", "", `Project: ${baseline.projectId}`, `Memory baseline: ${baseline.baselineId} (${baseline.version})`, "", ...active.map((r)=>`- [${r.category}] ${r.statement} (${r.id})`), ""];
  const bytes = Buffer.from(lines.join("\n").normalize("NFC"), "utf8");
  const ref = { artifactId: `CURRENT-SYNOPSIS-${baseline.baselineId}`, schema: "https://devrelay.dev/artifacts/current-synopsis/v1", mediaType: "text/markdown", digest: sha256Digest(bytes), uri: `memory://devrelay/project-memory/synopsis/${sha256Digest(bytes).slice(7)}.md` };
  const receipt = validateProjectMemoryArtifact(withProjectMemoryContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "SynopsisProjectionReceipt", receiptId: `SPR-${ref.digest.slice(7,23).toUpperCase()}`, baseline: loadProjectMemoryArtifact(baseline).ref, projection: ref, projectionDigest: ref.digest, coverageIds: active.map(({id})=>id), format: "utf8-nfc-lf" }), { baseline });
  return Object.freeze({ bytes, ref, receipt });
}

export function createInMemoryConcludeJournal() { const values = new Map(); return Object.freeze({ get: (key)=>structuredClone(values.get(key)), put(key,value){ if(values.has(key)) fail("conclude journal is immutable", "DR5362"); values.set(key,structuredClone(value)); } }); }

export function createProjectMemoryConclusionCoordinator({ journal = createInMemoryConcludeJournal(), commitAtomic } = {}) {
  if (typeof commitAtomic !== "function") fail("commitAtomic is required");
  return Object.freeze({ async conclude({ conclusion, candidate, candidateRef, approval, baseBaseline, baseBaselineRef, providerSyncReceipt, providerSyncReceiptRef, resultGraphCheckpoint, sourceRefs }) {
    validateProjectMemoryArtifact(conclusion); validateProjectMemoryArtifact(candidate, { currentBaselineRef: baseBaselineRef, currentGraphCheckpoint: conclusion.startingGraphCheckpoint }); validateProjectMemoryArtifact(approval, { candidate, candidateRef }); validateProjectMemoryArtifact(providerSyncReceipt, { ref: providerSyncReceiptRef });
    if (!sameRef(conclusion.startingBaseline, baseBaselineRef) || !sameRef(candidate.baseBaseline, baseBaselineRef)) fail("baseline drift", "DR5363");
    if (!["pass","native-equivalent"].includes(providerSyncReceipt.outcome)) fail("provider synchronization is not verified", "DR5364");
    const key = canonicalJsonDigest({ conclusion: conclusion.contentDigest, candidate: candidate.contentDigest, approval: approval.contentDigest });
    const prior = journal.get(key); if (prior) return Object.freeze({ ...prior, replayed: true });
    const records = applyApprovedChanges(baseBaseline, candidate, approval);
    let baseline = withProjectMemoryContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectMemoryBaseline", baselineId: `PMB-${candidate.candidateId}`, projectId: baseBaseline.projectId, version: nextVersion(baseBaseline.version), approvedCandidate: candidateRef, supersedes: baseBaselineRef, records, graphCheckpoint: structuredClone(resultGraphCheckpoint), projectionDigest: canonicalJsonDigest(records), providerSyncReceipt: providerSyncReceiptRef, approvalEvidence: [loadProjectMemoryArtifact(approval).ref], sourceRefs: structuredClone(sourceRefs) });
    validateProjectMemoryArtifact(baseline); const baselineLoaded = loadProjectMemoryArtifact(baseline); const synopsis = renderCurrentSynopsis(baseline);
    const checkpointDigest = canonicalJsonDigest({ baseline: baselineLoaded.ref, synopsis: synopsis.ref, graph: resultGraphCheckpoint, provider: providerSyncReceiptRef });
    const proof = validateProjectMemoryArtifact(withProjectMemoryContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectMemoryGatePromotionProof", proofId: `PMGP-${checkpointDigest.slice(7,23).toUpperCase()}`, status: "promoted", candidate: candidateRef, approval: loadProjectMemoryArtifact(approval).ref, projectMemoryBaseline: baselineLoaded.ref, synopsisProjection: synopsis.ref, providerSyncReceipt: providerSyncReceiptRef, graphCheckpoint: resultGraphCheckpoint, checkpointDigest, refreshRequired: true }));
    const result = await commitAtomic({ expectedBaseline: baseBaselineRef, baseline: baselineLoaded, synopsis, proof });
    if (result?.committed !== true) fail("atomic commit was not confirmed", "DR5365");
    const receipt = validateProjectMemoryArtifact(withProjectMemoryContentDigest({ apiVersion: "devrelay.dev/v1alpha1", kind: "ConcludeReceipt", receiptId: `CR-${checkpointDigest.slice(7,23).toUpperCase()}`, projectId: conclusion.projectId, sessionId: conclusion.sessionId, taskId: conclusion.taskId, conclusion: loadProjectMemoryArtifact(conclusion).ref, inputBaseline: baseBaselineRef, resultBaseline: baselineLoaded.ref, inputGraphCheckpoint: conclusion.startingGraphCheckpoint, resultGraphCheckpoint, deltaDigest: candidate.contentDigest, synopsisDigest: synopsis.ref.digest, providerSyncReceipt: providerSyncReceiptRef, resultingCheckpointDigest: checkpointDigest, outcome: "concluded", replayed: false }), { providerReceipt: providerSyncReceipt, providerReceiptRef: providerSyncReceiptRef });
    const output = { outcome: "concluded", baseline: baselineLoaded, synopsis, proof, receipt, replayed: false }; journal.put(key, output); return Object.freeze(output);
  } });
}
