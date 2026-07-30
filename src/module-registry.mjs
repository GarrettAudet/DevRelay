import { canonicalJsonDigest } from "./content-digest.mjs";

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

function bindingKey(pluginRef, moduleRef, operationId) {
  return `${exactKey(pluginRef)}=>${operationKey(moduleRef, operationId)}`;
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
  }
}

function findPluginOperation(definition, moduleRef, operationId) {
  const implementation = definition.implements.find(
    ({ module }) =>
      module.id === moduleRef.id && module.version === moduleRef.version,
  );
  if (!implementation) {
    return undefined;
  }
  return implementation.operations.find(({ id }) => id === operationId);
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
      implementation.operations.map(({ id }) => id),
      `${moduleKey} plugin operation IDs`,
    );

    for (const pluginOperation of implementation.operations) {
      requireRecord(pluginOperation, "plugin operation");
      requireString(pluginOperation.id, "plugin operation.id");
      if (!operationById(moduleDefinition, pluginOperation.id)) {
        fail(
          "DR1305",
          `plugin implements undeclared operation ${moduleKey}#${pluginOperation.id}`,
        );
      }
      if (!["pure", "effect"].includes(pluginOperation.execution)) {
        fail("DR1306", `${moduleKey}#${pluginOperation.id} execution is invalid`);
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
      targetKeys.push(`${moduleKey}#${pluginOperation.id}`);
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


function immutableCopy(value) {
  const copy = structuredClone(value);
  const freeze = (item) => {
    if (item !== null && typeof item === "object" && !Object.isFrozen(item)) {
      Object.freeze(item);
      for (const child of Object.values(item)) {
        freeze(child);
      }
    }
    return item;
  };
  return freeze(copy);
}

export function createInvocationFingerprint(invocation) {
  requireRecord(invocation, "invocation");
  requireRecord(invocation.module, "invocation.module");
  requireRecord(invocation.plugin, "invocation.plugin");
  requireRecord(invocation.inputs, "invocation.inputs");
  requireRecord(invocation.options, "invocation.options");
  requireRecord(invocation.config, "invocation.config");
  requireArray(invocation.grants, "invocation.grants");

  const inputs = Object.fromEntries(
    Object.entries(invocation.inputs).map(([port, artifacts]) => [
      port,
      artifacts.map(({ schema, mediaType, digest }) => ({
        schema,
        mediaType,
        digest,
      })),
    ]),
  );
  const grants = invocation.grants
    .map(({ kind, scope }) => ({ kind, scope }))
    .sort((left, right) => {
      const leftKey = `${left.kind}\u0000${left.scope}`;
      const rightKey = `${right.kind}\u0000${right.scope}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  return canonicalJsonDigest({
    module: invocation.module,
    plugin: invocation.plugin,
    inputs,
    options: invocation.options,
    config: invocation.config,
    grants,
  });
}

export function createModuleRegistry({ modules = [], plugins = [] } = {}) {
  const moduleDefinitions = new Map();
  const moduleOptionValidators = new Map();
  const pluginRegistrations = new Map();
  const pluginConfigValidators = new Map();

  for (const suppliedDefinition of modules) {
    validateModuleDefinition(suppliedDefinition);
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
          bindingKey(definition.metadata, implementation.module, operation.id),
          compileContractSchema(
            operation.configSchema,
            "DR1309",
            `${key}=>${exactKey(implementation.module)}#${operation.id}.configSchema`,
          ),
        );
      }
    }
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

  return Object.freeze({
    resolve,
    validateResult,
    moduleCount: moduleDefinitions.size,
    pluginCount: pluginRegistrations.size,
  });
}
