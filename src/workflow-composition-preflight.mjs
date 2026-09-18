import { canonicalJsonDigest } from "./content-digest.mjs";
import { createModuleRegistry } from "./module-registry.mjs";
import { assertInvocationMatchesRoute } from "./operation-router.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { COMPOSITION_SCHEMA, CompositionError, closed, unique, validateCompositionArtifact } from "./workflow-composition-artifact-validator.mjs";

export const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const identity = (pin) => `${pin.id}@${pin.version}`;
function requireMatch(condition, code, message, outcome = "incompatible") {
  if (!condition) throw new CompositionError(code, message, outcome);
}

function grants(value) {
  closed(value, ["grants"], "grant artifact");
  requireMatch(Array.isArray(value.grants), "schema-mismatch", "Grants must be an array");
  for (const grant of value.grants) {
    closed(grant, ["kind", "scope"], "grant");
    requireMatch(["filesystem.read", "filesystem.write", "process.spawn", "network.connect", "secrets.read"].includes(grant.kind) &&
      typeof grant.scope === "string" && grant.scope.length > 0, "schema-mismatch", "Invalid grant");
  }
  unique(value.grants.map(canonicalJsonDigest), "grants");
  return value.grants;
}

function subset(actual, ceiling) {
  requireMatch(actual.every((grant) => ceiling.some((limit) => same(grant, limit))),
    "grant-exceeded", "Grant is outside the exact declared ceiling", "unauthorized");
}

async function registration(pin, registrations, load, label) {
  const found = registrations.filter((item) => same(item.pin, pin));
  requireMatch(found.length === 1, label === "gate" ? "missing-gate" : label === "contributor" ? "missing-contributor" : "missing-capability",
    `Exact installed ${label} ${identity(pin)} is unavailable`, "unavailable");
  const value = await load(pin.artifact);
  const metadata = value.metadata ?? value;
  requireMatch(metadata.id === pin.id && metadata.version === pin.version, "stale-input", `${label} identity does not match bytes`, "stale");
  if (found[0].definition) requireMatch(same(found[0].definition, value), "stale-input", `${label} registration differs from bytes`, "stale");
  return { ...found[0], value };
}

async function service(pin, category, host, load, { invokeValidators = true } = {}) {
  const registered = await registration(pin, host.services.filter((item) => item.category === category), load, category);
  const keys = category === "gate" ? ["id", "version"] : category === "contributor" ? ["id", "version", "ownership", "match"] : ["id", "version", "settingsSchema"];
  closed(registered.value, keys, `${category} manifest`);
  requireMatch(registered.implementation && typeof registered.implementation === "object", "missing-capability", `${category} implementation unavailable`, "unavailable");
  if (category === "gate") requireMatch(typeof registered.implementation.evaluate === "function", "missing-gate", "Gate implementation is unavailable", "unavailable");
  if (["agent", "executor", "harness"].includes(category)) requireMatch(typeof registered.implementation.validateSettings === "function",
    "missing-capability", `${category} settings validator is unavailable`, "unavailable");
  if (category === "contributor") {
    const implementation = registered.implementation;
    requireMatch(typeof implementation.project === "function" && same(implementation.ownership, registered.value.ownership) &&
      same(implementation.match, registered.value.match) && implementation.metadata?.id === pin.id && implementation.metadata?.version === pin.version,
    "missing-contributor", "Contributor implementation does not match its pinned ownership and coverage", "unavailable");
    // The host supplies the actual owning graph registry's validation, without projecting or merging.
    requireMatch(typeof implementation.validateRegistration === "function", "missing-contributor", "Owning contributor registration validation is unavailable", "unavailable");
    if (invokeValidators) await implementation.validateRegistration(registered.value);
  }
  return registered;
}

// Replay validates installed declarations and callable surfaces, never provider callbacks.
// Serialized pins alone cannot establish that the current host can execute the configuration.
export async function validateCurrentCompositionHost({ host, load, selections }) {
  for (const installed of host.modules) await registration(installed.pin, host.modules, load, "module");
  for (const installed of host.plugins) await registration(installed.pin, host.plugins, load, "plugin");
  for (const installed of host.services) {
    requireMatch(["gate", "contributor", "agent", "executor", "harness"].includes(installed.category), "schema-mismatch", "Unknown installed service category");
    await service(installed.pin, installed.category, host, load, { invokeValidators: false });
  }
  for (const contract of host.artifactContracts) {
    requireMatch(Object.keys(contract).every((key) => ["pin", "schema", "representation", "validate"].includes(key)),
      "schema-mismatch", "Unsupported artifact validator registration field");
    validateCompositionArtifact(contract.pin, "Pin");
    requireMatch(typeof contract.validate === "function", "missing-capability", "Artifact validator implementation is unavailable", "unavailable");
    const manifest = closed(await load(contract.pin.artifact), ["id", "version", "schema", "representation"], "artifact validator manifest");
    requireMatch(same(manifest, { id: contract.pin.id, version: contract.pin.version, schema: contract.schema, representation: contract.representation ?? "json" }) &&
      manifest.representation === "json", "stale-input", "Artifact validator differs from its pinned JSON registration", "stale");
  }
  createModuleRegistry({ modules: host.modules.map((item) => item.definition), plugins: host.plugins, artifactContracts: host.artifactContracts });
  for (const selection of selections) for (const agent of selection.agents) {
    if (agent.modelSelection.actualIdentity.status !== "attested") continue;
    const executor = host.services.find((item) => item.category === "executor" && same(item.pin, agent.executor));
    requireMatch(typeof executor?.implementation?.verifyIdentity === "function", "missing-capability", "Model attestation verifier is unavailable", "unavailable");
  }
}

function matchPorts(slot, operation) {
  const actual = [...operation.inputs.map((port) => ({ ...port, direction: "input" })),
    ...operation.outputs.map((port) => ({ ...port, direction: "output" }))];
  requireMatch(actual.length === slot.ports.length, "schema-mismatch", "Slot ports differ from Module operation");
  for (const port of slot.ports) {
    const declared = actual.find((item) => item.name === port.name && item.direction === port.direction);
    requireMatch(declared && declared.schema === port.schemaRef.schema, "schema-mismatch", `Port ${port.name} schema differs`);
    requireMatch(port.minimum === (declared.required ? 1 : 0) && port.maximum === (declared.cardinality === "one" ? 1 : 1024),
      "cardinality-mismatch", `Port ${port.name} cardinality differs`);
  }
  requireMatch(same([...slot.allowedOutcomes].sort(), [...operation.outcomes].sort()), "schema-mismatch", "Slot outcomes differ");
}

export async function preflightWorkflowComposition({ request, host, load, record }) {
  requireMatch(request.preset.schema === COMPOSITION_SCHEMA, "schema-mismatch", "Preset must use the approved composition v1 schema");
  const preset = validateCompositionArtifact(await load(request.preset), "WorkflowPreset");
  const catalog = closed(await load(request.bindingCatalog), ["kind", "slots"], "binding catalog");
  const capabilities = closed(await load(request.hostCapabilities), ["kind", "grants"], "host capabilities");
  requireMatch(catalog.kind === "CompositionBindingCatalog" && Array.isArray(catalog.slots) && capabilities.kind === "CompositionHostCapabilities",
    "schema-mismatch", "Unsupported host artifact");
  const hostGrants = grants({ grants: capabilities.grants });
  unique(preset.slots.map((slot) => slot.slotId), "preset slots");
  unique(request.selections.map((slot) => slot.slotId), "selected slots");
  unique(catalog.slots.map((slot) => slot.slotId), "catalog slots");
  requireMatch(same(preset.slots.map((slot) => slot.slotId), request.selections.map((slot) => slot.slotId)) &&
    same(preset.slots.map((slot) => slot.slotId), catalog.slots.map((slot) => slot.slotId)), "schema-mismatch", "All slots must be selected in preset order");
  requireMatch(preset.policyProfiles.includes(request.qualityProfile), "schema-mismatch", "Quality profile is unavailable");
  const requiredGates = [];
  const compatibilityProofs = [];
  for (const [index, selection] of request.selections.entries()) {
    const slot = preset.slots[index];
    try {
      unique(slot.ports.map((port) => `${port.direction}:${port.name}`), "ports");
      unique(selection.adapters.map((adapter) => `${adapter.operationId}:${adapter.stepId}`), "adapter steps");
      unique(selection.agents.map((agent) => agent.role), "agent roles");
      unique(selection.contributors.map(identity), "contributors");
      requireMatch(same(selection.projectOverview, request.projectOverview), "stale-input", "Slot overview differs", "stale");
      const module = await registration(selection.module, host.modules, load, "module");
      const semantic = await load(slot.semanticContract);
      // Semantic contracts are genuine Module definitions, validated by their owning registry.
      createModuleRegistry({ modules: [semantic] });
      requireMatch(same(module.value.operations, semantic.operations) && same(module.value.routing ?? null, semantic.routing ?? null),
        "schema-mismatch", "Selected Module changes the slot semantic contract");
      const plugins = [];
      for (const binding of selection.adapters) {
        const installed = await registration(binding.plugin, host.plugins, load, "plugin");
        if (!plugins.some((item) => identity(item.pin) === identity(installed.pin))) plugins.push(installed);
      }
      const registry = createModuleRegistry({ modules: [module.value], plugins, artifactContracts: host.artifactContracts });
      const catalogSlot = closed(catalog.slots[index], ["slotId", "invocations"], "catalog slot");
      requireMatch(Array.isArray(catalogSlot.invocations) && catalogSlot.invocations.length > 0, "schema-mismatch", "Slot has no invocation templates");
      const invocations = [];
      for (const ref of catalogSlot.invocations) invocations.push(await load(ref));
      unique(invocations.map((item) => item.module.operation), "invocation operations");
      const operationIds = [...new Set(selection.adapters.map((item) => item.operationId))];
      requireMatch(same(operationIds.slice().sort(), invocations.map((item) => item.module.operation).sort()), "schema-mismatch", "Every adapter operation requires exactly one invocation");
      const ceiling = grants(await load(slot.grantCeiling));
      const fingerprints = [];
      for (const invocation of invocations) {
        requireMatch(invocation.runId === request.runId, "stale-input", "Invocation belongs to a different run", "stale");
        requireMatch(invocation.module.id === selection.module.id && invocation.module.version === selection.module.version,
          "schema-mismatch", "Invocation Module differs from selection");
        requireMatch(same(invocation.inputs["project-overview-baseline"], [request.projectOverview]), "stale-input", "Invocation must bind exact overview", "stale");
        const operation = module.value.operations.find((item) => item.id === invocation.module.operation);
        requireMatch(operation, "schema-mismatch", "Unknown operation");
        matchPorts(slot, operation);
        const bindings = selection.adapters.filter((item) => item.operationId === operation.id);
        const steps = operation.adapterChain?.steps ?? [{ id: operation.id }];
        for (const step of steps) for (const output of step.outputs ?? []) {
          const schemas = output.variants?.map((variant) => variant.schema) ?? [output.schema];
          requireMatch(schemas.every((schema) => host.artifactContracts.some((contract) => contract.schema === schema)),
            "schema-mismatch", "Intermediate handoff has no owning artifact validator");
        }
        requireMatch(bindings.length === steps.length && bindings.every((item, i) => item.stepId === steps[i].id && item.stepOrder === i),
          "ambiguous-selection", "Adapter steps must match declared order", "ambiguous");
        const actualBindings = invocation.adapters ?? [{ step: operation.id, plugin: invocation.plugin, config: invocation.config, grants: invocation.grants }];
        requireMatch(actualBindings.length === bindings.length, "schema-mismatch", "Invocation adapter chain differs");
        for (const [i, binding] of bindings.entries()) {
          const config = await load(binding.configuration);
          const selectedGrants = grants(await load(binding.grants));
          subset(selectedGrants, ceiling); subset(selectedGrants, hostGrants);
          requireMatch(same(actualBindings[i], { step: binding.stepId, plugin: { id: binding.plugin.id, version: binding.plugin.version }, config, grants: selectedGrants }),
            "schema-mismatch", "Invocation binding differs from exact selection");
        }
        for (const refs of Object.values(invocation.inputs)) for (const ref of refs) {
          const value = await load(ref);
          const contract = host.artifactContracts.find((item) => item.schema === ref.schema);
          requireMatch(contract, "schema-mismatch", `No owning validator for ${ref.schema}`);
          await contract.validate(value, { ref, phase: "input" });
        }
        if (module.value.routing) {
          const state = invocation.inputs[module.value.routing.stateInput]?.[0];
          requireMatch(state, "schema-mismatch", "Routing state is unavailable");
          const decision = await registry.selectOperation(selection.module, state, { artifacts: host.artifacts });
          assertInvocationMatchesRoute(decision, invocation);
          const decisionRef = invocation.inputs[module.value.routing.decisionInput]?.[0];
          requireMatch(decisionRef && same(await load(decisionRef), decision), "stale-input", "Stored routing decision differs", "stale");
        }
        fingerprints.push(registry.resolve(invocation).invocationFingerprint);
      }
      for (const port of slot.ports) {
        const definition = await load(port.schemaRef);
        requireMatch(definition.$id === port.schemaRef.schema, "schema-mismatch", "Port schema identity differs");
        compileArtifactSchema(definition);
      }
      for (const gate of slot.requiredGates) {
        await service(gate, "gate", host, load);
        if (!requiredGates.some((item) => same(item, gate))) requiredGates.push(gate);
      }
      for (const requirement of slot.contributorRequirements) {
        await load(requirement);
        requireMatch(selection.contributors.some((item) => same(item.artifact, requirement)), "missing-contributor", "Required contributor is missing", "unavailable");
      }
      const contributorMatches = [];
      for (const pin of selection.contributors) {
        const installed = await service(pin, "contributor", host, load);
        const match = closed(installed.value.match, ["moduleId", "moduleVersion", "operation", "outcomes"], "contributor coverage");
        requireMatch(match.moduleId === selection.module.id && match.moduleVersion === selection.module.version && Array.isArray(match.outcomes),
          "missing-contributor", "Contributor targets a different Module", "unavailable");
        contributorMatches.push(match);
      }
      for (const invocation of invocations) for (const outcome of slot.allowedOutcomes) {
        requireMatch(contributorMatches.some((match) => match.operation === invocation.module.operation && match.outcomes.includes(outcome)),
          "missing-contributor", "Result lacks exact contributor coverage", "unavailable");
      }
      const harness = await service(selection.harness, "harness", host, load);
      for (const agent of selection.agents) {
        const installed = await service(agent.agent, "agent", host, load);
        const executor = await service(agent.executor, "executor", host, load);
        const settings = await load(agent.settings);
        for (const registered of [installed, executor, harness]) {
          requireMatch(compileArtifactSchema(registered.value.settingsSchema)(settings),
            "unsupported-model-setting", "Agent settings are not supported");
          await registered.implementation.validateSettings(settings);
        }
        const model = agent.modelSelection.actualIdentity;
        if (model.status === "fixture") await load(model.evidence);
        if (model.status === "attested") {
          const attestation = await load(model.attestation);
          requireMatch(typeof executor.implementation.verifyIdentity === "function", "missing-capability", "Model attestation verifier is unavailable", "unavailable");
          requireMatch(await executor.implementation.verifyIdentity(model, attestation) === true, "stale-input", "Model attestation failed", "stale");
        }
      }
      const validationReceipt = record("compatibility", { kind: "CompositionCompatibilityReceipt", slotId: slot.slotId,
        requestDigest: canonicalJsonDigest(request), selectionDigest: canonicalJsonDigest(selection), fingerprints });
      compatibilityProofs.push({ slotId: slot.slotId, declaration: slot.semanticContract, validationReceipt });
    } catch (error) {
      if (error instanceof CompositionError) error.slotId = slot.slotId;
      throw error;
    }
  }
  unique(preset.orderedHandoffs.map(canonicalJsonDigest), "handoffs");
  const orderedHandoffs = preset.orderedHandoffs.map((handoff) => {
    const from = preset.slots.findIndex((slot) => slot.slotId === handoff.fromSlot);
    const to = preset.slots.findIndex((slot) => slot.slotId === handoff.toSlot);
    requireMatch(from >= 0 && to > from, "schema-mismatch", "Handoff must follow preset order");
    const output = preset.slots[from].ports.find((port) => port.direction === "output" && port.name === handoff.outputPort);
    const input = preset.slots[to].ports.find((port) => port.direction === "input" && port.name === handoff.inputPort);
    requireMatch(output && input && same(output.schemaRef, input.schemaRef), "schema-mismatch", "Handoff schemas differ");
    requireMatch(output.minimum >= input.minimum && output.maximum <= input.maximum, "cardinality-mismatch", "Handoff cardinality differs");
    return { fromSlot: handoff.fromSlot, toSlot: handoff.toSlot, contract: output.schemaRef };
  });
  return { compatibilityProofs, requiredGates, orderedHandoffs };
}
