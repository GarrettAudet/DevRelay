import { mkdir, readFile, writeFile } from "node:fs/promises";

import { sha256Digest } from "../../src/content-digest.mjs";
import {
  assertSessionContextReceipt,
  createSessionContextSnapshot,
  executeSessionBootstrap,
} from "../../src/session-bootstrap.mjs";

const root = new URL("../../", import.meta.url);
const output = new URL("session-context/", import.meta.url);

async function loaded(path, artifactId, schema, mediaType, artifactVersion) {
  const bytes = await readFile(new URL(path, root));
  return {
    bytes,
    ref: {
      artifactId,
      schema,
      mediaType,
      digest: sha256Digest(bytes),
      uri: `devrelay://repository/${path}`,
    },
    artifactVersion: artifactVersion ?? artifactId,
  };
}

const requirementsValue = JSON.parse(await readFile(new URL("project/requirements-baseline.json", root), "utf8"));
const overviewValue = JSON.parse(await readFile(new URL("project/project-overview-baseline.json", root), "utf8"));
const architectureValue = JSON.parse(await readFile(new URL("project/architecture-baseline.json", root), "utf8"));
const contractValue = JSON.parse(await readFile(new URL("project/contract-baseline.json", root), "utf8"));
const workBreakdownValue = JSON.parse(await readFile(new URL("project/work-breakdown-baseline.json", root), "utf8"));
const workDependencyValue = JSON.parse(await readFile(new URL("project/work-dependency-baseline.json", root), "utf8"));
const specialistAssignmentValue = JSON.parse(await readFile(new URL("project/specialist-assignment-baseline.json", root), "utf8"));
const roadmapValue = JSON.parse(await readFile(new URL("project/roadmap-baseline.json", root), "utf8"));
const gatePromotionValue = JSON.parse(await readFile(new URL("dogfood/pm-001-project-memory/assignment/promotion/specialist-assignment-promotion-proof.json", root), "utf8"));

const entries = await Promise.all([
  loaded("project/project-overview-baseline.json", overviewValue.baselineId, "https://devrelay.dev/artifacts/project-overview-baseline/v1", "application/vnd.devrelay.project-overview-baseline+json", overviewValue.version),
  loaded("ProjectOverview.md", "project-overview-markdown-pm-001", "https://devrelay.dev/artifacts/project-overview-markdown/v1", "text/markdown", overviewValue.version),
  loaded("CURRENT_STATUS.md", "current-status-pm-001", "https://devrelay.dev/artifacts/current-status/v1", "text/markdown", "pm-001-specialist-assignment-gate"),
  loaded("project/requirements-baseline.json", requirementsValue.baselineId, "https://devrelay.dev/artifacts/requirements-baseline/v1", "application/vnd.devrelay.requirements-baseline+json", requirementsValue.version),
  loaded("project/architecture-baseline.json", architectureValue.baselineId, "https://devrelay.dev/artifacts/architecture-baseline/v1", "application/vnd.devrelay.architecture-baseline+json", architectureValue.version),
  loaded("project/contract-baseline.json", contractValue.baselineId, "https://devrelay.dev/artifacts/contract-baseline/v1", "application/vnd.devrelay.contract-baseline+json", contractValue.version),
  loaded("project/work-breakdown-baseline.json", workBreakdownValue.baselineId, "https://devrelay.dev/artifacts/work-breakdown-baseline/v1", "application/vnd.devrelay.work-breakdown-baseline+json", workBreakdownValue.version),
  loaded("project/work-dependency-baseline.json", workDependencyValue.baselineId, "https://devrelay.dev/artifacts/work-dependency-baseline/v1", "application/vnd.devrelay.work-dependency-baseline+json", workDependencyValue.version),
  loaded("project/specialist-assignment-baseline.json", specialistAssignmentValue.baselineId, "https://devrelay.dev/artifacts/specialist-assignment-baseline/v1", "application/vnd.devrelay.specialist-assignment-baseline+json", specialistAssignmentValue.version),
  loaded("project/roadmap-baseline.json", roadmapValue.baselineId, "https://devrelay.dev/artifacts/roadmap-baseline/v1", "application/vnd.devrelay.roadmap-baseline+json", roadmapValue.version),
  loaded("Roadmap.md", "roadmap-markdown-pm-001", "https://devrelay.dev/artifacts/roadmap-markdown/v1", "text/markdown", roadmapValue.version),
  loaded("dogfood/pm-001-project-memory/assignment/promotion/specialist-assignment-promotion-proof.json", "pm-001-specialist-assignment-promotion-proof", "https://devrelay.dev/evidence/specialist-assignment-gate-promotion/v1", "application/vnd.devrelay.specialist-assignment-gate-promotion+json", gatePromotionValue.approvedBaseline.digest),
]);
const roles = [
  "project-overview",
  "project-overview-projection",
  "lifecycle-status",
  "requirements-baseline",
  "architecture-baseline",
  "contract-baseline",
  "work-breakdown-baseline",
  "work-dependency-baseline",
  "specialist-assignment-baseline",
  "roadmap",
  "roadmap-projection",
  "pending-gate",
];
const bindings = entries.map((entry, index) => ({ role: roles[index], artifact: entry.ref, artifactVersion: entry.artifactVersion }));
const values = new Map(entries.map(({ ref, bytes }) => [ref.digest, bytes]));
const repositoryRevision = "a18e6fbfac4f8e3088b349dd2c018efcc5dc0bc1";
const snapshot = createSessionContextSnapshot({
  projectId: "devrelay",
  taskId: "PM-001-PROJECT-MEMORY",
  workspaceId: "devrelay-source-workspace",
  repositoryRevision,
  bindings,
  roadmapDisposition: "initialized",
  createdAt: "2026-08-16T18:00:00Z",
});
const receipt = await executeSessionBootstrap({
  snapshot,
  artifactResolver: async (artifact) => ({ bytes: values.get(artifact.digest) }),
  expectedProjectId: "devrelay",
  expectedTaskId: "PM-001-PROJECT-MEMORY",
  expectedWorkspaceId: "devrelay-source-workspace",
  expectedRepositoryRevision: repositoryRevision,
  cache: "warm",
  durationMs: 0,
});
assertSessionContextReceipt({ receipt, snapshot, currentBindings: bindings, currentRepositoryRevision: repositoryRevision });
if (receipt.outcome !== "pass") throw new Error("PM-001 session context did not pass");

await mkdir(output, { recursive: true });
await writeFile(new URL("snapshot.json", output), Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8"));
await writeFile(new URL("receipt.json", output), Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"));
process.stdout.write(`${JSON.stringify({ outcome: receipt.outcome, snapshotDigest: snapshot.contentDigest, receiptDigest: receipt.contentDigest, bindingCount: bindings.length }, null, 2)}\n`);
