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
  loadArtifactBytes,
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

import {
  createGraphAwareInvocationFingerprint,
  createTraceCheckpointKey,
  validateModuleExecutionRecord,
} from "./module-execution-record-validator.mjs";

const verifiedCheckpointReplayReceipts = new WeakSet();
const traceabilityExecutionCapture = Symbol("traceabilityExecutionCapture");

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

export function assertVerifiedCheckpointReplayReceipt(receipt) {
  if (!isRecord(receipt) || !verifiedCheckpointReplayReceipts.has(receipt)) {
    fail(
      "DR2214",
      "requirements gate requires an in-process verified checkpoint replay receipt",
    );
  }
  return receipt;
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

function validatePortMediaTypes(mediaTypes, label) {
  requireArray(mediaTypes, label);
  if (mediaTypes.length === 0) {
    fail("DR1101", `${label} must not be empty`);
  }
  assertUnique(mediaTypes, label);
}

function portVariants(port, label = "port") {
  const hasSchema = Object.hasOwn(port, "schema");
  const hasVariants = Object.hasOwn(port, "variants");
  if (hasSchema === hasVariants) {
    fail(
      "DR1104",
      `${label} must declare exactly one of schema or variants`,
    );
  }
  if (hasSchema) {
    requireString(port.schema, `${label}.schema`);
    validatePortMediaTypes(port.mediaTypes, `${label}.mediaTypes`);
    return [{ schema: port.schema, mediaTypes: port.mediaTypes }];
  }
  requireArray(port.variants, `${label}.variants`);
  if (port.variants.length < 2) {
    fail("DR1104", `${label}.variants must contain at least two variants`);
  }
  for (const [index, variant] of port.variants.entries()) {
    requireRecord(variant, `${label}.variants[${index}]`);
    requireString(variant.schema, `${label}.variants[${index}].schema`);
    validatePortMediaTypes(
      variant.mediaTypes,
      `${label}.variants[${index}].mediaTypes`,
    );
  }
  assertUnique(
    port.variants.map(({ schema }) => schema),
    `${label}.variant schemas`,
  );
  return port.variants;
}

function portSchemas(port, label = "port") {
  return portVariants(port, label).map(({ schema }) => schema);
}

function validatePort(port, label) {
  requireRecord(port, label);
  requireString(port.name, `${label}.name`);
  portVariants(port, label);
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
    if (
      operation.adapterExecution !== undefined &&
      !["pure", "effect"].includes(operation.adapterExecution)
    ) {
      fail("DR1215", `${operation.id}.adapterExecution is invalid`);
    }

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
      if (rule.forbid !== undefined) {
        assertNamesExist(
          rule.forbid,
          inputNames,
          `${operation.id}.inputRules[${index}].forbid`,
        );
      }
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
      if (
        operationDefinition.adapterExecution !== undefined &&
        pluginOperation.execution !== operationDefinition.adapterExecution
      ) {
        fail(
          "DR1313",
          `${moduleKey}#${pluginOperation.id} requires ${operationDefinition.adapterExecution} adapter execution`,
        );
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
        parseCapabilityScopeTemplate(capability.scope, `${label}.scope`);
      }
      assertUnique(
        pluginOperation.capabilities.map(capabilityKey),
        `${moduleKey}#${pluginOperation.id}.capabilities`,
      );
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
    const variant = portVariants(port).find(
      ({ schema }) => schema === artifact.schema,
    );
    if (variant === undefined) {
      fail("DR1402", `${label} artifact schema does not match its port`);
    }
    if (!variant.mediaTypes.includes(artifact.mediaType)) {
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
      for (const forbiddenInput of rule.forbid ?? []) {
        if (Object.hasOwn(invocation.inputs, forbiddenInput)) {
          fail(
            "DR1407",
            `input "${rule.ifPresent}" forbids input "${forbiddenInput}"`,
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

function parseCapabilityScopeTemplate(scope, label) {
  if (!scope.startsWith("config:")) {
    return { literal: scope };
  }
  const match = /^config:([A-Za-z][A-Za-z0-9_-]*)(\/.*)?$/.exec(scope);
  if (!match) {
    fail("DR1313", `${label} has an invalid configuration scope template`);
  }
  const suffix = match[2]?.slice(1);
  if (
    suffix !== undefined &&
    (suffix.includes("\\") ||
      suffix.split("/").some((segment) => !segment || segment === "." || segment === ".."))
  ) {
    fail("DR1313", `${label} has an invalid configuration scope suffix`);
  }
  return { field: match[1], suffix };
}

function resolveCapabilityScope(capability, config, label) {
  const template = parseCapabilityScopeTemplate(capability.scope, label);
  if (template.literal !== undefined) {
    return template.literal;
  }
  const base = config[template.field];
  if (typeof base !== "string" || base.length === 0) {
    fail(
      "DR1604",
      `${label} requires string config field "${template.field}"`,
    );
  }
  if (template.suffix === undefined) {
    return base;
  }
  return `${base.replace(/[\\/]+$/, "")}/${template.suffix}`;
}

function capabilityKey({ kind, scope }) {
  return `${kind}\u0000${scope}`;
}

function validateGrants(
  grants,
  pluginOperation,
  config,
  pluginKey,
  label,
) {
  requireArray(grants, label);
  const granted = new Set();
  for (const [index, grant] of grants.entries()) {
    const grantLabel = `${label}[${index}]`;
    requireRecord(grant, grantLabel);
    if (!CAPABILITY_KINDS.has(grant.kind)) {
      fail("DR1605", `${grantLabel}.kind is invalid`);
    }
    requireString(grant.scope, `${grantLabel}.scope`);
    const key = capabilityKey(grant);
    if (granted.has(key)) {
      fail("DR1604", `${grantLabel} duplicates an existing grant`);
    }
    granted.add(key);
  }

  const demanded = new Set();
  for (const [index, capability] of pluginOperation.capabilities.entries()) {
    const demand = capabilityKey({
      kind: capability.kind,
      scope: resolveCapabilityScope(
        capability,
        config,
        `plugin ${pluginKey} capability[${index}]`,
      ),
    });
    if (demanded.has(demand)) {
      fail(
        "DR1604",
        `plugin ${pluginKey} capabilities resolve to a duplicate demand`,
      );
    }
    demanded.add(demand);
  }
  for (const demand of demanded) {
    if (!granted.has(demand)) {
      const [kind, scope] = demand.split("\u0000");
      fail(
        "DR1604",
        `plugin ${pluginKey} requires exact grant ${kind}:${scope}`,
      );
    }
  }
  for (const grant of granted) {
    if (!demanded.has(grant)) {
      const [kind, scope] = grant.split("\u0000");
      fail(
        "DR1604",
        `plugin ${pluginKey} received undeclared grant ${kind}:${scope}`,
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

function requireTraceabilityRuntime(context) {
  const graph = context.traceabilityGraph;
  const checkpoints = context.traceabilityCheckpoints;
  if (!isRecord(graph)) {
    fail("DR2500", "graph-aware execution requires context.traceabilityGraph");
  }
  for (const method of [
    "captureBase",
    "prepare",
    "validatePrepared",
    "mergePrepared",
    "assertApplied",
  ]) {
    if (typeof graph[method] !== "function") {
      fail("DR2500", `traceabilityGraph.${method} must be a function`);
    }
  }
  requireString(graph.graphId, "traceabilityGraph.graphId");
  requireString(graph.projectId, "traceabilityGraph.projectId");
  if (
    !isRecord(checkpoints) ||
    typeof checkpoints.get !== "function" ||
    typeof checkpoints.putIfAbsent !== "function"
  ) {
    fail(
      "DR2500",
      "graph-aware execution requires context.traceabilityCheckpoints.get and .putIfAbsent",
    );
  }
  return { graph, checkpoints };
}

function assertTraceabilityArtifactRef(ref, label) {
  requireRecord(ref, label);
  for (const field of ["artifactId", "schema", "mediaType", "digest", "uri"]) {
    requireString(ref[field], `${label}.${field}`);
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(ref.digest)) {
    fail("DR2503", `${label}.digest must be a SHA-256 digest`);
  }
  try {
    new URL(ref.schema);
    new URL(ref.uri);
  } catch {
    fail("DR2503", `${label} must contain absolute schema and uri values`);
  }
  return ref;
}

function sameCanonicalValue(left, right) {
  return canonicalJsonDigest(left) === canonicalJsonDigest(right);
}

function snapshotTraceabilityConfiguration(configuration) {
  if (configuration === undefined) {
    return undefined;
  }
  requireRecord(configuration, "traceability configuration");
  if (
    !sameCanonicalValue(Object.keys(configuration).sort(), [
      "checkpoints",
      "graph",
    ])
  ) {
    fail(
      "DR2500",
      "traceability configuration must contain exactly graph and checkpoints",
    );
  }
  const { graph, checkpoints } = requireTraceabilityRuntime({
    traceabilityGraph: configuration.graph,
    traceabilityCheckpoints: configuration.checkpoints,
  });
  return Object.freeze({
    graph: Object.freeze({
      graphId: graph.graphId,
      projectId: graph.projectId,
      captureBase: graph.captureBase.bind(graph),
      prepare: graph.prepare.bind(graph),
      validatePrepared: graph.validatePrepared.bind(graph),
      mergePrepared: graph.mergePrepared.bind(graph),
      assertApplied: graph.assertApplied.bind(graph),
    }),
    checkpoints: Object.freeze({
      get: checkpoints.get.bind(checkpoints),
      putIfAbsent: checkpoints.putIfAbsent.bind(checkpoints),
    }),
  });
}

function traceabilityCheckpointKey(invocation, invocationFingerprint, graph) {
  requireString(graph.graphId, "traceabilityGraph.graphId");
  requireString(graph.projectId, "traceabilityGraph.projectId");
  return createTraceCheckpointKey({
    graphId: graph.graphId,
    projectId: graph.projectId,
    invocationId: invocation.invocationId,
    runId: invocation.runId,
    nodeId: invocation.nodeId,
    module: invocation.module,
    invocationFingerprint,
  });
}

function moduleExecutionRecordKey(traceCheckpointKey) {
  return canonicalJsonDigest({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleExecutionRecordKey",
    traceCheckpointKey,
  });
}

function inspectPreparedTraceability(prepared, expectedBaseGraphRef, label) {
  requireRecord(prepared, label);
  requireRecord(prepared.update, `${label}.update`);
  assertJsonData(prepared.update, `${label}.update`);
  assertTraceabilityArtifactRef(prepared.updateRef, `${label}.updateRef`);
  assertTraceabilityArtifactRef(
    prepared.baseGraphRef,
    `${label}.baseGraphRef`,
  );
  requireRecord(prepared.checkpoint, `${label}.checkpoint`);
  assertJsonData(prepared.checkpoint, `${label}.checkpoint`);
  const checkpointKeys = Object.keys(prepared.checkpoint).sort();
  if (
    !sameCanonicalValue(checkpointKeys, [
      "baseGraphRef",
      "update",
      "updateRef",
    ])
  ) {
    fail(
      "DR2503",
      `${label}.checkpoint must contain exactly baseGraphRef, update, and updateRef`,
    );
  }
  if (
    !sameCanonicalValue(prepared.baseGraphRef, expectedBaseGraphRef) ||
    !sameCanonicalValue(
      prepared.checkpoint.baseGraphRef,
      expectedBaseGraphRef,
    ) ||
    !sameCanonicalValue(prepared.checkpoint.updateRef, prepared.updateRef) ||
    !sameCanonicalValue(prepared.checkpoint.update, prepared.update)
  ) {
    fail("DR2503", `${label} is not bound to its exact base and update`);
  }
  if (canonicalJsonDigest(prepared.update) !== prepared.updateRef.digest) {
    fail(
      "DR2503",
      `${label}.updateRef digest does not identify the canonical update`,
    );
  }
  return {
    baseGraphRef: immutableCopy(prepared.baseGraphRef),
    update: immutableCopy(prepared.update),
    updateRef: immutableCopy(prepared.updateRef),
    checkpoint: immutableCopy(prepared.checkpoint),
  };
}

function createSelfDigestDocument(material, digestField) {
  return immutableCopy({
    ...material,
    [digestField]: canonicalJsonDigest(material),
  });
}

function validateSelfDigestDocument(document, digestField, label) {
  requireRecord(document, label);
  const { [digestField]: digest, ...material } = document;
  if (
    typeof digest !== "string" ||
    canonicalJsonDigest(material) !== digest
  ) {
    fail("DR2502", `${label} content digest is invalid`);
  }
  return document;
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
  traceability,
} = {}) {
  const moduleDefinitions = new Map();
  const moduleOptionValidators = new Map();
  const pluginRegistrations = new Map();
  const pluginConfigValidators = new Map();
  const configuredTraceability =
    snapshotTraceabilityConfiguration(traceability);
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
    const adapter = Object.freeze({
      invoke: registration.adapter.invoke.bind(registration.adapter),
    });
    pluginRegistrations.set(
      key,
      Object.freeze({
        definition,
        adapter,
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
    validateGrants(
      invocation.grants,
      pluginOperation,
      invocation.config,
      pluginKey,
      "invocation.grants",
    );

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
        binding.config,
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
    return new Set(
      ports.flatMap((port) => portSchemas(port)),
    );
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
  function inputGuardIdentity(inputGuard) {
    return Object.freeze({
      id: inputGuard.id,
      version: inputGuard.version,
    });
  }

  function inputGuardKey(inputGuard) {
    return `${inputGuard.id}@${inputGuard.version}`;
  }

  function discoverInputGuard(runtime) {
    const discovered = new Map();
    for (const artifacts of Object.values(runtime.loadedInputs)) {
      for (const loaded of artifacts) {
        const inputGuard = artifactContractRegistry.get(
          loaded.ref.schema,
        )?.inputGuard;
        if (inputGuard !== undefined) {
          discovered.set(inputGuardKey(inputGuard), inputGuard);
        }
      }
    }
    if (discovered.size > 1) {
      fail(
        "DR2400",
        `execution inputs resolve multiple registered input guards: ${[...discovered.keys()].sort().join(", ")}`,
      );
    }
    return discovered.values().next().value;
  }

  function assertAdapterOutcomeNotGuardOwned(runtime, result) {
    const inputGuard = discoverInputGuard(runtime);
    if (
      inputGuard !== undefined &&
      inputGuard.outcomes.includes(result.outcome)
    ) {
      fail(
        "DR2405",
        `outcome "${result.outcome}" is owned by input guard "${inputGuardKey(
          inputGuard,
        )}" and cannot be returned by an adapter`,
      );
    }
  }

  function requireInputGuardCheckpointStore(inputGuard, checkpoints) {
    if (inputGuard === undefined) {
      return;
    }
    if (
      !isRecord(checkpoints) ||
      typeof checkpoints.get !== "function" ||
      typeof checkpoints.put !== "function"
    ) {
      fail(
        "DR2200",
        "input-guarded module execution requires context.checkpoints.get and context.checkpoints.put",
      );
    }
  }

  function inputGuardCheckpointKey(invocationFingerprint, inputGuard) {
    return canonicalJsonDigest({
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ModuleInputGuardCheckpointKey",
      invocationFingerprint,
      guard: inputGuardIdentity(inputGuard),
    });
  }

  function inputGuardProducer(runtime, inputGuard, checkpointKey) {
    return immutableCopy({
      kind: "input-guard",
      invocationId: runtime.invocation.invocationId,
      invocationFingerprint: runtime.resolution.invocationFingerprint,
      module: runtime.invocation.module,
      guard: inputGuardIdentity(inputGuard),
      checkpointKey,
    });
  }

  function validateInputGuardResult(runtime, inputGuard, supplied) {
    let result;
    try {
      result = immutableCopy(supplied);
    } catch (error) {
      fail(
        "DR2402",
        `input guard "${inputGuardKey(inputGuard)}" returned non-JSON data: ${error.message}`,
      );
    }
    if (!inputGuard.outcomes.includes(result?.outcome)) {
      fail(
        "DR2403",
        `input guard "${inputGuardKey(inputGuard)}" returned undeclared outcome "${result?.outcome}"`,
      );
    }
    return validateResult(runtime.invocation, result);
  }

  async function evaluateInputGuard(runtime, inputGuard) {
    let supplied;
    try {
      supplied = await inputGuard.evaluate(
        immutableCopy({
          invocation: runtime.invocation,
          operation: runtime.resolution.operationDefinition,
          invocationFingerprint: runtime.resolution.invocationFingerprint,
          loadedInputs: exposeLoadedArtifacts(runtime.loadedInputs),
        }),
      );
    } catch (error) {
      fail(
        "DR2402",
        `input guard "${inputGuardKey(inputGuard)}" evaluation failed: ${error.message}`,
      );
    }
    if (supplied === undefined || supplied === null) {
      return undefined;
    }
    return validateInputGuardResult(runtime, inputGuard, supplied);
  }

  function validateInputGuardCheckpoint(
    checkpoint,
    checkpointKey,
    runtime,
    inputGuard,
    producer,
  ) {
    requireRecord(checkpoint, "input guard checkpoint");
    const expectedKeys = [
      "apiVersion",
      "checkpointDigest",
      "checkpointKey",
      "guard",
      "invocationFingerprint",
      "invocationId",
      "kind",
      "module",
      "moduleResult",
      "moduleResultDigest",
      "nodeId",
      "producer",
      "runId",
    ];
    if (
      Object.keys(checkpoint).sort().join("\u0000") !==
      expectedKeys.sort().join("\u0000")
    ) {
      fail("DR2404", "input guard checkpoint has unexpected fields");
    }
    const { checkpointDigest, ...material } = checkpoint;
    if (
      typeof checkpointDigest !== "string" ||
      canonicalJsonDigest(material) !== checkpointDigest
    ) {
      fail("DR2404", "input guard checkpoint content digest is invalid");
    }
    if (
      checkpoint.apiVersion !== "devrelay.dev/v1alpha1" ||
      checkpoint.kind !== "ModuleInputGuardCheckpoint" ||
      checkpoint.checkpointKey !== checkpointKey ||
      checkpoint.invocationId !== runtime.invocation.invocationId ||
      checkpoint.runId !== runtime.invocation.runId ||
      checkpoint.nodeId !== runtime.invocation.nodeId ||
      checkpoint.invocationFingerprint !==
        runtime.resolution.invocationFingerprint ||
      !sameCanonicalValue(checkpoint.module, runtime.invocation.module) ||
      !sameCanonicalValue(checkpoint.guard, inputGuardIdentity(inputGuard)) ||
      !sameCanonicalValue(checkpoint.producer, producer) ||
      checkpoint.moduleResultDigest !==
        canonicalJsonDigest(checkpoint.moduleResult)
    ) {
      fail("DR2404", "input guard checkpoint binding is invalid");
    }
    const moduleResult = validateInputGuardResult(
      runtime,
      inputGuard,
      checkpoint.moduleResult,
    );
    return immutableCopy({
      checkpoint,
      moduleResult,
      producer,
    });
  }

  async function runInputGuard(runtime) {
    const inputGuard = discoverInputGuard(runtime);
    requireInputGuardCheckpointStore(inputGuard, runtime.context.checkpoints);
    if (inputGuard === undefined) {
      return undefined;
    }

    const checkpointKey = inputGuardCheckpointKey(
      runtime.resolution.invocationFingerprint,
      inputGuard,
    );
    const producer = inputGuardProducer(
      runtime,
      inputGuard,
      checkpointKey,
    );
    const stored = await readCheckpoint(
      runtime.context.checkpoints,
      checkpointKey,
    );

    if (stored !== undefined && stored !== null) {
      const replay = validateInputGuardCheckpoint(
        immutableCopy(stored),
        checkpointKey,
        runtime,
        inputGuard,
        producer,
      );
      const recomputed = await evaluateInputGuard(runtime, inputGuard);
      if (
        recomputed === undefined ||
        !sameCanonicalValue(recomputed, replay.moduleResult)
      ) {
        fail(
          "DR2404",
          "input guard replay diverges from its checkpointed terminal result",
        );
      }
      return replay;
    }

    const moduleResult = await evaluateInputGuard(runtime, inputGuard);
    if (moduleResult === undefined) {
      return undefined;
    }
    const checkpoint = createSelfDigestDocument(
      {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "ModuleInputGuardCheckpoint",
        checkpointKey,
        invocationId: runtime.invocation.invocationId,
        runId: runtime.invocation.runId,
        nodeId: runtime.invocation.nodeId,
        module: runtime.invocation.module,
        invocationFingerprint: runtime.resolution.invocationFingerprint,
        guard: inputGuardIdentity(inputGuard),
        producer,
        moduleResult,
        moduleResultDigest: canonicalJsonDigest(moduleResult),
      },
      "checkpointDigest",
    );
    await writeCheckpoint(runtime.context.checkpoints, checkpointKey, checkpoint);
    const persisted = await readCheckpoint(
      runtime.context.checkpoints,
      checkpointKey,
    );
    if (
      persisted === undefined ||
      !sameCanonicalValue(persisted, checkpoint)
    ) {
      fail("DR2404", "input guard checkpoint was not persisted exactly");
    }
    return validateInputGuardCheckpoint(
      immutableCopy(persisted),
      checkpointKey,
      runtime,
      inputGuard,
      producer,
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
    const loadAttachedArtifact = async (ref) =>
      runtimeAction(() =>
        loadArtifactContent(ref, runtime.context.artifacts),
      );
    const loadAttached = async (ref) =>
      (await loadAttachedArtifact(ref)).value;
    const loadBytes = async (ref) =>
      (await loadArtifactBytes(ref, runtime.context.artifacts)).bytes;
    const loadCheckpoint = async (stepInvocationDigest) => {
      if (
        typeof stepInvocationDigest !== "string" ||
        !/^sha256:[a-f0-9]{64}$/.test(stepInvocationDigest)
      ) {
        throw new Error("checkpoint lookup requires a SHA-256 step digest");
      }
      const checkpoint = await readCheckpoint(
        runtime.context.checkpoints,
        stepCheckpointKeyFromDigest(stepInvocationDigest),
      );
      if (checkpoint === undefined || checkpoint === null) {
        return undefined;
      }
      const result = immutableCopy(checkpoint);
      assertSchema(
        documentValidators.moduleStepResult,
        result,
        "DR2212",
        "source checkpoint",
      );
      if (result.stepInvocationDigest !== stepInvocationDigest) {
        fail(
          "DR2212",
          "source checkpoint does not match the requested step invocation digest",
        );
      }
      return result;
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
            loadedArtifacts: exposeLoadedArtifacts(loadedByPort),
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
            loadArtifact: loadAttachedArtifact,
            loadBytes,
            loadCheckpoint,
          }),
        );
      }
    }
    return loadedByPort;
  }

  async function readTraceabilityDocument(store, key, label) {
    try {
      const value = await store.get(key);
      return value === undefined || value === null
        ? undefined
        : immutableCopy(value);
    } catch (error) {
      fail("DR2501", `${label} read failed: ${error.message}`);
    }
  }

  async function persistTraceabilityDocument(store, key, document, label) {
    const immutable = immutableCopy(document);
    const existing = await readTraceabilityDocument(store, key, label);
    if (existing !== undefined) {
      if (!sameCanonicalValue(existing, immutable)) {
        fail("DR2502", `${label} conflicts with the exact stable key`);
      }
      return existing;
    }
    let winner;
    try {
      winner = immutableCopy(await store.putIfAbsent(key, immutable));
    } catch (error) {
      fail("DR2501", `${label} write failed: ${error.message}`);
    }
    if (!sameCanonicalValue(winner, immutable)) {
      fail("DR2502", `${label} lost an atomic write to divergent content`);
    }
    const persisted = await readTraceabilityDocument(store, key, label);
    if (
      persisted === undefined ||
      !sameCanonicalValue(persisted, immutable) ||
      !sameCanonicalValue(persisted, winner)
    ) {
      fail("DR2502", `${label} was not durably persisted exactly`);
    }
    return persisted;
  }

  function captureTraceabilityExecution(runtime, moduleResult, producer) {
    const capture = runtime.context[traceabilityExecutionCapture];
    if (capture === undefined) {
      return;
    }
    if (!isRecord(capture) || capture.value !== undefined) {
      fail("DR2502", "graph-aware execution capture is invalid");
    }
    capture.value = immutableCopy({
      moduleResultDigest: canonicalJsonDigest(moduleResult),
      producer,
      priorResults: runtime.priorResults,
    });
  }

  function validateTraceabilityCheckpoint(
    checkpoint,
    checkpointKey,
    invocation,
    resolution,
    graph,
  ) {
    validateSelfDigestDocument(
      checkpoint,
      "checkpointDigest",
      "traceability checkpoint",
    );
    if (
      checkpoint.apiVersion !== "devrelay.dev/v1alpha1" ||
      checkpoint.kind !== "ModuleTraceabilityCheckpoint" ||
      checkpoint.traceCheckpointKey !== checkpointKey ||
      checkpoint.invocationId !== invocation.invocationId ||
      checkpoint.runId !== invocation.runId ||
      checkpoint.nodeId !== invocation.nodeId ||
      !sameCanonicalValue(checkpoint.module, invocation.module) ||
      checkpoint.invocationFingerprint !== resolution.invocationFingerprint ||
      checkpoint.graphId !== graph.graphId ||
      checkpoint.projectId !== graph.projectId
    ) {
      fail("DR2502", "traceability checkpoint invocation binding is invalid");
    }
    requireString(checkpoint.graphId, "traceability checkpoint.graphId");
    requireString(checkpoint.projectId, "traceability checkpoint.projectId");
    assertTraceabilityArtifactRef(
      checkpoint.baseGraphRef,
      "traceability checkpoint.baseGraphRef",
    );
    assertTraceabilityArtifactRef(
      checkpoint.updateRef,
      "traceability checkpoint.updateRef",
    );
    requireRecord(
      checkpoint.preparedCheckpoint,
      "traceability checkpoint.preparedCheckpoint",
    );
    requireRecord(
      checkpoint.executionContext,
      "traceability checkpoint.executionContext",
    );
    requireRecord(checkpoint.moduleResult, "traceability checkpoint.moduleResult");
    if (
      checkpoint.moduleResultDigest !==
        canonicalJsonDigest(checkpoint.moduleResult) ||
      checkpoint.preparedCheckpointDigest !==
        canonicalJsonDigest(checkpoint.preparedCheckpoint) ||
      checkpoint.executionContextDigest !==
        canonicalJsonDigest(checkpoint.executionContext) ||
      checkpoint.updateRefDigest !== canonicalJsonDigest(checkpoint.updateRef)
    ) {
      fail("DR2502", "traceability checkpoint material binding is invalid");
    }
    const expectedGraphFingerprint = createGraphAwareInvocationFingerprint({
      invocationFingerprint: resolution.invocationFingerprint,
      graphId: checkpoint.graphId,
      projectId: checkpoint.projectId,
      baseGraphRef: checkpoint.baseGraphRef,
    });
    if (
      checkpoint.graphAwareInvocationFingerprint !== expectedGraphFingerprint
    ) {
      fail("DR2502", "traceability checkpoint graph fingerprint is invalid");
    }
    return checkpoint;
  }

  function producerFromPriorResult(priorResult, chainFingerprint) {
    return {
      invocationId: priorResult.sourceInvocation.invocationId,
      step: priorResult.step,
      plugin: priorResult.plugin,
      invocationFingerprint:
        priorResult.sourceInvocation.invocationFingerprint,
      chainFingerprint,
      stepInvocationDigest: priorResult.stepInvocationDigest,
    };
  }

  function validatePriorResult(priorResult, plan, chainFingerprint, label) {
    requireRecord(priorResult, label);
    requireRecord(priorResult.plugin, `${label}.plugin`);
    requireRecord(priorResult.sourceInvocation, `${label}.sourceInvocation`);
    requireRecord(priorResult.outputs, `${label}.outputs`);
    if (
      priorResult.step !== plan.stepDefinition.id ||
      priorResult.plugin.id !== plan.binding.plugin.id ||
      priorResult.plugin.version !== plan.binding.plugin.version ||
      priorResult.sourceInvocation.plugin?.id !== plan.binding.plugin.id ||
      priorResult.sourceInvocation.plugin?.version !== plan.binding.plugin.version ||
      priorResult.sourceInvocation.stepInvocationDigest !==
        priorResult.stepInvocationDigest ||
      !/^sha256:[a-f0-9]{64}$/.test(priorResult.stepInvocationDigest) ||
      !/^sha256:[a-f0-9]{64}$/.test(priorResult.digest) ||
      typeof priorResult.sourceInvocation.invocationId !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(
        priorResult.sourceInvocation.invocationFingerprint,
      ) ||
      plan.stepDefinition.kind !== "handoff"
    ) {
      fail("DR2502", `${label} binding is invalid`);
    }
    validateStepOutputs(priorResult.outputs, plan.stepDefinition);
    return producerFromPriorResult(priorResult, chainFingerprint);
  }

  function expectedTerminalProducer(
    invocation,
    resolution,
    moduleResult,
    priorResults,
    recordedProducer,
  ) {
    let stepInvocation;
    if (resolution.mode === "single") {
      if (priorResults.length !== 0) {
        fail("DR2502", "single-adapter trace checkpoint has prior results");
      }
      stepInvocation = singleStepInvocation(invocation, resolution);
    } else {
      const terminalIndex = resolution.steps.findIndex(
        ({ stepDefinition }) => stepDefinition.id === recordedProducer.step,
      );
      if (terminalIndex < 0 || priorResults.length !== terminalIndex) {
        fail("DR2502", "trace checkpoint terminal step is not the exact prefix");
      }
      const plan = resolution.steps[terminalIndex];
      if (
        plan.stepDefinition.kind !== "terminal" &&
        !resolution.operationDefinition.adapterChain.earlyTerminalOutcomes.includes(
          moduleResult.outcome,
        )
      ) {
        fail("DR2502", "trace checkpoint records an undeclared early terminal");
      }
      stepInvocation = createStepInvocation({
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "ModuleStepInvocation",
        invocationId: invocation.invocationId,
        runId: invocation.runId,
        nodeId: invocation.nodeId,
        invocationFingerprint: resolution.invocationFingerprint,
        chainFingerprint: resolution.chainFingerprint,
        module: invocation.module,
        step: plan.stepDefinition.id,
        plugin: plan.binding.plugin,
        inputs: invocation.inputs,
        priorResults,
        options: invocation.options,
        config: plan.binding.config,
        grants: plan.binding.grants,
      });
    }
    const expected = producerFor(stepInvocation);
    if (!sameCanonicalValue(expected, recordedProducer)) {
      fail("DR2502", "trace checkpoint terminal producer is invalid");
    }
    return expected;
  }

  async function revalidateTraceabilityExecution({
    invocation,
    resolution,
    context,
    moduleResult,
    executionContext,
  }) {
    try {
      requireArtifactLoader(context.artifacts);
      requireArtifactContracts(
        runtimeSchemas(resolution.operationDefinition),
        artifactContractRegistry,
      );
    } catch (error) {
      runtimeFailure(error);
    }
    requireRecord(executionContext, "traceability execution context");
    requireRecord(executionContext.producer, "traceability execution producer");
    requireArray(
      executionContext.priorResults,
      "traceability execution priorResults",
    );
    if (
      executionContext.moduleResultDigest !== canonicalJsonDigest(moduleResult)
    ) {
      fail("DR2502", "traceability execution result digest is invalid");
    }

    const runtime = {
      context,
      invocation,
      resolution,
      loadedInputs: undefined,
      loadedHandoffs: {},
      priorResults: [],
    };
    runtime.loadedInputs = await loadPortArtifacts(
      invocation.inputs,
      resolution.operationDefinition.inputs,
      "input",
      runtime,
    );
    await enforceDeterministicRoute(runtime);

    const guardTerminal = await runInputGuard(runtime);
    let producer;
    if (executionContext.producer.kind === "input-guard") {
      if (executionContext.priorResults.length !== 0) {
        fail("DR2502", "input-guard trace checkpoint has prior results");
      }
      if (
        guardTerminal === undefined ||
        !sameCanonicalValue(guardTerminal.moduleResult, moduleResult) ||
        !sameCanonicalValue(
          guardTerminal.producer,
          executionContext.producer,
        )
      ) {
        fail(
          "DR2502",
          "trace checkpoint input-guard execution is not exact",
        );
      }
      producer = guardTerminal.producer;
    } else {
      if (guardTerminal !== undefined) {
        fail(
          "DR2502",
          "trace checkpoint records adapter execution after a terminal input guard",
        );
      }
      if (resolution.mode === "single") {
        if (executionContext.priorResults.length !== 0) {
          fail("DR2502", "single-adapter trace checkpoint has prior results");
        }
      } else {
        if (executionContext.priorResults.length >= resolution.steps.length) {
          fail("DR2502", "traceability priorResults are not a handoff prefix");
        }
        for (const [index, priorResult] of
          executionContext.priorResults.entries()) {
          const plan = resolution.steps[index];
          const priorProducer = validatePriorResult(
            priorResult,
            plan,
            resolution.chainFingerprint,
            `traceability priorResults[${index}]`,
          );
          runtime.loadedHandoffs[priorResult.step] = await loadPortArtifacts(
            priorResult.outputs,
            plan.stepDefinition.outputs,
            "handoff",
            runtime,
            priorProducer,
          );
          runtime.priorResults.push(immutableCopy(priorResult));
        }
      }

      producer = expectedTerminalProducer(
        invocation,
        resolution,
        moduleResult,
        runtime.priorResults,
        executionContext.producer,
      );
    }
    const validatedResult = validateResult(invocation, moduleResult);
    if (executionContext.producer.kind !== "input-guard") {
      assertAdapterOutcomeNotGuardOwned(runtime, validatedResult);
    }
    const loadedOutputs = await loadPortArtifacts(
      validatedResult.outputs,
      resolution.operationDefinition.outputs,
      "output",
      runtime,
      producer,
    );

    const resolveArtifact = async (ref) => {
      assertTraceabilityArtifactRef(ref, "traceability attachment ref");
      try {
        requireArtifactContracts([ref.schema], artifactContractRegistry);
      } catch (error) {
        runtimeFailure(error);
      }
      const portName = "traceability-artifact";
      const loaded = await loadPortArtifacts(
        { [portName]: [immutableCopy(ref)] },
        [
          {
            name: portName,
            schema: ref.schema,
            mediaTypes: [ref.mediaType],
            cardinality: "one",
            required: true,
          },
        ],
        "traceability",
        runtime,
        producer,
      );
      return loaded[portName][0];
    };

    return Object.freeze({
      moduleResult: immutableCopy(validatedResult),
      producer: immutableCopy(producer),
      loadedInputs: exposeLoadedArtifacts(runtime.loadedInputs),
      loadedOutputs: exposeLoadedArtifacts(loadedOutputs),
      resolveArtifact,
    });
  }

  function validateApplicationProof(
    proof,
    updateRef,
    mergeResult,
    label,
  ) {
    requireRecord(proof, label);
    assertTraceabilityArtifactRef(proof.updateRef, `${label}.updateRef`);
    assertTraceabilityArtifactRef(
      proof.receiptRef,
      `${label}.receiptRef`,
    );
    assertTraceabilityArtifactRef(
      proof.resultGraphRef,
      `${label}.resultGraphRef`,
    );
    requireRecord(proof.receipt, `${label}.receipt`);
    if (!sameCanonicalValue(proof.updateRef, updateRef)) {
      fail("DR2504", `${label} does not identify the exact update`);
    }
    if (mergeResult !== undefined) {
      if (
        !sameCanonicalValue(proof.receiptRef, mergeResult.receiptRef) ||
        !sameCanonicalValue(proof.receipt, mergeResult.receipt) ||
        !sameCanonicalValue(proof.resultGraphRef, mergeResult.snapshotRef)
      ) {
        fail("DR2504", `${label} diverges from the merge receipt`);
      }
    }
    return immutableCopy(proof);
  }

  function traceabilityPreparationRequest({
    invocation,
    invocationFingerprint,
    graphAwareInvocationFingerprint,
    execution,
    baseGraph,
    checkpoint,
  }) {
    const request = {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "TraceabilityPreparationRequest",
      invocation: immutableCopy(invocation),
      invocationFingerprint,
      graphAwareInvocationFingerprint,
      moduleResult: immutableCopy(execution.moduleResult),
      producer: immutableCopy(execution.producer),
      loadedInputs: immutableCopy(execution.loadedInputs),
      loadedOutputs: immutableCopy(execution.loadedOutputs),
      resolveArtifact: execution.resolveArtifact,
    };
    if (baseGraph !== undefined) {
      request.baseGraph = baseGraph;
    }
    if (checkpoint !== undefined) {
      request.checkpoint = immutableCopy(checkpoint);
    }
    return Object.freeze(request);
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
      invocationId: stepInvocation.invocationId,
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
    const captureRequested = isRecord(context[traceabilityExecutionCapture]);
    const stepInvocation =
      effectful || captureRequested
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
          await resolution.adapter.invoke(
            invocation,
            adapterContext,
            effectful
              ? immutableCopy(producerFor(stepInvocation))
              : undefined,
          ),
        ),
      );
    }

    assertAdapterOutcomeNotGuardOwned(runtime, result);
    await loadPortArtifacts(
      result.outputs,
      resolution.operationDefinition.outputs,
      "output",
      runtime,
      stepInvocation === undefined ? undefined : producerFor(stepInvocation),
    );
    captureTraceabilityExecution(
      runtime,
      result,
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
      const completedSource = recorded[resume.sourceInvocationField];
      const completedSourceInvocationId =
        completedSource?.[resume.sourceInvocationIdField];
      const completedSourceInvocationFingerprint =
        completedSource?.[resume.sourceInvocationFingerprintField];
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
      if (
        typeof completedSourceInvocationId !== "string" ||
        typeof completedSourceInvocationFingerprint !== "string" ||
        completedSource?.plugin?.id !== plugin.id ||
        completedSource?.plugin?.version !== plugin.version ||
        completedSource?.stepInvocationDigest !== stepInvocationDigest
      ) {
        fail(
          "DR2211",
          "continuation completed-step source invocation is incomplete",
        );
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
        result.invocationId !== completedSourceInvocationId ||
        result.invocationFingerprint !== completedSourceInvocationFingerprint ||
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
        invocationId: completedSourceInvocationId,
        step,
        plugin,
        invocationFingerprint: completedSourceInvocationFingerprint,
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
          sourceInvocation: {
            invocationId: completedSourceInvocationId,
            invocationFingerprint: completedSourceInvocationFingerprint,
            plugin,
            stepInvocationDigest,
          },
          stepInvocationDigest,
          digest: stepResultDigest,
          outputs: result.outputs,
        }),
      );
    }
    return startIndex;
  }

  async function verifyCheckpointedExecution(invocation, context = {}) {
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
    if (
      resolution.mode !== "single" ||
      resolution.pluginOperation.execution !== "effect"
    ) {
      fail(
        "DR2213",
        "checkpoint-only verification requires a checkpointed single-adapter effect",
      );
    }
    if (
      !isRecord(context.checkpoints) ||
      typeof context.checkpoints.get !== "function"
    ) {
      fail(
        "DR2200",
        "checkpoint-only verification requires context.checkpoints.get",
      );
    }

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

    const stepInvocation = singleStepInvocation(invocationSnapshot, resolution);
    const checkpoint = await readCheckpoint(
      context.checkpoints,
      stepCheckpointKey(stepInvocation),
    );
    if (checkpoint === undefined || checkpoint === null) {
      fail(
        "DR2213",
        "checkpoint-only verification requires the exact terminal checkpoint",
      );
    }
    const envelope = immutableCopy(checkpoint);
    validateStepResultBinding(stepInvocation, envelope);
    if (envelope.disposition !== "terminal") {
      fail("DR2213", "checkpoint-only verification requires a terminal result");
    }
    const moduleResult = validateResult(
      invocationSnapshot,
      envelope.moduleResult,
    );
    assertAdapterOutcomeNotGuardOwned(runtime, moduleResult);
    const loadedOutputs = await loadPortArtifacts(
      moduleResult.outputs,
      resolution.operationDefinition.outputs,
      "output",
      runtime,
      producerFor(stepInvocation),
    );
    const receipt = immutableCopy({
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "VerifiedCheckpointReplayReceipt",
      invocation: invocationSnapshot,
      producer: producerFor(stepInvocation),
      moduleResult,
      loadedInputs: exposeLoadedArtifacts(runtime.loadedInputs),
      loadedOutputs: exposeLoadedArtifacts(loadedOutputs),
    });
    verifiedCheckpointReplayReceipts.add(receipt);
    return receipt;
  }

  async function executeOrdinary(invocation, context = {}) {
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
    const guardTerminal = await runInputGuard(runtime);
    if (guardTerminal !== undefined) {
      await loadPortArtifacts(
        guardTerminal.moduleResult.outputs,
        resolution.operationDefinition.outputs,
        "output",
        runtime,
        guardTerminal.producer,
      );
      captureTraceabilityExecution(
        runtime,
        guardTerminal.moduleResult,
        guardTerminal.producer,
      );
      return guardTerminal.moduleResult;
    }


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
        assertAdapterOutcomeNotGuardOwned(runtime, moduleResult);
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
        captureTraceabilityExecution(runtime, moduleResult, producer);
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
          sourceInvocation: {
            invocationId: stepInvocation.invocationId,
            invocationFingerprint: stepInvocation.invocationFingerprint,
            plugin: plan.binding.plugin,
            stepInvocationDigest: stepInvocation.stepInvocationDigest,
          },
          stepInvocationDigest: stepInvocation.stepInvocationDigest,
          digest: canonicalJsonDigest(stepResult),
          outputs: stepResult.outputs,
        }),
      );
    }

    fail("DR1807", "adapter chain completed without a terminal result");
  }

  async function executeGraphAware(invocation, context) {
    const invocationSnapshot = immutableCopy(invocation);
    const resolution = resolve(invocationSnapshot);
    const { graph, checkpoints: traceabilityCheckpoints } =
      requireTraceabilityRuntime(context);
    try {
      requireArtifactLoader(context.artifacts);
      requireArtifactContracts(
        runtimeSchemas(resolution.operationDefinition),
        artifactContractRegistry,
      );
    } catch (error) {
      runtimeFailure(error);
    }

    const invocationFingerprint = resolution.invocationFingerprint;
    const traceCheckpointKey = traceabilityCheckpointKey(
      invocationSnapshot,
      invocationFingerprint,
      graph,
    );
    const executionRecordKey = moduleExecutionRecordKey(traceCheckpointKey);
    let traceCheckpoint = await readTraceabilityDocument(
      traceabilityCheckpoints,
      traceCheckpointKey,
      "traceability checkpoint",
    );
    let prepared;
    let preparedView;
    let execution;

    if (traceCheckpoint !== undefined) {
      traceCheckpoint = validateTraceabilityCheckpoint(
        traceCheckpoint,
        traceCheckpointKey,
        invocationSnapshot,
        resolution,
        graph,
      );
      execution = await revalidateTraceabilityExecution({
        invocation: invocationSnapshot,
        resolution,
        context,
        moduleResult: traceCheckpoint.moduleResult,
        executionContext: traceCheckpoint.executionContext,
      });
      prepared = await graph.validatePrepared(
        traceabilityPreparationRequest({
          invocation: invocationSnapshot,
          invocationFingerprint,
          graphAwareInvocationFingerprint:
            traceCheckpoint.graphAwareInvocationFingerprint,
          execution,
          checkpoint: traceCheckpoint.preparedCheckpoint,
        }),
      );
      preparedView = inspectPreparedTraceability(
        prepared,
        traceCheckpoint.baseGraphRef,
        "replayed traceability preparation",
      );
      if (
        !sameCanonicalValue(
          preparedView.checkpoint,
          traceCheckpoint.preparedCheckpoint,
        ) ||
        !sameCanonicalValue(preparedView.updateRef, traceCheckpoint.updateRef) ||
        canonicalJsonDigest(preparedView.update) !==
          traceCheckpoint.updateDigest
      ) {
        fail(
          "DR2503",
          "replayed traceability preparation diverges from its checkpoint",
        );
      }
    } else {
      const baseGraph = await graph.captureBase();
      requireRecord(baseGraph, "traceability graph base");
      requireString(baseGraph.graphId, "traceability graph base.graphId");
      requireString(baseGraph.projectId, "traceability graph base.projectId");
      if (
        baseGraph.graphId !== graph.graphId ||
        baseGraph.projectId !== graph.projectId
      ) {
        fail("DR2503", "captured graph base does not match the graph service");
      }
      const baseGraphRef = assertTraceabilityArtifactRef(
        baseGraph.ref,
        "traceability graph base.ref",
      );
      const graphAwareInvocationFingerprint =
        createGraphAwareInvocationFingerprint({
          invocationFingerprint,
          graphId: baseGraph.graphId,
          projectId: baseGraph.projectId,
          baseGraphRef,
        });
      const capture = {};
      const {
        traceabilityGraph: ignoredGraph,
        traceabilityCheckpoints: ignoredTraceabilityCheckpoints,
        ...ordinaryContext
      } = context;
      const moduleResult = await executeOrdinary(invocationSnapshot, {
        ...ordinaryContext,
        [traceabilityExecutionCapture]: capture,
      });
      if (!isRecord(capture.value)) {
        fail("DR2502", "ordinary execution did not produce a trace capture");
      }
      execution = await revalidateTraceabilityExecution({
        invocation: invocationSnapshot,
        resolution,
        context,
        moduleResult,
        executionContext: capture.value,
      });
      const initiallyPrepared = await graph.prepare(
        traceabilityPreparationRequest({
          invocation: invocationSnapshot,
          invocationFingerprint,
          graphAwareInvocationFingerprint,
          execution,
          baseGraph,
        }),
      );
      const initialView = inspectPreparedTraceability(
        initiallyPrepared,
        baseGraphRef,
        "traceability preparation",
      );
      prepared = await graph.validatePrepared(
        traceabilityPreparationRequest({
          invocation: invocationSnapshot,
          invocationFingerprint,
          graphAwareInvocationFingerprint,
          execution,
          checkpoint: initialView.checkpoint,
        }),
      );
      preparedView = inspectPreparedTraceability(
        prepared,
        baseGraphRef,
        "validated traceability preparation",
      );
      if (
        !sameCanonicalValue(preparedView, initialView)
      ) {
        fail(
          "DR2503",
          "validated traceability preparation diverges from initial preparation",
        );
      }

      traceCheckpoint = createSelfDigestDocument(
        {
          apiVersion: "devrelay.dev/v1alpha1",
          kind: "ModuleTraceabilityCheckpoint",
          traceCheckpointKey,
          invocationId: invocationSnapshot.invocationId,
          runId: invocationSnapshot.runId,
          nodeId: invocationSnapshot.nodeId,
          module: invocationSnapshot.module,
          invocationFingerprint,
          graphAwareInvocationFingerprint,
          graphId: baseGraph.graphId,
          projectId: baseGraph.projectId,
          baseGraphRef: preparedView.baseGraphRef,
          moduleResult: execution.moduleResult,
          moduleResultDigest: canonicalJsonDigest(execution.moduleResult),
          executionContext: capture.value,
          executionContextDigest: canonicalJsonDigest(capture.value),
          preparedCheckpoint: preparedView.checkpoint,
          preparedCheckpointDigest: canonicalJsonDigest(
            preparedView.checkpoint,
          ),
          updateRef: preparedView.updateRef,
          updateRefDigest: canonicalJsonDigest(preparedView.updateRef),
          updateDigest: canonicalJsonDigest(preparedView.update),
        },
        "checkpointDigest",
      );
      traceCheckpoint = await persistTraceabilityDocument(
        traceabilityCheckpoints,
        traceCheckpointKey,
        traceCheckpoint,
        "traceability checkpoint",
      );
    }

    const existingRecord = await readTraceabilityDocument(
      traceabilityCheckpoints,
      executionRecordKey,
      "module execution record",
    );
    if (existingRecord !== undefined) {
      validateSelfDigestDocument(
        existingRecord,
        "recordDigest",
        "module execution record",
      );
      validateModuleExecutionRecord(existingRecord);
      if (
        existingRecord.apiVersion !== "devrelay.dev/v1alpha1" ||
        existingRecord.kind !== "ModuleExecutionRecord" ||
        existingRecord.traceCheckpointKey !== traceCheckpointKey ||
        existingRecord.traceCheckpointDigest !==
          traceCheckpoint.checkpointDigest ||
        existingRecord.invocationFingerprint !== invocationFingerprint ||
        existingRecord.graphAwareInvocationFingerprint !==
          traceCheckpoint.graphAwareInvocationFingerprint ||
        !sameCanonicalValue(
          existingRecord.moduleResult,
          execution.moduleResult,
        ) ||
        !sameCanonicalValue(
          existingRecord.traceabilityUpdateRef,
          preparedView.updateRef,
        ) ||
        !sameCanonicalValue(
          existingRecord.traceabilityUpdate,
          preparedView.update,
        ) ||
        !sameCanonicalValue(
          existingRecord.traceCheckpoint,
          traceCheckpoint,
        ) ||
        existingRecord.mergeReceipt === undefined
      ) {
        fail("DR2502", "module execution record binding is invalid");
      }
      const applied = validateApplicationProof(
        await graph.assertApplied(prepared.updateRef),
        prepared.updateRef,
        existingRecord.mergeReceipt,
        "traceability application proof",
      );
      if (!sameCanonicalValue(applied, existingRecord.applicationProof)) {
        fail("DR2504", "stored application proof is no longer exact");
      }
      return immutableCopy(existingRecord);
    }

    const mergeResult = await graph.mergePrepared(prepared);
    if (!isRecord(mergeResult)) {
      fail("DR2504", "traceability merge must return a receipt");
    }
    const mergeReceipt = immutableCopy(mergeResult);
    const applicationProof = validateApplicationProof(
      await graph.assertApplied(prepared.updateRef),
      prepared.updateRef,
      mergeReceipt,
      "traceability application proof",
    );
    const record = createSelfDigestDocument(
      {
        apiVersion: "devrelay.dev/v1alpha1",
        kind: "ModuleExecutionRecord",
        invocationId: invocationSnapshot.invocationId,
        runId: invocationSnapshot.runId,
        nodeId: invocationSnapshot.nodeId,
        module: invocationSnapshot.module,
        invocationFingerprint,
        graphAwareInvocationFingerprint:
          traceCheckpoint.graphAwareInvocationFingerprint,
        graphId: traceCheckpoint.graphId,
        projectId: traceCheckpoint.projectId,
        baseGraphRef: preparedView.baseGraphRef,
        traceCheckpointKey,
        traceCheckpointDigest: traceCheckpoint.checkpointDigest,
        traceCheckpoint,
        moduleResult: execution.moduleResult,
        traceabilityUpdate: preparedView.update,
        traceabilityUpdateRef: preparedView.updateRef,
        mergeReceipt,
        applicationProof,
      },
      "recordDigest",
    );
    validateModuleExecutionRecord(record);
    return persistTraceabilityDocument(
      traceabilityCheckpoints,
      executionRecordKey,
      record,
      "module execution record",
    );
  }

  function contextWithConfiguredTraceability(context) {
    requireRecord(context, "execution context");
    if (
      "traceabilityGraph" in context ||
      "traceabilityCheckpoints" in context
    ) {
      fail(
        "DR2505",
        "a traceability-configured registry does not allow context overrides",
      );
    }
    return Object.freeze({
      ...context,
      traceabilityGraph: configuredTraceability.graph,
      traceabilityCheckpoints: configuredTraceability.checkpoints,
    });
  }

  async function execute(invocation, context = {}) {
    if (configuredTraceability === undefined) {
      return executeOrdinary(invocation, context);
    }
    return executeGraphAware(
      invocation,
      contextWithConfiguredTraceability(context),
    );
  }

  async function executeWithTraceability(invocation, context = {}) {
    return executeGraphAware(
      invocation,
      configuredTraceability === undefined
        ? context
        : contextWithConfiguredTraceability(context),
    );
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
    verifyCheckpointedExecution,
    execute,
    executeWithTraceability,
    moduleCount: moduleDefinitions.size,
    pluginCount: pluginRegistrations.size,
  });
}
