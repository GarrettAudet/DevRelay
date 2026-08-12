import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalModules,
  canonicalPackageExports,
  comparePortablePaths,
  expectedPackagedPaths,
  parseReleaseManifest,
  releaseManifestPath,
  sourceReleaseVersion,
} from "./release-catalog.mjs";

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

const excludedDirectories = new Set([
  ".devrelay",
  ".git",
  "coverage",
  "dist",
  "node_modules",
]);
const textExtensions = new Set([
  ".json",
  ".md",
  ".mjs",
  ".txt",
  ".yaml",
  ".yml",
]);
const immutableRawArtifacts = new Map([
  [
    "dogfood/work-dependency-analysis/architecture-design/architecture-gate-owner-approval.json",
    "102439efcb9d8244151b583ac7c89710685a1cf9f2b81ab9c76bd27543ad939e",
  ],
  [
    "project/architecture-gate-owner-approval-work-dependency-analysis-v1.json",
    "102439efcb9d8244151b583ac7c89710685a1cf9f2b81ab9c76bd27543ad939e",
  ],
  [
    "dogfood/work-item-verification/execution/host-integration/WI-WIV-CONTRACTS.revision-004.receipt.json",
    "4e8fe70cb0da47ac335eda220449532b70f419291e0f064f364a9dda515c4da3",
  ],
  [
    "dogfood/work-item-verification/execution/host-integration/WI-WIV-EVIDENCE-NORMALIZATION.revision-002.receipt.json",
    "6b8b620e13bfe5cc919cd094a593c1a1fb29723313b903410a1a3902b10c684f",
  ],
  [
    "dogfood/work-item-verification/execution/host-integration/WI-WIV-VERIFIER-ADAPTERS.revision-003.receipt.json",
    "c90e2b70656aa4c0e52b3460cf7bf11cd6de96c713f8aa34fb8040017f5a3a0b",
  ],
  [
    "dogfood/work-item-verification/execution/task-contracts/WI-WIV-CONTRACTS.attempt-005.task.json",
    "6777959778d00829e81e1cfd90a8379ea01d03884e49440376991b3c8b0523fa",
  ],
  [
    "dogfood/work-item-verification/execution/task-contracts/WI-WIV-POLICY-GATE.attempt-001.task.json",
    "0f90bf51be7ad18a8cce81d0daba662b68fcbd67d2b18aee9fcb39f26348bc33",
  ],
]);
const extensionOf = (path) => {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
};
const portablePath = (path) => path.split(sep).join("/");

function repositoryFiles(directory = repositoryRoot) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...repositoryFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort((left, right) =>
    comparePortablePaths(
      portablePath(relative(repositoryRoot, left)),
      portablePath(relative(repositoryRoot, right)),
    ),
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
    throw new Error(
      "cannot locate npm; run this check through npm run release:check",
    );
  }
  return { command: process.execPath, args: [npmCli, ...args] };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = options.capture
      ? [result.stdout, result.stderr].filter(Boolean).join("\n")
      : "";
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status}${
        detail ? `\n${detail}` : ""
      }`,
    );
  }
  return result;
}

function checkJson(files) {
  const jsonFiles = files.filter((path) => extensionOf(path) === ".json");
  const failures = [];
  for (const path of jsonFiles) {
    try {
      JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      failures.push(
        `${portablePath(relative(repositoryRoot, path))}: ${error.message}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(`invalid JSON:\n${failures.join("\n")}`);
  }
  return jsonFiles.length;
}

function checkModuleSyntax(files) {
  const moduleFiles = files.filter((path) => extensionOf(path) === ".mjs");
  for (const path of moduleFiles) {
    run(process.execPath, ["--check", path], { capture: true });
  }
  return moduleFiles.length;
}

function checkLfPolicy(files) {
  const candidates = files.filter((path) => {
    const name = basename(path);
    return (
      textExtensions.has(extensionOf(path)) ||
      name === ".gitattributes" ||
      name === ".gitignore" ||
      name === "LICENSE"
    );
  });
  const failures = [];
  for (const path of candidates) {
    const bytes = readFileSync(path);
    if (bytes.includes(13)) {
      const relativePath = portablePath(relative(repositoryRoot, path));
      const expectedDigest = immutableRawArtifacts.get(relativePath);
      const actualDigest = createHash("sha256").update(bytes).digest("hex");
      if (expectedDigest !== actualDigest) failures.push(relativePath);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `files violate the LF-only policy:\n${failures.join("\n")}`,
    );
  }
  return candidates.length;
}

function checkDownstreamProjectOverviewPolicy() {
  const overviewSchema =
    "https://devrelay.dev/artifacts/project-overview-baseline/v1";
  let operationCount = 0;
  for (const released of canonicalModules) {
    if (released.id === "requirements-gathering") continue;
    const definition = JSON.parse(
      readFileSync(join(repositoryRoot, ...released.definition.split("/")), "utf8"),
    );
    for (const operation of definition.operations) {
      operationCount += 1;
      const input = operation.inputs.find(
        ({ name }) => name === "project-overview-baseline",
      );
      if (
        input?.required !== true ||
        input.cardinality !== "one" ||
        input.schema !== overviewSchema
      ) {
        throw new Error(
          `${released.id}#${operation.id} must explicitly require one ProjectOverviewBaseline input`,
        );
      }
    }
  }
  return operationCount;
}

export function runStaticChecks() {
  const files = repositoryFiles();
  const jsonCount = checkJson(files);
  const moduleCount = checkModuleSyntax(files);
  const textCount = checkLfPolicy(files);
  const contextOperationCount = checkDownstreamProjectOverviewPolicy();
  console.log(
    `Static verification passed: ${jsonCount} JSON files, ${moduleCount} JavaScript modules, ${textCount} LF-only text files, and ${contextOperationCount} downstream operations with explicit ProjectOverview context.`,
  );
}

export function runTests() {
  // Dogfood tests replay and promote exact shared project baselines. Running
  // test files concurrently lets independent lifecycle runs overwrite those
  // shared fixtures and makes verification depend on scheduler timing.
  run(process.execPath, ["scripts/run-tests.mjs", "--test-concurrency=1"]);
}

export function runVerification() {
  runStaticChecks();
  runTests();
}

export function runReleaseManifestCheck() {
  const checker = join(repositoryRoot, "scripts", "check-release-manifest.mjs");
  if (!existsSync(checker) || !existsSync(releaseManifestPath)) {
    throw new Error(
      `release:check requires both scripts/check-release-manifest.mjs and release/${sourceReleaseVersion}.json`,
    );
  }
  run(process.execPath, [checker]);
}

const requiredPackageFiles = [
  "contracts/module-execution-record.schema.json",
  "contracts/architecture-design-artifacts.schema.json",
  "contracts/business-acceptance-artifacts.schema.json",
  "contracts/contract-generation-artifacts.schema.json",
  "contracts/change-integration-artifacts.schema.json",
  "contracts/requirements-gathering-artifacts.schema.json",
  "contracts/specialist-assignment-artifacts.schema.json",
  "contracts/system-verification-artifacts.schema.json",
  "contracts/traceability-graph-artifacts.schema.json",
  "contracts/work-breakdown-artifacts.schema.json",
  "contracts/work-dependency-analysis-artifacts.schema.json",
  "contracts/work-execution-artifacts.schema.json",
  "contracts/work-item-verification-artifacts.schema.json",
  "docs/architecture-design.md",
  "docs/business-acceptance.md",
  "docs/change-integration.md",
  "docs/contract-generation.md",
  "docs/requirements-gathering.md",
  "docs/specialist-assignment.md",
  "docs/system-verification.md",
  "docs/traceability-graph.md",
  "docs/work-breakdown.md",
  "docs/work-dependency-analysis.md",
  "docs/work-item-verification.md",
  "examples/modules/architecture-design.module.json",
  "examples/modules/change-integration.module.json",
  "examples/modules/contract-generation.module.json",
  "examples/modules/requirements-gathering.module.json",
  "examples/modules/specialist-assignment.module.json",
  "examples/modules/system-verification.module.json",
  "examples/modules/work-breakdown.module.json",
  "examples/modules/work-dependency-analysis.module.json",
  "examples/modules/work-execution.module.json",
  "examples/modules/work-item-verification.module.json",
  "examples/plugins/a2a-profile-source.plugin.json",
  "examples/plugins/asyncapi-contract-generator.plugin.json",
  "examples/plugins/github-spec-kit.plugin.json",
  "examples/plugins/json-schema-contract-generator.plugin.json",
  "examples/plugins/openapi-contract-generator.plugin.json",
  "examples/plugins/protobuf-contract-generator.plugin.json",
  "examples/plugins/madr.plugin.json",
  "examples/plugins/local-git-integration.plugin.json",
  "examples/plugins/native-specialist-ranker.plugin.json",
  "examples/plugins/openspec-design.plugin.json",
  "examples/plugins/openspec.plugin.json",
  "examples/plugins/spec-kit-plan.plugin.json",
  "examples/plugins/structurizr.plugin.json",
  "examples/plugins/openspec-tasks.plugin.json",
  "examples/plugins/spec-kit-tasks.plugin.json",
  "examples/plugins/native-structured-dependency-proposer.plugin.json",
  "examples/plugins/openspec-dependency-proposer.plugin.json",
  "examples/plugins/spec-kit-dependency-reviewer.plugin.json",
  "examples/plugins/task-master-dependency-proposer.plugin.json",
  "examples/plugins/review-system-verifier.plugin.json",
  "examples/plugins/review-verifier.plugin.json",
  "examples/plugins/test-system-verifier.plugin.json",
  "examples/plugins/test-verifier.plugin.json",
  "policies/work-dependency-analysis/dependency.rego",
  "policies/work-dependency-analysis/policy.wasm",
  "openspec/schemas/devrelay-work-breakdown/schema.yaml",
  "openspec/schemas/devrelay-work-breakdown/templates/tasks.md",
  "src/architecture-traceability-contributor.mjs",
  "src/business-acceptance-artifact-validator.mjs",
  "src/business-acceptance-checkpoint.mjs",
  "src/business-acceptance-core.mjs",
  "src/business-acceptance-gate.mjs",
  "src/business-acceptance-traceability-contributor.mjs",
  "src/contract-canonical-diff.mjs",
  "src/contract-format-registry.mjs",
  "src/contract-gate.mjs",
  "src/contract-generation-artifact-validator.mjs",
  "src/contract-generation-runtime.mjs",
  "src/contract-traceability-contributor.mjs",
  "src/index.mjs",
  "src/module-execution-record-validator.mjs",
  "src/module-registry.mjs",
  "src/requirements-traceability-contributor.mjs",
  "src/traceability-artifact-validator.mjs",
  "src/traceability-checkpoint-store.mjs",
  "src/traceability-graph.mjs",
  "src/traceability-runtime-contracts.mjs",
  "src/work-breakdown-artifact-validator.mjs",
  "src/work-breakdown-gate.mjs",
  "src/work-breakdown-runtime-contracts.mjs",
  "src/work-breakdown-traceability-contributor.mjs",
  "src/work-dependency-artifact-validator.mjs",
  "src/work-dependency-gate.mjs",
  "src/work-dependency-graph.mjs",
  "src/work-dependency-native-proposer.mjs",
  "src/work-dependency-opa.mjs",
  "src/work-dependency-runtime.mjs",
  "src/work-dependency-snapshot.mjs",
  "src/work-dependency-traceability-contributor.mjs",
];

function assertPackageMetadata(packageDocument) {
  if (packageDocument.version !== sourceReleaseVersion) {
    throw new Error(
      `package version must be ${sourceReleaseVersion} for this source release`,
    );
  }
  if (packageDocument.private !== true) {
    throw new Error("source-only release must remain private");
  }
  if (packageDocument.license !== "UNLICENSED") {
    throw new Error("source-only release must remain UNLICENSED");
  }
  if (packageDocument.dependencies?.ajv !== "8.20.0") {
    throw new Error("Ajv must be pinned exactly to 8.20.0");
  }
  const workDependencyPins = {
    "@open-policy-agent/opa-wasm": "1.10.0",
    graphology: "0.26.0",
    "graphology-dag": "0.4.1",
  };
  for (const [name, version] of Object.entries(workDependencyPins)) {
    if (packageDocument.dependencies?.[name] !== version) {
      throw new Error(`${name} must be pinned exactly to ${version}`);
    }
  }
  if (packageDocument.overrides?.["fast-uri"] !== "3.1.5") {
    throw new Error(
      "fast-uri must remain pinned to the audited 3.1.5 override",
    );
  }
  if (packageDocument.main !== "./src/index.mjs") {
    throw new Error("package main must point to the intentional public API");
  }
  if (
    JSON.stringify(packageDocument.exports) !==
    JSON.stringify(canonicalPackageExports)
  ) {
    throw new Error(
      "package exports must expose only the canonical module/plugin surface and declared supporting paths",
    );
  }
}

function assertPackageContents(files, manifest) {
  const paths = files.map(({ path }) => path).sort(comparePortablePaths);
  const expected = expectedPackagedPaths(manifest);
  if (JSON.stringify(paths) !== JSON.stringify(expected)) {
    const actual = new Set(paths);
    const intended = new Set(expected);
    const missing = expected.filter((path) => !actual.has(path));
    const extras = paths.filter((path) => !intended.has(path));
    throw new Error(
      [
        "npm pack file set differs from release catalog",
        missing.length > 0 ? "missing:\n" + missing.join("\n") : "",
        extras.length > 0 ? "extras:\n" + extras.join("\n") : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  const forbidden = [
    "examples/modules/command.module.json",
    "examples/plugins/local-command.plugin.json",
  ].filter((path) => paths.includes(path));
  if (forbidden.length > 0) {
    throw new Error(
      "package contains development-only legacy module/plugin fixtures:\n" +
        forbidden.join("\n"),
    );
  }
  const missingRequired = requiredPackageFiles.filter(
    (path) => !paths.includes(path),
  );
  if (missingRequired.length > 0) {
    throw new Error(
      "package is missing required release files:\n" +
        missingRequired.join("\n"),
    );
  }
  return paths.length;
}

function installAndImport(tarball, packageDocument, temporaryRoot) {
  const packageName = packageDocument.name;
  const consumer = join(temporaryRoot, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify(
      {
        name: "devrelay-release-smoke",
        private: true,
        type: "module",
        dependencies: packageDocument.dependencies,
      },
      null,
      2,
    )}\n`,
  );
  // npm ci has already verified the exact lockfile dependency tree. Seed that
  // tree into the isolated consumer so the tarball install remains genuinely
  // offline without relying on incidental registry-cache entries.
  cpSync(join(repositoryRoot, "node_modules"), join(consumer, "node_modules"), {
    recursive: true,
    filter: (source) => basename(source) !== ".package-lock.json",
  });
  const install = npmInvocation([
    "install",
    "--offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
    tarball,
  ]);
  run(install.command, install.args, { cwd: consumer });
  const smokeProgram = [
    `const api = await import(${JSON.stringify(packageName)});`,
    `const desktopContracts = await import(${JSON.stringify(`${packageName}/desktop-runtime-contracts`)});`,
    'if (typeof desktopContracts.validateChatGptDesktopRuntimeArtifact !== "function") throw new Error("missing Desktop contracts validator export");',
    'if (typeof api.createModuleRegistry !== "function") throw new Error("missing createModuleRegistry export");',
    'if (typeof api.requirementsRuntimeArtifactContracts !== "function") throw new Error("missing RequirementsGathering contracts export");',
    'if (typeof api.architectureRuntimeArtifactContracts !== "function") throw new Error("missing ArchitectureDesign contracts export");',
    'if (typeof api.contractGenerationRuntimeArtifactContracts !== "function") throw new Error("missing ContractGeneration contracts export");',
    'if (typeof api.createContractGenerationRuntime !== "function") throw new Error("missing ContractGeneration runtime export");',
    'if (typeof api.createContractFormatRegistry !== "function") throw new Error("missing ContractGeneration format registry export");',
    'if (typeof api.promoteContractBaseline !== "function") throw new Error("missing ContractGate export");',
    'if (!Array.isArray(api.contractTraceabilityContributors)) throw new Error("missing ContractGeneration traceability contributors export");',
    'if (typeof api.workBreakdownRuntimeArtifactContracts !== "function") throw new Error("missing WorkBreakdown contracts export");',
    'if (typeof api.validateWorkBreakdownCandidateAgainstInputs !== "function") throw new Error("missing WorkBreakdown candidate validator export");',
    'if (typeof api.applyWorkBreakdownChangeSet !== "function") throw new Error("missing WorkBreakdown change application export");',
    'if (typeof api.validateWorkBreakdownGatePromotion !== "function") throw new Error("missing WorkBreakdown Gate export");',
    'if (typeof api.workDependencyRuntimeArtifactContracts !== "function") throw new Error("missing WorkDependencyAnalysis contracts export");',
    'if (typeof api.createWorkDependencyAnalysisRuntime !== "function") throw new Error("missing WorkDependencyAnalysis runtime export");',
    'if (typeof api.analyzeDependencyGraph !== "function") throw new Error("missing Graphology-DAG Core export");',
    'if (typeof api.promoteWorkDependencyBaseline !== "function") throw new Error("missing WorkDependency Gate export");',
    'if (typeof api.workDependencyBaselineTraceabilityContributor !== "object") throw new Error("missing WorkDependency traceability contributor export");',
    'if (typeof api.createTraceabilityGraphService !== "function") throw new Error("missing TraceabilityGraph service export");',
    'if (typeof api.createInMemoryTraceabilityStore !== "function") throw new Error("missing TraceabilityGraph store export");',
    'if (typeof api.createInMemoryTraceabilityCheckpointStore !== "function") throw new Error("missing traceability checkpoint store export");',
    'if (typeof api.validateModuleExecutionRecord !== "function") throw new Error("missing ModuleExecutionRecord validator export");',
    'if (typeof api.queryTraceabilityGraph !== "function") throw new Error("missing TraceabilityGraph query export");',
    'if (!Array.isArray(api.requirementsTraceabilityContributors)) throw new Error("missing Requirements traceability contributors export");',
    'if (!Array.isArray(api.architectureTraceabilityContributors)) throw new Error("missing Architecture traceability contributors export");',
    'if (!Array.isArray(api.workBreakdownTraceabilityContributors)) throw new Error("missing WorkBreakdown traceability contributors export");',
    'if (api.TRACEABILITY_VOCABULARY.version !== "1.5.0") throw new Error("unexpected traceability vocabulary");',
    'if (typeof api.executeBusinessAcceptance !== "function") throw new Error("missing BusinessAcceptance Core export");',
    'if (typeof api.executeBusinessAcceptanceGate !== "function") throw new Error("missing BusinessAcceptance Gate export");',
    'if (typeof api.businessAcceptanceTraceabilityContributor !== "object") throw new Error("missing BusinessAcceptance traceability contributor export");',
    'if (typeof api.validateSystemVerificationArtifact !== "function") throw new Error("missing SystemVerification artifact validator export");',
    'if (typeof api.executeSystemVerification !== "function") throw new Error("missing SystemVerification Core export");',
    'if (typeof api.createSystemVerificationCheckpointController !== "function") throw new Error("missing SystemVerification checkpoint export");',
    'if (typeof api.adaptSystemTestResult !== "function") throw new Error("missing test SystemVerification adapter export");',
    'if (typeof api.adaptSystemReviewResult !== "function") throw new Error("missing review SystemVerification adapter export");',
    'if (typeof api.systemVerificationTraceabilityContributor !== "object") throw new Error("missing SystemVerification traceability contributor export");',
    'const { createRequire } = await import("node:module");',
    "const require = createRequire(import.meta.url);",
    `require.resolve(${JSON.stringify(
      `${packageName}/modules/requirements-gathering.module.json`,
    )});`,
    `require.resolve(${JSON.stringify(
      `${packageName}/modules/architecture-design.module.json`,
    )});`,
    `require.resolve(${JSON.stringify(
      `${packageName}/modules/work-breakdown.module.json`,
    )});`,
    `require.resolve(${JSON.stringify(`${packageName}/modules/work-dependency-analysis.module.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/modules/contract-generation.module.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/modules/specialist-assignment.module.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/modules/work-execution.module.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/modules/work-item-verification.module.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/modules/change-integration.module.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/modules/system-verification.module.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/plugins/test-system-verifier.plugin.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/plugins/review-system-verifier.plugin.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/plugins/native-structured-dependency-proposer.plugin.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/plugins/openspec-dependency-proposer.plugin.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/plugins/spec-kit-dependency-reviewer.plugin.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/plugins/task-master-dependency-proposer.plugin.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/plugins/json-schema-contract-generator.plugin.json`)});`,
    `require.resolve(${JSON.stringify(`${packageName}/policies/work-dependency-analysis/policy.wasm`)});`,
  ].join("\n");
  run(process.execPath, ["--input-type=module", "--eval", smokeProgram], {
    cwd: consumer,
  });
}

export function runPackageCheck() {
  const manifest = parseReleaseManifest();
  const packageDocument = JSON.parse(
    readFileSync(join(repositoryRoot, "package.json"), "utf8"),
  );
  assertPackageMetadata(packageDocument);

  const temporaryRoot = mkdtempSync(join(tmpdir(), "devrelay-release-"));
  try {
    const pack = npmInvocation([
      "pack",
      "--json",
      "--pack-destination",
      temporaryRoot,
    ]);
    const result = run(pack.command, pack.args, { capture: true });
    const report = JSON.parse(result.stdout);
    if (!Array.isArray(report) || report.length !== 1) {
      throw new Error("npm pack returned an unexpected report");
    }
    const packageFileCount = assertPackageContents(
      report[0].files ?? [],
      manifest,
    );
    const tarball = join(temporaryRoot, report[0].filename);
    installAndImport(tarball, packageDocument, temporaryRoot);
    console.log(
      `Package verification passed: ${packageFileCount} exact catalog-bound files and an installed root-import smoke test.`,
    );
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}
