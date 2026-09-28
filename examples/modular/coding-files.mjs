import { lstatSync, readFileSync, realpathSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join, resolve, relative, isAbsolute, parse } from "node:path";
import { randomUUID } from "node:crypto";
import { sha256Digest } from "../../src/content-digest.mjs";

const forbiddenNames = new Set(["agents.md", "claude.md", "gemini.md", "skill.md"]);
export function validateRelativePath(path) {
  if (typeof path !== "string" || path.length > 240 || !path.length) throw new Error("Invalid workspace path");
  const parts = path.split("/");
  if (parts.some(part => !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) || /[. ]$/.test(part)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[.]|$)/i.test(part)
    || forbiddenNames.has(part.toLowerCase()))) throw new Error("Unsafe or protected workspace path: " + path);
  return path;
}
export function ensurePlainDirectory(path) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of relative(current, absolute).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("State path contains a link or non-directory");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      mkdirSync(current);
    }
  }
  return absolute;
}
export function createCodingFiles(workspace) {
  const root = realpathSync(workspace);
  if (!lstatSync(root).isDirectory()) throw new Error("Workspace must be a directory");
  function target(path) {
    validateRelativePath(path);
    const absolute = resolve(root, path);
    const rel = relative(root, absolute);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Path escapes workspace");
    let current = root;
    const parts = path.split("/");
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]);
      try {
        const stat = lstatSync(current);
        if (stat.isSymbolicLink()) throw new Error("Symlink or junction in workspace path: " + path);
        if (index < parts.length - 1 && !stat.isDirectory()) throw new Error("Non-directory path parent: " + path);
        if (index === parts.length - 1 && (!stat.isFile() || stat.nlink > 1)) throw new Error("Path is not a plain single-link file: " + path);
      } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    return absolute;
  }
  function read(path) {
    const absolute = target(path);
    let bytes;
    try {
      const stat = lstatSync(absolute);
      if (stat.size > 1048576) throw new Error("File exceeds the 1 MiB example limit: " + path);
      bytes = readFileSync(absolute);
    } catch (error) {
      if (error.code === "ENOENT") return { path, content: null, digest: null };
      throw error;
    }
    return { path, content: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), digest: sha256Digest(bytes) };
  }
  function assertCurrent(files) {
    for (const file of files) if (read(file.path).digest !== file.digest) throw new Error("Stale file preimage: " + file.path);
  }
  function write(path, text) {
    const absolute = target(path);
    mkdirSync(dirname(absolute), { recursive: true });
    target(path);
    const temporary = join(dirname(absolute), ".devrelay-write-" + randomUUID());
    try {
      writeFileSync(temporary, text, { encoding: "utf8", flag: "wx" });
      renameSync(temporary, absolute);
    } finally {
      try { unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
  return { root, read, assertCurrent, write };
}
export function renderCodingDiff(changes) {
  return changes.map(change => {
    const lines = text => text === null || text === "" ? [] : text.replace(/\n$/, "").split("\n");
    const before = lines(change.before), after = lines(change.after);
    const body = [];
    for (const [text, prefix] of [[change.before, "-"], [change.after, "+"]]) {
      for (const line of lines(text)) body.push(prefix + line);
      if (text !== null && text.length && !text.endsWith("\n")) body.push("\\ No newline at end of file");
    }
    return "--- " + (change.before === null ? "/dev/null" : "a/" + change.path) + "\n+++ b/" + change.path
      + "\n@@ -" + (before.length ? "1," + before.length : "0,0")
      + " +1," + after.length + " @@\n" + body.join("\n") + "\n";
  }).join("\n");
}
