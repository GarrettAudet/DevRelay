import { canonicalJsonDigest } from "./content-digest.mjs";
import { diagnoseTraceabilityGraph, queryTraceabilityGraph } from "./traceability-graph.mjs";

export class TraceabilityQueryError extends Error {
  constructor(message, code = "DR4840") {
    super(`traceability query: ${message}`);
    this.name = "TraceabilityQueryError";
    this.code = code;
  }
}

const fail = (message) => { throw new TraceabilityQueryError(message); };
const immutable = (value) => Object.freeze(structuredClone(value));

function page(items, cursor, limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail("limit must be 1 through 100");
  const offset = cursor === undefined ? 0 : Number.parseInt(String(cursor).replace(/^offset:/u, ""), 10);
  if (!Number.isInteger(offset) || offset < 0 || `offset:${offset}` !== (cursor ?? `offset:${offset}`)) fail("cursor is invalid");
  return {
    items: items.slice(offset, offset + limit),
    nextCursor: offset + limit < items.length ? `offset:${offset + limit}` : null,
    total: items.length,
  };
}

export function createTraceabilityQueryService(snapshot, { defaultLimit = 20, maxDepth = 16 } = {}) {
  const graphDigest = canonicalJsonDigest(snapshot);
  function paths({ start, direction, targetKinds, depth = maxDepth, cursor, limit = defaultLimit }) {
    const result = queryTraceabilityGraph(snapshot, { start, direction, targetKinds, maxDepth: depth });
    const compact = result.paths.map((path) => ({
      targetNodeId: path.targetNodeId,
      nodeIds: path.nodeIds,
      edgeIds: path.edgeIds,
    }));
    return immutable({ graphId: result.graphId, revision: result.revision, graphDigest, ...page(compact, cursor, limit) });
  }
  return Object.freeze({
    why(options) { return paths({ ...options, direction: "incoming" }); },
    impact(options) { return paths({ ...options, direction: "outgoing" }); },
    coverage(options) {
      return paths({ ...options, direction: "outgoing", targetKinds: options.targetKinds ?? ["work-item", "change-set", "evidence"] });
    },
    provenance(options) { return paths({ ...options, direction: "both" }); },
    diagnostics({ family, cursor, limit = defaultLimit } = {}) {
      const diagnostics = diagnoseTraceabilityGraph(snapshot)
        .filter((item) => family === undefined || item.family === family || item.code?.includes(family))
        .sort((a, b) => a.diagnosticId.localeCompare(b.diagnosticId, "en"));
      return immutable({ graphId: snapshot.graphId, revision: snapshot.revision, graphDigest, ...page(diagnostics, cursor, limit) });
    },
  });
}
