import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateArchitectureDiscoveryArtifact } from "./architecture-discovery-artifact-validator.mjs";

export class ArchitectureDiscoveryNormalizationError extends Error {
  constructor(message) {
    super(`architecture discovery normalization is invalid: ${message}`);
    this.name = "ArchitectureDiscoveryNormalizationError";
    this.code = "DR4314";
  }
}

const fail = (message) => { throw new ArchitectureDiscoveryNormalizationError(message); };
const ordered = (values, key = canonicalJson) => [...values].sort((a, b) => key(a).localeCompare(key(b)));
const sameRef = (left, right) => left?.artifactId === right?.artifactId && left?.digest === right?.digest;
const digestBody = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));
const resultRef = (result) => ({
  artifactId: `architecture-analyzer-result-${result.invocationId}`,
  digest: result.resultDigest,
  schema: "https://devrelay.dev/contracts/architecture-discovery-artifacts.schema.json#/$defs/analyzerResult",
  mediaType: "application/vnd.devrelay.architecture-analyzer-result+json",
  uri: `artifact://architecture-discovery/analyzer-result/${encodeURIComponent(result.invocationId)}/${result.resultDigest.slice(7)}.json`,
});
const inventoryRef = (inventory) => ({
  artifactId: `native-repository-inventory-${inventory.invocationId}`,
  digest: inventory.inventoryDigest,
  schema: "https://devrelay.dev/contracts/architecture-discovery-artifacts.schema.json#/$defs/nativeInventory",
  mediaType: "application/vnd.devrelay.native-repository-inventory+json",
  uri: `artifact://architecture-discovery/native-inventory/${encodeURIComponent(inventory.invocationId)}/${inventory.inventoryDigest.slice(7)}.json`,
});

function validateResult(result, nativeInventory) {
  try { validateArchitectureDiscoveryArtifact(result); } catch (error) { fail(error.message); }
  if (result.kind !== "ArchitectureAnalyzerResult") fail("analyzerResults may contain only ArchitectureAnalyzerResult artifacts");
  if (!sameRef(result.repositorySnapshot, nativeInventory.repositorySnapshot) || result.nativeInventory.digest !== nativeInventory.inventoryDigest) fail(`analyzer ${result.invocationId} substitutes the repository or mandatory native inventory`);
  const evidence = new Set(result.nativeEvidence.map((item) => `${item.artifactId}:${item.digest}`));
  for (const finding of result.findings) for (const source of finding.sources) {
    if (!evidence.has(`${source.artifact.artifactId}:${source.artifact.digest}`)) fail(`finding ${finding.id} loses analyzer evidence provenance`);
  }
  if (result.status !== "completed" && result.findings.length !== 0) fail(`analyzer ${result.invocationId} returned findings with status ${result.status}`);
}

function validateInventory(inventory) {
  try { validateArchitectureDiscoveryArtifact(inventory); } catch (error) { fail(error.message); }
  if (inventory.kind !== "NativeRepositoryInventory" || inventory.status !== "completed") fail("a completed NativeRepositoryInventory is mandatory");
  const evidence = new Set(inventory.nativeEvidence.map((item) => `${item.artifactId}:${item.digest}`));
  for (const finding of inventory.findings) for (const source of finding.sources) {
    if (!evidence.has(`${source.artifact.artifactId}:${source.artifact.digest}`)) fail(`finding ${finding.id} loses native inventory provenance`);
  }
}

function observation(repositorySnapshot, finding) {
  const material = { repositorySnapshot, finding };
  const body = { apiVersion:"devrelay.dev/v1alpha1", kind:"ArchitectureObservation", observationId:`OBS-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`, ...material };
  const value = { ...body, observationDigest:digestBody(body, "observationDigest") };
  return validateArchitectureDiscoveryArtifact(value);
}

function ref(value) {
  const digest = sha256Digest(Buffer.from(canonicalJson(value), "utf8"));
  return { artifactId:value.observationId, digest, schema:"https://devrelay.dev/contracts/architecture-discovery-artifacts.schema.json#/$defs/observation", mediaType:"application/vnd.devrelay.architecture-observation+json", uri:`artifact://architecture-discovery/observation/${value.observationId}/${digest.slice(7)}.json` };
}

export function normalizeArchitectureDiscoveryObservations({ snapshotId, nativeInventory, analyzerResults = [] } = {}) {
  if (typeof snapshotId !== "string" || snapshotId.length === 0) fail("snapshotId is required");
  validateInventory(nativeInventory);
  if (!Array.isArray(analyzerResults)) fail("analyzerResults must be an array");
  for (const result of analyzerResults) validateResult(result, nativeInventory);
  const resultKeys = analyzerResults.map(result => `${result.invocationId}:${result.resultDigest}`);
  if (new Set(resultKeys).size !== resultKeys.length) fail("duplicate analyzer result");

  const allFindings = [...nativeInventory.findings, ...analyzerResults.flatMap(result => result.findings)];
  const findingKeys = allFindings.map(finding => `${finding.method}:${finding.adapter.id}:${finding.adapter.version}:${finding.adapter.configurationDigest}:${finding.id}`);
  if (new Set(findingKeys).size !== findingKeys.length) fail("duplicate finding identity");
  const observations = ordered(allFindings.map(finding => observation(nativeInventory.repositorySnapshot, finding)), value => value.observationId);

  const warnings = [];
  for (const result of ordered(analyzerResults, value => `${value.adapter.id}@${value.adapter.version}:${value.resultDigest}`)) {
    if (result.status !== "completed") warnings.push(`Optional analyzer ${result.adapter.id}@${result.adapter.version} was ${result.status}; its unavailable observation is retained by exact result and evidence references.`);
    else if (result.findings.length === 0) warnings.push(`Optional analyzer ${result.adapter.id}@${result.adapter.version} completed without findings; analyzer silence does not imply completeness.`);
  }
  for (const value of observations) if (value.finding.confidence.score < 1 || ["analyzer-inferred", "unknown"].includes(value.finding.confidence.disposition)) warnings.push(`Low-confidence observation ${value.observationId} remains observational: ${value.finding.confidence.disposition} (${value.finding.confidence.score}).`);
  const groups = new Map();
  for (const value of observations) {
    const key = `${value.finding.category}:${value.finding.subject}`;
    const entries = groups.get(key) ?? [];
    entries.push(value); groups.set(key, entries);
  }
  for (const [key, values] of ordered(groups.entries(), entry => entry[0])) {
    const statements = new Set(values.map(value => value.finding.statement));
    if (statements.size > 1) warnings.push(`Conflicting observations for ${key} are preserved: ${values.map(value => value.observationId).join(", ")}.`);
  }

  const sources = ordered(new Map(observations.flatMap(value => value.finding.sources).map(source => [canonicalJson(source), source])).values());
  const body = {
    apiVersion:"devrelay.dev/v1alpha1", kind:"CurrentArchitectureSnapshot", snapshotId,
    repositorySnapshot:nativeInventory.repositorySnapshot, nativeInventory:inventoryRef(nativeInventory),
    analyzerResults:ordered(analyzerResults.map(resultRef), value => `${value.artifactId}:${value.digest}`),
    observations:observations.map(ref), gaps:[], warnings:ordered(new Set(warnings), value => value),
    discoveryMethods:analyzerResults.length === 0 ? ["native-inventory"] : ["native-inventory", "specialized-analyzer"],
    sourceRefs:sources, authority:"observational",
  };
  const snapshot = { ...body, snapshotDigest:digestBody(body, "snapshotDigest") };
  try { validateArchitectureDiscoveryArtifact(snapshot, { nativeInventory }); } catch (error) { fail(error.message); }
  return Object.freeze({ snapshot:Object.freeze(snapshot), observations:Object.freeze(observations) });
}

export const createCurrentArchitectureSnapshot = normalizeArchitectureDiscoveryObservations;
