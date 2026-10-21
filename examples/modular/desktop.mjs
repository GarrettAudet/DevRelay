import { readFile, open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setupCodingProject, loadCodingProject } from "./coding-project.mjs";
import { createCodingWorkflow, inspectCodingWorkspace } from "./coding.mjs";
import { main as codingMain } from "./code.mjs";
import { activateGovernedCodingProject, inspectGovernedCodingProject, planGovernedCodingRequest, runGovernedCodingRequest, reconcileGovernedCodingProject } from "./coding-governed-host.mjs";
import { inspectBoundedCodingWork, prepareBoundedCodingWork, reviewBoundedCodingWork, cancelBoundedCodingWork } from "./coding-bounded-host.mjs";
import { summarizeCodingResult } from "./coding-summary.mjs";

async function readBoundedJson(path) {
  const handle = await open(resolve(path), "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error("Expected a JSON file within the 16 MiB limit");
    const bytes = Buffer.alloc(16 * 1024 * 1024 + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > 16 * 1024 * 1024) throw new Error("JSON input exceeds 16 MiB");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
  } finally { await handle.close(); }
}

export async function main(args = process.argv.slice(2), trustedHost = {}) {
  let host;
  try {
    const [command, ...values] = args;
    if (command === "list" && values.length === 0) return await codingMain(["--list"]);
    if (command === "inspect" && values.length >= 1) {
      console.log(JSON.stringify(inspectCodingWorkspace({ workspace: values[0], paths: values.slice(1) }), null, 2));
      return;
    }
    if ((command === "bounded-inspect" && values.length >= 2) || (command === "bounded-status" && values.length === 1)) {
      console.log(JSON.stringify(await inspectBoundedCodingWork({ workspace: values[0], paths: values.slice(1) }), null, 2));
      return;
    }
    if (command === "bounded-prepare" && values.length === 2) {
      console.log(JSON.stringify(await prepareBoundedCodingWork({ ...await readBoundedJson(values[1]), workspace: values[0] }), null, 2));
      return;
    }
    if (command === "bounded-review" && values.length === 3) {
      console.log(JSON.stringify(await reviewBoundedCodingWork({ workspace: values[0], preparationId: values[1], expectedHeadDigest: values[2], captureDecision: trustedHost.captureDecision }), null, 2));
      return;
    }
    if (command === "bounded-cancel" && values.length === 3) {
      console.log(JSON.stringify(await cancelBoundedCodingWork({ workspace: values[0], preparationId: values[1], expectedHeadDigest: values[2] }), null, 2));
      return;
    }
    if (command === "governed-status" && values.length === 1) {
      console.log(JSON.stringify(inspectGovernedCodingProject(values[0]), null, 2));
      return;
    }
    if ((command === "governed-activate" && values.length === 2) || (command === "governed-refresh" && values.length === 3)) {
      const bundle = await readBoundedJson(values[1]);
      console.log(JSON.stringify(await activateGovernedCodingProject({ workspace: values[0], bundle,
        ...(values[2] ? { expectedHeadDigest: values[2] } : {}) }), null, 2));
      return;
    }
    if (command === "governed-plan" && values.length === 2) {
      console.log(JSON.stringify(await planGovernedCodingRequest({ workspace: values[0], request: await readBoundedJson(values[1]) }), null, 2));
      return;
    }
    if (command === "governed-reconcile" && values.length === 2) {
      console.log(JSON.stringify(await reconcileGovernedCodingProject({ workspace: values[0], expectedHeadDigest: values[1] }), null, 2));
      return;
    }
    if (command === "governed-run" && values.length === 2) {
      // Resolve the host first: missing authority must never fall back to preview.
      inspectGovernedCodingProject(values[0]);
      const result = await runGovernedCodingRequest({ workspace: values[0], plan: await readBoundedJson(values[1]) });
      console.log(JSON.stringify({ ...result, summary: summarizeCodingResult(result) }, null, 2));
      process.exitCode = result.currentWorkspaceMatches && result.result.outcome === "verified" ? 0 : 1;
      return;
    }
    if (command === "setup" && values.length === 3) {
      const [mode, workspace, contextDirectory] = values;
      console.log(JSON.stringify(await setupCodingProject({mode, workspace, contextDirectory}), null, 2));
      return;
    }
    if (command !== "run" || values.length !== 2) {
      throw new Error("Usage: desktop.mjs setup <new|existing> <workspace> <context-directory> | run <workspace> <request.json> (legacy preview) | governed-run <workspace> <plan.json> | governed-activate <workspace> <bundle.json> | governed-refresh <workspace> <bundle.json> <expected-head-digest> | governed-plan <workspace> <request.json> | governed-status <workspace> | governed-reconcile <workspace> <expected-head-digest> | bounded-inspect <workspace> <paths...> | bounded-prepare <workspace> <proposal.json> | bounded-review <workspace> <preparation-id> <expected-head-digest> (trusted conversation host only) | bounded-cancel <workspace> <preparation-id> <expected-head-digest> | bounded-status <workspace> | inspect <workspace> [paths...] | list");
    }
    const config = await loadCodingProject(values[0]);
    const request = JSON.parse(await readFile(resolve(values[1]), "utf8"));
    host = createCodingWorkflow(config);
    const result = await host.execute(request);
    console.log(JSON.stringify({...result, summary:summarizeCodingResult(result)}, null, 2));
    process.exitCode = result.currentWorkspaceMatches && result.result.outcome === "verified" ? 0 : 1;
  } catch (error) {
    const code = error.code ?? "INVALID_REQUEST";
    const nextAction = code === "HUMAN_DECISION_REQUIRED" ? "Review this exact card in the trusted conversation host; JSON cannot authenticate a human decision."
      : code === "FULL_CHANGE_REQUIRED" ? "Use the normal requirements/design/contract change path for the material change."
      : code === "NEEDS_CLARIFICATION" ? "Resolve the stated missing semantic review or evidence, then prepare again."
      : ["GOVERNED_HOST_REQUIRED", "BASELINE_ALIGNMENT_REQUIRED", "UNSUPPORTED_REPOSITORY_CONTEXT"].includes(code) ? "Inspect and align the project's existing approved baselines; first-use onboarding and greenfield are outside the bounded lane."
      : /RECONCILIATION|LEASE/.test(code) ? "Preserve current state and reconcile exact checkpoints; never repeat an uncertain effect."
      : "Inspect the current head and diagnostic details; prepare a revised exact card if needed.";
    const output = { status: code === "FULL_CHANGE_REQUIRED" ? "full-change-required" : code === "NEEDS_CLARIFICATION" ? "needs-clarification" : code === "BASELINE_ALIGNMENT_REQUIRED" ? "baseline-alignment-required" : "blocked",
      code, reason: error.message, nextAction, details: { name: error.name, message: error.message } };
    if (args[0]?.startsWith("governed-") || args[0]?.startsWith("bounded-")) console.log(JSON.stringify(output));
    else console.error(JSON.stringify({ error: error.message, ...output }));
    process.exitCode = 2;
  } finally { host?.close(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
