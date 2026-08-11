import { canonicalJsonDigest } from "./content-digest.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const INTERFACE_ID = "IF-DESKTOP-CAPABILITY-RESOLUTION";
const MATURITY = Object.freeze([
  "contract-defined",
  "fixture-conformant",
  "live-conformant",
  "release-ready",
  "experimental",
  "deprecated",
]);

export class ChatGptDesktopCapabilityResolutionError extends Error {
  constructor(message) {
    super(`ChatGPT Desktop capability resolution failed: ${message}`);
    this.name = "ChatGptDesktopCapabilityResolutionError";
    this.code = "DR4091";
  }
}

const fail = (message) => { throw new ChatGptDesktopCapabilityResolutionError(message); };
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const compare = (left, right) => left.localeCompare(right, "en");

function validateRef(value, label) {
  if (!value?.artifactId || !/^sha256:[0-9a-f]{64}$/u.test(value.digest ?? "")) fail(`${label} artifact reference is invalid`);
  return structuredClone(value);
}

function validateInventoryEntry(entry, kind, index) {
  if (!exactKeys(entry, ["artifact", "manifest"])) fail(`${kind} inventory entry ${index} must contain only artifact and manifest`);
  const artifact = validateRef(entry.artifact, `${kind} inventory entry ${index}`);
  const manifest = entry.manifest;
  const required = kind === "module"
    ? ["apiVersion", "kind", "moduleId", "version", "capabilities"]
    : ["apiVersion", "kind", "adapterId", "version", "module", "capabilities", "maturity"];
  if (!exactKeys(manifest, required) || manifest.apiVersion !== API_VERSION) fail(`${kind} manifest ${artifact.artifactId} has an invalid shape`);
  if (manifest.kind !== (kind === "module" ? "DesktopModuleCapabilityManifest" : "DesktopAdapterCapabilityManifest")) fail(`${kind} manifest ${artifact.artifactId} has an invalid kind`);
  const id = kind === "module" ? manifest.moduleId : manifest.adapterId;
  if (typeof id !== "string" || id.length === 0 || typeof manifest.version !== "string" || manifest.version.length === 0) fail(`${kind} manifest ${artifact.artifactId} is not version-pinned`);
  if (!Array.isArray(manifest.capabilities) || new Set(manifest.capabilities).size !== manifest.capabilities.length || manifest.capabilities.some((value) => typeof value !== "string" || value.length === 0)) fail(`${kind} manifest ${artifact.artifactId} has invalid capabilities`);
  if (canonicalJsonDigest(manifest) !== artifact.digest) fail(`${kind} manifest ${artifact.artifactId} does not match its pinned digest`);
  if (kind === "adapter") {
    if (!exactKeys(manifest.module, ["id", "version"]) || !MATURITY.includes(manifest.maturity)) fail(`adapter manifest ${artifact.artifactId} has invalid module or maturity metadata`);
  }
  return Object.freeze({ artifact: Object.freeze(artifact), manifest: Object.freeze(structuredClone(manifest)) });
}

function observedMaturity(candidates) {
  const values = new Set(candidates.map(({ manifest }) => manifest.maturity));
  if (values.has("fixture-conformant") || values.has("contract-defined")) return "fixture-only";
  if (values.has("experimental") || values.has("live-conformant")) return "experimental";
  if (values.has("deprecated")) return "deprecated";
  return "absent";
}

export function resolveChatGptDesktopCapabilities({ host, circuit, modules, adapters, policy, requiredCapabilities }) {
  if (!Array.isArray(modules) || !Array.isArray(adapters)) fail("module and adapter inventories must be arrays");
  if (!Array.isArray(requiredCapabilities) || requiredCapabilities.length === 0 || new Set(requiredCapabilities).size !== requiredCapabilities.length) fail("requiredCapabilities must be a non-empty unique array");
  const moduleInventory = modules.map((entry, index) => validateInventoryEntry(entry, "module", index));
  const adapterInventory = adapters.map((entry, index) => validateInventoryEntry(entry, "adapter", index));
  const moduleKeys = new Set();
  for (const { manifest } of moduleInventory) {
    const key = `${manifest.moduleId}\0${manifest.version}`;
    if (moduleKeys.has(key)) fail(`duplicate module manifest ${manifest.moduleId}@${manifest.version}`);
    moduleKeys.add(key);
  }
  for (const { artifact, manifest } of adapterInventory) {
    const module = moduleInventory.find((entry) => entry.manifest.moduleId === manifest.module.id && entry.manifest.version === manifest.module.version);
    if (!module) fail(`adapter ${artifact.artifactId} targets an unavailable or incompatible module version`);
    for (const capability of manifest.capabilities) if (!module.manifest.capabilities.includes(capability)) fail(`adapter ${artifact.artifactId} declares capability ${capability} outside its module contract`);
  }

  const bindings = [];
  const missing = [];
  for (const capability of [...requiredCapabilities].sort(compare)) {
    const candidates = adapterInventory.filter(({ manifest }) => manifest.capabilities.includes(capability));
    const ready = candidates.filter(({ manifest }) => manifest.maturity === "release-ready");
    if (ready.length > 1) fail(`capability ${capability} has duplicate release-ready bindings`);
    if (ready.length === 0) {
      const maturity = observedMaturity(candidates);
      missing.push({ capability, code: "missing-live-capability", message: `Required capability ${capability} has no release-ready binding (observed: ${maturity}).`, observedMaturity: maturity });
      continue;
    }
    const selected = ready[0];
    const module = moduleInventory.find((entry) => entry.manifest.moduleId === selected.manifest.module.id && entry.manifest.version === selected.manifest.module.version);
    bindings.push({ capability, module: structuredClone(module.artifact), adapter: structuredClone(selected.artifact), maturity: "release-ready" });
  }

  const inputs = {
    host: structuredClone(host),
    circuit: validateRef(circuit, "circuit"),
    modules: moduleInventory.map(({ artifact }) => structuredClone(artifact)).sort((a, b) => compare(`${a.artifactId}\0${a.digest}`, `${b.artifactId}\0${b.digest}`)),
    adapters: adapterInventory.map(({ artifact }) => structuredClone(artifact)).sort((a, b) => compare(`${a.artifactId}\0${a.digest}`, `${b.artifactId}\0${b.digest}`)),
    policy: validateRef(policy, "policy"),
    requiredCapabilities: [...requiredCapabilities].sort(compare),
  };
  const material = missing.length === 0 ? { outcome: "resolved", bindings } : { outcome: "blocked", missing };
  const outputs = { ...material, resolutionDigest: canonicalJsonDigest({ inputs, ...material }) };
  const result = { apiVersion: API_VERSION, interfaceIntentId: INTERFACE_ID, inputs, outputs };
  return Object.freeze(structuredClone(result));
}

export const CHATGPT_DESKTOP_CAPABILITY_MATURITY = MATURITY;
