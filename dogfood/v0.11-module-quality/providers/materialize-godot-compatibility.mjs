import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "../../../src/content-digest.mjs";
import { createGodotCompatibilityPolicy, evaluateGodotCompatibility, verifyGodotCompatibilityPolicy } from "../../../src/godot-compatibility.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const providerRoot = path.join(root, "dogfood/v0.11-module-quality/providers");
const source = JSON.parse(fs.readFileSync(path.join(providerRoot, "godot-adapter-evidence.json"), "utf8"));

if (source.compatibility?.godot !== "4.7.1" || source.compatibility?.gdunit4 !== "6.2.0" || source.compatibility?.godotAi !== "3.1.5" || source.compatibility?.platform !== "Windows") {
  throw new Error("Live Godot adapter evidence does not match the approved compatibility tuple.");
}

const evidence = [
  { artifactId: "V011-GODOT-ADAPTER-EVIDENCE", digest: source.evidenceDigest },
  { artifactId: source.results.gdunit4.evidenceId, digest: source.results.gdunit4.evidenceDigest },
  { artifactId: source.results.screenshot.nativeArtifacts[0].artifactId, digest: source.results.screenshot.nativeArtifacts[0].digest },
];

const policy = createGodotCompatibilityPolicy({
  policyId: "GCP-DEVRELAY-V011-WINDOWS",
  version: "1.0.0",
  supportedTuples: [{
    godotVersion: source.compatibility.godot,
    gdunitVersion: source.compatibility.gdunit4,
    godotAiVersion: source.compatibility.godotAi,
    platform: "win32",
    architecture: "x64",
    evidence,
  }],
});
verifyGodotCompatibilityPolicy(policy);

const decision = evaluateGodotCompatibility({
  decisionId: "GCD-DEVRELAY-V011-WINDOWS",
  policy,
  godotVersion: source.compatibility.godot,
  gdunitVersion: source.compatibility.gdunit4,
  godotAiVersion: source.compatibility.godotAi,
  platform: "win32",
  architecture: "x64",
  evidence,
});
if (decision.outcome !== "supported" || decision.releaseAuthority !== false) throw new Error("Compatibility decision is not a supported advisory result.");

fs.writeFileSync(path.join(providerRoot, "godot-compatibility-policy.json"), canonicalJson(policy) + "\n", "utf8");
fs.writeFileSync(path.join(providerRoot, "godot-compatibility-decision.json"), canonicalJson(decision) + "\n", "utf8");
process.stdout.write(JSON.stringify({ policyDigest: policy.policyDigest, decisionDigest: decision.decisionDigest, outcome: decision.outcome }, null, 2) + "\n");
