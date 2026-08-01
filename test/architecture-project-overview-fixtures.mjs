import { canonicalJsonDigest, sha256Digest } from "../src/content-digest.mjs";
import { normativeRequirementIds } from "../src/requirements-artifact-validator.mjs";
import {
  PROJECT_OVERVIEW_DOCUMENT,
  PROJECT_OVERVIEW_PROJECTION,
  PROJECT_OVERVIEW_RENDERER,
  deriveProjectOverview,
  renderProjectOverviewMarkdownBytes,
} from "../src/project-overview.mjs";

export const PROJECT_OVERVIEW_BASELINE_SCHEMA =
  "https://devrelay.dev/artifacts/project-overview-baseline/v1";
export const PROJECT_OVERVIEW_BASELINE_MEDIA_TYPE =
  "application/vnd.devrelay.project-overview-baseline+json";

export const STATIC_PROJECT_OVERVIEW_BASELINE_REF = Object.freeze({
  artifactId: "project-overview-baseline-architecture-test",
  schema: PROJECT_OVERVIEW_BASELINE_SCHEMA,
  mediaType: PROJECT_OVERVIEW_BASELINE_MEDIA_TYPE,
  digest: `sha256:${"9".repeat(64)}`,
  uri: "artifact://architecture-test/project-overview-baseline",
});

function minimalPointer(ref) {
  return {
    artifactId: ref.artifactId,
    digest: ref.digest,
  };
}

function insertBaseInput(baseInputs, ref) {
  if (!Array.isArray(baseInputs)) {
    return;
  }
  const existing = baseInputs.find(
    ({ role }) => role === "project-overview-baseline",
  );
  if (existing) {
    existing.artifact = structuredClone(ref);
    return;
  }
  const index = baseInputs.findIndex(
    ({ role }) => role === "requirements-baseline",
  );
  baseInputs.splice(index + 1, 0, {
    role: "project-overview-baseline",
    artifact: structuredClone(ref),
  });
}

export function augmentArchitectureArtifactOverview(artifact, ref) {
  const existing =
    artifact?.projectOverviewBaseline ??
    artifact?.targetProjectOverviewBaseline ??
    artifact?.baseInputs?.find(
      ({ role }) => role === "project-overview-baseline",
    )?.artifact;
  const selected = ref ?? existing ?? STATIC_PROJECT_OVERVIEW_BASELINE_REF;
  switch (artifact?.kind) {
    case "ProjectArchitectureState":
    case "ArchitectureBaseline":
    case "ArchitectureDraft":
      artifact.projectOverviewBaseline = structuredClone(selected);
      break;
    case "ArchitectureChangeSetDraft":
      artifact.targetProjectOverviewBaseline = structuredClone(selected);
      break;
  }
  insertBaseInput(artifact?.baseInputs, selected);
  return artifact;
}

export function augmentArchitectureInvocationOverview(invocation, ref) {
  const selected =
    ref ??
    invocation.inputs?.["project-overview-baseline"]?.[0] ??
    STATIC_PROJECT_OVERVIEW_BASELINE_REF;
  invocation.inputs["project-overview-baseline"] = [
    structuredClone(selected),
  ];
  return invocation;
}

function replaceRequirementIdentity(value, from, to) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === from) {
        value[index] = to;
      } else {
        replaceRequirementIdentity(value[index], from, to);
      }
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      replaceRequirementIdentity(child, from, to);
    }
  }
}

export function alignArchitectureRequirements(
  artifact,
  requirementsBaseline,
) {
  if (!JSON.stringify(artifact).includes("REQ-AUTH-001")) {
    return artifact;
  }
  const approved = normativeRequirementIds(requirementsBaseline.requirements);
  if (approved.length === 0) {
    throw new Error("architecture test fixture requires a normative requirement");
  }
  replaceRequirementIdentity(artifact, "REQ-AUTH-001", approved[0]);
  const sectionSets = [artifact?.sections, artifact];
  for (const sections of sectionSets) {
    const model = sections?.architectureModel;
    const diagrams = sections?.diagrams;
    if (
      model?.mode === "embedded" &&
      diagrams?.mode === "embedded"
    ) {
      diagrams.content.architectureModelDigest = canonicalJsonDigest(
        model.content,
      );
    }
  }
  if (Array.isArray(artifact?.traceability) && artifact.traceability.length > 0) {
    const primary = artifact.traceability[0];
    primary.requirementId = approved[0];
    artifact.traceability = [
      primary,
      ...approved.slice(1).map((requirementId) => ({
        requirementId,
        disposition: "no-architecture-impact",
        targets: [],
        rationale:
          "The focused fixture records no additional architecture impact for this requirement.",
      })),
    ];
  }
  return artifact;
}

export function alignArchitectureChangeDigests(changeSet, baseline) {
  const collections = [
    ["elementChanges", "architectureModel", "elements"],
    ["relationshipChanges", "architectureModel", "relationships"],
    ["viewChanges", "diagrams", "views"],
    ["interfaceChanges", "interfaceIntent", "interfaces"],
    ["constraintChanges", "architectureConstraints", "constraints"],
    ["decisionChanges", "decisionRecords", "decisions"],
  ];
  for (const [changesField, sectionField, entitiesField] of collections) {
    const baseEntities =
      baseline.sections[sectionField].content[entitiesField];
    const targetEntities =
      changeSet.sections[sectionField].content[entitiesField];
    for (const change of changeSet.changes[changesField]) {
      const base = baseEntities.find(({ id }) => id === change.entityId);
      const target = targetEntities.find(({ id }) => id === change.entityId);
      if (change.operation !== "add") {
        change.expectedBaseDigest = canonicalJsonDigest(base);
      }
      if (change.operation !== "remove") {
        change.targetDigest = canonicalJsonDigest(target);
      }
    }
  }
  return changeSet;
}

export function createProjectOverviewBaselineFixture({
  requirementsBaseline,
  requirementsBaselineRef,
  baselineId = "project-overview-baseline-architecture-runtime",
}) {
  const overview = deriveProjectOverview(requirementsBaseline.requirements);
  const documentBytes = renderProjectOverviewMarkdownBytes(overview);
  const documentRef = {
    artifactId: `${baselineId}-markdown`,
    digest: sha256Digest(documentBytes),
  };
  const seedDigest = sha256Digest(
    Buffer.from(`${baselineId}\n`, "utf8"),
  );
  return {
    documentBytes,
    documentRef,
    value: {
      apiVersion: "devrelay.dev/v1alpha1",
      kind: "ProjectOverviewBaseline",
      baselineId,
      version: "1.0.0",
      approvedOverviewCandidate: {
        artifactId: `${baselineId}-approved-candidate`,
        digest: seedDigest,
      },
      requirementsBaseline: minimalPointer(requirementsBaselineRef),
      projection: structuredClone(PROJECT_OVERVIEW_PROJECTION),
      overview,
      renderedDocument: {
        path: PROJECT_OVERVIEW_DOCUMENT.path,
        schema: PROJECT_OVERVIEW_DOCUMENT.schema,
        mediaType: PROJECT_OVERVIEW_DOCUMENT.mediaType,
        artifact: documentRef,
        renderer: structuredClone(PROJECT_OVERVIEW_RENDERER),
      },
      approvalEvidence: [
        {
          artifactId: `${baselineId}-approval-evidence`,
          digest: seedDigest,
        },
      ],
    },
  };
}
