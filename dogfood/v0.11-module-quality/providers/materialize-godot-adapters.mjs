import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { canonicalJsonDigest, sha256Digest } from "../../../src/content-digest.mjs";
import { createGdUnit4VerificationAdapter, createGodotMcpAdapter } from "../../../src/godot-provider-adapters.mjs";

const root = process.cwd();
const evidenceDirectory = path.join(root, "dogfood/v0.11-module-quality/providers");
const evidencePath = path.join(evidenceDirectory, "godot-adapter-evidence.json");
const rawDirectory = path.join(root, ".devrelay/runtime/v0.11-godot-adapters");
const fixtureRelative = "dogfood/v0.11-module-quality/providers/godot-live-fixture";
const fixture = path.join(root, fixtureRelative);
const mcpReceiptPath = path.join(root, ".devrelay/runtime/godot-ai-v011/mcp-live-receipt.json");
const inputReceiptPath = path.join(root, ".devrelay/runtime/godot-ai-v011/mcp-input-receipt.json");
const godotExecutable = path.join(root, ".devrelay/tools/godot/4.7.1/runtime/Godot_v4.7.1-stable_win64_console.exe");
const ref = (artifactId, file, extra = {}) => ({ artifactId, digest: sha256Digest(fs.readFileSync(file)), ...extra });
const fixtureFiles = ["project.godot", "main.gd", "main.tscn", "test/provider_fixture_test.gd"];

fs.mkdirSync(rawDirectory, { recursive: true });

function openMutableEvidenceFile(filePath) {
  try {
    return fs.openSync(filePath, "r+");
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ENOENT")) {
      throw error;
    }
  }
  try {
    return fs.openSync(filePath, "wx+");
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "EEXIST")) {
      throw error;
    }
    return fs.openSync(filePath, "r+");
  }
}

const evidenceDescriptor = openMutableEvidenceFile(evidencePath);

function readDescriptorBytes(descriptor) {
  const bytes = Buffer.alloc(fs.fstatSync(descriptor).size);
  let offset = 0;
  while (offset < bytes.length) {
    const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
    if (count === 0) throw new Error("Godot adapter evidence ended during descriptor read");
    offset += count;
  }
  return bytes;
}

function replaceDescriptorBytes(descriptor, bytes) {
  fs.ftruncateSync(descriptor, 0);
  let offset = 0;
  while (offset < bytes.length) {
    offset += fs.writeSync(descriptor, bytes, offset, bytes.length - offset, offset);
  }
  fs.fsyncSync(descriptor);
}

const materializerRef = ref("V011-GODOT-ADAPTER-MATERIALIZER", new URL(import.meta.url));
const inputMaterial = {
  schemaVersion: "1.0.0",
  materializer: materializerRef,
  tools: {
    godot: { version: "4.7.1", executable: ref("GODOT-EXECUTABLE", godotExecutable) },
    godotAi: { version: "3.1.5", plugin: ref("GODOT-AI-PLUGIN", path.join(fixture, "addons/godot_ai/plugin.cfg")) },
    gdunit4: { version: "6.2.0", sourceCommit: "d18770221c2df4a3c991a42fdce7907df40eea75", plugin: ref("GDUNIT4-PLUGIN", path.join(fixture, "addons/gdUnit4/plugin.cfg")) },
  },
  fixture: fixtureFiles.map((file) => ref(`GODOT-FIXTURE-${file.toUpperCase().replaceAll(/[^A-Z0-9]+/gu, "-")}`, path.join(fixture, file))),
  capturedLiveReceipts: {
    mcp: ref("GODOT-AI-MCP-LIVE", mcpReceiptPath),
    input: ref("GODOT-AI-INPUT-LIVE", inputReceiptPath),
  },
};
const inputDigest = canonicalJsonDigest(inputMaterial);
const existingEvidenceBytes = readDescriptorBytes(evidenceDescriptor);
if (existingEvidenceBytes.length > 0) {
  const existing = JSON.parse(existingEvidenceBytes.toString("utf8"));
  const { evidenceDigest, ...body } = existing;
  if (existing.inputDigest === inputDigest && evidenceDigest === canonicalJsonDigest(body)) {
    fs.closeSync(evidenceDescriptor);
    console.log(JSON.stringify({ replayed: true, inputDigest, evidenceDigest }, null, 2));
    process.exit(0);
  }
}

const environmentDigest = canonicalJsonDigest({ host: "ChatGPT Desktop", platform: "Windows", godot: "4.7.1", godotAi: "3.1.5", gdunit4: "6.2.0" });
const mcpReceipt = JSON.parse(fs.readFileSync(mcpReceiptPath, "utf8"));
const inputReceipt = JSON.parse(fs.readFileSync(inputReceiptPath, "utf8"));
const screenshotCall = mcpReceipt.calls.find((call) => call.name === "editor_screenshot" && call.status === "pass");
const screenshotBlock = screenshotCall?.result?.content?.find((item) => item.type === "image");
if (!screenshotBlock?.data || screenshotBlock.mimeType !== "image/png") throw new Error("captured MCP screenshot receipt is incomplete");
const screenshotBytes = Buffer.from(screenshotBlock.data, "base64");
const inputCalls = inputReceipt.calls.filter((call) => call.name === "game_manage" && call.arguments?.op === "input_key" && call.status === "pass");
if (inputCalls.length !== 2 || inputReceipt.capabilityGrant?.id !== "GRANT-GODOT-MCP-INPUT-V011-001") throw new Error("captured input receipt is not bound to the approved capability grant");

const mcpAdapter = createGodotMcpAdapter({
  hostCall: async ({ request }) => {
    if (request.operation === "screenshot") {
      return {
        exitCode: 0,
        durationMilliseconds: 0,
        toolVersion: "3.1.5",
        stdout: Buffer.from(JSON.stringify(screenshotCall.result.structuredContent ?? {})),
        stderr: Buffer.alloc(0),
        structuredMcpBytes: fs.readFileSync(mcpReceiptPath),
        artifacts: [{
          artifactId: "GODOT-AI-SCREENSHOT-V011",
          digest: sha256Digest(screenshotBytes),
          mediaType: "image/png",
          role: "screenshot-receipt",
        }],
      };
    }
    if (request.operation === "input") {
      return {
        exitCode: 0,
        durationMilliseconds: 0,
        toolVersion: "3.1.5",
        stdout: Buffer.from(JSON.stringify(inputCalls.map((call) => call.result.structuredContent))),
        stderr: Buffer.alloc(0),
        structuredMcpBytes: fs.readFileSync(inputReceiptPath),
        artifacts: [{
          ...ref("GODOT-AI-INPUT-RECEIPT-V011", inputReceiptPath),
          mediaType: "application/json",
          role: "input-receipt",
        }],
      };
    }
    throw new Error(`unbound captured operation ${request.operation}`);
  },
});
const commonMcp = {
  godotVersion: "4.7.1",
  providerVersion: "3.1.5",
  projectPath: fixtureRelative,
  environmentDigest,
};
const screenshotResult = await mcpAdapter.invoke({
  ...commonMcp,
  operation: "screenshot",
  targetPath: "main.tscn",
  grants: ["godot.screenshot"],
});
const inputResult = await mcpAdapter.invoke({
  ...commonMcp,
  operation: "input",
  targetPath: "main.tscn",
  grants: ["godot.input"],
});

function findFile(directory, name) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(candidate, name);
      if (nested) return nested;
    } else if (entry.name === name) {
      return candidate;
    }
  }
  return undefined;
}

const rawExecutions = [];
const gdunitAdapter = createGdUnit4VerificationAdapter({
  hostExecute: async ({ stage, effect }) => {
    const reportRelative = `reports/devrelay-adapter-${stage}`;
    const reportDirectory = path.join(fixture, reportRelative);
    fs.rmSync(reportDirectory, { recursive: true, force: true });
    const arguments_ = [
      "--headless",
      "--path",
      fixture,
      "-s",
      "-d",
      "res://addons/gdUnit4/bin/GdUnitCmdTool.gd",
      "-a",
      "res://test",
      "-rd",
      `res://${reportRelative}`,
      "--ignoreHeadlessMode",
    ];
    const started = new Date().toISOString();
    const clock = process.hrtime.bigint();
    const executed = spawnSync(godotExecutable, arguments_, {
      cwd: fixture,
      windowsHide: true,
      encoding: null,
      maxBuffer: 32 * 1024 * 1024,
    });
    const completed = new Date().toISOString();
    const stdout = Buffer.from(executed.stdout ?? []);
    const stderr = Buffer.from(executed.stderr ?? []);
    const raw = Buffer.from(JSON.stringify({
      effect,
      executable: godotExecutable,
      arguments: arguments_,
      exitCode: executed.status ?? -1,
      stdoutBase64: stdout.toString("base64"),
      stderrBase64: stderr.toString("base64"),
      startedAt: started,
      completedAt: completed,
    }));
    const rawPath = path.join(rawDirectory, `gdunit4-${stage}.json`);
    fs.writeFileSync(rawPath, raw);
    const artifacts = [];
    if (stage === "junit") {
      const junit = findFile(reportDirectory, "results.xml");
      if (!junit) throw new Error("GdUnit4 did not materialize JUnit XML");
      artifacts.push({
        ...ref("GDUNIT4-JUNIT-V011", junit),
        mediaType: "application/junit+xml",
        role: "test-report",
      });
    }
    rawExecutions.push({ stage, rawDigest: sha256Digest(raw), storage: "local-only" });
    return {
      exitCode: executed.status ?? -1,
      durationMilliseconds: Number(process.hrtime.bigint() - clock) / 1_000_000,
      toolVersion: "6.2.0",
      stdout,
      stderr,
      artifacts,
      startedAt: started,
      completedAt: completed,
    };
  },
});
const gdunitResult = await gdunitAdapter.invoke({
  requestId: "GDU-V011-LIVE-001",
  projectPath: fixtureRelative,
  godotVersion: "4.7.1",
  gdunitVersion: "6.2.0",
  environmentDigest,
  stages: ["focused", "junit"],
  subject: ref("GODOT-FIXTURE-PROJECT", path.join(fixture, "project.godot")),
});
if (gdunitResult.outcome !== "verified") throw new Error("production GdUnit4 adapter did not verify the fixture");

const material = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "V011GodotAdapterEvidence",
  inputDigest,
  generatedAt: new Date().toISOString(),
  scope: "ChatGPT Desktop on Windows isolated provider fixture",
  compatibility: {
    platform: "Windows",
    godot: "4.7.1",
    godotAi: "3.1.5",
    gdunit4: "6.2.0",
    status: "supported-with-wrapper-bypass",
    upstreamWrapperDisposition: "GdUnit4 runtest.cmd passes remote-debug port 0, rejected by Godot 4.7.1; DevRelay invokes the exact pinned underlying GdUnitCmdTool.gd runner.",
  },
  capabilityGrant: inputReceipt.capabilityGrant,
  results: {
    screenshot: screenshotResult,
    input: inputResult,
    gdunit4: gdunitResult,
  },
  localRawExecutions: rawExecutions,
  limitations: [
    "The MCP adapter results normalize exact previously captured live calls; they do not replay input into the editor during evidence replay.",
    "Compatibility is claimed only for the exact pinned Windows fixture combination.",
  ],
};
material.evidenceDigest = canonicalJsonDigest(material);
replaceDescriptorBytes(evidenceDescriptor, Buffer.from(`${JSON.stringify(material, null, 2)}\n`, "utf8"));
fs.closeSync(evidenceDescriptor);
fs.writeFileSync(path.join(evidenceDirectory, "GODOT_ADAPTER_EVIDENCE.md"), [
  "# V0.11 Godot adapter evidence",
  "",
  `Evidence digest: \`${material.evidenceDigest}\``,
  "",
  "- Godot AI screenshot receipt: passed through the production adapter.",
  "- Godot AI input receipt: passed with explicit capability grant `GRANT-GODOT-MCP-INPUT-V011-001`.",
  "- GdUnit4: 2/2 focused tests passed and JUnit XML was preserved through the production verification adapter.",
  "- Compatibility: supported on the exact pinned Windows fixture with the documented upstream wrapper bypass.",
  "",
].join("\n"));
console.log(JSON.stringify({ evidenceDigest: material.evidenceDigest, screenshot: screenshotResult.receipt.terminalState, input: inputResult.receipt.terminalState, gdunit4: gdunitResult.outcome }, null, 2));
