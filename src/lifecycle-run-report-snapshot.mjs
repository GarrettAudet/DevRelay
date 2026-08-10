import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateLifecycleRunReportArtifact } from "./lifecycle-run-report-artifact-validator.mjs";
import { verifyRunLedgerCheckpoint } from "./lifecycle-run-report-ledger.mjs";
import { validateTraceabilityGraphSnapshot } from "./traceability-artifact-validator.mjs";
import { diagnoseTraceabilityGraph } from "./traceability-graph.mjs";

const VERSION = "devrelay.dev/v1alpha1";
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const compare = (a, b) => String(a).localeCompare(String(b), "en");
const clone = value => structuredClone(value);
const refKey = ref => `${ref.artifactId}\0${ref.digest}`;
const sortRefs = values => [...new Map(values.filter(Boolean).map(value => [refKey(value), clone(value)])).values()].sort((a,b)=>compare(refKey(a),refKey(b)));
const sourceRef = fact => clone(fact.source.artifact);
const graphRefOf = value => value?.ref ?? value?.snapshotRef ?? value?.graphRef;
const graphValueOf = value => value?.snapshot ?? value?.value ?? value;
const nodeRef = node => {
  for (const candidate of [node.artifact, node.attributes?.artifact, node.attributes?.nativeArtifact]) {
    if (candidate?.artifactId && digestPattern.test(candidate.digest)) return {artifactId:candidate.artifactId,digest:candidate.digest};
  }
  const locator = node.sourceLocators?.find(value => value?.artifact?.artifactId && digestPattern.test(value.artifact.digest));
  return locator ? clone(locator.artifact) : undefined;
};
const entityRef = node => {
  if (!node?.kind || !node?.stableId || !digestPattern.test(node.contentDigest)) fail(`graph node ${node?.nodeId ?? "unknown"} lacks exact entity identity`);
  return {artifactId:`node:${node.kind}:${node.stableId}`,digest:node.contentDigest};
};
const factBody = record => JSON.parse(Buffer.from(record.bytesBase64, "base64").toString("utf8"));

export class LifecycleRunSnapshotError extends Error {
  constructor(message) { super(`lifecycle run snapshot projection failed: ${message}`); this.name="LifecycleRunSnapshotError"; this.code="DR4420"; }
}
const fail = message => { throw new LifecycleRunSnapshotError(message); };
const requireRefs = (values, label) => {
  if (!Array.isArray(values) || values.length === 0) fail(`${label} requires digest-bound sourceFacts`);
  for (const value of values) if (!value?.artifactId || !digestPattern.test(value.digest)) fail(`${label} has an invalid sourceFact`);
};

function terminalState(facts) {
  const event=facts.at(-1).event;
  if(event==="failed") return ["failed","failed","unknown"];
  if(event==="clarification") return ["clarification","clarification","pending"];
  if(event==="skipped") return ["skipped","skipped","not-applicable"];
  if(event==="approved") return ["completed","approved","approved"];
  if(event==="rejected") return ["completed","rejected","rejected"];
  if(["completed","progressed"].includes(event)) return ["completed","completed","unknown"];
  if(["started","resumed","checkpointed"].includes(event)) return ["active","unknown","pending"];
  return ["not-started","unknown","pending"];
}

function stagesFrom(facts, details) {
  const groups=new Map();
  for(const fact of facts) {
    if(fact.component.kind==="adapter") continue;
    const key=`${fact.component.kind}\0${fact.component.id}`;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(fact);
  }
  return [...groups.entries()].map(([key,group])=>{
    const [componentKind,componentId]=key.split("\0");
    const detail=details?.[componentId] ?? {};
    if (Object.keys(detail).length) requireRefs(detail.sourceFacts, `stageDetails.${componentId}`);
    const [status,outcome,derivedGate]=terminalState(group);
    const attempts=group.filter(f=>["started","resumed"].includes(f.event)).length;
    return {
      componentKind, componentId, sequence:0,
      operation:detail.operation ?? "unspecified",
      adapterBindings:[...(detail.adapterBindings ?? [])].sort((a,b)=>compare(`${a.id}\0${a.version}\0${a.configurationDigest}`,`${b.id}\0${b.version}\0${b.configurationDigest}`)),
      status, outcome:detail.outcome ?? outcome,
      gateResult:detail.gateResult ?? (componentKind==="gate" ? derivedGate : "not-applicable"),
      rework:{attemptCount:Math.max(attempts,group.length?1:0),replayed:group.some(f=>f.event==="resumed"),predecessorAttempts:sortRefs(detail.predecessorAttempts ?? [])},
      performance:[...(detail.performance ?? [])].map(clone).sort((a,b)=>compare(canonicalJson(a),canonicalJson(b))),
      importantArtifacts:sortRefs(detail.importantArtifacts ?? []),
      nextAction:clone(detail.nextAction ?? {disposition:"unknown"}),
      sourceFacts:sortRefs([...group.map(sourceRef),...(detail.sourceFacts ?? [])]),
      _first:Math.min(...group.map(f=>f.__sequence)),
    };
  }).sort((a,b)=>a._first-b._first||compare(a.componentId,b.componentId)).map((stage,sequence)=>{delete stage._first;stage.sequence=sequence;return stage;});
}

function traceProjection(graph, graphRef) {
  const nodes=(graph.nodes ?? []).filter(n=>n.state!=="retired");
  const byId=new Map(nodes.map(n=>[n.nodeId,n]));
  const edges=(graph.edges ?? []).filter(e=>e.state!=="retired"&&byId.has(e.sourceNodeId)&&byId.has(e.targetNodeId)).sort((a,b)=>compare(a.edgeId,b.edgeId));
  const paths=edges.map(edge=>{
    const from=entityRef(byId.get(edge.sourceNodeId)),to=entityRef(byId.get(edge.targetNodeId));
    return {pathId:`path-${canonicalJsonDigest({edgeId:edge.edgeId,from,to}).slice(7,23)}`,from,to,graphEvidence:clone(graphRef)};
  }).sort((a,b)=>compare(canonicalJson(a),canonicalJson(b)));
  const diagnostics=diagnoseTraceabilityGraph(graph).map(({code,severity,message})=>({code,severity,message,source:{kind:"traceability-graph",artifact:clone(graphRef)}}));
  for(const node of nodes.sort((a,b)=>compare(a.nodeId,b.nodeId))){if(!nodeRef(node))diagnostics.push({code:"TRACE_SOURCE_MISSING",severity:"warning",message:`Active graph node ${node.nodeId} has no digest-bound artifact source.`,source:{kind:"traceability-graph",artifact:clone(graphRef)}});}
  const orderedDiagnostics=[...new Map(diagnostics.map(value=>[canonicalJson(value),value])).values()].sort((a,b)=>compare(canonicalJson(a),canonicalJson(b)));
  return {paths:paths.sort((a,b)=>compare(a.pathId,b.pathId)),diagnostics:orderedDiagnostics,artifacts:sortRefs(nodes.map(nodeRef))};
}

export function projectLifecycleRunSnapshot({snapshotId,ledgerCheckpoint,traceabilityGraph,observations=[],adapterAssessments=[],stageDetails={},nextAction,readyFrontier}={}) {
  verifyRunLedgerCheckpoint(ledgerCheckpoint);
  const graph=graphValueOf(traceabilityGraph), graphRef=graphRefOf(traceabilityGraph);
  if(!graphRef?.artifactId||!digestPattern.test(graphRef.digest)) fail("traceabilityGraph requires a digest-bound ref");
  try { validateTraceabilityGraphSnapshot(graph); } catch (error) { fail(`invalid TraceabilityGraphSnapshot: ${error.message}`); }
  if(canonicalJsonDigest(graph)!==graphRef.digest) fail("traceabilityGraph snapshot does not match its exact graph reference digest");
  for(const observation of observations) { validateLifecycleRunReportArtifact(observation); if(observation.runId!==ledgerCheckpoint.runId) fail(`observation ${observation.observationId} belongs to a different run`); }
  for (const [componentId, detail] of Object.entries(stageDetails ?? {})) {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) fail(`stageDetails.${componentId} must be an object`);
    requireRefs(detail.sourceFacts, `stageDetails.${componentId}`);
  }
  const facts=ledgerCheckpoint.records.map(record=>({...factBody(record),__sequence:record.sequence}));
  const stages=stagesFrom(facts,stageDetails);
  const exactGraphRef={artifactId:graphRef.artifactId,digest:graphRef.digest};
  const trace=traceProjection(graph,exactGraphRef);
  const ledger={artifactId:`ledger-${ledgerCheckpoint.runId}`,digest:ledgerCheckpoint.checkpointDigest};
  const body={
    snapshotId:snapshotId??`snapshot-${ledgerCheckpoint.runId}-${ledgerCheckpoint.checkpointDigest.slice(7,19)}`,
    runId:ledgerCheckpoint.runId,ledger,traceabilityGraph:clone(exactGraphRef),stages,
    importantArtifacts:sortRefs([...stages.flatMap(s=>s.importantArtifacts),...trace.artifacts]),
    traceabilityPaths:trace.paths,diagnostics:trace.diagnostics,
    adapterAssessments:[...adapterAssessments].map(clone).sort((a,b)=>compare(canonicalJson(a),canonicalJson(b))),
    metrics:[...observations].map(o=>clone(o.metric)).sort((a,b)=>compare(canonicalJson(a),canonicalJson(b))),
    nextAction:clone(nextAction ?? (readyFrontier?.readyWorkItemIds?.length ? {disposition:"available",description:`Ready work: ${[...readyFrontier.readyWorkItemIds].sort(compare).join(", ")}`} : {disposition:"unknown"})),
    authority:"read-only-projection",
  };
  const result={apiVersion:VERSION,kind:"LifecycleRunSnapshot",...body,snapshotDigest:canonicalJsonDigest(body)};
  validateLifecycleRunReportArtifact(result);
  return Object.freeze(result);
}
