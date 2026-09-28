import { compileArtifactSchema } from "../../src/schema-validation.mjs";
import { validateArchitectureDiscoveryArtifact } from "../../src/architecture-discovery-artifact-validator.mjs";

export const apiVersion = "devrelay.dev/v1alpha1";
export const schemas = Object.fromEntries(["request", "inspection", "changes", "report"].map(name =>
  [name, "https://devrelay.dev/examples/modular/coding/" + name + "/v1"]));
const string = { type: "string" };
const digest = { type: ["string", "null"], pattern: "^sha256:[a-f0-9]{64}$" };
const content = { type: ["string", "null"] };
const object = (properties, required = Object.keys(properties)) =>
  ({ type: "object", additionalProperties: false, properties, required });
const file = object({ path: string, content, digest });
const files = { type: "array", maxItems: 100, items: file };
const change = object({ path: string, before: content, after: string, beforeDigest: digest, afterDigest: digest });
const changes = { type: "array", minItems: 1, maxItems: 50, items: change };
const inventory = { type: ["object", "null"] };
export const requestSchema = object({
  requestId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$" },
  goal: { type: "string", minLength: 1, maxLength: 4000 },
  readPaths: { type: "array", maxItems: 100, uniqueItems: true, items: string },
  changes: { type: "array", minItems: 1, maxItems: 50, items: object({
    path: string, beforeDigest: digest, content: { type: "string", maxLength: 1048576 },
  }) },
  testFiles: { type: "array", minItems: 1, maxItems: 30, uniqueItems: true, items: string },
  timeoutMs: { type: "integer", minimum: 100, maximum: 120000 },
});
const definitions = {
  request: requestSchema,
  inspection: object({ files, inventory }),
  changes: object({ files, inventory, changes }),
  report: object({
    requestId: string, goal: string, workspace: string, files, inventory, changes, diff: string,
    verification: object({ exitCode: { type: ["integer", "null"] }, stdout: string, stderr: string,
      receipt: { type: "object" } }),
  }),
};
const validators = Object.fromEntries(Object.entries(definitions).map(([name, schema]) =>
  [name, compileArtifactSchema(schema)]));
export function validateCodingArtifact(name, value) {
  if (!validators[name](value)) throw new TypeError("Invalid coding " + name + ": " + JSON.stringify(validators[name].errors));
  if (value.inventory) validateArchitectureDiscoveryArtifact(value.inventory);
  return value;
}
export const codingArtifactContracts = Object.keys(definitions).map(name =>
  ({ schema: schemas[name], validate: value => validateCodingArtifact(name, value) }));
const port = (name, schema, mediaType = "application/json") =>
  ({ name, schema, mediaTypes: [mediaType], cardinality: "one", required: true });
const outcomes = ["verified", "tests_failed"];
export const codingModule = {
  apiVersion, kind: "ModuleDefinition",
  metadata: { id: "example.coding-change", version: "1.0.0", description: "Inspect, apply an explicit Desktop-authored change and run trusted Node tests." },
  operations: [{
    id: "apply-and-verify", description: "Execute a bounded coding change and preserve observed evidence.",
    inputs: [
      port("request", schemas.request),
      port("requirements-baseline", "https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json"),
      port("project-overview-baseline", "https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json"),
    ],
    outputs: [port("report", schemas.report)], inputRules: [], outcomes,
    evidence: ["example/coding-tests"], optionsSchema: object({}),
    resultContracts: Object.fromEntries(outcomes.map(outcome => [outcome, {
      status: outcome === "verified" ? "completed" : "failed", requiredInputs: [], forbiddenInputs: [],
      requiredOutputs: ["report"], allowedOutputs: ["report"], diagnosticsRequired: false,
      requiredEvidence: [{ kind: "example/coding-tests", statuses: [outcome === "verified" ? "pass" : "fail"], artifactOutput: "report" }],
    }])),
    adapterChain: { earlyTerminalOutcomes: [], steps: [
      { id: "inspect", kind: "handoff", outputs: [port("inspection", schemas.inspection)] },
      { id: "edit", kind: "handoff", outputs: [port("changes", schemas.changes)] },
      { id: "verify", kind: "terminal" },
    ] },
  }],
};
const bindings = [
  ["inspect", "native-repository-inventory", [{ kind: "filesystem.read", scope: "declared-files" }]],
  ["edit", "native-file-change", [{ kind: "filesystem.read", scope: "declared-files" }, { kind: "filesystem.write", scope: "declared-changes" }]],
  ["verify", "native-node-test", [{ kind: "filesystem.read", scope: "declared-files" }, { kind: "process.spawn", scope: "node-test" }]],
];
export function codingPluginDefinitions(config) {
  return bindings.map(([step, id, capabilities]) => ({
    apiVersion, kind: "ModulePlugin", metadata: { id, version: "1.0.0", description: "Local reference binding for coding " + step + "." },
    implements: [{ module: { id: "example.coding-change", version: "1.0.0" }, operations: [{
      id: "apply-and-verify", step, execution: "effect", capabilities,
      configSchema: object(Object.fromEntries(Object.entries(config).map(([key, value]) => [key, { const: value }]))),
    }] }],
  }));
}
