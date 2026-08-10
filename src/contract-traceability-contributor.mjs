import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateContractGenerationArtifact } from "./contract-generation-artifact-validator.mjs";

const EMPTY = Object.freeze([]);

function deepFreeze(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (entry !== null && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
}

function fail(message) {
  throw new TypeError(`contract traceability contributor: ${message}`);
}

function oneLoaded(context, group, port) {
  const values = context?.[group]?.[port];
  if (!Array.isArray(values) || values.length !== 1 || !values[0]?.ref || !values[0]?.value) {
    fail(`${group}.${port} must contain exactly one loaded artifact`);
  }
  return values[0];
}

function locator(loaded, pointer, entity) {
  return {
    artifact: { artifactId: loaded.ref.artifactId, digest: loaded.ref.digest },
    jsonPointer: pointer,
    entityDigest: canonicalJsonDigest(entity),
  };
}

function endpoint(kind, stableId, authority, scope) {
  return { kind, stableId, authority, scope };
}

function projectContracts(loaded, authority, scope) {
  validateContractGenerationArtifact(loaded.value, { ref: loaded.ref });
  const contracts = loaded.value.contracts;
  const nodes = contracts.map((entry, position) => ({
    kind: "contract",
    stableId: entry.id,
    label: `${entry.contractKind}: ${entry.interfaceIntentId}`,
    attributes: {
      interfaceIntentId: entry.interfaceIntentId,
      contractKind: entry.contractKind,
      nativeArtifact: structuredClone(entry.artifact),
    },
    sourceLocators: [locator(loaded, `/contracts/${position}`, entry)],
  }));
  const edges = contracts.map((entry, position) => ({
    kind: "contracted-by",
    source: endpoint(
      "interface-intent",
      entry.interfaceIntentId,
      "approved",
      "architecture/baseline",
    ),
    target: endpoint("contract", entry.id, authority, scope),
    rationale:
      authority === "approved"
        ? "The approved interface intent is governed by this approved contract."
        : "The approved interface intent is covered by this candidate contract draft.",
    sourceLocators: [locator(loaded, `/contracts/${position}/interfaceIntentId`, entry.interfaceIntentId)],
  }));
  return {
    horizon: "contracts",
    nodes: nodes.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en")),
    edges: edges.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en")),
  };
}

function ownership(scope, authority) {
  return deepFreeze({
    scope,
    authority,
    nodeKinds: ["contract"],
    edgeKinds: ["contracted-by"],
  });
}

export function createContractCandidateTraceabilityContributor() {
  const scope = "contracts/candidate";
  return Object.freeze({
    metadata: deepFreeze({ id: "devrelay.contract-candidate", version: "1.0.0" }),
    match(context) {
      return (
        context?.invocation?.module?.id === "contract-generation" &&
        context.invocation.module.version === "0.1.0" &&
        context.moduleResult?.status === "completed" &&
        context.moduleResult.outcome === "generated"
      );
    },
    scope,
    authority: "candidate",
    ownership: ownership(scope, "candidate"),
    async project(context) {
      const port =
        context.invocation.module.operation === "establish-contracts"
          ? "contract-draft-set"
          : "contract-change-set-draft";
      return projectContracts(oneLoaded(context, "loadedOutputs", port), "candidate", scope);
    },
  });
}

export function createContractBaselineTraceabilityContributor() {
  const scope = "contracts/baseline";
  return Object.freeze({
    metadata: deepFreeze({ id: "devrelay.contract-baseline-observer", version: "1.0.0" }),
    match(context) {
      return context?.gate?.id === "contract-gate" && context.gate.outcome === "promoted";
    },
    scope,
    authority: "approved",
    ownership: ownership(scope, "approved"),
    async project(context) {
      return projectContracts(oneLoaded(context, "loadedOutputs", "contract-baseline"), "approved", scope);
    },
  });
}

export function createContractControlTraceabilityContributor() {
  return Object.freeze({
    metadata: deepFreeze({ id: "devrelay.contract-control", version: "1.0.0" }),
    match(context) {
      return (
        context?.invocation?.module?.id === "contract-generation" &&
        new Set(["needs_clarification", "unable_to_proceed", "execution_failed"]).has(
          context.moduleResult?.outcome,
        )
      );
    },
    scope: "contracts/control",
    authority: "candidate",
    ownership: deepFreeze({
      scope: "contracts/control",
      authority: "candidate",
      nodeKinds: EMPTY,
      edgeKinds: EMPTY,
    }),
    async project(context) {
      return {
        horizon: "contracts",
        nodes: [],
        edges: [],
        reason: `ContractGeneration outcome ${context.moduleResult.outcome} has no contract candidate to project.`,
      };
    },
  });
}

export const contractCandidateTraceabilityContributor =
  createContractCandidateTraceabilityContributor();
export const contractBaselineTraceabilityContributor =
  createContractBaselineTraceabilityContributor();
export const contractControlTraceabilityContributor =
  createContractControlTraceabilityContributor();
export const contractTraceabilityContributors = Object.freeze([
  contractCandidateTraceabilityContributor,
  contractControlTraceabilityContributor,
]);
