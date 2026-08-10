import { createHash } from "node:crypto";
import { canonicalJsonDigest } from "./content-digest.mjs";
import { validateLifecycleRunReportArtifact } from "./lifecycle-run-report-artifact-validator.mjs";
import { applyLifecycleRunReportContentPolicy } from "./lifecycle-run-report-content-policy.mjs";

const VERSION = "devrelay.dev/v1alpha1";
export const LIFECYCLE_RUN_REPORT_RENDERER_VERSION = "1.0.0";
const compare = (a,b) => String(a).localeCompare(String(b),"en");
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const refKey = value => `${value.artifactId}\0${value.digest}`;
const markdownDigest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fail = message => { throw new LifecycleRunReportMarkdownError(message); };

export class LifecycleRunReportMarkdownError extends Error {
  constructor(message) { super(`lifecycle run report markdown rendering failed: ${message}`); this.name="LifecycleRunReportMarkdownError"; this.code="DR4430"; }
}

const text = value => String(value ?? "").normalize("NFC").replace(/[\r\n]+/g," ").replace(/\|/g,"\\|").trim();
const code = value => `\`${text(value).replace(/`/g,"\\`")}\``;
const refLink = ref => `[${text(ref.artifactId)}](devrelay-artifact://${encodeURIComponent(ref.artifactId)}?digest=${ref.digest.slice(7)})`;
const refs = values => [...new Map((values??[]).map(value=>[refKey(value),value])).values()].sort((a,b)=>compare(refKey(a),refKey(b)));
const metric = value => ["measured","estimated"].includes(value.availability)
  ? `${value.value} ${value.unit} (${value.availability})`
  : `${value.availability}: ${text(value.absenceReason)}`;
const next = value => value.description ? `${value.disposition}: ${text(value.description)}` : value.disposition;

function approved({policy,policyRef,classifications,defaultClassification,path,value,source}) {
  const classification=classifications[path] ?? defaultClassification;
  const entry=applyLifecycleRunReportContentPolicy({policy,policyRef,fields:[{path,classification,value,source}]}).entries[0];
  return entry.disposition === "omit" ? undefined : entry.value;
}

function renderValue(context,path,value,format=value=>text(value)) {
  const safe=approved({...context,path,value,source:context.snapshotRef});
  return safe === undefined ? "—" : format(safe);
}

function renderRef(context,path,ref) {
  return renderValue(context,path,ref,refLink);
}

function renderRefs(context,path,values,empty="None") {
  const rendered=refs(values).map((value,index)=>renderRef(context,`${path}/${index}`,value)).filter(value=>value!=="—");
  return rendered.length ? rendered.join("<br>") : empty;
}

function stageRow(stage,index,context) {
  const base=`/stages/${index}`;
  const adapters=[...stage.adapterBindings].sort((a,b)=>compare(`${a.id}\0${a.version}\0${a.configurationDigest}`,`${b.id}\0${b.version}\0${b.configurationDigest}`));
  const performance=[...stage.performance].sort((a,b)=>compare(JSON.stringify(a),JSON.stringify(b)));
  const rework=`${stage.rework.attemptCount} attempt${stage.rework.attemptCount===1?"":"s"}${stage.rework.replayed?", resumed":""}${stage.rework.predecessorAttempts.length?`, ${stage.rework.predecessorAttempts.length} predecessor`:""}`;
  return `| ${stage.sequence+1}. ${renderValue(context,`${base}/componentId`,stage.componentId,code)} | ${renderValue(context,`${base}/operation`,stage.operation,code)} | ${renderValue(context,`${base}/adapterBindings`,adapters,a=>a.length?a.map(v=>`${code(v.id)} ${code(v.version)}`).join("<br>"):"None")} | ${renderValue(context,`${base}/outcome`,stage.outcome)} | ${renderValue(context,`${base}/gateResult`,stage.gateResult)} | ${renderValue(context,`${base}/rework`,rework)} | ${renderValue(context,`${base}/performance`,performance,p=>p.length?p.map(metric).join("<br>"):"Unavailable")} | ${renderRefs(context,`${base}/importantArtifacts`,stage.importantArtifacts)} | ${renderRefs(context,`${base}/sourceFacts`,stage.sourceFacts)} | ${renderValue(context,`${base}/nextAction`,next(stage.nextAction))} |`;
}

function normalizeArguments(snapshotOrOptions,maybeOptions={}) {
  if(snapshotOrOptions?.kind==="LifecycleRunSnapshot") return {snapshot:snapshotOrOptions,...maybeOptions};
  return snapshotOrOptions??{};
}

export function renderLifecycleRunReportMarkdown(snapshotOrOptions,maybeOptions) {
  const {snapshot,contentPolicy,policy,contentPolicyRef,policyRef,classifications={},defaultClassification="internal",rendererVersion=LIFECYCLE_RUN_REPORT_RENDERER_VERSION}=normalizeArguments(snapshotOrOptions,maybeOptions);
  const exactPolicy=contentPolicy??policy, exactPolicyRef=contentPolicyRef??policyRef;
  try { validateLifecycleRunReportArtifact(snapshot); } catch(error) { fail(`invalid snapshot: ${error.message}`); }
  if(rendererVersion!==LIFECYCLE_RUN_REPORT_RENDERER_VERSION) fail(`unsupported renderer version ${rendererVersion}`);
  if(!exactPolicyRef?.artifactId||!digestPattern.test(exactPolicyRef.digest)) fail("an exact content policy reference is required");
  const snapshotRef={artifactId:snapshot.snapshotId,digest:snapshot.snapshotDigest};
  const context={policy:exactPolicy,policyRef:exactPolicyRef,classifications,defaultClassification,snapshotRef};
  // Validate the policy even for an empty report and bind it to the supplied reference.
  approved({...context,path:"/runId",value:snapshot.runId,source:snapshotRef});
  const stages=[...snapshot.stages].sort((a,b)=>a.sequence-b.sequence||compare(`${a.componentKind}\0${a.componentId}`,`${b.componentKind}\0${b.componentId}`));
  const completed=stages.filter(value=>value.status==="completed").length;
  const failed=stages.filter(value=>value.status==="failed").length;
  const active=stages.filter(value=>value.status==="active").length;
  const skipped=stages.filter(value=>value.status==="skipped").length;
  const summary=`${stages.length} lifecycle component${stages.length===1?" was":"s were"} observed: ${completed} completed, ${active} active, ${failed} failed, and ${skipped} skipped. Next action: ${next(snapshot.nextAction)}.`;
  const lines=[
    "# Lifecycle Run Report","","## Executive summary","",
    renderValue(context,"/executiveSummary",summary),"",
    `- Run: ${renderValue(context,"/runId",snapshot.runId,code)}`,
    // The Markdown does not embed its own snapshot digest: logically equivalent,
    // independently sealed snapshots must render to the same primary bytes.
    `- Snapshot ID: ${renderValue(context,"/snapshotId",snapshot.snapshotId,code)}`,
    `- Ledger: ${renderRef(context,"/ledger",snapshot.ledger)}`,
    `- Traceability graph: ${renderRef(context,"/traceabilityGraph",snapshot.traceabilityGraph)}`,"",
    "## Stages","",
    "| Stage | Operation | Adapters | Outcome | Gate | Rework | Performance | Important outputs | Source facts | Next action |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...stages.map((stage,index)=>stageRow(stage,index,context)),"",
    "## Run performance","",
    ...(snapshot.metrics.length ? [...snapshot.metrics].sort((a,b)=>compare(JSON.stringify(a),JSON.stringify(b))).map((value,index)=>`- ${renderValue(context,`/metrics/${index}`,`${value.name}: ${metric(value)}`)}`) : ["- No run-level performance observation is available."]),"",
    "## Adapter maturity","",
    ...(snapshot.adapterAssessments.length ? [...snapshot.adapterAssessments].sort((a,b)=>compare(`${a.adapter.id}\0${a.adapter.version}`,`${b.adapter.id}\0${b.adapter.version}`)).map((value,index)=>`- ${renderValue(context,`/adapterAssessments/${index}`,`${value.adapter.id} ${value.adapter.version}: ${value.maturity}`,text)}`) : ["- No adapter maturity assessment is available."]),"",
    "## Traceability","",
    ...(snapshot.traceabilityPaths.length ? [...snapshot.traceabilityPaths].sort((a,b)=>compare(a.pathId,b.pathId)).map((value,index)=>`- ${renderRef(context,`/traceabilityPaths/${index}/from`,value.from)} → ${renderRef(context,`/traceabilityPaths/${index}/to`,value.to)} (evidence: ${renderRef(context,`/traceabilityPaths/${index}/graphEvidence`,value.graphEvidence)})`) : ["- No active traceability path was projected."]),"",
    "## Diagnostics","",
    ...(snapshot.diagnostics.length ? [...snapshot.diagnostics].sort((a,b)=>compare(`${a.severity}\0${a.code}\0${a.message}`,`${b.severity}\0${b.code}\0${b.message}`)).map((value,index)=>`- ${renderValue(context,`/diagnostics/${index}`,`${value.severity.toUpperCase()} ${value.code}: ${value.message}`)}`) : ["- No diagnostics were reported."]),"",
    "## Important artifacts","",
    ...(refs(snapshot.importantArtifacts).length ? refs(snapshot.importantArtifacts).map((value,index)=>`- ${renderRef(context,`/importantArtifacts/${index}`,value)}`).filter(value=>value!=="- —") : ["- No important artifacts were projected."]),"",
    "## Next action","",renderValue(context,"/nextAction",next(snapshot.nextAction)),"",
    "---","",`Generated by DevRelay LifecycleRunReport renderer ${rendererVersion}. This report is a read-only projection; linked canonical artifacts remain authoritative.`,""
  ];
  return lines.join("\n");
}

export function renderLifecycleRunReportMarkdownBytes(snapshotOrOptions,maybeOptions) {
  return Buffer.from(renderLifecycleRunReportMarkdown(snapshotOrOptions,maybeOptions),"utf8");
}

export function createLifecycleRunReportAccess({responseId,view="full",snapshot,contentPolicy,contentPolicyRef,markdownBytes,evidence=[]}={}) {
  try { validateLifecycleRunReportArtifact(snapshot); validateLifecycleRunReportArtifact(contentPolicy); } catch(error) { fail(`invalid access input: ${error.message}`); }
  const expectedPolicy={artifactId:contentPolicy.policyId,digest:contentPolicy.policyDigest};
  if(contentPolicyRef?.artifactId!==expectedPolicy.artifactId||contentPolicyRef?.digest!==expectedPolicy.digest) fail("content policy reference does not match the exact policy");
  if(!Buffer.isBuffer(markdownBytes)&&!(markdownBytes instanceof Uint8Array)) fail("markdownBytes must be exact bytes");
  const body={responseId:responseId??`report-${snapshot.runId}-${snapshot.snapshotDigest.slice(7,19)}`,runId:snapshot.runId,view,snapshot:{artifactId:snapshot.snapshotId,digest:snapshot.snapshotDigest},contentPolicy:expectedPolicy,markdownReport:{artifactId:`LifecycleRunReport-${snapshot.runId}.md`,digest:markdownDigest(markdownBytes)},evidence:refs(evidence),access:"read-only"};
  const result={apiVersion:VERSION,kind:"LifecycleRunReportAccess",...body,responseDigest:canonicalJsonDigest(body)};
  validateLifecycleRunReportArtifact(result);
  return Object.freeze(result);
}

export function renderLifecycleRunReport(options={}) {
  const markdown=renderLifecycleRunReportMarkdown(options), bytes=Buffer.from(markdown,"utf8");
  const access=createLifecycleRunReportAccess({...options,markdownBytes:bytes});
  return Object.freeze({markdown,bytes,access});
}
