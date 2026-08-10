import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageDocument = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const releaseCatalogPath = path.join(
  repositoryRoot,
  "release",
  `${packageDocument.version}.json`,
);
const releaseCatalog = JSON.parse(await readFile(releaseCatalogPath, "utf8"));
const dogfoodRoot = path.join(repositoryRoot, "dogfood");

const sha256 = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function regularFiles(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function evidence(directory, fileNames) {
  const records = [];
  for (const fileName of fileNames) {
    const bytes = await readFile(path.join(directory, fileName));
    records.push({
      path: path
        .relative(repositoryRoot, path.join(directory, fileName))
        .replaceAll(path.sep, "/"),
      digest: sha256(bytes),
      byteCount: bytes.byteLength,
    });
  }
  return records;
}

const count = (files, predicate) => files.filter(predicate).length;
const has = (files, fileName) => files.includes(fileName);

function classify(flags) {
  if (
    flags.clarificationRequest &&
    flags.clarificationTranscript &&
    flags.clarificationResponse &&
    flags.continuation &&
    flags.initialAndResumeRuns &&
    flags.gateCandidate &&
    flags.ownerApproval
  ) {
    return {
      status: "closed-interactive",
      progressionAllowed: true,
      finding:
        "Machine-verifiable clarification request, human-readable transcript, owner response, resumable continuation, resumed execution, and exact Gate approval are present.",
    };
  }
  if (
    flags.clarificationRequest &&
    flags.clarificationTranscript &&
    flags.continuation &&
    !flags.clarificationResponse
  ) {
    return {
      status: "awaiting-clarification",
      progressionAllowed: false,
      finding:
        "RequirementsGathering stopped at a resumable clarification checkpoint; no owner response or promotable candidate is proven.",
    };
  }
  if (
    flags.clarificationRequest ||
    flags.clarificationTranscript ||
    flags.clarificationResponse ||
    flags.continuation
  ) {
    return {
      status: "interactive-evidence-incomplete",
      progressionAllowed: false,
      finding:
        "Some interaction evidence exists, but the request/response/continuation/resume/Gate chain is incomplete and cannot independently prove the user-facing workflow.",
    };
  }
  if (flags.requirementsInvocation && flags.requirementsResult) {
    return {
      status: "candidate-only-no-interview-evidence",
      progressionAllowed: false,
      finding:
        "A machine RequirementsGathering run exists, but no question transcript or explicit no-clarification decision proves that the user-facing requirements interview occurred.",
    };
  }
  return {
    status: "requirements-run-missing",
    progressionAllowed: false,
    finding:
      "No executable RequirementsGathering invocation/result pair is present for this module construction run.",
  };
}

const releasedModules = releaseCatalog.modules.map(({ id, version }) => ({
  id,
  version,
  releaseStatus: "released",
}));
const activeUnreleased = [];
for (const entry of await readdir(dogfoodRoot, { withFileTypes: true })) {
  if (
    entry.isDirectory() &&
    !entry.name.startsWith("_") &&
    !releasedModules.some(({ id }) => id === entry.name) &&
    has(await regularFiles(path.join(dogfoodRoot, entry.name)), "goal.json")
  ) {
    activeUnreleased.push({
      id: entry.name,
      version: null,
      releaseStatus: "active-unreleased",
    });
  }
}

const records = [];
for (const moduleRecord of [...releasedModules, ...activeUnreleased].sort(
  (left, right) => left.id.localeCompare(right.id),
)) {
  const directory =
    moduleRecord.id === "requirements-gathering"
      ? path.join(repositoryRoot, "project")
      : path.join(dogfoodRoot, moduleRecord.id);
  const files = await regularFiles(directory);
  const requirementsInvocations = count(
    files,
    (name) => /^requirements-(?:gathering|change)\.invocation\.json$/u.test(name),
  );
  const requirementsResults = count(
    files,
    (name) => /^requirements-(?:gathering|change)\.result\.json$/u.test(name),
  );
  const flags = {
    goal: has(files, "goal.json"),
    clarificationRequest: has(files, "clarification-request.json"),
    clarificationTranscript: has(files, "clarification-transcript.md"),
    clarificationResponse: has(files, "clarification-response.json"),
    continuation: has(files, "requirements-continuation.json"),
    requirementsInvocation: requirementsInvocations > 0,
    requirementsResult: requirementsResults > 0,
    initialAndResumeRuns: requirementsInvocations >= 2 && requirementsResults >= 2,
    gateCandidate: has(files, "requirements-gate-candidate.json"),
    ownerApproval: has(files, "requirements-gate-owner-approval.json"),
  };
  const classification = classify(flags);
  const evidenceNames = files.filter((name) =>
    [
      "goal.json",
      "clarification-request.json",
      "clarification-transcript.md",
      "clarification-response.json",
      "requirements-continuation.json",
      "requirements-gathering.invocation.json",
      "requirements-gathering.result.json",
      "requirements-change.invocation.json",
      "requirements-change.result.json",
      "requirements-gate-candidate.json",
      "requirements-gate-owner-approval.json",
    ].includes(name),
  );
  records.push({
    module: moduleRecord,
    requirementsEvidenceRoot: path
      .relative(repositoryRoot, directory)
      .replaceAll(path.sep, "/"),
    classification,
    flags,
    evidence: await evidence(directory, evidenceNames),
  });
}

const statusCounts = Object.fromEntries(
  [...new Set(records.map(({ classification }) => classification.status))]
    .sort()
    .map((status) => [
      status,
      records.filter(({ classification }) => classification.status === status)
        .length,
    ]),
);
const audit = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsDogfoodAudit",
  auditId: `requirements-dogfood-audit-${packageDocument.version}`,
  releaseCatalog: {
    path: path.relative(repositoryRoot, releaseCatalogPath).replaceAll(path.sep, "/"),
    version: releaseCatalog.metadata.version,
    digest: sha256(await readFile(releaseCatalogPath)),
  },
  policy: {
    rule:
      "A built module is not proven recursively dogfooded unless RequirementsGathering has either a closed request/response/resume/Gate chain or a machine-verifiable explicit no-clarification disposition.",
    transcriptAloneIsSufficient: false,
    candidateGenerationAloneIsSufficient: false,
    passingImplementationTestsAreSufficient: false,
  },
  summary: {
    moduleCount: records.length,
    statusCounts,
    provenClosedInteractiveCount: records.filter(
      ({ classification }) => classification.status === "closed-interactive",
    ).length,
    nonCompliantOrOpenCount: records.filter(
      ({ classification }) => classification.status !== "closed-interactive",
    ).length,
  },
  records,
};

const tableRows = records
  .map(
    ({ module, classification }) =>
      `| ${module.id} | ${module.releaseStatus} | ${classification.status} | ${classification.progressionAllowed ? "yes" : "no"} |`,
  )
  .join("\n");
const details = records
  .filter(({ classification }) => classification.status !== "closed-interactive")
  .map(
    ({ module, classification }) =>
      `- **${module.id}:** ${classification.finding}`,
  )
  .join("\n");
const markdown = `# Requirements dogfood audit\n\n` +
  `Release catalog: \`${releaseCatalog.metadata.version}\`  \n` +
  `Modules inspected: ${records.length}  \n` +
  `Fully proven closed interactions: ${audit.summary.provenClosedInteractiveCount}  \n` +
  `Open or non-compliant interactions: ${audit.summary.nonCompliantOrOpenCount}\n\n` +
  `This audit deliberately does not treat generated requirements candidates, passing implementation tests, or a transcript by itself as proof that the user-facing RequirementsGathering workflow ran.\n\n` +
  `| Module | Release state | Requirements interaction evidence | Progression proven |\n` +
  `| --- | --- | --- | --- |\n${tableRows}\n\n` +
  `## Findings requiring action\n\n${details || "None."}\n`;

await mkdir(dogfoodRoot, { recursive: true });
await Promise.all([
  writeFile(
    path.join(dogfoodRoot, "requirements-interaction-audit.json"),
    `${JSON.stringify(audit, null, 2)}\n`,
  ),
  writeFile(
    path.join(dogfoodRoot, "requirements-interaction-audit.md"),
    markdown.normalize("NFC"),
  ),
]);

process.stdout.write(
  `${JSON.stringify(
    {
      moduleCount: audit.summary.moduleCount,
      provenClosedInteractiveCount:
        audit.summary.provenClosedInteractiveCount,
      nonCompliantOrOpenCount: audit.summary.nonCompliantOrOpenCount,
      statusCounts,
    },
    null,
    2,
  )}\n`,
);

if (
  process.argv.includes("--strict") &&
  audit.summary.nonCompliantOrOpenCount > 0
) {
  process.exitCode = 1;
}
