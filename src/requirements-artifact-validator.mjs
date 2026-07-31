import { readFileSync } from "node:fs";

import {
  compileArtifactSchema,
  validationDetail,
} from "./schema-validation.mjs";
const requirementsArtifactValidator = compileArtifactSchema(
  JSON.parse(
    readFileSync(
      new URL(
        "../contracts/requirements-gathering-artifacts.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  [
    JSON.parse(
      readFileSync(
        new URL("../contracts/shared-artifacts.schema.json", import.meta.url),
        "utf8",
      ),
    ),
  ],
);

export class ArtifactValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArtifactValidationError";
    this.code = "DR1800";
  }
}

export function validateRequirementsArtifact(artifact) {
  if (requirementsArtifactValidator(artifact)) {
    return artifact;
  }

  throw new ArtifactValidationError(
    `requirements artifact is invalid: ${validationDetail(
      requirementsArtifactValidator,
    )}`,
  );
}
