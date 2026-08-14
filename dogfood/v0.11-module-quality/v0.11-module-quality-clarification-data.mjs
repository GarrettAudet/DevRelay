import { readFile } from "node:fs/promises";

import { ownerDecisions } from "./v0.11-module-quality-approved-data.mjs";

export const goal = Object.freeze(JSON.parse(await readFile(new URL("goal.json", import.meta.url), "utf8")));
export const projectContext = Object.freeze(JSON.parse(await readFile(new URL("project-context.json", import.meta.url), "utf8")));

export const questions = Object.freeze(ownerDecisions.map(({ questionId, decision }) => Object.freeze({
  id: questionId,
  prompt: `Approve the following normalized V0.11 requirement: ${decision}`,
  rationale: "This owner decision changes the deterministic RequirementsGathering, provider, evidence, domain-pack, Desktop, or release-acceptance contract and must be closed before architecture.",
  blocking: true,
  responseType: "single-choice",
  options: ["Approve exactly as stated", "Reject or provide a replacement"],
})));
