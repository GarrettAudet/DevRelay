import {
  documentValidators,
  validationDetail,
} from "./schema-validation.mjs";

export class ArtifactValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArtifactValidationError";
    this.code = "DR1800";
  }
}

export function validateRequirementsArtifact(artifact) {
  if (!documentValidators.requirementsArtifact(artifact)) {
    throw new ArtifactValidationError(
      `requirements artifact is invalid: ${validationDetail(
        documentValidators.requirementsArtifact,
      )}`,
    );
  }
  return artifact;
}
