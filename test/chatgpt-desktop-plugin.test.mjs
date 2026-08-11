import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const pluginRoot = path.join(root, "plugins", "devrelay");
const readJson = async (...parts) =>
  JSON.parse(await readFile(path.join(...parts), "utf8"));

test("repository marketplace exposes one installable DevRelay plugin", async () => {
  const marketplace = await readJson(root, ".agents", "plugins", "marketplace.json");
  assert.equal(marketplace.name, "personal");
  assert.deepEqual(marketplace.plugins, [
    {
      name: "devrelay",
      source: { source: "local", path: "./plugins/devrelay" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Productivity",
    },
  ]);
});

test("plugin manifest discovers one operator skill and one local MCP server", async () => {
  const manifest = await readJson(pluginRoot, ".codex-plugin", "plugin.json");
  assert.equal(manifest.name, "devrelay");
  assert.equal(manifest.version, "0.9.0");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.deepEqual(manifest.interface.capabilities, ["Interactive", "Local", "MCP"]);

  const skillsDirectory = path.join(pluginRoot, "skills", "devrelay");
  await access(path.join(skillsDirectory, "SKILL.md"));

  const mcp = await readJson(pluginRoot, ".mcp.json");
  assert.deepEqual(Object.keys(mcp.mcpServers), ["devrelay"]);
  assert.deepEqual(mcp.mcpServers.devrelay, {
    type: "stdio",
    command: "node",
    args: ["../../src/chatgpt-desktop-mcp-server.mjs"],
    cwd: ".",
    startup_timeout_sec: 30,
    tool_timeout_sec: 120,
  });
});

test("operator skill preserves Core authority and contains no scaffold placeholders", async () => {
  const skill = await readFile(
    path.join(pluginRoot, "skills", "devrelay", "SKILL.md"),
    "utf8",
  );
  assert.match(skill, /DevRelay Core owns route selection/);
  assert.match(skill, /Never select a Module route/);
  assert.match(skill, /Never mutate TraceabilityGraph directly/);
  assert.doesNotMatch(skill, /\[TODO:/);
});
