import { createHash } from "node:crypto";

function normalizeJson(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON does not support non-finite numbers");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
        .map((key) => {
          if (value[key] === undefined) {
            throw new TypeError(
              `canonical JSON does not support undefined at key "${key}"`,
            );
          }
          return [key, normalizeJson(value[key])];
        }),
    );
  }
  throw new TypeError(`canonical JSON does not support ${typeof value}`);
}

export function canonicalJson(value) {
  return JSON.stringify(normalizeJson(value));
}

export function sha256Digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function canonicalJsonDigest(value) {
  return sha256Digest(Buffer.from(canonicalJson(value), "utf8"));
}
