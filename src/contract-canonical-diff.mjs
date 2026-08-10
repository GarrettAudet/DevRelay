import { canonicalJsonDigest } from "./content-digest.mjs";

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createContractCanonicalDiff({ operation, contracts, currentBaseline }) {
  const current = new Map(
    (currentBaseline?.contracts ?? []).map((entry) => [entry.id, entry]),
  );
  const proposed = new Map(contracts.map((entry) => [entry.id, entry]));
  const ids = [...new Set([...current.keys(), ...proposed.keys()])].sort(compareText);
  const changes = ids.map((contractId) => {
    const before = current.get(contractId);
    const after = proposed.get(contractId);
    if (!before) {
      return {
        contractId,
        interfaceIntentId: after.interfaceIntentId,
        changeType: "add",
        targetDigest: after.contentDigest,
        compatibility: operation === "establish-contracts" ? "initial" : "backward-compatible",
      };
    }
    if (!after) {
      return {
        contractId,
        interfaceIntentId: before.interfaceIntentId,
        changeType: "remove",
        expectedPriorDigest: before.contentDigest,
        targetDigest: canonicalJsonDigest({ removed: before.contentDigest }),
        compatibility: "breaking",
      };
    }
    const unchanged = before.contentDigest === after.contentDigest;
    return {
      contractId,
      interfaceIntentId: after.interfaceIntentId,
      changeType: unchanged ? "unchanged" : "modify",
      expectedPriorDigest: before.contentDigest,
      targetDigest: after.contentDigest,
      compatibility: unchanged ? "not-applicable" : "breaking",
    };
  });
  const status = changes.some(({ compatibility }) => compatibility === "breaking")
    ? "breaking"
    : "compatible";
  const compatibilityById = new Map(changes.map((change) => [change.contractId, change.compatibility]));
  const resultingContracts = contracts.map((entry) => ({
    ...entry,
    compatibility: compatibilityById.get(entry.id),
  }));
  const material = {
    operation,
    ...(currentBaseline ? { currentContractBaseline: currentBaseline.ref } : {}),
    changes,
    resultingContractsDigest: canonicalJsonDigest(resultingContracts),
    status,
  };
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "ContractCanonicalDiff",
    diffId: `CCD-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    operation,
    ...(currentBaseline ? { currentContractBaseline: currentBaseline.ref } : {}),
    changes,
    resultingContractsDigest: material.resultingContractsDigest,
    status,
  };
}
