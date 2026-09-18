import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nativeDiscoveryPlugin } from "../../src/native-discovery-binding.mjs";
import { materializeDesktopHostFixture } from "./desktop-local-host.mjs";

// Fixture context; real native inventory over an explicitly declared source file.
export function materializeNativeDiscoveryHostFixture(root, { withDesign = false } = {}) {
  const fx = { root, ...materializeDesktopHostFixture(root) };
  const config = structuredClone(fx.configuration);
  const session = JSON.parse(readFileSync(join(fx.root, config.sessionSnapshot.path)));
  const role = name => session.bindings.find(binding => binding.role === name).artifact;
  const overviewFile = config.artifacts.find(entry => entry.ref.artifactId === role("project-overview").artifactId);
  const overview = JSON.parse(readFileSync(join(fx.root, overviewFile.path)));
  const markdown = config.artifacts.find(entry => entry.ref.artifactId === role("project-overview-projection").artifactId);
  config.artifacts.push({ path: markdown.path, ref: { ...markdown.ref, ...overview.renderedDocument.artifact } });
  const repoFile = fx.json("native/repository.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "RepositorySnapshot",
    repository: "fixture://native/project", revision: session.repositoryRevision, treeDigest: `sha256:${"a".repeat(64)}`, includedPaths: ["sample"], excludedPaths: [] });
  const repository = { artifactId: "native-repository", schema: "https://devrelay.dev/artifacts/repository-snapshot/v1",
    mediaType: "application/vnd.devrelay.repository-snapshot+json", digest: repoFile.digest, uri: "fixture://native/repository" };
  config.artifacts.push({ path: repoFile.path, ref: repository });
  const context = config.artifacts.find(entry => entry.ref.artifactId === "project-context-001").ref;
  const state = { apiVersion: "devrelay.dev/v1alpha1", kind: "ProjectArchitectureState", stateId: "native-discovery-state",
    state: "existing-undiscovered", projectLifecycle: "existing", projectContext: context,
    requirementsBaseline: role("requirements-baseline"), projectOverviewBaseline: role("project-overview"), repositorySnapshot: repository };
  const stateFile = fx.json("native/state.json", state);
  const stateRef = { artifactId: state.stateId, schema: "https://devrelay.dev/artifacts/project-architecture-state/v1",
    mediaType: "application/vnd.devrelay.project-architecture-state+json", digest: stateFile.digest, uri: "fixture://native/state" };
  config.artifacts.push({ path: stateFile.path, ref: stateRef });
  config.contractSet = "architecture-discovery";
  config.modules = [fx.write("native/module.json", readFileSync(new URL("../../examples/modules/architecture-discovery-0.1.1.module.json", import.meta.url)))];
  config.plugins = [fx.json("native/plugin.json", nativeDiscoveryPlugin)];
  if (withDesign) {
    config.architectureObserverVersion = "1.1.0";
    config.contractGenerators = [{ contractKind: "json-schema", id: "json-schema-contract-generator", version: "0.1.0" }];
    config.assignmentBinding = { id: "devrelay.native-specialist-ranker", version: "1.0.0" };
    config.dependencyBinding = { proposer: { id: "native-structured-dependency-proposer", version: "0.1.0" },
      reviewer: { id: "devrelay.native-consistency-reviewer", version: "0.1.0" }, entrypoint: "devrelay/work_dependency/decision" };
    config.modules.push(fx.write("design/module.json", readFileSync(new URL("../../examples/modules/architecture-design.module.json", import.meta.url))));
    config.modules.push(fx.write("work/module.json", readFileSync(new URL("../../examples/modules/work-breakdown.module.json", import.meta.url))));
    config.modules.push(fx.write("dependency/module.json", readFileSync(new URL("../../examples/modules/work-dependency-analysis.module.json", import.meta.url))));
    config.modules.push(fx.write("assignment/module.json", readFileSync(new URL("../../examples/modules/specialist-assignment-v3.module.json", import.meta.url))));
    config.plugins.push(fx.json("work/plugin.json", { apiVersion: "devrelay.dev/v1alpha1", kind: "ModulePlugin",
      metadata: { id: "desktop-work-breakdown-fixture", version: "0.1.0", description: "Fixture-only Desktop WorkBreakdown exchange; no upstream tool conformance." },
      implements: [{ module: { id: "work-breakdown", version: "0.1.0" }, operations: [{ id: "establish-breakdown", execution: "effect",
        configSchema: { type: "object", additionalProperties: false, properties: {} }, capabilities: [] }] }] }));
    for (const [name, step] of [["spec-kit-plan", "designer"], ["structurizr", "modeler"], ["madr", "decision-recorder"]]) {
      const plugin = JSON.parse(readFileSync(new URL(`../../examples/plugins/${name}.plugin.json`, import.meta.url)));
      plugin.metadata.id = `desktop-architecture-${step}-fixture`;
      plugin.metadata.description = "Fixture-only Desktop exchange, not live upstream conformance.";
      plugin.implements[0].operations = plugin.implements[0].operations.filter(operation => operation.id === "establish-baseline");
      plugin.implements[0].operations[0].capabilities = [];
      config.plugins.push(fx.json(`design/${step}.json`, plugin));
    }
  }
  const source = fx.write("sample/index.mjs", Buffer.from("export const greeting = 'hello';\n"));
  const invocation = { apiVersion: "devrelay.dev/v1alpha1", kind: "ModuleInvocation", invocationId: "native-discovery-001",
    runId: "native-run", nodeId: "discovery", module: { id: "architecture-discovery", version: "0.1.1", operation: "discover" },
    plugin: { id: nativeDiscoveryPlugin.metadata.id, version: nativeDiscoveryPlugin.metadata.version },
    inputs: { "requirements-baseline": [role("requirements-baseline")], "project-overview-baseline": [role("project-overview")], "project-architecture-state": [stateRef], "repository-snapshot": [repository] },
    config: { sourceRoot: ".", sources: [source] }, grants: [{ kind: "filesystem.read", scope: "." }], options: {} };
  const descriptor = fx.json("native/host.json", config);
  const configured = { ...fx, configurationPath: join(fx.root, descriptor.path), configurationDigest: descriptor.digest,
    input: { ...fx.input, runId: invocation.runId, nodeId: invocation.nodeId, invocation: fx.json("native/invocation.json", invocation) } };
  return { fx, configured, source, invocation };
}
