import { canonicalJsonDigest } from "./content-digest.mjs";

export class ProviderToolchainError extends Error {
  constructor(message, code = "DR4820") {
    super(`provider toolchain: ${message}`);
    this.name = "ProviderToolchainError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new ProviderToolchainError(message, code); };
const immutable = (value) => Object.freeze(structuredClone(value));
const digestPattern = /^sha256:[a-f0-9]{64}$/u;

function validateManifest(manifest) {
  if (!manifest || typeof manifest.providerId !== "string" || typeof manifest.version !== "string") fail("manifest requires providerId and exact version");
  if (!manifest.version || /^(?:latest|next|stable)$/iu.test(manifest.version) || /[\s~^*xX<>|]/u.test(manifest.version)) fail("manifest version must be exact and non-floating");
  if (!digestPattern.test(manifest.checksum)) fail("manifest requires an exact SHA-256 checksum");
  if (typeof manifest.projectLocalPath !== "string" || !manifest.projectLocalPath || /^[A-Za-z]:|^[/\\]/u.test(manifest.projectLocalPath)) {
    fail("provider path must be project-local and relative");
  }
  const segments = manifest.projectLocalPath.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) fail("provider path contains unsafe segments");
  if (manifest.acquisitionOwner !== "host") fail("provider acquisition must be host-owned");
  if (manifest.adapterMayDownload !== false) fail("adapters must be forbidden from downloading providers");
  if (!Array.isArray(manifest.allowedOperations) || manifest.allowedOperations.length === 0) fail("allowedOperations must be explicit");
}

export function evaluateProviderAvailability({ manifest, installation, policy }) {
  validateManifest(manifest);
  if (!policy || !Array.isArray(policy.allowedLicenses) || !Array.isArray(policy.allowedTelemetryModes)) fail("policy must declare allowed licenses and telemetry modes");
  const diagnostics = [];
  if (!installation || installation.status !== "present") diagnostics.push({ code: "PROVIDER_MISSING", severity: "error" });
  if (installation?.version !== manifest.version) diagnostics.push({ code: "PROVIDER_VERSION_MISMATCH", severity: "error" });
  if (installation?.checksum !== manifest.checksum) diagnostics.push({ code: "PROVIDER_CHECKSUM_MISMATCH", severity: "error" });
  if (installation?.projectLocalPath !== manifest.projectLocalPath) diagnostics.push({ code: "PROVIDER_PATH_MISMATCH", severity: "error" });
  if (!policy.allowedLicenses.includes(manifest.license)) diagnostics.push({ code: "PROVIDER_LICENSE_DENIED", severity: "error" });
  if (!policy.allowedTelemetryModes.includes(manifest.telemetryMode)) diagnostics.push({ code: "PROVIDER_TELEMETRY_DENIED", severity: "error" });
  const material = {
    providerId: manifest.providerId,
    version: manifest.version,
    manifestDigest: canonicalJsonDigest(manifest),
    installationDigest: canonicalJsonDigest(installation ?? { status: "absent" }),
    policyDigest: canonicalJsonDigest(policy),
    status: diagnostics.length === 0 ? "available" : "unavailable",
    diagnostics: diagnostics.sort((a, b) => a.code.localeCompare(b.code, "en")),
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProviderAvailabilityAssessment",
    assessmentId: `PA-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    ...material,
  });
}

export function createProviderAcquisitionPlan({ manifest, assessment, approval, grants = [] }) {
  validateManifest(manifest);
  if (assessment?.kind !== "ProviderAvailabilityAssessment") fail("availability assessment is required");
  if (assessment.manifestDigest !== canonicalJsonDigest(manifest)) fail("availability assessment is stale", "DR4822");
  if (assessment.status === "available") {
    return immutable({ outcome: "already-available", providerId: manifest.providerId, version: manifest.version, acquisitionRequired: false });
  }
  if (!approval || approval.decision !== "approve" || approval.manifestDigest !== assessment.manifestDigest) {
    fail("first provider acquisition requires exact manifest approval", "DR4824");
  }
  const networkGrant = grants.some(({ kind, values = [] }) => kind === "network.connect" && values.includes(approval.source));
  if (!networkGrant) fail("provider acquisition requires an explicit source-bound network.connect grant", "DR4825");
  const material = {
    providerId: manifest.providerId,
    version: manifest.version,
    checksum: manifest.checksum,
    projectLocalPath: manifest.projectLocalPath,
    source: approval.source,
    approvalId: approval.approvalId,
    networkGrant: { kind: "network.connect", value: approval.source },
    acquisitionOwner: "host",
    adapterMayDownload: false,
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ProviderAcquisitionPlan",
    planId: `PAP-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    outcome: "acquisition-authorized",
    acquisitionRequired: true,
    ...material,
    planDigest: canonicalJsonDigest(material),
  });
}

export function resolveProviderBinding({ assessment, manifest, operation, fallback }) {
  if (assessment?.status === "available") {
    return immutable({ outcome: "provider", binding: authorizeProviderInvocation({ assessment, manifest, operation }) });
  }
  if (fallback?.mode === "native" && fallback.authorized === true && fallback.operation === operation) {
    return immutable({ outcome: "native-fallback", providerId: manifest.providerId, operation, rationale: fallback.rationale });
  }
  return immutable({ outcome: "unavailable", providerId: manifest.providerId, operation, diagnostics: structuredClone(assessment?.diagnostics ?? []) });
}

export function authorizeProviderInvocation({ assessment, manifest, operation }) {
  validateManifest(manifest);
  if (assessment?.kind !== "ProviderAvailabilityAssessment" || assessment.status !== "available") {
    fail("provider is not available", "DR4821");
  }
  if (assessment.manifestDigest !== canonicalJsonDigest(manifest)) fail("availability assessment is stale", "DR4822");
  if (!manifest.allowedOperations.includes(operation)) fail(`operation ${operation} is not allowed`, "DR4823");
  return immutable({
    providerId: manifest.providerId,
    version: manifest.version,
    operation,
    projectLocalPath: manifest.projectLocalPath,
    checksum: manifest.checksum,
    networkAllowed: false,
    acquisitionAllowed: false,
  });
}
