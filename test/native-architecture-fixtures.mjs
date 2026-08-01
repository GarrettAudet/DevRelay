import { readFile } from "node:fs/promises";

import { sha256Digest } from "../src/content-digest.mjs";

const root = new URL("../", import.meta.url);
const fixturePathByArtifactId = new Map([
  ["spec-kit-plan-auth-001", "examples/native/architecture/spec-kit-plan.md"],
  ["openspec-design-auth-change-001", "examples/native/architecture/openspec-design.md"],
  ["structurizr-workspace-auth-001", "examples/native/architecture/workspace.dsl"],
  ["madr-auth-001", "examples/native/architecture/0001-centralize-authentication.md"],
  ["architecture-discovery-report-001", "examples/native/architecture/discovery-report.json"],
]);

export const architectureNativeBytes = new Map(
  await Promise.all(
    [...fixturePathByArtifactId].map(async ([artifactId, path]) => [
      artifactId,
      await readFile(new URL(path, root)),
    ]),
  ),
);

export function registerArchitectureNativeBytes(value, bytesById) {
  if (Array.isArray(value)) {
    for (const entry of value) registerArchitectureNativeBytes(entry, bytesById);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const bytes = architectureNativeBytes.get(value.artifactId);
  if (bytes) bytesById.set(value.artifactId, Buffer.from(bytes));
  for (const child of Object.values(value)) {
    registerArchitectureNativeBytes(child, bytesById);
  }
}

export async function loadArchitectureNativeBytes(ref) {
  const bytes = architectureNativeBytes.get(ref.artifactId);
  if (!bytes) throw new Error(`missing native fixture ${ref.artifactId}`);
  if (sha256Digest(bytes) !== ref.digest) {
    throw new Error(`native fixture digest mismatch for ${ref.artifactId}`);
  }
  return Buffer.from(bytes);
}
