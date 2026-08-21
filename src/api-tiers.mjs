import { canonicalJsonDigest } from "./content-digest.mjs";

const ROOT_EXPORTS = Object.freeze(["conclude", "createDevRelay", "createLocalHost", "defineModule", "definePlugin", "inspect", "resume", "run", "verify"]);
export class ApiTierError extends Error {
  constructor(message, code = "DR4750") { super(`API tiers: ${message}`); this.name = "ApiTierError"; this.code = code; }
}
const fail = (message, code) => { throw new ApiTierError(message, code); };
const freeze = (value) => Object.freeze(structuredClone(value));

export function createApiTierManifest({ packageExports, compatibilityWindow = "0.11.x-prerelease" }) {
  if (!packageExports || packageExports["."] !== "./src/root.mjs" || packageExports["./advanced"] !== "./src/index.mjs" || packageExports["./compat/v1"] !== "./src/compat-v1.mjs" || packageExports["./packs/*"] !== "./packs/*") {
    fail("package export map does not expose the required root, advanced, and compat/v1 tiers");
  }
  const body = {
    interfaceIntentId: "IF-SIM-API-TIERS",
    root: { path: ".", exports: [...ROOT_EXPORTS], support: "stable-facade" },
    advanced: { path: "./advanced", support: "explicit-advanced-contracts" },
    packs: { pathPattern: "./packs/*", support: "optional-conformant-only" },
    compatibility: { path: "./compat/v1", deprecated: true, window: compatibilityWindow, removal: "next-prerelease-major", migration: "docs/migrations/compat-v1-to-facade.md" },
  };
  return freeze({ apiVersion: "devrelay.dev/v1alpha1", kind: "ApiTierManifest", ...body, manifestDigest: canonicalJsonDigest(body) });
}

export function verifyApiTierExports({ manifest, rootExports, packageExports }) {
  if (manifest?.kind !== "ApiTierManifest") fail("ApiTierManifest is required");
  const observed = [...rootExports].sort();
  if (JSON.stringify(observed) !== JSON.stringify([...ROOT_EXPORTS])) fail("root export inventory drifted", "DR4751");
  const expected = createApiTierManifest({ packageExports, compatibilityWindow: manifest.compatibility.window });
  if (expected.manifestDigest !== manifest.manifestDigest) fail("API tier manifest drifted", "DR4751");
  return true;
}

export function diagnoseForbiddenImport(specifier) {
  if (typeof specifier !== "string") fail("import specifier is required");
  if (specifier === "devrelay" || specifier === "devrelay/advanced" || specifier === "devrelay/compat/v1" || specifier.startsWith("devrelay/packs/")) return null;
  if (specifier.startsWith("devrelay/src/") || specifier.startsWith("devrelay/internal/")) return freeze({ code: "DR4752", specifier, disposition: "forbidden-internal-import", replacement: "devrelay/advanced" });
  return freeze({ code: "DR4753", specifier, disposition: "undeclared-package-subpath" });
}

export { ROOT_EXPORTS as SUPPORTED_ROOT_EXPORTS };

