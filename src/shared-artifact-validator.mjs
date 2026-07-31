import { readFileSync } from "node:fs";

import {
  compileArtifactSchema,
  validationDetail,
} from "./schema-validation.mjs";

const sharedArtifactValidator = compileArtifactSchema(
  JSON.parse(
    readFileSync(
      new URL("../contracts/shared-artifacts.schema.json", import.meta.url),
      "utf8",
    ),
  ),
);

export class SharedArtifactValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SharedArtifactValidationError";
    this.code = "DR1850";
  }
}

export function validateSharedArtifact(artifact) {
  if (!sharedArtifactValidator(artifact)) {
    throw new SharedArtifactValidationError(
      `shared artifact is invalid: ${validationDetail(
        sharedArtifactValidator,
      )}`,
    );
  }
  return artifact;
}
