import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";

const API_VERSION = "devrelay.dev/v1alpha1";
const TERMINAL = new Set(["completed", "unable-to-proceed", "failed"]);
const PAUSED = new Set(["clarification-required", "gate-required"]);

export class ChatGptDesktopLifecycleControllerError extends Error {
  constructor(message, code = "DR4130") {
    super(`ChatGPT Desktop lifecycle controller: ${message}`);
    this.name = "ChatGptDesktopLifecycleControllerError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new ChatGptDesktopLifecycleControllerError(message, code); };
const clone = (value) => structuredClone(value);
const immutable = (value) => {
  const copy = clone(value);
  const freeze = (entry) => {
    if (entry && typeof entry === "object" && !Object.isFrozen(entry)) {
      for (const child of Object.values(entry)) freeze(child);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(copy);
};
const exactRef = (value, label) => {
  if (!value || typeof value.artifactId !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value.digest ?? "")) fail(`${label} must be an exact artifact reference`, "DR4131");
  return clone(value);
};
const diagnostic = (code, message, severity = "error", relatedArtifacts) => ({ code, message, severity, ...(relatedArtifacts?.length && { relatedArtifacts }) });
const stateBody = (state) => Object.fromEntries(Object.entries(state).filter(([key]) => key !== "stateDigest"));
const seal = (state) => ({ ...state, stateDigest: canonicalJsonDigest(stateBody(state)) });

function validateCircuit(value, ref) {
  if (!value || value.apiVersion !== API_VERSION || value.kind !== "DesktopLifecycleCircuit" || !Array.isArray(value.stages) || value.stages.length === 0) fail("circuit is not a DesktopLifecycleCircuit", "DR4131");
  const ids = new Set();
  value.stages.forEach((stage, index) => {
    if (!stage || typeof stage.id !== "string" || ids.has(stage.id) || !["module", "gate"].includes(stage.kind)) fail(`circuit stage ${index} is invalid`, "DR4131");
    ids.add(stage.id);
  });
  if (canonicalJsonDigest(value) !== ref.digest) fail("circuit bytes do not match the requested digest", "DR4131");
  return immutable(value);
}

function validateState(value, runId) {
  if (!value || value.apiVersion !== API_VERSION || value.kind !== "DesktopLifecycleRunState" || value.runId !== runId || value.stateDigest !== canonicalJsonDigest(stateBody(value))) fail("persisted lifecycle state is invalid or corrupt", "DR4132");
  return value;
}

function response(input, revision, state, extraArtifacts = []) {
  const currentId = state.currentStageId;
  const checkpoint = state.checkpoint;
  const artifacts = [...state.artifacts, ...extraArtifacts].filter((ref, index, all) => all.findIndex((item) => item.artifactId === ref.artifactId && item.digest === ref.digest) === index);
  let nextAction = { kind: "none" };
  if (state.status === "clarification-required") nextAction = { kind: "clarification-required", moduleId: currentId, artifact: checkpoint };
  else if (state.status === "gate-required") nextAction = { kind: "gate-decision-required", moduleId: currentId, artifact: checkpoint };
  else if (state.status === "unable-to-proceed" && checkpoint) nextAction = { kind: "resume-available", ...(currentId && { moduleId: currentId }), artifact: checkpoint };
  else if (!TERMINAL.has(state.status)) nextAction = { kind: "progression-available", ...(currentId && { moduleId: currentId }), ...(state.predecessor && { artifact: state.predecessor }) };
  const commandStatus = state.status === "running" ? "completed" : state.status;
  return immutable({ requestId: input.requestId, runId: input.runId, revision, status: commandStatus, artifacts, gateState: state.gateState, diagnostics: state.diagnostics, nextAction });
}

export function createChatGptDesktopLifecycleController({ runStore, loadArtifact, resolveCapabilities, executeStage, createRunView } = {}) {
  if (!runStore?.load || !runStore?.commit || !runStore?.putArtifact || !runStore?.getArtifact) fail("runStore is required");
  if (typeof loadArtifact !== "function" || typeof executeStage !== "function") fail("loadArtifact and executeStage are required");
  if (resolveCapabilities !== undefined && typeof resolveCapabilities !== "function") fail("resolveCapabilities must be a function");
  const circuits = new Map();

  async function artifact(ref, label) {
    exactRef(ref, label);
    const value = await loadArtifact(ref);
    return Buffer.isBuffer(value) || value instanceof Uint8Array ? JSON.parse(Buffer.from(value).toString("utf8")) : clone(value);
  }

  async function storedState(runId) {
    const revision = await runStore.load(runId);
    if (!revision) return undefined;
    const bytes = await runStore.getArtifact(revision.content);
    return { revision, state: validateState(JSON.parse(bytes.toString("utf8")), runId) };
  }

  async function persist(input, state, operation = "compare-and-swap", collections = {}) {
    const sealed = seal(state);
    const committed = await runStore.commit({
      runId: input.runId, requestId: input.requestId, expectedRevision: input.expectedRevision, operation,
      content: { artifactId: `${input.runId}:lifecycle-state:${input.expectedRevision + 1}`, content: sealed, mediaType: "application/json" },
      approvals: collections.approvals ?? [], reports: collections.reports ?? [], taskBindings: collections.taskBindings ?? [],
    });
    if (committed.outcome === "conflict") fail(`stale run revision; current revision is ${committed.revision}`, "DR4133");
    return { committed, state: sealed };
  }

  async function advance(input, state, continuation = {}) {
    const circuit = circuits.get(state.circuit.digest) ?? validateCircuit(await artifact(state.circuit, "circuit"), state.circuit);
    circuits.set(state.circuit.digest, circuit);
    let steps = 0;
    while (state.cursor < circuit.stages.length) {
      if (++steps > circuit.stages.length + 1) fail("circuit repeated without an artifact-backed frontier change", "DR4135");
      const stage = circuit.stages[state.cursor];
      state.currentStageId = stage.id;
      const resolution = resolveCapabilities ? await resolveCapabilities(immutable({ stage, circuit: state.circuit, policy: state.policy, runId: state.runId })) : { outcome: "resolved" };
      if (resolution?.outcome !== "resolved") {
        state.status = "unable-to-proceed";
        state.diagnostics = [diagnostic("DESKTOP_CAPABILITY_BLOCKED", `Stage ${stage.id} has no maturity-valid configured binding.`)];
        if (resolution?.artifact) state.checkpoint = exactRef(resolution.artifact, `stage ${stage.id} capability checkpoint`);
        else delete state.checkpoint;
        break;
      }
      let result;
      try {
        result = await executeStage(immutable({ runId: state.runId, goal: state.goal, stage, stageIndex: state.cursor, circuit: state.circuit, projectOverview: state.projectOverview, policy: state.policy, predecessor: state.predecessor, artifacts: state.artifacts, approvals: state.approvals, ...continuation }));
      } catch (error) {
        state.status = "failed";
        state.diagnostics = [diagnostic("DESKTOP_STAGE_FAILED", error?.message ?? `Stage ${stage.id} failed.`)];
        break;
      }
      if (!result || !["completed", "clarification-required", "gate-required", "unable-to-proceed", "failed"].includes(result.status)) fail(`stage ${stage.id} returned an invalid result`, "DR4134");
      for (const ref of result.artifacts ?? []) exactRef(ref, `stage ${stage.id} artifact`);
      state.artifacts.push(...(result.artifacts ?? []));
      state.diagnostics = clone(result.diagnostics ?? []);
      state.gateState = result.gateState ?? (stage.kind === "gate" && result.status === "gate-required" ? "pending" : "not-applicable");
      if (result.checkpoint) state.checkpoint = exactRef(result.checkpoint, `stage ${stage.id} checkpoint`);
      else delete state.checkpoint;
      if (result.status !== "completed") { state.status = result.status; break; }
      state.predecessor = exactRef(result.predecessor ?? result.artifacts?.[0], `stage ${stage.id} predecessor`);
      state.history.push({ stageId: stage.id, stageIndex: state.cursor, outcome: "completed", predecessor: state.predecessor });
      state.cursor += 1;
      state.status = state.cursor === circuit.stages.length ? "completed" : "running";
      state.gateState = "not-applicable";
      delete state.checkpoint;
      continuation = {};
      if (result.stop === true) break;
    }
    if (state.cursor === circuit.stages.length) delete state.currentStageId;
    return state;
  }

  async function execute(input) {
    const loaded = await storedState(input.runId);
    if (input.operation === "create-run") {
      if (loaded) fail("run already exists", "DR4133");
      if (input.expectedRevision !== 0) fail("a new run must expect revision zero", "DR4133");
      const circuit = validateCircuit(await artifact(input.circuit, "circuit"), input.circuit);
      circuits.set(input.circuit.digest, circuit);
      await artifact(input.projectOverview, "projectOverview");
      await artifact(input.policy, "policy");
      let state = { apiVersion: API_VERSION, kind: "DesktopLifecycleRunState", runId: input.runId, goal: input.goal, circuit: clone(input.circuit), projectOverview: clone(input.projectOverview), policy: clone(input.policy), cursor: 0, status: "running", gateState: "not-applicable", artifacts: [clone(input.circuit), clone(input.projectOverview), clone(input.policy)], approvals: [], diagnostics: [], history: [] };
      state = await advance(input, state);
      const saved = await persist(input, state, "append");
      return response(input, saved.committed.revision, saved.state);
    }
    if (!loaded) fail("run does not exist", "DR4133");
    if (loaded.revision.revision !== input.expectedRevision) fail(`stale run revision; current revision is ${loaded.revision.revision}`, "DR4133");
    const state = clone(loaded.state);
    if (input.operation === "inspect-run") {
      const view = createRunView ? await createRunView(immutable({ state, revision: loaded.revision, reportPolicy: input.reportPolicy })) : undefined;
      const refs = view?.report ? [exactRef(view.report, "run view report")] : [];
      return response(input, loaded.revision.revision, state, refs);
    }
    if (input.operation === "get-evidence") {
      const found = state.artifacts.find((ref) => ref.artifactId === input.evidenceId);
      if (!found) fail(`evidence ${input.evidenceId} is not part of this run`, "DR4131");
      return response(input, loaded.revision.revision, { ...state, status: "completed" }, [found]);
    }
    if (TERMINAL.has(state.status) && input.operation !== "resume-run") fail("terminal run cannot progress without an exact resumable checkpoint", "DR4134");
    let continuation = {};
    if (input.operation === "submit-clarification") {
      if (state.status !== "clarification-required" || input.checkpoint.digest !== state.checkpoint?.digest) fail("clarification is not bound to the current checkpoint", "DR4134");
      continuation = { clarification: { checkpoint: clone(input.checkpoint), answers: clone(input.answers) } };
    } else if (input.operation === "submit-gate-decision") {
      if (state.status !== "gate-required" || input.gateCandidate.digest !== state.checkpoint?.digest) fail("Gate decision is not bound to the current candidate", "DR4134");
      continuation = { gateDecision: { candidate: clone(input.gateCandidate), decision: input.decision, approvalEvidence: clone(input.approvalEvidence) } };
      state.approvals.push(clone(input.approvalEvidence));
    } else if (input.operation === "resume-run") {
      if (!state.checkpoint || input.checkpoint.digest !== state.checkpoint.digest || input.checkpointDigest !== state.checkpoint.digest) fail("resume is not bound to the current exact checkpoint", "DR4134");
      continuation = { resume: { checkpoint: clone(input.checkpoint), checkpointDigest: input.checkpointDigest } };
    } else if (input.operation === "progress-run") {
      if (state.status !== "running" || !state.predecessor || input.approvedPredecessor.digest !== state.predecessor.digest) fail("progression is not bound to the exact approved predecessor", "DR4134");
    } else fail(`unsupported operation ${input.operation}`, "DR4134");
    state.status = "running";
    state.diagnostics = [];
    await advance(input, state, continuation);
    const saved = await persist(input, state, "compare-and-swap", { approvals: input.approvalEvidence ? [{ artifactId: input.approvalEvidence.artifactId, content: canonicalJson(input.approvalEvidence) }] : [] });
    return response(input, saved.committed.revision, saved.state);
  }

  return Object.freeze({ execute, inspectState: async (runId) => immutable((await storedState(runId))?.state) });
}
