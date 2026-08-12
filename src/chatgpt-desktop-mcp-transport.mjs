import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import {
  CHATGPT_DESKTOP_RUN_ROOT_ENV,
  createChatGptDesktopCoreCommandAdapter,
} from "./chatgpt-desktop-core-command-adapter.mjs";
import { createChatGptDesktopMcpServer } from "./chatgpt-desktop-mcp-server.mjs";

export function runChatGptDesktopMcpStdio({ execute, input = process.stdin, output = process.stdout } = {}) {
  const server = createChatGptDesktopMcpServer({ execute });
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false });
  let sequence = Promise.resolve();
  lines.on("line", (line) => {
    if (!line.trim()) return;
    sequence = sequence.then(async () => {
      let response;
      try {
        response = await server.handle(JSON.parse(line));
      } catch {
        response = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };
      }
      if (response) output.write(`${JSON.stringify(response)}\n`);
    });
  });
  return Object.freeze({ close: () => lines.close(), completed: () => sequence });
}

async function main() {
  const modulePath = process.env.DEVRELAY_DESKTOP_CORE_MODULE;
  const core = modulePath
    ? await import(pathToFileURL(modulePath).href)
    : createChatGptDesktopCoreCommandAdapter({ runRoot: process.env[CHATGPT_DESKTOP_RUN_ROOT_ENV] });
  if (typeof core.executeDesktopCommand !== "function") throw new Error("configured Core module must export executeDesktopCommand");
  runChatGptDesktopMcpStdio({ execute: core.executeDesktopCommand });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`DEVRELAY_MCP_STARTUP_ERROR: ${error.message}\n`); process.exitCode = 1; });
}
