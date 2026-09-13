import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { createSessionContextSnapshot } from "../../src/session-bootstrap.mjs";
import { materializeDesktopHostFixture } from "./desktop-local-host.mjs";

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url));
const document = (file) => JSON.parse(source(file));

// A closed example project/context, never a promotion of DevRelay's real pair.
export function materializeRequirementsChangeHostFixture(root) {
  const fx = materializeDesktopHostFixture(root);
  const invocation = document("examples/invocations/requirements-openspec-change-set.invocation.json");
  const result = document("examples/results/requirements-openspec-change-set.result.json");
  const priorInvocation = JSON.parse(readFileSync(join(root, fx.input.invocation.path)));
  invocation.plugin = priorInvocation.plugin;
  invocation.config = { ...invocation.config, ...priorInvocation.config };
  invocation.grants = [];
  const paths = {
    "goal-001": "examples/artifacts/goal-001.json",
    "goal-change-001": "examples/artifacts/goal-change-001.json",
    "project-context-001": "examples/artifacts/project-context-001.json",
    "repository-snapshot-001": "examples/artifacts/repository-snapshot-001.json",
    "requirements-baseline-001": "examples/artifacts/requirements-baseline-001.json",
    "project-overview-baseline-001": "examples/artifacts/project-overview-baseline-001.json",
    "requirements-change-set-001": "examples/artifacts/requirements-change-set-001.json",
    "project-overview-change-set-draft-001": "examples/artifacts/project-overview-change-set-draft-001.json",
    "native-source-openspec-change-001": "examples/artifacts/native-source-bundle-change-001.json",
    "project-overview-md-001": "examples/artifacts/ProjectOverview.md",
    "project-overview-md-002": "examples/artifacts/project-overview-change/ProjectOverview.md",
    "openspec-change-proposal-001": "examples/native/openspec/change-proposal.md",
  };
  const bundleId = "native-source-openspec-change-001";
  const bundle = document(paths[bundleId]);
  bundle.plugin = invocation.plugin;
  bundle.tool = { name: invocation.config.toolName, version: invocation.config.toolVersion };
  const bundleBytes = Buffer.from(canonicalJson(bundle));
  const refs = new Map();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.artifactId === bundleId) value.digest = sha256Digest(bundleBytes);
    if (value.artifactId && value.schema && value.mediaType && value.digest && value.uri) refs.set(canonicalJsonDigest(value), value);
    Object.values(value).forEach(visit);
  };
  visit(invocation); visit(result);
  for (const file of Object.values(paths).filter((file) => file.endsWith(".json"))) visit(document(file));
  const artifacts = fx.configuration.artifacts.filter(({ path }) => !path.startsWith("examples/") && !["context/requirements-baseline", "context/project-overview", "context/project-overview-projection"].includes(path));
  for (const [artifactId, file] of Object.entries(paths)) {
    if (![...refs.values()].some((ref) => ref.artifactId === artifactId)) {
      const ref = { artifactId, digest: sha256Digest(source(file)), schema: "https://example.test/raw/v1", mediaType: file.endsWith(".md") ? "text/markdown" : "application/json", uri: `fixture://change/${artifactId}` };
      refs.set(canonicalJsonDigest(ref), ref);
    }
  }
  for (const ref of refs.values()) {
    if (!paths[ref.artifactId]) continue;
    fx.write(paths[ref.artifactId], ref.artifactId === bundleId ? bundleBytes : source(paths[ref.artifactId]));
    artifacts.push({ path: paths[ref.artifactId], ref });
  }
  const old = JSON.parse(readFileSync(join(root, fx.configuration.sessionSnapshot.path)));
  const bindings = old.bindings.map((binding) => {
    const port = binding.role === "requirements-baseline" ? "requirements-baseline" : binding.role === "project-overview" ? "project-overview-baseline" : null;
    if (port) return { ...binding, artifact: invocation.inputs[port][0], artifactVersion: "1.0.0" };
    if (binding.role === "project-overview-projection") {
      const ref = { ...binding.artifact, digest: sha256Digest(source(paths["project-overview-md-001"])) };
      artifacts.push({ path: paths["project-overview-md-001"], ref });
      return { ...binding, artifact: ref };
    }
    return binding;
  });
  const snapshot = createSessionContextSnapshot({ projectId: old.projectId, taskId: old.taskId, workspaceId: old.workspaceId, repositoryRevision: old.repositoryRevision, roadmapDisposition: old.roadmapDisposition, createdAt: old.createdAt, bindings });
  const configuration = { ...fx.configuration, requirementsObserverVersion: "1.1.0", artifacts, sessionSnapshot: fx.json("context/change-session.json", snapshot) };
  const config = fx.json("change-host.json", configuration);
  const baselineFile = (file, artifactId, schemaName, mediaType) => {
    const descriptor = fx.write(file, source(file));
    return { path: descriptor.path, ref: { artifactId, digest: descriptor.digest, schema: `https://devrelay.dev/artifacts/${schemaName}/v1`, mediaType, uri: `fixture://change/${artifactId}` } };
  };
  const gate = fx.json("requirements-gate.json", {
    apiVersion: "devrelay.dev/v1alpha1", kind: "DesktopRequirementsGateSubmission",
    requirementsBaseline: baselineFile("examples/artifacts/requirements-baseline-002.json", "requirements-baseline-002", "requirements-baseline", "application/vnd.devrelay.requirements-baseline+json"),
    projectOverviewBaseline: baselineFile("examples/artifacts/project-overview-baseline-002.json", "project-overview-baseline-002", "project-overview-baseline", "application/vnd.devrelay.project-overview-baseline+json"),
    projectOverviewMarkdown: fx.write(paths["project-overview-md-002"], source(paths["project-overview-md-002"])),
    approvalEvidence: [baselineFile("examples/artifacts/requirements-change-approval-001.md", "requirements-change-approval-001", "requirements-approval-evidence", "text/markdown")],
  });
  return { ...fx, configuration, configurationPath: join(root, config.path), configurationDigest: config.digest,
    result, gate, input: { ...fx.input, runId: invocation.runId, nodeId: invocation.nodeId, invocation: fx.json("change-invocation.json", invocation) } };
}
