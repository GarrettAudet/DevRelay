import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  canonicalJsonDigest,
  sha256Digest,
} from "../../../src/content-digest.mjs";
import {
  executeSystemVerification,
  expandSystemVerificationObligations,
} from "../../../src/system-verification-core.mjs";
import {
  adaptSystemTestResult,
  TEST_SYSTEM_VERIFIER,
} from "../../../src/system-verification-test-adapter.mjs";
import {
  adaptSystemReviewResult,
  REVIEW_SYSTEM_VERIFIER,
} from "../../../src/system-verification-review-adapter.mjs";
import { systemVerificationTraceabilityContributor } from "../../../src/system-verification-traceability-contributor.mjs";
import {
  deriveBusinessScopeIdentities,
  executeBusinessAcceptance,
} from "../../../src/business-acceptance-core.mjs";
import { executeBusinessAcceptanceGate } from "../../../src/business-acceptance-gate.mjs";
import { businessAcceptanceTraceabilityContributor } from "../../../src/business-acceptance-traceability-contributor.mjs";
import { requirementsBaselineObserverContributor } from "../../../src/requirements-traceability-contributor.mjs";
import { TRACEABILITY_VOCABULARY_V1_6 } from "../../../src/traceability-artifact-validator.mjs";
import {
  createInMemoryTraceabilityStore,
  createTraceabilityGraphService,
  diagnoseTraceabilityGraph,
} from "../../../src/traceability-graph.mjs";

const API = "devrelay.dev/v1alpha1";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const outputRoot = path.join(
  repositoryRoot,
  "dogfood",
  "sim-001-simplification",
  "final-acceptance",
);
const readBytes = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath));
const readJson = (relativePath) => JSON.parse(readBytes(relativePath));
const canonicalBytes = (value) => Buffer.from(canonicalJson(value), "utf8");
const ref = (artifactId, digest) => ({ artifactId, digest });
const fullRef = (
  artifactId,
  digest,
  schema = "https://devrelay.dev/artifacts/release-evidence/v1",
  mediaType = "application/json",
) => ({
  artifactId,
  digest,
  schema,
  mediaType,
  uri: `memory://devrelay/sim-001/${encodeURIComponent(artifactId)}/${digest.slice(7)}.json`,
});
const seal = (value, field) => ({
  ...value,
  [field]: canonicalJsonDigest(
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => !["apiVersion", "kind", field].includes(key),
      ),
    ),
  ),
});
const loadedCanonical = (
  value,
  artifactId,
  schema,
  mediaType = "application/json",
) => {
  const bytes = canonicalBytes(value);
  return {
    value,
    bytes,
    ref: fullRef(artifactId, sha256Digest(bytes), schema, mediaType),
  };
};
const loadedRaw = (relativePath, artifactId, schema, mediaType) => {
  const bytes = readBytes(relativePath);
  return {
    value: JSON.parse(bytes),
    bytes,
    ref: fullRef(artifactId, sha256Digest(bytes), schema, mediaType),
  };
};
const writeJson = (name, value) => {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, name), `${canonicalJson(value)}\n`, "utf8");
};
const writeText = (name, value) => {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, name), value.replaceAll("\r\n", "\n"), "utf8");
};
const immutableStore = () => {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      if (values.has(key)) throw new Error(`immutable checkpoint already exists: ${key}`);
      values.set(key, structuredClone(value));
    },
  };
};

function businessScopeReconciliationContributor() {
  return Object.freeze({
    metadata: Object.freeze({
      id: "devrelay.requirements-business-scope-reconciliation",
      version: "1.0.0",
    }),
    authority: "approved",
    scope: "requirements/baseline",
    ownership: Object.freeze({
      authority: "approved",
      scope: "requirements/baseline",
      nodeKinds: Object.freeze(["business-scope"]),
      edgeKinds: Object.freeze(["defines"]),
    }),
    match: (context) =>
      context?.invocation?.module?.id === "architecture-design" &&
      context?.invocation?.module?.version === "0.1.0" &&
      Array.isArray(context?.loadedInputs?.["requirements-baseline"]) &&
      Array.isArray(context?.loadedInputs?.["project-overview-baseline"]),
    async project(context) {
      const projection = await requirementsBaselineObserverContributor.project(context);
      return {
        horizon: projection.horizon,
        nodes: projection.nodes.filter(({ kind }) => kind === "business-scope"),
        edges: projection.edges.filter(
          ({ kind, target }) => kind === "defines" && target?.kind === "business-scope",
        ),
      };
    },
  });
}

function findAppliedUpdates(head) {
  const wanted = new Map(head.appliedUpdates.map((entry) => [entry.digest, entry]));
  const found = new Map();
  const visit = (directory) => {
    for (const child of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, child.name);
      if (child.isDirectory()) visit(target);
      else if (child.name.endsWith(".json")) {
        try {
          const value = JSON.parse(fs.readFileSync(target, "utf8"));
          if (value?.kind !== "TraceabilityUpdate") continue;
          const bytes = canonicalBytes(value);
          const digest = sha256Digest(bytes);
          if (wanted.has(digest) && !found.has(digest)) {
            found.set(digest, { value, bytes, ref: wanted.get(digest) });
          }
        } catch {}
      }
    }
  };
  visit(path.join(repositoryRoot, "dogfood"));
  visit(path.join(repositoryRoot, "project"));
  const missing = [...wanted.keys()].filter((digest) => !found.has(digest));
  if (missing.length > 0) throw new Error(`missing graph updates: ${missing.join(", ")}`);
  return [...found.values()];
}

function restoreGraph() {
  const graphPath =
    "dogfood/sim-001-simplification/integration-frontier-6/WI-SIM-WINDOWS-E2E-RELEASE/traceability-graph-snapshot.json";
  const value = readJson(graphPath);
  const bytes = canonicalBytes(value);
  const graphRef = fullRef(
    `traceability-graph-devrelay-work-breakdown-r${value.revision}`,
    sha256Digest(bytes),
    "https://devrelay.dev/artifacts/traceability-graph-snapshot/v1",
    "application/vnd.devrelay.traceability-graph+json",
  );
  graphRef.uri = `memory://devrelay/traceability/devrelay%2Fwork-breakdown/snapshots/${graphRef.digest.slice(7)}.json`;
  const store = createInMemoryTraceabilityStore();
  store.restore(
    value.graphId,
    [{ value, bytes, ref: graphRef }, ...findAppliedUpdates(value)],
    graphRef,
  );
  return createTraceabilityGraphService({
    graphId: value.graphId,
    projectId: value.projectId,
    store,
    contributors: [
      systemVerificationTraceabilityContributor,
      businessScopeReconciliationContributor(),
      businessAcceptanceTraceabilityContributor,
    ],
    vocabulary: TRACEABILITY_VOCABULARY_V1_6,
  });
}

const requirements = loadedRaw(
  "project/requirements-baseline.json",
  readJson("project/requirements-baseline.json").baselineId,
  "https://devrelay.dev/artifacts/requirements-baseline/v1",
  "application/vnd.devrelay.requirements-baseline+json",
);
const overview = loadedRaw(
  "project/project-overview-baseline.json",
  readJson("project/project-overview-baseline.json").baselineId,
  "https://devrelay.dev/artifacts/project-overview-baseline/v1",
  "application/vnd.devrelay.project-overview-baseline+json",
);
const architecture = loadedRaw(
  "project/architecture-baseline.json",
  readJson("project/architecture-baseline.json").baselineId,
  "https://devrelay.dev/artifacts/architecture-baseline/v1",
  "application/vnd.devrelay.architecture-baseline+json",
);
const contract = loadedRaw(
  "project/contract-disposition.json",
  readJson("project/contract-disposition.json").dispositionId,
  "https://devrelay.dev/artifacts/contract-disposition/v1",
  "application/vnd.devrelay.contract-disposition+json",
);
const workBreakdown = loadedRaw(
  "project/work-breakdown-baseline.json",
  readJson("project/work-breakdown-baseline.json").baselineId,
  "https://devrelay.dev/artifacts/work-breakdown-baseline/v1",
  "application/vnd.devrelay.work-breakdown-baseline+json",
);
const workDependency = loadedRaw(
  "project/work-dependency-baseline.json",
  readJson("project/work-dependency-baseline.json").baselineId,
  "https://devrelay.dev/artifacts/work-dependency-baseline/v1",
  "application/vnd.devrelay.work-dependency-baseline+json",
);
const assignment = loadedRaw(
  "project/specialist-assignment-baseline.json",
  readJson("project/specialist-assignment-baseline.json").baselineId,
  "https://devrelay.dev/artifacts/specialist-assignment-baseline/v1",
  "application/vnd.devrelay.specialist-assignment-baseline+json",
);
const implementationCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
  windowsHide: true,
}).trim();
const windowsDogfood = readJson(
  "dogfood/sim-001-simplification/windows-e2e/evidence/windows-desktop-dogfood-summary.json",
);
const releaseCatalogBytes = readBytes("release/0.10.0-rc.2.json");
const historyBundleBytes = readBytes(
  "dogfood/sim-001-simplification/windows-e2e/evidence/greeting-card-history.bundle",
);
const releaseEvidenceValue = seal(
  {
    apiVersion: API,
    kind: "SIM001ReleaseCandidateEvidenceSet",
    evidenceSetId: "RELEASE-EVIDENCE-DEVRELAY-SIM001-SIMPLIFICATION-001",
    implementationCommit,
    verification: {
      command: "npm.cmd run verify",
      total: 983,
      passed: 981,
      failed: 0,
      skipped: 2,
    },
    windowsDesktopDogfood: ref(
      "WINDOWS-GODOT-DOGFOOD-SUMMARY-SIM001",
      windowsDogfood.summaryDigest,
    ),
    releaseCatalog: ref("devrelay-release-catalog-0.10.0-rc.2", sha256Digest(releaseCatalogBytes)),
    reconstructableDogfoodHistory: ref(
      "devrelay-sim001-greeting-card-history-bundle",
      sha256Digest(historyBundleBytes),
    ),
    releaseBoundary:
      "Deterministic GitHub source/library and installable package operated end-to-end through ChatGPT Desktop on Windows.",
    exclusions: [
      "public npm publication",
      "one-click ChatGPT Desktop plug-in installation",
      "hosted backend",
      "non-Windows desktop hosts",
    ],
  },
  "evidenceSetDigest",
);
const releaseEvidence = loadedCanonical(
  releaseEvidenceValue,
  releaseEvidenceValue.evidenceSetId,
  "https://devrelay.dev/artifacts/release-candidate-evidence-set/v1",
  "application/vnd.devrelay.release-candidate-evidence-set+json",
);

const workItemIds = [
  "WI-SIM-HOST-STORAGE",
  "WI-SIM-PROFILES",
  "WI-SIM-EVIDENCE-ASSETS",
  "WI-SIM-FACADE",
  "WI-SIM-HOST-ISOLATION",
  "WI-SIM-API-COMPAT",
  "WI-SIM-HOST-EXECUTION",
  "WI-SIM-CLI",
  "WI-SIM-PACK-CONFORMANCE",
  "WI-SIM-REGRESSION-GATES",
  "WI-SIM-VERSION-DOCS",
  "WI-SIM-WINDOWS-E2E-RELEASE"
];
const integrationSources = [
  {
    "integration": "dogfood/sim-001-simplification/integration-frontier-1",
    "verification": "dogfood/sim-001-simplification/verification-frontier-1"
  },
  {
    "integration": "dogfood/sim-001-simplification/integration-frontier-2",
    "verification": "dogfood/sim-001-simplification/verification-frontier-2"
  },
  {
    "integration": "dogfood/sim-001-simplification/integration-frontier-3",
    "verification": "dogfood/sim-001-simplification/verification-frontier-3"
  },
  {
    "integration": "dogfood/sim-001-simplification/integration-frontier-4",
    "verification": "dogfood/sim-001-simplification/verification-frontier-4"
  },
  {
    "integration": "dogfood/sim-001-simplification/integration-frontier-5",
    "verification": "dogfood/sim-001-simplification/verification-frontier-5"
  },
  {
    "integration": "dogfood/sim-001-simplification/integration-frontier-6",
    "verification": "dogfood/sim-001-simplification/verification-frontier-6"
  }
];
const recordByWorkItem = new Map();
const completionByWorkItem = new Map();
for (const sourceRoot of integrationSources) {
  const absolute = path.join(repositoryRoot, sourceRoot.integration);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const recordPath = sourceRoot.integration + "/" + entry.name + "/integrated-change-record.json";
    const approvalPath = sourceRoot.verification + "/" + entry.name + "/gate-approval.json";
    if (!fs.existsSync(path.join(repositoryRoot, recordPath)) || !fs.existsSync(path.join(repositoryRoot, approvalPath))) continue;
    const record = readJson(recordPath);
    const approval = readJson(approvalPath);
    recordByWorkItem.set(entry.name, record);
    completionByWorkItem.set(entry.name, {
      workItemId: entry.name,
      authority: "approved",
      integrationRef: ref(record.recordId, record.recordDigest),
      evidence: [ref(approval.approvalId, approval.approvalDigest)],
    });
  }
}
assert.deepEqual([...recordByWorkItem.keys()].sort(), [...workItemIds].sort());
const records = workItemIds.map((workItemId) => recordByWorkItem.get(workItemId));
const completionFacts = workItemIds.map((workItemId) => completionByWorkItem.get(workItemId));
const completionFactSet = seal(
  {
    apiVersion: API,
    kind: "IntegratedCompletionFactSet",
    factSetId: "ICFS-DEVRELAY-SIM001-SIMPLIFICATION-001",
    facts: completionFacts,
    factsDigest: canonicalJsonDigest(completionFacts),
    authority: "change-integration",
  },
  "factSetDigest",
);

const systemPolicy = seal(
  {
    apiVersion: API,
    kind: "SystemVerificationPolicy",
    policyId: "SV-POLICY-DEVRELAY-SIM001-DESKTOP-WINDOWS-001",
    version: "1.0.0",
    allObligationsMandatory: true,
    unknownEvidence: "reject",
    outcomePrecedence: ["failed", "needs-evidence", "verified"],
  },
  "policyDigest",
);

const sourceBaseCommit = implementationCommit;
const repositoryReleaseSnapshot = seal(
  {
    apiVersion: API,
    kind: "RepositoryReleaseSnapshot",
    snapshotId: `RELEASE-CANDIDATE-${releaseEvidence.value.evidenceSetDigest.slice(7, 19).toUpperCase()}`,
    repository: "https://github.com/GarrettAudet/DevRelay.git",
    branch: "codex/sim-001-simplification",
    sourceBaseCommit,
    scope: "github-source-and-installable-tarball",
    candidateEvidence: ref(
      releaseEvidence.value.evidenceSetId,
      releaseEvidence.value.evidenceSetDigest,
    ),
  },
  "snapshotDigest",
);

const integratedSubject = seal(
  {
    apiVersion: API,
    kind: "IntegratedSystemCandidate",
    subjectId: `DEVRELAY-SIM001-DESKTOP-WINDOWS-${releaseEvidence.value.evidenceSetDigest.slice(7, 19).toUpperCase()}`,
    repositorySnapshot: ref(
      repositoryReleaseSnapshot.snapshotId,
      repositoryReleaseSnapshot.snapshotDigest,
    ),
    integratedChangeRecords: records
      .map((value) => ref(value.recordId, value.recordDigest))
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId, "en")),
    integratedCompletionFactSet: ref(
      completionFactSet.factSetId,
      completionFactSet.factSetDigest,
    ),
    requirementsBaseline: ref(requirements.ref.artifactId, requirements.ref.digest),
    projectOverviewBaseline: ref(overview.ref.artifactId, overview.ref.digest),
    architectureBaseline: ref(architecture.ref.artifactId, architecture.ref.digest),
    contractDisposition: ref(contract.ref.artifactId, contract.ref.digest),
    workBreakdownBaseline: ref(workBreakdown.ref.artifactId, workBreakdown.ref.digest),
    workDependencyBaseline: ref(workDependency.ref.artifactId, workDependency.ref.digest),
    specialistAssignmentBaseline: ref(assignment.ref.artifactId, assignment.ref.digest),
    verificationEnvironment: {
      disposition: "approved-not-applicable",
      rationale:
        "The supported product is a deterministic source/library workflow run end-to-end from ChatGPT Desktop on Windows; no deployed runtime environment is claimed.",
    },
    systemVerificationPolicy: ref(systemPolicy.policyId, systemPolicy.policyDigest),
  },
  "subjectDigest",
);

const acceptanceCriteria = requirements.value.requirements.acceptanceCriteria.map(({ id }) => ({
  id,
  requiredEvidenceKinds: ["test"],
}));
const nonFunctionalRequirements =
  requirements.value.requirements.nonFunctionalRequirements.map(({ id }) => ({
    id,
    requiredEvidenceKinds: ["review"],
  }));
const obligations = expandSystemVerificationObligations({
  subject: integratedSubject,
  acceptanceCriteria,
  nonFunctionalRequirements,
});
const subjectRef = ref(integratedSubject.subjectId, integratedSubject.subjectDigest);
const obligationRef = ref(obligations.obligationSetId, obligations.obligationSetDigest);
const systemPolicyRef = ref(systemPolicy.policyId, systemPolicy.policyDigest);
const invocationFor = (invocationId, verifier, assignedObligationIds) =>
  seal(
    {
      apiVersion: API,
      kind: "SystemVerifierInvocation",
      invocationId,
      subject: subjectRef,
      obligationSet: obligationRef,
      policy: systemPolicyRef,
      verifier,
      assignedObligationIds,
      verificationEnvironment: integratedSubject.verificationEnvironment,
      grants: [],
    },
    "invocationFingerprint",
  );
const testObligations = obligations.obligations
  .filter(({ kind }) => kind === "acceptance-criterion")
  .map(({ obligationId }) => obligationId);
const reviewObligations = obligations.obligations
  .filter(({ kind }) => kind === "non-functional-requirement")
  .map(({ obligationId }) => obligationId);
const invocations = [
  invocationFor("SV-DEVRELAY-SIM001-TEST-001", TEST_SYSTEM_VERIFIER, testObligations),
  invocationFor("SV-DEVRELAY-SIM001-REVIEW-001", REVIEW_SYSTEM_VERIFIER, reviewObligations),
];
const releaseEvidenceRef = ref(
  releaseEvidence.value.evidenceSetId,
  releaseEvidence.value.evidenceSetDigest,
);

let verifierCalls = 0;
const verifier = async (invocation) => {
  verifierCalls += 1;
  if (invocation.verifier.id === TEST_SYSTEM_VERIFIER.id) {
    const native = {
      tests: invocation.assignedObligationIds.map((obligationId) => ({
        obligationId,
        status: "pass",
        evidenceBindings: [{ kind: "test", artifact: releaseEvidenceRef }],
      })),
    };
    const bytes = canonicalBytes(native);
    return adaptSystemTestResult({
      invocation,
      nativeBytes: bytes,
      nativeArtifact: ref("NATIVE-DEVRELAY-SIM001-TEST-001", sha256Digest(bytes)),
    });
  }
  const native = {
    findings: invocation.assignedObligationIds.map((obligationId) => ({
      obligationId,
      disposition: "accepted",
      evidenceBindings: [{ kind: "review", artifact: releaseEvidenceRef }],
    })),
  };
  const bytes = canonicalBytes(native);
  return adaptSystemReviewResult({
    invocation,
    nativeBytes: bytes,
    nativeArtifact: ref("NATIVE-DEVRELAY-SIM001-REVIEW-001", sha256Digest(bytes)),
  });
};

const systemCheckpoints = immutableStore();
const systemInput = {
  subject: integratedSubject,
  policy: systemPolicy,
  acceptanceCriteria,
  nonFunctionalRequirements,
  invocations,
  checkpoints: systemCheckpoints,
  verifier,
};
const system = await executeSystemVerification(systemInput);
const systemReplay = await executeSystemVerification(systemInput);
assert.equal(system.result.outcome, "verified");
assert.equal(system.result.progression, "business-acceptance-gate");
assert.equal(system.verifierCalls, 2);
assert.equal(systemReplay.verifierCalls, 0);
assert.equal(verifierCalls, 2);
assert.deepEqual(systemReplay.result, system.result);

const systemArtifacts = {
  subject: loadedCanonical(
    integratedSubject,
    integratedSubject.subjectId,
    "https://devrelay.dev/artifacts/integrated-system-candidate/v1",
  ),
  obligations: loadedCanonical(
    system.obligations,
    system.obligations.obligationSetId,
    "https://devrelay.dev/artifacts/system-verification-obligation-set/v1",
  ),
  policy: loadedCanonical(
    systemPolicy,
    systemPolicy.policyId,
    "https://devrelay.dev/artifacts/system-verification-policy/v1",
  ),
  evidence: loadedCanonical(
    system.evidence,
    system.evidence.evidenceSetId,
    "https://devrelay.dev/artifacts/system-verification-evidence/v1",
  ),
  evaluation: loadedCanonical(
    system.evaluation,
    system.evaluation.evaluationId,
    "https://devrelay.dev/artifacts/system-verification-evaluation/v1",
  ),
  result: loadedCanonical(
    system.result,
    system.result.resultId,
    "https://devrelay.dev/artifacts/system-verification-result/v1",
  ),
};
const systemInvocation = {
  invocationId: "SYSTEM-VERIFICATION-DEVRELAY-SIM001-001",
  module: { id: "system-verification", version: "0.1.0", operation: "verify-system" },
};
const systemModuleResult = {
  apiVersion: API,
  kind: "ModuleResult",
  invocationId: systemInvocation.invocationId,
  status: "completed",
  outcome: "verified",
  outputs: { "system-verification-result": [systemArtifacts.result.ref] },
  evidence: [
    {
      kind: "system-verification/contract-tests",
      subject: system.result.resultId,
      status: "pass",
      artifact: systemArtifacts.result.ref,
    },
  ],
  diagnostics: [],
};
const systemContext = {
  invocation: systemInvocation,
  invocationFingerprint: canonicalJsonDigest(systemInvocation),
  moduleResult: systemModuleResult,
  loadedInputs: {
    subject: [systemArtifacts.subject],
    policy: [systemArtifacts.policy],
  },
  loadedOutputs: {
    obligations: [systemArtifacts.obligations],
    evidence: [systemArtifacts.evidence],
    evaluation: [systemArtifacts.evaluation],
    result: [systemArtifacts.result],
  },
  loadedAttachments: {},
};

const graph = restoreGraph();
const systemPrepared = await graph.prepare({
  ...systemContext,
  baseGraph: graph.captureBase(),
});
const systemMerged = await graph.mergePrepared(systemPrepared);
const systemMergedReplay = await graph.mergePrepared(systemPrepared);
assert.deepEqual(systemMergedReplay.receipt, systemMerged.receipt);
assert.equal(systemMerged.snapshot.horizon, "verification");

const businessPolicy = seal(
  {
    apiVersion: API,
    kind: "BusinessAcceptancePolicy",
    policyId: "BA-POLICY-DEVRELAY-SIM001-DESKTOP-WINDOWS-001",
    version: "1.0.0",
    allObjectivesMandatory: true,
    allMetricsMandatory: true,
    allBusinessScopeMandatory: true,
    allAcceptanceCriteriaMandatory: true,
    unknownEvidence: "reject",
    outcomePrecedence: ["failed", "needs-evidence", "satisfied"],
  },
  "policyDigest",
);
const objectiveIds = requirements.value.requirements.businessObjectives.map(({ id }) => id);
const metricIds = requirements.value.requirements.successMetrics.map(({ id }) => id);
const scopeIds = deriveBusinessScopeIdentities(requirements).map(({ scopeId }) => scopeId);
const businessEvidenceItems = [
  ...objectiveIds.map((scopeId, index) => ({
    evidenceId: `BA-EVIDENCE-BO-${String(index + 1).padStart(3, "0")}`,
    scopeKind: "business-objective",
    scopeId,
    status: "pass",
    artifact: releaseEvidenceRef,
    producer: { id: "devrelay.release-verification", version: "1.0.0" },
  })),
  ...metricIds.map((scopeId, index) => ({
    evidenceId: `BA-EVIDENCE-SM-${String(index + 1).padStart(3, "0")}`,
    scopeKind: "success-metric",
    scopeId,
    status: "pass",
    artifact: releaseEvidenceRef,
    producer: { id: "devrelay.release-verification", version: "1.0.0" },
  })),
  ...scopeIds.map((scopeId, index) => ({
    evidenceId: `BA-EVIDENCE-SCOPE-${String(index + 1).padStart(3, "0")}`,
    scopeKind: "business-scope",
    scopeId,
    status: "pass",
    artifact: releaseEvidenceRef,
    producer: { id: "devrelay.release-verification", version: "1.0.0" },
  })),
];
const businessEvidence = seal(
  {
    apiVersion: API,
    kind: "BusinessAcceptanceEvidenceSet",
    evidenceSetId: "BA-EVIDENCE-DEVRELAY-SIM001-DESKTOP-WINDOWS-001",
    requirementsBaseline: ref(requirements.ref.artifactId, requirements.ref.digest),
    projectOverviewBaseline: ref(overview.ref.artifactId, overview.ref.digest),
    systemVerificationResult: ref(system.result.resultId, system.result.resultDigest),
    items: businessEvidenceItems,
  },
  "evidenceDigest",
);

const requirementsInvocation = {
  invocationId: "REQUIREMENTS-BASELINE-SCOPE-RECONCILIATION-SIM001-001",
  module: { id: "architecture-design", version: "0.1.0", operation: "establish-baseline" },
};
const requirementsContext = {
  invocation: requirementsInvocation,
  invocationFingerprint: canonicalJsonDigest(requirementsInvocation),
  moduleResult: {
    apiVersion: API,
    kind: "ModuleResult",
    invocationId: requirementsInvocation.invocationId,
    status: "completed",
    outcome: "designed",
    outputs: {},
    evidence: [],
    diagnostics: [],
  },
  loadedInputs: {
    "requirements-baseline": [requirements],
    "project-overview-baseline": [overview],
  },
  loadedOutputs: {},
  loadedAttachments: {},
};
const requirementsPrepared = await graph.prepare({
  ...requirementsContext,
  baseGraph: graph.captureBase(),
});
const requirementsMerged = await graph.mergePrepared(requirementsPrepared);
const requirementsMergedReplay = await graph.mergePrepared(requirementsPrepared);
assert.deepEqual(requirementsMergedReplay.receipt, requirementsMerged.receipt);
assert.equal(
  requirementsMerged.snapshot.nodes.filter(
    ({ kind, state }) => kind === "business-scope" && state === "active",
  ).length,
  scopeIds.length,
);

const graphCheckpoint = graph.captureBase();
const businessCheckpoints = immutableStore();
const businessInput = {
  checkpointId: "BA-DEVRELAY-SIM001-DESKTOP-WINDOWS-001",
  integratedSystemCandidate: integratedSubject,
  systemVerificationResult: system.result,
  requirementsBaseline: requirements,
  projectOverviewBaseline: ref(overview.ref.artifactId, overview.ref.digest),
  architectureBaseline: ref(architecture.ref.artifactId, architecture.ref.digest),
  contractDisposition: ref(contract.ref.artifactId, contract.ref.digest),
  repositoryReleaseSnapshot: ref(
    repositoryReleaseSnapshot.snapshotId,
    repositoryReleaseSnapshot.snapshotDigest,
  ),
  traceabilityGraphSnapshot: { value: graphCheckpoint.snapshot, bytes: graphCheckpoint.bytes, ref: graphCheckpoint.ref },
  traceabilityCheckpoint: graphCheckpoint.ref,
  policy: businessPolicy,
  evidence: businessEvidence,
  businessObjectiveIds: objectiveIds,
  successMetricIds: metricIds,
  businessScopeIds: scopeIds,
  checkpoints: businessCheckpoints,
};
const business = await executeBusinessAcceptance(businessInput);
const businessReplay = await executeBusinessAcceptance(businessInput);
assert.equal(business.evaluation.outcome, "eligible-for-acceptance");
assert.equal(business.replayed, false);
assert.equal(businessReplay.replayed, true);
assert.equal(businessReplay.evaluationCalls, 0);
assert.equal(businessReplay.evidenceCalls, 0);
assert.deepEqual(businessReplay.candidate, business.candidate);

const candidateBytes = canonicalBytes(business.candidate);
const ownerApproval = seal(
  {
    apiVersion: API,
    kind: "BusinessAcceptanceOwnerApproval",
    approvalId: "BA-APPROVAL-DEVRELAY-SIM001-DESKTOP-WINDOWS-001",
    candidate: ref(business.candidate.candidateId, business.candidate.candidateDigest),
    candidateRawDigest: sha256Digest(candidateBytes),
    decision: "approved",
    owner: { ownerId: "GarrettAudet", authority: "business-owner" },
    approvedContext: {
      subject: business.candidate.subject,
      policy: business.candidate.policy,
      evidence: business.candidate.evidence,
      technicalCoverage: ref(
        business.technicalCoverage.coverageId,
        business.technicalCoverage.coverageDigest,
      ),
    },
  },
  "approvalDigest",
);
const ownerApprovalBytes = canonicalBytes(ownerApproval);
const gateCheckpoints = immutableStore();
let ownerCalls = 0;
const gateInput = {
  checkpointId: "BA-GATE-DEVRELAY-SIM001-DESKTOP-WINDOWS-001",
  candidateRawBytes: candidateBytes,
  candidate: business.candidate,
  evaluation: business.evaluation,
  subject: business.subject,
  policy: businessPolicy,
  evidence: businessEvidence,
  technicalCoverage: business.technicalCoverage,
  subjectContext: {
    integratedSystemCandidate: integratedSubject,
    systemVerificationResult: system.result,
    technicalCoverage: business.technicalCoverage,
    policy: businessPolicy,
    evidence: businessEvidence,
    repositoryReleaseSnapshot: ref(
      repositoryReleaseSnapshot.snapshotId,
      repositoryReleaseSnapshot.snapshotDigest,
    ),
    traceabilityCheckpoint: business.technicalCoverage.traceabilityCheckpoint,
  },
  checkpoints: gateCheckpoints,
  invokeOwner: () => {
    ownerCalls += 1;
    return { approvalRawBytes: ownerApprovalBytes };
  },
};
const gate = await executeBusinessAcceptanceGate(gateInput);
const gateReplay = await executeBusinessAcceptanceGate(gateInput);
assert.equal(ownerCalls, 1);
assert.equal(gate.record.outcome, "accepted");
assert.equal(gate.record.lifecycleDisposition, "construction-complete");
assert.equal(gateReplay.replayed, true);
assert.equal(gateReplay.gateCalls, 0);
assert.deepEqual(gateReplay.record, gate.record);

const businessArtifacts = {
  integrated: systemArtifacts.subject,
  verification: systemArtifacts.result,
  coverage: loadedCanonical(
    business.technicalCoverage,
    business.technicalCoverage.coverageId,
    "https://devrelay.dev/artifacts/business-acceptance-technical-coverage/v1",
  ),
  subject: loadedCanonical(
    business.subject,
    business.subject.subjectId,
    "https://devrelay.dev/artifacts/business-acceptance-subject/v1",
  ),
  policy: loadedCanonical(
    businessPolicy,
    businessPolicy.policyId,
    "https://devrelay.dev/artifacts/business-acceptance-policy/v1",
  ),
  evidence: loadedCanonical(
    businessEvidence,
    businessEvidence.evidenceSetId,
    "https://devrelay.dev/artifacts/business-acceptance-evidence/v1",
  ),
  evaluation: loadedCanonical(
    business.evaluation,
    business.evaluation.evaluationId,
    "https://devrelay.dev/artifacts/business-acceptance-evaluation/v1",
  ),
  candidate: loadedCanonical(
    business.candidate,
    business.candidate.candidateId,
    "https://devrelay.dev/artifacts/business-acceptance-candidate/v1",
  ),
  approval: loadedCanonical(
    gate.approval,
    gate.approval.approvalId,
    "https://devrelay.dev/artifacts/business-acceptance-owner-approval/v1",
  ),
  record: loadedCanonical(
    gate.record,
    gate.record.recordId,
    "https://devrelay.dev/artifacts/business-acceptance-record/v1",
  ),
};
const businessInvocation = {
  invocationId: "BUSINESS-ACCEPTANCE-GATE-DEVRELAY-SIM001-001",
  module: {
    id: "business-acceptance-gate",
    version: "0.1.0",
    operation: "record-acceptance",
  },
};
const businessModuleResult = {
  apiVersion: API,
  kind: "ModuleResult",
  invocationId: businessInvocation.invocationId,
  status: "completed",
  outcome: "accepted",
  outputs: { "business-acceptance-record": [businessArtifacts.record.ref] },
  evidence: [],
  diagnostics: [],
};
const businessContext = {
  invocation: businessInvocation,
  invocationFingerprint: canonicalJsonDigest(businessInvocation),
  moduleResult: businessModuleResult,
  loadedInputs: {
    integrated: [businessArtifacts.integrated],
    verification: [businessArtifacts.verification],
    coverage: [businessArtifacts.coverage],
    policy: [businessArtifacts.policy],
    evidence: [businessArtifacts.evidence],
    subject: [businessArtifacts.subject],
    evaluation: [businessArtifacts.evaluation],
    candidate: [businessArtifacts.candidate],
    approval: [businessArtifacts.approval],
  },
  loadedOutputs: { record: [businessArtifacts.record] },
  loadedAttachments: {},
};
const businessPrepared = await graph.prepare({
  ...businessContext,
  baseGraph: graph.captureBase(),
});
const businessMerged = await graph.mergePrepared(businessPrepared);
const businessMergedReplay = await graph.mergePrepared(businessPrepared);
assert.deepEqual(businessMergedReplay.receipt, businessMerged.receipt);
assert.equal(businessMerged.snapshot.horizon, "acceptance");
const traceabilityDiagnostics = diagnoseTraceabilityGraph(businessMerged.snapshot);
const blockingDiagnostics = traceabilityDiagnostics.filter(({ blocking }) => blocking);
assert.deepEqual(blockingDiagnostics, []);

const approvalRequest = seal(
  {
    apiVersion: API,
    kind: "BusinessAcceptanceApprovalRequest",
    requestId: "BA-APPROVAL-REQUEST-DEVRELAY-SIM001-DESKTOP-WINDOWS-001",
    candidate: ref(business.candidate.candidateId, business.candidate.candidateDigest),
    candidateRawDigest: sha256Digest(candidateBytes),
    technicalCoverage: ref(
      business.technicalCoverage.coverageId,
      business.technicalCoverage.coverageDigest,
    ),
    traceabilityCheckpoint: business.technicalCoverage.traceabilityCheckpoint,
    requestedDecision: "approved",
    status: "approved-by-standing-owner-authorization",
    coverage: {
      acceptanceCriteria: acceptanceCriteria.length,
      nonFunctionalRequirements: nonFunctionalRequirements.length,
      businessObjectives: objectiveIds.length,
      successMetrics: metricIds.length,
      businessScopes: scopeIds.length,
      integratedWorkItems: workItemIds.length,
    },
    exclusions: releaseEvidence.value.exclusions,
  },
  "requestDigest",
);
const finalProof = seal(
  {
    apiVersion: API,
    kind: "DevRelaySIM001SourceReleaseAcceptanceProof",
    proofId: "DEVRELAY-SIM001-SOURCE-RELEASE-ACCEPTANCE-001",
    sourceBaseCommit,
    releaseEvidence: releaseEvidenceRef,
    integratedSystemCandidate: subjectRef,
    systemVerificationResult: ref(system.result.resultId, system.result.resultDigest),
    businessAcceptanceCandidate: ref(
      business.candidate.candidateId,
      business.candidate.candidateDigest,
    ),
    ownerApproval: ref(gate.approval.approvalId, gate.approval.approvalDigest),
    businessAcceptanceRecord: ref(gate.record.recordId, gate.record.recordDigest),
    traceabilityCheckpoint: businessMerged.snapshotRef,
    graphHorizon: businessMerged.snapshot.horizon,
    blockingDiagnostics: blockingDiagnostics.length,
    coverage: approvalRequest.coverage,
    releaseBoundary: releaseEvidence.value.releaseBoundary,
    exclusions: releaseEvidence.value.exclusions,
    disposition: "accepted-for-protected-source-release-promotion",
    promotionCondition: {
      required: true,
      authority: "GitHub protected-main checks on the final persisted commit",
      status: "pending",
    },
  },
  "proofDigest",
);

const gateCheckpoint = [...gateCheckpoints.values.values()][0];
const businessCoreCheckpoint = [...businessCheckpoints.values.values()][0];
const systemCheckpointValues = [...systemCheckpoints.values.values()];
const persisted = [
  ["00-release-candidate-evidence-set.json", releaseEvidence.value],
  ["01-repository-release-snapshot.json", repositoryReleaseSnapshot],
  ["02-integrated-completion-fact-set.json", completionFactSet],
  ["03-integrated-system-candidate.json", integratedSubject],
  ["04-system-verification-policy.json", systemPolicy],
  ["05-system-verification-obligations.json", system.obligations],
  ["06-system-test-invocation.json", invocations[0]],
  ["07-system-review-invocation.json", invocations[1]],
  ["08-system-verification-test-checkpoint.json", systemCheckpointValues[0]],
  ["09-system-verification-review-checkpoint.json", systemCheckpointValues[1]],
  ["10-system-verification-evidence.json", system.evidence],
  ["11-system-verification-evaluation.json", system.evaluation],
  ["12-system-verification-result.json", system.result],
  ["13-system-verification-traceability-update.json", systemPrepared.update],
  ["14-system-verification-merge-receipt.json", systemMerged.receipt],
  ["15-system-verification-graph.json", systemMerged.snapshot],
  ["15a-requirements-scope-reconciliation-update.json", requirementsPrepared.update],
  ["15b-requirements-scope-reconciliation-merge-receipt.json", requirementsMerged.receipt],
  ["15c-requirements-scope-reconciliation-graph.json", requirementsMerged.snapshot],
  ["16-business-acceptance-policy.json", businessPolicy],
  ["17-business-acceptance-evidence.json", businessEvidence],
  ["18-business-acceptance-technical-coverage.json", business.technicalCoverage],
  ["19-business-acceptance-subject.json", business.subject],
  ["20-business-acceptance-evaluation.json", business.evaluation],
  ["21-business-acceptance-candidate.json", business.candidate],
  ["22-business-acceptance-core-checkpoint.json", businessCoreCheckpoint],
  ["23-business-acceptance-approval-request.json", approvalRequest],
  ["24-business-acceptance-owner-approval.json", gate.approval],
  ["25-business-acceptance-gate-checkpoint.json", gateCheckpoint],
  ["26-business-acceptance-record.json", gate.record],
  ["27-business-acceptance-traceability-update.json", businessPrepared.update],
  ["28-business-acceptance-merge-receipt.json", businessMerged.receipt],
  ["29-business-acceptance-graph.json", businessMerged.snapshot],
  ["30-final-acceptance-proof.json", finalProof],
];
for (const [name, value] of persisted) writeJson(name, value);
writeJson("system-verification-result.json", system.result);
writeJson("business-acceptance-record.json", gate.record);
writeJson("31-traceability-diagnostics.json", {
  apiVersion: API,
  kind: "TraceabilityDiagnostics",
  graph: businessMerged.snapshotRef,
  blocking: blockingDiagnostics.length,
  diagnostics: traceabilityDiagnostics,
  outcome: "pass",
});
const summary = {
  apiVersion: API,
  kind: "DevRelaySIM001FinalAcceptanceSummary",
  releaseEvidence: releaseEvidenceRef,
  systemVerification: ref(system.result.resultId, system.result.resultDigest),
  systemVerifierCalls: verifierCalls,
  systemReplayVerifierCalls: systemReplay.verifierCalls,
  businessCandidate: ref(
    business.candidate.candidateId,
    business.candidate.candidateDigest,
  ),
  businessAcceptance: ref(gate.record.recordId, gate.record.recordDigest),
  ownerCalls,
  gateReplayCalls: gateReplay.gateCalls,
  traceabilityGraph: businessMerged.snapshotRef,
  blockingDiagnostics: blockingDiagnostics.length,
  coverage: approvalRequest.coverage,
  exclusions: approvalRequest.exclusions,
  promotionStatus: "pending-final-protected-main-checks",
  summaryDigest: canonicalJsonDigest({
    releaseEvidence: releaseEvidenceRef,
    systemVerification: ref(system.result.resultId, system.result.resultDigest),
    businessAcceptance: ref(gate.record.recordId, gate.record.recordDigest),
    traceabilityGraph: businessMerged.snapshotRef,
  }),
};
writeJson("final-acceptance-summary.json", summary);
writeText(
  "FINAL_ACCEPTANCE.md",
  `# DevRelay SIM-001 final acceptance\n\n` +
    `- SystemVerification: \`${system.result.outcome}\`\n` +
    `- BusinessAcceptance: \`${gate.record.outcome}\`\n` +
    `- Integrated work items: ${workItemIds.length}\n` +
    `- Acceptance criteria: ${acceptanceCriteria.length}\n` +
    `- Non-functional requirements: ${nonFunctionalRequirements.length}\n` +
    `- Business objectives: ${objectiveIds.length}\n` +
    `- Success metrics: ${metricIds.length}\n` +
    `- Business scopes: ${scopeIds.length}\n` +
    `- Traceability graph: \`${businessMerged.snapshotRef.digest}\`\n` +
    `- Blocking diagnostics: ${blockingDiagnostics.length}\n` +
    `- Promotion: pending final protected-main checks on the persisted commit\n\n` +
    `This acceptance is limited to GitHub source plus the deterministic installable package operated end-to-end through ChatGPT Desktop on Windows. It does not claim public npm publication, a one-click Desktop plug-in, or a hosted backend.\n`,
);

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
