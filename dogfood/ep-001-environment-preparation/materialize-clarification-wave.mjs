import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAdaptiveRequirementsInterview } from "../../src/requirements-interview.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(fs.readFileSync(path.join(directory, "requirements-interview-input.json"), "utf8"));
const result = runAdaptiveRequirementsInterview(input);

fs.writeFileSync(
  path.join(directory, "requirements-closure-assessment.json"),
  `${JSON.stringify(result.assessment, null, 2)}\n`,
  "utf8",
);
fs.writeFileSync(
  path.join(directory, "requirements-clarification-wave-1.json"),
  `${JSON.stringify(result.wave, null, 2)}\n`,
  "utf8",
);

process.stdout.write(`${JSON.stringify({ outcome: result.outcome, assessment: result.assessment, wave: result.wave }, null, 2)}\n`);
