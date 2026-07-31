import { canonicalJsonDigest } from "./content-digest.mjs";

import {
  MODULE_ROUTE_DECISION_SCHEMA,
  RoutingError,
  assertInvocationMatchesRoute,
  selectModuleRoute,
  validateModuleRouting,
} from "./operation-router.mjs";

import {
  ArtifactRuntimeError,
  createArtifactContractRegistry,
  loadArtifactContent,
  requireArtifactContracts,
  requireArtifactLoader,
  validateLoadedArtifact,
} from "./artifact-runtime.mjs";

import {
  compileEmbeddedSchema,
  documentValidators,
  validationDetail,
} from "./schema-validation.mjs";

const CAPABILITY_KINDS = new Set([
  "filesystem.read",
  "filesystem.write",
  "process.spawn",
  "network.connect",
  "secrets.read",
]);

export class ContractError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "ContractError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ContractError(code, message);
}

function assertSchema(validator, value, code, label) {
  if (!validator(value)) {
    fail(code, `${label} is invalid: ${validationDetail(validator)}`);
  }
}

function compileContractSchema(schema, code, label) {
  try {
    return compileEmbeddedSchema(schema);
  } catch (error) {
    fail(code, `${label} is not a valid JSON Schema: ${error.message}`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) {
    fail("DR1000", `${label} must be an object`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail("DR1001", `${label} must be a non-empty string`);
  }
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    fail("DR1002", `${label} must be an array`);
  }
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    fail("DR1003", `${label} contains a duplicate`);
  }
}

function exactKey({ id, version }) {
  requireString(id, "identity.id");
  requireString(version, "identity.version");
  return `${id}@${version}`;
}

function operationById(definition, operationId) {
  return definition.operations.find(({ id }) => id === operationId);
}

function operationKey(moduleRef, operationId) {
  return `${exactKey(moduleRef)}#${operationId}`;
}

function bindingKey(pluginRef, moduleRef, operationId, step) {
  const stepSuffix = step === undefined ? "" : `/${step}`;
  return `${exactKey(pluginRef)}=>${operationKey(
    moduleRef,
    operationId,
  )}${stepSuffix}`;
}

function assertNamesExist(names, available, label) {
  requireArray(names, label);
  assertUnique(names, label);
  for (const name of names) {
    if (!available.has(name)) {
      fail("DR1100", `${label} references undeclared name "${name}"`);
    }
  }
}

function validatePort(port, label) {
  requireRecord(port, label);
  requireString(port.name, `${label}.name`);
  requireString(port.schema, `${label}.schema`);
  requireArray(port.mediaTypes, `${label}.mediaTypes`);
  if (port.mediaTypes.length === 0) {
    fail("DR1101", `${label}.mediaTypes must not be empty`);
  }
  if (!["one", "many"].includes(port.cardinality)) {
    fail("DR1102", `${label}.cardinality is invalid`);
  }
  if (typeof port.required !== "boolean") {
    fail("DR1103", `${label}.required must be boolean`);
  }
}

function validateModuleDefinition(definition) {
  assertSchema(
    documentValidators.moduleDefinition,
    definition,
    "DR1207",
    "module definition",
  );
  requireRecord(definition, "module definition");
  if (definition.apiVersion !== "devrelay.dev/v1alpha1") {
    fail("DR1200", "module apiVersion is unsupported");
  }
  if (definition.kind !== "ModuleDefinition") {
    fail("DR1201", "module kind must be ModuleDefinition");
  }
  requireRecord(definition.metadata, "module.metadata");
  exactKey(definition.metadata);
  requireArray(definition.operations, "module.operations");
  if (definition.operations.length === 0) {
    fail("DR1202", "module must declare at least one operation");
  }
  assertUnique(
    definition.operations.map(({ id }) => id),
    "module operation IDs",
  );

  for (const operation of definition.operations) {
    requireRecord(operation, "module operation");
    requireString(operation.id, "module operation.id");
    requireArray(operation.inputs, `${operation.id}.inputs`);
    requireArray(operation.outputs, `${operation.id}.outputs`);
    requireArray(operation.inputRules, `${operation.id}.inputRules`);
    requireArray(operation.outcomes, `${operation.id}.outcomes`);
    requireArray(operation.evidence, `${operation.id}.evidence`);
    requireRecord(operation.resultContracts, `${operation.id}.resultContracts`);
    requireRecord(operation.optionsSchema, `${operation.id}.optionsSchema`);

    for (const [index, port] of operation.inputs.entries()) {
      validatePort(port, `${operation.id}.inputs[${index}]`);
    }
    for (const [index, port] of operation.outputs.entries()) {
      validatePort(port, `${operation.id}.outputs[${index}]`);
    }

    const inputNameList = operation.inputs.map(({ name }) => name);
    const outputNameList = operation.outputs.map(({ name }) => name);
    assertUnique(inputNameList, `${operation.id} input port names`);
    assertUnique(outputNameList, `${operation.id} output port names`);
    const inputNames = new Set(inputNameList);
    const outputNames = new Set(outputNameList);
    for (const [index, rule] of operation.inputRules.entries()) {
      requireRecord(rule, `${operation.id}.inputRules[${index}]`);
      assertNamesExist(
        [rule.ifPresent],
        inputNames,
        `${operation.id}.inputRules[${index}].ifPresent`,
      );
      assertNamesExist(
        rule.require,
        inputNames,
        `${operation.id}.inputRules[${index}].require`,
      );
    }
    assertUnique(operation.outcomes, `${operation.id} outcomes`);
    assertUnique(operation.evidence, `${operation.id} evidence kinds`);

    const contractNames = Object.keys(operation.resultContracts);
    assertUnique(contractNames, `${operation.id} result contract names`);
    if (
      contractNames.length !== operation.outcomes.length ||
      operation.outcomes.some((outcome) => !Object.hasOwn(operation.resultContracts, outcome))
    ) {
      fail(
        "DR1203",
        `${operation.id} must declare exactly one result contract per outcome`,
      );
    }

    for (const [outcome, contract] of Object.entries(
      operation.resultContracts,
    )) {
      requireRecord(contract, `${operation.id}.${outcome}`);
      if (!["completed", "failed", "waiting"].includes(contract.status)) {
        fail("DR1204", `${operation.id}.${outcome}.status is invalid`);
      }
      assertNamesExist(
        contract.requiredInputs,
        inputNames,
        `${operation.id}.${outcome}.requiredInputs`,
      );
      assertNamesExist(
        contract.forbiddenInputs,
        inputNames,
        `${operation.id}.${outcome}.forbiddenInputs`,
      );
      for (const requiredInput of contract.requiredInputs) {
        if (contract.forbiddenInputs.includes(requiredInput)) {
          fail(
            "DR1209",
            `${operation.id}.${outcome} both requires and forbids input "${requiredInput}"`,
          );
        }
      }
      assertNamesExist(
        contract.requiredOutputs,
        outputNames,
        `${operation.id}.${outcome}.requiredOutputs`,
      );
      assertNamesExist(
        contract.allowedOutputs,
        outputNames,
        `${operation.id}.${outcome}.allowedOutputs`,
      );
      requireArray(
        contract.requiredEvidence,
        `${operation.id}.${outcome}.requiredEvidence`,
      );
      assertUnique(
        contract.requiredEvidence.map(({ kind }) => kind),
        `${operation.id}.${outcome}.requiredEvidence kinds`,
      );
      for (const requirement of contract.requiredEvidence) {
        if (!operation.evidence.includes(requirement.kind)) {
          fail(
            "DR1210",
            `${operation.id}.${outcome} requires undeclared evidence "${requirement.kind}"`,
          );
        }
        if (
          requirement.artifactOutput !== undefined &&
          !contract.allowedOutputs.includes(requirement.artifactOutput)
        ) {
          fail(
            "DR1211",
            `${operation.id}.${outcome} binds evidence to disallowed output "${requirement.artifactOutput}"`,
          );
        }
      }
      for (const requiredOutput of contract.requiredOutputs) {
        if (!contract.allowedOutputs.includes(requiredOutput)) {
          fail(
            "DR1205",
            `${operation.id}.${outcome} requires output "${requiredOutput}" without allowing it`,
          );
        }
      }
      if (typeof contract.diagnosticsRequired !== "boolean") {
        fail(
          "DR1206",
          `${operation.id}.${outcome}.diagnosticsRequired must be boolean`,
        );
      }
    }
    if (operation.adapterChain !== undefined) {
      const chain = operation.adapterChain;
      requireRecord(chain, `${operation.id}.adapterChain`);
      requireArray(
        chain.earlyTerminalOutcomes,
        `${operation.id}.adapterChain.earlyTerminalOutcomes`,
      );
      assertUnique(
        chain.earlyTerminalOutcomes,
        `${operation.id}.adapterChain.earlyTerminalOutcomes`,
      );
      for (const outcome of chain.earlyTerminalOutcomes) {
        if (!operation.outcomes.includes(outcome)) {
          fail(
            "DR1212",
            `${operation.id}.adapterChain references undeclared early terminal outcome "${outcome}"`,
          );
        }
      }

      requireArray(chain.steps, `${operation.id}.adapterChain.steps`);
      assertUnique(
        chain.steps.map(({ id }) => id),
        `${operation.id}.adapterChain step IDs`,
      );
      const terminalIndexes = [];
      for (const [index, step] of chain.steps.entries()) {
        requireRecord(step, `${operation.id}.adapterChain.steps[${index}]`);
        requireString(
          step.id,
          `${operation.id}.adapterChain.steps[${index}].id`,
        );
        if (step.kind === "terminal") {
          terminalIndexes.push(index);
          continue;
        }
        requireArray(step.outputs, `${operation.id}.${step.id}.outputs`);
        for (const [portIndex, port] of step.outputs.entries()) {
          validatePort(port, `${operation.id}.${step.id}.outputs[${portIndex}]`);
        }
        assertUnique(
          step.outputs.map(({ name }) => name),
          `${operation.id}.${step.id} output port names`,
        );
      }
      if (
        terminalIndexes.length !== 1 ||
        terminalIndexes[0] !== chain.steps.length - 1
      ) {
        fail(
          "DR1213",
          `${operation.id}.adapterChain must end with exactly one terminal step`,
        );
      }
      if (chain.resume !== undefined) {
        const resume = chain.resume;
        requireRecord(resume, `${operation.id}.adapterChain.resume`);
        assertNamesExist(
          [...resume.lineageInputs, ...resume.controlInputs],
          inputNames,
          `${operation.id}.adapterChain.resume inputs`,
        );
        assertNamesExist(
          [resume.continuationOutput],
          outputNames,
          `${operation.id}.adapterChain.resume output`,
        );
        assertUnique(
          resume.lineageInputs,
          `${operation.id}.adapterChain.resume lineage inputs`,
        );
        assertUnique(
          resume.controlInputs,
          `${operation.id}.adapterChain.resume control inputs`,
        );
        const classified = [
          ...resume.lineageInputs,
          ...resume.controlInputs,
        ];
        assertUnique(
          classified,
          `${operation.id}.adapterChain.resume classified inputs`,
        );
        if (
          classified.length !== inputNames.size ||
          [...inputNames].some((name) => !classified.includes(name))
        ) {
          fail(
            "DR1214",
            `${operation.id}.adapterChain.resume must classify every input exactly once`,
          );
        }
        if (!resume.controlInputs.includes(resume.continuationInput)) {
          fail(
            "DR1214",
            `${operation.id}.adapterChain.resume continuation input must be a control input`,
          );
        }
      }
    }
  }
}

function findPluginOperation(definition, moduleRef, operationId, step) {
  const implementation = definition.implements.find(
    ({ module }) =>
      module.id === moduleRef.id && module.version === moduleRef.version,
  );
  if (!implementation) {
    return undefined;
  }
  return implementation.operations.find(
    (operation) => operation.id === operationId && operation.step === step,
  );
}

function validatePluginDefinition(definition, modules) {
  assertSchema(
    documentValidators.modulePlugin,
    definition,
    "DR1308",
    "plugin definition",
  );
  requireRecord(definition, "plugin definition");
  if (definition.apiVersion !== "devrelay.dev/v1alpha1") {
    fail("DR1300", "plugin apiVersion is unsupported");
  }
  if (definition.kind !== "ModulePlugin") {
    fail("DR1301", "plugin kind must be ModulePlugin");
  }
  requireRecord(definition.metadata, "plugin.metadata");
  exactKey(definition.metadata);
  requireArray(definition.implements, "plugin.implements");
  if (definition.implements.length === 0) {
    fail("DR1302", "plugin must implement at least one module");
  }

  const targetKeys = [];
  for (const implementation of definition.implements) {
    requireRecord(implementation, "plugin implementation");
    requireRecord(implementation.module, "plugin implementation.module");
    const moduleKey = exactKey(implementation.module);
    const moduleDefinition = modules.get(moduleKey);
    if (!moduleDefinition) {
      fail("DR1303", `plugin targets unregistered module ${moduleKey}`);
    }
    requireArray(implementation.operations, "plugin implementation.operations");
    if (implementation.operations.length === 0) {
      fail("DR1304", `plugin implementation for ${moduleKey} has no operations`);
    }
    assertUnique(
      implementation.operations.map(
        ({ id, step }) => `${id}\u0000${step ?? ""}`,
      ),
      `${moduleKey} plugin operation identities`,
    );

    for (const pluginOperation of implementation.operations) {
      requireRecord(pluginOperation, "plugin operation");
      requireString(pluginOperation.id, "plugin operation.id");
      const operationDefinition = operationById(
        moduleDefinition,
        pluginOperation.id,
      );
      if (!operationDefinition) {
        fail(
          "DR1305",
          `plugin implements undeclared operation ${moduleKey}#${pluginOperation.id}`,
        );
      }
      if (!["pure", "effect"].includes(pluginOperation.execution)) {
        fail("DR1306", `${moduleKey}#${pluginOperation.id} execution is invalid`);
      }
      if (operationDefinition.adapterChain !== undefined) {
        if (pluginOperation.step === undefined) {
          fail(
            "DR1310",
            `plugin operation ${moduleKey}#${pluginOperation.id} must declare a chain step`,
          );
        }
        if (
          !operationDefinition.adapterChain.steps.some(
            ({ id }) => id === pluginOperation.step,
          )
        ) {
          fail(
            "DR1311",
            `plugin implements undeclared chain step ${moduleKey}#${pluginOperation.id}/${pluginOperation.step}`,
          );
        }
      } else if (pluginOperation.step !== undefined) {
        fail(
          "DR1312",
          `legacy operation ${moduleKey}#${pluginOperation.id} cannot declare a chain step`,
        );
      }
      requireRecord(
        pluginOperation.configSchema,
        `${moduleKey}#${pluginOperation.id}.configSchema`,
      );
      requireArray(
        pluginOperation.capabilities,
        `${moduleKey}#${pluginOperation.id}.capabilities`,
      );
      for (const [index, capability] of pluginOperation.capabilities.entries()) {
        const label = `${moduleKey}#${pluginOperation.id}.capabilities[${index}]`;
        requireRecord(capability, label);
        if (!CAPABILITY_KINDS.has(capability.kind)) {
          fail("DR1307", `${label}.kind is invalid`);
        }
        requireString(capability.scope, `${label}.scope`);
      }
      targetKeys.push(
        `${moduleKey}#${pluginOperation.id}/${pluginOperation.step ?? ""}`,
      );
    }
  }
  assertUnique(targetKeys, "plugin implementation targets");
}

function validateArtifacts(artifacts, port, label) {
  requireArray(artifacts, label);
  if (artifacts.length === 0) {
    fail("DR1400", `${label} must contain at least one artifact`);
  }
  if (port.cardinality === "one" && artifacts.length !== 1) {
    fail("DR1401", `${label} must contain exactly one artifact`);
  }
  for (const artifact of artifacts) {
    requireRecord(artifact, `${label} artifact`);
    if (artifact.schema !== port.schema) {
      fail("DR1402", `${label} artifact schema does not match its port`);
    }
    if (!port.mediaTypes.includes(artifact.mediaType)) {
      fail("DR1403", `${label} artifact media type is not accepted`);
    }
    requireString(artifact.digest, `${label} artifact.digest`);
  }
}

function validateInputs(invocation, operation) {
  requireRecord(invocation.inputs, "invocation.inputs");
  const ports = new Map(operation.inputs.map((port) => [port.name, port]));
  for (const port of operation.inputs) {
    if (port.required && !Object.hasOwn(invocation.inputs, port.name)) {
      fail("DR1404", `required input "${port.name}" is missing`);
    }
  }
  for (const [name, artifacts] of Object.entries(invocation.inputs)) {
    const port = ports.get(name);
    if (!port) {
      fail("DR1405", `input "${name}" is not declared by the module`);
    }
    validateArtifacts(artifacts, port, `input.${name}`);
  }
  for (const rule of operation.inputRules) {
    if (Object.hasOwn(invocation.inputs, rule.ifPresent)) {
      for (const requiredInput of rule.require) {
        if (!Object.hasOwn(invocation.inputs, requiredInput)) {
          fail(
            "DR1406",
            `input "${rule.ifPresent}" requires input "${requiredInput}"`,
          );
        }
      }
    }
  }
}

function validateStepOutputs(outputs, step) {
  requireRecord(outputs, `step ${step.id} outputs`);
  const ports = new Map(step.outputs.map((port) => [port.name, port]));
  for (const port of step.outputs) {
    if (port.required && !Object.hasOwn(outputs, port.name)) {
      fail("DR1803", `step "${step.id}" requires output "${port.name}"`);
    }
  }
  for (const [name, artifacts] of Object.entries(outputs)) {
    const port = ports.get(name);
    if (!port) {
      fail("DR1804", `step "${step.id}" returned undeclared output "${name}"`);
    }
    validateArtifacts(artifacts, port, `step.${step.id}.output.${name}`);
  }
}

function normalizedInputs(inputs) {
  return Object.fromEntries(
    Object.entries(inputs).map(([port, artifacts]) => [
      port,
      artifacts.map(({ schema, mediaType, digest }) => ({
        schema,
        mediaType,
        digest,
      })),
    ]),
  );
}

function normalizedGrants(grants) {
  return grants
    .map(({ kind, scope }) => ({ kind, scope }))
    .sort((left, right) => {
      const leftKey = `${left.kind}\u0000${left.scope}`;
      const rightKey = `${right.kind}\u0000${right.scope}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}

function validateGrants(grants, pluginOperation, pluginKey, label) {
  requireArray(grants, label);
  for (const [index, grant] of grants.entries()) {
    const grantLabel = `${label}[${index}]`;
    requireRecord(grant, grantLabel);
    if (!CAPABILITY_KINDS.has(grant.kind)) {
      fail("DR1605", `${grantLabel}.kind is invalid`);
    }
    requireString(grant.scope, `${grantLabel}.scope`);
  }
  const grantKinds = new Set(grants.map(({ kind }) => kind));
  for (const capability of pluginOperation.capabilities) {
    if (!grantKinds.has(capability.kind)) {
      fail(
        "DR1604",
        `plugin ${pluginKey} requires an ungranted ${capability.kind} capability`,
      );
    }
  }
}


function assertJsonData(value, path = "$", ancestors = new WeakSet()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must contain only finite numbers`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${path} must contain only JSON data`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${path} must not contain a cycle`);
  }

  const expectedPrototype = Array.isArray(value)
    ? Array.prototype
    : Object.prototype;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== expectedPrototype && prototype !== null) {
    throw new TypeError(`${path} must contain only plain JSON objects`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`${path} must not contain symbol properties`);
  }

  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    const extra = Object.keys(descriptors).filter(
      (key) =>
        key !== "length" &&
        (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length),
    );
    if (extra.length > 0) {
      throw new TypeError(`${path} array has non-JSON properties`);
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[index];
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, "value") ||
        descriptor.enumerable !== true
      ) {
        throw new TypeError(`${path} must not contain sparse or accessor arrays`);
      }
      assertJsonData(descriptor.value, `${path}[${index}]`, ancestors);
    }
  } else {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (
        !Object.hasOwn(descriptor, "value") ||
        descriptor.enumerable !== true
      ) {
        throw new TypeError(`${path}.${key} must be enumerable JSON data`);
      }
      assertJsonData(descriptor.value, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function immutableCopy(value) {
  assertJsonData(value);
  const copy = JSON.parse(JSON.stringify(value));
  const freeze = (item) => {
    if (item !== null && typeof item === "object" && !Object.isFrozen(item)) {
      for (const child of Object.values(item)) {
        freeze(child);
      }
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
}

export function createInvocationFingerprint(invocation) {
  requireRecord(invocation, "invocation");
  requireRecord(invocation.module, "invocation.module");
  requireRecord(invocation.inputs, "invocation.inputs");
  requireRecord(invocation.options, "invocation.options");
  const inputs = normalizedInputs(invocation.inputs);

  if (invocation.adapters !== undefined) {
    requireArray(invocation.adapters, "invocation.adapters");
    const adapters = invocation.adapters.map((binding, index) => {
      requireRecord(binding, `invocation.adapters[${index}]`);
      requireString(binding.step, `invocation.adapters[${index}].step`);
      requireRecord(binding.plugin, `invocation.adapters[${index}].plugin`);
      requireRecord(binding.config, `invocation.adapters[${index}].config`);
      requireArray(binding.grants, `invocation.adapters[${index}].grants`);
      return {
        step: binding.step,
        plugin: binding.plugin,
        config: binding.config,
        grants: normalizedGrants(binding.grants),
      };
    });
    return canonicalJsonDigest({
      module: invocation.module,
      adapters,
      inputs,
      options: invocation.options,
    });
  }

  requireRecord(invocation.plugin, "invocation.plugin");
  requireRecord(invocation.config, "invocation.config");
  requireArray(invocation.grants, "invocation.grants");
  return canonicalJsonDigest({
    module: invocation.module,
    plugin: invocation.plugin,
    inputs,
    options: invocation.options,
    config: invocation.config,
    grants: normalizedGrants(invocation.grants),
  });
}


export function createStepInvocationDigest(stepInvocation) {
  requireRecord(stepInvocation, "step invocation");
  const { stepInvocationDigest: ignored, ...material } = stepInvocation;
  return canonicalJsonDigest(material);
}

function createStepInvocation(material) {
  return immutableCopy({
    ...material,
    stepInvocationDigest: canonicalJsonDigest(material),
  });
}

function createChainFingerprint(invocation, operationDefinition) {
  const resume = operationDefinition.adapterChain?.resume;
  if (!resume) {
    return createInvocationFingerprint(invocation);
  }
  const normalized = normalizedInputs(invocation.inputs);
  const inputs = Object.fromEntries(
    resume.lineageInputs
      .filter((name) => Object.hasOwn(normalized, name))
      .map((name) => [name, normalized[name]]),
  );
  return canonicalJsonDigest({
    module: invocation.module,
    adapters: invocation.adapters.map((binding) => ({
      step: binding.step,
      plugin: binding.plugin,
      config: binding.config,
      grants: normalizedGrants(binding.grants),
    })),
    inputs,
    options: invocation.options,
  });
}
export function createModuleRegistry({
  modules = [],
  plugins = [],
  artifactContracts = [],
} = {}) {
  const moduleDefinitions = new Map();
  const moduleOptionValidators = new Map();
  const pluginRegistrations = new Map();
  const pluginConfigValidators = new Map();
  let artifactContractRegistry;
  try {
    artifactContractRegistry = createArtifactContractRegistry([
      {
        schema: MODULE_ROUTE_DECISION_SCHEMA,
        validate(value) {
          assertSchema(
            documentValidators.moduleRouteDecision,
            value,
            "DR2104",
            "module route decision",
          );
          return value;
        },
      },
      ...artifactContracts,
    ]);
  } catch (error) {
    if (error instanceof ArtifactRuntimeError) {
      const prefix = `${error.code}: `;
      fail(
        error.code,
        error.message.startsWith(prefix)
          ? error.message.slice(prefix.length)
          : error.message,
      );
    }
    throw error;
  }

  for (const suppliedDefinition of modules) {
    validateModuleDefinition(suppliedDefinition);
    if (suppliedDefinition.routing !== undefined) {
      try {
        validateModuleRouting(suppliedDefinition);
      } catch (error) {
        if (error instanceof RoutingError) {
          const prefix = `${error.code}: `;
          fail(
            error.code,
            error.message.startsWith(prefix)
              ? error.message.slice(prefix.length)
              : error.message,
          );
        }
        throw error;
      }
    }
    const definition = immutableCopy(suppliedDefinition);
    const key = exactKey(definition.metadata);
    if (moduleDefinitions.has(key)) {
      fail("DR1500", `duplicate module registration ${key}`);
    }
    moduleDefinitions.set(key, definition);
    for (const operation of definition.operations) {
      moduleOptionValidators.set(
        operationKey(definition.metadata, operation.id),
        compileContractSchema(
          operation.optionsSchema,
          "DR1208",
          `${key}#${operation.id}.optionsSchema`,
        ),
      );
    }
  }

  for (const registration of plugins) {
    requireRecord(registration, "plugin registration");
    validatePluginDefinition(registration.definition, moduleDefinitions);
    if (
      !isRecord(registration.adapter) ||
      typeof registration.adapter.invoke !== "function"
    ) {
      fail("DR1501", "plugin registration requires an adapter.invoke function");
    }
    const definition = immutableCopy(registration.definition);
    const key = exactKey(definition.metadata);
    if (pluginRegistrations.has(key)) {
      fail("DR1502", `duplicate plugin registration ${key}`);
    }
    pluginRegistrations.set(
      key,
      Object.freeze({
        definition,
        adapter: registration.adapter,
      }),
    );
    for (const implementation of definition.implements) {
      for (const operation of implementation.operations) {
        pluginConfigValidators.set(
          bindingKey(
            definition.metadata,
            implementation.module,
            operation.id,
            operation.step,
          ),
          compileContractSchema(
            operation.configSchema,
            "DR1309",
            `${key}=>${exactKey(implementation.module)}#${operation.id}${operation.step === undefined ? "" : `/${operation.step}`}.configSchema`,
          ),
        );
      }
    }
  }

  function resolveSingle(invocation) {
    assertSchema(
      documentValidators.moduleInvocation,
      invocation,
      "DR1606",
      "module invocation",
    );
    requireRecord(invocation, "invocation");
    requireRecord(invocation.module, "invocation.module");
    requireRecord(invocation.plugin, "invocation.plugin");
    requireString(invocation.module.operation, "invocation.module.operation");

    const moduleKey = exactKey(invocation.module);
    const moduleDefinition = moduleDefinitions.get(moduleKey);
    if (!moduleDefinition) {
      fail("DR1600", `module ${moduleKey} is not registered`);
    }
    const operationDefinition = operationById(
      moduleDefinition,
      invocation.module.operation,
    );
    if (!operationDefinition) {
      fail(
        "DR1601",
        `operation ${moduleKey}#${invocation.module.operation} is not declared`,
      );
    }

    const pluginKey = exactKey(invocation.plugin);
    const registration = pluginRegistrations.get(pluginKey);
    if (!registration) {
      fail("DR1602", `plugin ${pluginKey} is not registered`);
    }
    const pluginOperation = findPluginOperation(
      registration.definition,
      invocation.module,
      invocation.module.operation,
    );
    if (!pluginOperation) {
      fail(
        "DR1603",
        `plugin ${pluginKey} does not implement ${moduleKey}#${invocation.module.operation}`,
      );
    }

    assertSchema(
      moduleOptionValidators.get(
        operationKey(invocation.module, invocation.module.operation),
      ),
      invocation.options,
      "DR1607",
      "module invocation options",
    );
    assertSchema(
      pluginConfigValidators.get(
        bindingKey(
          invocation.plugin,
          invocation.module,
          invocation.module.operation,
        ),
      ),
      invocation.config,
      "DR1608",
      "module plug-in configuration",
    );
    validateInputs(invocation, operationDefinition);
    requireRecord(invocation.options, "invocation.options");
    requireRecord(invocation.config, "invocation.config");
    requireArray(invocation.grants, "invocation.grants");
    for (const [index, grant] of invocation.grants.entries()) {
      const label = `invocation.grants[${index}]`;
      requireRecord(grant, label);
      if (!CAPABILITY_KINDS.has(grant.kind)) {
        fail("DR1605", `${label}.kind is invalid`);
      }
      requireString(grant.scope, `${label}.scope`);
    }
    const grantKinds = new Set(invocation.grants.map(({ kind }) => kind));
    for (const capability of pluginOperation.capabilities) {
      if (!grantKinds.has(capability.kind)) {
        fail(
          "DR1604",
          `plugin ${pluginKey} requires an ungranted ${capability.kind} capability`,
        );
      }
    }

    return Object.freeze({
      moduleDefinition,
      operationDefinition,
      pluginDefinition: registration.definition,
      pluginOperation,
      adapter: registration.adapter,
      invocationFingerprint: createInvocationFingerprint(invocation),
    });
  }


  function resolve(invocation) {
    assertSchema(
      documentValidators.moduleInvocation,
      invocation,
      "DR1606",
      "module invocation",
    );
    requireRecord(invocation, "invocation");
    requireRecord(invocation.module, "invocation.module");
    requireString(invocation.module.operation, "invocation.module.operation");

    const moduleKey = exactKey(invocation.module);
    const moduleDefinition = moduleDefinitions.get(moduleKey);
    if (!moduleDefinition) {
      fail("DR1600", `module ${moduleKey} is not registered`);
    }
    const operationDefinition = operationById(
      moduleDefinition,
      invocation.module.operation,
    );
    if (!operationDefinition) {
      fail(
        "DR1601",
        `operation ${moduleKey}#${invocation.module.operation} is not declared`,
      );
    }

    if (invocation.adapters === undefined) {
      if (operationDefinition.adapterChain !== undefined) {
        fail(
          "DR1610",
          `operation ${moduleKey}#${invocation.module.operation} requires an adapter chain`,
        );
      }
      return Object.freeze({ mode: "single", ...resolveSingle(invocation) });
    }
    if (operationDefinition.adapterChain === undefined) {
      fail(
        "DR1611",
        `operation ${moduleKey}#${invocation.module.operation} does not accept an adapter chain`,
      );
    }

    assertSchema(
      moduleOptionValidators.get(
        operationKey(invocation.module, invocation.module.operation),
      ),
      invocation.options,
      "DR1607",
      "module invocation options",
    );
    requireRecord(invocation.options, "invocation.options");
    validateInputs(invocation, operationDefinition);

    const declaredSteps = operationDefinition.adapterChain.steps;
    if (invocation.adapters.length !== declaredSteps.length) {
      fail(
        "DR1612",
        `adapter chain requires ${declaredSteps.length} ordered bindings`,
      );
    }

    const steps = declaredSteps.map((stepDefinition, index) => {
      const binding = invocation.adapters[index];
      if (binding.step !== stepDefinition.id) {
        fail(
          "DR1613",
          `adapter binding ${index} must target step "${stepDefinition.id}"`,
        );
      }
      const pluginKey = exactKey(binding.plugin);
      const registration = pluginRegistrations.get(pluginKey);
      if (!registration) {
        fail("DR1602", `plugin ${pluginKey} is not registered`);
      }
      const pluginOperation = findPluginOperation(
        registration.definition,
        invocation.module,
        invocation.module.operation,
        stepDefinition.id,
      );
      if (!pluginOperation) {
        fail(
          "DR1603",
          `plugin ${pluginKey} does not implement ${moduleKey}#${invocation.module.operation}/${stepDefinition.id}`,
        );
      }
      assertSchema(
        pluginConfigValidators.get(
          bindingKey(
            binding.plugin,
            invocation.module,
            invocation.module.operation,
            stepDefinition.id,
          ),
        ),
        binding.config,
        "DR1608",
        `module plug-in configuration for step ${stepDefinition.id}`,
      );
      requireRecord(binding.config, `invocation.adapters[${index}].config`);
      validateGrants(
        binding.grants,
        pluginOperation,
        pluginKey,
        `invocation.adapters[${index}].grants`,
      );
      return Object.freeze({
        stepDefinition,
        pluginDefinition: registration.definition,
        pluginOperation,
        adapter: registration.adapter,
        binding: immutableCopy(binding),
      });
    });

    return Object.freeze({
      mode: "chain",
      moduleDefinition,
      operationDefinition,
      steps: Object.freeze(steps),
      invocationFingerprint: createInvocationFingerprint(invocation),
      chainFingerprint: createChainFingerprint(invocation, operationDefinition),
    });
  }
  function validateResult(invocation, result) {
    const resolution = resolve(invocation);
    assertSchema(
      documentValidators.moduleResult,
      result,
      "DR1709",
      "module result",
    );
    requireRecord(result, "result");
    if (result.invocationId !== invocation.invocationId) {
      fail("DR1700", "result invocationId does not match invocation");
    }
    const resultContracts = resolution.operationDefinition.resultContracts;
    if (!Object.hasOwn(resultContracts, result.outcome)) {
      fail("DR1701", `result outcome "${result.outcome}" is not declared`);
    }
    const contract = resultContracts[result.outcome];
    if (result.status !== contract.status) {
      fail(
        "DR1702",
        `outcome "${result.outcome}" requires status "${contract.status}"`,
      );
    }
    for (const requiredInput of contract.requiredInputs) {
      if (!Object.hasOwn(invocation.inputs, requiredInput)) {
        fail(
          "DR1703",
          `outcome "${result.outcome}" requires input "${requiredInput}"`,
        );
      }
    }
    for (const forbiddenInput of contract.forbiddenInputs) {
      if (Object.hasOwn(invocation.inputs, forbiddenInput)) {
        fail(
          "DR1710",
          `outcome "${result.outcome}" forbids input "${forbiddenInput}"`,
        );
      }
    }

    requireRecord(result.outputs, "result.outputs");
    const outputPorts = new Map(
      resolution.operationDefinition.outputs.map((port) => [port.name, port]),
    );
    for (const requiredOutput of contract.requiredOutputs) {
      if (!Object.hasOwn(result.outputs, requiredOutput)) {
        fail(
          "DR1704",
          `outcome "${result.outcome}" requires output "${requiredOutput}"`,
        );
      }
    }
    for (const [name, artifacts] of Object.entries(result.outputs)) {
      if (!contract.allowedOutputs.includes(name)) {
        fail(
          "DR1705",
          `outcome "${result.outcome}" does not allow output "${name}"`,
        );
      }
      validateArtifacts(artifacts, outputPorts.get(name), `output.${name}`);
    }

    requireArray(result.evidence, "result.evidence");
    const evidenceClaims = new Set();
    for (const evidence of result.evidence) {
      if (!resolution.operationDefinition.evidence.includes(evidence.kind)) {
        fail("DR1706", `evidence kind "${evidence.kind}" is not declared`);
      }
      const claimKey = `${evidence.kind}\u0000${evidence.subject}`;
      if (evidenceClaims.has(claimKey)) {
        fail(
          "DR1711",
          `duplicate evidence claim for ${evidence.kind} on ${evidence.subject}`,
        );
      }
      evidenceClaims.add(claimKey);
    }
    for (const requirement of contract.requiredEvidence) {
      const expectedArtifacts =
        requirement.artifactOutput === undefined
          ? undefined
          : result.outputs[requirement.artifactOutput];
      const satisfied = result.evidence.some((evidence) => {
        const statusMatches =
          evidence.kind === requirement.kind &&
          requirement.statuses.includes(evidence.status);
        if (!statusMatches || expectedArtifacts === undefined) {
          return statusMatches && requirement.artifactOutput === undefined;
        }
        return expectedArtifacts.some(
          (artifact) =>
            evidence.artifact?.artifactId === artifact.artifactId &&
            evidence.artifact?.digest === artifact.digest,
        );
      });
      if (!satisfied) {
        fail(
          "DR1707",
          `outcome "${result.outcome}" requires ${requirement.kind} evidence with status ${requirement.statuses.join(" or ")}${requirement.artifactOutput === undefined ? "" : ` bound to ${requirement.artifactOutput}`}`,
        );
      }
    }

    requireArray(result.diagnostics, "result.diagnostics");
    if (contract.diagnosticsRequired && result.diagnostics.length === 0) {
      fail(
        "DR1708",
        `outcome "${result.outcome}" requires at least one diagnostic`,
      );
    }
    return result;
  }

  function runtimeFailure(error) {
    if (error instanceof ArtifactRuntimeError) {
      const prefix = `${error.code}: `;
      fail(
        error.code,
        error.message.startsWith(prefix)
          ? error.message.slice(prefix.length)
          : error.message,
      );
    }
    if (error instanceof RoutingError) {
      const prefix = `${error.code}: `;
      fail(
        error.code,
        error.message.startsWith(prefix)
          ? error.message.slice(prefix.length)
          : error.message,
      );
    }
    throw error;
  }

  async function runtimeAction(action) {
    try {
      return await action();
    } catch (error) {
      runtimeFailure(error);
    }
  }

  function runtimeSchemas(operation) {
    const ports = [...operation.inputs, ...operation.outputs];
    for (const step of operation.adapterChain?.steps ?? []) {
      ports.push(...(step.outputs ?? []));
    }
    return new Set(ports.map(({ schema }) => schema));
  }

  function requireCheckpointStore(resolution, checkpoints) {
    const needsCheckpoint =
      (resolution.mode === "single" &&
        resolution.pluginOperation.execution === "effect") ||
      (resolution.mode === "chain" &&
        (resolution.operationDefinition.adapterChain.resume !== undefined ||
          resolution.steps.some(
            ({ pluginOperation }) => pluginOperation.execution === "effect",
          )));
    if (!needsCheckpoint) {
      return;
    }
    if (
      !isRecord(checkpoints) ||
      typeof checkpoints.get !== "function" ||
      typeof checkpoints.put !== "function"
    ) {
      fail(
        "DR2200",
        "checkpointed module execution requires context.checkpoints.get and context.checkpoints.put",
      );
    }
  }

  function exposeLoadedArtifacts(loadedByPort) {
    if (loadedByPort === undefined) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(loadedByPort).map(([port, artifacts]) => [
        port,
        artifacts.map(({ ref, value }) => ({ ref, value })),
      ]),
    );
  }

  async function loadPortArtifacts(
    references,
    ports,
    phase,
    runtime,
    producer,
  ) {
    const portDefinitions = new Map(ports.map((port) => [port.name, port]));
    const loadedByPort = {};
    for (const [portName, refs] of Object.entries(references)) {
      const port = portDefinitions.get(portName);
      if (!port) {
        fail("DR2104", `${phase} references undeclared port "${portName}"`);
      }
      loadedByPort[portName] = [];
      for (const ref of refs) {
        const loaded = await runtimeAction(() =>
          loadArtifactContent(ref, runtime.context.artifacts),
        );
        loadedByPort[portName].push(loaded);
      }
    }

    const effectiveInputs =
      phase === "input" ? loadedByPort : runtime.loadedInputs;
    const loadAttached = async (ref) => {
      const loaded = await runtimeAction(() =>
        loadArtifactContent(ref, runtime.context.artifacts),
      );
      return loaded.value;
    };

    for (const [portName, artifacts] of Object.entries(loadedByPort)) {
      for (const loaded of artifacts) {
        await runtimeAction(() =>
          validateLoadedArtifact(loaded, artifactContractRegistry, {
            phase,
            port: portName,
            invocation: runtime.invocation,
            operation: runtime.resolution.operationDefinition,
            loadedInputs: exposeLoadedArtifacts(effectiveInputs),
            loadedHandoffs: Object.fromEntries(
              Object.entries(runtime.loadedHandoffs).map(([step, outputs]) => [
                step,
                exposeLoadedArtifacts(outputs),
              ]),
            ),
            priorResults: runtime.priorResults,
            chainFingerprint: runtime.resolution.chainFingerprint,
            producer: producer === undefined ? undefined : immutableCopy(producer),
            load: loadAttached,
          }),
        );
      }
    }
    return loadedByPort;
  }

  async function enforceDeterministicRoute(runtime) {
    const { moduleDefinition } = runtime.resolution;
    if (moduleDefinition.routing === undefined) {
      return;
    }
    const { stateInput, decisionInput } = moduleDefinition.routing;
    const state = runtime.loadedInputs[stateInput]?.[0];
    const decision = runtime.loadedInputs[decisionInput]?.[0];
    if (!state || !decision) {
      fail("DR2105", "routed execution is missing its state or route decision");
    }
    const stateContract = artifactContractRegistry.get(state.ref.schema);
    const expected = await runtimeAction(() =>
      selectModuleRoute(moduleDefinition, {
        stateArtifactBytes: state.bytes,
        stateArtifactRef: state.ref,
        validateStateArtifact: (value, validationContext) =>
          stateContract.validate(value, {
            ...validationContext,
            invocation: runtime.invocation,
            loadedInputs: exposeLoadedArtifacts(runtime.loadedInputs),
          }),
      }),
    );
    if (canonicalJsonDigest(expected) !== canonicalJsonDigest(decision.value)) {
      fail(
        "DR2105",
        "persisted route decision does not match the digest-verified current state",
      );
    }
    try {
      assertInvocationMatchesRoute(decision.value, runtime.invocation);
    } catch (error) {
      runtimeFailure(error);
    }
  }

  function validateStepResultBinding(stepInvocation, result) {
    assertSchema(
      documentValidators.moduleStepResult,
      result,
      "DR1801",
      `step ${stepInvocation.step} result`,
    );
    if (
      result.invocationId !== stepInvocation.invocationId ||
      result.step !== stepInvocation.step
    ) {
      fail(
        "DR1802",
        `step ${stepInvocation.step} result identity does not match its invocation`,
      );
    }
    if (result.invocationFingerprint !== stepInvocation.invocationFingerprint) {
      fail(
        "DR1808",
        `step ${stepInvocation.step} result fingerprint does not match its invocation`,
      );
    }
    if (result.chainFingerprint !== stepInvocation.chainFingerprint) {
      fail(
        "DR1810",
        `step ${stepInvocation.step} result chain fingerprint does not match its invocation`,
      );
    }
    if (result.stepInvocationDigest !== stepInvocation.stepInvocationDigest) {
      fail(
        "DR1810",
        `step ${stepInvocation.step} result digest does not match its complete invocation`,
      );
    }
    if (
      result.plugin.id !== stepInvocation.plugin.id ||
      result.plugin.version !== stepInvocation.plugin.version
    ) {
      fail(
        "DR1809",
        `step ${stepInvocation.step} result plug-in does not match its invocation`,
      );
    }
  }

  function stepCheckpointKeyFromDigest(stepInvocationDigest) {
    return canonicalJsonDigest({
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ModuleStepCheckpointKey",
      stepInvocationDigest,
    });
  }

  function stepCheckpointKey(stepInvocation) {
    return stepCheckpointKeyFromDigest(stepInvocation.stepInvocationDigest);
  }

  async function readCheckpoint(checkpoints, key) {
    try {
      return await checkpoints.get(key);
    } catch (error) {
      fail("DR2201", `checkpoint read failed: ${error.message}`);
    }
  }

  async function writeCheckpoint(checkpoints, key, result) {
    try {
      await checkpoints.put(key, result);
    } catch (error) {
      fail("DR2202", `checkpoint write failed: ${error.message}`);
    }
  }

  async function adapterContextFor(context, descriptor) {
    if (context.adapterContext !== undefined) {
      fail(
        "DR2300",
        "shared context.adapterContext is forbidden; use createAdapterContext",
      );
    }
    if (context.createAdapterContext === undefined) {
      return Object.freeze({});
    }
    if (typeof context.createAdapterContext !== "function") {
      fail("DR2300", "createAdapterContext must be a function");
    }
    let supplied;
    try {
      supplied = await context.createAdapterContext(immutableCopy(descriptor));
    } catch (error) {
      fail("DR2301", `adapter context creation failed: ${error.message}`);
    }
    if (!isRecord(supplied)) {
      fail("DR2301", "createAdapterContext must return a plain object");
    }
    try {
      return immutableCopy(supplied);
    } catch (error) {
      fail(
        "DR2301",
        `adapter context must be plain, acyclic JSON data: ${error.message}`,
      );
    }
  }

  function producerFor(stepInvocation) {
    return {
      step: stepInvocation.step,
      plugin: stepInvocation.plugin,
      invocationFingerprint: stepInvocation.invocationFingerprint,
      chainFingerprint: stepInvocation.chainFingerprint,
      stepInvocationDigest: stepInvocation.stepInvocationDigest,
    };
  }

  function singleStepInvocation(invocation, resolution) {
    return createStepInvocation({
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ModuleStepInvocation",
      invocationId: invocation.invocationId,
      runId: invocation.runId,
      nodeId: invocation.nodeId,
      invocationFingerprint: resolution.invocationFingerprint,
      chainFingerprint: resolution.invocationFingerprint,
      module: invocation.module,
      step: "single-adapter",
      plugin: invocation.plugin,
      inputs: invocation.inputs,
      priorResults: [],
      options: invocation.options,
      config: invocation.config,
      grants: invocation.grants,
    });
  }

  async function executeSingle(runtime) {
    const { invocation, resolution, context } = runtime;
    const effectful = resolution.pluginOperation.execution === "effect";
    const stepInvocation = effectful
      ? singleStepInvocation(invocation, resolution)
      : undefined;
    const checkpointKey = effectful
      ? stepCheckpointKey(stepInvocation)
      : undefined;
    const checkpoint = effectful
      ? await readCheckpoint(context.checkpoints, checkpointKey)
      : undefined;
    const fromCheckpoint = checkpoint !== undefined && checkpoint !== null;
    let result;

    if (fromCheckpoint) {
      const envelope = immutableCopy(checkpoint);
      validateStepResultBinding(stepInvocation, envelope);
      if (envelope.disposition !== "terminal") {
        fail("DR1811", "single-adapter checkpoint must be terminal");
      }
      result = validateResult(invocation, envelope.moduleResult);
    } else {
      const adapterContext = await adapterContextFor(context, {
        module: invocation.module,
        step: "single-adapter",
        plugin: invocation.plugin,
        grants: invocation.grants,
      });
      result = validateResult(
        invocation,
        immutableCopy(
          await resolution.adapter.invoke(invocation, adapterContext),
        ),
      );
    }

    await loadPortArtifacts(
      result.outputs,
      resolution.operationDefinition.outputs,
      "output",
      runtime,
      stepInvocation === undefined ? undefined : producerFor(stepInvocation),
    );

    if (effectful && !fromCheckpoint) {
      await writeCheckpoint(context.checkpoints, checkpointKey, {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "ModuleStepResult",
        invocationId: stepInvocation.invocationId,
        invocationFingerprint: stepInvocation.invocationFingerprint,
        chainFingerprint: stepInvocation.chainFingerprint,
        stepInvocationDigest: stepInvocation.stepInvocationDigest,
        step: stepInvocation.step,
        plugin: stepInvocation.plugin,
        disposition: "terminal",
        moduleResult: result,
      });
    }
    return result;
  }

  async function prepareResume(runtime) {
    const resume = runtime.resolution.operationDefinition.adapterChain?.resume;
    if (!resume) {
      return 0;
    }
    const loaded = runtime.loadedInputs[resume.continuationInput];
    if (!loaded) {
      return 0;
    }
    const continuation = loaded[0].value;
    if (
      continuation[resume.chainFingerprintField] !==
      runtime.resolution.chainFingerprint
    ) {
      fail("DR2210", "continuation chain fingerprint does not match invocation");
    }
    const source =
      continuation[resume.sourceInvocationField];
    const sourceInvocationId =
      source?.[resume.sourceInvocationIdField];
    const sourceInvocationFingerprint =
      source?.[resume.sourceInvocationFingerprintField];
    if (
      typeof sourceInvocationId !== "string" ||
      typeof sourceInvocationFingerprint !== "string"
    ) {
      fail("DR2211", "continuation source invocation is incomplete");
    }

    const activeStep = continuation[resume.activeStepField];
    const startIndex = runtime.resolution.steps.findIndex(
      ({ stepDefinition }) => stepDefinition.id === activeStep,
    );
    if (startIndex < 0) {
      fail("DR2211", "continuation active step is not declared by the chain");
    }
    const completed = continuation[resume.completedStepsField];
    if (!Array.isArray(completed) || completed.length !== startIndex) {
      fail("DR2211", "continuation completed steps are not the active-step prefix");
    }

    for (let index = 0; index < completed.length; index += 1) {
      const recorded = completed[index];
      const plan = runtime.resolution.steps[index];
      const step = recorded[resume.completedStepIdField];
      const plugin = recorded[resume.completedStepPluginField];
      const outputs = recorded[resume.completedStepOutputsField];
      const stepInvocationDigest =
        recorded[resume.completedStepInvocationDigestField];
      const stepResultDigest =
        recorded[resume.completedStepResultDigestField];
      if (
        step !== plan.stepDefinition.id ||
        plugin?.id !== plan.binding.plugin.id ||
        plugin?.version !== plan.binding.plugin.version
      ) {
        fail("DR2211", "continuation completed-step identity is invalid");
      }
      if (plan.stepDefinition.kind !== "handoff") {
        fail("DR2211", "continuation cannot skip a terminal step");
      }
      if (
        typeof stepInvocationDigest !== "string" ||
        typeof stepResultDigest !== "string"
      ) {
        fail("DR2211", "continuation completed-step digests are missing");
      }

      const checkpoint = await readCheckpoint(
        runtime.context.checkpoints,
        stepCheckpointKeyFromDigest(stepInvocationDigest),
      );
      if (checkpoint === undefined || checkpoint === null) {
        fail("DR2212", `source checkpoint for completed step ${step} is missing`);
      }
      const result = immutableCopy(checkpoint);
      assertSchema(
        documentValidators.moduleStepResult,
        result,
        "DR2212",
        `source checkpoint for completed step ${step}`,
      );
      if (
        result.disposition !== "continue" ||
        result.invocationId !== sourceInvocationId ||
        result.invocationFingerprint !== sourceInvocationFingerprint ||
        result.chainFingerprint !== runtime.resolution.chainFingerprint ||
        result.stepInvocationDigest !== stepInvocationDigest ||
        result.step !== step ||
        result.plugin.id !== plugin.id ||
        result.plugin.version !== plugin.version ||
        canonicalJsonDigest(result) !== stepResultDigest ||
        canonicalJsonDigest(result.outputs) !== canonicalJsonDigest(outputs)
      ) {
        fail("DR2212", `source checkpoint for completed step ${step} is invalid`);
      }

      validateStepOutputs(result.outputs, plan.stepDefinition);
      const producer = {
        step,
        plugin,
        invocationFingerprint: sourceInvocationFingerprint,
        chainFingerprint: runtime.resolution.chainFingerprint,
        stepInvocationDigest,
      };
      runtime.loadedHandoffs[step] = await loadPortArtifacts(
        result.outputs,
        plan.stepDefinition.outputs,
        "handoff",
        runtime,
        producer,
      );
      runtime.priorResults.push(
        immutableCopy({
          step,
          plugin,
          stepInvocationDigest,
          digest: stepResultDigest,
          outputs: result.outputs,
        }),
      );
    }
    return startIndex;
  }

  async function execute(invocation, context = {}) {
    const invocationSnapshot = immutableCopy(invocation);
    const resolution = resolve(invocationSnapshot);
    try {
      requireArtifactLoader(context.artifacts);
      requireArtifactContracts(
        runtimeSchemas(resolution.operationDefinition),
        artifactContractRegistry,
      );
    } catch (error) {
      runtimeFailure(error);
    }
    requireCheckpointStore(resolution, context.checkpoints);

    const runtime = {
      context,
      invocation: invocationSnapshot,
      resolution,
      loadedInputs: undefined,
      loadedHandoffs: {},
      priorResults: [],
    };
    runtime.loadedInputs = await loadPortArtifacts(
      invocationSnapshot.inputs,
      resolution.operationDefinition.inputs,
      "input",
      runtime,
    );
    await enforceDeterministicRoute(runtime);

    if (resolution.mode === "single") {
      return executeSingle(runtime);
    }

    const startIndex = await prepareResume(runtime);
    for (const plan of resolution.steps.slice(startIndex)) {
      const stepInvocation = createStepInvocation({
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "ModuleStepInvocation",
        invocationId: invocationSnapshot.invocationId,
        runId: invocationSnapshot.runId,
        nodeId: invocationSnapshot.nodeId,
        invocationFingerprint: resolution.invocationFingerprint,
        chainFingerprint: resolution.chainFingerprint,
        module: invocationSnapshot.module,
        step: plan.stepDefinition.id,
        plugin: plan.binding.plugin,
        inputs: invocationSnapshot.inputs,
        priorResults: runtime.priorResults,
        options: invocationSnapshot.options,
        config: plan.binding.config,
        grants: plan.binding.grants,
      });
      assertSchema(
        documentValidators.moduleStepInvocation,
        stepInvocation,
        "DR1800",
        `step ${plan.stepDefinition.id} invocation`,
      );

      const effectful = plan.pluginOperation.execution === "effect";
      const checkpointed =
        effectful ||
        resolution.operationDefinition.adapterChain.resume !== undefined;
      const checkpointKey = checkpointed
        ? stepCheckpointKey(stepInvocation)
        : undefined;
      const checkpoint = checkpointed
        ? await readCheckpoint(context.checkpoints, checkpointKey)
        : undefined;
      const fromCheckpoint = checkpoint !== undefined && checkpoint !== null;
      const stepResult = immutableCopy(
        fromCheckpoint
          ? checkpoint
          : await plan.adapter.invoke(
              stepInvocation,
              await adapterContextFor(context, {
                module: invocationSnapshot.module,
                step: plan.stepDefinition.id,
                plugin: plan.binding.plugin,
                grants: plan.binding.grants,
              }),
            ),
      );
      validateStepResultBinding(stepInvocation, stepResult);
      const producer = producerFor(stepInvocation);

      if (stepResult.disposition === "terminal") {
        const moduleResult = validateResult(
          invocationSnapshot,
          stepResult.moduleResult,
        );
        if (
          plan.stepDefinition.kind !== "terminal" &&
          !resolution.operationDefinition.adapterChain.earlyTerminalOutcomes.includes(
            moduleResult.outcome,
          )
        ) {
          fail(
            "DR1805",
            `step ${plan.stepDefinition.id} cannot terminate with outcome "${moduleResult.outcome}"`,
          );
        }
        await loadPortArtifacts(
          moduleResult.outputs,
          resolution.operationDefinition.outputs,
          "output",
          runtime,
          producer,
        );
        if (checkpointed && !fromCheckpoint) {
          await writeCheckpoint(context.checkpoints, checkpointKey, stepResult);
        }
        return moduleResult;
      }

      if (plan.stepDefinition.kind === "terminal") {
        fail(
          "DR1806",
          `terminal step ${plan.stepDefinition.id} must return a terminal result`,
        );
      }
      validateStepOutputs(stepResult.outputs, plan.stepDefinition);
      const loadedHandoff = await loadPortArtifacts(
        stepResult.outputs,
        plan.stepDefinition.outputs,
        "handoff",
        runtime,
        producer,
      );
      runtime.loadedHandoffs[plan.stepDefinition.id] = loadedHandoff;
      if (checkpointed && !fromCheckpoint) {
        await writeCheckpoint(context.checkpoints, checkpointKey, stepResult);
      }
      runtime.priorResults.push(
        immutableCopy({
          step: plan.stepDefinition.id,
          plugin: plan.binding.plugin,
          stepInvocationDigest: stepInvocation.stepInvocationDigest,
          digest: canonicalJsonDigest(stepResult),
          outputs: stepResult.outputs,
        }),
      );
    }

    fail("DR1807", "adapter chain completed without a terminal result");
  }

  async function selectOperation(moduleRef, stateArtifactRef, context = {}) {
    const key = exactKey(moduleRef);
    const moduleDefinition = moduleDefinitions.get(key);
    if (!moduleDefinition) {
      fail("DR1600", `module ${key} is not registered`);
    }
    if (moduleDefinition.routing === undefined) {
      fail("DR1900", `module ${key} does not declare deterministic routing`);
    }
    try {
      requireArtifactLoader(context.artifacts);
      requireArtifactContracts(
        [moduleDefinition.routing.stateSchema],
        artifactContractRegistry,
      );
      const loaded = await loadArtifactContent(
        stateArtifactRef,
        context.artifacts,
      );
      const contract = artifactContractRegistry.get(stateArtifactRef.schema);
      return await selectModuleRoute(moduleDefinition, {
        stateArtifactBytes: loaded.bytes,
        stateArtifactRef,
        validateStateArtifact: contract.validate,
      });
    } catch (error) {
      runtimeFailure(error);
    }
  }

  return Object.freeze({
    selectOperation,
    resolve,
    validateResult,
    execute,
    moduleCount: moduleDefinitions.size,
    pluginCount: pluginRegistrations.size,
  });
}
