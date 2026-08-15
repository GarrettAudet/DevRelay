import { readFile } from "node:fs/promises";

import { ownerDecisions } from "./sim-001-simplification-approved-data.mjs";

export const goal = Object.freeze(JSON.parse(await readFile(new URL("goal.json", import.meta.url), "utf8")));
export const projectContext = Object.freeze(JSON.parse(await readFile(new URL("project-context.json", import.meta.url), "utf8")));

export const questions = Object.freeze(ownerDecisions.map(({ questionId, decision }) => Object.freeze({
  id: questionId,
  prompt: `Approve the following normalized SIM-001 requirement: ${decision}`,
  rationale: "This decision changes DevRelay's product surface, release policy, evidence boundary, domain-pack boundary, or durable-host contract and must be closed before architecture.",
  blocking: true,
  responseType: "single-choice",
  options: ["Approve exactly as stated", "Reject or provide a replacement"],
})));
