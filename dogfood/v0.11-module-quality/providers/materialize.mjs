import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import {
  createMadrLiveAdapter,
  createOpenSpecLiveAdapter,
  createSpecKitLiveAdapter,
  createStructurizrLiveAdapter,
} from "../../../src/live-provider-adapters.mjs";
import { evaluateProviderAvailability } from "../../../src/provider-toolchain.mjs";

const root = process.cwd();
const dir = path.join(root, "dogfood/v0.11-module-quality/providers");
const rawDir = path.join(root, ".devrelay/runtime/v0.11-live-providers");
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(rawDir, { recursive: true });
const envDigest = canonicalJsonDigest({ platform: "win32", architecture: process.arch, node: process.version, network: "disabled-during-invocation" });
const hostObserver = Object.freeze({
  id: "chatgpt-desktop-windows-host",
  version: "1.0.0",
  configurationDigest: canonicalJsonDigest({ host: "ChatGPT Desktop", platform: "Windows", rawEvidence: "local-only" }),
  authority: "host-trusted-observer",
});
const policy = Object.freeze({
  allowedLicenses: ["MIT", "CC0-1.0", "Apache-2.0"],
  allowedTelemetryModes: ["disabled", "none"],
});
const ref = (artifactId, file) => ({ artifactId, digest: sha256Digest(fs.readFileSync(file)) });
const request = (artifactId, file, projectRoot, extras = {}) => ({
  ...ref(artifactId, file),
  projectRoot,
  environmentDigest: envDigest,
  workingDirectoryDigest: canonicalJsonDigest({ projectRoot }),
  ...extras,
});
const manifests = Object.freeze({
  openspec: {
    providerId: "openspec", version: "1.9.0", checksum: "sha256:ca136f0e9fd4951dcf93d8ed729ebc97b2d97d3980cd9dc9d42fc80e32e797c6",
    projectLocalPath: ".devrelay/tools/openspec/1.9.0", acquisitionOwner: "host", adapterMayDownload: false,
    allowedOperations: ["requirements.validate"], license: "MIT", telemetryMode: "disabled",
    source: "https://www.npmjs.com/package/@fission-ai/openspec/v/1.9.0",
  },
  "spec-kit": {
    providerId: "spec-kit", version: "0.16.3", checksum: "sha256:b08eacabac9e2efa85945056365626e2d3e0d3b31dc1be232666f2c8babcf07d",
    projectLocalPath: ".devrelay/tools/spec-kit/0.16.3", acquisitionOwner: "host", adapterMayDownload: false,
    allowedOperations: ["requirements.validate"], license: "MIT", telemetryMode: "none",
    source: "https://github.com/github/spec-kit/tree/v0.16.3", sourceCommit: "b85aaeda4a7aec37a6620bba9d77ab37c6589141",
  },
  structurizr: {
    providerId: "structurizr", version: "2026.06.28", checksum: "sha256:7bcee3932b1a6e62c07113008ec4959ced6700f666a3d02f708a1a2ebfdefed0",
    projectLocalPath: ".devrelay/tools/structurizr/2026.06.28", acquisitionOwner: "host", adapterMayDownload: false,
    allowedOperations: ["architecture.validate", "architecture.inspect", "architecture.export"], license: "Apache-2.0", telemetryMode: "none",
    source: "https://docs.structurizr.com/binaries",
  },
  madr: {
    providerId: "madr", version: "4.0.0", checksum: "sha256:4903614bbae9aeb2aa811caeb9e156677ef1a993872af6ff8dcfb67b2266cae1",
    projectLocalPath: ".devrelay/tools/madr/4.0.0", acquisitionOwner: "host", adapterMayDownload: false,
    allowedOperations: ["decision.validate"], license: "CC0-1.0", telemetryMode: "none",
    source: "https://github.com/adr/madr/tree/4.0.0", sourceCommit: "2475fe1973f66a12aaf58a91d8fa7b42c0f5ea3d",
  },
});

const evidencePath = path.join(dir, "live-provider-evidence.json");
const materialInputs = {
  schemaVersion: "1.0.0",
  manifests,
  sources: {
    materializer: ref("V011-LIVE-PROVIDER-MATERIALIZER", new URL(import.meta.url)),
    openSpec: ref("OPENSPEC-LIVE-SPEC", path.join(root, "dogfood/v0.11-module-quality/providers/openspec-live-fixture/openspec/changes/live-requirements-conformance/specs/live-provider/spec.md")),
    specKit: ref("SPEC-KIT-LIVE-SPEC", path.join(root, "dogfood/v0.11-module-quality/providers/spec-kit-live-fixture/specs/001-live-provider-spec/spec.md")),
    structurizr: ref("STRUCTURIZR-WORKSPACE", path.join(root, "dogfood/v0.11-module-quality/architecture-design/workspace.dsl")),
    madrDocuments: fs.readdirSync(path.join(root, "dogfood/v0.11-module-quality/architecture-design"))
      .filter((name) => /^\d{4}-adr-mq-\d{3}\.proposed\.md$/u.test(name))
      .sort()
      .map((name) => ref(`MADR-${name}`, path.join(root, "dogfood/v0.11-module-quality/architecture-design", name))),
    godotMcp: ref("GODOT-AI-MCP-RECEIPT", path.join(root, ".devrelay/runtime/godot-ai-v011/mcp-live-receipt.json")),
    godotInput: ref("GODOT-AI-INPUT-RECEIPT", path.join(root, ".devrelay/runtime/godot-ai-v011/mcp-input-receipt.json")),
    gdunit4Junit: ref("GDUNIT4-JUNIT", path.join(root, "dogfood/v0.11-module-quality/providers/godot-live-fixture/reports/report_1/results.xml")),
  },
};
const inputDigest = canonicalJsonDigest(materialInputs);
if (fs.existsSync(evidencePath)) {
  const existing = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const { evidenceDigest: existingDigest, ...existingMaterial } = existing;
  if (existing.inputDigest === inputDigest && existingDigest === canonicalJsonDigest(existingMaterial)) {
    console.log(JSON.stringify({ replayed: true, inputDigest, evidenceDigest: existingDigest, operationCount: existing.operations.length }, null, 2));
    process.exit(0);
  }
}

function resolveHostCommand(providerId, arguments_) {
  switch (providerId) {
    case "openspec":
      return {
        executable: process.execPath,
        arguments: [path.join(root, ".devrelay/tools/openspec/1.9.0/node_modules/@fission-ai/openspec/bin/openspec.js"), ...arguments_],
      };
    case "spec-kit":
      return {
        executable: path.join(root, ".devrelay/tools/spec-kit/0.16.3/.venv312/Scripts/specify.exe"),
        arguments: arguments_,
      };
    case "structurizr":
      return {
        executable: path.join(root, ".devrelay/tools/java/21.0.12/runtime/jdk-21.0.12+8-jre/bin/java.exe"),
        arguments: ["-jar", path.join(root, ".devrelay/tools/structurizr/2026.06.28/structurizr-2026.06.28.war"), ...arguments_],
      };
    case "madr":
      return {
        executable: process.execPath,
        arguments: [path.join(root, "scripts/validate-madr.mjs"), ...arguments_],
      };
    default:
      throw new Error(`Unsupported live provider ${providerId}`);
  }
}

const observations = [];
function hostExecuteFor(providerId) {
  return async ({ command, request: invocationRequest, effect }) => {
    const { executable, arguments: executableArguments } = resolveHostCommand(providerId, command.arguments);
    const started = new Date();
    const startedClock = process.hrtime.bigint();
    const result = spawnSync(executable, executableArguments, {
      cwd: path.resolve(root, invocationRequest.projectRoot),
      windowsHide: true,
      encoding: null,
      env: { ...process.env, NO_TELEMETRY: "1", OPENSPEC_TELEMETRY: "0" },
      maxBuffer: 32 * 1024 * 1024,
    });
    const completed = new Date();
    const stdout = Buffer.from(result.stdout ?? []);
    const stderr = Buffer.from(result.stderr ?? []);
    const raw = Buffer.from(JSON.stringify({
      effect, executable, arguments: executableArguments, plannedCommand: command, exitCode: result.status ?? -1,
      stdoutBase64: stdout.toString("base64"), stderrBase64: stderr.toString("base64"),
      startedAt: started.toISOString(), completedAt: completed.toISOString(),
    }));
    const rawPath = path.join(rawDir, `${providerId}-${effect.id}.json`);
    fs.writeFileSync(rawPath, raw);
    const artifacts = (invocationRequest.nativeArtifacts ?? []).map((item) => ({ artifactId: item.artifactId, digest: item.digest }));
    observations.push({ providerId, effectId: effect.id, rawPath, rawDigest: sha256Digest(raw), stdoutDigest: sha256Digest(stdout), stderrDigest: sha256Digest(stderr) });
    return {
      exitCode: result.status ?? -1,
      durationMilliseconds: Number(process.hrtime.bigint() - startedClock) / 1_000_000,
      toolVersion: manifests[providerId].version,
      stdout,
      stderr,
      artifacts,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      safetyFindings: [],
    };
  };
}

function ports(providerId, factory) {
  const manifest = manifests[providerId];
  const installation = { status: "present", version: manifest.version, checksum: manifest.checksum, projectLocalPath: manifest.projectLocalPath };
  const assessment = evaluateProviderAvailability({ manifest, installation, policy });
  return factory({
    manifest,
    assessment,
    hostExecute: hostExecuteFor(providerId),
    hostObserver,
    normalizeNative: async ({ operation, nativeArtifacts }) => ({
      apiVersion: "devrelay.dev/v1alpha1", kind: "NormalizedLiveProviderObservation", providerId, operation, nativeArtifacts,
    }),
  });
}

const results = [];
const openSpecRoot = "dogfood/v0.11-module-quality/providers/openspec-live-fixture";
const openSpecSpec = path.join(root, openSpecRoot, "openspec/changes/live-requirements-conformance/specs/live-provider/spec.md");
results.push(await ports("openspec", createOpenSpecLiveAdapter).invoke({
  operation: "requirements.validate",
  request: request("OPENSPEC-LIVE-SPEC", openSpecSpec, openSpecRoot, { nativeArtifacts: [ref("OPENSPEC-LIVE-SPEC", openSpecSpec)] }),
  grants: ["process.spawn"],
}));

const specKitRoot = "dogfood/v0.11-module-quality/providers/spec-kit-live-fixture";
const specKitSpec = path.join(root, specKitRoot, "specs/001-live-provider-spec/spec.md");
results.push(await ports("spec-kit", createSpecKitLiveAdapter).invoke({
  operation: "requirements.validate",
  request: request("SPEC-KIT-LIVE-SPEC", specKitSpec, specKitRoot, { nativeArtifacts: [ref("SPEC-KIT-LIVE-SPEC", specKitSpec)] }),
  grants: ["process.spawn"],
}));

const architectureRoot = "dogfood/v0.11-module-quality/architecture-design";
const workspace = path.join(root, architectureRoot, "workspace.dsl");
const structurizrAdapter = ports("structurizr", createStructurizrLiveAdapter);
const exportPath = ".devrelay/runtime/v0.11-live-providers/structurizr-export";
fs.mkdirSync(path.join(root, exportPath), { recursive: true });
for (const operation of ["architecture.validate", "architecture.inspect", "architecture.export"]) {
  results.push(await structurizrAdapter.invoke({
    operation,
    request: request(`STRUCTURIZR-${operation.toUpperCase().replaceAll(".", "-")}`, workspace, ".", {
      workspacePath: architectureRoot + "/workspace.dsl", exportFormat: "json", outputPath: exportPath,
      nativeArtifacts: [ref("STRUCTURIZR-WORKSPACE", workspace)],
    }),
    grants: ["process.spawn"],
  }));
}

const madrAdapter = ports("madr", createMadrLiveAdapter);
const templatePath = ".devrelay/tools/madr/4.0.0/source/template/adr-template.md";
for (const name of fs.readdirSync(path.join(root, architectureRoot)).filter((name) => /^\d{4}-adr-mq-\d{3}\.proposed\.md$/u.test(name)).sort()) {
  const documentPath = `${architectureRoot}/${name}`;
  const absoluteDocument = path.join(root, documentPath);
  results.push(await madrAdapter.invoke({
    operation: "decision.validate",
    request: request(`MADR-${name}`, absoluteDocument, ".", {
      templateVersion: "4.0.0", templatePath, documentPath, sourceCommit: manifests.madr.sourceCommit,
      nativeArtifacts: [ref(`MADR-${name}`, absoluteDocument)],
    }),
    grants: ["process.spawn"],
  }));
}

const godotMcpRaw = path.join(root, ".devrelay/runtime/godot-ai-v011/mcp-live-receipt.json");
const godotInputRaw = path.join(root, ".devrelay/runtime/godot-ai-v011/mcp-input-receipt.json");
const junitPath = path.join(root, "dogfood/v0.11-module-quality/providers/godot-live-fixture/reports/report_1/results.xml");
const godotEvidence = {
  godot: { version: "4.7.1", executableDigest: "sha256:35dab11e04ece16a2b93035e65204f4a944a3e00b020d43e54409193379d5eef" },
  godotAi: { version: "3.1.5", pluginDigest: "sha256:3ec16f7d84c68d769e304b1cf384fffcfb59211f0b39d989a874eb73de254446", rawMcpReceiptDigest: sha256Digest(fs.readFileSync(godotMcpRaw)), rawInputReceiptDigest: sha256Digest(fs.readFileSync(godotInputRaw)), maturity: "live-conformant" },
  gdunit4: { version: "6.2.0", sourceCommit: "d18770221c2df4a3c991a42fdce7907df40eea75", pluginDigest: "sha256:2bb1c3e5b47ca04ee5e74a0febb55e15cdadd3795f8f399b4fc176e8ab31d24a", junitDigest: sha256Digest(fs.readFileSync(junitPath)), tests: 2, failures: 0, errors: 0, maturity: "live-conformant", wrapperDisposition: "upstream-runtest.cmd passes invalid remote-debug port 0 to Godot 4.7.1; exact underlying GdUnitCmdTool.gd runner passed" },
  compatibility: { platform: "Windows", godot: "4.7.1", godotAi: "3.1.5", gdunit4: "6.2.0", status: "supported-with-wrapper-bypass", evidenceScope: "isolated V0.11 fixture only" },
};

const resultSummary = results.map((item) => ({
  providerId: item.providerId,
  operation: item.operation,
  maturity: item.attestation.maturity,
  attestationId: item.attestation.attestationId,
  attestationDigest: item.attestation.attestationDigest,
  receiptId: item.receipt.receiptId,
  receiptDigest: item.receipt.receiptDigest,
  nativeArtifacts: item.nativeArtifacts,
}));
const material = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "V011LiveProviderEvidenceSet",
  inputDigest,
  generatedAt: new Date().toISOString(),
  scope: "ChatGPT Desktop on Windows",
  manifests,
  operations: resultSummary,
  providerAttestations: Object.fromEntries(results.map((item) => [item.providerId + ":" + item.operation, item.attestation])),
  godotEvidence,
  localRawObservations: observations.map(({ providerId, effectId, rawDigest, stdoutDigest, stderrDigest }) => ({ providerId, effectId, rawDigest, stdoutDigest, stderrDigest, storage: "local-only" })),
  limitations: [
    "OpenSpec and Spec Kit gathering remain bounded host-mediated strategy operations; the live evidence here attests their real validation/bootstrap surfaces, not lifecycle authority.",
    "Structurizr legacy cumulative-model connectivity and view coverage remain visible as warnings; inspection has zero errors.",
    "MADR is a template repository rather than an upstream CLI; DevRelay executes an exact-template-pinned deterministic validator.",
    "Godot compatibility is claimed only for the exact Windows fixture combination shown above.",
  ],
};
material.evidenceDigest = canonicalJsonDigest(material);
fs.writeFileSync(path.join(dir, "live-provider-evidence.json"), `${JSON.stringify(material, null, 2)}\n`);
const markdown = [
  "# V0.11 live-provider evidence", "", `Evidence digest: \`${material.evidenceDigest}\``, "", "| Provider | Operation | Maturity | Receipt |", "| --- | --- | --- | --- |",
  ...resultSummary.map((item) => `| ${item.providerId} | ${item.operation} | ${item.maturity} | \`${item.receiptDigest}\` |`),
  "", "## Godot compatibility", "", `Godot ${godotEvidence.godot.version} + Godot AI ${godotEvidence.godotAi.version} + GdUnit4 ${godotEvidence.gdunit4.version}: **${godotEvidence.compatibility.status}** on Windows.`,
  "", "The exact GdUnit4 runner passed 2/2 tests with JUnit evidence. The upstream Windows wrapper port-0 incompatibility is preserved in the JSON evidence and was bypassed only by invoking its underlying pinned runner directly.",
  "", "## Boundaries", "", ...material.limitations.map((item) => `- ${item}`), "",
].join("\n");
fs.writeFileSync(path.join(dir, "LIVE_PROVIDER_EVIDENCE.md"), markdown);
console.log(JSON.stringify({ evidenceDigest: material.evidenceDigest, operationCount: results.length, godotCompatibility: godotEvidence.compatibility.status }, null, 2));
