import { canonicalJson } from "./content-digest.mjs";
import { validateArchitectureDiscoveryArtifact } from "./architecture-discovery-artifact-validator.mjs";

const VERSION = "1.0.0";

export class ArchitectureDiscoveryAnalyzerRegistryError extends Error {
  constructor(message) {
    super(`architecture discovery analyzer registry is invalid: ${message}`);
    this.name = "ArchitectureDiscoveryAnalyzerRegistryError";
    this.code = "DR4313";
  }
}

const fail = (message) => { throw new ArchitectureDiscoveryAnalyzerRegistryError(message); };
const identity = (adapter) => `${adapter?.id ?? ""}@${adapter?.version ?? ""}:${adapter?.configurationDigest ?? ""}`;

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export class ArchitectureDiscoveryAnalyzerRegistry {
  constructor(bindings = []) {
    this.portVersion = VERSION;
    this.bindings = new Map();
    for (const binding of bindings) this.register(binding);
  }

  register(binding) {
    if (binding?.portVersion !== VERSION) fail(`binding portVersion must be ${VERSION}`);
    if (typeof binding?.analyze !== "function") fail("binding requires an analyze function");
    const adapter = binding.adapter;
    if (typeof adapter?.id !== "string" || typeof adapter?.version !== "string" || !/^sha256:[0-9a-f]{64}$/.test(adapter?.configurationDigest ?? "")) fail("binding requires an exact adapter identity");
    const key = identity(adapter);
    if (this.bindings.has(key)) fail(`duplicate analyzer binding ${key}`);
    this.bindings.set(key, freeze({ portVersion:VERSION, adapter:structuredClone(adapter), analyze:binding.analyze }));
    return this;
  }

  list() {
    return [...this.bindings.values()].map(({ portVersion, adapter }) => freeze({ portVersion, adapter:structuredClone(adapter) }))
      .sort((left, right) => canonicalJson(left.adapter).localeCompare(canonicalJson(right.adapter)));
  }

  async invoke(invocation) {
    try { validateArchitectureDiscoveryArtifact(invocation); } catch (error) { fail(error.message); }
    if (invocation.kind !== "ArchitectureAnalyzerInvocation") fail("invocation must be ArchitectureAnalyzerInvocation");
    const binding = this.bindings.get(identity(invocation.adapter));
    if (!binding) fail(`optional analyzer ${identity(invocation.adapter)} is unavailable`);
    let result;
    try { result = await binding.analyze(freeze(structuredClone(invocation))); }
    catch (error) { fail(`analyzer ${identity(invocation.adapter)} failed: ${error instanceof Error ? error.message : String(error)}`); }
    try { validateArchitectureDiscoveryArtifact(result, { invocation }); }
    catch (error) { fail(`analyzer ${identity(invocation.adapter)} returned malformed or substituted output: ${error.message}`); }
    return freeze(structuredClone(result));
  }
}

export function createArchitectureDiscoveryAnalyzerRegistry(bindings = []) {
  return new ArchitectureDiscoveryAnalyzerRegistry(bindings);
}

export const ARCHITECTURE_DISCOVERY_ANALYZER_PORT_VERSION = VERSION;
