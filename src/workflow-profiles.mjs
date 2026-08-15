import { canonicalJsonDigest } from "./content-digest.mjs";

export class WorkflowProfileError extends Error {
  constructor(message, code = "DR4900") {
    super(`workflow profile: ${message}`);
    this.name = "WorkflowProfileError";
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new WorkflowProfileError(message, code);
};

function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

const clone = (value) => structuredClone(value);

export const WORKFLOW_PROFILE_CATALOG_VERSION = "1.0.0";

const REQUIRED_GATES = Object.freeze([
  "RequirementsGate",
  "ArchitectureGate",
  "ContractGate",
  "WorkBreakdownGate",
  "WorkDependencyGate",
  "SpecialistAssignmentGate",
  "WorkItemVerificationGate",
  "BusinessAcceptanceGate",
]);

const CLOSURE_POLICY = Object.freeze({
  mode: "adaptive-breadth-first-waves",
  minimumWeightedCoverage: 0.99,
  maximumBlockingUnknowns: 0,
  maximumContradictions: 0,
  mandatoryForEveryProfile: true,
});

const PROFILE_DEFINITIONS = Object.freeze({
  quick: {
    description: "Bounded fast feedback with explicit downstream obligations.",
    executionMode: "read-write",
    immediateVerificationLanes: ["changed-scope", "contract", "focused"],
    deferredVerificationLanes: [
      "full-regression",
      "performance",
      "release",
      "security",
    ],
    finalAssuranceRequired: true,
  },
  standard: {
    description: "Default balanced engineering and verification policy.",
    executionMode: "read-write",
    immediateVerificationLanes: [
      "contract",
      "focused",
      "regression",
      "security",
    ],
    deferredVerificationLanes: ["performance", "release"],
    finalAssuranceRequired: true,
  },
  assurance: {
    description: "Complete verification policy for high-assurance work.",
    executionMode: "read-write",
    immediateVerificationLanes: [
      "contract",
      "focused",
      "full-regression",
      "performance",
      "release",
      "security",
    ],
    deferredVerificationLanes: [],
    finalAssuranceRequired: true,
  },
  inspect: {
    description: "Read-only inspection with no lifecycle mutation authority.",
    executionMode: "read-only",
    immediateVerificationLanes: ["integrity", "traceability"],
    deferredVerificationLanes: [],
    finalAssuranceRequired: false,
  },
});

function catalogMaterial() {
  return {
    version: WORKFLOW_PROFILE_CATALOG_VERSION,
    defaultProfile: "standard",
    requiredGates: [...REQUIRED_GATES],
    closurePolicy: clone(CLOSURE_POLICY),
    profiles: clone(PROFILE_DEFINITIONS),
  };
}

export function createWorkflowProfileCatalog() {
  const material = catalogMaterial();
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "WorkflowProfileCatalog",
    ...material,
    catalogDigest: canonicalJsonDigest(material),
  });
}

function validateCatalog(catalog) {
  if (
    !catalog ||
    catalog.apiVersion !== "devrelay.dev/v1alpha1" ||
    catalog.kind !== "WorkflowProfileCatalog"
  ) {
    fail("a WorkflowProfileCatalog is required", "DR4901");
  }
  const { apiVersion, kind, catalogDigest, ...material } = catalog;
  void apiVersion;
  void kind;
  if (catalogDigest !== canonicalJsonDigest(material)) {
    fail("profile catalog digest drifted", "DR4902");
  }
  const published = catalogMaterial();
  if (canonicalJsonDigest(material) !== canonicalJsonDigest(published)) {
    fail("profile catalog is unknown or bypass-capable", "DR4903");
  }
  return clone(catalog);
}

function normalizeRiskContext(value) {
  if (value === undefined) return { level: "not-assessed", sourceRefs: [] };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("projectRiskContext must be an object", "DR4904");
  }
  const allowed = new Set(["not-assessed", "low", "moderate", "high", "critical"]);
  if (!allowed.has(value.level)) {
    fail("projectRiskContext.level is invalid", "DR4904");
  }
  if (!Array.isArray(value.sourceRefs)) {
    fail("projectRiskContext.sourceRefs must be an array", "DR4904");
  }
  if (value.sourceRefs.some((ref) => typeof ref !== "string" || !ref)) {
    fail("projectRiskContext.sourceRefs contains an invalid reference", "DR4904");
  }
  return {
    level: value.level,
    sourceRefs: [...new Set(value.sourceRefs)].sort(),
  };
}

export function resolveWorkflowProfile({
  profileName,
  projectRiskContext,
  catalog = createWorkflowProfileCatalog(),
  requestedOverrides,
} = {}) {
  if (requestedOverrides !== undefined) {
    fail("profile overrides are not supported", "DR4905");
  }
  const trustedCatalog = validateCatalog(catalog);
  const selectedName = profileName ?? trustedCatalog.defaultProfile;
  const definition = trustedCatalog.profiles[selectedName];
  if (!definition) fail(`unknown profile ${String(selectedName)}`, "DR4906");

  const riskContext = normalizeRiskContext(projectRiskContext);
  const material = {
    profileName: selectedName,
    profileVersion: WORKFLOW_PROFILE_CATALOG_VERSION,
    catalogDigest: trustedCatalog.catalogDigest,
    projectRiskContext: riskContext,
    closurePolicy: clone(trustedCatalog.closurePolicy),
    authorityPolicy: {
      coreOwnsRouting: true,
      coreOwnsValidation: true,
      coreOwnsProgression: true,
      requiredGates: [...trustedCatalog.requiredGates],
      gateBypassAllowed: false,
    },
    executionPolicy: {
      mode: definition.executionMode,
      lifecycleMutationAllowed: definition.executionMode === "read-write",
    },
    verificationPolicy: {
      immediateLanes: [...definition.immediateVerificationLanes],
      deferredObligations: definition.deferredVerificationLanes.map((lane) => ({
        lane,
        disposition: "required-before-final-acceptance",
      })),
      finalAssuranceRequired: definition.finalAssuranceRequired,
    },
    description: definition.description,
  };

  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ResolvedWorkflowProfile",
    interfaceIntentId: "IF-SIM-PROFILE",
    policyId: `WFP-${selectedName.toUpperCase()}-${WORKFLOW_PROFILE_CATALOG_VERSION}`,
    ...material,
    policyDigest: canonicalJsonDigest(material),
  });
}

export function verifyResolvedWorkflowProfile(policy, {
  catalog = createWorkflowProfileCatalog(),
} = {}) {
  if (
    !policy ||
    policy.apiVersion !== "devrelay.dev/v1alpha1" ||
    policy.kind !== "ResolvedWorkflowProfile" ||
    policy.interfaceIntentId !== "IF-SIM-PROFILE"
  ) {
    fail("a ResolvedWorkflowProfile is required", "DR4907");
  }
  const trustedCatalog = validateCatalog(catalog);
  const {
    apiVersion,
    kind,
    interfaceIntentId,
    policyId,
    policyDigest,
    ...material
  } = policy;
  void apiVersion;
  void kind;
  void interfaceIntentId;
  void policyId;
  if (policyDigest !== canonicalJsonDigest(material)) {
    fail("resolved profile digest drifted", "DR4908");
  }
  const expected = resolveWorkflowProfile({
    profileName: policy.profileName,
    projectRiskContext: policy.projectRiskContext,
    catalog: trustedCatalog,
  });
  if (expected.policyDigest !== policy.policyDigest) {
    fail("resolved profile does not match the published policy", "DR4909");
  }
  return true;
}
