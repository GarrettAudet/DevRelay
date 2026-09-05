import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

function readInput() {
  return new Promise((resolve, reject) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { text += chunk; });
    process.stdin.on("end", () => {
      try { resolve(JSON.parse(text)); } catch (error) { reject(error); }
    });
    process.stdin.on("error", reject);
  });
}

function findProjectRoot(cwd) {
  let cursor = path.resolve(cwd);
  for (;;) {
    if (existsSync(path.join(cursor, "project", "project-memory-baseline.json")) && existsSync(path.join(cursor, "project", "CurrentSynopsis.md"))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

async function loadJournal(projectRoot) {
  const localModule = path.join(projectRoot, "src", "desktop-memory-journal.mjs");
  if (existsSync(localModule)) return import(pathToFileURL(localModule).href);
  try {
    const fromProject = createRequire(path.join(projectRoot, "package.json"));
    return import(pathToFileURL(fromProject.resolve("devrelay/desktop/memory")).href);
  } catch {
    throw new Error("DevRelay desktop memory runtime is not available in this project");
  }
}

const input = await readInput();
const projectRoot = findProjectRoot(input.cwd ?? process.cwd());
if (!projectRoot) process.exit(0);
const dataDirectory = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA;
if (!dataDirectory) throw new Error("PLUGIN_DATA is required for durable DevRelay memory");
const { createDesktopMemoryJournal } = await loadJournal(projectRoot);
const journal = createDesktopMemoryJournal({ dataDirectory: path.resolve(dataDirectory), projectRoot });
const sessionId = input.session_id;

if (input.hook_event_name === "SessionStart") {
  const result = journal.bootstrap({ sessionId, taskId: sessionId, source: input.source });
  const pending = result.pending.map(({ sessionId: id, conclusionStatus }) => `${id}:${conclusionStatus}`).join(", ");
  const additionalContext = [
    "DevRelay ProjectMemory bootstrap verified exact repository-backed context.",
    `Baseline: ${result.record.baselineId} (${result.record.baselineDigest}).`,
    `Synopsis digest: ${result.record.synopsisDigest}.`,
    pending ? `Unapproved prior conclusions require recovery before lifecycle progression: ${pending}.` : "No prior memory conclusion is pending.",
    "Treat the synopsis below as orientation only; explicit ModuleInvocation inputs and Gates remain authoritative.",
    result.context.synopsis,
  ].join("\n\n");
  process.stdout.write(JSON.stringify({
    continue: true,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
  }));
} else if (input.hook_event_name === "Stop" || input.hook_event_name === "Interrupt") {
  const result = journal.checkpoint({ sessionId, event: input.hook_event_name, transcriptPath: input.transcript_path, turnId: input.turn_id });
  process.stdout.write(JSON.stringify({ systemMessage: result.outcome === "checkpointed" ? "DevRelay preserved a durable ProjectMemory checkpoint." : undefined }));
} else if (input.hook_event_name === "SessionEnd") {
  journal.conclude({ sessionId, reason: input.reason, transcriptPath: input.transcript_path });
}
