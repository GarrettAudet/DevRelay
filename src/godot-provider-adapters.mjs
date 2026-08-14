import { canonicalJsonDigest } from "./content-digest.mjs";
import { recordExecutionReceipt, verifyExecutionReceipt } from "./execution-receipt.mjs";

export class GodotProviderAdapterError extends Error {
  constructor(message, code = "DR4870") {
    super(`Godot provider adapter: ${message}`);
    this.name = "GodotProviderAdapterError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new GodotProviderAdapterError(message, code); };
const immutable = (value) => Object.freeze(structuredClone(value));
const exactVersion = /^\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?$/u;
const OPERATIONS = Object.freeze({
  inspect: "godot.inspect",
  input: "godot.input",
  run: "godot.run",
  screenshot: "godot.screenshot",
  test: "godot.test",
  write: "godot.write",
});
const STAGES = Object.freeze(["export", "flake", "focused", "full", "fuzz", "junit", "scene", "smoke", "soak"]);

function safeProjectPath(path, label) {
  if (typeof path !== "string" || !path || path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/u.test(path)) fail(`${label} must be project-relative`);
  if (path.split("/").some((segment) => !segment || segment === "." || segment === "..")) fail(`${label} contains unsafe segments`);
  return path;
}

function exactVersions(godotVersion, providerVersion) {
  if (!exactVersion.test(godotVersion) || !exactVersion.test(providerVersion)) fail("Godot and provider versions must be exact and pinned");
}

function compatible(godotVersion, gdunitVersion) {
  const godot = godotVersion.split(".").map(Number);
  const gdunitMajor = Number(gdunitVersion.split(".")[0]);
  if (godot[0] !== 4) return false;
  if (gdunitMajor >= 6) return godot[1] >= 5;
  if (gdunitMajor === 5) return godot[1] >= 3;
  if (gdunitMajor === 4) return godot[1] >= 1;
  return false;
}

export function createGodotMcpAdapter({ hostCall }) {
  if (typeof hostCall !== "function") fail("hostCall port is required");
  return Object.freeze({
    async invoke(request) {
      const requiredGrant = OPERATIONS[request?.operation];
      if (!requiredGrant) fail(`unsupported MCP operation ${request?.operation}`);
      exactVersions(request.godotVersion, request.providerVersion);
      safeProjectPath(request.projectPath, "projectPath");
      if (request.targetPath !== undefined) safeProjectPath(request.targetPath, "targetPath");
      if (!Array.isArray(request.grants) || !request.grants.includes(requiredGrant)) fail(`missing explicit ${requiredGrant} grant`, "DR4871");
      const effect = immutable({
        id: `GMCP-${canonicalJsonDigest(request).slice(7, 23).toUpperCase()}`,
        command: "godot-ai-mcp",
        argv: [request.operation, request.targetPath ?? request.projectPath],
        cwd: request.projectPath,
        environmentDigest: request.environmentDigest,
        grants: [requiredGrant],
      });
      let observation;
      try { observation = await hostCall(immutable({ request: structuredClone(request), requiredGrant, effect })); }
      catch (error) { fail(`MCP call failed: ${error instanceof Error ? error.message : String(error)}`, "DR4872"); }
      if (!observation || observation.exitCode !== 0 || !observation.structuredMcpBytes) fail("MCP call did not return a successful structured observation", "DR4872");
      const artifacts = observation.artifacts ?? [];
      if (request.operation === "screenshot" && !artifacts.some((item) => item.mediaType?.startsWith("image/"))) fail("screenshot operation requires an image receipt");
      if (request.operation === "input" && !artifacts.some((item) => item.role === "input-receipt")) fail("input operation requires an exact input receipt");
      const receipt = recordExecutionReceipt({ effect, observation, redactions: observation.redactions ?? [] });
      verifyExecutionReceipt(receipt);
      return immutable({
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "GodotMcpOperationResult",
        operation: request.operation,
        provider: { id: "godot-ai", version: request.providerVersion },
        godotVersion: request.godotVersion,
        receipt: receipt.receipt,
        nativeArtifacts: structuredClone(artifacts),
        authority: "proposer-only",
      });
    },
  });
}

export function createGdUnit4VerificationAdapter({ hostExecute }) {
  if (typeof hostExecute !== "function") fail("hostExecute port is required");
  return Object.freeze({
    async invoke(request) {
      exactVersions(request?.godotVersion, request?.gdunitVersion);
      if (!compatible(request.godotVersion, request.gdunitVersion)) fail("Godot and GdUnit4 versions are incompatible", "DR4873");
      safeProjectPath(request.projectPath, "projectPath");
      if (!Array.isArray(request.stages) || request.stages.length === 0 || new Set(request.stages).size !== request.stages.length || request.stages.some((stage) => !STAGES.includes(stage))) fail("verification stages must be an explicit unique supported set");
      const orderedStages = [...request.stages].sort();
      const results = [];
      for (const stage of orderedStages) {
        const effect = immutable({
          id: `GDU-${canonicalJsonDigest({ requestId: request.requestId, stage }).slice(7, 23).toUpperCase()}`,
          command: "gdunit4",
          argv: [stage, "--godot", request.godotVersion, "--gdunit", request.gdunitVersion],
          cwd: request.projectPath,
          environmentDigest: request.environmentDigest,
          grants: ["process.spawn"],
        });
        let observation;
        try { observation = await hostExecute(immutable({ request: structuredClone(request), stage, effect })); }
        catch (error) { fail(`${stage} execution failed: ${error instanceof Error ? error.message : String(error)}`, "DR4874"); }
        const receipt = recordExecutionReceipt({ effect, observation, redactions: observation.redactions ?? [] });
        verifyExecutionReceipt(receipt);
        const status = observation.exitCode === 0 ? "pass" : "fail";
        const artifacts = observation.artifacts ?? [];
        if (stage === "junit" && !artifacts.some((item) => item.mediaType === "application/junit+xml")) fail("JUnit stage requires an exact JUnit XML artifact");
        if (["export", "smoke"].includes(stage) && artifacts.length === 0) fail(`${stage} stage requires an exact artifact receipt`);
        results.push({ stage, status, receipt: receipt.receipt, artifacts: structuredClone(artifacts) });
      }
      const outcome = results.every((item) => item.status === "pass") ? "verified" : "failed";
      const material = {
        requestId: request.requestId,
        subject: structuredClone(request.subject),
        godotVersion: request.godotVersion,
        gdunitVersion: request.gdunitVersion,
        results,
        outcome,
        authority: "evidence-proposal-only",
      };
      return immutable({
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "GdUnit4VerificationEvidence",
        evidenceId: `GDE-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
        ...material,
        evidenceDigest: canonicalJsonDigest(material),
      });
    },
  });
}
