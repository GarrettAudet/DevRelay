import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Deliberately dependency-free: a fresh Desktop worktree has repository bytes
// but does not necessarily have node_modules yet.
const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const fail = (message) => { throw new Error(`desktop project memory bootstrap: ${message}`); };
const normalizeJson = (value) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("canonical JSON contains a non-finite number");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeJson(value[key])]));
  fail(`canonical JSON contains unsupported ${typeof value}`);
};
const canonicalJson = (value) => JSON.stringify(normalizeJson(value));
const sha256Digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const canonicalJsonDigest = (value) => sha256Digest(Buffer.from(canonicalJson(value), "utf8"));
const sameRef = (left, right) => left?.artifactId === right?.artifactId && left?.digest === right?.digest && left?.schema === right?.schema && left?.mediaType === right?.mediaType;
const readJson = (file, label) => {
  if (!existsSync(file)) fail(`${label} is missing`);
  const bytes = readFileSync(file);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail(`${label} is malformed`); }
  if (![canonicalJson(value), `${canonicalJson(value)}\n`].includes(bytes.toString("utf8"))) fail(`${label} is not canonical UTF-8/LF JSON`);
  return { bytes, value };
};
const contentDigestIsValid = (value) => {
  if (typeof value?.contentDigest !== "string") return false;
  const { contentDigest, ...body } = value;
  return contentDigest === canonicalJsonDigest(body);
};
const fileUri = (file) => `file:///${file.replaceAll("\\", "/")}`;
const memoryRef = (value, _bytes, file) => ({
  artifactId: value.baselineId ?? value.proofId,
  schema: value.kind === "ProjectMemoryBaseline" ? "https://devrelay.dev/artifacts/project-memory-baseline/v1" : "https://devrelay.dev/evidence/project-memory-gate-promotion/v1",
  mediaType: value.kind === "ProjectMemoryBaseline" ? "application/vnd.devrelay.project-memory-baseline+json" : "application/vnd.devrelay.project-memory-gate-promotion+json",
  digest: canonicalJsonDigest(value),
  uri: fileUri(file),
});
const inside = (root, relative, label) => {
  if (typeof relative !== "string" || relative.length === 0) fail(`bootstrap manifest lacks ${label}`);
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${root}${path.sep}`)) fail(`bootstrap path ${label} escapes the project`);
  return resolved;
};

const projectRoot = path.resolve(valueFor("--project-root") ?? process.cwd());
const taskId = valueFor("--task-id");
if (!taskId) fail("--task-id is required");
const manifestFile = inside(projectRoot, "project/project-memory-bootstrap-manifest.json", "manifest");
const { value: manifest } = readJson(manifestFile, "bootstrap manifest");
if (manifest.apiVersion !== "devrelay.dev/v1alpha1" || manifest.kind !== "DesktopProjectMemoryBootstrapManifest" || manifest.projectId !== "devrelay") fail("bootstrap manifest identity is invalid");
const files = Object.fromEntries(["projectMemoryBaseline", "currentSynopsis", "promotionProof", "graphCheckpoint"].map((key) => [key, inside(projectRoot, manifest.paths?.[key], key)]));

const baselineLoaded = readJson(files.projectMemoryBaseline, "ProjectMemory baseline");
const baseline = baselineLoaded.value;
if (baseline.apiVersion !== "devrelay.dev/v1alpha1" || baseline.kind !== "ProjectMemoryBaseline" || baseline.projectId !== manifest.projectId || !Array.isArray(baseline.records) || !contentDigestIsValid(baseline)) fail("ProjectMemory baseline contract is invalid");
const baselineRef = memoryRef(baseline, baselineLoaded.bytes, files.projectMemoryBaseline);
const active = baseline.records.filter((record) => ["active", "retained"].includes(record.status)).sort((left, right) => left.category.localeCompare(right.category, "en") || left.id.localeCompare(right.id, "en"));
const synopsisBytes = Buffer.from(["# Current Synopsis", "", `Project: ${baseline.projectId}`, `Memory baseline: ${baseline.baselineId} (${baseline.version})`, "", ...active.map((record) => `- [${record.category}] ${record.statement} (${record.id})`), ""].join("\n").normalize("NFC"), "utf8");
if (!existsSync(files.currentSynopsis) || !synopsisBytes.equals(readFileSync(files.currentSynopsis))) fail("CurrentSynopsis.md drifted from the authoritative baseline");
const synopsisDigest = sha256Digest(synopsisBytes);
const synopsisRef = { artifactId: `CURRENT-SYNOPSIS-${baseline.baselineId}`, schema: "https://devrelay.dev/artifacts/current-synopsis/v1", mediaType: "text/markdown", digest: synopsisDigest, uri: `memory://devrelay/project-memory/synopsis/${synopsisDigest.slice(7)}.md` };

const proofLoaded = readJson(files.promotionProof, "ProjectMemory promotion proof");
const proof = proofLoaded.value;
if (proof.apiVersion !== "devrelay.dev/v1alpha1" || proof.kind !== "ProjectMemoryGatePromotionProof" || proof.status !== "promoted" || !contentDigestIsValid(proof) || !sameRef(proof.projectMemoryBaseline, baselineRef) || !sameRef(proof.synopsisProjection, synopsisRef)) fail("promotion proof does not bind the current memory pair");
const proofRef = memoryRef(proof, proofLoaded.bytes, files.promotionProof);

const graphLoaded = readJson(files.graphCheckpoint, "TraceabilityGraph checkpoint");
if (canonicalJsonDigest(graphLoaded.value) !== baseline.graphCheckpoint?.digest) fail("TraceabilityGraph checkpoint bytes drifted");
const graphRef = structuredClone(baseline.graphCheckpoint);

let repositoryRevision = valueFor("--repository-revision");
if (!repositoryRevision) {
  const candidates = ["git"];
  if (process.env.USERPROFILE) candidates.push(path.join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "git", "cmd", "git.exe"));
  for (const candidate of candidates) {
    try { repositoryRevision = execFileSync(candidate, ["-C", projectRoot, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim(); break; } catch {}
  }
  repositoryRevision ??= "working-tree";
}
const receiptBody = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "DesktopProjectMemoryBootstrapReceipt",
  receiptId: `DPMBR-${canonicalJsonDigest({ taskId, baseline: baselineRef, graph: graphRef, repositoryRevision }).slice(7, 23).toUpperCase()}`,
  projectId: baseline.projectId,
  taskId,
  repositoryRevision,
  loadOrder: ["current-synopsis", "project-memory-baseline", "promotion-proof", "traceability-graph"],
  projectMemoryBaseline: baselineRef,
  synopsisProjection: synopsisRef,
  graphCheckpoint: graphRef,
  promotionProof: proofRef,
  activeMemoryIds: active.map(({ id }) => id).sort(),
  outcome: "pass",
};
const receipt = { ...receiptBody, receiptDigest: canonicalJsonDigest(receiptBody) };
const receiptBytes = Buffer.from(canonicalJson(receipt), "utf8");
const receiptDigest = sha256Digest(receiptBytes);
const receiptRef = { artifactId: receipt.receiptId, digest: receiptDigest, schema: "https://devrelay.dev/evidence/desktop-project-memory-bootstrap/v1", mediaType: "application/json", uri: `memory://devrelay/desktop-bootstrap/${receipt.receiptId}/${receiptDigest.slice(7)}.json` };
const memoryContext = { bootstrapReceipt: receiptRef, projectMemoryBaseline: baselineRef, synopsisProjection: synopsisRef, graphCheckpoint: graphRef };
process.stdout.write(`${JSON.stringify({ receipt, receiptRef, memoryContext, synopsis: synopsisBytes.toString("utf8") }, null, 2)}\n`);
