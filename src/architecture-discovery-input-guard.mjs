import { canonicalJson, sha256Digest } from "./content-digest.mjs";

export class ArchitectureDiscoveryInputGuardError extends Error {
  constructor(message) {
    super(`architecture discovery input is invalid: ${message}`);
    this.name = "ArchitectureDiscoveryInputGuardError";
    this.code = "DR4311";
  }
}
const fail = (message) => { throw new ArchitectureDiscoveryInputGuardError(message); };
const digest = /^sha256:[0-9a-f]{64}$/;
const version = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;
const pathPattern = /^(?![A-Za-z]:[\\/])(?![\\/]{1,2})(?!.*(?:^|[\\/])\.\.(?:[\\/]|$)).+$/;
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }

function exactBinding(name, binding) {
  if (!binding || !binding.artifact || !binding.reference || !Buffer.isBuffer(binding.rawBytes)) fail(`${name} requires artifact, reference, and raw bytes`);
  if (!digest.test(binding.reference.digest ?? "") || sha256Digest(binding.rawBytes) !== binding.reference.digest) fail(`${name} bytes are stale or substituted`);
  let parsed;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal:true }).decode(binding.rawBytes)); } catch { fail(`${name} bytes are not valid UTF-8 JSON`); }
  if (!same(parsed, binding.artifact)) fail(`${name} object does not match its exact bytes`);
  const intrinsicId = binding.artifact.artifactId ?? binding.artifact.snapshotId ?? binding.artifact.baselineId ?? binding.artifact.stateId;
  if (intrinsicId && intrinsicId !== binding.reference.artifactId) fail(`${name} reference substitutes artifact identity`);
  return { artifactId:binding.reference.artifactId, digest:binding.reference.digest };
}
function exactAdapter(adapter) {
  if (!adapter || typeof adapter.id !== "string" || !version.test(adapter.version ?? "") || !digest.test(adapter.configurationDigest ?? "")) fail("every adapter binding must pin id, semantic version, and configuration digest");
  return { id:adapter.id, version:adapter.version, configurationDigest:adapter.configurationDigest };
}

export function bindArchitectureDiscoveryInputs({ projectOverview, projectArchitectureState, repositorySnapshot, routeDecision, sourceEntries, adapterBindings, transmission = { mode:"offline" } } = {}) {
  const projectOverviewRef = exactBinding("projectOverview", projectOverview);
  const stateRef = exactBinding("projectArchitectureState", projectArchitectureState);
  const repositoryRef = exactBinding("repositorySnapshot", repositorySnapshot);
  if (routeDecision?.selection?.operation !== "discover" || routeDecision?.state?.artifactId !== stateRef.artifactId || routeDecision.state.digest !== stateRef.digest) fail("route decision is absent, bypassed, stale, or substituted");
  if (projectArchitectureState.artifact.state !== "existing-undiscovered") fail("only existing-undiscovered state may enter discovery");
  const stateRepository = projectArchitectureState.artifact.repositorySnapshot;
  if (!stateRepository || stateRepository.artifactId !== repositoryRef.artifactId || stateRepository.digest !== repositoryRef.digest) fail("repository snapshot does not match approved project state");
  if (!Array.isArray(sourceEntries) || sourceEntries.length === 0) fail("source scope is required");
  const paths = new Set();
  for (const entry of sourceEntries) {
    if (!entry || typeof entry.path !== "string" || !pathPattern.test(entry.path) || paths.has(entry.path)) fail("source paths must be unique repository-relative paths");
    paths.add(entry.path);
    if (entry.ignored || entry.generated || entry.secretLike) fail(`${entry.path} is excluded by ignore, generated, or secret policy`);
    if (!entry.tracked && !entry.declared) fail(`${entry.path} is neither tracked nor explicitly declared`);
    if (entry.symlink || entry.submodule) fail(`${entry.path} requires separately resolved repository-boundary handling`);
  }
  if (!Array.isArray(adapterBindings) || adapterBindings.length === 0) fail("at least one exact adapter binding is required");
  const adapters = adapterBindings.map(exactAdapter);
  if (new Set(adapters.map((item) => canonicalJson(item))).size !== adapters.length) fail("duplicate adapter binding");
  if (transmission.mode !== "offline" && transmission.mode !== "external") fail("unknown source transmission mode");
  if (transmission.mode === "external") {
    const grant = transmission.grant;
    if (!grant || grant.explicit !== true || grant.sourceContent !== true || !digest.test(grant.policyDigest ?? "") || !same(grant.adapterBindings, adapters)) fail("external source transmission requires an explicit policy- and exact-adapter-bound opt-in grant");
  } else if (transmission.grant !== undefined) fail("offline execution must not carry an external transmission grant");
  return freeze({ projectOverview:projectOverviewRef, projectArchitectureState:stateRef, repositorySnapshot:repositoryRef, allowedPaths:[...paths].sort(), adapterBindings:adapters, transmission:{ mode:transmission.mode, policyDigest:transmission.grant?.policyDigest } });
}

export const guardArchitectureDiscoveryInputs = bindArchitectureDiscoveryInputs;
