// Isolated integration fixture using copied approved project context and a
// fixture candidate. This is not live Desktop code-production acceptance.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { loadDesktopProjectMemoryBootstrap } from "../../src/desktop-project-memory-bootstrap.mjs";
import { createSessionContextSnapshot } from "../../src/session-bootstrap.mjs";

const source = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url));
export function materializeDesktopHostFixture(root) {
  const write = (relative, bytes) => {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), bytes);
    return { path: relative, digest: sha256Digest(bytes) };
  };
  const json = (relative, value) => write(relative, Buffer.from(canonicalJson(value)));
  const memoryManifest = JSON.parse(source("project/project-memory-bootstrap-manifest.json"));
  json("project/project-memory-bootstrap-manifest.json", memoryManifest);
  for (const relative of Object.values(memoryManifest.paths)) write(relative, source(relative));
  const taskId = "desktop-host-test";
  const repositoryRevision = "0".repeat(40);
  const bootstrap = loadDesktopProjectMemoryBootstrap({ projectRoot: root, taskId, repositoryRevision });
  const files = [];
  const ref = (id, schema, mediaType, descriptor) => ({ artifactId: id, schema, mediaType, digest: descriptor.digest, uri: `fixture://host/${id}` });
  const add = (reference, relative, bytes) => { write(relative, bytes); files.push({ ref: reference, path: relative }); return reference; };
  const baseline = bootstrap.memoryContext.projectMemoryBaseline;
  add(baseline, memoryManifest.paths.projectMemoryBaseline, source(memoryManifest.paths.projectMemoryBaseline));
  const synopsis = bootstrap.memoryContext.synopsisProjection;
  add(synopsis, memoryManifest.paths.currentSynopsis, source(memoryManifest.paths.currentSynopsis));
  const graph = bootstrap.memoryContext.graphCheckpoint;
  add(graph, memoryManifest.paths.graphCheckpoint, Buffer.from(canonicalJson(JSON.parse(source(memoryManifest.paths.graphCheckpoint)))));
  const contextRole = (role, sourceFile, schema, mediaType = "application/json") => {
    const descriptor = write(`context/${role}`, source(sourceFile));
    const value = sourceFile.endsWith(".json") ? JSON.parse(source(sourceFile)) : null;
    const reference = ref(value?.baselineId ?? role, schema, mediaType, descriptor);
    files.push({ ref: reference, path: descriptor.path });
    return { role, artifact: reference, artifactVersion: value?.version ?? "unversioned" };
  };
  const lifecycle = json("context/lifecycle", { status: "no-active-run", fixture: true });
  const lifecycleRef = ref("lifecycle", "https://example.test/lifecycle/v1", "application/json", lifecycle);
  files.push({ ref: lifecycleRef, path: lifecycle.path });
  const snapshot = createSessionContextSnapshot({ projectId: "devrelay", taskId, workspaceId: "fixture-workspace", repositoryRevision,
    roadmapDisposition: "initialized", createdAt: "2026-09-13T00:00:00.000Z", bindings: [
      contextRole("requirements-baseline", "project/requirements-baseline.json", "https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json"),
      contextRole("project-overview", "project/project-overview-baseline.json", "https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json"),
      contextRole("project-overview-projection", "ProjectOverview.md", "https://devrelay.dev/artifacts/project-overview-markdown/v1", "text/markdown"),
      { role: "project-memory-baseline", artifact: baseline }, { role: "current-synopsis", artifact: synopsis },
      { role: "traceability-context", artifact: graph }, { role: "lifecycle-status", artifact: lifecycleRef },
      contextRole("roadmap", "project/roadmap-baseline.json", "https://devrelay.dev/artifacts/roadmap-baseline/v1", "application/vnd.devrelay.roadmap-baseline+json"),
      contextRole("roadmap-projection", "Roadmap.md", "https://devrelay.dev/artifacts/roadmap-markdown/v1", "text/markdown"),
    ].map((binding) => ({ artifactVersion: "unversioned", ...binding })) });
  const invocation = JSON.parse(source("examples/invocations/requirements-openspec.invocation.json"));
  const result = JSON.parse(source("examples/results/requirements-openspec.result.json"));
  const plugin = JSON.parse(source("examples/plugins/openspec.plugin.json"));
  plugin.metadata.id = "desktop-requirements-fixture";
  plugin.metadata.description = "Explicit Desktop exchange fixture binding; not a live OpenSpec adapter.";
  plugin.implements[0].operations[0].capabilities = [];
  plugin.implements[0].operations[0].configSchema.properties.toolName = { const: "Desktop fixture" };
  plugin.implements[0].operations[0].configSchema.properties.bridge = { const: "desktop-file-exchange" };
  invocation.plugin.id = plugin.metadata.id;
  invocation.config.projectRoot = root;
  invocation.config.toolName = "Desktop fixture";
  invocation.config.toolVersion = "fixture-1.0.0";
  invocation.config.bridge = "desktop-file-exchange";
  invocation.grants = [];
  const artifactPaths = {
    "goal-001": "examples/artifacts/goal-001.json", "project-context-001": "examples/artifacts/project-context-001.json",
    "repository-snapshot-001": "examples/artifacts/repository-snapshot-001.json", "requirements-draft-001": "examples/artifacts/requirements-draft-001.json",
    "project-overview-draft-001": "examples/artifacts/project-overview-draft-001.json", "native-source-openspec-001": "examples/artifacts/native-source-bundle-001.json",
    "project-overview-md-001": "examples/artifacts/ProjectOverview.md", "openspec-proposal-001": "examples/native/openspec/proposal.md",
  };
  const bundle = JSON.parse(source(artifactPaths["native-source-openspec-001"]));
  bundle.plugin.id = plugin.metadata.id;
  bundle.tool = { name: invocation.config.toolName, version: invocation.config.toolVersion };
  const bundleBytes = Buffer.from(canonicalJson(bundle));
  const replaceBundleRef = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.artifactId === "native-source-openspec-001") value.digest = sha256Digest(bundleBytes);
    Object.values(value).forEach(replaceBundleRef);
  };
  replaceBundleRef(result);
  const refs = new Map();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.artifactId && value.schema && value.mediaType && value.digest && value.uri) refs.set(canonicalJsonDigest(value), value);
    Object.values(value).forEach(visit);
  };
  visit(invocation); visit(result);
  for (const entry of bundle.sources) {
    const sourcePath = artifactPaths[entry.artifact.artifactId];
    const nativeRef = { ...entry.artifact, schema: "https://example.test/native-source/v1", mediaType: "text/markdown", uri: `fixture://host/${entry.artifact.artifactId}` };
    refs.set(canonicalJsonDigest(nativeRef), nativeRef);
    if (!sourcePath) throw new Error("missing native fixture source");
  }
  for (const sourcePath of Object.values(artifactPaths)) {
    if (sourcePath.endsWith(".json")) visit(JSON.parse(source(sourcePath)));
  }
  for (const [artifactId, sourcePath] of Object.entries(artifactPaths)) {
    if (![...refs.values()].some((reference) => reference.artifactId === artifactId)) {
      const rawRef = { artifactId, digest: sha256Digest(source(sourcePath)), schema: "https://example.test/raw-artifact/v1",
        mediaType: sourcePath.endsWith(".md") ? "text/markdown" : "application/json", uri: `fixture://host/${artifactId}` };
      refs.set(canonicalJsonDigest(rawRef), rawRef);
    }
  }
  for (const reference of refs.values()) {
    const sourcePath = artifactPaths[reference.artifactId];
    if (sourcePath) add(reference, sourcePath, reference.artifactId === "native-source-openspec-001" ? bundleBytes : source(sourcePath));
  }
  const configuration = {
    apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopLocalHostConfiguration", projectId: "devrelay", workspaceRoot: root,
    stateDirectory: "state", graphId: "desktop-host-fixture", taskId,
    sessionSnapshot: json("context/session.json", snapshot), memoryManifest: "project/project-memory-bootstrap-manifest.json",
    memorySessionState: write("project/project-memory-session-state.json", source("project/project-memory-session-state.json")),
    contractSet: "requirements", modules: [write("runtime/module.json", source("examples/modules/requirements-gathering.module.json"))],
    plugins: [json("runtime/plugin.json", plugin)], artifacts: files,
    grants: [{ kind: "filesystem.read", values: ["."] }, { kind: "filesystem.write", values: ["state"] }],
  };
  const config = json("host.json", configuration);
  const input = { taskId, runId: invocation.runId, nodeId: invocation.nodeId, goal: "Exercise an explicit Desktop-operated fixture through real Core.", invocation: json("invocation.json", invocation) };
  return { configuration, config, configurationPath: path.join(root, config.path), configurationDigest: config.digest, input, result, write, json };
}
