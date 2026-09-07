import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const FILES = [
  "cross-cutting-module-binding.schema.json",
  "quality-policy-artifacts.schema.json",
  "work-continuity-artifacts.schema.json",
  "project-control-artifacts.schema.json",
];
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true });
const validators = FILES.map((name) => ajv.compile(JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"))));

export class QualityContinuityArtifactValidationError extends Error {
  constructor(message) {
    super(`quality continuity artifact validation failed: ${message}`);
    this.name = "QualityContinuityArtifactValidationError";
    this.code = "DR7400";
  }
}

export function validateQualityContinuityArtifact(value) {
  for (const validator of validators) {
    if (validator(value)) return value;
  }
  const detail = validators.map((validator) => ajv.errorsText(validator.errors, { separator: "; " })).join(" | ");
  throw new QualityContinuityArtifactValidationError(detail);
}
