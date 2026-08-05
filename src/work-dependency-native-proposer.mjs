import { canonicalJsonDigest } from "./content-digest.mjs";

export class DependencyProposalValidationError extends Error {
  constructor(message) {
    super(`dependency proposal is invalid: ${message}`);
    this.name = "DependencyProposalValidationError";
    this.code = "DR3030";
  }
}

function fail(message) {
  throw new DependencyProposalValidationError(message);
}

function immutable(value) {
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

function hintId(itemId, position, hint) {
  return `HINT-${canonicalJsonDigest({ itemId, position, hint }).slice(7, 23).toUpperCase()}`;
}

function edgeFor(item, hint, evidence) {
  if (hint.relation === "after") {
    return {
      prerequisiteId: hint["work-item-ref"],
      dependentId: item.id,
      rationale: hint.rationale,
      evidence,
      policyDisposition: "allow",
    };
  }
  if (hint.relation === "before") {
    return {
      prerequisiteId: item.id,
      dependentId: hint["work-item-ref"],
      rationale: hint.rationale,
      evidence,
      policyDisposition: "allow",
    };
  }
  return undefined;
}

export function createNativeDependencyProposal(snapshot) {
  if (
    snapshot?.kind !== "WorkBreakdownAnalysisSnapshot" ||
    !Array.isArray(snapshot.workItems) ||
    !Array.isArray(snapshot.workItemIds)
  ) {
    fail("native proposer requires one WorkBreakdownAnalysisSnapshot");
  }
  const edges = [];
  const hintDispositions = [];
  for (const item of [...snapshot.workItems].sort((a, b) =>
    a.id.localeCompare(b.id, "en"),
  )) {
    for (const [position, hint] of item["dependency-hints"].entries()) {
      const id = hintId(item.id, position, hint);
      const evidence = [
        {
          kind: "work-item-dependency-hint",
          workItemId: item.id,
          hintIndex: position,
          hintDigest: canonicalJsonDigest(hint),
        },
      ];
      const edge = edgeFor(item, hint, evidence);
      if (edge) {
        edges.push(edge);
        hintDispositions.push({
          hintId: id,
          workItemId: item.id,
          hintIndex: position,
          disposition: "accepted",
          proposedEdge: {
            prerequisiteId: edge.prerequisiteId,
            dependentId: edge.dependentId,
          },
          rationale: "The directional planning hint is represented as a proposal for Core validation.",
          evidence,
        });
      } else {
        hintDispositions.push({
          hintId: id,
          workItemId: item.id,
          hintIndex: position,
          disposition: "rejected",
          rationale:
            "The related hint does not assert ordering and therefore cannot create a dependency edge.",
          evidence,
        });
      }
    }
  }
  const uniqueEdges = new Map();
  for (const edge of edges) {
    const key = `${edge.prerequisiteId}\u0000${edge.dependentId}`;
    const prior = uniqueEdges.get(key);
    if (!prior) {
      uniqueEdges.set(key, edge);
      continue;
    }
    prior.evidence.push(...edge.evidence);
    prior.evidence.sort((left, right) =>
      canonicalJsonDigest(left).localeCompare(canonicalJsonDigest(right), "en"),
    );
  }
  const normalizedEdges = [...uniqueEdges.values()].sort((left, right) =>
    `${left.prerequisiteId}\u0000${left.dependentId}`.localeCompare(
      `${right.prerequisiteId}\u0000${right.dependentId}`,
      "en",
    ),
  );
  const proposalMaterial = {
    snapshotDigest: snapshot.contentDigest,
    nodes: [...snapshot.workItemIds],
    edges: normalizedEdges,
    hintDispositions: hintDispositions.sort((a, b) =>
      a.hintId.localeCompare(b.hintId, "en"),
    ),
  };
  return immutable({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "DependencyProposal",
    proposalId: `DPROP-${canonicalJsonDigest(proposalMaterial).slice(7, 23).toUpperCase()}`,
    proposer: { id: "native-structured-dependency-proposer", version: "0.1.0" },
    snapshotId: snapshot.snapshotId,
    snapshotDigest: snapshot.contentDigest,
    nodes: proposalMaterial.nodes,
    edges: proposalMaterial.edges,
    hintDispositions: proposalMaterial.hintDispositions,
    contextSliceIds: snapshot.contextSlices.map(({ id }) => id).sort(),
    proposalDigest: canonicalJsonDigest(proposalMaterial),
  });
}

export function validateDependencyProposal(proposal, snapshot) {
  if (proposal?.kind !== "DependencyProposal") fail("kind must be DependencyProposal");
  if (
    proposal.snapshotId !== snapshot.snapshotId ||
    proposal.snapshotDigest !== snapshot.contentDigest
  ) {
    fail("proposal does not bind the exact analysis snapshot");
  }
  if (
    canonicalJsonDigest([...proposal.nodes].sort()) !==
    canonicalJsonDigest([...snapshot.workItemIds].sort())
  ) {
    fail("proposal nodes do not exactly cover the snapshot work items");
  }
  const expectedHints = new Map();
  for (const item of snapshot.workItems) {
    for (const [position, hint] of item["dependency-hints"].entries()) {
      expectedHints.set(hintId(item.id, position, hint), { item, position, hint });
    }
  }
  if (
    proposal.hintDispositions.length !== expectedHints.size ||
    new Set(proposal.hintDispositions.map(({ hintId: id }) => id)).size !==
      expectedHints.size
  ) {
    fail("every dependency hint must have exactly one disposition");
  }
  const proposedPairs = new Set(
    proposal.edges.map(
      ({ prerequisiteId, dependentId }) => `${prerequisiteId}\u0000${dependentId}`,
    ),
  );
  for (const disposition of proposal.hintDispositions) {
    const expected = expectedHints.get(disposition.hintId);
    if (
      !expected ||
      disposition.workItemId !== expected.item.id ||
      disposition.hintIndex !== expected.position ||
      !["accepted", "rejected"].includes(disposition.disposition) ||
      !Array.isArray(disposition.evidence) ||
      disposition.evidence.length === 0
    ) {
      fail("dependency hint disposition is not bound to an exact source hint");
    }
    if (disposition.disposition === "accepted") {
      const pair = `${disposition.proposedEdge?.prerequisiteId}\u0000${disposition.proposedEdge?.dependentId}`;
      if (!proposedPairs.has(pair)) {
        fail("accepted dependency hint does not identify a proposed edge");
      }
    } else if (disposition.proposedEdge !== undefined) {
      fail("rejected dependency hint cannot identify a proposed edge");
    }
  }
  if (
    canonicalJsonDigest([...proposal.contextSliceIds].sort()) !==
    canonicalJsonDigest(snapshot.contextSlices.map(({ id }) => id).sort())
  ) {
    fail("proposal does not bind the exact admitted context-slice set");
  }
  const proposalMaterial = {
    snapshotDigest: proposal.snapshotDigest,
    nodes: proposal.nodes,
    edges: proposal.edges,
    hintDispositions: proposal.hintDispositions,
  };
  if (proposal.proposalDigest !== canonicalJsonDigest(proposalMaterial)) {
    fail("proposalDigest does not bind the exact normalized proposal");
  }
  return proposal;
}
