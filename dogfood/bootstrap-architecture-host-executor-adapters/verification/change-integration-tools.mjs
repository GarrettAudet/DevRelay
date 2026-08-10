import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const evidencePrefix = "dogfood/bootstrap-architecture-host-executor-adapters/verification/";
const output = process.argv[2];
if (!output) throw new Error("output path is required");

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const raw = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root });
const fields = raw.toString("utf8").split("\0").filter(Boolean);
const entries = [];
for (let i = 0; i < fields.length; i += 1) {
  const field = fields[i];
  const status = field.slice(0, 2);
  let path = field.slice(3).replaceAll("\\", "/");
  let originalPath = null;
  if (status.includes("R") || status.includes("C")) {
    originalPath = path;
    path = fields[++i].replaceAll("\\", "/");
  }
  if (path.startsWith(evidencePrefix)) continue;
  const absolute = resolve(root, path);
  let byteLength = null;
  let rawDigest = null;
  try {
    const bytes = readFileSync(absolute);
    byteLength = statSync(absolute).size;
    rawDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  entries.push({ status, path, ...(originalPath ? { originalPath } : {}), byteLength, rawDigest });
}
entries.sort((a, b) => a.path.localeCompare(b.path));
const upstream = (() => { try { return git("rev-parse", "--abbrev-ref", "@{upstream}"); } catch { return null; } })();
const divergence = upstream ? git("rev-list", "--left-right", "--count", `HEAD...${upstream}`).split(/\s+/).map(Number) : null;
const snapshot = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ChangeIntegrationDirtySnapshot",
  root: root.replaceAll("\\", "/"),
  branch: git("branch", "--show-current"),
  head: git("rev-parse", "HEAD"),
  tree: git("rev-parse", "HEAD^{tree}"),
  remotes: git("remote", "-v").split(/\r?\n/).filter(Boolean),
  upstream,
  divergence: divergence ? { behind: divergence[0], ahead: divergence[1] } : null,
  excludedIntegrationEvidencePrefix: evidencePrefix,
  entryCount: entries.length,
  entries,
};
mkdirSync(dirname(resolve(root, output)), { recursive: true });
writeFileSync(resolve(root, output), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(JSON.stringify({ output, entryCount: entries.length }));
