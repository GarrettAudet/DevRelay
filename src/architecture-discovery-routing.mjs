import { canonicalJson, sha256Digest } from "./content-digest.mjs";
import { validateArchitectureArtifact } from "./architecture-artifact-validator.mjs";

export class ArchitectureDiscoveryRoutingError extends Error {
  constructor(message) {
    super(`architecture discovery route is invalid: ${message}`);
    this.name = "ArchitectureDiscoveryRoutingError";
    this.code = "DR4310";
  }
}

const fail = (message) => { throw new ArchitectureDiscoveryRoutingError(message); };

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function loadExactState({ projectArchitectureState, projectArchitectureStateRef, projectArchitectureStateBytes }) {
  if (!Buffer.isBuffer(projectArchitectureStateBytes)) fail("project architecture state requires exact raw bytes");
  if (!projectArchitectureStateRef || projectArchitectureStateRef.digest !== sha256Digest(projectArchitectureStateBytes)) fail("project architecture state bytes are stale or substituted");
  let loaded;
  try { loaded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(projectArchitectureStateBytes)); }
  catch { fail("project architecture state bytes are not valid UTF-8 JSON"); }
  if (canonicalJson(loaded) !== canonicalJson(projectArchitectureState)) fail("project architecture state object does not match its exact bytes");
  try { validateArchitectureArtifact(loaded); }
  catch (error) { fail(error.message); }
  const intrinsicId = loaded.stateId ?? loaded.artifactId;
  if (intrinsicId && projectArchitectureStateRef.artifactId !== intrinsicId) fail("project architecture state reference substitutes artifact identity");
  return loaded;
}

export function selectArchitectureDiscoveryRoute(input = {}) {
  const state = loadExactState(input);
  const requestedOperation = input.requestedOperation;
  if (requestedOperation !== undefined && requestedOperation !== "discover") fail("caller attempted to select an undeclared discovery operation");
  const discover = state.state === "existing-undiscovered";
  if (requestedOperation === "discover" && !discover) fail("caller attempted to force discovery for project state that must bypass it");
  const reasons = {
    "greenfield-unbaselined": "GREENFIELD_BYPASSES_DISCOVERY",
    "existing-undiscovered": "EXISTING_UNDISCOVERED_REQUIRES_DISCOVERY",
    "existing-discovered-unbaselined": "CURRENT_SNAPSHOT_BYPASSES_DISCOVERY",
    baselined: "ARCHITECTURE_BASELINE_BYPASSES_DISCOVERY",
  };
  if (!reasons[state.state]) fail(`unsupported project architecture state ${state.state}`);
  return freeze({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ArchitectureDiscoveryRouteDecision",
    state: { artifactId: input.projectArchitectureStateRef.artifactId, digest: input.projectArchitectureStateRef.digest },
    reasonCode: reasons[state.state],
    selection: discover ? { kind: "operation", operation: "discover" } : { kind: "bypass" },
  });
}

export const routeArchitectureDiscovery = selectArchitectureDiscoveryRoute;
