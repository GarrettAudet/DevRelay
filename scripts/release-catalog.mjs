import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const sourceReleaseVersion = JSON.parse(
  readFileSync(join(repositoryRoot, "package.json"), "utf8"),
).version;
export const releaseManifestRelativePath =
  `release/${sourceReleaseVersion}.json`;
export const releaseManifestPath = join(
  repositoryRoot,
  ...releaseManifestRelativePath.split("/"),
);
export const excludedReleaseDirectories = Object.freeze([
  ".devrelay",
  ".git",
  "coverage",
  "dist",
  "node_modules",
]);

export const canonicalModules = Object.freeze([
  {
    id: "requirements-gathering",
    version: "0.1.0",
    definition: "examples/modules/requirements-gathering.module.json",
    operations: [{ id: "gather", steps: [] }],
    plugins: ["github-spec-kit", "openspec"],
  },
  {
    id: "architecture-design",
    version: "0.1.0",
    definition: "examples/modules/architecture-design.module.json",
    operations: [
      {
        id: "design-change",
        steps: ["designer", "modeler", "decision-recorder"],
      },
      {
        id: "establish-baseline",
        steps: ["designer", "modeler", "decision-recorder"],
      },
    ],
    plugins: ["madr", "openspec-design", "spec-kit-plan", "structurizr"],
  },
  {
    id: "work-breakdown",
    version: "0.1.0",
    definition: "examples/modules/work-breakdown.module.json",
    operations: [
      { id: "decompose-change", steps: [] },
      { id: "establish-breakdown", steps: [] },
    ],
    plugins: ["openspec-tasks", "spec-kit-tasks"],
  },
  {
    id: "work-dependency-analysis",
    version: "0.1.0",
    definition: "examples/modules/work-dependency-analysis.module.json",
    operations: [{ id: "analyze-dependencies", steps: [] }],
    plugins: [
      "native-structured-dependency-proposer",
      "openspec-dependency-proposer",
      "spec-kit-dependency-reviewer",
      "task-master-dependency-proposer",
    ],
  },
]);

export const canonicalPlugins = Object.freeze([
  {
    id: "github-spec-kit",
    version: "0.1.0",
    manifest: "examples/plugins/github-spec-kit.plugin.json",
    module: { id: "requirements-gathering", version: "0.1.0" },
    bindings: [{ operation: "gather", step: null }],
  },
  {
    id: "madr",
    version: "0.1.0",
    manifest: "examples/plugins/madr.plugin.json",
    module: { id: "architecture-design", version: "0.1.0" },
    bindings: [
      { operation: "design-change", step: "decision-recorder" },
      { operation: "establish-baseline", step: "decision-recorder" },
    ],
  },
  {
    id: "openspec",
    version: "0.1.0",
    manifest: "examples/plugins/openspec.plugin.json",
    module: { id: "requirements-gathering", version: "0.1.0" },
    bindings: [{ operation: "gather", step: null }],
  },
  {
    id: "openspec-design",
    version: "0.1.0",
    manifest: "examples/plugins/openspec-design.plugin.json",
    module: { id: "architecture-design", version: "0.1.0" },
    bindings: [{ operation: "design-change", step: "designer" }],
  },
  {
    id: "openspec-tasks",
    version: "0.1.0",
    manifest: "examples/plugins/openspec-tasks.plugin.json",
    module: { id: "work-breakdown", version: "0.1.0" },
    bindings: [
      { operation: "decompose-change", step: null },
      { operation: "establish-breakdown", step: null },
    ],
  },
  {
    id: "spec-kit-plan",
    version: "0.1.0",
    manifest: "examples/plugins/spec-kit-plan.plugin.json",
    module: { id: "architecture-design", version: "0.1.0" },
    bindings: [{ operation: "establish-baseline", step: "designer" }],
  },
  {
    id: "spec-kit-tasks",
    version: "0.1.0",
    manifest: "examples/plugins/spec-kit-tasks.plugin.json",
    module: { id: "work-breakdown", version: "0.1.0" },
    bindings: [
      { operation: "decompose-change", step: null },
      { operation: "establish-breakdown", step: null },
    ],
  },
  {
    id: "structurizr",
    version: "0.1.0",
    manifest: "examples/plugins/structurizr.plugin.json",
    module: { id: "architecture-design", version: "0.1.0" },
    bindings: [
      { operation: "design-change", step: "modeler" },
      { operation: "establish-baseline", step: "modeler" },
    ],
  },
  {
    id: "native-structured-dependency-proposer",
    version: "0.1.0",
    manifest: "examples/plugins/native-structured-dependency-proposer.plugin.json",
    module: { id: "work-dependency-analysis", version: "0.1.0" },
    bindings: [
      { operation: "analyze-dependencies", step: null, role: "proposer" },
    ],
  },
  {
    id: "openspec-dependency-proposer",
    version: "0.1.0",
    manifest: "examples/plugins/openspec-dependency-proposer.plugin.json",
    module: { id: "work-dependency-analysis", version: "0.1.0" },
    bindings: [
      { operation: "analyze-dependencies", step: null, role: "proposer" },
    ],
  },
  {
    id: "spec-kit-dependency-reviewer",
    version: "0.1.0",
    manifest: "examples/plugins/spec-kit-dependency-reviewer.plugin.json",
    module: { id: "work-dependency-analysis", version: "0.1.0" },
    bindings: [
      { operation: "analyze-dependencies", step: null, role: "reviewer" },
    ],
  },
  {
    id: "task-master-dependency-proposer",
    version: "0.1.0",
    manifest: "examples/plugins/task-master-dependency-proposer.plugin.json",
    module: { id: "work-dependency-analysis", version: "0.1.0" },
    bindings: [
      { operation: "analyze-dependencies", step: null, role: "proposer" },
    ],
  },
]);

export const canonicalPackageExports = Object.freeze({
  ".": "./src/index.mjs",
  "./contracts/*": "./contracts/*",
  "./modules/requirements-gathering.module.json":
    "./examples/modules/requirements-gathering.module.json",
  "./modules/architecture-design.module.json":
    "./examples/modules/architecture-design.module.json",
  "./modules/work-breakdown.module.json":
    "./examples/modules/work-breakdown.module.json",
  "./modules/work-dependency-analysis.module.json":
    "./examples/modules/work-dependency-analysis.module.json",
  "./plugins/github-spec-kit.plugin.json":
    "./examples/plugins/github-spec-kit.plugin.json",
  "./plugins/openspec.plugin.json":
    "./examples/plugins/openspec.plugin.json",
  "./plugins/spec-kit-plan.plugin.json":
    "./examples/plugins/spec-kit-plan.plugin.json",
  "./plugins/openspec-design.plugin.json":
    "./examples/plugins/openspec-design.plugin.json",
  "./plugins/structurizr.plugin.json":
    "./examples/plugins/structurizr.plugin.json",
  "./plugins/openspec-tasks.plugin.json":
    "./examples/plugins/openspec-tasks.plugin.json",
  "./plugins/spec-kit-tasks.plugin.json":
    "./examples/plugins/spec-kit-tasks.plugin.json",
  "./plugins/native-structured-dependency-proposer.plugin.json":
    "./examples/plugins/native-structured-dependency-proposer.plugin.json",
  "./plugins/openspec-dependency-proposer.plugin.json":
    "./examples/plugins/openspec-dependency-proposer.plugin.json",
  "./plugins/spec-kit-dependency-reviewer.plugin.json":
    "./examples/plugins/spec-kit-dependency-reviewer.plugin.json",
  "./plugins/task-master-dependency-proposer.plugin.json":
    "./examples/plugins/task-master-dependency-proposer.plugin.json",
  "./plugins/madr.plugin.json": "./examples/plugins/madr.plugin.json",
  "./examples/artifacts/*": "./examples/artifacts/*",
  "./examples/invocations/*": "./examples/invocations/*",
  "./examples/native/*": "./examples/native/*",
  "./examples/results/*": "./examples/results/*",
  "./examples/README.md": "./examples/README.md",
  "./openspec/*": "./openspec/*",
  "./policies/work-dependency-analysis/*": "./policies/work-dependency-analysis/*",
  "./release/*": "./release/*",
  "./package.json": "./package.json",
});

const excludedDirectorySet = new Set(excludedReleaseDirectories);
export const portablePath = (path) => path.split(sep).join("/");
export function comparePortablePaths(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function releaseRepositoryFiles(directory = repositoryRoot) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectorySet.has(entry.name)) {
      continue;
    }
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...releaseRepositoryFiles(absolute));
    } else if (entry.isFile()) {
      const path = portablePath(relative(repositoryRoot, absolute));
      if (path !== releaseManifestRelativePath) {
        files.push(path);
      }
    }
  }
  return files.sort(comparePortablePaths);
}

export function roleFor(path) {
  if (path === ".gitattributes" || path === ".gitignore") {
    return "repository-policy";
  }
  if (path === "AGENTS.md") {
    return "agent-guidance";
  }
  if (path === "package.json") {
    return "package-metadata";
  }
  if (path === "package-lock.json") {
    return "dependency-lock";
  }
  if (path === "LICENSE") {
    return "license";
  }
  if (
    path === "README.md" ||
    path === "CHANGELOG.md" ||
    path === "RELEASE.md" ||
    path === "SECURITY.md" ||
    path === "CONTRIBUTING.md"
  ) {
    return "release-documentation";
  }
  if (path.startsWith(".github/workflows/")) {
    return "continuous-integration";
  }
  if (path.startsWith("contracts/")) {
    return "contract-schema";
  }
  if (path.startsWith("docs/")) {
    return "contract-documentation";
  }
  if (path.startsWith("dogfood/")) {
    return "dogfood-evidence";
  }
  if (path === "examples/README.md") {
    return "example-documentation";
  }
  if (path.startsWith("examples/artifacts/")) {
    return "artifact-fixture";
  }
  if (path.startsWith("examples/invocations/")) {
    return "invocation-fixture";
  }
  if (path.startsWith("examples/modules/")) {
    return "module-definition";
  }
  if (path.startsWith("examples/native/")) {
    return "native-source-fixture";
  }
  if (path.startsWith("examples/plugins/")) {
    return "plugin-manifest";
  }
  if (path.startsWith("examples/results/")) {
    return "result-fixture";
  }
  if (path.startsWith("openspec/")) {
    return "bounded-adapter-schema";
  }
  if (path.startsWith("policies/")) {
    return "policy-artifact";
  }
  if (path.startsWith("release/")) {
    return "release-artifact";
  }
  if (path.startsWith("scripts/")) {
    return "release-tooling";
  }
  if (path.startsWith("src/")) {
    return "runtime";
  }
  if (path.startsWith("test/")) {
    return "verification";
  }
  return "repository-support";
}

export function rawDigest(path) {
  const absolute = resolve(repositoryRoot, ...path.split("/"));
  const relativePath = portablePath(relative(repositoryRoot, absolute));
  if (
    relativePath !== path ||
    relativePath.startsWith("../") ||
    relativePath === ".." ||
    !statSync(absolute).isFile()
  ) {
    throw new Error(path + " is not a regular release-repository file");
  }
  return (
    "sha256:" +
    createHash("sha256").update(readFileSync(absolute)).digest("hex")
  );
}

function npmInvocation(args) {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...args],
    };
  }
  if (process.platform !== "win32") {
    return { command: "npm", args };
  }
  const npmCli = join(
    dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  if (!existsSync(npmCli)) {
    throw new Error("cannot locate npm; run this command through npm");
  }
  return { command: process.execPath, args: [npmCli, ...args] };
}

export function npmPackReport(extraArguments = []) {
  const invocation = npmInvocation([
    "pack",
    "--dry-run",
    "--json",
    ...extraArguments,
  ]);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      "npm pack --dry-run failed with status " +
        result.status +
        "\n" +
        [result.stdout, result.stderr].filter(Boolean).join("\n"),
    );
  }
  const report = JSON.parse(result.stdout);
  if (!Array.isArray(report) || report.length !== 1) {
    throw new Error("npm pack --dry-run returned an unexpected report");
  }
  return report[0];
}

export function npmPackPaths() {
  return (npmPackReport().files ?? [])
    .map(({ path }) => portablePath(path))
    .sort(comparePortablePaths);
}

export function expectedPackagedPaths(manifest) {
  return [
    ...manifest.files
      .filter(({ packaged }) => packaged)
      .map(({ path }) => path),
    releaseManifestRelativePath,
  ].sort(comparePortablePaths);
}

export function parseReleaseManifest() {
  if (!existsSync(releaseManifestPath)) {
    throw new Error(
      "release manifest is required at " + releaseManifestRelativePath,
    );
  }
  return JSON.parse(readFileSync(releaseManifestPath, "utf8"));
}
