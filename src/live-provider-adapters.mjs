import { canonicalJsonDigest } from "./content-digest.mjs";
import { recordExecutionReceipt, verifyExecutionReceipt } from "./execution-receipt.mjs";
import { authorizeProviderInvocation } from "./provider-toolchain.mjs";
import { createProviderExecutionAttestation } from "./provider-execution-attestation.mjs";

export class LiveProviderAdapterError extends Error {
  constructor(message, code = "DR4860") {
    super(`live provider adapter: ${message}`);
    this.name = "LiveProviderAdapterError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new LiveProviderAdapterError(message, code); };
const immutable = (value) => Object.freeze(structuredClone(value));
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const DEFINITIONS = Object.freeze({
  openspec: Object.freeze({ capability: "openspec.requirements.gather/v1", operations: Object.freeze(["requirements.gather", "requirements.validate"]), executable: "openspec" }),
  "spec-kit": Object.freeze({ capability: "spec-kit.requirements.gather/v1", operations: Object.freeze(["requirements.gather", "requirements.validate"]), executable: "specify" }),
  structurizr: Object.freeze({ capability: "structurizr.architecture.conformance/v1", operations: Object.freeze(["architecture.validate", "architecture.inspect", "architecture.export"]), executable: "structurizr" }),
  madr: Object.freeze({ capability: "madr.decision.conformance/v1", operations: Object.freeze(["decision.render", "decision.validate"]), executable: "devrelay-madr" }),
});
const FORBIDDEN = new Set(["approval", "gate", "graph", "graphOperations", "progression", "route", "traceabilityUpdate"]);

function noAuthority(value) {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value)) for (const key of Object.keys(value)) if (FORBIDDEN.has(key)) fail(`provider output contains forbidden authority field ${key}`);
  for (const child of Object.values(value)) noAuthority(child);
}

function exactRef(value, label) {
  if (!value || typeof value.artifactId !== "string" || !value.artifactId || !digestPattern.test(value.digest)) fail(`${label} must be an exact artifact reference`);
  return structuredClone(value);
}

function commandFor(providerId, operation, authorization, request) {
  const definition = DEFINITIONS[providerId];
  if (!definition.operations.includes(operation)) fail(`${providerId} does not declare ${operation}`);
  const executable = `${authorization.projectLocalPath.replaceAll("\\", "/")}/bin/${definition.executable}`;
  const argumentsByOperation = {
    "requirements.gather": ["capability", "requirements", "--input-digest", request.digest],
    "requirements.validate": providerId === "openspec" ? ["validate", "--all", "--strict"] : ["version", "--features", "--json"],
    "architecture.validate": ["validate", "-workspace", request.workspacePath],
    "architecture.inspect": ["inspect", "-workspace", request.workspacePath, "-s", "error"],
    "architecture.export": ["export", "-workspace", request.workspacePath, "-format", request.exportFormat, "-output", request.outputPath],
    "decision.render": ["render", "--template-version", request.templateVersion, "--template", request.templatePath],
    "decision.validate": ["validate", "--template-version", request.templateVersion, "--document", request.documentPath, "--template", request.templatePath, "--source-commit", request.sourceCommit],
  };
  return { executable, arguments: argumentsByOperation[operation] };
}

export function createLiveProviderAdapter({ providerId, manifest, assessment, hostExecute, hostObserver, normalizeNative }) {
  const definition = DEFINITIONS[providerId];
  if (!definition) fail(`unknown live provider ${providerId}`);
  if (typeof hostExecute !== "function" || typeof normalizeNative !== "function") fail("hostExecute and trusted normalizeNative ports are required");
  if (!hostObserver || hostObserver.authority !== "host-trusted-observer") fail("a host-trusted observer is required");
  return Object.freeze({
    async invoke({ operation, request, grants = [] }) {
      const requestRef = exactRef(request, "request");
      const authorization = authorizeProviderInvocation({ assessment, manifest, operation });
      if (!grants.includes("process.spawn")) fail("process.spawn grant is required", "DR4861");
      const command = commandFor(providerId, operation, authorization, request);
      const effect = immutable({
        id: `PE-${canonicalJsonDigest({ providerId, operation, request: requestRef, command }).slice(7, 23).toUpperCase()}`,
        command: command.executable,
        argv: command.arguments,
        cwd: request.projectRoot,
        environmentDigest: request.environmentDigest,
        grants: ["process.spawn"],
      });
      let observed;
      try { observed = await hostExecute(immutable({ authorization, command, request: requestRef, effect })); }
      catch (error) { fail(`${providerId} execution failed: ${error instanceof Error ? error.message : String(error)}`, "DR4862"); }
      if (!observed || observed.exitCode !== 0) fail(`${providerId} returned a non-zero or missing result`, "DR4862");
      const receiptRecord = recordExecutionReceipt({ effect, observation: observed, redactions: observed.redactions ?? [] });
      verifyExecutionReceipt(receiptRecord);
      const nativeArtifacts = (observed.artifacts ?? []).map((item, index) => exactRef(item, `nativeArtifacts[${index}]`));
      if (nativeArtifacts.length === 0) fail("live execution must preserve at least one native artifact");
      const normalized = await normalizeNative(immutable({ providerId, operation, request: requestRef, nativeArtifacts, receipt: receiptRecord.receipt }));
      noAuthority(normalized);
      if (!normalized || typeof normalized !== "object") fail("trusted normalization did not return an artifact");
      const binding = { id: providerId, version: manifest.version, configurationDigest: canonicalJsonDigest({ manifest, operation }) };
      const attestation = createProviderExecutionAttestation({
        attestationId: `PEA-${receiptRecord.receipt.receiptId.slice(3)}`,
        binding,
        capability: definition.capability,
        request: { artifactId: requestRef.artifactId, digest: requestRef.digest },
        tool: { name: providerId, version: observed.toolVersion },
        command: { executable: command.executable, arguments: command.arguments, workingDirectoryDigest: request.workingDirectoryDigest },
        execution: {
          startedAt: observed.startedAt,
          completedAt: observed.completedAt,
          exitCode: observed.exitCode,
          stdoutDigest: receiptRecord.rawBundle.stdoutDigest,
          stderrDigest: receiptRecord.rawBundle.stderrDigest,
        },
        nativeArtifacts: nativeArtifacts.map(({ artifactId, digest }) => ({ artifactId, digest })),
        observer: hostObserver,
        maturity: "live-conformant",
      });
      return immutable({
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "LiveProviderCapabilityResult",
        providerId,
        operation,
        normalized,
        nativeArtifacts,
        receipt: receiptRecord.receipt,
        attestation,
        authority: "proposer-only",
      });
    },
  });
}

export const createOpenSpecLiveAdapter = (ports) => createLiveProviderAdapter({ providerId: "openspec", ...ports });
export const createSpecKitLiveAdapter = (ports) => createLiveProviderAdapter({ providerId: "spec-kit", ...ports });
export const createStructurizrLiveAdapter = (ports) => createLiveProviderAdapter({ providerId: "structurizr", ...ports });
export const createMadrLiveAdapter = (ports) => createLiveProviderAdapter({ providerId: "madr", ...ports });
