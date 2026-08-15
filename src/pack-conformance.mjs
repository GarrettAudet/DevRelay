import { canonicalJsonDigest } from "./content-digest.mjs";

const NAME = /^[a-z][a-z0-9.-]{1,127}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const PERMISSIONS = new Set([
  "filesystem.read",
  "filesystem.write",
  "network.connect",
  "process.spawn",
  "secrets.read",
]);
const MATURITY = new Set([
  "contract-defined",
  "fixture-conformant",
  "live-conformant",
  "release-ready",
]);

export class PackConformanceError extends Error {
  constructor(message, code = "DR4780") {
    super(`pack conformance: ${message}`);
    this.name = "PackConformanceError";
    this.code = code;
  }
}
const fail = (message, code) => {
  throw new PackConformanceError(message, code);
};
const freeze = (value) => Object.freeze(structuredClone(value));
const unique = (values, label) => {
  if (!Array.isArray(values) || new Set(values).size !== values.length) {
    fail(`${label} must be a unique array`);
  }
  return [...values].sort();
};

export function definePackManifest(manifest) {
  if (
    !manifest ||
    manifest.kind !== "DevRelayPackManifest" ||
    !NAME.test(manifest.id ?? "") ||
    !VERSION.test(manifest.version ?? "")
  ) {
    fail("pack identity is invalid");
  }
  if (
    typeof manifest.entrypoint !== "string" ||
    !manifest.entrypoint.startsWith("./packs/") ||
    !manifest.entrypoint.endsWith(".mjs")
  ) {
    fail("pack entrypoint must use the public packs tier");
  }
  const permissionDemands = (manifest.permissionDemands ?? [])
    .map((entry) => {
      if (
        !PERMISSIONS.has(entry?.kind) ||
        !Array.isArray(entry.values) ||
        entry.values.some((value) => typeof value !== "string" || !value)
      ) {
        fail("pack permission demand is invalid");
      }
      return { kind: entry.kind, values: unique(entry.values, "permission values") };
    })
    .sort((left, right) => left.kind.localeCompare(right.kind, "en"));
  if (!MATURITY.has(manifest.maturity)) fail("pack maturity is invalid");
  if (
    !manifest.rollback ||
    manifest.rollback.strategy !== "disable-and-remove-binding" ||
    typeof manifest.rollback.instructions !== "string"
  ) {
    fail("pack rollback contract is required");
  }
  const body = {
    id: manifest.id,
    version: manifest.version,
    entrypoint: manifest.entrypoint,
    maturity: manifest.maturity,
    capabilities: unique(manifest.capabilities ?? [], "capabilities"),
    dependencies: unique(manifest.dependencies ?? [], "dependencies"),
    providerBindings: unique(manifest.providerBindings ?? [], "provider bindings"),
    permissionDemands,
    rollback: manifest.rollback,
  };
  return freeze({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "DevRelayPackManifest",
    ...body,
    manifestDigest: canonicalJsonDigest(body),
  });
}

export function evaluatePackConformance({
  manifest,
  packageExports,
  availableDependencies = [],
  availableProviders = [],
  hostGrants = [],
}) {
  const pack = definePackManifest(manifest);
  if (packageExports?.["./packs/*"] !== "./packs/*") {
    fail("package does not expose the optional packs tier", "DR4781");
  }
  const dependencies = new Set(availableDependencies);
  const providers = new Set(availableProviders);
  const grants = new Set(
    hostGrants.map(
      (entry) => `${entry.kind}:${[...(entry.values ?? [])].sort().join(",")}`,
    ),
  );
  const missingDependencies = pack.dependencies.filter((id) => !dependencies.has(id));
  const missingProviders = pack.providerBindings.filter((id) => !providers.has(id));
  const missingGrants = pack.permissionDemands.filter(
    (entry) => !grants.has(`${entry.kind}:${entry.values.join(",")}`),
  );
  const diagnostics = [
    ...missingDependencies.map((id) => ({
      code: "PACK_DEPENDENCY_UNAVAILABLE",
      subject: id,
    })),
    ...missingProviders.map((id) => ({
      code: "PACK_PROVIDER_UNAVAILABLE",
      subject: id,
    })),
    ...missingGrants.map((entry) => ({
      code: "PACK_GRANT_MISSING",
      subject: entry.kind,
    })),
  ];
  const body = {
    pack: { id: pack.id, version: pack.version, manifestDigest: pack.manifestDigest },
    outcome: diagnostics.length ? "unavailable" : "conformant",
    diagnostics,
    rollbackReady: true,
  };
  return freeze({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "PackConformanceResult",
    ...body,
    resultDigest: canonicalJsonDigest(body),
  });
}

export function scanGenericCoreIdentifiers({ files, forbiddenIdentifiers }) {
  if (!Array.isArray(files) || !Array.isArray(forbiddenIdentifiers)) {
    fail("files and forbidden identifiers are required");
  }
  const findings = [];
  for (const file of files) {
    for (const identifier of forbiddenIdentifiers) {
      if (file.content.toLowerCase().includes(identifier.toLowerCase())) {
        findings.push({ path: file.path, identifier });
      }
    }
  }
  return freeze({
    outcome: findings.length ? "failed" : "pass",
    findings: findings.sort(
      (left, right) =>
        left.path.localeCompare(right.path, "en") ||
        left.identifier.localeCompare(right.identifier, "en"),
    ),
  });
}
