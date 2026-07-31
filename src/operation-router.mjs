import { sha256Digest } from "./content-digest.mjs";

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export const MODULE_ROUTE_DECISION_SCHEMA =
  "https://devrelay.dev/artifacts/module-route-decision/v1";
export const MODULE_ROUTE_DECISION_MEDIA_TYPE =
  "application/vnd.devrelay.module-route-decision+json";

export class RoutingError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "RoutingError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new RoutingError(code, message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) {
    fail("DR2000", `${label} must be an object`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail("DR2001", `${label} must be a non-empty string`);
  }
}

function requireIdentity(identity, label) {
  requireRecord(identity, label);
  if (!ID_PATTERN.test(identity.id ?? "")) {
    fail("DR2002", `${label}.id is invalid`);
  }
  if (!VERSION_PATTERN.test(identity.version ?? "")) {
    fail("DR2003", `${label}.version is invalid`);
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

function decodePointerToken(token) {
  if (/(?:~[^01])|(?:~$)/.test(token)) {
    fail("DR2004", "routing discriminator contains an invalid JSON Pointer escape");
  }
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function readPointer(document, pointer) {
  requireString(pointer, "module.routing.discriminator");
  if (!pointer.startsWith("/")) {
    fail("DR2004", "routing discriminator must be a non-root JSON Pointer");
  }

  let current = document;
  for (const token of pointer.slice(1).split("/").map(decodePointerToken)) {
    if (!isRecord(current) || !Object.hasOwn(current, token)) {
      fail(
        "DR2010",
        `state artifact does not contain routing discriminator "${pointer}"`,
      );
    }
    current = current[token];
  }
  return current;
}

function assertRoutingPort(operation, name, schema, mediaType, label) {
  const port = operation.inputs?.find((candidate) => candidate.name === name);
  if (!port) {
    fail("DR2018", `${label} must declare required input "${name}"`);
  }
  const acceptsJson =
    port?.mediaTypes?.includes("application/json") ||
    port?.mediaTypes?.some((candidate) => candidate.endsWith("+json"));
  if (
    port.required !== true ||
    port.cardinality !== "one" ||
    port.schema !== schema ||
    (mediaType === undefined ? !acceptsJson : !port.mediaTypes.includes(mediaType))
  ) {
    fail(
      "DR2019",
      `${label} input "${name}" must be a required cardinality-one ${schema} artifact`,
    );
  }
}

function validateRoutingDefinition(moduleDefinition) {
  requireRecord(moduleDefinition, "module definition");
  requireIdentity(moduleDefinition.metadata, "module.metadata");
  if (!Array.isArray(moduleDefinition.operations)) {
    fail("DR2005", "module.operations must be an array");
  }

  const operationIds = new Set(
    moduleDefinition.operations.map((operation) => operation.id),
  );
  const routing = moduleDefinition.routing;
  requireRecord(routing, "module.routing");
  requireString(routing.stateInput, "module.routing.stateInput");
  requireString(routing.stateSchema, "module.routing.stateSchema");
  requireString(routing.decisionInput, "module.routing.decisionInput");
  requireString(routing.discriminator, "module.routing.discriminator");
  if (routing.stateInput === routing.decisionInput) {
    fail("DR2020", "routing stateInput and decisionInput must be different");
  }
  if (!Array.isArray(routing.rules) || routing.rules.length === 0) {
    fail("DR2006", "module.routing.rules must be a non-empty array");
  }

  const values = new Set();
  for (const [index, rule] of routing.rules.entries()) {
    const label = `module.routing.rules[${index}]`;
    requireRecord(rule, label);
    requireString(rule.value, `${label}.value`);
    requireString(rule.reasonCode, `${label}.reasonCode`);
    if (values.has(rule.value)) {
      fail("DR2007", `routing value "${rule.value}" is declared more than once`);
    }
    values.add(rule.value);

    const hasOperation = Object.hasOwn(rule, "operation");
    const hasPrerequisite = Object.hasOwn(rule, "prerequisite");
    if (hasOperation === hasPrerequisite) {
      fail(
        "DR2008",
        `${label} must select exactly one operation or prerequisite`,
      );
    }
    if (hasOperation) {
      requireString(rule.operation, `${label}.operation`);
      if (!operationIds.has(rule.operation)) {
        fail(
          "DR2009",
          `${label} selects undeclared operation "${rule.operation}"`,
        );
      }
    } else {
      requireRecord(rule.prerequisite, `${label}.prerequisite`);
      requireIdentity(
        rule.prerequisite.module,
        `${label}.prerequisite.module`,
      );
      if (!ID_PATTERN.test(rule.prerequisite.operation ?? "")) {
        fail("DR2011", `${label}.prerequisite.operation is invalid`);
      }
      requireString(
        rule.prerequisite.outputSchema,
        `${label}.prerequisite.outputSchema`,
      );
    }
  }

  for (const operation of moduleDefinition.operations) {
    const label = `module operation "${operation.id}"`;
    assertRoutingPort(
      operation,
      routing.stateInput,
      routing.stateSchema,
      undefined,
      label,
    );
    assertRoutingPort(
      operation,
      routing.decisionInput,
      MODULE_ROUTE_DECISION_SCHEMA,
      MODULE_ROUTE_DECISION_MEDIA_TYPE,
      label,
    );
  }
  return routing;
}

function rawBytes(value, label) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  fail("DR2021", `${label} must be raw bytes`);
}

function parseJson(bytes, label) {
  let source;
  try {
    source = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
  } catch (error) {
    fail("DR2024", `${label} is not valid UTF-8: ${error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    fail("DR2022", `${label} is not valid JSON: ${error.message}`);
  }
}

function validateStateRef(stateArtifactRef, routing) {
  requireRecord(stateArtifactRef, "stateArtifactRef");
  requireString(stateArtifactRef.artifactId, "stateArtifactRef.artifactId");
  requireString(stateArtifactRef.mediaType, "stateArtifactRef.mediaType");
  requireString(stateArtifactRef.uri, "stateArtifactRef.uri");
  if (stateArtifactRef.schema !== routing.stateSchema) {
    fail(
      "DR2012",
      "state artifact reference schema does not match module.routing.stateSchema",
    );
  }
  if (!DIGEST_PATTERN.test(stateArtifactRef.digest ?? "")) {
    fail("DR2013", "stateArtifactRef.digest is invalid");
  }
}

export function validateModuleRouting(moduleDefinition) {
  validateRoutingDefinition(moduleDefinition);
  return moduleDefinition;
}

export async function selectModuleRoute(
  moduleDefinition,
  { stateArtifactBytes, stateArtifactRef, validateStateArtifact },
) {
  const routing = validateRoutingDefinition(moduleDefinition);
  validateStateRef(stateArtifactRef, routing);
  if (typeof validateStateArtifact !== "function") {
    fail("DR2023", "routing requires a trusted state artifact validator");
  }

  const bytes = rawBytes(stateArtifactBytes, "stateArtifactBytes");
  if (sha256Digest(bytes) !== stateArtifactRef.digest) {
    fail("DR2103", "state artifact bytes do not match stateArtifactRef.digest");
  }
  const stateArtifact = parseJson(bytes, "state artifact");
  try {
    await validateStateArtifact(stateArtifact, {
      ref: immutableCopy(stateArtifactRef),
      phase: "routing",
    });
  } catch (error) {
    fail("DR2104", `state artifact validation failed: ${error.message}`);
  }

  const value = readPointer(stateArtifact, routing.discriminator);
  if (typeof value !== "string") {
    fail("DR2014", "routing discriminator value must be a string");
  }
  const rule = routing.rules.find((candidate) => candidate.value === value);
  if (!rule) {
    fail("DR2015", `no routing rule matches discriminator value "${value}"`);
  }

  const selection = Object.hasOwn(rule, "operation")
    ? {
        kind: "operation",
        operation: rule.operation,
      }
    : {
        kind: "prerequisite",
        module: rule.prerequisite.module,
        operation: rule.prerequisite.operation,
        outputSchema: rule.prerequisite.outputSchema,
      };

  return immutableCopy({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ModuleRouteDecision",
    module: {
      id: moduleDefinition.metadata.id,
      version: moduleDefinition.metadata.version,
    },
    state: {
      artifactId: stateArtifactRef.artifactId,
      schema: stateArtifactRef.schema,
      digest: stateArtifactRef.digest,
    },
    discriminator: {
      path: routing.discriminator,
      value,
    },
    reasonCode: rule.reasonCode,
    selection,
  });
}

export function assertInvocationMatchesRoute(decision, invocation) {
  requireRecord(decision, "routing decision");
  requireRecord(decision.module, "routing decision.module");
  requireRecord(decision.selection, "routing decision.selection");
  requireRecord(invocation, "invocation");
  requireRecord(invocation.module, "invocation.module");

  if (decision.selection.kind !== "operation") {
    fail("DR2016", "a prerequisite routing decision cannot start a module invocation");
  }
  if (
    decision.module.id !== invocation.module.id ||
    decision.module.version !== invocation.module.version ||
    decision.selection.operation !== invocation.module.operation
  ) {
    fail("DR2017", "invocation does not match the deterministic routing decision");
  }
  return invocation;
}
