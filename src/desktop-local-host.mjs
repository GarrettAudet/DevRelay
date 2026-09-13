import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { createLocalHostStorage } from "./local-host-storage.mjs";
import { createLocalHostCheckpointStore } from "./local-host-checkpoints.mjs";
import { createLocalHostTraceabilityStore } from "./local-host-traceability.mjs";
import { createCapabilityEnforcer } from "./local-host-isolation.mjs";
import { createTraceabilityGraphService } from "./traceability-graph.mjs";
import { createModuleRegistry, assertVerifiedCheckpointReplayReceipt } from "./module-registry.mjs";
import { executeSessionBootstrap } from "./session-bootstrap.mjs";
import { loadDesktopProjectMemoryBootstrap } from "./desktop-project-memory-bootstrap.mjs";
import { createDesktopStepExchange, DesktopStepRequired } from "./desktop-step-exchange.mjs";
import { createOperatorCli, OperatorCliError } from "./operator-cli.mjs";
import { createDevRelay, createLocalHost } from "./public-facade.mjs";
import { validateRoadmapArtifact } from "./roadmap-management-artifact-validator.mjs";
import { validateRequirementsArtifact } from "./requirements-artifact-validator.mjs";
import { validateProjectOverviewArtifact, validateProjectOverviewRenderedDocument } from "./project-overview-artifact-validator.mjs";
import { deriveProjectOverview } from "./project-overview.mjs";
import { validateProjectMemoryArtifact } from "./project-memory-artifact-validator.mjs";
import { commitLocalRequirementsGate, verifyLocalRequirementsGate, activateLocalRequirementsGate, verifyLocalRequirementsActivation, assertLocalRequirementsCurrentPair } from "./local-host-requirements-gate.mjs";
import { createRequirementsActivationTraceabilityContributor } from "./requirements-traceability-contributor.mjs";

const schema = (name) => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const validateConfiguration = compileArtifactSchema(schema("desktop-local-host-configuration.schema.json"), [schema("module-result.schema.json")]);
const validateGateSubmission = compileArtifactSchema(schema("desktop-requirements-gate-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateGateActivation = compileArtifactSchema(schema("desktop-requirements-gate-activation.schema.json"));
const same = (a, b) => a === undefined || b === undefined ? a === b : canonicalJson(a) === canonicalJson(b);
const fail = (message, code = "DR4960", exitCode = 2) => { throw new OperatorCliError(message, code, exitCode); };
const inside = (root, target) => { const r = path.relative(root, target); return r !== "" && !path.isAbsolute(r) && r !== ".." && !r.startsWith(`..${path.sep}`); };

// This is an explicit native host, not a user-code loader. All executable code
// comes from this package; configured files contain contract/artifact JSON only.
export async function openDesktopLocalHost({ configurationPath, configurationDigest, command, platform = process.platform } = {}) {
  if (platform !== "win32") fail("the configured Desktop local host requires Windows", "DR4961");
  if (!path.isAbsolute(configurationPath ?? "") || !/^sha256:[a-f0-9]{64}$/u.test(configurationDigest ?? "")) fail("absolute configuration path and exact digest are required");
  const configurationBytes = readFileSync(configurationPath);
  if (sha256Digest(configurationBytes) !== configurationDigest) fail("host configuration bytes drifted", "DR4962", 6);
  let configuration;
  try { configuration = JSON.parse(configurationBytes); } catch { fail("host configuration is not JSON"); }
  if (!validateConfiguration(configuration) || !path.isAbsolute(configuration.workspaceRoot)) fail("host configuration violates its closed contract");
  const root = realpathSync(configuration.workspaceRoot);
  const capability = createCapabilityEnforcer({ attemptId: "desktop-local-host", workspace: root, grants: configuration.grants });
  const scopedPath = (relative, kind = "filesystem.read") => {
    if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) fail("host file paths must be workspace-relative");
    const resolved = path.resolve(root, relative);
    if (!inside(root, resolved)) fail("host path escapes its workspace", "DR4962");
    let ancestor = resolved;
    while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const real = realpathSync(ancestor);
    if (real !== root && !inside(root, real)) fail("host path follows a link outside its workspace", "DR4962");
    capability.authorize({ kind, path: relative });
    capability.authorize({ kind, path: path.relative(root, path.resolve(real, path.relative(ancestor, resolved))) });
    return resolved;
  };
  const read = (descriptor) => {
    if (!descriptor || !/^sha256:[a-f0-9]{64}$/u.test(descriptor.digest ?? "")) fail("file descriptor requires an exact digest");
    const bytes = readFileSync(scopedPath(descriptor.path));
    if (sha256Digest(bytes) !== descriptor.digest) fail("configured file bytes drifted", "DR4962", 6);
    return bytes;
  };
  const json = (descriptor) => { try { return JSON.parse(read(descriptor)); } catch (error) { if (error instanceof OperatorCliError) throw error; fail("configured file is not JSON"); } };
  const files = new Map();
  const pointers = new Map();
  const pointerKey = (ref) => canonicalJsonDigest({ artifactId: ref.artifactId, digest: ref.digest });
  for (const entry of configuration.artifacts) {
    const key = canonicalJsonDigest(entry.ref);
    if (files.has(key)) fail("duplicate artifact reference in host configuration");
    files.set(key, entry);
    const pointer = pointerKey(entry.ref);
    if (pointers.has(pointer) && !same(pointers.get(pointer), entry.ref)) fail("raw artifact pointer is ambiguous");
    pointers.set(pointer, entry.ref);
  }
  const loadConfigured = (ref) => {
    const exact = Object.keys(ref).sort().join(",") === "artifactId,digest" ? pointers.get(pointerKey(ref)) : ref;
    const entry = exact && files.get(canonicalJsonDigest(exact));
    if (!entry) fail("artifact has no explicit configured file binding", "DR4962");
    return read({ path: entry.path, digest: ref.digest });
  };
  const snapshot = json(configuration.sessionSnapshot);
  try { validateRoadmapArtifact(snapshot); } catch { fail("session snapshot violates its contract", "DR4962", 6); }
  if (snapshot.kind !== "SessionContextSnapshot") fail("host requires a session context snapshot", "DR4962");
  if (snapshot.projectId !== configuration.projectId || snapshot.taskId !== configuration.taskId) fail("session identity differs from the host configuration", "DR4962");
  const roleRef = (role) => {
    const binding = snapshot.bindings.find((entry) => entry.role === role);
    if (!binding) fail("mandatory host context binding is absent", "DR4962");
    return binding.artifact;
  };
  try {
    const requirementsRef = roleRef("requirements-baseline");
    const requirements = validateRequirementsArtifact(JSON.parse(loadConfigured(requirementsRef)));
    const overviewRef = roleRef("project-overview");
    const overview = validateProjectOverviewArtifact(JSON.parse(loadConfigured(overviewRef)));
    if (requirements.kind !== "RequirementsBaseline" || overview.kind !== "ProjectOverviewBaseline" ||
        requirementsRef.artifactId !== requirements.baselineId || overviewRef.artifactId !== overview.baselineId ||
        requirements.version !== overview.version || overview.requirementsBaseline.artifactId !== requirementsRef.artifactId ||
        overview.requirementsBaseline.digest !== requirementsRef.digest || !same(overview.overview, deriveProjectOverview(requirements.requirements))) fail("host requires the exact paired approved project context", "DR4962");
    validateProjectOverviewRenderedDocument({ projectOverviewArtifact: overview, renderedDocumentBytes: loadConfigured(roleRef("project-overview-projection")) });
    if (snapshot.roadmapDisposition === "initialized") {
      const roadmapRef = roleRef("roadmap");
      const roadmap = validateRoadmapArtifact(JSON.parse(loadConfigured(roadmapRef)), { ref: roadmapRef });
      if (roadmap.kind !== "RoadmapBaseline") fail("host roadmap context must be an approved baseline", "DR4962");
    }
  } catch (error) {
    if (error instanceof OperatorCliError) throw error;
    fail("approved project context validation failed", "DR4962", 6);
  }
  // Check every manifest path through the host's explicit filesystem grants and
  // real-path confinement before invoking the existing exact memory validator.
  const manifestPath = scopedPath(configuration.memoryManifest);
  let memoryManifest;
  try { memoryManifest = JSON.parse(readFileSync(manifestPath)); } catch { fail("memory manifest is invalid"); }
  for (const relative of Object.values(memoryManifest.paths ?? {})) scopedPath(relative);
  const memory = loadDesktopProjectMemoryBootstrap({ projectRoot: root, taskId: configuration.taskId, projectId: configuration.projectId,
    repositoryRevision: snapshot.repositoryRevision, manifestPath: configuration.memoryManifest });
  const memorySession = json(configuration.memorySessionState);
  try { validateProjectMemoryArtifact(memorySession); } catch { fail("memory session state is invalid", "DR4967", 6); }
  if (memorySession.kind !== "ProjectMemorySessionState" || memorySession.projectId !== configuration.projectId ||
      memorySession.baseline.artifactId !== memory.memoryContext.projectMemoryBaseline.artifactId ||
      memorySession.baseline.digest !== memory.memoryContext.projectMemoryBaseline.digest || !same(memorySession.graphCheckpoint, memory.memoryContext.graphCheckpoint)) fail("memory session context drifted", "DR4967", 6);
  if (memorySession.status !== "concluded" && !(memorySession.status === "open" && memorySession.taskId === configuration.taskId)) fail("prior memory session requires explicit conclusion or recovery", "DR4967", 6);
  for (const [role, ref] of [["project-memory-baseline", memory.memoryContext.projectMemoryBaseline], ["current-synopsis", memory.memoryContext.synopsisProjection], ["traceability-context", memory.memoryContext.graphCheckpoint]]) {
    if (!same(snapshot.bindings.find((entry) => entry.role === role)?.artifact, ref)) fail("session context does not bind current ProjectMemory", "DR4962", 6);
  }
  const session = await executeSessionBootstrap({ snapshot, artifactResolver: loadConfigured,
    expectedProjectId: configuration.projectId, expectedTaskId: configuration.taskId,
    expectedWorkspaceId: snapshot.workspaceId, expectedRepositoryRevision: snapshot.repositoryRevision });
  if (session.outcome === "fail" || !session.moduleExecutionAllowed) fail("session context validation failed", "DR4962", 6);
  const stateDirectory = scopedPath(configuration.stateDirectory, command === "init" || command === "run" || command === "resume" ? "filesystem.write" : "filesystem.read");
  scopedPath(path.join(configuration.stateDirectory, "state.sqlite"), ["init", "run", "resume"].includes(command) ? "filesystem.write" : "filesystem.read");
  if (command !== "init" && !existsSync(path.join(stateDirectory, "state.sqlite"))) fail("host is not initialized; run init first", "DR4963");
  const storage = createLocalHostStorage({ rootDirectory: stateDirectory, readOnly: !["init", "run", "resume"].includes(command) });
  try {
    const namespace = `desktop-host/${canonicalJsonDigest({ projectId: configuration.projectId, root }).slice(7)}`;
    const records = createLocalHostCheckpointStore({ storage, namespace: `${namespace}/records` });
    const effects = createLocalHostCheckpointStore({ storage, namespace: `${namespace}/effects` });
    const traces = createLocalHostCheckpointStore({ storage, namespace: `${namespace}/traces` });
    const contextDigest = canonicalJsonDigest({ configurationDigest, session, memoryContext: memory.memoryContext, memorySessionDigest: configuration.memorySessionState.digest });
    const exchange = createDesktopStepExchange({ storage, namespace: `${namespace}/exchange`, contextDigest });
    const hostIdentity = { configurationDigest, contextDigest, session, memoryContext: memory.memoryContext,
      memoryBootstrapReceipt: memory.receipt, memoryBootstrapReceiptRef: memory.receiptRef };
    const initializationKey = `initialization:${configurationDigest}`;
    if (command !== "init" && !records.get(initializationKey)) fail("exact host configuration has not been initialized", "DR4963");
    const runKey = (runId, nodeId) => {
      if (typeof runId !== "string" || !runId || typeof nodeId !== "string" || !nodeId) fail("runId and nodeId are required");
      return `desktop-run:${canonicalJsonDigest({ namespace, runId, nodeId }).slice(7)}`;
    };
    const inspect = (input) => {
      const run = storage.readRun(runKey(input.runId, input.nodeId));
      if (run.state.configurationDigest !== configurationDigest || run.state.contextDigest !== contextDigest) fail("run context drifted; explicit context reconciliation is required", "DR4962", 6);
      return { outcome: "pass", scope: "module-invocation", lifecycleComplete: false, runId: input.runId, nodeId: input.nodeId, version: run.version,
        checkpointDigest: canonicalJsonDigest(run.state), state: run.state };
    };
    let registry;
    let graph;
    const executionContext = { artifacts: { async load(suppliedRef) {
      const raw = Object.keys(suppliedRef).sort().join(",") === "artifactId,digest";
      const ref = raw ? (records.get(`artifact-pointer:${pointerKey(suppliedRef)}`) ?? pointers.get(pointerKey(suppliedRef))) : suppliedRef;
      if (!ref) fail("raw artifact has no unique explicit binding", "DR4962");
      const persisted = records.get(`artifact:${canonicalJsonDigest(ref)}`);
      if (persisted) { if (!same(persisted.ref, ref)) fail("persisted artifact identity drifted"); return storage.getArtifact(persisted.stored); }
      return loadConfigured(ref);
    } }, checkpoints: effects };
    const prepareRuntime = async () => {
      if (registry) return;
      // Fixed package import and closed contract-set table, never a configured
      // module path or arbitrary JavaScript function name.
      const api = await import("./index.mjs");
      const sets = {
        requirements: [api.requirementsRuntimeArtifactContracts, api.requirementsTraceabilityContributors],
        architecture: [api.architectureRuntimeArtifactContracts, [...api.requirementsTraceabilityContributors, ...api.architectureTraceabilityContributors]],
        "work-breakdown": [api.workBreakdownRuntimeArtifactContracts, [...api.requirementsTraceabilityContributors, ...api.architectureTraceabilityContributors, ...api.workBreakdownTraceabilityContributors]],
      };
      const [contracts, contributors] = sets[configuration.contractSet];
      const plugins = configuration.plugins.map((entry) => {
        const definition = json(entry);
        if (!definition.metadata?.id?.startsWith("desktop-") || definition.implements?.length !== 1 || definition.implements[0].operations?.length !== 1 || definition.implements[0].operations[0].execution !== "effect") fail("Desktop exchange plugins must name one exact effect binding with a desktop- identity");
        return { definition, adapter: exchange.adapter };
      });
      const hostContributors = contributors.map((contributor) => configuration.requirementsObserverVersion === "1.1.0" && contributor.metadata.id === "devrelay.requirements-baseline-observer"
        ? createRequirementsActivationTraceabilityContributor() : contributor);
      graph = createTraceabilityGraphService({ projectId: configuration.projectId, graphId: configuration.graphId, contributors: hostContributors,
        store: createLocalHostTraceabilityStore({ storage, namespace: `${namespace}/graph`, graphId: configuration.graphId }) });
      registry = createModuleRegistry({ modules: configuration.modules.map(json), plugins, artifactContracts: contracts(), traceability: { graph, checkpoints: traces } });
    };
    const execute = async (input, resume) => {
      if (input.requirementsGate && (!resume || input.response || input.artifacts)) fail("Gate submission requires a separate exact resume without candidate ingestion");
      if (input.activateRequirementsGate !== undefined && (!resume || input.response || input.artifacts || input.requirementsGate ||
          !validateGateActivation(input.activateRequirementsGate))) fail("Gate activation requires a separate resume bound to the exact commit digest");
      if (input.activateRequirementsGate && configuration.requirementsObserverVersion !== "1.1.0") fail("Gate activation requires an explicitly initialized requirements observer 1.1.0 context", "DR4965", 4);
      if (session.outcome === "RoadmapNotInitialized") fail("establish the roadmap through its owning workflow before general execution", "DR4965", 4);
      if (input.taskId !== configuration.taskId) fail("taskId differs from the bound Desktop task");
      const id = runKey(input.runId, input.nodeId);
      let run;
      if (resume) {
        const observed = inspect(input);
        if (input.checkpointDigest !== observed.checkpointDigest) fail("resume checkpoint is stale", "DR4962", 6);
        run = storage.readRun(id);
      } else {
        assertLocalRequirementsCurrentPair({ storage, namespace: `${namespace}/requirements-gate`, projectId: configuration.projectId,
          pair: { requirementsBaseline: roleRef("requirements-baseline"), projectOverviewBaseline: roleRef("project-overview") } });
        const invocation = json(input.invocation);
        if (invocation.runId !== input.runId || invocation.nodeId !== input.nodeId) fail("invocation run/node identity differs from the requested run");
        const invocationKey = `invocation:${canonicalJsonDigest(invocation)}`;
        records.put(invocationKey, invocation);
        run = storage.initializeRun({ runId: id, state: { kind: "DesktopLocalRun", runId: input.runId, nodeId: input.nodeId, configurationDigest, contextDigest,
          invocationKey, status: "prepared", pendingRequestId: null, recordKey: null } });
      }
      const invocation = records.get(run.state.invocationKey);
      if (!invocation) fail("run invocation checkpoint is unavailable", "DR4962", 6);
      if (resume && !run.state.gateRecordKey) {
        assertLocalRequirementsCurrentPair({ storage, namespace: `${namespace}/requirements-gate`, projectId: configuration.projectId,
          pair: { requirementsBaseline: roleRef("requirements-baseline"), projectOverviewBaseline: roleRef("project-overview") } });
      }
      for (const grant of invocation.grants ?? []) {
        if (!["filesystem.read", "filesystem.write"].includes(grant.kind)) fail("Desktop result exchange cannot acquire process, network or secret grants", "DR4966");
        capability.authorize({ kind: grant.kind, path: grant.scope });
      }
      const overview = invocation.inputs?.["project-overview-baseline"];
      if (overview && (overview.length !== 1 || !same(overview[0], snapshot.bindings.find(({ role }) => role === "project-overview")?.artifact))) fail("module input does not bind the exact session ProjectOverview baseline", "DR4962", 6);
      const lease = storage.acquireLease({ runId: id, owner: `${configuration.taskId}:${process.pid}`, expectedVersion: run.version });
      try {
        if (input.response) {
          if (!resume || !run.state.pendingRequestId) fail("response requires an exact pending Desktop request");
          const response = json(input.response);
          if (response.requestId !== run.state.pendingRequestId) fail("response targets another pending request", "DR4962");
          for (const entry of input.artifacts ?? []) {
            const bytes = read({ path: entry.path, digest: entry.ref.digest });
            const stored = storage.putArtifact({ artifactId: entry.ref.artifactId, mediaType: entry.ref.mediaType, bytes, expectedDigest: entry.ref.digest });
            records.put(`artifact:${canonicalJsonDigest(entry.ref)}`, { ref: entry.ref, stored });
            records.put(`artifact-pointer:${pointerKey(entry.ref)}`, entry.ref);
          }
          exchange.submit(response);
        }
        await prepareRuntime();
        let nextState;
        if (input.requirementsGate) {
          if (!run.state.recordKey || run.state.pendingRequestId) fail("Gate submission requires a completed Core record", "DR4965", 4);
          const submission = json(input.requirementsGate);
          if (!validateGateSubmission(submission)) fail("requirements Gate submission violates its closed contract");
          const replay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          // An existing configured project may evolve only its exact approved
          // pair. An unrelated initial example is never a replacement baseline.
          for (const [port, role] of [["requirements-baseline", "requirements-baseline"], ["project-overview-baseline", "project-overview"]]) {
            const loaded = replay.loadedInputs[port];
            if (loaded?.length !== 1 || !same(loaded[0].ref, roleRef(role))) fail("Gate change does not bind the current approved project pair", "DR4962", 6);
          }
          const baselineDocument = (entry) => {
            const bytes = read({ path: entry.path, digest: entry.ref.digest });
            let value;
            try { value = JSON.parse(bytes); } catch { fail("Gate baseline is not JSON"); }
            return { bytes, value, ref: entry.ref };
          };
          const requirements = baselineDocument(submission.requirementsBaseline);
          const overviewBaseline = baselineDocument(submission.projectOverviewBaseline);
          const gate = commitLocalRequirementsGate({ storage, namespace: `${namespace}/requirements-gate`, request: {
            checkpointReplay: replay,
            requirementsBaseline: requirements.value, requirementsBaselineRef: requirements.ref, requirementsBaselineBytes: requirements.bytes,
            projectOverviewBaseline: overviewBaseline.value, projectOverviewBaselineRef: overviewBaseline.ref, projectOverviewBaselineBytes: overviewBaseline.bytes,
            projectOverviewMarkdownBytes: read(submission.projectOverviewMarkdown),
            approvalEvidence: submission.approvalEvidence.map((entry) => ({
              ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }),
            })),
          } });
          const gateRecordKey = `requirements-gate:${gate.committed.commitDigest}`;
          records.put(gateRecordKey, gate.committed);
          nextState = { ...run.state, status: run.state.gateActivationKey ? "requirements-activated" : "awaiting-gate-activation", gateRecordKey };
        } else if (input.activateRequirementsGate) {
          if (!run.state.gateRecordKey) fail("Gate activation requires a validated pair checkpoint", "DR4965", 4);
          const gateRecord = records.get(run.state.gateRecordKey);
          if (gateRecord?.commitDigest !== input.activateRequirementsGate) fail("Gate activation commit is stale", "DR4962", 6);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const activation = await activateLocalRequirementsGate({ storage, namespace: `${namespace}/requirements-gate`, graph,
            checkpointReplay, record: gateRecord,
            resolveArtifact: async (ref) => ({ ref, bytes: await executionContext.artifacts.load(ref) }) });
          const gateActivationKey = `requirements-activation:${gateRecord.commitDigest}`;
          records.put(gateActivationKey, activation);
          nextState = { ...run.state, status: "requirements-activated", gateActivationKey };
        } else if (run.state.gateRecordKey) {
          // Ordinary replay cannot erase the Gate handoff or silently advance it.
          nextState = run.state;
        } else try {
          const record = await registry.execute(invocation, executionContext);
          const recordKey = `execution:${canonicalJsonDigest(record)}`;
          records.put(recordKey, record);
          nextState = { ...run.state, status: record.moduleResult.status === "completed" ? "module-completed" : record.moduleResult.status,
            pendingRequestId: null, recordKey };
        } catch (error) {
          if (!(error instanceof DesktopStepRequired)) throw error;
          nextState = { ...run.state, status: "awaiting-desktop", pendingRequestId: error.request.requestId, recordKey: null };
        }
        if (!same(nextState, run.state)) {
          storage.commitTransition({ runId: id, expectedVersion: run.version, leaseToken: lease.token,
            transition: { kind: "DesktopLocalRunProgress", invocationKey: run.state.invocationKey }, nextState });
        }
        const observed = inspect(input);
        return { ...observed, outcome: nextState.status === "module-completed" ? "completed" : nextState.status,
          ...(nextState.pendingRequestId ? { desktopRequest: exchange.readRequest(nextState.pendingRequestId) } : {}) };
      } finally { storage.releaseLease({ runId: id, leaseToken: lease.token }); }
    };
    const services = {
        bootstrap: async () => session,
        conclude: async () => fail("ProjectMemory conclusion must use its owning Gate", "DR4965", 4),
        run: (input) => execute(input, false), resume: (input) => execute(input, true), inspect,
        async verify(input) {
          const observed = inspect(input);
          if (!observed.state.recordKey) fail("run has no completed Core execution record", "DR4964", 7);
          await prepareRuntime();
          const receipt = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(records.get(observed.state.invocationKey), executionContext));
          const record = records.get(observed.state.recordKey);
          if (!same(receipt.moduleResult, record.moduleResult)) fail("Core receipt differs from stored execution", "DR4964", 7);
          const proof = graph.assertApplied(record.traceabilityUpdateRef);
          let requirementsGate = null;
          let requirementsActivation = null;
          if (observed.state.gateRecordKey) {
            const gateRecord = records.get(observed.state.gateRecordKey);
            try {
              requirementsGate = verifyLocalRequirementsGate({ checkpointReplay: receipt, record: gateRecord });
              if (observed.state.gateRecordKey !== `requirements-gate:${requirementsGate.commitDigest}`) fail("Gate record key differs from its exact commit", "DR4964", 7);
              if (observed.state.gateActivationKey) {
                if (observed.state.gateActivationKey !== `requirements-activation:${gateRecord.commitDigest}`) fail("Gate activation key differs from the validated pair", "DR4964", 7);
                requirementsActivation = await verifyLocalRequirementsActivation({ storage, namespace: `${namespace}/requirements-gate`, graph,
                  checkpointReplay: receipt, record: gateRecord,
                  resolveArtifact: async (ref) => ({ ref, bytes: await executionContext.artifacts.load(ref) }) });
                if (!same(requirementsActivation, records.get(observed.state.gateActivationKey))) fail("Gate activation record differs from stored graph proof", "DR4964", 7);
              }
            } catch { fail("requirements Gate checkpoint verification failed", "DR4964", 7); }
          }
          return { outcome: "verified", scope: "core-checkpoint-and-graph", lifecycleComplete: false,
            moduleResultDigest: canonicalJsonDigest(receipt.moduleResult), applicationProof: proof, requirementsGate, requirementsActivation, integrity: storage.verifyIntegrity() };
        },
      };
    const facade = createDevRelay({ projectId: configuration.projectId,
      host: createLocalHost({ hostId: "local.desktop", platform, services, grants: configuration.grants }) });
    const relay = Object.fromEntries(["run", "resume", "verify", "inspect"].map((operation) => [operation,
      (input) => facade[operation]({ ...input, taskId: input.taskId ?? configuration.taskId })]));
    const cli = createOperatorCli({
      initialize: async () => { records.put(initializationKey, hostIdentity); return { outcome: "initialized", scope: "host-context", lifecycleComplete: false, contextDigest, session, memoryContext: memory.memoryContext }; },
      relay,
      evidence: async (input) => {
        const observed = inspect(input);
        return { outcome: "pass", scope: "run-evidence", lifecycleComplete: false,
          initialization: records.get(initializationKey), execution: observed.state.recordKey ? records.get(observed.state.recordKey) : null,
          requirementsGate: observed.state.gateRecordKey ? records.get(observed.state.gateRecordKey) : null,
          requirementsActivation: observed.state.gateActivationKey ? records.get(observed.state.gateActivationKey) : null,
          pendingRequest: observed.state.pendingRequestId ? exchange.readRequest(observed.state.pendingRequestId) : null };
      },
    });
    return Object.freeze({ cli, close: () => storage.close() });
  } catch (error) { storage.close(); throw error; }
}
