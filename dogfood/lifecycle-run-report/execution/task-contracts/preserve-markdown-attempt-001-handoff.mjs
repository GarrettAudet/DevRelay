import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const bytes = Buffer.from('{ "apiVersion": "devrelay.dev/v1alpha1", "kind": "BootstrapWorkItemHandoff", "executionId": "WE-RUN-DOGFOOD-WI-RUN-MARKDOWN-ATTEMPT-001", "workItemId": "WI-RUN-MARKDOWN", "outcome": "pass", "changedFiles": [ "src/lifecycle-run-report-markdown.mjs", "test/lifecycle-run-report-markdown.test.mjs" ], "verification": [ { "command": "node --experimental-loader=file:///C:/Users/garre/OneDrive/Documents/Portable%20Best%20Practices/.tmp-devrelay-snapshot-dependency-loader.mjs --test test/lifecycle-run-report-markdown.test.mjs", "exitCode": 0, "summary": "3 focused Markdown renderer and read-only access tests passed." } ], "evidence": [ { "kind": "lifecycle-run-report/markdown-tests", "relativePath": "test/lifecycle-run-report-markdown.test.mjs", "digest": "sha256:318a0c44712cff66e1b2f508ef30586de6036ec8e2b1259cad7a2389164dd2b6" } ], "notes": "Implemented deterministic policy-filtered LifecycleRunReport Markdown rendering, exact artifact links, dynamic lifecycle state reporting, and digest-bound read-only report access.", "residualRisks": [ "none" ] }', "utf8");
const target = new URL("attempts/WI-RUN-MARKDOWN.attempt-001.handoff.raw.json", import.meta.url);
writeFileSync(target, bytes);
const stored = readFileSync(target);
if (!stored.equals(bytes)) throw new Error("raw handoff byte identity was not preserved");
console.log(`sha256:${createHash("sha256").update(stored).digest("hex")}`);
