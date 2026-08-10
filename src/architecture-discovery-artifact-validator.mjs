import { readFileSync } from "node:fs";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

const schema = JSON.parse(readFileSync(new URL("../contracts/architecture-discovery-artifacts.schema.json", import.meta.url), "utf8"));
const validator = compileArtifactSchema(schema);

export const ARCHITECTURE_DISCOVERY_ARTIFACT_KINDS = Object.freeze([
  "RepositoryInventoryInvocation", "NativeRepositoryInventory", "ArchitectureAnalyzerInvocation",
  "ArchitectureAnalyzerResult", "ArchitectureObservation", "ArchitectureDiscoveryGap",
  "CurrentArchitectureSnapshot", "ArchitectureDiscoveryCheckpoint", "ArchitectureDiscoveryTraceabilityInput"
]);
export class ArchitectureDiscoveryArtifactValidationError extends Error {
  constructor(message) { super(`architecture discovery artifact is invalid: ${message}`); this.name = "ArchitectureDiscoveryArtifactValidationError"; this.code = "DR4300"; }
}
const fail = message => { throw new ArchitectureDiscoveryArtifactValidationError(message); };
const digestFields = Object.freeze({ RepositoryInventoryInvocation:"invocationFingerprint", NativeRepositoryInventory:"inventoryDigest", ArchitectureAnalyzerInvocation:"invocationFingerprint", ArchitectureAnalyzerResult:"resultDigest", ArchitectureObservation:"observationDigest", ArchitectureDiscoveryGap:"gapDigest", CurrentArchitectureSnapshot:"snapshotDigest", ArchitectureDiscoveryCheckpoint:"checkpointDigest", ArchitectureDiscoveryTraceabilityInput:"traceabilityDigest" });
const bodyDigest = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));
const sameRef = (left, right) => left?.artifactId === right?.artifactId && left?.digest === right?.digest;
const sameAdapter = (left, right) => left?.id === right?.id && left?.version === right?.version && left?.configurationDigest === right?.configurationDigest;
const forbiddenAuthority = new Set(["architectureBaseline", "architectureProposal", "approvedDecision", "approval", "gateDecision", "graphMutation", "graphOperations", "nextOperation", "progression", "routeDecision", "workflowAuthority"]);
function rejectAuthority(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenAuthority.has(key)) fail(`${key} is forbidden workflow or intended-design authority`);
    rejectAuthority(child);
  }
}

export function validateArchitectureDiscoveryArtifact(value, context = {}) {
  if (!validator(value)) fail(validationDetail(validator));
  if (!ARCHITECTURE_DISCOVERY_ARTIFACT_KINDS.includes(value.kind)) fail(`unsupported kind ${value?.kind}`);
  rejectAuthority(value);
  const field = digestFields[value.kind];
  if (value[field] !== bodyDigest(value, field)) fail(`${field} does not bind canonical material`);
  if (value.kind === "NativeRepositoryInventory" && context.invocation) {
    const invocation = context.invocation;
    if (invocation.kind !== "RepositoryInventoryInvocation" || value.invocationId !== invocation.invocationId || value.invocationFingerprint !== invocation.invocationFingerprint || !sameRef(value.repositorySnapshot, invocation.repositorySnapshot) || !sameAdapter(value.adapter, invocation.adapter)) fail("native inventory substitutes its exact invocation, repository, or adapter binding");
    if (value.findings.some(finding => finding.method !== "native-inventory" || !sameAdapter(finding.adapter, invocation.adapter))) fail("native inventory findings must retain the exact native adapter identity");
  }
  if (value.kind === "ArchitectureAnalyzerInvocation" && context.nativeInventory) {
    if (!sameRef(value.repositorySnapshot, context.nativeInventory.repositorySnapshot) || value.nativeInventory.digest !== context.nativeInventory.inventoryDigest) fail("analyzer invocation substitutes the native inventory or repository");
  }
  if (value.kind === "ArchitectureAnalyzerResult" && context.invocation) {
    const invocation = context.invocation;
    if (invocation.kind !== "ArchitectureAnalyzerInvocation" || value.invocationId !== invocation.invocationId || value.invocationFingerprint !== invocation.invocationFingerprint || !sameRef(value.repositorySnapshot, invocation.repositorySnapshot) || !sameRef(value.nativeInventory, invocation.nativeInventory) || !sameAdapter(value.adapter, invocation.adapter)) fail("analyzer result substitutes its bounded invocation inputs or adapter");
    if (value.findings.some(finding => finding.method !== "specialized-analyzer" || !sameAdapter(finding.adapter, invocation.adapter))) fail("analyzer findings must retain the exact analyzer adapter identity");
  }
  if (value.kind === "CurrentArchitectureSnapshot" && context.nativeInventory) {
    if (value.nativeInventory.digest !== context.nativeInventory.inventoryDigest || !sameRef(value.repositorySnapshot, context.nativeInventory.repositorySnapshot)) fail("snapshot substitutes the mandatory native inventory or repository");
    if (value.discoveryMethods[0] !== "native-inventory") fail("snapshot must record native inventory as the first discovery method");
  }
  if (value.kind === "ArchitectureDiscoveryCheckpoint" && context.invocation) {
    if (value.invocationId !== context.invocation.invocationId || value.invocationFingerprint !== context.invocation.invocationFingerprint || !sameRef(value.repositorySnapshot, context.invocation.repositorySnapshot) || !sameAdapter(value.adapter, context.invocation.adapter)) fail("checkpoint substitutes invocation, repository, or adapter identity");
  }
  return value;
}
