import { readFileSync } from "node:fs";
import { compileArtifactSchema, validationDetail } from "./schema-validation.mjs";

export const COMPOSITION_SCHEMA = "https://devrelay.dev/generated/if-mes-composition/v1";
const schema = JSON.parse(readFileSync(new URL("../contracts/workflow-composition-artifacts-v1.schema.json", import.meta.url)));
const validators = new Map();

export class CompositionError extends Error {
  constructor(code, message, outcome = "incompatible", slotId = "workflow") {
    super(message);
    Object.assign(this, { name: "CompositionError", code, outcome, slotId });
  }
}

export function validateCompositionArtifact(value, kind = value?.kind) {
  if (!schema.$defs[kind]) throw new CompositionError("schema-mismatch", "Unknown composition artifact kind");
  if (!validators.has(kind)) validators.set(kind, compileArtifactSchema({
    $schema: schema.$schema, $defs: schema.$defs, $ref: `#/$defs/${kind}`,
  }));
  const validate = validators.get(kind);
  if (!validate(value)) throw new CompositionError("schema-mismatch", validationDetail(validate));
  return value;
}

export function closed(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new CompositionError("schema-mismatch", `${label} must contain exactly ${keys.join(", ")}`);
  }
  return value;
}

export function unique(values, label) {
  if (new Set(values).size !== values.length) throw new CompositionError("ambiguous-selection", `${label} contains duplicates`, "ambiguous");
}

export function immutable(value) {
  const copy = structuredClone(value);
  function freeze(item) {
    if (item && typeof item === "object") { Object.values(item).forEach(freeze); Object.freeze(item); }
  }
  freeze(copy);
  return copy;
}
