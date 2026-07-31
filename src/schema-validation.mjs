import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";

function readSchema(name) {
  return JSON.parse(
    readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"),
  );
}

function createAjv() {
  const instance = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
  });

  instance.addFormat("uri", {
    type: "string",
    validate(value) {
      try {
        const parsed = new URL(value);
        return parsed.protocol.length > 1;
      } catch {
        return false;
      }
    },
  });

  return instance;
}

const coreAjv = createAjv();

export const documentValidators = Object.freeze({
  moduleDefinition: coreAjv.compile(
    readSchema("module-definition.schema.json"),
  ),
  modulePlugin: coreAjv.compile(readSchema("module-plugin.schema.json")),
  moduleInvocation: coreAjv.compile(
    readSchema("module-invocation.schema.json"),
  ),
  moduleResult: coreAjv.compile(readSchema("module-result.schema.json")),
  moduleRouteDecision: coreAjv.compile(
    readSchema("module-route-decision.schema.json"),
  ),
  moduleStepInvocation: coreAjv.compile(
    readSchema("module-step-invocation.schema.json"),
  ),
  moduleStepResult: coreAjv.compile(
    readSchema("module-step-result.schema.json"),
  ),
});

export function compileEmbeddedSchema(schema) {
  if (!coreAjv.validateSchema(schema)) {
    const detail = coreAjv.errorsText(coreAjv.errors, {
      separator: "; ",
    });
    throw new Error(detail);
  }
  return coreAjv.compile(schema);
}

export function compileArtifactSchema(
  schema,
  dependencies = [],
) {
  const artifactAjv = createAjv();
  for (const dependency of dependencies) {
    artifactAjv.addSchema(dependency);
  }
  if (!artifactAjv.validateSchema(schema)) {
    const detail = artifactAjv.errorsText(artifactAjv.errors, {
      separator: "; ",
    });
    throw new Error(detail);
  }
  return artifactAjv.compile(schema);
}

export function validationDetail(validator) {
  return coreAjv.errorsText(validator.errors, {
    dataVar: "document",
    separator: "; ",
  });
}
