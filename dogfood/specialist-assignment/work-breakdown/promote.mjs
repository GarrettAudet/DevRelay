import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../../../src/content-digest.mjs";
import { validateWorkBreakdownArtifact } from "../../../src/work-breakdown-artifact-validator.mjs";

const ROOT = new URL("../../../", import.meta.url);
const OUTPUT = new URL("./", import.meta.url);
const APPROVED = Object.freeze({
  candidate: "sha256:c00e32c1e13d87d010c8de89ecd9156440d9dd38fd1130e404e75e9be90d6832",
  baseline: "sha256:4ef3f9ff4a15ffcd2a152d0a3a30532bd438c7b0d6e20a83db65bb9aa3580e84",
});

async function loaded(name) {
  const bytes = await readFile(new URL(name, OUTPUT));
  return { bytes, value: JSON.parse(bytes) };
}

async function preserveAndReplace(bytes, currentUrl, historyUrl) {
  const currentPath = fileURLToPath(currentUrl);
  try {
    const current = await readFile(currentPath);
    if (current.equals(bytes)) return;
    const historyPath = fileURLToPath(historyUrl);
    await mkdir(path.dirname(historyPath), { recursive: true });
    try {
      const preserved = await readFile(historyPath);
      if (!preserved.equals(current)) throw new Error(`history differs: ${historyPath}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await writeFile(historyPath, current, { flag: "wx" });
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(currentPath), { recursive: true });
  await writeFile(currentPath, bytes);
}

const baseline = await loaded("work-breakdown-baseline.json");
const proof = await loaded("work-breakdown-gate-promotion-proof.json");
const invocationState = await loaded("project-work-breakdown-state.json");
if (sha256Digest(baseline.bytes) !== APPROVED.baseline) throw new Error("baseline digest changed");
if (proof.value.candidate.digest !== APPROVED.candidate) throw new Error("candidate approval changed");
if (proof.value.promotedWorkBreakdownBaseline.digest !== APPROVED.baseline) throw new Error("promotion proof does not bind baseline");
validateWorkBreakdownArtifact(baseline.value);

const state = structuredClone(invocationState.value);
state.stateId = "PWBS-SA-PROMOTED-001";
state.currentWorkBreakdownBaseline = structuredClone(proof.value.promotedWorkBreakdownBaseline);
validateWorkBreakdownArtifact(state);
const stateBytes = Buffer.from(`${JSON.stringify(state, null, 2)}\n`, "utf8");

const history = new URL("project/history/work-breakdown/1.1.0/", ROOT);
await preserveAndReplace(baseline.bytes, new URL("project/work-breakdown-baseline.json", ROOT), new URL("work-breakdown-baseline.json", history));
await preserveAndReplace(stateBytes, new URL("project/project-work-breakdown-state.json", ROOT), new URL("project-work-breakdown-state.json", history));
await preserveAndReplace(proof.bytes, new URL("project/work-breakdown-promotion.commit.json", ROOT), new URL("work-breakdown-promotion.commit.json", history));

process.stdout.write(`${JSON.stringify({
  status: "WORK_BREAKDOWN_PROJECT_STATE_PROMOTED",
  candidate: APPROVED.candidate,
  baseline: APPROVED.baseline,
  state: sha256Digest(stateBytes),
  nextModule: "work-dependency-analysis",
}, null, 2)}\n`);
