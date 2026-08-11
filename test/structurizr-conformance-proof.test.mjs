import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createStructurizrConformanceProof } from "../scripts/verify-structurizr-conformance.mjs";

const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const normalizedWorkspace = {
  elements: [
    {
      id: "EL-1",
      name: "Core",
      type: "container",
      description: "Portable proof fixture",
    },
  ],
  relationships: [],
  views: [],
};
const normalizedWorkspaceBytes = Buffer.from(
  `${JSON.stringify(normalizedWorkspace, null, 2)}\n`,
  "utf8",
);
const workspaceBytes = Buffer.from("workspace fixture\n", "utf8");
const candidateBytes = Buffer.from("{\"kind\":\"ArchitectureChangeSetDraft\"}\n", "utf8");
const structurizr = {
  version: "2026.06.28",
  sha256: "7bcee3932b1a6e62c07113008ec4959ced6700f666a3d02f708a1a2ebfdefed0",
};

test("Structurizr proof identity ignores host JDK and raw export serialization", () => {
  const windows = createStructurizrConformanceProof({
    lock: {
      structurizr,
      java: {
        distribution: "Eclipse Temurin",
        version: "21.0.12+8",
        platform: "win32-x64",
        sha256: "b8aa18fef5edb69bee8618f99677d66d0873d22cb40d974c15ac9ffcdecf73ba",
      },
    },
    workspaceBytes,
    candidateBytes,
    normalizedWorkspace,
    normalizedWorkspaceBytes,
  });
  const linux = createStructurizrConformanceProof({
    lock: {
      structurizr,
      java: {
        distribution: "Eclipse Temurin",
        version: "21.0.11+10",
        platform: "linux-x64",
        sha256: "0".repeat(64),
      },
    },
    workspaceBytes,
    candidateBytes,
    normalizedWorkspace,
    normalizedWorkspaceBytes,
  });

  assert.deepEqual(linux, windows);
  assert.deepEqual(windows.parser.runtimeRequirement, {
    product: "Java",
    majorVersion: 21,
  });
  assert.equal(windows.parser.javaVersion, undefined);
  assert.equal(windows.parser.javaArtifactDigest, undefined);
  assert.equal(windows.export.workspaceDigest, undefined);
  assert.equal(
    windows.export.normalizedModelDigest,
    sha256(normalizedWorkspaceBytes),
  );
  assert.equal(windows.export.normalization, "devrelay-c4-model/v1");
});
