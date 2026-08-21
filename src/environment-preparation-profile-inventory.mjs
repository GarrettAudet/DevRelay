import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import {
  ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS,
  validateEnvironmentPreparationArtifact,
  withEnvironmentPreparationContentDigest,
} from "./environment-preparation-artifact-validator.mjs";

const API = "devrelay.dev/v1alpha1";
const EXECUTABLE_KINDS = new Set([
  "shell",
  "runtime",
  "package-manager",
  "sdk",
  "tool",
]);

export class EnvironmentPreparationInventoryError extends Error {
  constructor(message, code = "DR5410") {
    super(`environment preparation inventory failed: ${message}`);
    this.name = "EnvironmentPreparationInventoryError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new EnvironmentPreparationInventoryError(message, code);
};
const ordered = (values, key) =>
  [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
const fullRef = (artifactId, contract, digest) => ({
  artifactId,
  schema: contract.schema,
  mediaType: contract.mediaType,
  digest,
  uri: `memory://devrelay/environment-preparation/${encodeURIComponent(artifactId)}/${digest.slice(7)}.json`,
});

function artifactRef(value) {
  const contract = ENVIRONMENT_PREPARATION_ARTIFACT_CONTRACTS[value.kind];
  const artifactId =
    value.profileSetId ?? value.inventoryId ?? value.planId ?? value.receiptId ??
    value.candidateId ?? value.baselineId ?? value.approvalId ?? value.proofId;
  return fullRef(artifactId, contract, value.contentDigest);
}

function validateGlobalChecks(profiles) {
  const seen = new Set();
  for (const profile of profiles) {
    for (const check of profile.checks) {
      if (seen.has(check.id)) fail(`check identity ${check.id} is ambiguous across profiles`);
      seen.add(check.id);
    }
  }
}

export function resolveEnvironmentProfileSet({
  profileSetId,
  version,
  repository,
  hostProfile,
  projectProfiles,
  sourceRefs,
} = {}) {
  if (hostProfile?.layer !== "devrelay-host") fail("hostProfile must use devrelay-host layer");
  if (!Array.isArray(projectProfiles) || projectProfiles.length === 0) {
    fail("at least one named project-target profile is required");
  }
  if (projectProfiles.some(({ layer }) => layer !== "project-target")) {
    fail("every project profile must use project-target layer");
  }
  const profiles = ordered(
    [hostProfile, ...projectProfiles].map((profile) => ({
      ...structuredClone(profile),
      checks: ordered(profile.checks, ({ id }) => id),
    })),
    ({ layer, id }) => `${layer === "devrelay-host" ? "0" : "1"}:${id}`,
  );
  validateGlobalChecks(profiles);
  const result = withEnvironmentPreparationContentDigest({
    apiVersion: API,
    kind: "EnvironmentProfileSet",
    profileSetId,
    version,
    repository: structuredClone(repository),
    profiles,
    sourceRefs: ordered(sourceRefs, ({ role, jsonPointer = "" }) => `${role}:${jsonPointer}`),
  });
  return validateEnvironmentPreparationArtifact(result);
}

export function routeEnvironmentPreparationOperation({
  environmentBaseline,
  readinessReceipt,
  driftDetected = false,
} = {}) {
  if (driftDetected && !environmentBaseline) {
    fail("drift cannot be routed without an approved environment baseline", "DR5411");
  }
  if (!environmentBaseline) return "establish-environment";
  if (driftDetected) return "remediate-drift";
  if (!readinessReceipt) return "prepare-frontier";
  return "revalidate-frontier";
}

function semver(value) {
  const match = String(value ?? "").match(/(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)(?:[^0-9]|$)/u);
  return match ? match.slice(1).map(Number) : undefined;
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function satisfiesConstraint(value, constraint) {
  if (!constraint || constraint === "present") return value !== undefined && value !== false;
  if (constraint.startsWith(">=")) {
    const actual = semver(value);
    const expected = semver(constraint.slice(2));
    return actual && expected ? compareVersion(actual, expected) >= 0 : undefined;
  }
  if (constraint.startsWith("=")) return String(value) === constraint.slice(1);
  return String(value).toLowerCase() === constraint.toLowerCase();
}

function guardedProjectPath(repositoryRoot, capability) {
  if (isAbsolute(capability)) fail(`filesystem check ${capability} must be project-relative`);
  const absolute = resolve(repositoryRoot, capability);
  const outside = relative(repositoryRoot, absolute);
  if (outside === ".." || outside.startsWith(`..\\`) || outside.startsWith("../")) {
    fail(`filesystem check ${capability} escapes the repository root`);
  }
  return absolute;
}

function commandObservation({ command, args, spawn }) {
  const started = process.hrtime.bigint();
  const result = spawn(command, args, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  if (result.error?.code === "ENOENT") {
    return { status: "fail", value: "unavailable", durationMs, evidence: { command, args, exitCode: null, unavailable: true } };
  }
  if (result.error) {
    return { status: "unknown", durationMs, diagnostic: result.error.message, evidence: { command, args, exitCode: null, errorCode: result.error.code ?? "unknown" } };
  }
  const output = String(result.stdout || result.stderr || "").trim().split(/\r?\n/u)[0].slice(0, 512);
  return {
    status: result.status === 0 ? "pass" : "fail",
    value: output || `exit:${result.status}`,
    durationMs,
    evidence: { command, args, exitCode: result.status, output },
  };
}

export function createNativeWindowsEnvironmentHost({
  platform = process.platform,
  architecture = process.arch,
  environment = process.env,
  repositoryRoot = process.cwd(),
  attestations = {},
  spawn = spawnSync,
  pathExists = existsSync,
  maturity = "live-conformant",
} = {}) {
  if (platform !== "win32") fail(`native Windows inventory cannot attest host platform ${platform}`, "DR5412");
  return Object.freeze({
    platform,
    architecture,
    repositoryRoot,
    maturity,
    observe(check) {
      if (check.observationKind === "os") return { status: "pass", value: platform, durationMs: 0, evidence: { platform } };
      if (check.observationKind === "architecture") return { status: "pass", value: architecture, durationMs: 0, evidence: { architecture } };
      if (check.observationKind === "environment-variable") {
        const present = Object.hasOwn(environment, check.capability) && environment[check.capability] !== "";
        return { status: present ? "pass" : "fail", present, durationMs: 0, evidence: { name: check.capability, present } };
      }
      if (check.observationKind === "filesystem") {
        const path = guardedProjectPath(repositoryRoot, check.capability);
        const present = pathExists(path);
        return { status: present ? "pass" : "fail", value: present, durationMs: 0, evidence: { relativePath: check.capability, present } };
      }
      if (check.observationKind === "attestation") {
        const attestation = attestations[check.capability];
        if (!attestation) return { status: "fail", value: "unavailable", durationMs: 0, evidence: { attestationId: check.capability, available: false } };
        return { status: "pass", value: attestation.version ?? attestation.digest, expiresAt: attestation.expiresAt, durationMs: 0, evidence: { attestationId: check.capability, digest: attestation.digest, expiresAt: attestation.expiresAt } };
      }
      if (check.observationKind === "service") {
        return commandObservation({ command: "sc.exe", args: ["query", check.capability], spawn });
      }
      if (EXECUTABLE_KINDS.has(check.observationKind)) {
        return commandObservation({ command: check.capability, args: ["--version"], spawn });
      }
      return { status: "unknown", durationMs: 0, diagnostic: `unsupported observation kind ${check.observationKind}`, evidence: { observationKind: check.observationKind } };
    },
  });
}

function expiresAt(observedAt, freshnessSeconds) {
  if (freshnessSeconds === 0) return undefined;
  return new Date(Date.parse(observedAt) + freshnessSeconds * 1000).toISOString();
}

function rawEvidence(check, observation, observedAt) {
  const value = {
    apiVersion: API,
    kind: "EnvironmentRawObservationReceipt",
    checkId: check.id,
    observationKind: check.observationKind,
    capability: check.capability,
    observedAt,
    commandFingerprint: canonicalJsonDigest({ kind: check.observationKind, capability: check.capability, offline: true }),
    result: observation.evidence,
  };
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  const digest = sha256Digest(bytes);
  return {
    value,
    bytes,
    ref: {
      artifactId: `EP-RAW-${canonicalJsonDigest({ checkId: check.id, observedAt }).slice(7, 23).toUpperCase()}`,
      schema: "https://devrelay.dev/evidence/environment-raw-observation/v1",
      mediaType: "application/vnd.devrelay.environment-raw-observation+json",
      digest,
      uri: `memory://devrelay/environment-preparation/raw/${digest.slice(7)}.json`,
    },
  };
}

export function createNativeWindowsEnvironmentInventory({
  inventoryId,
  profileSet,
  profileSetRef = artifactRef(profileSet),
  repository = profileSet?.repository,
  host,
  observedAt,
  sourceRefs,
} = {}) {
  validateEnvironmentPreparationArtifact(profileSet, { ref: profileSetRef });
  if (!host || host.platform !== "win32" || typeof host.observe !== "function") {
    fail("a native Windows observation host is required", "DR5412");
  }
  if (!Number.isFinite(Date.parse(observedAt))) fail("observedAt must be an exact UTC timestamp");
  const checks = ordered(profileSet.profiles.flatMap(({ checks }) => checks), ({ id }) => id);
  validateGlobalChecks(profileSet.profiles);
  const evidence = [];
  const diagnostics = [];
  const observations = checks.map((check) => {
    let observed;
    try {
      observed = host.observe(check);
    } catch (error) {
      observed = { status: "unknown", durationMs: 0, diagnostic: error instanceof Error ? error.message : String(error), evidence: { error: "host-observation-failed" } };
    }
    const receipt = rawEvidence(check, observed, observedAt);
    evidence.push(receipt);
    const expired = observed.expiresAt && observed.expiresAt <= observedAt;
    const statusByConstraint = observed.status === "pass" ? satisfiesConstraint(observed.value ?? observed.present, check.constraint) : undefined;
    const status = expired ? "fail" : statusByConstraint === false ? "fail" : statusByConstraint === undefined && observed.status === "pass" && check.constraint ? "unknown" : observed.status;
    if (status === "unknown") diagnostics.push({ code: "DR5413", severity: check.required ? "error" : "warning", message: observed.diagnostic ?? `constraint ${check.constraint} could not be evaluated`, checkId: check.id });
    const secret = check.observationKind === "environment-variable";
    return {
      checkId: check.id,
      status,
      sensitivity: secret ? "secret-presence" : "public",
      ...(secret ? { present: Boolean(observed.present) } : { value: observed.value ?? status }),
      observedAt,
      ...(observed.expiresAt ? { expiresAt: observed.expiresAt } : expiresAt(observedAt, check.freshnessSeconds) ? { expiresAt: expiresAt(observedAt, check.freshnessSeconds) } : {}),
      commandFingerprint: receipt.value.commandFingerprint,
      durationMs: observed.durationMs ?? 0,
      rawEvidence: receipt.ref,
    };
  });
  const adapter = { id: "native.windows-environment-inventory", version: "1.0.0", maturity: host.maturity ?? "fixture-conformant" };
  const fingerprint = canonicalJsonDigest({
    repository,
    profileSet: profileSetRef,
    adapter,
    facts: observations.map(({ checkId, status, sensitivity, value, present }) => ({ checkId, status, sensitivity, ...(sensitivity === "secret-presence" ? { present } : { value }) })),
  });
  const inventory = withEnvironmentPreparationContentDigest({
    apiVersion: API,
    kind: "EnvironmentInventory",
    inventoryId,
    profileSet: structuredClone(profileSetRef),
    repository: structuredClone(repository),
    adapter,
    observations,
    diagnostics,
    fingerprint,
    sourceRefs: ordered(sourceRefs, ({ role, jsonPointer = "" }) => `${role}:${jsonPointer}`),
  });
  validateEnvironmentPreparationArtifact(inventory, { profileSet });
  return Object.freeze({ inventory, inventoryRef: artifactRef(inventory), rawEvidence: Object.freeze(evidence) });
}

export function detectEnvironmentInventoryDrift({ baselineFingerprint, inventory } = {}) {
  validateEnvironmentPreparationArtifact(inventory);
  return Object.freeze({
    driftDetected: baselineFingerprint !== inventory.fingerprint,
    baselineFingerprint,
    currentFingerprint: inventory.fingerprint,
  });
}
export function createEnvironmentInventoryCheckpointController({ adapter, checkpoints } = {}) {
  if (typeof adapter !== "function") fail("inventory checkpoint controller requires an adapter");
  if (!checkpoints || typeof checkpoints.get !== "function" || typeof checkpoints.put !== "function") {
    fail("inventory checkpoint controller requires an immutable checkpoint store");
  }
  return Object.freeze({
    async execute(request) {
      const invocationFingerprint = canonicalJsonDigest({
        inventoryId: request?.inventoryId,
        profileSetDigest: request?.profileSet?.contentDigest,
        profileSetRef: request?.profileSetRef ?? artifactRef(request?.profileSet),
        repository: request?.repository ?? request?.profileSet?.repository,
        observedAt: request?.observedAt,
        adapterConfigurationDigest: request?.adapterConfigurationDigest,
      });
      const key = `environment-inventory:${request?.inventoryId}`;
      const existing = await checkpoints.get(key);
      if (existing) {
        if (existing.invocationFingerprint !== invocationFingerprint) {
          fail("inventory checkpoint fingerprint differs from the requested invocation", "DR5414");
        }
        return Object.freeze({ ...structuredClone(existing.result), invocationFingerprint, replayed: true, adapterCalls: 0 });
      }
      const result = await adapter(request);
      validateEnvironmentPreparationArtifact(result?.inventory, { profileSet: request.profileSet });
      const checkpoint = Object.freeze({ invocationFingerprint, result: structuredClone(result) });
      await checkpoints.put(key, checkpoint);
      return Object.freeze({ ...result, invocationFingerprint, replayed: false, adapterCalls: 1 });
    },
  });
}