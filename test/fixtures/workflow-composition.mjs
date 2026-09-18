import { canonicalJson, sha256Digest } from "../../src/content-digest.mjs";
import { compileArtifactSchema } from "../../src/schema-validation.mjs";
import { COMPOSITION_SCHEMA } from "../../src/workflow-composition-artifact-validator.mjs";

export function compositionFixture({ variant = "a", storage = new Map(), checkpoints = new Map(), runId = "run-a", chain = false } = {}) {
  const counts = { adapters: 0, contributors: 0, identities: 0, settings: 0, validators: 0, writes: 0, commits: 0 };
  const add = (id, value, schema = `https://example.test/${id}/v1`) => {
    const bytes = Buffer.from(canonicalJson(value));
    const digest = sha256Digest(bytes);
    const ref = { artifactId: id, schema, mediaType: "application/json", digest, uri: `memory://composition/${digest.slice(7)}` };
    storage.set(ref.uri, bytes);
    return ref;
  };
  const pin = (id, value) => ({ id, version: "1.0.0", artifact: add(id, value) });
  const schema = { $id: "https://example.test/overview/v1", type: "object", additionalProperties: false,
    properties: { artifactId: { type: "string" } }, required: ["artifactId"] };
  const schemaRef = add("overview-schema", schema, schema.$id);
  const overview = add("overview", { artifactId: "overview" }, schema.$id);
  const port = (name) => ({ name, schema: schema.$id, mediaTypes: ["application/json"], cardinality: "one", required: true });
  const operation = { id: "build", description: "Fixture build", inputs: [port("project-overview-baseline")], outputs: [port("result")],
    inputRules: [], outcomes: ["proposed"], evidence: [], optionsSchema: { type: "object", additionalProperties: false },
    resultContracts: { proposed: { status: "completed", requiredInputs: ["project-overview-baseline"], forbiddenInputs: [],
      requiredOutputs: ["result"], allowedOutputs: ["result"], requiredEvidence: [], diagnosticsRequired: false } } };
  if (chain) operation.adapterChain = { earlyTerminalOutcomes: [], steps: [
    { id: "prepare", kind: "handoff", outputs: [port("prepared")] }, { id: "finish", kind: "terminal" },
  ] };
  const module = { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleDefinition", metadata: { id: "fixture-builder", version: "1.0.0", description: "Fixture" }, operations: [operation] };
  const modulePin = pin("fixture-builder", module);
  const plugin = { apiVersion: "devrelay.dev/v1alpha1", kind: "ModulePlugin", metadata: { id: `fixture-plugin-${variant}`, version: "1.0.0", description: "Fixture" },
    implements: [{ module: { id: modulePin.id, version: "1.0.0" }, operations: [{ id: "build", execution: "pure",
      configSchema: { type: "object", additionalProperties: false }, capabilities: [{ kind: "filesystem.read", scope: "fixture" }] }] }] };
  if (chain) plugin.implements[0].operations = ["prepare", "finish"].map((step) => ({ ...plugin.implements[0].operations[0], step }));
  const pluginPin = pin(plugin.metadata.id, plugin);
  const config = add(`config-${variant}`, {});
  const granted = [{ kind: "filesystem.read", scope: "fixture" }];
  const grantRef = add("grants", { grants: granted });
  const gatePin = pin("fixture-gate", { id: "fixture-gate", version: "1.0.0" });
  const ownership = { scope: "fixture", authority: "candidate", nodeKinds: [], edgeKinds: [] };
  const match = { moduleId: modulePin.id, moduleVersion: "1.0.0", operation: "build", outcomes: ["proposed"] };
  const contributorPin = pin("fixture-contributor", { id: "fixture-contributor", version: "1.0.0", ownership, match });
  const settingsSchema = { type: "object", additionalProperties: false, properties: { reasoning: { enum: ["low", "high"] } }, required: ["reasoning"] };
  const servicePin = (id) => pin(id, { id, version: "1.0.0", settingsSchema });
  const agentPin = servicePin(`fixture-agent-${variant}`);
  const executorPin = servicePin("fixture-executor");
  const harnessPin = servicePin("fixture-harness");
  const selection = { slotId: "build", module: modulePin, adapters: [{ operationId: "build", stepId: "build", stepOrder: 0,
    plugin: pluginPin, configuration: config, grants: grantRef }], contributors: [contributorPin],
    agents: [{ role: "worker", agent: agentPin, executor: executorPin, settings: add(`settings-${variant}`, { reasoning: variant === "a" ? "low" : "high" }),
      modelSelection: { mode: "inherit", actualIdentity: { status: "unknown", selection: "desktop-inherited", reason: "Fixture has no attestation" } } }],
    harness: harnessPin, projectOverview: overview };
  if (chain) selection.adapters = ["prepare", "finish"].map((stepId, stepOrder) => ({ ...selection.adapters[0], stepId, stepOrder }));
  const preset = { kind: "WorkflowPreset", artifactId: "existing-project", version: "1.0.0", policyProfiles: ["standard"], orderedHandoffs: [],
    slots: [{ slotId: "build", semanticContract: modulePin.artifact, ports: [
      { name: "project-overview-baseline", direction: "input", schemaRef, minimum: 1, maximum: 1 },
      { name: "result", direction: "output", schemaRef, minimum: 1, maximum: 1 }], allowedOutcomes: ["proposed"], requiredGates: [gatePin], grantCeiling: grantRef,
    contributorRequirements: [contributorPin.artifact] }] };
  const invocation = { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleInvocation", invocationId: "fixture-invocation", runId, nodeId: "build",
    module: { id: modulePin.id, version: "1.0.0", operation: "build" }, plugin: { id: pluginPin.id, version: "1.0.0" },
    inputs: { "project-overview-baseline": [overview] }, options: {}, config: {}, grants: granted };
  if (chain) {
    invocation.adapters = ["prepare", "finish"].map((step) => ({ step, plugin: invocation.plugin, config: {}, grants: granted }));
    delete invocation.plugin; delete invocation.config; delete invocation.grants;
  }
  const request = { kind: "WorkflowConfigurationRequest", artifactId: "request", runId, preset: add("preset", preset, COMPOSITION_SCHEMA),
    bindingCatalog: add(`catalog-${variant}`, { kind: "CompositionBindingCatalog", slots: [{ slotId: "build", invocations: [add(`invocation-${variant}`, invocation)] }] }),
    hostCapabilities: add("capabilities", { kind: "CompositionHostCapabilities", grants: granted }), projectOverview: overview,
    selections: [selection], qualityProfile: "standard", lineage: { mode: "initial" } };
  const host = { preset: request.preset, bindingCatalog: request.bindingCatalog, hostCapabilities: request.hostCapabilities, projectOverview: overview,
    artifacts: { load(ref) { const bytes = storage.get(ref.uri); if (!bytes) throw new Error(`Missing ${ref.uri}`); return Buffer.from(bytes); },
      put(ref, bytes) { counts.writes++; if (storage.has(ref.uri) && !storage.get(ref.uri).equals(bytes)) throw new Error("Artifact conflict"); storage.set(ref.uri, Buffer.from(bytes)); } },
    checkpoints: { pin: pin("fixture-checkpoint-provider", { id: "fixture-checkpoint-provider", version: "1.0.0" }),
      read(id) { return checkpoints.get(id); }, commit(id, bytes) { counts.commits++; if (checkpoints.has(id) && !checkpoints.get(id).equals(bytes)) throw new Error("Checkpoint conflict"); checkpoints.set(id, Buffer.from(bytes)); } },
    modules: [{ pin: modulePin, definition: module }], plugins: [{ pin: pluginPin, definition: plugin, adapter: { invoke() { counts.adapters++; throw new Error("Resolution dispatched adapter"); } } }],
    artifactContracts: [{ schema: schema.$id,
      pin: pin("fixture-overview-validator", { id: "fixture-overview-validator", version: "1.0.0", schema: schema.$id, representation: "json" }),
      validate(value) { counts.validators++; if (!compileArtifactSchema(schema)(value)) throw new Error("Invalid overview"); return value; } }],
    services: [
      { category: "gate", pin: gatePin, implementation: { evaluate() { throw new Error("Resolution invoked Gate"); } } },
      { category: "contributor", pin: contributorPin, implementation: { metadata: { id: contributorPin.id, version: "1.0.0" }, ownership, match,
        project() { throw new Error("Resolution projected graph"); }, validateRegistration(value) { counts.contributors++; if (value.match.operation !== "build") throw new Error("Invalid contributor"); } } },
      { category: "agent", pin: agentPin, implementation: { validateSettings(settings) { counts.settings++; assertSettings(settings); } } },
      { category: "executor", pin: executorPin, implementation: { validateSettings(settings) { counts.settings++; assertSettings(settings); }, verifyIdentity() { counts.identities++; return false; } } },
      { category: "harness", pin: harnessPin, implementation: { validateSettings(settings) { counts.settings++; assertSettings(settings); } } },
    ] };
  return { host, request, preset, invocation, selection, module, plugin, add, counts, storage, checkpoints,
    requestRef() { return add("request", request, COMPOSITION_SCHEMA); } };
}

function assertSettings(settings) {
  if (!["low", "high"].includes(settings.reasoning)) throw new Error("Unsupported fixture settings");
}
