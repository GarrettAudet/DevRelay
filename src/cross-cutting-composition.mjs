import { canonicalJsonDigest } from "./content-digest.mjs";

export class CrossCuttingCompositionError extends Error {
  constructor(message, code = "DR7000") {
    super(`cross-cutting composition: ${message}`);
    this.name = "CrossCuttingCompositionError";
    this.code = code;
  }
}

const BOUNDARIES = Object.freeze([
  "session-start",
  "before-work-planning",
  "before-task-dispatch",
  "after-work-execution",
  "before-integration",
  "frontier-complete",
  "session-conclusion",
]);
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/u;
const fail = (message, code) => { throw new CrossCuttingCompositionError(message, code); };
const clone = (value) => structuredClone(value);
function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
function text(value, label) {
  if (typeof value !== "string" || !value) fail(`${label} is required`, "DR7001");
  return value;
}
function names(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value)) {
    fail(`${label} must contain names`, "DR7001");
  }
  const sorted = [...new Set(values)].sort();
  if (sorted.length !== values.length) fail(`${label} contains duplicates`, "DR7002");
  return sorted;
}

function normalizeBindingShape(binding) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) fail("binding must be an object", "DR7001");
  const id = text(binding.id, "binding id");
  if (!BOUNDARIES.includes(binding.boundary)) fail(`binding ${id} has an unknown boundary`, "DR7003");
  text(binding.moduleId, `binding ${id} moduleId`);
  if (!VERSION.test(binding.moduleVersion)) fail(`binding ${id} moduleVersion is not exact`, "DR7004");
  text(binding.operationId, `binding ${id} operationId`);
  if (!DIGEST.test(binding.configurationDigest) || !DIGEST.test(binding.grantDigest)) {
    fail(`binding ${id} must pin configuration and grants`, "DR7004");
  }
  if (!['stop', 'diagnostic'].includes(binding.failureBehavior)) fail(`binding ${id} failureBehavior is invalid`, "DR7003");
  return {
    id,
    boundary: binding.boundary,
    moduleId: binding.moduleId,
    moduleVersion: binding.moduleVersion,
    operationId: binding.operationId,
    inputPorts: names(binding.inputPorts ?? [], `binding ${id} inputPorts`),
    outputPorts: names(binding.outputPorts ?? [], `binding ${id} outputPorts`),
    dependsOn: names(binding.dependsOn ?? [], `binding ${id} dependsOn`),
    configurationDigest: binding.configurationDigest,
    grantDigest: binding.grantDigest,
    failureBehavior: binding.failureBehavior,
    enabled: binding.enabled !== false,
  };
}

function exactNames(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function bindModuleContract(binding, definitions) {
  const normalized = normalizeBindingShape(binding);
  const definition = definitions.find((item) => item?.kind === "ModuleDefinition" && item?.metadata?.id === normalized.moduleId && item?.metadata?.version === normalized.moduleVersion);
  if (!definition) fail(`binding ${normalized.id} has no exact ModuleDefinition`, "DR7011");
  const operation = definition.operations?.find(({ id }) => id === normalized.operationId);
  if (!operation) fail(`binding ${normalized.id} has no exact Module operation`, "DR7011");
  const contractInputs = names(operation.inputs?.filter(({ required }) => required).map(({ name }) => name) ?? [], `binding ${normalized.id} contract inputs`);
  const contractOutputs = names(operation.outputs?.map(({ name }) => name) ?? [], `binding ${normalized.id} contract outputs`);
  if (!exactNames(normalized.inputPorts, contractInputs) || !exactNames(normalized.outputPorts, contractOutputs)) {
    fail(`binding ${normalized.id} ports do not match its exact Module operation`, "DR7011");
  }
  return {
    ...normalized,
    moduleDefinitionDigest: canonicalJsonDigest(definition),
    operationContractDigest: canonicalJsonDigest(operation),
  };
}

function normalizePersistedBinding(binding) {
  const normalized = normalizeBindingShape(binding);
  if (!DIGEST.test(binding.moduleDefinitionDigest) || !DIGEST.test(binding.operationContractDigest)) {
    fail(`binding ${normalized.id} must pin its ModuleDefinition and operation contract`, "DR7011");
  }
  return { ...normalized, moduleDefinitionDigest: binding.moduleDefinitionDigest, operationContractDigest: binding.operationContractDigest };
}

export const CROSS_CUTTING_BOUNDARIES = BOUNDARIES;

function buildPlanMaterial(normalized, availablePorts) {
  const byId = new Map();
  for (const binding of normalized) {
    if (byId.has(binding.id)) fail(`duplicate binding ${binding.id}`, "DR7002");
    byId.set(binding.id, binding);
  }
  for (const binding of normalized) {
    for (const dependency of binding.dependsOn) {
      const parent = byId.get(dependency);
      if (!parent) fail(`binding ${binding.id} depends on missing ${dependency}`, "DR7005");
      if (BOUNDARIES.indexOf(parent.boundary) > BOUNDARIES.indexOf(binding.boundary)) {
        fail(`binding ${binding.id} depends on a later boundary`, "DR7005");
      }
    }
  }

  const readyPorts = new Set(names(availablePorts, "availablePorts"));
  const remaining = new Map([...byId.entries()]);
  const ordered = [];
  while (remaining.size) {
    const candidates = [...remaining.values()]
      .filter((binding) => binding.dependsOn.every((id) => !remaining.has(id)))
      .sort((left, right) => BOUNDARIES.indexOf(left.boundary) - BOUNDARIES.indexOf(right.boundary) || left.id.localeCompare(right.id));
    if (!candidates.length) fail("binding dependency graph contains a cycle", "DR7006");
    const next = candidates[0];
    const missing = next.inputPorts.filter((port) => !readyPorts.has(port));
    if (missing.length) fail(`binding ${next.id} has unavailable input ports: ${missing.join(", ")}`, "DR7007");
    for (const port of next.outputPorts) {
      if (readyPorts.has(port)) fail(`output port ${port} has an ambiguous producer`, "DR7008");
      readyPorts.add(port);
    }
    ordered.push(next);
    remaining.delete(next.id);
  }
  const material = { boundaries: [...BOUNDARIES], availablePorts: names(availablePorts, "availablePorts"), bindings: ordered };
  return material;
}

export function createCrossCuttingCompositionPlan({ bindings = [], availablePorts = [], moduleDefinitions = [] } = {}) {
  if (!Array.isArray(bindings) || !Array.isArray(moduleDefinitions)) fail("bindings and moduleDefinitions must be arrays", "DR7001");
  const normalized = bindings.map((binding) => bindModuleContract(binding, moduleDefinitions)).filter(({ enabled }) => enabled);
  const material = buildPlanMaterial(normalized, availablePorts);
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "CrossCuttingCompositionPlan", ...material, planDigest: canonicalJsonDigest(material) });
}

export function verifyCrossCuttingCompositionPlan(plan) {
  if (!plan || plan.kind !== "CrossCuttingCompositionPlan") fail("plan is required", "DR7009");
  if (!Array.isArray(plan.bindings) || !Array.isArray(plan.availablePorts) || !exactNames(plan.boundaries ?? [], BOUNDARIES)) fail("plan shape drifted", "DR7009");
  const material = buildPlanMaterial(plan.bindings.map(normalizePersistedBinding), plan.availablePorts);
  if (plan.planDigest !== canonicalJsonDigest(material) || canonicalJsonDigest({ boundaries: plan.boundaries, availablePorts: plan.availablePorts, bindings: plan.bindings }) !== canonicalJsonDigest(material)) fail("plan digest drifted", "DR7009");
  return true;
}

export async function executeCrossCuttingBoundary({ plan, boundary, artifacts = {}, invoke } = {}) {
  verifyCrossCuttingCompositionPlan(plan);
  if (!BOUNDARIES.includes(boundary)) fail("boundary is unknown", "DR7003");
  if (typeof invoke !== "function") fail("invoke is required", "DR7001");
  const values = new Map(Object.entries(artifacts));
  const receipts = [];
  for (const binding of plan.bindings.filter((item) => item.boundary === boundary)) {
    const input = Object.fromEntries(binding.inputPorts.map((port) => [port, clone(values.get(port))]));
    try {
      const output = await invoke(immutable(clone(binding)), immutable(input));
      if (!output || typeof output !== "object" || Array.isArray(output)) fail(`binding ${binding.id} returned no outputs`, "DR7010");
      const undeclared = Object.keys(output).filter((port) => !binding.outputPorts.includes(port));
      const missing = binding.outputPorts.filter((port) => !(port in output));
      if (undeclared.length || missing.length) fail(`binding ${binding.id} violated its output ports`, "DR7010");
      for (const [port, value] of Object.entries(output)) values.set(port, clone(value));
      receipts.push({ bindingId: binding.id, status: "pass", outputDigest: canonicalJsonDigest(output) });
    } catch (error) {
      if (binding.failureBehavior === "stop") throw error;
      receipts.push({ bindingId: binding.id, status: "diagnostic", diagnostic: String(error?.message ?? error) });
    }
  }
  const body = { boundary, planDigest: plan.planDigest, receipts, artifacts: Object.fromEntries([...values.entries()].sort(([a], [b]) => a.localeCompare(b))) };
  return immutable({ apiVersion: "devrelay.dev/v1alpha1", kind: "CrossCuttingBoundaryResult", ...body, resultDigest: canonicalJsonDigest(body) });
}
