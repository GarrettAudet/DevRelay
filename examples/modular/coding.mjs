import { readFileSync } from "node:fs";
import { createPluginCatalog } from "../../src/modular.mjs";
import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { requirementsRuntimeArtifactContracts } from "../../src/requirements-runtime-contracts.mjs";
import { createNativeArchitectureInventory } from "../../src/architecture-discovery-native-inventory.mjs";
import { createCapabilityEnforcer } from "../../src/local-host-isolation.mjs";
import { createCodingStorage } from "./coding-storage.mjs";
import { createCodingFiles, ensurePlainDirectory, validateRelativePath, renderCodingDiff } from "./coding-files.mjs";
import { apiVersion, schemas, codingModule, codingPluginDefinitions, codingArtifactContracts, validateCodingArtifact } from "./coding-contracts.mjs";

let nodeIdentity;
function currentNode() {
  nodeIdentity ??= { nodeExecutable: process.execPath, nodeVersion: process.version,
    nodeDigest: sha256Digest(readFileSync(process.execPath)) };
  return { ...nodeIdentity };
}
function requestPaths(request) {
  validateCodingArtifact("request", request);
  const aliases = new Map();
  const edits = new Set();
  for (const change of request.changes) {
    if (Buffer.byteLength(change.content, "utf8") > 1048576) throw new Error("Replacement exceeds the 1 MiB example limit: " + change.path);
    const lower = change.path.toLowerCase();
    if (edits.has(lower)) throw new Error("Duplicate change path: " + change.path);
    edits.add(lower);
  }
  const paths = [...request.readPaths, ...request.changes.map(change => change.path), ...request.testFiles];
  for (const path of paths) {
    validateRelativePath(path);
    const previous = aliases.get(path.toLowerCase());
    if (previous !== undefined && previous !== path) throw new Error("Ambiguous case alias in request path: " + path);
    aliases.set(path.toLowerCase(), path);
  }
  for (const [lower, path] of aliases) {
    const parts = lower.split("/");
    for (let index = 1; index < parts.length; index++) {
      const ancestor = aliases.get(parts.slice(0, index).join("/"));
      if (ancestor !== undefined) throw new Error("Conflicting file paths: " + ancestor + " and " + path);
    }
  }
  for (const file of request.testFiles) if (!/\.(?:mjs|cjs|js)$/.test(file)) throw new Error("Explicit JavaScript Node test files are required");
  return [...new Set(paths)].sort();
}
function stepResult(invocation, body) {
  return { apiVersion, kind: "ModuleStepResult", invocationId: invocation.invocationId,
    invocationFingerprint: invocation.invocationFingerprint, chainFingerprint: invocation.chainFingerprint,
    stepInvocationDigest: invocation.stepInvocationDigest, step: invocation.step,
    plugin: invocation.plugin, ...body };
}

/**
 * A local example host: Desktop authors the request; existing Core owns the chain.
 * Trusted code only. Filesystem checks and process grants are not an OS sandbox.
 */
export function createCodingWorkflow({ workspace, stateDirectory, requirementsBytes, overviewBytes, overviewMarkdownBytes }) {
  const files = createCodingFiles(workspace);
  const stateRoot = ensurePlainDirectory(stateDirectory);
  if (stateRoot === files.root) throw new Error("State directory must differ from the workspace root");
  const config = { workspace: files.root, ...currentNode() };
  const store = createCodingStorage(stateRoot);
  let calls = 0;
  try {
    store.bind("workspace", config);
    const requirements = JSON.parse(Buffer.from(requirementsBytes).toString("utf8"));
    const overview = JSON.parse(Buffer.from(overviewBytes).toString("utf8"));
    const requirementsRef = store.putBytes(Buffer.from(requirementsBytes),
      "https://devrelay.dev/artifacts/requirements-baseline/v1",
      { artifactId: requirements.baselineId, mediaType: "application/vnd.devrelay.requirements-baseline+json" });
    const overviewRef = store.putBytes(Buffer.from(overviewBytes),
      "https://devrelay.dev/artifacts/project-overview-baseline/v1",
      { artifactId: overview.baselineId, mediaType: "application/vnd.devrelay.project-overview-baseline+json" });
    const markdownRef = overview.renderedDocument.artifact;
    store.putBytes(Buffer.from(overviewMarkdownBytes), markdownRef.schema, markdownRef);

    const definitions = codingPluginDefinitions(config);
    const readRequest = invocation => store.json(invocation.inputs.request[0]);
    const prior = (invocation, step, port) => {
      const result = invocation.priorResults.find(item => item.step === step);
      if (!result?.outputs[port]?.[0]) throw new Error("Missing declared " + step + " handoff");
      return store.json(result.outputs[port][0]);
    };
    const handoff = (invocation, name, value) => stepResult(invocation, {
      disposition: "continue", outputs: { [name]: [store.put(validateCodingArtifact(name, value), schemas[name])] },
      evidence: [], diagnostics: [],
    });
    function enforcer(request) {
      return createCapabilityEnforcer({ attemptId: request.requestId, workspace: files.root, grants: [
        { kind: "filesystem.read", values: requestPaths(request) },
        { kind: "filesystem.write", values: request.changes.map(change => change.path) },
        { kind: "process.spawn", values: [config.nodeExecutable] },
      ] });
    }
    const adapters = {
      inspect: async invocation => {
        const request = readRequest(invocation);
        const guard = enforcer(request);
        const observed = requestPaths(request).map(path => {
          guard.authorize({ kind: "filesystem.read", path });
          return files.read(path);
        });
        for (const file of observed) {
          if (file.content === null && !request.changes.some(change => change.path === file.path)) {
            throw new Error("Declared input file does not exist: " + file.path);
          }
        }
        const existing = observed.filter(file => file.content !== null);
        let inventory = null;
        if (existing.length) {
          const repositorySnapshot = store.put({ files: observed }, "https://devrelay.dev/examples/modular/coding/snapshot/v1");
          const policy = store.put({ allowedPaths: existing.map(file => file.path) }, "https://devrelay.dev/examples/modular/coding/privacy/v1");
          const body = { invocationId: invocation.invocationId + "-inventory", repositorySnapshot,
            allowedPaths: existing.map(file => file.path), policy,
            adapter: { id: "native-architecture-discovery", version: "0.1.0", configurationDigest: canonicalJsonDigest({}) } };
          inventory = createNativeArchitectureInventory({
            invocation: { apiVersion, kind: "RepositoryInventoryInvocation", ...body, invocationFingerprint: canonicalJsonDigest(body) },
            files: existing.map(file => ({ path: file.path, bytes: Buffer.from(file.content, "utf8") })),
          });
        }
        return handoff(invocation, "inspection", { files: observed, inventory });
      },
      edit: async invocation => {
        store.assertEffectAvailable(invocation.stepInvocationDigest);
        const request = readRequest(invocation);
        const inspection = prior(invocation, "inspect", "inspection");
        const guard = enforcer(request);
        files.assertCurrent(inspection.files);
        const changes = request.changes.map(change => {
          guard.authorize({ kind: "filesystem.write", path: change.path });
          const before = inspection.files.find(file => file.path === change.path);
          if (!before || before.digest !== change.beforeDigest) throw new Error("Stale file preimage digest: " + change.path);
          return { path: change.path, before: before.content, after: change.content,
            beforeDigest: before.digest, afterDigest: sha256Digest(Buffer.from(change.content, "utf8")) };
        });
        store.beginEffect(invocation.stepInvocationDigest);
        for (const change of changes) {
          // Repeat the exact preimage check immediately before each bounded write.
          files.assertCurrent([{ path: change.path, digest: change.beforeDigest }]);
          files.write(change.path, change.after);
        }
        const after = inspection.files.map(file => {
          const change = changes.find(item => item.path === file.path);
          return change ? { path: file.path, content: change.after, digest: change.afterDigest } : file;
        });
        files.assertCurrent(after);
        return handoff(invocation, "changes", { files: after, inventory: inspection.inventory, changes });
      },
      verify: async invocation => {
        store.assertEffectAvailable(invocation.stepInvocationDigest);
        const request = readRequest(invocation);
        const applied = prior(invocation, "edit", "changes");
        files.assertCurrent(applied.files);
        const guard = enforcer(request);
        if (sha256Digest(readFileSync(config.nodeExecutable)) !== config.nodeDigest) throw new Error("Pinned Node executable changed");
        store.beginEffect(invocation.stepInvocationDigest);
        const env = { ...process.env };
        delete env.NODE_TEST_CONTEXT;
        delete env.NODE_OPTIONS;
        const execution = guard.executeProcess({ executable: config.nodeExecutable,
          argv: ["--test", "--test-concurrency=1", ...request.testFiles.map(path => "./" + path)],
          cwd: files.root, timeout: request.timeoutMs, env });
        files.assertCurrent(applied.files);
        const report = validateCodingArtifact("report", {
          requestId: request.requestId, goal: request.goal, workspace: files.root, ...applied,
          diff: renderCodingDiff(applied.changes),
          verification: { exitCode: execution.status, stdout: execution.stdout.toString("utf8"),
            stderr: execution.stderr.toString("utf8"), receipt: execution.receipt },
        });
        const output = store.put(report, schemas.report);
        const passed = execution.status === 0;
        return stepResult(invocation, { disposition: "terminal", moduleResult: {
          apiVersion, kind: "ModuleResult", invocationId: invocation.invocationId,
          status: passed ? "completed" : "failed", outcome: passed ? "verified" : "tests_failed",
          outputs: { report: [output] },
          evidence: [{ kind: "example/coding-tests", subject: output.artifactId, status: passed ? "pass" : "fail", artifact: output }],
          diagnostics: [],
        } });
      },
    };
    const catalog = createPluginCatalog({
      modules: [codingModule], artifactContracts: [...requirementsRuntimeArtifactContracts(), ...codingArtifactContracts],
      plugins: definitions.map(definition => {
        const step = definition.implements[0].operations[0].step;
        return { definition, adapter: { async invoke(invocation) { calls++; return adapters[step](invocation); } } };
      }),
    });
    const runtimeContext = { artifacts: store.artifacts, checkpoints: store.checkpoints };
    function invocation(request) {
      requestPaths(request);
      const value = {
        apiVersion, kind: "ModuleInvocation", invocationId: "coding-" + request.requestId,
        runId: "coding-" + request.requestId, nodeId: "coding-change",
        module: { id: "example.coding-change", version: "1.0.0", operation: "apply-and-verify" },
        inputs: { request: [store.put(request, schemas.request)],
          "requirements-baseline": [requirementsRef], "project-overview-baseline": [overviewRef] },
        adapters: definitions.map(definition => {
          const operation = definition.implements[0].operations[0];
          return { step: operation.step, plugin: { id: definition.metadata.id, version: definition.metadata.version },
            config, grants: structuredClone(operation.capabilities) };
        }),
        options: {},
      };
      store.bind("request:" + request.requestId, value);
      return structuredClone(value);
    }
    return {
      catalog, invocation, runtimeContext, close: () => store.close(),
      async execute(request) {
        const before = calls;
        const result = await catalog.registry.execute(invocation(request), runtimeContext);
        const report = store.json(result.outputs.report[0]);
        let currentWorkspaceMatches = true;
        try { files.assertCurrent(report.files); } catch { currentWorkspaceMatches = false; }
        return { result, report, replayed: calls === before, currentWorkspaceMatches };
      },
    };
  } catch (error) { store.close(); throw error; }
}
