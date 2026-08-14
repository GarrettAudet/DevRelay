import { canonicalJsonDigest } from "./content-digest.mjs";

export class GdscriptDiscoveryError extends Error {
  constructor(message, code = "DR4830") {
    super(`GDScript discovery: ${message}`);
    this.name = "GdscriptDiscoveryError";
    this.code = code;
  }
}

const fail = (message) => { throw new GdscriptDiscoveryError(message); };
const immutable = (value) => Object.freeze(structuredClone(value));
const compare = (a, b) => String(a).localeCompare(String(b), "en");

function locator(path, line, text) {
  return { path, line, column: Math.max(1, text.search(/\S/u) + 1), lineDigest: canonicalJsonDigest(text) };
}

function finding(kind, path, line, text, attributes) {
  const material = { kind, attributes, source: locator(path, line, text) };
  return { id: `GDF-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`, confidence: "high", ...material };
}

export function analyzeGodotRepository({ files, ignorePaths = [] }) {
  if (!Array.isArray(files)) fail("files must be an array");
  const ignored = new Set(ignorePaths.map((path) => path.replaceAll("\\", "/")));
  const seen = new Set();
  const findings = [];
  const gaps = [];
  for (const file of [...files].sort((a, b) => compare(a.path, b.path))) {
    const path = file?.path?.replaceAll("\\", "/");
    if (typeof path !== "string" || typeof file.content !== "string") fail("every file requires path and text content");
    if (seen.has(path)) fail(`duplicate file ${path}`);
    seen.add(path);
    if (file.tracked === false || file.ignored === true || ignored.has(path)) continue;
    const lines = file.content.replaceAll("\r\n", "\n").split("\n");
    let balance = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index];
      const line = index + 1;
      balance += (text.match(/\(/gu) ?? []).length - (text.match(/\)/gu) ?? []).length;
      const rules = [
        ["class", /^\s*class_name\s+([A-Za-z_][A-Za-z0-9_]*)/u, (m) => ({ name: m[1] })],
        ["inheritance", /^\s*extends\s+([A-Za-z_][A-Za-z0-9_.]*|"[^"]+")/u, (m) => ({ base: m[1].replaceAll('"', "") })],
        ["signal", /^\s*signal\s+([A-Za-z_][A-Za-z0-9_]*)/u, (m) => ({ name: m[1] })],
        ["entry-point", /^\s*func\s+(_ready|_process|_physics_process|_input|_unhandled_input)\s*\(/u, (m) => ({ name: m[1] })],
        ["dependency", /\b(?:preload|load)\(\s*"([^"]+)"\s*\)/u, (m) => ({ target: m[1] })],
        ["resource", /@export(?:_[a-z_]+)?\s+var\s+([A-Za-z_][A-Za-z0-9_]*)/u, (m) => ({ name: m[1] })],
      ];
      for (const [kind, pattern, attributes] of rules) {
        const match = text.match(pattern);
        if (match) findings.push(finding(kind, path, line, text, attributes(match)));
      }
      if (path.endsWith(".tscn")) {
        const node = text.match(/^\s*\[node\s+name="([^"]+)"(?:\s+type="([^"]+)")?/u);
        if (node) findings.push(finding("scene-node", path, line, text, { name: node[1], type: node[2] ?? null }));
        const script = text.match(/script\s*=\s*ExtResource\("([^"]+)"\)/u);
        if (script) findings.push(finding("scene-script", path, line, text, { resourceId: script[1] }));
      }
      if (path.endsWith("project.godot")) {
        const main = text.match(/^run\/main_scene\s*=\s*"([^"]+)"/u);
        if (main) findings.push(finding("main-scene", path, line, text, { target: main[1] }));
        const autoload = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"\*?([^"]+\.gd)"/u);
        if (autoload) findings.push(finding("autoload", path, line, text, { name: autoload[1], target: autoload[2] }));
      }
    }
    if (balance !== 0) {
      gaps.push({ code: "GDSCRIPT_PARTIAL_PARSE", path, blocking: false, confidence: "low", detail: "Unbalanced parentheses; regex findings were retained as observations." });
    }
  }
  findings.sort((a, b) => compare(a.source.path, b.source.path) || a.source.line - b.source.line || compare(a.kind, b.kind));
  gaps.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code));
  const material = { analyzer: { id: "devrelay.gdscript-discovery", version: "1.0.0" }, findings, gaps };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ArchitectureDiscoveryAnalyzerResult",
    ...material,
    resultDigest: canonicalJsonDigest(material),
  });
}
