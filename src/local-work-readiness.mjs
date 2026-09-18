import { canonicalJsonDigest } from "./content-digest.mjs";
import { loadArtifactContent } from "./artifact-runtime.mjs";
import { readLocalCompletionLedger, localCompletionLedgerId } from "./local-completion-ledger.mjs";
import { validateWorkBreakdownArtifact } from "./work-breakdown-artifact-validator.mjs";
import { validateWorkDependencyArtifact } from "./work-dependency-artifact-validator.mjs";
import { deriveRunnableFrontier } from "./work-dependency-graph.mjs";
import { deriveRunnableFrontierProof } from "./work-execution-runtime.mjs";

const same = (a, b) => canonicalJsonDigest(a) === canonicalJsonDigest(b);
const fail = message => { throw new TypeError(`local work readiness: ${message}`); };

export function assertLocalCompletionSnapshotCurrent({ storage, namespace, baselines, ledgerVersion, ledgerDigest }) {
  const head = storage.readRun(localCompletionLedgerId(namespace, baselines.workBreakdownBaseline));
  if (head.version !== ledgerVersion || head.state.ledgerDigest !== ledgerDigest || !same(head.state.baselines, baselines)) {
    fail("completion snapshot is stale; rederive readiness");
  }
}

// Read-only composition, not dispatch permission. No completed-ID/fact overrides:
// all completions come from the entire durable, Core-reverified ledger. The host
// must separately enforce its current activation heads and work reservations.
export async function deriveLocalWorkReadiness(request) {
  const allowed = ["storage", "namespace", "baselines", "verifyIntegration", "loadArtifact"];
  if (!request || Object.keys(request).some(key => !allowed.includes(key))) fail("undeclared readiness input");
  const { storage, namespace, loadArtifact } = request;
  const baselines = structuredClone(request.baselines);
  const ledger = await readLocalCompletionLedger({ storage, namespace, baselines, verifyIntegration: request.verifyIntegration });
  const [work, dependency] = await Promise.all([baselines.workBreakdownBaseline, baselines.workDependencyBaseline]
    .map(ref => loadArtifactContent(ref, { load: loadArtifact })));
  validateWorkBreakdownArtifact(work.value, { ref: work.ref });
  validateWorkDependencyArtifact(dependency.value, { ref: dependency.ref });
  if (work.value.kind !== "WorkBreakdownBaseline" || dependency.value.kind !== "WorkDependencyBaseline" ||
      !same(dependency.value.workBreakdownBaseline, work.ref) ||
      !same(work.value.workItems.map(item => item.id).sort(), [...dependency.value.nodes].sort())) {
    fail("approved work and dependency lineage or universe differs");
  }
  const byId = new Map(work.value.workItems.map(item => [item.id, item]));
  for (const entry of ledger.state.entries) {
    const loaded = await loadArtifactContent(entry.workItemRef, { load: loadArtifact });
    if (!byId.has(entry.fact.workItemId) || !same(loaded.value, byId.get(entry.fact.workItemId))) {
      fail("integrated work-item bytes differ from approved work");
    }
  }
  const completedWorkItemIds = ledger.factSet.facts.map(fact => fact.workItemId);
  const readyWorkItemIds = deriveRunnableFrontier({ baseline: dependency.value, completedWorkItemIds });
  const proofs = readyWorkItemIds.map(workItemId => deriveRunnableFrontierProof({ workItemId,
    workBreakdownBaseline: work, workDependencyBaseline: dependency, integratedCompletionFacts: { value: ledger.factSet } }).proof);
  const completed = new Set(completedWorkItemIds);
  const ready = new Set(readyWorkItemIds);
  const dispositions = dependency.value.nodes.map(workItemId => ({ workItemId,
    status: completed.has(workItemId) ? "completed" : ready.has(workItemId) ? "ready" : "blocked",
    blockingWorkItemIds: completed.has(workItemId) ? [] : dependency.value.edges
      .filter(edge => edge.dependentId === workItemId && !completed.has(edge.prerequisiteId))
      .map(edge => edge.prerequisiteId).sort() }));
  const result = { baselines, ledgerVersion: ledger.version, ledgerDigest: ledger.state.ledgerDigest,
    factSet: ledger.factSet, readyWorkItemIds, dispositions, proofs };
  assertLocalCompletionSnapshotCurrent({ storage, namespace, ...result });
  return { ...result, readinessDigest: canonicalJsonDigest(result) };
}
