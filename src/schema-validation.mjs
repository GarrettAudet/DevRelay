import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";

function readSchema(name) {
  return JSON.parse(
    readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"),
  );
}

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});

ajv.addFormat("uri", {
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

export const documentValidators = Object.freeze({
  moduleDefinition: ajv.compile(
    readSchema("module-definition.schema.json"),
  ),
  modulePlugin: ajv.compile(readSchema("module-plugin.schema.json")),
  moduleInvocation: ajv.compile(
    readSchema("module-invocation.schema.json"),
  ),
  moduleResult: ajv.compile(readSchema("module-result.schema.json")),
  requirementsArtifact: ajv.compile(
    readSchema("requirements-gathering-artifacts.schema.json"),
  ),
});

export function compileEmbeddedSchema(schema) {
  if (!ajv.validateSchema(schema)) {
    const detail = ajv.errorsText(ajv.errors, { separator: "; " });
    throw new Error(detail);
  }
  return ajv.compile(schema);
}

export function validationDetail(validator) {
  return ajv.errorsText(validator.errors, {
    dataVar: "document",
    separator: "; ",
  });
}
