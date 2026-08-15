import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
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
    id: "architecture-discovery",
    version: "0.1.0",
    definition: "examples/modules/architecture-discovery.module.json",
    operations: [{ id: "discover", steps: [] }],
    plugins: ["native-architecture-discovery"],
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
    id: "contract-generation",
    version: "0.1.0",
    definition: "examples/modules/contract-generation.module.json",
    operations: [
      { id: "establish-contracts", steps: [] },
      { id: "generate-contract-change", steps: [] },
    ],
    plugins: [
      "asyncapi-contract-generator",
      "json-schema-contract-generator",
      "openapi-contract-generator",
      "protobuf-contract-generator",
    ],
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
  {
    id: "specialist-assignment",
    version: "2.0.0",
    definition: "examples/modules/specialist-assignment.module.json",
    operations: [{ id: "assign-specialists", steps: [] }],
    plugins: ["a2a-profile-source", "native-specialist-ranker"],
  },
  {
    id: "work-execution",
    version: "0.1.0",
    definition: "examples/modules/work-execution.module.json",
    operations: [{ id: "execute-work-item", steps: [] }],
    plugins: [],
  },
  {
    id: "work-item-verification",
    version: "0.1.0",
    definition: "examples/modules/work-item-verification.module.json",
    operations: [{ id: "verify-work-item", steps: [] }],
    plugins: ["review-verifier", "test-verifier"],
  },
  {
    id: "change-integration",
    version: "0.1.0",
    definition: "examples/modules/change-integration.module.json",
    operations: [{ id: "integrate-change", steps: [] }],
    plugins: ["local-git-integration"],
  },
  {
    id: "system-verification",
    version: "0.1.0",
    definition: "examples/modules/system-verification.module.json",
    operations: [{ id: "verify-system", steps: [] }],
    plugins: ["review-system-verifier", "test-system-verifier"],
  },
  {
    id: "roadmap-management",
    version: "0.1.0",
    definition: "examples/modules/roadmap-management.module.json",
    operations: [
      { id: "reprioritize", steps: [] },
      { id: "review-roadmap", steps: [] },
      { id: "triage-candidate", steps: [] },
    ],
    plugins: ["native-structured-roadmap-proposer"],
  },
]);

export const compatibilityModules = Object.freeze([
  { id: "specialist-assignment", version: "1.0.0", definition: "examples/modules/specialist-assignment-v1.module.json" },
]);
export const compatibilityPlugins = Object.freeze([
  { id: "a2a-profile-source", version: "1.0.0", manifest: "examples/plugins/a2a-profile-source-v1.plugin.json", module: { id: "specialist-assignment", version: "1.0.0" } },
  { id: "native-specialist-ranker", version: "1.0.0", manifest: "examples/plugins/native-specialist-ranker-v1.plugin.json", module: { id: "specialist-assignment", version: "1.0.0" } },
]);

export const canonicalPlugins = Object.freeze([
  {
    id: "native-structured-roadmap-proposer",
    version: "0.1.0",
    manifest: "examples/plugins/native-structured-roadmap-proposer.plugin.json",
    module: { id: "roadmap-management", version: "0.1.0" },
    bindings: [
      { operation: "reprioritize", step: null, role: "proposer" },
      { operation: "review-roadmap", step: null, role: "proposer" },
      { operation: "triage-candidate", step: null, role: "proposer" },
    ],
  },
  {
    id: "native-architecture-discovery",
    version: "0.1.0",
    manifest: "examples/plugins/native-architecture-discovery.plugin.json",
    module: { id: "architecture-discovery", version: "0.1.0" },
    bindings: [{ operation: "discover", step: null, role: "proposer" }],
  },
  {
    id: "asyncapi-contract-generator",
    version: "0.1.0",
    manifest: "examples/plugins/asyncapi-contract-generator.plugin.json",
    module: { id: "contract-generation", version: "0.1.0" },
    bindings: [
      { operation: "establish-contracts", step: null, role: "proposer" },
      { operation: "generate-contract-change", step: null, role: "proposer" },
    ],
  },
  {
    id: "github-spec-kit",
    version: "0.1.0",
    manifest: "examples/plugins/github-spec-kit.plugin.json",
    module: { id: "requirements-gathering", version: "0.1.0" },
    bindings: [{ operation: "gather", step: null }],
  },
  {
    id: "json-schema-contract-generator",
    version: "0.1.0",
    manifest: "examples/plugins/json-schema-contract-generator.plugin.json",
    module: { id: "contract-generation", version: "0.1.0" },
    bindings: [
      { operation: "establish-contracts", step: null, role: "proposer" },
      { operation: "generate-contract-change", step: null, role: "proposer" },
    ],
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
    id: "openapi-contract-generator",
    version: "0.1.0",
    manifest: "examples/plugins/openapi-contract-generator.plugin.json",
    module: { id: "contract-generation", version: "0.1.0" },
    bindings: [
      { operation: "establish-contracts", step: null, role: "proposer" },
      { operation: "generate-contract-change", step: null, role: "proposer" },
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
    id: "protobuf-contract-generator",
    version: "0.1.0",
    manifest: "examples/plugins/protobuf-contract-generator.plugin.json",
    module: { id: "contract-generation", version: "0.1.0" },
    bindings: [
      { operation: "establish-contracts", step: null, role: "proposer" },
      { operation: "generate-contract-change", step: null, role: "proposer" },
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
  {
    id: "a2a-profile-source",
    version: "2.0.0",
    manifest: "examples/plugins/a2a-profile-source.plugin.json",
    module: { id: "specialist-assignment", version: "2.0.0" },
    bindings: [{ operation: "assign-specialists", step: null, role: "proposer" }],
  },
  {
    id: "native-specialist-ranker",
    version: "2.0.0",
    manifest: "examples/plugins/native-specialist-ranker.plugin.json",
    module: { id: "specialist-assignment", version: "2.0.0" },
    bindings: [{ operation: "assign-specialists", step: null, role: "proposer" }],
  },
  {
    id: "review-verifier",
    version: "1.0.0",
    manifest: "examples/plugins/review-verifier.plugin.json",
    module: { id: "work-item-verification", version: "0.1.0" },
    bindings: [{ operation: "verify-work-item", step: null, role: "proposer" }],
  },
  {
    id: "test-verifier",
    version: "1.0.0",
    manifest: "examples/plugins/test-verifier.plugin.json",
    module: { id: "work-item-verification", version: "0.1.0" },
    bindings: [{ operation: "verify-work-item", step: null, role: "proposer" }],
  },
  {
    id: "local-git-integration",
    version: "0.1.0",
    manifest: "examples/plugins/local-git-integration.plugin.json",
    module: { id: "change-integration", version: "0.1.0" },
    bindings: [{ operation: "integrate-change", step: null }],
  },
  {
    id: "review-system-verifier",
    version: "1.0.0",
    manifest: "examples/plugins/review-system-verifier.plugin.json",
    module: { id: "system-verification", version: "0.1.0" },
    bindings: [{ operation: "verify-system", step: null, role: "proposer" }],
  },
  {
    id: "test-system-verifier",
    version: "1.0.0",
    manifest: "examples/plugins/test-system-verifier.plugin.json",
    module: { id: "system-verification", version: "0.1.0" },
    bindings: [{ operation: "verify-system", step: null, role: "proposer" }],
  },
]);

const excludedDirectorySet = new Set(excludedReleaseDirectories);
export const portablePath = (path) => path.split(sep).join("/");
export function comparePortablePaths(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function releaseRepositoryFiles() {
  const result = spawnSync("git", ["ls-files", "-z", "--cached"], {
    cwd: repositoryRoot,
    encoding: "buffer",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      "git ls-files failed with status " +
        result.status +
        "\n" +
        [result.stdout, result.stderr]
          .filter(Boolean)
          .map((value) => value.toString("utf8"))
          .join("\n"),
    );
  }
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(portablePath)
    .filter((path) => path !== releaseManifestRelativePath)
    .filter((path) => !excludedDirectorySet.has(path.split("/")[0]))
    .sort(comparePortablePaths);
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
    relativePath === ".."
  ) {
    throw new Error(path + " is not a regular release-repository file");
  }
  let descriptor;
  try {
    descriptor = openSync(absolute, "r");
    if (!fstatSync(descriptor).isFile()) {
      throw new Error(path + " is not a regular release-repository file");
    }
    return (
      "sha256:" +
      createHash("sha256").update(readFileSync(descriptor)).digest("hex")
    );
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error(path + " is not a regular release-repository file");
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
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
