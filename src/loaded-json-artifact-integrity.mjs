import { isDeepStrictEqual } from "node:util";

import { sha256Digest } from "./content-digest.mjs";

export class LoadedJsonArtifactIntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "LoadedJsonArtifactIntegrityError";
  }
}

function fail(message) {
  throw new LoadedJsonArtifactIntegrityError(message);
}

function immutable(value) {
  const freeze = (entry) => {
    if (entry !== null && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(structuredClone(value));
}

export function loadOwnedJsonArtifact(loaded, label = "loaded artifact") {
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    loaded.ref === null ||
    typeof loaded.ref !== "object" ||
    typeof loaded.ref.digest !== "string" ||
    (!Buffer.isBuffer(loaded.bytes) && !(loaded.bytes instanceof Uint8Array)) ||
    loaded.value === undefined
  ) {
    fail(`${label} must contain ref, parsed value, and exact raw bytes`);
  }
  const bytes = Buffer.from(loaded.bytes);
  if (sha256Digest(bytes) !== loaded.ref.digest) {
    fail(`${label} bytes do not match its ArtifactRef`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} bytes are not valid UTF-8`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(`${label} bytes are not exactly one valid JSON value`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${label} JSON value must be an object`);
  }
  if (!isDeepStrictEqual(loaded.value, parsed)) {
    fail(`${label} parsed value does not match its exact raw bytes`);
  }
  return immutable(parsed);
}
