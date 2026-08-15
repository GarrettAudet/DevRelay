import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { ROADMAP_ARTIFACT_CONTRACTS, validateRoadmapArtifact } from "./roadmap-management-artifact-validator.mjs";
import { renderRoadmapMarkdown } from "./roadmap-management.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";

export class RoadmapGateError extends Error {
  constructor(message) {
    super(`roadmap gate rejected candidate: ${message}`);
    this.name = "RoadmapGateError";
    this.code = "DR5220";
  }
}

const fail = (message) => { throw new RoadmapGateError(message); };
const sameRef = (left, right) => Boolean(left && right && left.artifactId === right.artifactId && left.schema === right.schema && left.mediaType === right.mediaType && left.digest === right.digest);
const withDigest = (value) => ({ ...value, contentDigest: canonicalJsonDigest(value) });
const refFor = (artifactId, contract, bytes, uri) => ({ artifactId, schema: contract.schema, mediaType: contract.mediaType, digest: sha256Digest(bytes), uri });

function verifyExactDocument({ label, artifact, ref, bytes, kind }) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) fail(`${label} must be supplied as exact raw bytes`);
  const raw = Buffer.from(bytes);
  if (sha256Digest(raw) !== ref?.digest) fail(`${label} bytes do not match their ArtifactRef digest`);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    fail(`${label} bytes are not valid UTF-8`);
  }
  if (!Buffer.from(text, "utf8").equals(raw)) fail(`${label} bytes must be BOM-free canonical UTF-8`);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(`${label} bytes are not a valid JSON document`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.kind !== kind) {
    fail(`${label} bytes do not contain one ${kind}`);
  }
  validateRoadmapArtifact(parsed, { ref });
  if (canonicalJsonDigest(parsed) !== canonicalJsonDigest(artifact)) {
    fail(`${label} object does not match the exact raw JSON artifact`);
  }
  return parsed;
}

function nextVersion(current) {
  if (!current) return "1.0.0";
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(current);
  if (!match) fail("current baseline semantic version is invalid");
  return `${match[1]}.${Number(match[2]) + 1}.0`;
}

function initiativeMap(currentBaseline) {
  return new Map((currentBaseline?.initiatives ?? []).map((initiative) => [initiative.id, structuredClone(initiative)]));
}

export function promoteRoadmapBaseline({
  changeSet: suppliedChangeSet,
  changeSetRef,
  changeSetBytes,
  currentBaseline,
  currentBaselineRef,
  approval: suppliedApproval,
  approvalRef,
  approvalBytes,
  terminalCheckpointDigest,
  priorityPolicyRef,
  sourceRefs,
  baselineId = "ROADMAP-DEVRELAY",
  baselineUri = "devrelay://repository/project/roadmap-baseline.json",
  projectionUri = "devrelay://repository/Roadmap.md",
}) {
  const changeSet = verifyExactDocument({
    label: "roadmap change-set candidate",
    artifact: suppliedChangeSet,
    ref: changeSetRef,
    bytes: changeSetBytes,
    kind: "RoadmapChangeSetDraft",
  });
  const approval = verifyExactDocument({
    label: "RoadmapGate approval",
    artifact: suppliedApproval,
    ref: approvalRef,
    bytes: approvalBytes,
    kind: "RoadmapGateApproval",
  });
  if (approval.decision !== "approve" || approval.authority !== "project-owner") fail("exact project-owner approval is required");
  if (!sameRef(approval.candidate, changeSetRef)) fail("approval does not bind the exact change-set candidate");
  if (approval.terminalCheckpointDigest !== terminalCheckpointDigest) fail("approval does not bind the terminal checkpoint");
  if (currentBaseline) {
    validateRoadmapArtifact(currentBaseline, { ref: currentBaselineRef });
    if (!sameRef(changeSet.currentBaseline, currentBaselineRef)) fail("candidate current baseline drifted");
    if (!sameRef(approval.currentBaselineDisposition, currentBaselineRef)) fail("approval current baseline drifted");
  } else if (changeSet.currentBaseline !== null || approval.currentBaselineDisposition !== "RoadmapNotInitialized") {
    fail("initial roadmap promotion requires the explicit RoadmapNotInitialized disposition");
  }
  const initiatives = initiativeMap(currentBaseline);
  for (const change of changeSet.changes) {
    const initiative = change.initiative;
    if (!initiative?.id) fail("change lacks an initiative identity");
    if (!new Set(["add", "upsert"]).has(change.operation)) fail(`unsupported roadmap change operation ${change.operation}`);
    initiatives.set(initiative.id, structuredClone(initiative));
  }
  const sorted = [...initiatives.values()].sort((a, b) => b.priority.weightedScore - a.priority.weightedScore || a.id.localeCompare(b.id, "en"));
  const provisional = {
    apiVersion: API_VERSION,
    kind: "RoadmapBaseline",
    baselineId,
    version: nextVersion(currentBaseline?.version),
    approvedCandidate: structuredClone(changeSetRef),
    ...(currentBaselineRef ? { supersedes: structuredClone(currentBaselineRef) } : {}),
    initiatives: sorted,
    priorityPolicy: structuredClone(priorityPolicyRef),
    projectionDigest: "sha256:" + "0".repeat(64),
    approvalEvidence: [structuredClone(approvalRef)],
    sourceRefs: structuredClone(sourceRefs),
  };
  const projection = renderRoadmapMarkdown(provisional);
  provisional.projectionDigest = sha256Digest(Buffer.from(projection, "utf8"));
  const baseline = withDigest(provisional);
  validateRoadmapArtifact(baseline);
  const baselineBytes = Buffer.from(canonicalJson(baseline), "utf8");
  const projectionBytes = Buffer.from(projection, "utf8");
  const baselineRef = refFor(baseline.baselineId, ROADMAP_ARTIFACT_CONTRACTS.RoadmapBaseline, baselineBytes, baselineUri);
  const projectionRef = refFor(`${baseline.baselineId}-markdown-${baseline.version}`, { schema: "https://devrelay.dev/artifacts/roadmap-projection/v1", mediaType: "text/markdown" }, projectionBytes, projectionUri);
  if (projectionRef.digest !== baseline.projectionDigest) fail("Roadmap.md projection digest drifted from the promoted baseline");
  const proofMaterial = {
    apiVersion: API_VERSION,
    kind: "RoadmapGatePromotionProof",
    proofId: `ROADMAP-PROMOTION-${canonicalJsonDigest({ changeSetRef, approvalRef, baselineRef }).slice(7, 23).toUpperCase()}`,
    status: "promoted",
    candidate: structuredClone(changeSetRef),
    approval: structuredClone(approvalRef),
    roadmapBaseline: baselineRef,
    roadmapProjection: projectionRef,
    checkpointDigest: terminalCheckpointDigest,
    refreshRequired: true,
  };
  const promotionProof = withDigest(proofMaterial);
  validateRoadmapArtifact(promotionProof);
  return Object.freeze({
    baseline: Object.freeze(baseline),
    baselineBytes,
    baselineRef: Object.freeze(baselineRef),
    projection,
    projectionBytes,
    projectionRef: Object.freeze(projectionRef),
    promotionProof: Object.freeze(promotionProof),
    refreshRequired: true,
    progressionAllowed: true,
  });
}
