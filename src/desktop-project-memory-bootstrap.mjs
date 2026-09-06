import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateDesktopOrchestrationArtifact } from "./desktop-orchestration-artifact-validator.mjs";
import { loadProjectMemoryArtifact } from "./project-memory.mjs";
import { validateProjectMemoryArtifact } from "./project-memory-artifact-validator.mjs";
import { renderCurrentSynopsis } from "./project-memory-conclude.mjs";

export class DesktopProjectMemoryBootstrapError extends Error {
  constructor(message, code = "DR6150") {
    super(`desktop project memory bootstrap: ${message}`);
    this.name = "DesktopProjectMemoryBootstrapError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new DesktopProjectMemoryBootstrapError(message, code); };
const sameRef = (left, right) => left?.artifactId === right?.artifactId && left?.digest === right?.digest && left?.schema === right?.schema && left?.mediaType === right?.mediaType;
const readJson = (file, label) => {
  if (!existsSync(file)) fail(`${label} is missing`, "DR6151");
  const bytes = readFileSync(file);
  try { return { bytes, value: JSON.parse(bytes.toString("utf8")) }; } catch { fail(`${label} is malformed`, "DR6151"); }
};
const hasCanonicalFileBytes = (bytes, value) => {
  const canonical = canonicalJson(value);
  const text = bytes.toString("utf8");
  return text === canonical || text === `${canonical}\n`;
};

export function loadDesktopProjectMemoryBootstrap({ projectRoot, taskId, repositoryRevision = "working-tree", manifestPath = "project/project-memory-bootstrap-manifest.json" } = {}) {
  if (!path.isAbsolute(projectRoot ?? "") || typeof taskId !== "string" || !taskId) fail("absolute projectRoot and taskId are required");
  const root = path.resolve(projectRoot);
  const manifestFile = path.resolve(root, manifestPath);
  if (!manifestFile.startsWith(`${root}${path.sep}`)) fail("bootstrap manifest must stay inside the project", "DR6151");
  const manifestLoaded = readJson(manifestFile, "bootstrap manifest");
  const manifest = manifestLoaded.value;
  if (manifest.kind !== "DesktopProjectMemoryBootstrapManifest" || manifest.projectId !== "devrelay") fail("bootstrap manifest identity is invalid", "DR6151");
  const paths = Object.fromEntries(Object.entries(manifest.paths ?? {}).map(([key, value]) => {
    const resolved = path.resolve(root, value);
    if (!resolved.startsWith(`${root}${path.sep}`)) fail(`bootstrap path ${key} escapes the project`, "DR6151");
    return [key, resolved];
  }));
  for (const key of ["projectMemoryBaseline", "currentSynopsis", "promotionProof", "graphCheckpoint"]) if (!paths[key]) fail(`bootstrap manifest lacks ${key}`, "DR6151");

  const synopsisBytes = readFileSync(paths.currentSynopsis);
  const baselineLoaded = readJson(paths.projectMemoryBaseline, "ProjectMemory baseline");
  validateProjectMemoryArtifact(baselineLoaded.value);
  const baseline = loadProjectMemoryArtifact(baselineLoaded.value, `file:///${paths.projectMemoryBaseline.replaceAll("\\", "/")}`);
  if (sha256Digest(baselineLoaded.bytes) !== baseline.ref.digest) fail("ProjectMemory baseline is not canonical exact bytes", "DR6152");
  const rendered = renderCurrentSynopsis(baselineLoaded.value);
  if (!rendered.bytes.equals(synopsisBytes)) fail("CurrentSynopsis.md drifted from the authoritative baseline", "DR6152");

  const proofLoaded = readJson(paths.promotionProof, "ProjectMemory promotion proof");
  validateProjectMemoryArtifact(proofLoaded.value);
  if (proofLoaded.value.kind !== "ProjectMemoryGatePromotionProof" || proofLoaded.value.status !== "promoted" || !sameRef(proofLoaded.value.projectMemoryBaseline, baseline.ref) || !sameRef(proofLoaded.value.synopsisProjection, rendered.ref)) fail("promotion proof does not bind the current memory pair", "DR6152");
  const proofRef = loadProjectMemoryArtifact(proofLoaded.value, `file:///${paths.promotionProof.replaceAll("\\", "/")}`).ref;
  if (!hasCanonicalFileBytes(proofLoaded.bytes, proofLoaded.value)) fail("ProjectMemory promotion proof is not canonical UTF-8/LF bytes", "DR6152");

  const graphLoaded = readJson(paths.graphCheckpoint, "TraceabilityGraph checkpoint");
  if (!hasCanonicalFileBytes(graphLoaded.bytes, graphLoaded.value) || sha256Digest(Buffer.from(canonicalJson(graphLoaded.value), "utf8")) !== baselineLoaded.value.graphCheckpoint.digest) fail("TraceabilityGraph checkpoint bytes drifted", "DR6152");
  const graphRef = structuredClone(baselineLoaded.value.graphCheckpoint);

  const body = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "DesktopProjectMemoryBootstrapReceipt",
    receiptId: `DPMBR-${canonicalJsonDigest({ taskId, baseline: baseline.ref, graph: graphRef, repositoryRevision }).slice(7, 23).toUpperCase()}`,
    projectId: baselineLoaded.value.projectId,
    taskId,
    repositoryRevision,
    loadOrder: ["current-synopsis", "project-memory-baseline", "promotion-proof", "traceability-graph"],
    projectMemoryBaseline: baseline.ref,
    synopsisProjection: rendered.ref,
    graphCheckpoint: graphRef,
    promotionProof: proofRef,
    activeMemoryIds: baselineLoaded.value.records.filter(({ status }) => ["active", "retained"].includes(status)).map(({ id }) => id).sort(),
    outcome: "pass",
  };
  const receipt = validateDesktopOrchestrationArtifact({ ...body, receiptDigest: canonicalJsonDigest(body) });
  const receiptBytes = Buffer.from(canonicalJson(receipt), "utf8");
  const receiptRef = Object.freeze({ artifactId: receipt.receiptId, digest: sha256Digest(receiptBytes), schema: "https://devrelay.dev/evidence/desktop-project-memory-bootstrap/v1", mediaType: "application/json", uri: `memory://devrelay/desktop-bootstrap/${receipt.receiptId}/${sha256Digest(receiptBytes).slice(7)}.json` });
  return Object.freeze({
    receipt: Object.freeze(receipt),
    receiptRef,
    memoryContext: Object.freeze({ bootstrapReceipt: receiptRef, projectMemoryBaseline: baseline.ref, synopsisProjection: rendered.ref, graphCheckpoint: graphRef }),
    synopsis: synopsisBytes.toString("utf8"),
  });
}
