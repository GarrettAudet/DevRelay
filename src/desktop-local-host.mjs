import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { canonicalJson, canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { compileArtifactSchema } from "./schema-validation.mjs";
import { createLocalHostStorage } from "./local-host-storage.mjs";
import { resolveWorkflowProfile } from "./workflow-profiles.mjs";
import { prepareLocalWorkQualityHandoff, verifyLocalWorkQualityHandoff, validateDesktopWorkQualitySubmission } from "./local-work-quality-handoff.mjs";
import { prepareLocalWorkExecutionHandoff, verifyLocalWorkExecutionHandoff, validateDesktopWorkExecutionSubmission } from "./local-work-execution-preparation.mjs";
import { createDurableWorkContinuityStore } from "./work-continuity.mjs";
import { claimLocalWorkContinuity, recoverLocalWorkContinuityClaim, verifyLocalWorkContinuityClaim } from "./local-work-continuity.mjs";
import { prepareLocalQualityPolicyGate, verifyLocalQualityPolicyGate } from "./local-quality-policy-gate.mjs";
import { activateLocalQualityPolicy, verifyLocalQualityPolicyActivation, assertLocalQualityPolicyCurrent } from "./local-quality-policy-activation.mjs";
import { qualityContinuityApprovedTraceabilityContributor } from "./quality-continuity-traceability-contributor.mjs";
import { createLocalHostCooperativeYield } from "./local-host-cooperative-yield.mjs";
import { prepareLocalExecutionBaselines } from "./local-execution-baselines.mjs";
import { createLocalHostLeaseKeeper, prepareLocalWorkQueue, assertLocalWorkQueueCurrent } from "./local-host-recovery.mjs";
import { deriveLocalWorkReadiness, assertLocalCompletionSnapshotCurrent } from "./local-work-readiness.mjs";
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
import { createLocalRequirementsContextHandoff } from "./local-requirements-context.mjs";
import { materializeLocalRequirementsContext, verifyLocalRequirementsContextFiles } from "./local-context-materialization.mjs";
import { createNativeDiscoveryBinding, nativeDiscoveryPlugin } from "./native-discovery-binding.mjs";
import { validateArchitectureDiscoveryArtifact } from "./architecture-discovery-artifact-validator.mjs";
import { createPairedArchitectureDiscoveryTraceabilityContributor } from "./architecture-discovery-traceability-contributor.mjs";
import { loadArchitectureDiscoveryInterpretation } from "./architecture-discovery-interpretation.mjs";
import { prepareDiscoveryInterpretationRevision, readDiscoveryInterpretationHistory } from "./discovery-interpretation-history.mjs";
import { prepareArchitectureDiscoveryGate } from "./architecture-discovery-gate.mjs";
import { activateLocalDiscoveryState, verifyLocalDiscoveryActivation, assertLocalArchitectureCurrentState } from "./local-discovery-activation.mjs";
import { createLocalArchitectureContext, materializeLocalArchitectureContext } from "./local-architecture-context.mjs";
import { prepareLocalArchitectureGate, verifyLocalArchitectureGate } from "./local-architecture-gate.mjs";
import { activateLocalArchitectureGate, verifyLocalArchitectureActivation } from "./local-architecture-activation.mjs";
import { prepareLocalContractPlanning, verifyLocalContractPlanning } from "./local-contract-planning.mjs";
import { executeLocalContractPlanning, verifyLocalContractExecution } from "./local-contract-execution.mjs";
import { prepareLocalContractGate, verifyLocalContractGate } from "./local-contract-gate.mjs";
import { contractTraceabilityContributors, createContractNotApplicableTraceabilityContributor } from "./contract-traceability-contributor.mjs";
import { publishLocalContractCandidateTrace, verifyLocalContractCandidateTrace } from "./local-contract-traceability.mjs";
import { activateLocalContractGate, verifyLocalContractActivation, activateLocalContractsNotApplicable, verifyLocalContractsNotApplicableActivation } from "./local-contract-activation.mjs";
import { prepareLocalContractsNotApplicable, verifyLocalContractsNotApplicable } from "./local-contract-not-applicable.mjs";
import { createArchitectureActivationTraceabilityContributor } from "./architecture-traceability-contributor.mjs";
import { createLocalWorkBreakdownContext, materializeLocalWorkBreakdownContext, verifyLocalWorkBreakdownContext, assertLocalWorkInvocationCurrent } from "./local-work-breakdown-context.mjs";
import { prepareLocalWorkBreakdownGate, verifyLocalWorkBreakdownGate } from "./local-work-breakdown-gate.mjs";
import { activateLocalWorkBaseline, verifyLocalWorkBaselineActivation } from "./local-work-baseline-activation.mjs";
import { createWorkBreakdownApprovalTraceabilityContributor } from "./work-breakdown-traceability-contributor.mjs";
import { TRACEABILITY_VOCABULARY_V1_9 } from "./traceability-artifact-validator.mjs";
import { verifyDependencyPredecessor, assertDependencyPredecessorCurrent } from "./local-work-dependency-planning.mjs";
import { assertLocalWorkDependencyContextCurrent, createLocalWorkDependencyContext, verifyLocalWorkDependencyContext, materializeLocalWorkDependencyContext } from "./local-work-dependency-context.mjs";
import { executeLocalWorkDependencyPlanning, verifyLocalWorkDependencyExecution } from "./local-work-dependency-execution.mjs";
import { prepareLocalWorkDependencyGate, verifyLocalWorkDependencyGate } from "./local-work-dependency-gate.mjs";
import { activateLocalDependencyBaseline, verifyLocalDependencyBaselineActivation } from "./local-dependency-baseline-activation.mjs";
import { createWorkDependencyActivationTraceabilityContributor } from "./work-dependency-traceability-contributor.mjs";
import { createLocalSpecialistAssignmentContext, verifyLocalSpecialistAssignmentContext, materializeLocalSpecialistAssignmentContext, assertLocalSpecialistAssignmentContextCurrent } from "./local-specialist-assignment-context.mjs";
import { executeLocalSpecialistAssignment, verifyLocalSpecialistAssignmentExecution } from "./local-specialist-assignment-execution.mjs";
import { prepareSpecialistAssignmentGateV3, verifySpecialistAssignmentGateV3 } from "./specialist-assignment-gate-v3.mjs";
import { activateLocalAssignmentBaseline, verifyLocalAssignmentBaselineActivation } from "./local-assignment-baseline-activation.mjs";
import { createSpecialistAssignmentActivationTraceabilityContributor } from "./specialist-assignment-traceability-contributor.mjs";

const schema = (name) => JSON.parse(readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"));
const supportedAssignmentModule = JSON.parse(readFileSync(new URL("../examples/modules/specialist-assignment-v3.module.json", import.meta.url), "utf8"));
const validateConfiguration = compileArtifactSchema(schema("desktop-local-host-configuration.schema.json"), [schema("module-result.schema.json")]);
const validateGateSubmission = compileArtifactSchema(schema("desktop-requirements-gate-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateDiscoverySubmission = compileArtifactSchema(schema("discovery-interpretation-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateDiscoveryGateSubmission = compileArtifactSchema(schema("desktop-discovery-gate-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateArchitectureGateSubmission = compileArtifactSchema(schema("desktop-architecture-gate-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateContractGateSubmission = compileArtifactSchema(schema("desktop-contract-gate-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateContractNotApplicableSubmission = compileArtifactSchema(schema("desktop-contract-not-applicable-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateGateActivation = compileArtifactSchema(schema("desktop-requirements-gate-activation.schema.json"));
const validateQualityPolicySubmission = compileArtifactSchema(schema("desktop-quality-policy-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateWorkClaim = compileArtifactSchema(schema("desktop-work-claim.schema.json"));
const validateWorkClaimRecord = compileArtifactSchema(schema("local-work-execution-claim.schema.json"), [schema("desktop-work-claim.schema.json"), schema("work-continuity-artifacts.schema.json")]);
const validateWorkSubmissionV2 = compileArtifactSchema(schema("desktop-work-context-submission-v2.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateWorkSubmission = compileArtifactSchema(schema("desktop-work-context-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateDependencyReplacementSubmission = compileArtifactSchema(schema("desktop-dependency-context-submission-v2.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateDependencySubmission = compileArtifactSchema(schema("desktop-dependency-context-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateAssignmentSubmission = compileArtifactSchema(schema("desktop-assignment-context-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateAssignmentGateSubmission = compileArtifactSchema(schema("desktop-assignment-gate-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateDependencyGateSubmission = compileArtifactSchema(schema("desktop-dependency-gate-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const validateWorkGateSubmission = compileArtifactSchema(schema("desktop-work-breakdown-gate-submission.schema.json"), [schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json"), schema("work-breakdown-artifacts.schema.json")]);
const validateContextRefresh = compileArtifactSchema(schema("requirements-context-refresh.schema.json"));
const validateContextSelection = compileArtifactSchema({ $ref: "https://devrelay.dev/host/requirements-context-materialization/v1#/$defs/selection" },
  [schema("requirements-context-materialization.schema.json"), schema("desktop-local-host-configuration.schema.json"), schema("module-result.schema.json")]);
const requirementsStatus = (state, fallback) => state.contextMaterializationKey ? "requirements-context-materialized"
  : state.contextHandoffKey ? "requirements-context-prepared" : state.gateActivationKey ? "requirements-activated" : fallback;
const same = (a, b) => a === undefined || b === undefined ? a === b : canonicalJson(a) === canonicalJson(b);
const fail = (message, code = "DR4960", exitCode = 2) => { throw new OperatorCliError(message, code, exitCode); };
const inside = (root, target) => { const r = path.relative(root, target); return r !== "" && !path.isAbsolute(r) && r !== ".." && !r.startsWith(`..${path.sep}`); };

// This is an explicit native host, not a user-code loader. All executable code
// comes from this package; configured files contain contract/artifact JSON only.
export async function openDesktopLocalHost({ configurationPath, configurationDigest, command, platform = process.platform,
  clock = Date.now, scheduler = { setInterval, clearInterval } } = {}) {
  if (typeof clock !== "function" || typeof scheduler?.setInterval !== "function" || typeof scheduler?.clearInterval !== "function") fail("invalid host clock or scheduler");
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
  const storage = createLocalHostStorage({ rootDirectory: stateDirectory, clock, readOnly: !["init", "run", "resume"].includes(command) });
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
    let activeLeaseKeeper;
    const yieldCooperatively = createLocalHostCooperativeYield({ now: clock });
    const cooperate = async () => {
      activeLeaseKeeper?.throwIfFailed();
      await yieldCooperatively();
      activeLeaseKeeper?.throwIfFailed();
    };
    const executionContext = { artifacts: { async load(suppliedRef) {
      await cooperate();
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
      const discoveryEvidenceContracts = () => [
        { schema: "https://devrelay.dev/evidence/repository-file/v1", representation: "utf8-text", validate: value => {
          if (typeof value !== "string") throw new TypeError("repository source evidence must be UTF-8 text");
        } },
        ...["snapshot", "gap", "nativeInventory", "observation"].map(kind => ({ schema: `https://devrelay.dev/contracts/architecture-discovery-artifacts.schema.json#/$defs/${kind}`, validate: validateArchitectureDiscoveryArtifact })),
      ];
      const sets = {
        requirements: [api.requirementsRuntimeArtifactContracts, api.requirementsTraceabilityContributors],
        architecture: [() => [...api.workBreakdownRuntimeArtifactContracts(), ...discoveryEvidenceContracts()], [...api.requirementsTraceabilityContributors, ...api.architectureTraceabilityContributors, createPairedArchitectureDiscoveryTraceabilityContributor()]],
        "architecture-discovery": [() => [...api.architectureRuntimeArtifactContracts().filter(contract => contract.schema !== "https://devrelay.dev/artifacts/project-architecture-state/v1"),
          { schema: "https://devrelay.dev/artifacts/project-architecture-state/v1", validate: value => api.validateArchitectureArtifact(value) },
          ...discoveryEvidenceContracts()],
          [...api.requirementsTraceabilityContributors, ...api.architectureTraceabilityContributors, createPairedArchitectureDiscoveryTraceabilityContributor()]],
        "work-breakdown": [() => [...api.workBreakdownRuntimeArtifactContracts(), ...api.workDependencyRuntimeArtifactContracts()], [...api.requirementsTraceabilityContributors, ...api.architectureTraceabilityContributors, ...api.workBreakdownTraceabilityContributors]],
        "work-dependency": [() => [...api.workBreakdownRuntimeArtifactContracts(), ...api.workDependencyRuntimeArtifactContracts()],
          [...api.requirementsTraceabilityContributors, ...api.architectureTraceabilityContributors, ...api.workBreakdownTraceabilityContributors]],
        "specialist-assignment": [() => [...api.workBreakdownRuntimeArtifactContracts(), ...api.workDependencyRuntimeArtifactContracts(),
          ...Object.values(api.SPECIALIST_ASSIGNMENT_ARTIFACT_CONTRACTS).map(contract => ({ schema: contract.schema, validate: api.validateSpecialistAssignmentArtifact }))],
          [...api.requirementsTraceabilityContributors, ...api.architectureTraceabilityContributors, ...api.workBreakdownTraceabilityContributors]],
      };
      const [contracts, contributors] = sets[configuration.contractSet];
      const plugins = configuration.plugins.map((entry) => {
        const definition = json(entry);
        if (same(definition, nativeDiscoveryPlugin)) return { definition, adapter: createNativeDiscoveryBinding({
          loadArtifact: executionContext.artifacts.load, readSource: relative => readFileSync(scopedPath(relative)),
          requirementsRef: roleRef("requirements-baseline"), overviewRef: roleRef("project-overview"), repositoryRevision: snapshot.repositoryRevision,
          checkpoints: createLocalHostCheckpointStore({ storage, namespace: `${namespace}/native-discovery` }),
          saveArtifact: (ref, bytes) => {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          },
        }) };
        if (!definition.metadata?.id?.startsWith("desktop-") || definition.implements?.length !== 1 || definition.implements[0].operations?.length !== 1 || definition.implements[0].operations[0].execution !== "effect") fail("Desktop exchange plugins must name one exact effect binding with a desktop- identity");
        return { definition, adapter: exchange.adapter };
      });
      const hostContributors = [...contributors, ...contractTraceabilityContributors, qualityContinuityApprovedTraceabilityContributor, createContractNotApplicableTraceabilityContributor(), createWorkBreakdownApprovalTraceabilityContributor(), createWorkDependencyActivationTraceabilityContributor(), createSpecialistAssignmentActivationTraceabilityContributor()].map((contributor) => configuration.requirementsObserverVersion === "1.1.0" && contributor.metadata.id === "devrelay.requirements-baseline-observer"
        ? createRequirementsActivationTraceabilityContributor() : configuration.architectureObserverVersion === "1.1.0" && contributor.metadata.id === "devrelay.architecture-baseline-observer"
          ? createArchitectureActivationTraceabilityContributor() : contributor);
      graph = createTraceabilityGraphService({ projectId: configuration.projectId, graphId: configuration.graphId, contributors: hostContributors,
        ...(configuration.traceabilityVocabularyVersion === "1.9.0" ? { vocabulary: TRACEABILITY_VOCABULARY_V1_9 } : {}),
        store: createLocalHostTraceabilityStore({ storage, namespace: `${namespace}/graph`, graphId: configuration.graphId }) });
      registry = createModuleRegistry({ modules: configuration.modules.map(json), plugins, artifactContracts: contracts(), traceability: { graph, checkpoints: traces } });
    };
    const verifyDiscoveryInterpretation = async (interpretationRef, receipt, loadArtifact) => {
      const loaded = await loadArchitectureDiscoveryInterpretation({ interpretationRef, loadArtifact });
      const candidate = loaded.interpretation.value;
      const outputs = receipt.moduleResult.outputs?.["current-architecture-snapshot"];
      if (receipt.moduleResult.outcome !== "discovered" || outputs?.length !== 1 || !same(outputs[0], candidate.discoverySnapshot)) fail("interpretation does not bind the exact completed discovery output", "DR4962", 6);
      for (const [port, ref] of [["project-architecture-state", candidate.projectArchitectureState], ["requirements-baseline", candidate.requirementsBaseline], ["project-overview-baseline", candidate.projectOverviewBaseline]]) {
        const inputs = receipt.loadedInputs[port];
        if (inputs?.length !== 1 || !same(inputs[0].ref, ref)) fail("interpretation changes the discovery input context", "DR4962", 6);
      }
      return { interpretationRef, authority: "candidate", discoverySnapshot: candidate.discoverySnapshot,
        structuredSnapshot: candidate.structuredSnapshot, unresolvedObservations: candidate.observations.filter(entry => entry.disposition === "unresolved").length,
        blockingGaps: loaded.structured.value.gaps.filter(gap => gap.blocking).length };
    };
    const assignmentRequest = async (run, invocation, load = executionContext.artifacts.load) => {
      const handoff = run.state.dependencyContextKey && records.get(run.state.dependencyContextKey);
      const gate = run.state.dependencyGateKey && records.get(run.state.dependencyGateKey);
      const execution = run.state.dependencyExecutionKey && records.get(run.state.dependencyExecutionKey);
      const activation = run.state.dependencyActivationKey && records.get(run.state.dependencyActivationKey);
      if (!handoff || !gate || !execution || !activation) fail("assignment context requires an activated dependency baseline", "DR4962", 6);
      const stateFile = handoff.files.find(entry => same(entry.ref, handoff.state));
      if (!stateFile) fail("assignment context lacks its exact dependency state", "DR4962", 6);
      const bytes = Buffer.from(stateFile.bytesBase64, "base64");
      const state = JSON.parse(bytes);
      const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
      const request = { storage, namespace, graph, registry, checkpointReplay, dependencyGate: gate, execution,
        record: records.get(run.state.workGateKey), boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))),
        expectedState: { ref: handoff.state, bytes }, contextSliceSet: state.contextSliceSet, policyBundle: state.policyBundle, currentWorkDependencyBaseline: state.currentWorkDependencyBaseline,
        binding: configuration.dependencyBinding, priorSnapshot: handoff.snapshot, priorReceipt: handoff.receipt,
        loadArtifact: async ref => {
          await cooperate();
          const file = handoff.files.find(entry => same(entry.ref, ref));
          return file ? Buffer.from(file.bytesBase64, "base64") : load(ref);
        } };
      const verified = await verifyLocalDependencyBaselineActivation(request);
      if (run.state.dependencyActivationKey !== `dependency-activation-record:${gate.commitDigest}` || !same(verified, activation)) fail("assignment activation evidence drifted", "DR4962", 6);
      return request;
    };
    const assignmentExecutionRequest = async (run, invocation, handoff) => {
      if (!configuration.modules.some(file => same(json(file), supportedAssignmentModule))) fail("assignment execution requires the exact configured v3 Module", "DR4962", 6);
      const request = await assignmentRequest(run, invocation);
      await verifyLocalSpecialistAssignmentContext({ ...request, handoff,
        specialistCatalog: handoff.plan.inputs["specialist-catalog"], assignmentPolicy: handoff.plan.inputs["assignment-policy"] });
      return { ...request, specialistCatalog: handoff.plan.inputs["specialist-catalog"], assignmentPolicy: handoff.plan.inputs["assignment-policy"],
        assignmentPlan: handoff.plan, assignmentBinding: configuration.assignmentBinding };
    };
    const execute = async (input, resume) => {
      for (const control of ["prepareAssignmentContext", "materializeAssignmentContext", "executeAssignment", "assignmentGate", "activateAssignmentGate", "prepareWorkQueue", "prepareWorkQuality", "qualityPolicyGate", "activateQualityPolicy", "prepareWorkExecution", "claimWorkExecution"]) {
        if (input[control] !== undefined && (!resume || Object.keys(input).some(name => !["projectId", "taskId", "runId", "nodeId", "goal", "invocation", "checkpointDigest", "profile", "projectRiskContext", "approvals", "sessionContext", "configurationDigest", "host", control].includes(name)))) fail("assignment context requires a separate exact resume");
      }
      if (input.materializeAssignmentContext !== undefined && !validateGateActivation(input.materializeAssignmentContext)) fail("assignment publication requires an exact handoff digest");
      if (input.executeAssignment !== undefined && !validateGateActivation(input.executeAssignment)) fail("assignment execution requires an exact handoff digest");
      if (input.activateAssignmentGate !== undefined && !validateGateActivation(input.activateAssignmentGate)) fail("assignment activation requires an exact Gate digest");
      if (input.prepareWorkQueue !== undefined && !validateGateActivation(input.prepareWorkQueue)) fail("work queue requires an exact assignment Gate digest");
      if (input.activateQualityPolicy !== undefined && !validateGateActivation(input.activateQualityPolicy)) fail("quality activation requires an exact preparation digest");
      for (const control of ["prepareDependencyContext", "materializeDependencyContext", "executeDependencyPlanning", "dependencyGate", "activateDependencyGate"]) {
        if (input[control] !== undefined && (!resume || Object.keys(input).some(name => !["projectId", "taskId", "runId", "nodeId", "goal", "invocation", "checkpointDigest", "profile", "projectRiskContext", "approvals", "sessionContext", "configurationDigest", "host", control].includes(name)))) fail("dependency context requires a separate exact resume");
      }
      if (input.materializeDependencyContext !== undefined && !validateGateActivation(input.materializeDependencyContext)) fail("dependency publication requires an exact handoff digest");
      if (input.executeDependencyPlanning !== undefined && !validateGateActivation(input.executeDependencyPlanning)) fail("dependency execution requires an exact handoff digest");
      if (input.activateDependencyGate !== undefined && !validateGateActivation(input.activateDependencyGate)) fail("dependency activation requires an exact Gate digest");
      if (input.activateWorkBreakdownGate !== undefined && (!resume || !validateGateActivation(input.activateWorkBreakdownGate) ||
          Object.keys(input).some(name => !["projectId", "taskId", "runId", "nodeId", "goal", "invocation", "checkpointDigest", "profile", "projectRiskContext", "approvals", "sessionContext", "configurationDigest", "host", "activateWorkBreakdownGate"].includes(name)))) fail("work activation requires a separate resume with the exact Gate digest");
      if (input.workBreakdownGate !== undefined && (!resume ||
          ["materializeWorkBreakdownContext", "prepareWorkBreakdownContext", "response", "artifacts", "contractsNotApplicable", "activateContractGate", "contractGate", "executeContracts", "prepareContractPlanning", "architectureGate", "activateArchitectureGate", "discoveryInterpretation", "discoveryGate", "activateDiscoveryGate", "requirementsGate", "activateRequirementsGate", "refreshRequirementsContext", "materializeRequirementsContext", "prepareArchitectureContext", "materializeArchitectureContext"].some(name => input[name] !== undefined))) fail("work Gate requires a separate exact resume");
      if (input.materializeWorkBreakdownContext !== undefined && (!resume || !validateGateActivation(input.materializeWorkBreakdownContext) ||
          ["prepareWorkBreakdownContext", "response", "artifacts", "contractsNotApplicable", "activateContractGate", "contractGate", "executeContracts", "prepareContractPlanning", "architectureGate", "activateArchitectureGate", "discoveryInterpretation", "discoveryGate", "activateDiscoveryGate", "requirementsGate", "activateRequirementsGate", "refreshRequirementsContext", "materializeRequirementsContext", "prepareArchitectureContext", "materializeArchitectureContext"].some(name => input[name] !== undefined))) fail("work materialization requires a separate exact resume");
      if (input.prepareWorkBreakdownContext !== undefined && (!resume ||
          ["response", "artifacts", "contractsNotApplicable", "activateContractGate", "contractGate", "executeContracts", "prepareContractPlanning", "architectureGate", "activateArchitectureGate", "discoveryInterpretation", "discoveryGate", "activateDiscoveryGate", "requirementsGate", "activateRequirementsGate", "refreshRequirementsContext", "materializeRequirementsContext", "prepareArchitectureContext", "materializeArchitectureContext"].some(name => input[name] !== undefined))) fail("work context requires a separate exact resume");
      if (input.contractsNotApplicable !== undefined && (!resume ||
          ["response", "artifacts", "activateContractGate", "contractGate", "executeContracts", "prepareContractPlanning", "architectureGate", "activateArchitectureGate", "discoveryInterpretation", "discoveryGate", "activateDiscoveryGate", "requirementsGate", "activateRequirementsGate", "refreshRequirementsContext", "materializeRequirementsContext", "prepareArchitectureContext", "materializeArchitectureContext"].some(name => input[name] !== undefined))) fail("not-applicable approval requires a separate exact resume");
      if (input.activateContractGate !== undefined && (!resume || !validateGateActivation(input.activateContractGate) ||
          ["response", "artifacts", "contractGate", "executeContracts", "prepareContractPlanning", "architectureGate", "activateArchitectureGate", "discoveryInterpretation", "discoveryGate", "activateDiscoveryGate", "requirementsGate", "activateRequirementsGate", "refreshRequirementsContext", "materializeRequirementsContext", "prepareArchitectureContext", "materializeArchitectureContext"].some(name => input[name] !== undefined))) fail("contract activation requires a separate resume with the exact Gate digest");
      if (input.contractGate !== undefined && (!resume ||
          ["response", "artifacts", "executeContracts", "prepareContractPlanning", "architectureGate", "activateArchitectureGate", "discoveryInterpretation", "discoveryGate", "activateDiscoveryGate", "requirementsGate", "activateRequirementsGate", "refreshRequirementsContext", "materializeRequirementsContext", "prepareArchitectureContext", "materializeArchitectureContext"].some(name => input[name] !== undefined))) fail("contract Gate requires a separate exact resume");
      if (input.executeContracts !== undefined && (!resume || !validateGateActivation(input.executeContracts) ||
          ["response", "artifacts", "prepareContractPlanning", "architectureGate", "activateArchitectureGate", "discoveryInterpretation", "discoveryGate", "activateDiscoveryGate", "requirementsGate", "activateRequirementsGate", "refreshRequirementsContext", "materializeRequirementsContext", "prepareArchitectureContext", "materializeArchitectureContext"].some(name => input[name] !== undefined))) fail("contract execution requires a separate resume with the exact planning digest");
      if (input.prepareContractPlanning !== undefined && (!resume || !validateGateActivation(input.prepareContractPlanning) ||
          ["response", "artifacts", "architectureGate", "activateArchitectureGate", "discoveryInterpretation", "discoveryGate", "activateDiscoveryGate", "requirementsGate", "activateRequirementsGate", "refreshRequirementsContext", "materializeRequirementsContext", "prepareArchitectureContext", "materializeArchitectureContext"].some(name => input[name] !== undefined))) fail("contract planning requires a separate resume with the exact architecture Gate digest");
      if (input.activateArchitectureGate !== undefined && (!resume || !/^sha256:[a-f0-9]{64}$/u.test(input.activateArchitectureGate) ||
          ["response", "artifacts", "architectureGate", "discoveryInterpretation", "discoveryGate", "activateDiscoveryGate", "requirementsGate", "activateRequirementsGate", "refreshRequirementsContext", "materializeRequirementsContext", "prepareArchitectureContext", "materializeArchitectureContext"].some(name => input[name] !== undefined))) fail("architecture activation requires a separate resume with the exact Gate digest");
      if (input.architectureGate !== undefined && (!resume || ["response", "artifacts", "discoveryInterpretation", "discoveryGate", "activateDiscoveryGate", "requirementsGate", "activateRequirementsGate", "refreshRequirementsContext", "materializeRequirementsContext", "prepareArchitectureContext", "materializeArchitectureContext"].some(name => input[name] !== undefined))) fail("architecture Gate requires a separate exact resume");
      for (const name of ["prepareArchitectureContext", "materializeArchitectureContext"]) {
        if (input[name] !== undefined && (!resume || ["response", "artifacts", "discoveryInterpretation", "discoveryGate", "activateDiscoveryGate", "requirementsGate", "activateRequirementsGate", "refreshRequirementsContext", "materializeRequirementsContext", "prepareArchitectureContext", "materializeArchitectureContext"].some(other => other !== name && input[other] !== undefined))) fail("architecture context requires a separate exact resume");
      }
      if (input.prepareArchitectureContext !== undefined && !validateContextRefresh(input.prepareArchitectureContext)) fail("architecture context requires an explicit timestamp");
      if (input.materializeArchitectureContext !== undefined && !validateGateActivation(input.materializeArchitectureContext)) fail("architecture context publication requires an exact handoff digest");
      if (input.activateDiscoveryGate !== undefined && (!resume || input.discoveryGate || input.discoveryInterpretation || input.response || input.artifacts || input.requirementsGate || input.activateRequirementsGate || input.refreshRequirementsContext || input.materializeRequirementsContext ||
          !/^sha256:[a-f0-9]{64}$/u.test(input.activateDiscoveryGate))) fail("discovery activation requires a separate resume with the exact Gate commit digest");
      if (input.discoveryGate !== undefined && (!resume || input.discoveryInterpretation || input.response || input.artifacts || input.requirementsGate || input.activateRequirementsGate || input.refreshRequirementsContext || input.materializeRequirementsContext)) fail("discovery Gate requires a separate exact resume");
      if (input.discoveryInterpretation !== undefined && (!resume || input.response || input.artifacts || input.requirementsGate || input.activateRequirementsGate || input.refreshRequirementsContext || input.materializeRequirementsContext)) fail("discovery interpretation requires a separate exact resume");
      if (input.materializeRequirementsContext !== undefined && (!resume || input.response || input.artifacts || input.requirementsGate || input.activateRequirementsGate || input.refreshRequirementsContext ||
          !validateContextSelection(input.materializeRequirementsContext))) fail("context materialization requires a separate resume bound to its handoff digest");
      if (input.refreshRequirementsContext !== undefined && (!resume || input.response || input.artifacts || input.requirementsGate || input.activateRequirementsGate ||
          !validateContextRefresh(input.refreshRequirementsContext))) fail("context refresh requires a separate resume with an explicit timestamp");
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
        if (invocation.inputs?.["project-work-dependency-state"]) {
          const states = invocation.inputs["project-work-dependency-state"];
          if (states.length !== 1) fail("dependency invocation requires one exact state", "DR4962", 6);
          assertLocalWorkDependencyContextCurrent({ storage, namespace, state: states[0], boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))) });
        }
        if (invocation.inputs?.["project-work-breakdown-state"]) {
          const states = invocation.inputs["project-work-breakdown-state"];
          if (states.length !== 1) fail("work invocation requires one exact state", "DR4962", 6);
          await assertLocalWorkInvocationCurrent({ storage, namespace, loadArtifact: loadConfigured, state: states[0], boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))) });
        }
        if (invocation.inputs?.["project-architecture-state"]?.length === 1) {
          try { assertLocalArchitectureCurrentState({ storage, namespace, state: invocation.inputs["project-architecture-state"][0] }); }
          catch (error) { fail(error.message, "DR4962", 6); }
        }
        if (invocation.runId !== input.runId || invocation.nodeId !== input.nodeId) fail("invocation run/node identity differs from the requested run");
        const invocationKey = `invocation:${canonicalJsonDigest(invocation)}`;
        records.put(invocationKey, invocation);
        run = storage.initializeRun({ runId: id, state: { kind: "DesktopLocalRun", runId: input.runId, nodeId: input.nodeId, configurationDigest, contextDigest,
          invocationKey, status: "prepared", pendingRequestId: null, recordKey: null } });
      }
      const invocation = records.get(run.state.invocationKey);
      if (!invocation) fail("run invocation checkpoint is unavailable", "DR4962", 6);
      if (resume && input.response && invocation.inputs?.["project-work-dependency-state"]?.length === 1) {
        assertLocalWorkDependencyContextCurrent({ storage, namespace, state: invocation.inputs["project-work-dependency-state"][0],
          boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))) });
      }
      if (resume && input.response && invocation.inputs?.["project-work-breakdown-state"]?.length === 1) {
        await assertLocalWorkInvocationCurrent({ storage, namespace, loadArtifact: loadConfigured, state: invocation.inputs["project-work-breakdown-state"][0],
          boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))) });
      }
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
      const leaseKeeper = createLocalHostLeaseKeeper({ storage, runId: id,
        owner: `${configuration.taskId}:${process.pid}`, expectedVersion: run.version, scheduler });
      activeLeaseKeeper = leaseKeeper;
      const { lease } = leaseKeeper;
      let validateParentState = () => {};
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
        if (input.qualityPolicyGate) {
          const submission = json(input.qualityPolicyGate);
          if (!validateQualityPolicySubmission(submission)) fail("quality policy submission violates closed contract");
          const entries = [submission.candidate, submission.approval, ...(submission.previousBaseline ? [submission.previousBaseline] : [])];
          const supplied = new Map(entries.map(entry => [canonicalJsonDigest(entry.ref), { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) }]));
          if (supplied.size !== entries.length) fail("duplicate quality policy input");
          const prepared = await prepareLocalQualityPolicyGate({ candidateRef: submission.candidate.ref, approvalRef: submission.approval.ref,
            previousBaselineRef: submission.previousBaseline?.ref ?? null, loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes });
          if (prepared.previousBaseline) assertLocalQualityPolicyCurrent({ storage, namespace, baseline: prepared.previousBaseline.ref });
          for (const { ref, bytes } of supplied.values()) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          const qualityPolicyGateKey = `quality-policy-gate:${prepared.preparationDigest}`;
          records.put(qualityPolicyGateKey, prepared);
          nextState = { ...run.state, qualityPolicyGateKey, status: "quality-policy-prepared" };
        } else if (input.activateQualityPolicy) {
          const record = run.state.qualityPolicyGateKey && records.get(run.state.qualityPolicyGateKey);
          if (!record || record.preparationDigest !== input.activateQualityPolicy) fail("quality policy preparation is missing or stale", "DR4962", 6);
          const activation = await activateLocalQualityPolicy({ storage, namespace, graph, record, loadArtifact: executionContext.artifacts.load });
          assertLocalQualityPolicyCurrent({ storage, namespace, baseline: activation.baseline });
          const qualityPolicyActivationKey = `quality-policy-activation-record:${record.preparationDigest}`;
          records.put(qualityPolicyActivationKey, activation);
          nextState = { ...run.state, qualityPolicyActivationKey,
            ...(run.state.qualityPolicyActivationKey === qualityPolicyActivationKey ? {} : { workQualityKeys: {} }), status: "quality-policy-activated" };
        } else if (input.discoveryInterpretation) {
          if (run.state.discoveryGateKey) fail("a sealed discovery Gate cannot be replaced by a candidate revision", "DR4962", 6);
          if (!run.state.recordKey || run.state.pendingRequestId) fail("interpretation requires a completed Core discovery record", "DR4965", 4);
          const submission = json(input.discoveryInterpretation);
          if (!validateDiscoverySubmission(submission)) fail("discovery interpretation submission violates its closed contract");
          const receipt = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const entries = [submission.interpretation, ...submission.artifacts];
          const supplied = new Map();
          for (const entry of entries) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate interpretation artifact");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          const candidateRecord = await verifyDiscoveryInterpretation(submission.interpretation.ref, receipt,
            ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? executionContext.artifacts.load(ref));
          let revision;
          try { revision = prepareDiscoveryInterpretationRevision({ candidate: candidateRecord,
            headKey: run.state.discoveryInterpretationKey ?? null, replacesInterpretation: submission.replacesInterpretation,
            readRecord: key => records.get(key) }); }
          catch (error) { fail(error.message, "DR4962", 6); }
          const discoveryInterpretationKey = revision.key;
          for (const { ref, bytes } of supplied.values()) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(discoveryInterpretationKey, revision.record);
          nextState = { ...run.state, status: "awaiting-discovery-approval", discoveryInterpretationKey };
        } else if (input.discoveryGate) {
          if (!run.state.recordKey || run.state.pendingRequestId || !run.state.discoveryInterpretationKey) fail("discovery Gate requires an exact completed interpretation", "DR4965", 4);
          const submission = json(input.discoveryGate);
          if (!validateDiscoveryGateSubmission(submission)) fail("discovery Gate submission violates its closed contract");
          const receipt = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const history = readDiscoveryInterpretationHistory({ headKey: run.state.discoveryInterpretationKey, readRecord: key => records.get(key) });
          const supplied = new Map();
          for (const entry of [submission.ownerApproval, ...submission.artifacts]) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate discovery Gate artifact");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          let gate;
          try { gate = await prepareArchitectureDiscoveryGate({ checkpointReplay: receipt,
            interpretationRef: history[0].record.interpretationRef, ownerApprovalRef: submission.ownerApproval.ref,
            loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? executionContext.artifacts.load(ref) }); }
          catch (error) { fail(error.message, "DR4962", 6); }
          const discoveryGateKey = `discovery-gate:${gate.commitDigest}`;
          if (run.state.discoveryGateKey && run.state.discoveryGateKey !== discoveryGateKey) fail("another discovery Gate is already sealed", "DR4962", 6);
          for (const { ref, bytes } of supplied.values()) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(discoveryGateKey, gate);
          nextState = { ...run.state, status: run.state.architectureContextFilesKey ? "architecture-context-materialized" : run.state.architectureContextKey ? "architecture-context-prepared" : run.state.discoveryActivationKey ? "discovery-activated" : "awaiting-gate-activation", discoveryGateKey };
        } else if (input.activateDiscoveryGate) {
          const gate = run.state.discoveryGateKey && records.get(run.state.discoveryGateKey);
          if (!gate || gate.commitDigest !== input.activateDiscoveryGate) fail("discovery activation requires the exact prepared Gate commit", "DR4962", 6);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          let activation;
          try { activation = await activateLocalDiscoveryState({ storage, namespace, checkpointReplay, gate, loadArtifact: executionContext.artifacts.load }); }
          catch (error) { fail(error.message, "DR4962", 6); }
          const discoveryActivationKey = `discovery-activation:${activation.activationDigest}`;
          records.put(`artifact:${canonicalJsonDigest(activation.state)}`, { ref: activation.state, stored: activation.storedState });
          records.put(`artifact-pointer:${pointerKey(activation.state)}`, activation.state);
          records.put(discoveryActivationKey, activation);
          nextState = { ...run.state, status: run.state.architectureContextFilesKey ? "architecture-context-materialized" : run.state.architectureContextKey ? "architecture-context-prepared" : "discovery-activated", discoveryActivationKey };
        } else if (input.prepareArchitectureContext || input.materializeArchitectureContext) {
          if (!run.state.discoveryActivationKey) fail("architecture context requires activated discovery", "DR4962", 6);
          const saved = run.state.architectureContextKey && records.get(run.state.architectureContextKey);
          if (input.materializeArchitectureContext && saved?.handoffDigest !== input.materializeArchitectureContext) fail("architecture context handoff is stale", "DR4962", 6);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const handoff = await createLocalArchitectureContext({ storage, namespace, checkpointReplay, registry,
            gate: records.get(run.state.discoveryGateKey), activation: records.get(run.state.discoveryActivationKey),
            priorSnapshot: snapshot, priorReceipt: session, loadArtifact: executionContext.artifacts.load,
            createdAt: input.prepareArchitectureContext ?? saved.snapshot.createdAt });
          const architectureContextKey = `architecture-context:${handoff.handoffDigest}`;
          if (run.state.architectureContextKey && (run.state.architectureContextKey !== architectureContextKey || !same(saved, handoff))) fail("another architecture context is already sealed", "DR4962", 6);
          records.put(architectureContextKey, handoff);
          if (input.materializeArchitectureContext) {
            const materialized = materializeLocalArchitectureContext({ configuration, handoff, resolvePath: scopedPath });
            const architectureContextFilesKey = `architecture-context-files:${handoff.handoffDigest}`;
            records.put(architectureContextFilesKey, materialized);
            nextState = { ...run.state, architectureContextKey, architectureContextFilesKey, status: "architecture-context-materialized" };
          } else nextState = { ...run.state, architectureContextKey, status: run.state.architectureContextFilesKey ? "architecture-context-materialized" : "architecture-context-prepared" };
        } else if (input.prepareWorkExecution || input.claimWorkExecution) {
          const claimRequest = input.claimWorkExecution;
          if (claimRequest && !validateWorkClaim(claimRequest)) fail("work claim violates closed contract");
          const savedKey = claimRequest && run.state.workExecutionPreparationKeys?.[claimRequest.attemptId];
          const savedExecution = savedKey && records.get(savedKey);
          if (claimRequest && (!savedExecution || savedExecution.preparationDigest !== claimRequest.preparationDigest ||
              savedKey !== `work-execution-preparation:${claimRequest.preparationDigest}`)) fail("work claim requires exact saved preparation", "DR4962", 6);
          const submission = claimRequest ? savedExecution.submission : json(input.prepareWorkExecution);
          if (!validateDesktopWorkExecutionSubmission(submission)) fail("work execution submission violates closed contract");
          const queue = run.state.workReadinessKey && records.get(run.state.workReadinessKey);
          const qualityKey = run.state.workQualityKeys?.[submission.workItemId];
          const quality = qualityKey && records.get(qualityKey);
          const policyGate = run.state.qualityPolicyGateKey && records.get(run.state.qualityPolicyGateKey);
          const policyActivation = run.state.qualityPolicyActivationKey && records.get(run.state.qualityPolicyActivationKey);
          const gate = run.state.assignmentGateKey && records.get(run.state.assignmentGateKey);
          const handoff = run.state.assignmentContextKey && records.get(run.state.assignmentContextKey);
          const execution = run.state.assignmentExecutionKey && records.get(run.state.assignmentExecutionKey);
          if (!queue || queue.readinessDigest !== submission.readinessDigest || !quality || quality.preparationDigest !== submission.qualityPreparationDigest ||
              !policyGate || !policyActivation || !gate || !handoff || !execution ||
              policyActivation.preparationDigest !== policyGate.preparationDigest || !same(policyActivation.baseline, quality.submission.qualityPolicy.ref)) fail("execution preparation requires exact ready work and activated quality", "DR4962", 6);
          await verifyLocalQualityPolicyActivation({ storage, namespace, graph, record: policyGate, loadArtifact: executionContext.artifacts.load });
          assertLocalQualityPolicyCurrent({ storage, namespace, baseline: policyActivation.baseline });
          const request = await assignmentExecutionRequest(run, invocation, handoff);
          const baselines = await prepareLocalExecutionBaselines({ ...request, assignmentExecution: execution, assignmentGate: gate });
          const readiness = await deriveLocalWorkReadiness({ storage, namespace, baselines, loadArtifact: request.loadArtifact,
            verifyIntegration: exactInvocation => registry.verifyCheckpointedExecution(exactInvocation, executionContext) });
          if (!same(readiness, queue)) fail("execution preparation queue is stale", "DR4962", 6);
          const entries = [submission.executionBinding, submission.executionPolicy, submission.repositorySnapshot];
          const supplied = new Map(await Promise.all(entries.map(async entry => [canonicalJsonDigest(entry.ref), {
            ref: entry.ref, bytes: claimRequest ? await request.loadArtifact(entry.ref) : read({ path: entry.path, digest: entry.ref.digest }) }])));
          if (supplied.size !== entries.length) fail("duplicate execution input");
          const prepared = await prepareLocalWorkExecutionHandoff({ projectId: configuration.projectId, submission, readiness, qualityHandoff: quality,
            loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? request.loadArtifact(ref) });
          const key = `work-execution-preparation:${prepared.record.preparationDigest}`;
          const priorPreparation = run.state.workExecutionPreparationKeys?.[submission.attemptId];
          if (priorPreparation && priorPreparation !== key) fail("attempt already binds a different execution preparation", "DR4962", 6);
          await prepareLocalExecutionBaselines({ ...request, assignmentExecution: execution, assignmentGate: gate });
          assertLocalCompletionSnapshotCurrent({ storage, namespace, ...readiness });
          assertLocalQualityPolicyCurrent({ storage, namespace, baseline: policyActivation.baseline });
          if (claimRequest && !same(prepared.record, savedExecution)) fail("saved execution preparation differs", "DR4962", 6);
          const artifacts = [...Object.values(prepared.input), ...Object.values(prepared.record.artifacts).map(entry => ({ ref: entry.ref, bytes: Buffer.from(entry.bytesBase64, "base64") }))];
          for (const { ref, bytes } of artifacts) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(key, prepared.record);
          nextState = { ...run.state, workExecutionPreparationKeys: { ...(run.state.workExecutionPreparationKeys ?? {}), [submission.attemptId]: key }, status: "work-execution-prepared" };
          if (claimRequest) {
            const store = createDurableWorkContinuityStore({ storage, projectId: configuration.projectId });
            const workFingerprint = JSON.parse(Buffer.from(prepared.record.artifacts.workFingerprint.bytesBase64, "base64"));
            const parameters = { store, workFingerprint, attemptId: claimRequest.attemptId, owner: claimRequest.owner,
              leaseExpiresAt: claimRequest.leaseExpiresAt, now: clock(), expectedHostVersion: claimRequest.expectedHostVersion,
              expectedIndexRevision: claimRequest.expectedIndexRevision };
            const exists = store.read().state.index.records.some(item => item.attemptId === claimRequest.attemptId);
            const result = exists ? recoverLocalWorkContinuityClaim({ storage, ...parameters }) : claimLocalWorkContinuity(parameters);
            const body = { kind: "LocalWorkExecutionClaim", request: structuredClone(claimRequest), result, dispatchAuthorized: false };
            const record = { ...body, claimDigest: canonicalJsonDigest(body) };
            if (!validateWorkClaimRecord(record)) fail("work claim result violates closed contract");
            const claimKey = `work-execution-claim:${record.claimDigest}`;
            records.put(claimKey, record);
            nextState = { ...nextState, workClaimKeys: { ...(run.state.workClaimKeys ?? {}), [claimRequest.attemptId]: claimKey }, status: "work-execution-claimed" };
          }
        } else if (input.prepareWorkQuality) {
          const submission = json(input.prepareWorkQuality);
          if (!validateDesktopWorkQualitySubmission(submission)) fail("work quality submission violates its closed contract");
          const policyGate = run.state.qualityPolicyGateKey && records.get(run.state.qualityPolicyGateKey);
          const policyActivation = run.state.qualityPolicyActivationKey && records.get(run.state.qualityPolicyActivationKey);
          if (!policyGate || !policyActivation || !same(policyActivation.baseline, submission.qualityPolicy.ref) ||
              policyActivation.preparationDigest !== policyGate.preparationDigest) fail("work quality requires the exact activated policy", "DR4962", 6);
          await verifyLocalQualityPolicyActivation({ storage, namespace, graph, record: policyGate, loadArtifact: executionContext.artifacts.load });
          assertLocalQualityPolicyCurrent({ storage, namespace, baseline: policyActivation.baseline });
          const savedQueue = run.state.workReadinessKey && records.get(run.state.workReadinessKey);
          const gate = run.state.assignmentGateKey && records.get(run.state.assignmentGateKey);
          const handoff = run.state.assignmentContextKey && records.get(run.state.assignmentContextKey);
          const execution = run.state.assignmentExecutionKey && records.get(run.state.assignmentExecutionKey);
          if (!savedQueue || savedQueue.readinessDigest !== submission.readinessDigest || run.state.workReadinessKey !== `work-readiness:${submission.readinessDigest}` || !gate || !handoff || !execution ||
              run.state.assignmentActivationKey !== `assignment-activation-record:${gate.commitDigest}`) fail("quality preparation requires a sealed current queue", "DR4962", 6);
          const request = await assignmentExecutionRequest(run, invocation, handoff);
          const baselines = await prepareLocalExecutionBaselines({ ...request, assignmentExecution: execution, assignmentGate: gate });
          const readiness = await deriveLocalWorkReadiness({ storage, namespace, baselines, loadArtifact: request.loadArtifact,
            verifyIntegration: exactInvocation => registry.verifyCheckpointedExecution(exactInvocation, executionContext) });
          if (!same(readiness, savedQueue)) fail("quality preparation queue is stale", "DR4962", 6);
          const supplied = new Map();
          for (const entry of [submission.qualityPolicy, submission.qualityContext, ...submission.artifacts]) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate work quality artifact");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          const prepared = await prepareLocalWorkQualityHandoff({ submission, readiness,
            workflowProfile: resolveWorkflowProfile({ profileName: input.profile, projectRiskContext: input.projectRiskContext }),
            loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? request.loadArtifact(ref) });
          await prepareLocalExecutionBaselines({ ...request, assignmentExecution: execution, assignmentGate: gate });
          assertLocalCompletionSnapshotCurrent({ storage, namespace, ...readiness });
          assertLocalQualityPolicyCurrent({ storage, namespace, baseline: policyActivation.baseline });
          for (const { ref, bytes } of supplied.values()) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          const workQualityKey = `work-quality:${prepared.preparationDigest}`;
          records.put(workQualityKey, prepared);
          nextState = { ...run.state, workQualityKeys: { ...(run.state.workQualityKeys ?? {}), [submission.workItemId]: workQualityKey }, status: "work-quality-prepared" };
        } else if (input.prepareWorkQueue) {
          const gate = run.state.assignmentGateKey && records.get(run.state.assignmentGateKey);
          const handoff = run.state.assignmentContextKey && records.get(run.state.assignmentContextKey);
          const execution = run.state.assignmentExecutionKey && records.get(run.state.assignmentExecutionKey);
          if (!gate || gate.commitDigest !== input.prepareWorkQueue || !handoff || !execution ||
              run.state.assignmentActivationKey !== `assignment-activation-record:${gate.commitDigest}`) fail("work queue requires exact activated assignment context", "DR4962", 6);
          const request = await assignmentExecutionRequest(run, invocation, handoff);
          const baselines = await prepareLocalExecutionBaselines({ ...request, assignmentExecution: execution, assignmentGate: gate });
          const queueRequest = { storage, namespace, baselines, loadArtifact: request.loadArtifact,
            verifyIntegration: exactInvocation => registry.verifyCheckpointedExecution(exactInvocation, executionContext) };
          const { readiness, workReadinessKey } = await prepareLocalWorkQueue({ ...queueRequest, records });
          validateParentState = () => assertLocalWorkQueueCurrent({ ...queueRequest, records, readiness });
          nextState = { ...run.state, workReadinessKey, ...(run.state.workReadinessKey === workReadinessKey
            ? { status: run.state.status } : { workQualityKeys: {}, status: "work-queue-prepared" }) };
        } else if (input.activateAssignmentGate) {
          if (configuration.traceabilityVocabularyVersion !== "1.9.0") fail("assignment activation requires explicit traceability vocabulary 1.9.0");
          const gate = run.state.assignmentGateKey && records.get(run.state.assignmentGateKey);
          const handoff = run.state.assignmentContextKey && records.get(run.state.assignmentContextKey);
          const execution = run.state.assignmentExecutionKey && records.get(run.state.assignmentExecutionKey);
          if (!gate || gate.commitDigest !== input.activateAssignmentGate || !handoff || !execution) fail("assignment activation requires the exact Gate and execution", "DR4962", 6);
          const request = await assignmentExecutionRequest(run, invocation, handoff);
          const activation = await activateLocalAssignmentBaseline({ ...request, assignmentExecution: execution, assignmentGate: gate });
          const assignmentActivationKey = `assignment-activation-record:${gate.commitDigest}`;
          records.put(assignmentActivationKey, activation);
          nextState = { ...run.state, assignmentActivationKey, status: "assignment-baseline-activated" };
        } else if (input.assignmentGate) {
          const submission = json(input.assignmentGate);
          if (!validateAssignmentGateSubmission(submission)) fail("assignment Gate submission violates its closed contract");
          const handoff = run.state.assignmentContextKey && records.get(run.state.assignmentContextKey);
          const execution = run.state.assignmentExecutionKey && records.get(run.state.assignmentExecutionKey);
          if (!handoff || !execution) fail("assignment approval requires persisted context and execution", "DR4962", 6);
          const boundaryRef = handoff.snapshot.bindings.find(entry => entry.role === "lifecycle-status").artifact;
          const boundary = JSON.parse(Buffer.from(handoff.files.find(entry => same(entry.ref, boundaryRef)).bytesBase64, "base64"));
          assertLocalSpecialistAssignmentContextCurrent({ storage, namespace, boundary, plan: handoff.plan });
          const request = await assignmentExecutionRequest(run, invocation, handoff);
          const checkpointReplay = await verifyLocalSpecialistAssignmentExecution({ ...request, assignmentExecution: execution });
          const supplied = new Map();
          for (const entry of [submission.approval, ...submission.artifacts]) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate assignment Gate artifact");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          const commit = await prepareSpecialistAssignmentGateV3({ checkpointReplay, approvalRef: submission.approval.ref,
            loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? executionContext.artifacts.load(ref) });
          const assignmentGateKey = `assignment-gate:${commit.commitDigest}`;
          if (run.state.assignmentGateKey && (run.state.assignmentGateKey !== assignmentGateKey || !same(records.get(assignmentGateKey), commit))) fail("another assignment Gate is sealed", "DR4962", 6);
          supplied.set(canonicalJsonDigest(commit.baseline.ref), { ref: commit.baseline.ref, bytes: Buffer.from(commit.baseline.bytesBase64, "base64") });
          for (const { ref, bytes } of supplied.values()) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(assignmentGateKey, commit);
          nextState = { ...run.state, assignmentGateKey, status: run.state.assignmentActivationKey ? run.state.status : "awaiting-assignment-activation" };
        } else if (input.executeAssignment) {
          const handoff = run.state.assignmentContextKey && records.get(run.state.assignmentContextKey);
          if (!handoff || handoff.handoffDigest !== input.executeAssignment) fail("assignment execution requires the exact persisted context", "DR4962", 6);
          const request = await assignmentExecutionRequest(run, invocation, handoff);
          const execution = await executeLocalSpecialistAssignment(request);
          const assignmentExecutionKey = `assignment-execution:${execution.executionFingerprint}`;
          const persisted = { ...execution, replayed: false };
          if (run.state.assignmentExecutionKey && (run.state.assignmentExecutionKey !== assignmentExecutionKey || !same(records.get(assignmentExecutionKey), persisted))) fail("another assignment execution is sealed", "DR4962", 6);
          records.put(assignmentExecutionKey, persisted);
          nextState = { ...run.state, assignmentExecutionKey, status: run.state.assignmentGateKey ? run.state.status : execution.outcome === "assigned" ? "assignment-candidate-prepared" : "assignment-needs-clarification" };
        } else if (input.prepareAssignmentContext || input.materializeAssignmentContext) {
          const saved = run.state.assignmentContextKey && records.get(run.state.assignmentContextKey);
          if (input.materializeAssignmentContext && saved?.handoffDigest !== input.materializeAssignmentContext) fail("assignment handoff is stale", "DR4962", 6);
          const submission = input.prepareAssignmentContext ? json(input.prepareAssignmentContext) : {
            activationDigest: records.get(run.state.dependencyActivationKey)?.gateCommitDigest, createdAt: saved.snapshot.createdAt,
            specialistCatalog: { ref: saved.plan.inputs["specialist-catalog"] }, assignmentPolicy: { ref: saved.plan.inputs["assignment-policy"] }, artifacts: [] };
          if (input.prepareAssignmentContext && !validateAssignmentSubmission(submission)) fail("assignment submission violates its closed contract");
          const supplied = new Map();
          if (input.prepareAssignmentContext) for (const entry of [submission.specialistCatalog, submission.assignmentPolicy, ...submission.artifacts]) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate assignment context artifact");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          const request = await assignmentRequest(run, invocation, ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? executionContext.artifacts.load(ref));
          if (submission.activationDigest !== records.get(run.state.dependencyActivationKey).gateCommitDigest) fail("assignment submission changes dependency activation", "DR4962", 6);
          const handoff = await createLocalSpecialistAssignmentContext({ ...request, createdAt: submission.createdAt,
            specialistCatalog: submission.specialistCatalog.ref, assignmentPolicy: submission.assignmentPolicy.ref });
          const assignmentContextKey = `assignment-context:${handoff.handoffDigest}`;
          if (saved && (run.state.assignmentContextKey !== assignmentContextKey || !same(saved, handoff))) fail("another assignment context is sealed", "DR4962", 6);
          for (const { ref, bytes } of supplied.values()) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(assignmentContextKey, handoff);
          if (input.materializeAssignmentContext) {
            const materialized = materializeLocalSpecialistAssignmentContext({ configuration, handoff, resolvePath: scopedPath });
            const assignmentContextFilesKey = `assignment-context-files:${handoff.handoffDigest}`;
            records.put(assignmentContextFilesKey, materialized);
            nextState = { ...run.state, assignmentContextKey, assignmentContextFilesKey, status: run.state.assignmentExecutionKey ? run.state.status : "assignment-context-materialized" };
          } else nextState = { ...run.state, assignmentContextKey, status: run.state.assignmentExecutionKey || run.state.assignmentContextFilesKey ? run.state.status : "assignment-context-prepared" };
        } else if (input.activateDependencyGate) {
          if (configuration.traceabilityVocabularyVersion !== "1.9.0") fail("dependency activation requires explicit traceability vocabulary 1.9.0");
          const gate = run.state.dependencyGateKey && records.get(run.state.dependencyGateKey);
          const handoff = run.state.dependencyContextKey && records.get(run.state.dependencyContextKey);
          const execution = run.state.dependencyExecutionKey && records.get(run.state.dependencyExecutionKey);
          if (!gate || gate.commitDigest !== input.activateDependencyGate || !handoff || !execution) fail("dependency activation requires its exact Gate and execution", "DR4962", 6);
          const stateFile = handoff.files.find(entry => same(entry.ref, handoff.state));
          const bytes = Buffer.from(stateFile.bytesBase64, "base64");
          const state = JSON.parse(bytes);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const activation = await activateLocalDependencyBaseline({ storage, namespace, graph, registry, checkpointReplay, dependencyGate: gate,
            record: records.get(run.state.workGateKey), boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))),
            expectedState: { ref: handoff.state, bytes }, contextSliceSet: state.contextSliceSet, policyBundle: state.policyBundle, currentWorkDependencyBaseline: state.currentWorkDependencyBaseline,
            binding: configuration.dependencyBinding, loadArtifact: executionContext.artifacts.load, execution });
          const dependencyActivationKey = `dependency-activation-record:${gate.commitDigest}`;
          records.put(dependencyActivationKey, activation);
          nextState = { ...run.state, dependencyActivationKey, status: run.state.assignmentContextKey ? run.state.status : "dependency-baseline-activated" };
        } else if (input.dependencyGate) {
          const submission = json(input.dependencyGate);
          if (!validateDependencyGateSubmission(submission)) fail("dependency Gate submission violates its closed contract");
          const handoff = run.state.dependencyContextKey && records.get(run.state.dependencyContextKey);
          const execution = run.state.dependencyExecutionKey && records.get(run.state.dependencyExecutionKey);
          if (!handoff || !execution) fail("dependency Gate requires persisted context and execution", "DR4962", 6);
          const stateFile = handoff.files.find(entry => same(entry.ref, handoff.state));
          const bytes = Buffer.from(stateFile.bytesBase64, "base64");
          const state = JSON.parse(bytes);
          const boundaryRef = handoff.snapshot.bindings.find(entry => entry.role === "lifecycle-status").artifact;
          const boundary = JSON.parse(Buffer.from(handoff.files.find(entry => same(entry.ref, boundaryRef)).bytesBase64, "base64"));
          assertLocalWorkDependencyContextCurrent({ storage, namespace, boundary, state: handoff.state });
          if (!run.state.dependencyGateKey) {
            const predecessor = await verifyDependencyPredecessor({ storage, namespace, currentWorkDependencyBaseline: state.currentWorkDependencyBaseline, loadArtifact: executionContext.artifacts.load });
            assertDependencyPredecessorCurrent({ storage, namespace, predecessor });
          }
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const replayReceipt = await verifyLocalWorkDependencyExecution({ storage, namespace, graph, registry, checkpointReplay,
            record: records.get(run.state.workGateKey), boundary: boundary.workBoundary, expectedState: { ref: handoff.state, bytes },
            contextSliceSet: state.contextSliceSet, policyBundle: state.policyBundle, currentWorkDependencyBaseline: state.currentWorkDependencyBaseline, binding: configuration.dependencyBinding,
            loadArtifact: executionContext.artifacts.load, execution });
          const supplied = new Map();
          for (const entry of [submission.baseline, submission.approval, ...submission.artifacts]) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate dependency Gate artifact");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          const commit = await prepareLocalWorkDependencyGate({ replayReceipt, baselineRef: submission.baseline.ref, approvalRef: submission.approval.ref,
            loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? executionContext.artifacts.load(ref) });
          const dependencyGateKey = `dependency-gate:${commit.commitDigest}`;
          if (run.state.dependencyGateKey && run.state.dependencyGateKey !== dependencyGateKey) fail("another dependency Gate is sealed", "DR4962", 6);
          for (const { ref, bytes } of supplied.values()) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(dependencyGateKey, commit);
          nextState = { ...run.state, dependencyGateKey, status: run.state.dependencyActivationKey ? run.state.status : "awaiting-dependency-activation" };
        } else if (input.executeDependencyPlanning) {
          const handoff = run.state.dependencyContextKey && records.get(run.state.dependencyContextKey);
          if (!handoff || handoff.handoffDigest !== input.executeDependencyPlanning) fail("dependency execution requires the exact persisted context", "DR4962", 6);
          const stateFile = handoff.files.find(entry => same(entry.ref, handoff.state));
          const bytes = Buffer.from(stateFile.bytesBase64, "base64");
          const state = JSON.parse(bytes);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const execution = await executeLocalWorkDependencyPlanning({ storage, namespace, graph, registry, checkpointReplay,
            record: records.get(run.state.workGateKey), boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))),
            expectedState: { ref: handoff.state, bytes }, contextSliceSet: state.contextSliceSet, policyBundle: state.policyBundle, currentWorkDependencyBaseline: state.currentWorkDependencyBaseline,
            binding: configuration.dependencyBinding, loadArtifact: executionContext.artifacts.load });
          const dependencyExecutionKey = `dependency-execution:${execution.executionFingerprint}`;
          const persisted = JSON.parse(JSON.stringify({ ...execution, replayed: false }));
          if (run.state.dependencyExecutionKey && (run.state.dependencyExecutionKey !== dependencyExecutionKey || !same(records.get(dependencyExecutionKey), persisted))) fail("another dependency execution is sealed", "DR4962", 6);
          records.put(dependencyExecutionKey, persisted);
          nextState = { ...run.state, dependencyExecutionKey, status: run.state.dependencyGateKey ? run.state.status : execution.progressionAllowed ? "dependency-candidate-prepared" : "dependency-analysis-blocked" };
        } else if (input.prepareDependencyContext || input.materializeDependencyContext) {
          const activation = run.state.workActivationKey && records.get(run.state.workActivationKey);
          const saved = run.state.dependencyContextKey && records.get(run.state.dependencyContextKey);
          if (!activation) fail("dependency context requires activated work", "DR4962", 6);
          if (input.materializeDependencyContext && saved?.handoffDigest !== input.materializeDependencyContext) fail("dependency handoff is stale", "DR4962", 6);
          const savedState = input.materializeDependencyContext ? JSON.parse(Buffer.from(saved.files.find(entry => same(entry.ref, saved.state)).bytesBase64, "base64")) : undefined;
          const submission = input.prepareDependencyContext ? json(input.prepareDependencyContext) : {
            activationDigest: activation.gateCommitDigest, createdAt: saved.snapshot.createdAt, contextSliceSet: { ref: savedState.contextSliceSet }, policyBundle: { ref: savedState.policyBundle }, currentWorkDependencyBaseline: savedState.currentWorkDependencyBaseline ? { ref: savedState.currentWorkDependencyBaseline } : undefined, artifacts: [] };
          if (input.prepareDependencyContext && !(submission.kind === "DesktopDependencyReplacementContextSubmission" ? validateDependencyReplacementSubmission(submission) : validateDependencySubmission(submission))) fail("dependency submission violates its closed contract");
          if (submission.activationDigest !== activation.gateCommitDigest) fail("dependency submission changes work activation", "DR4962", 6);
          const supplied = new Map();
          if (input.prepareDependencyContext) for (const entry of [submission.contextSliceSet, submission.policyBundle, ...(submission.currentWorkDependencyBaseline ? [submission.currentWorkDependencyBaseline] : []), ...submission.artifacts]) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate dependency context artifact");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const deriveDependencyContext = input.materializeDependencyContext ? verifyLocalWorkDependencyContext : createLocalWorkDependencyContext;
          const handoff = await deriveDependencyContext({ storage, namespace, graph, registry, checkpointReplay,
            ...(input.materializeDependencyContext ? { handoff: saved } : {}),
            record: records.get(run.state.workGateKey), boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))),
            priorSnapshot: snapshot, priorReceipt: session, createdAt: submission.createdAt,
            contextSliceSet: submission.contextSliceSet.ref, policyBundle: submission.policyBundle.ref, currentWorkDependencyBaseline: submission.currentWorkDependencyBaseline?.ref,
            loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? executionContext.artifacts.load(ref) });
          const dependencyContextKey = `dependency-context:${handoff.handoffDigest}`;
          if (saved && (run.state.dependencyContextKey !== dependencyContextKey || !same(saved, handoff))) fail("another dependency context is sealed", "DR4962", 6);
          for (const { ref, bytes } of supplied.values()) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(dependencyContextKey, handoff);
          if (input.materializeDependencyContext) {
            const materialized = materializeLocalWorkDependencyContext({ configuration, handoff, resolvePath: scopedPath });
            const dependencyContextFilesKey = `dependency-context-files:${handoff.handoffDigest}`;
            records.put(dependencyContextFilesKey, materialized);
            nextState = { ...run.state, dependencyContextKey, dependencyContextFilesKey, status: run.state.dependencyExecutionKey ? run.state.status : "dependency-context-materialized" };
          } else nextState = { ...run.state, dependencyContextKey, status: run.state.dependencyExecutionKey || run.state.dependencyContextFilesKey ? run.state.status : "dependency-context-prepared" };
        } else if (input.activateWorkBreakdownGate) {
          if (configuration.traceabilityVocabularyVersion !== "1.9.0") fail("work activation requires explicit traceability vocabulary 1.9.0");
          const record = run.state.workGateKey && records.get(run.state.workGateKey);
          if (!record || record.commitDigest !== input.activateWorkBreakdownGate) fail("work activation requires the exact persisted Gate", "DR4962", 6);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const activation = await activateLocalWorkBaseline({ storage, namespace, graph, checkpointReplay, record,
            boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))), loadArtifact: executionContext.artifacts.load });
          const workActivationKey = `work-activation-record:${record.commitDigest}`;
          records.put(workActivationKey, activation);
          nextState = { ...run.state, workActivationKey, status: run.state.dependencyContextKey ? run.state.status : "work-baseline-activated" };
        } else if (input.workBreakdownGate) {
          const submission = json(input.workBreakdownGate);
          if (!validateWorkGateSubmission(submission)) fail("work Gate submission violates its closed contract");
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const workState = checkpointReplay.loadedInputs["project-work-breakdown-state"]?.[0]?.ref;
          await assertLocalWorkInvocationCurrent({ storage, namespace, loadArtifact: loadConfigured, state: workState, boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))) });
          const supplied = new Map();
          for (const entry of [submission.baseline, ...submission.artifacts]) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate work Gate artifact");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          const commit = await prepareLocalWorkBreakdownGate({ checkpointReplay, baselineRef: submission.baseline.ref, noWorkApprovals: submission.noWorkApprovals,
            loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? executionContext.artifacts.load(ref) });
          const workGateKey = `work-gate:${commit.commitDigest}`;
          if (run.state.workGateKey && run.state.workGateKey !== workGateKey) fail("another work Gate is sealed", "DR4962", 6);
          for (const { ref, bytes } of supplied.values()) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(workGateKey, commit);
          nextState = { ...run.state, workGateKey, status: run.state.workActivationKey ? run.state.status : "awaiting-work-activation" };
        } else if (input.prepareWorkBreakdownContext || input.materializeWorkBreakdownContext) {
          const savedContext = run.state.workContextKey ? records.get(run.state.workContextKey) : undefined;
          if (input.materializeWorkBreakdownContext && savedContext?.handoffDigest !== input.materializeWorkBreakdownContext) fail("work handoff is stale", "DR4962", 6);
          const savedState = input.materializeWorkBreakdownContext ? JSON.parse(Buffer.from(savedContext.files.find(entry => same(entry.ref, savedContext.state)).bytesBase64, "base64")) : undefined;
          const submission = input.prepareWorkBreakdownContext ? json(input.prepareWorkBreakdownContext) : {
            activationDigest: records.get(run.state.contractActivationKey).gateCommitDigest, createdAt: savedContext.snapshot.createdAt,
            capabilityCatalog: { ref: savedState.capabilityCatalog }, repositoryContext: { ref: savedState.repositoryContext ?? savedState.currentRepositorySnapshot },
            ...(savedState.currentWorkBreakdownBaseline ? { currentWorkBreakdownBaseline: { ref: savedState.currentWorkBreakdownBaseline }, approvedChangePackage: { ref: savedState.approvedChangePackage } } : {}), artifacts: [] };
          if (input.prepareWorkBreakdownContext && !(submission.version === "2.0.0" ? validateWorkSubmissionV2(submission) : validateWorkSubmission(submission))) fail("work context submission violates its closed contract");
          const activation = run.state.contractActivationKey && records.get(run.state.contractActivationKey);
          if (!activation || activation.gateCommitDigest !== submission.activationDigest) fail("work context requires exact contract activation", "DR4962", 6);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const supplied = new Map();
          for (const entry of input.prepareWorkBreakdownContext ? [submission.capabilityCatalog, submission.repositoryContext, ...(submission.currentWorkBreakdownBaseline ? [submission.currentWorkBreakdownBaseline, submission.approvedChangePackage] : []), ...submission.artifacts] : []) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate work context artifact");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          const contractGate = run.state.contractGateKey ? records.get(run.state.contractGateKey) : undefined;
          const savedExecution = run.state.contractExecutionKey ? records.get(run.state.contractExecutionKey) : undefined;
          const contractReplayReceipt = savedExecution ? await verifyLocalContractExecution({ storage, namespace, bindings: configuration.contractGenerators,
            executionId: savedExecution.execution.executionId, executionFingerprint: savedExecution.execution.executionFingerprint }) : undefined;
          const handoff = await createLocalWorkBreakdownContext({ storage, namespace, graph, registry, checkpointReplay,
            record: records.get(run.state.architectureGateKey), planning: records.get(run.state.contractPlanningKey), contractGate, contractReplayReceipt,
            notApplicableCommit: run.state.contractsNotApplicableKey ? records.get(run.state.contractsNotApplicableKey) : undefined,
            capabilityCatalog: submission.capabilityCatalog.ref, repositoryContext: submission.repositoryContext.ref,
            currentWorkBreakdownBaseline: submission.currentWorkBreakdownBaseline?.ref, approvedChangePackage: submission.approvedChangePackage?.ref,
            priorSnapshot: snapshot, priorReceipt: session, createdAt: submission.createdAt,
            loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? executionContext.artifacts.load(ref) });
          const workContextKey = `work-context:${handoff.handoffDigest}`;
          if (run.state.workContextKey && !submission.currentWorkBreakdownBaseline && (run.state.workContextKey !== workContextKey || !same(records.get(workContextKey), handoff))) fail("another work context is sealed", "DR4962", 6);
          for (const { ref, bytes } of supplied.values()) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(workContextKey, handoff);
          if (input.materializeWorkBreakdownContext) {
            const materialized = materializeLocalWorkBreakdownContext({ configuration, handoff, resolvePath: scopedPath });
            const workContextFilesKey = `work-context-files:${handoff.handoffDigest}`;
            records.put(workContextFilesKey, materialized);
            nextState = { ...run.state, workContextKey, workContextFilesKey, status: "work-context-materialized" };
          } else {
            nextState = { ...run.state, workContextKey, status: run.state.workContextKey === workContextKey && run.state.workContextFilesKey ? "work-context-materialized" : "work-context-prepared" };
            if (run.state.workContextKey !== workContextKey) delete nextState.workContextFilesKey;
          }
        } else if (input.contractsNotApplicable) {
          const submission = json(input.contractsNotApplicable);
          if (!validateContractNotApplicableSubmission(submission)) fail("not-applicable submission violates its closed contract");
          const planning = run.state.contractPlanningKey && records.get(run.state.contractPlanningKey);
          if (!planning || planning.planningDigest !== submission.planningDigest || run.state.contractExecutionKey || run.state.contractGateKey) fail("not-applicable approval requires exact unexecuted contract planning", "DR4962", 6);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const supplied = new Map();
          for (const entry of [submission.approval, ...submission.artifacts]) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate not-applicable evidence");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          const commit = await prepareLocalContractsNotApplicable({ storage, namespace, graph, checkpointReplay,
            record: records.get(run.state.architectureGateKey), planning, approvalRef: submission.approval.ref,
            loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? executionContext.artifacts.load(ref) });
          const contractsNotApplicableKey = `contracts-not-applicable:${commit.commitDigest}`;
          if (run.state.contractsNotApplicableKey && run.state.contractsNotApplicableKey !== contractsNotApplicableKey) fail("another not-applicable approval is already sealed", "DR4962", 6);
          for (const { ref, bytes } of [...supplied.values(), { ref: commit.disposition.ref, bytes: Buffer.from(commit.disposition.bytesBase64, "base64") }]) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(contractsNotApplicableKey, commit);
          nextState = { ...run.state, contractsNotApplicableKey, status: run.state.contractActivationKey ? run.state.status : "contract-not-applicable-prepared" };
        } else if (input.activateContractGate && run.state.contractsNotApplicableKey) {
          const commit = records.get(run.state.contractsNotApplicableKey);
          if (!commit || commit.commitDigest !== input.activateContractGate || run.state.contractExecutionKey || run.state.contractGateKey) fail("no-contract activation requires the exact exclusive Gate disposition", "DR4962", 6);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const activation = await activateLocalContractsNotApplicable({ storage, namespace, graph, checkpointReplay,
            record: records.get(run.state.architectureGateKey), planning: records.get(run.state.contractPlanningKey), commit,
            loadArtifact: executionContext.artifacts.load });
          const contractActivationKey = `contract-activation-record:${commit.commitDigest}`;
          records.put(`artifact:${canonicalJsonDigest(activation.state)}`, { ref: activation.state, stored: activation.storedState });
          records.put(`artifact-pointer:${pointerKey(activation.state)}`, activation.state);
          records.put(contractActivationKey, activation);
          nextState = { ...run.state, contractActivationKey, status: run.state.workContextKey ? run.state.status : "contracts-activated" };
        } else if (input.activateContractGate) {
          const gate = run.state.contractGateKey && records.get(run.state.contractGateKey);
          if (!gate || gate.commitDigest !== input.activateContractGate) fail("contract activation requires the exact persisted Gate", "DR4962", 6);
          const saved = records.get(run.state.contractExecutionKey);
          const planning = records.get(run.state.contractPlanningKey);
          if (!run.state.contractActivationKey) assertLocalArchitectureCurrentState({ storage, namespace, state: planning.architectureActivation.state });
          const executionId = `CG-${canonicalJsonDigest({ invocation, planning: planning.planningDigest }).slice(7).toUpperCase()}`;
          if (saved.execution.executionId !== executionId || saved.planningDigest !== planning.planningDigest) fail("contract activation lineage drifted", "DR4962", 6);
          const replayReceipt = await verifyLocalContractExecution({ storage, namespace, bindings: configuration.contractGenerators,
            executionId, executionFingerprint: saved.execution.executionFingerprint });
          await verifyLocalContractCandidateTrace({ storage, namespace, graph, replayReceipt,
            record: saved.candidateTrace, loadArtifact: executionContext.artifacts.load });
          const activation = await activateLocalContractGate({ storage, namespace, graph, replayReceipt, record: gate, loadArtifact: executionContext.artifacts.load });
          const contractActivationKey = `contract-activation-record:${gate.commitDigest}`;
          records.put(`artifact:${canonicalJsonDigest(activation.state)}`, { ref: activation.state, stored: activation.storedState });
          records.put(`artifact-pointer:${pointerKey(activation.state)}`, activation.state);
          records.put(contractActivationKey, activation);
          nextState = { ...run.state, contractActivationKey, status: run.state.workContextKey ? run.state.status : "contracts-activated" };
        } else if (input.contractGate) {
          const saved = run.state.contractExecutionKey && records.get(run.state.contractExecutionKey);
          if (!saved?.execution.candidateRef) fail("contract Gate requires a completed contract candidate", "DR4962", 6);
          const planning = records.get(run.state.contractPlanningKey);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const derivedPlanning = await prepareLocalContractPlanning({ storage, namespace, graph, checkpointReplay, record: records.get(run.state.architectureGateKey), loadArtifact: executionContext.artifacts.load });
          if (!same(derivedPlanning, planning)) fail("contract Gate planning differs from its exact derivation", "DR4962", 6);
          const executionId = `CG-${canonicalJsonDigest({ invocation, planning: planning.planningDigest }).slice(7).toUpperCase()}`;
          if (saved.execution.executionId !== executionId || saved.planningDigest !== planning.planningDigest) fail("contract Gate execution lineage drifted", "DR4962", 6);
          const replayReceipt = await verifyLocalContractExecution({ storage, namespace, bindings: configuration.contractGenerators,
            executionId, executionFingerprint: saved.execution.executionFingerprint });
          await verifyLocalContractCandidateTrace({ storage, namespace, graph, replayReceipt,
            record: saved.candidateTrace, loadArtifact: executionContext.artifacts.load });
          const contractState = JSON.parse(Buffer.from(planning.state.bytesBase64, "base64"));
          if (!same(replayReceipt.checkpoint.inputBindings, [
            { role: "architecture-baseline", artifact: contractState.architectureBaseline },
            { role: "project-contract-state", artifact: planning.state.ref },
            { role: "project-overview-baseline", artifact: contractState.projectOverviewBaseline },
          ])) fail("contract Gate checkpoint inputs differ from planning", "DR4962", 6);
          const submission = json(input.contractGate);
          if (!validateContractGateSubmission(submission)) fail("contract Gate submission violates its closed contract");
          const supplied = new Map();
          for (const entry of [submission.approval, submission.baseline, ...submission.artifacts]) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate contract Gate artifact");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          const gate = await prepareLocalContractGate({ replayReceipt, approvalRef: submission.approval.ref, baselineRef: submission.baseline.ref,
            loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? executionContext.artifacts.load(ref) });
          const contractGateKey = `contract-gate:${gate.commitDigest}`;
          if (run.state.contractGateKey && run.state.contractGateKey !== contractGateKey) fail("another contract Gate is already sealed", "DR4962", 6);
          for (const { ref, bytes } of [...supplied.values(), { ref: gate.disposition.ref, bytes: Buffer.from(gate.disposition.bytesBase64, "base64") }]) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(contractGateKey, gate);
          nextState = { ...run.state, contractGateKey, status: run.state.contractActivationKey ? run.state.status : "awaiting-contract-activation" };
        } else if (input.executeContracts) {
          const planning = run.state.contractPlanningKey && records.get(run.state.contractPlanningKey);
          if (!planning || planning.planningDigest !== input.executeContracts) fail("contract execution requires exact persisted planning", "DR4962", 6);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const executionId = `CG-${canonicalJsonDigest({ invocation, planning: planning.planningDigest }).slice(7).toUpperCase()}`;
          const execution = await executeLocalContractPlanning({ storage, namespace, graph, checkpointReplay,
            record: records.get(run.state.architectureGateKey), planning, bindings: configuration.contractGenerators,
            executionId, loadArtifact: executionContext.artifacts.load });
          const contractExecutionKey = `contract-execution:${execution.executionFingerprint}`;
          let candidateTrace = null;
          if (execution.candidateRef) {
            const replayReceipt = await verifyLocalContractExecution({ storage, namespace, bindings: configuration.contractGenerators,
              executionId, executionFingerprint: execution.executionFingerprint });
            candidateTrace = await publishLocalContractCandidateTrace({ storage, namespace, graph, replayReceipt, loadArtifact: executionContext.artifacts.load });
          }
          records.put(contractExecutionKey, { planningDigest: planning.planningDigest, candidateTrace, execution: {
            executionId: execution.executionId, executionFingerprint: execution.executionFingerprint,
            checkpointKey: execution.checkpointKey, replayed: false, outcome: execution.outcome,
            progressionAllowed: execution.progressionAllowed, candidate: execution.candidate ?? null,
            candidateRef: execution.candidateRef ?? null, diagnostics: execution.diagnostics,
          } });
          nextState = { ...run.state, contractExecutionKey, status: run.state.contractGateKey ? run.state.status : execution.candidateRef ? "contract-candidate-prepared" : "contract-execution-failed" };
        } else if (input.prepareContractPlanning) {
          const gate = run.state.architectureGateKey && records.get(run.state.architectureGateKey);
          if (!run.state.architectureActivationKey || gate?.commitDigest !== input.prepareContractPlanning) fail("contract planning requires the exact activated architecture Gate", "DR4962", 6);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const planning = await prepareLocalContractPlanning({ storage, namespace, graph, checkpointReplay, record: gate, loadArtifact: executionContext.artifacts.load });
          const contractPlanningKey = `contract-planning:${planning.planningDigest}`;
          if (run.state.contractPlanningKey && run.state.contractPlanningKey !== contractPlanningKey) fail("contract planning is already sealed to another candidate", "DR4962", 6);
          const bytes = Buffer.from(planning.state.bytesBase64, "base64");
          const ref = planning.state.ref;
          const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
          records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
          records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          records.put(contractPlanningKey, planning);
          nextState = { ...run.state, contractPlanningKey, status: run.state.contractExecutionKey || run.state.contractsNotApplicableKey ? run.state.status : "contract-planning-prepared" };
        } else if (input.activateArchitectureGate) {
          const gate = run.state.architectureGateKey && records.get(run.state.architectureGateKey);
          if (configuration.architectureObserverVersion !== "1.1.0") fail("architecture activation requires explicitly configured observer version 1.1.0", "DR4962", 6);
          if (!gate || gate.commitDigest !== input.activateArchitectureGate) fail("architecture activation requires the exact prepared Gate", "DR4962", 6);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const activation = await activateLocalArchitectureGate({ storage, namespace, graph, checkpointReplay, record: gate, loadArtifact: executionContext.artifacts.load });
          const architectureActivationKey = `architecture-activation-record:${gate.commitDigest}`;
          records.put(`artifact:${canonicalJsonDigest(activation.state)}`, { ref: activation.state, stored: activation.storedState });
          records.put(`artifact-pointer:${pointerKey(activation.state)}`, activation.state);
          records.put(architectureActivationKey, activation);
          nextState = { ...run.state, architectureActivationKey, status: run.state.contractExecutionKey || run.state.contractsNotApplicableKey ? run.state.status : run.state.contractPlanningKey ? "contract-planning-prepared" : "architecture-activated" };
        } else if (input.architectureGate) {
          if (!run.state.recordKey || run.state.pendingRequestId) fail("architecture Gate requires a completed Core candidate", "DR4965", 4);
          const submission = json(input.architectureGate);
          if (!validateArchitectureGateSubmission(submission)) fail("architecture Gate submission violates its closed contract");
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const supplied = new Map();
          for (const entry of [submission.ownerApproval, submission.baseline, ...submission.artifacts]) {
            const key = canonicalJsonDigest(entry.ref);
            if (supplied.has(key)) fail("duplicate architecture Gate artifact");
            supplied.set(key, { ref: entry.ref, bytes: read({ path: entry.path, digest: entry.ref.digest }) });
          }
          let gate;
          try {
            assertLocalArchitectureCurrentState({ storage, namespace, state: checkpointReplay.loadedInputs["project-architecture-state"][0].ref });
            gate = await prepareLocalArchitectureGate({ checkpointReplay, ownerApprovalRef: submission.ownerApproval.ref, baselineRef: submission.baseline.ref,
              loadArtifact: ref => supplied.get(canonicalJsonDigest(ref))?.bytes ?? executionContext.artifacts.load(ref) });
          } catch (error) { fail(error.message, "DR4962", 6); }
          const architectureGateKey = `architecture-gate:${gate.commitDigest}`;
          if (run.state.architectureGateKey && run.state.architectureGateKey !== architectureGateKey) fail("another architecture Gate is already sealed", "DR4962", 6);
          for (const { ref, bytes } of supplied.values()) {
            const stored = storage.putArtifact({ artifactId: ref.artifactId, mediaType: ref.mediaType, bytes, expectedDigest: ref.digest });
            records.put(`artifact:${canonicalJsonDigest(ref)}`, { ref, stored });
            records.put(`artifact-pointer:${pointerKey(ref)}`, ref);
          }
          records.put(architectureGateKey, gate);
          nextState = { ...run.state, architectureGateKey, status: "awaiting-gate-activation" };
        } else if (input.requirementsGate) {
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
          nextState = { ...run.state, status: requirementsStatus(run.state, "awaiting-gate-activation"), gateRecordKey };
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
          nextState = { ...run.state, status: requirementsStatus(run.state, "requirements-activated"), gateActivationKey };
        } else if (input.refreshRequirementsContext) {
          if (!run.state.gateActivationKey) fail("context refresh requires an activated requirements pair", "DR4965", 4);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const handoff = await createLocalRequirementsContextHandoff({ storage, namespace: `${namespace}/requirements-gate`, graph,
            checkpointReplay, record: records.get(run.state.gateRecordKey), priorSnapshot: snapshot, priorReceipt: session,
            createdAt: input.refreshRequirementsContext, artifactResolver: loadConfigured,
            resolveArtifact: async (ref) => ({ ref, bytes: await executionContext.artifacts.load(ref) }) });
          const contextHandoffKey = `requirements-context:${handoff.handoffDigest}`;
          if (run.state.contextHandoffKey && run.state.contextHandoffKey !== contextHandoffKey) fail("a different context handoff is already sealed for this boundary", "DR4962", 6);
          records.put(contextHandoffKey, handoff);
          nextState = { ...run.state, status: run.state.contextMaterializationKey ? "requirements-context-materialized" : "requirements-context-prepared", contextHandoffKey };
        } else if (input.materializeRequirementsContext) {
          const stored = run.state.contextHandoffKey && records.get(run.state.contextHandoffKey);
          if (!stored || stored.handoffDigest !== input.materializeRequirementsContext) fail("context materialization requires the exact sealed handoff", "DR4962", 6);
          const checkpointReplay = assertVerifiedCheckpointReplayReceipt(await registry.verifyCheckpointedExecution(invocation, executionContext));
          const handoff = await createLocalRequirementsContextHandoff({ storage, namespace: `${namespace}/requirements-gate`, graph,
            checkpointReplay, record: records.get(run.state.gateRecordKey), priorSnapshot: snapshot, priorReceipt: session,
            createdAt: stored.snapshot.createdAt, artifactResolver: loadConfigured,
            resolveArtifact: async (ref) => ({ ref, bytes: await executionContext.artifacts.load(ref) }) });
          if (!same(handoff, stored)) fail("sealed context handoff drifted", "DR4962", 6);
          const materialization = materializeLocalRequirementsContext({ configuration, handoff, resolvePath: scopedPath });
          const contextMaterializationKey = `context-files:${handoff.handoffDigest}`;
          records.put(contextMaterializationKey, materialization);
          nextState = { ...run.state, status: "requirements-context-materialized", contextMaterializationKey };
        } else if (run.state.gateRecordKey || run.state.discoveryInterpretationKey || run.state.architectureGateKey || run.state.workGateKey) {
          // Ordinary replay cannot erase the Gate handoff or silently advance it.
          nextState = run.state;
        } else try {
          if (!run.state.recordKey && invocation.inputs?.["project-work-dependency-state"]?.length === 1) {
            assertLocalWorkDependencyContextCurrent({ storage, namespace, state: invocation.inputs["project-work-dependency-state"][0],
              boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))) });
          }
          if (!run.state.recordKey && invocation.inputs?.["project-work-breakdown-state"]?.length === 1) {
            await assertLocalWorkInvocationCurrent({ storage, namespace, loadArtifact: loadConfigured, state: invocation.inputs["project-work-breakdown-state"][0],
              boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))) });
          }
          const record = await registry.execute(invocation, executionContext);
          const recordKey = `execution:${canonicalJsonDigest(record)}`;
          records.put(recordKey, record);
          nextState = { ...run.state, status: record.moduleResult.status === "completed" ? "module-completed" : record.moduleResult.status,
            pendingRequestId: null, recordKey };
        } catch (error) {
          if (!(error instanceof DesktopStepRequired)) throw error;
          nextState = { ...run.state, status: "awaiting-desktop", pendingRequestId: error.request.requestId, recordKey: null };
        }
        validateParentState();
        leaseKeeper.assertCurrent();
        if (!same(nextState, run.state)) {
          storage.commitTransition({ runId: id, expectedVersion: run.version, leaseToken: lease.token,
            transition: { kind: "DesktopLocalRunProgress", invocationKey: run.state.invocationKey }, nextState });
        }
        const observed = inspect(input);
        return { ...observed, outcome: nextState.status === "module-completed" ? "completed" : nextState.status,
          ...(nextState.contextMaterializationKey ? { nextConfiguration: records.get(nextState.contextMaterializationKey) } : {}),
          ...(nextState.architectureContextFilesKey ? { nextConfiguration: records.get(nextState.architectureContextFilesKey) } : {}),
          ...(nextState.workContextFilesKey ? { nextConfiguration: records.get(nextState.workContextFilesKey) } : {}),
          ...(nextState.dependencyContextFilesKey ? { nextConfiguration: records.get(nextState.dependencyContextFilesKey) } : {}),
          ...(nextState.assignmentContextFilesKey ? { nextConfiguration: records.get(nextState.assignmentContextFilesKey) } : {}),
          ...(nextState.pendingRequestId ? { desktopRequest: exchange.readRequest(nextState.pendingRequestId) } : {}) };
      } catch (error) {
        // Core may wrap an aborted artifact load. Report the host's original
        // ownership failure instead of misdiagnosing it as missing input bytes.
        leaseKeeper.throwIfFailed();
        throw error;
      } finally { activeLeaseKeeper = undefined; leaseKeeper.close(); }
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
          const invocation = receipt.invocation;
          const record = records.get(observed.state.recordKey);
          if (!same(receipt.moduleResult, record.moduleResult)) fail("Core receipt differs from stored execution", "DR4964", 7);
          const proof = graph.assertApplied(record.traceabilityUpdateRef);
          let architectureGate = null;
          if (observed.state.architectureGateKey) {
            try {
              architectureGate = await verifyLocalArchitectureGate({ checkpointReplay: receipt, record: records.get(observed.state.architectureGateKey), loadArtifact: executionContext.artifacts.load });
              if (observed.state.architectureGateKey !== `architecture-gate:${architectureGate.commitDigest}`) fail("architecture Gate key drifted", "DR4964", 7);
            } catch (error) { fail(`architecture Gate verification failed: ${error.message}`, "DR4964", 7); }
          }
          let architectureActivation = null;
          if (observed.state.architectureActivationKey) {
            architectureActivation = await verifyLocalArchitectureActivation({ storage, namespace, graph, checkpointReplay: receipt,
              record: architectureGate, loadArtifact: executionContext.artifacts.load });
            if (observed.state.architectureActivationKey !== `architecture-activation-record:${architectureGate.commitDigest}` ||
                !same(architectureActivation, records.get(observed.state.architectureActivationKey))) fail("architecture activation record drifted", "DR4964", 7);
          }
          let contractPlanning = null;
          if (observed.state.contractPlanningKey) {
            contractPlanning = await verifyLocalContractPlanning({ storage, namespace, graph, checkpointReplay: receipt,
              record: architectureGate, loadArtifact: executionContext.artifacts.load, planning: records.get(observed.state.contractPlanningKey) });
            if (observed.state.contractPlanningKey !== `contract-planning:${contractPlanning.planningDigest}` ||
                !same(contractPlanning, records.get(observed.state.contractPlanningKey))) fail("contract planning record drifted", "DR4964", 7);
          }
          let contractExecution = null;
          let contractsNotApplicable = null;
          if (observed.state.contractsNotApplicableKey) {
            contractsNotApplicable = await verifyLocalContractsNotApplicable({ storage, namespace, graph, checkpointReplay: receipt,
              record: architectureGate, planning: contractPlanning, commit: records.get(observed.state.contractsNotApplicableKey), loadArtifact: executionContext.artifacts.load });
            if (observed.state.contractsNotApplicableKey !== `contracts-not-applicable:${contractsNotApplicable.commitDigest}`) fail("not-applicable key drifted", "DR4964", 7);
          }
          let contractGate = null;
          let contractActivation = null;
          if (contractsNotApplicable && observed.state.contractActivationKey) {
            if (observed.state.contractExecutionKey || observed.state.contractGateKey) fail("conflicting contract Gate paths", "DR4964", 7);
            contractActivation = await verifyLocalContractsNotApplicableActivation({ storage, namespace, graph, checkpointReplay: receipt,
              record: architectureGate, planning: contractPlanning, commit: contractsNotApplicable, loadArtifact: executionContext.artifacts.load });
            if (observed.state.contractActivationKey !== `contract-activation-record:${contractsNotApplicable.commitDigest}` ||
                !same(contractActivation, records.get(observed.state.contractActivationKey))) fail("no-contract activation record drifted", "DR4964", 7);
          }
          if (observed.state.contractExecutionKey) {
            const saved = records.get(observed.state.contractExecutionKey);
            const executionId = `CG-${canonicalJsonDigest({ invocation: receipt.invocation, planning: contractPlanning.planningDigest }).slice(7).toUpperCase()}`;
            if (saved.planningDigest !== contractPlanning.planningDigest || saved.execution.executionId !== executionId ||
                observed.state.contractExecutionKey !== `contract-execution:${saved.execution.executionFingerprint}`) fail("contract execution identity drifted", "DR4964", 7);
            const verified = await verifyLocalContractExecution({ storage, namespace, bindings: configuration.contractGenerators,
              executionId, executionFingerprint: saved.execution.executionFingerprint });
            const state = JSON.parse(Buffer.from(contractPlanning.state.bytesBase64, "base64"));
            const expectedBindings = [{ role: "architecture-baseline", artifact: state.architectureBaseline },
              { role: "project-contract-state", artifact: contractPlanning.state.ref }, { role: "project-overview-baseline", artifact: state.projectOverviewBaseline }];
            if (!same(verified.checkpoint.inputBindings, expectedBindings) ||
                !same(verified.checkpoint.artifacts.candidate?.ref ?? null, saved.execution.candidateRef ?? null) ||
                !same(verified.checkpoint.artifacts.candidate?.value ?? null, saved.execution.candidate ?? null) ||
                verified.checkpoint.outcome !== saved.execution.outcome || verified.checkpointKey !== saved.execution.checkpointKey ||
                verified.checkpoint.progressionAllowed !== saved.execution.progressionAllowed || saved.execution.replayed !== false ||
                !same(verified.checkpoint.diagnostics, saved.execution.diagnostics)) fail("contract execution inputs or candidate drifted", "DR4964", 7);
            contractExecution = { ...saved, checkpointDigest: verified.checkpointDigest };
            if (saved.execution.candidateRef) await verifyLocalContractCandidateTrace({ storage, namespace, graph,
              replayReceipt: verified, record: saved.candidateTrace, loadArtifact: executionContext.artifacts.load });
            if (observed.state.contractGateKey) {
              contractGate = await verifyLocalContractGate({ replayReceipt: verified, record: records.get(observed.state.contractGateKey), loadArtifact: executionContext.artifacts.load });
              if (observed.state.contractGateKey !== `contract-gate:${contractGate.commitDigest}`) fail("contract Gate key drifted", "DR4964", 7);
              if (observed.state.contractActivationKey) {
                contractActivation = await verifyLocalContractActivation({ storage, namespace, graph, replayReceipt: verified,
                  record: contractGate, loadArtifact: executionContext.artifacts.load });
                if (observed.state.contractActivationKey !== `contract-activation-record:${contractGate.commitDigest}` ||
                    !same(contractActivation, records.get(observed.state.contractActivationKey))) fail("contract activation record drifted", "DR4964", 7);
              }
            }
          }
          let discoveryInterpretation = null;
          let discoveryInterpretationHistory = [];
          if (observed.state.discoveryInterpretationKey) {
            try {
              const history = readDiscoveryInterpretationHistory({ headKey: observed.state.discoveryInterpretationKey, readRecord: key => records.get(key) });
              for (const { record: saved } of history) {
                const derived = await verifyDiscoveryInterpretation(saved.interpretationRef, receipt, executionContext.artifacts.load);
                const expected = { ...derived, ...(Object.hasOwn(saved, "previousInterpretationKey") ? { previousInterpretationKey: saved.previousInterpretationKey } : {}) };
                if (!same(expected, saved)) fail("discovery interpretation checkpoint drifted", "DR4964", 7);
              }
              discoveryInterpretationHistory = history.map(entry => entry.record);
              discoveryInterpretation = discoveryInterpretationHistory[0];
            } catch (error) { fail(`discovery interpretation history verification failed: ${error.message}`, "DR4964", 7); }
          }
          let requirementsGate = null;
          let discoveryGate = null;
          let discoveryActivation = null;
          let architectureContext = null;
          let architectureContextFiles = null;
          if (observed.state.discoveryGateKey) {
            try {
              const saved = records.get(observed.state.discoveryGateKey);
              if (!discoveryInterpretation) fail("discovery Gate has no current interpretation", "DR4964", 7);
              discoveryGate = await prepareArchitectureDiscoveryGate({ checkpointReplay: receipt,
                interpretationRef: discoveryInterpretation.interpretationRef, ownerApprovalRef: saved?.ownerApprovalRef,
                loadArtifact: executionContext.artifacts.load });
              if (!same(saved, discoveryGate) || observed.state.discoveryGateKey !== `discovery-gate:${discoveryGate.commitDigest}`) fail("discovery Gate checkpoint drifted", "DR4964", 7);
              if (observed.state.discoveryActivationKey) {
                discoveryActivation = await verifyLocalDiscoveryActivation({ storage, namespace, checkpointReplay: receipt, gate: discoveryGate,
                  loadArtifact: executionContext.artifacts.load, activation: records.get(observed.state.discoveryActivationKey) });
                if (observed.state.discoveryActivationKey !== `discovery-activation:${discoveryActivation.activationDigest}`) fail("discovery activation key drifted", "DR4964", 7);
                if (observed.state.architectureContextKey) {
                  const stored = records.get(observed.state.architectureContextKey);
                  architectureContext = await createLocalArchitectureContext({ storage, namespace, checkpointReplay: receipt, registry,
                    gate: discoveryGate, activation: discoveryActivation, priorSnapshot: snapshot, priorReceipt: session,
                    loadArtifact: executionContext.artifacts.load, createdAt: stored?.snapshot?.createdAt });
                  if (!same(stored, architectureContext) || observed.state.architectureContextKey !== `architecture-context:${architectureContext.handoffDigest}`) fail("architecture context checkpoint drifted", "DR4964", 7);
                  if (observed.state.architectureContextFilesKey) {
                    architectureContextFiles = materializeLocalArchitectureContext({ configuration, handoff: architectureContext, resolvePath: scopedPath, verifyOnly: true });
                    if (observed.state.architectureContextFilesKey !== `architecture-context-files:${architectureContext.handoffDigest}` || !same(architectureContextFiles, records.get(observed.state.architectureContextFilesKey))) fail("architecture context files checkpoint drifted", "DR4964", 7);
                  }
                }
              }
            } catch (error) { fail(`discovery Gate verification failed: ${error.message}`, "DR4964", 7); }
          }
          let requirementsActivation = null;
          let requirementsContext = null;
          let requirementsContextFiles = null;
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
                if (observed.state.contextHandoffKey) {
                  const stored = records.get(observed.state.contextHandoffKey);
                  requirementsContext = await createLocalRequirementsContextHandoff({ storage, namespace: `${namespace}/requirements-gate`, graph,
                    checkpointReplay: receipt, record: gateRecord, priorSnapshot: snapshot, priorReceipt: session,
                    createdAt: stored?.snapshot?.createdAt, artifactResolver: loadConfigured,
                    resolveArtifact: async (ref) => ({ ref, bytes: await executionContext.artifacts.load(ref) }) });
                  if (!same(requirementsContext, stored) || observed.state.contextHandoffKey !== `requirements-context:${requirementsContext.handoffDigest}`) fail("context handoff differs from its verified boundary", "DR4964", 7);
                  if (observed.state.contextMaterializationKey) {
                    requirementsContextFiles = verifyLocalRequirementsContextFiles({ configuration, handoff: requirementsContext, resolvePath: scopedPath });
                    if (observed.state.contextMaterializationKey !== `context-files:${requirementsContext.handoffDigest}` ||
                        !same(requirementsContextFiles, records.get(observed.state.contextMaterializationKey))) fail("materialized context record drifted", "DR4964", 7);
                  }
                }
              }
            } catch { fail("requirements Gate checkpoint verification failed", "DR4964", 7); }
          }
          let workContext = null;
          let workContextFiles = null;
          if (observed.state.workContextKey) {
            const stored = records.get(observed.state.workContextKey);
            const stateFile = stored?.files?.find(entry => same(entry.ref, stored.state));
            if (!stateFile || !contractActivation) fail("work context lacks activated lineage", "DR4964", 7);
            const stateValue = JSON.parse(Buffer.from(stateFile.bytesBase64, "base64"));
            const saved = observed.state.contractExecutionKey ? records.get(observed.state.contractExecutionKey) : undefined;
            const contractReplayReceipt = saved ? await verifyLocalContractExecution({ storage, namespace, bindings: configuration.contractGenerators,
              executionId: saved.execution.executionId, executionFingerprint: saved.execution.executionFingerprint }) : undefined;
            workContext = await verifyLocalWorkBreakdownContext({ handoff: stored, storage, namespace, graph, registry, checkpointReplay: receipt,
              record: architectureGate, planning: contractPlanning, contractGate: contractGate ?? undefined, contractReplayReceipt,
              notApplicableCommit: contractsNotApplicable ?? undefined, capabilityCatalog: stateValue.capabilityCatalog, repositoryContext: stateValue.repositoryContext ?? stateValue.currentRepositorySnapshot,
              currentWorkBreakdownBaseline: stateValue.currentWorkBreakdownBaseline, approvedChangePackage: stateValue.approvedChangePackage,
              priorSnapshot: snapshot, priorReceipt: session, createdAt: stored.snapshot.createdAt, loadArtifact: executionContext.artifacts.load });
            if (observed.state.workContextKey !== `work-context:${workContext.handoffDigest}` || !same(workContext, stored)) fail("work context record drifted", "DR4964", 7);
            if (observed.state.workContextFilesKey) {
              workContextFiles = materializeLocalWorkBreakdownContext({ configuration, handoff: workContext, resolvePath: scopedPath, verifyOnly: true });
              if (observed.state.workContextFilesKey !== `work-context-files:${workContext.handoffDigest}` || !same(workContextFiles, records.get(observed.state.workContextFilesKey))) fail("work context files drifted", "DR4964", 7);
            }
          }
          let workGate = null;
          let workActivation = null;
          if (observed.state.workGateKey) {
            workGate = await verifyLocalWorkBreakdownGate({ checkpointReplay: receipt, record: records.get(observed.state.workGateKey), loadArtifact: executionContext.artifacts.load });
            if (observed.state.workGateKey !== `work-gate:${workGate.commitDigest}`) fail("work Gate key drifted", "DR4964", 7);
            if (observed.state.workActivationKey) {
              workActivation = await verifyLocalWorkBaselineActivation({ storage, namespace, graph, checkpointReplay: receipt,
                record: workGate, loadArtifact: executionContext.artifacts.load });
              if (observed.state.workActivationKey !== `work-activation-record:${workGate.commitDigest}` ||
                  !same(workActivation, records.get(observed.state.workActivationKey))) fail("work activation record drifted", "DR4964", 7);
            }
          }
          let dependencyContext = null;
          let dependencyContextFiles = null;
          let dependencyExecution = null;
          let dependencyGate = null;
          let dependencyActivation = null;
          if (observed.state.dependencyContextKey) {
            const stored = records.get(observed.state.dependencyContextKey);
            const stateFile = stored?.files.find(entry => same(entry.ref, stored.state));
            if (!stateFile || !workActivation) fail("dependency context lacks activated work lineage", "DR4964", 7);
            const state = JSON.parse(Buffer.from(stateFile.bytesBase64, "base64"));
            dependencyContext = await verifyLocalWorkDependencyContext({ storage, namespace, graph, registry, checkpointReplay: receipt, record: workGate,
              boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))), handoff: stored, priorSnapshot: snapshot, priorReceipt: session,
              contextSliceSet: state.contextSliceSet, policyBundle: state.policyBundle, currentWorkDependencyBaseline: state.currentWorkDependencyBaseline, loadArtifact: executionContext.artifacts.load });
            if (observed.state.dependencyContextKey !== `dependency-context:${dependencyContext.handoffDigest}`) fail("dependency context key drifted", "DR4964", 7);
            if (observed.state.dependencyContextFilesKey) {
              dependencyContextFiles = materializeLocalWorkDependencyContext({ configuration, handoff: dependencyContext, resolvePath: scopedPath, verifyOnly: true });
              if (observed.state.dependencyContextFilesKey !== `dependency-context-files:${dependencyContext.handoffDigest}` ||
                  !same(dependencyContextFiles, records.get(observed.state.dependencyContextFilesKey))) fail("dependency publication drifted", "DR4964", 7);
            }
            if (observed.state.dependencyExecutionKey) {
              const execution = records.get(observed.state.dependencyExecutionKey);
              const verified = await verifyLocalWorkDependencyExecution({ storage, namespace, graph, registry, checkpointReplay: receipt, record: workGate,
                boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))), expectedState: { ref: stored.state, bytes: Buffer.from(stateFile.bytesBase64, "base64") },
                contextSliceSet: state.contextSliceSet, policyBundle: state.policyBundle, currentWorkDependencyBaseline: state.currentWorkDependencyBaseline, binding: configuration.dependencyBinding,
                loadArtifact: executionContext.artifacts.load, execution });
              if (observed.state.dependencyExecutionKey !== `dependency-execution:${verified.executionFingerprint}`) fail("dependency execution key drifted", "DR4964", 7);
              dependencyExecution = { execution, checkpointDigest: verified.checkpointDigest };
              if (observed.state.dependencyGateKey) {
                dependencyGate = await verifyLocalWorkDependencyGate({ replayReceipt: verified,
                  record: records.get(observed.state.dependencyGateKey), loadArtifact: executionContext.artifacts.load });
                if (observed.state.dependencyGateKey !== `dependency-gate:${dependencyGate.commitDigest}`) fail("dependency Gate key drifted", "DR4964", 7);
                if (observed.state.dependencyActivationKey) {
                  dependencyActivation = await verifyLocalDependencyBaselineActivation({ storage, namespace, graph, registry, checkpointReplay: receipt,
                    record: workGate, dependencyGate, boundary: JSON.parse(loadConfigured(roleRef("lifecycle-status"))),
                    expectedState: { ref: stored.state, bytes: Buffer.from(stateFile.bytesBase64, "base64") },
                    contextSliceSet: state.contextSliceSet, policyBundle: state.policyBundle, currentWorkDependencyBaseline: state.currentWorkDependencyBaseline, binding: configuration.dependencyBinding,
                    loadArtifact: executionContext.artifacts.load, execution });
                  if (observed.state.dependencyActivationKey !== `dependency-activation-record:${dependencyGate.commitDigest}` ||
                      !same(dependencyActivation, records.get(observed.state.dependencyActivationKey))) fail("dependency activation record drifted", "DR4964", 7);
                }
              }
            }
          }
          let assignmentContext = null;
          let assignmentContextFiles = null;
          let assignmentExecution = null;
          let assignmentExecutionInputs = null;
          let assignmentGate = null;
          let assignmentActivation = null;
          if (observed.state.assignmentContextKey) {
            const saved = records.get(observed.state.assignmentContextKey);
            const request = await assignmentRequest(observed, invocation);
            assignmentContext = await verifyLocalSpecialistAssignmentContext({ ...request, handoff: saved,
              specialistCatalog: saved.plan.inputs["specialist-catalog"], assignmentPolicy: saved.plan.inputs["assignment-policy"] });
            if (observed.state.assignmentContextKey !== `assignment-context:${assignmentContext.handoffDigest}`) fail("assignment context key drifted", "DR4964", 7);
            if (observed.state.assignmentContextFilesKey) {
              assignmentContextFiles = materializeLocalSpecialistAssignmentContext({ configuration, handoff: assignmentContext, resolvePath: scopedPath, verifyOnly: true });
              if (observed.state.assignmentContextFilesKey !== `assignment-context-files:${assignmentContext.handoffDigest}` ||
                  !same(assignmentContextFiles, records.get(observed.state.assignmentContextFilesKey))) fail("assignment publication drifted", "DR4964", 7);
            }
            if (observed.state.assignmentExecutionKey) {
              const execution = records.get(observed.state.assignmentExecutionKey);
              assignmentExecutionInputs = await assignmentExecutionRequest(observed, invocation, assignmentContext);
              const verified = await verifyLocalSpecialistAssignmentExecution({ ...assignmentExecutionInputs, assignmentExecution: execution });
              if (observed.state.assignmentExecutionKey !== `assignment-execution:${verified.executionFingerprint}`) fail("assignment execution key drifted", "DR4964", 7);
              assignmentExecution = { execution, checkpointDigest: verified.checkpointDigest };
              if (observed.state.assignmentGateKey) {
                const savedGate = records.get(observed.state.assignmentGateKey);
                assignmentGate = await verifySpecialistAssignmentGateV3({ checkpointReplay: verified, record: savedGate,
                  approvalRef: savedGate.approval.ref, loadArtifact: executionContext.artifacts.load });
                if (observed.state.assignmentGateKey !== `assignment-gate:${assignmentGate.commitDigest}`) fail("assignment Gate key drifted", "DR4964", 7);
                if (observed.state.assignmentActivationKey) {
                  assignmentActivation = await verifyLocalAssignmentBaselineActivation({ ...assignmentExecutionInputs,
                    assignmentExecution: execution, assignmentGate });
                  if (observed.state.assignmentActivationKey !== `assignment-activation-record:${assignmentGate.commitDigest}` ||
                      !same(assignmentActivation, records.get(observed.state.assignmentActivationKey))) fail("assignment activation record drifted", "DR4964", 7);
                }
              }
            }
          }
          let workReadiness = null;
          const workQuality = {};
          if (observed.state.workReadinessKey) {
            if (!assignmentActivation || !assignmentGate || !assignmentExecution || !assignmentContext || !assignmentExecutionInputs) fail("queue lacks verified assignment activation", "DR4964", 7);
            // Reuse preparation for this exact observed run only. Downstream
            // verifiers still revalidate their evidence and live artifact loads.
            const request = assignmentExecutionInputs;
            const baselines = await prepareLocalExecutionBaselines({ ...request, assignmentExecution: assignmentExecution.execution, assignmentGate });
            workReadiness = await deriveLocalWorkReadiness({ storage, namespace, baselines, loadArtifact: request.loadArtifact,
              verifyIntegration: exactInvocation => registry.verifyCheckpointedExecution(exactInvocation, executionContext) });
            if (observed.state.workReadinessKey !== `work-readiness:${workReadiness.readinessDigest}` ||
                !same(workReadiness, records.get(observed.state.workReadinessKey))) fail("work queue is stale or substituted; prepare it again", "DR4964", 7);
          }
          const qualityPolicyGate = observed.state.qualityPolicyGateKey ? await verifyLocalQualityPolicyGate({
            record: records.get(observed.state.qualityPolicyGateKey), loadArtifact: executionContext.artifacts.load }) : null;
          if (qualityPolicyGate && observed.state.qualityPolicyGateKey !== `quality-policy-gate:${qualityPolicyGate.preparationDigest}`) fail("quality Gate identity drifted", "DR4964", 7);
          const qualityPolicyActivation = observed.state.qualityPolicyActivationKey ? await verifyLocalQualityPolicyActivation({
            storage, namespace, graph, record: qualityPolicyGate, loadArtifact: executionContext.artifacts.load }) : null;
          if (qualityPolicyActivation) {
            if (observed.state.qualityPolicyActivationKey !== `quality-policy-activation-record:${qualityPolicyActivation.preparationDigest}` ||
                !same(qualityPolicyActivation, records.get(observed.state.qualityPolicyActivationKey))) fail("quality activation identity drifted", "DR4964", 7);
            assertLocalQualityPolicyCurrent({ storage, namespace, baseline: qualityPolicyActivation.baseline });
          }
          for (const [workItemId, key] of Object.entries(observed.state.workQualityKeys ?? {})) {
            if (!workReadiness) fail("quality handoff lacks a verified queue", "DR4964", 7);
            const record = await verifyLocalWorkQualityHandoff({ record: records.get(key), readiness: workReadiness, loadArtifact: executionContext.artifacts.load });
            if (!qualityPolicyActivation || !same(record.submission.qualityPolicy.ref, qualityPolicyActivation.baseline)) fail("quality handoff policy is not activated", "DR4964", 7);
            if (key !== `work-quality:${record.preparationDigest}` || record.submission.workItemId !== workItemId) fail("work quality identity drifted", "DR4964", 7);
            workQuality[workItemId] = record;
          }
          const workExecutionPreparations = {};
          for (const [attemptId, key] of Object.entries(observed.state.workExecutionPreparationKeys ?? {})) {
            const saved = records.get(key);
            const qualityHandoff = workQuality[saved?.submission?.workItemId];
            if (!workReadiness || !qualityHandoff || saved.submission.attemptId !== attemptId) fail("execution preparation lacks current work/quality lineage", "DR4964", 7);
            const prepared = await verifyLocalWorkExecutionHandoff({ projectId: configuration.projectId, record: saved,
              readiness: workReadiness, qualityHandoff, loadArtifact: executionContext.artifacts.load });
            if (key !== `work-execution-preparation:${prepared.record.preparationDigest}`) fail("execution preparation identity drifted", "DR4964", 7);
            workExecutionPreparations[attemptId] = prepared.record;
          }
          const workClaims = {};
          for (const [attemptId, key] of Object.entries(observed.state.workClaimKeys ?? {})) {
            const record = records.get(key);
            const preparation = workExecutionPreparations[attemptId];
            if (!validateWorkClaimRecord(record) || !preparation || record.request.attemptId !== attemptId ||
                record.request.preparationDigest !== preparation.preparationDigest) fail("claim preparation identity differs", "DR4964", 7);
            storage.readRun(`work-continuity/${configuration.projectId}`);
            const store = createDurableWorkContinuityStore({ storage, projectId: configuration.projectId });
            const result = verifyLocalWorkContinuityClaim({ storage, store,
              workFingerprint: JSON.parse(Buffer.from(preparation.artifacts.workFingerprint.bytesBase64, "base64")),
              attemptId, owner: record.request.owner, leaseExpiresAt: record.request.leaseExpiresAt,
              expectedHostVersion: record.request.expectedHostVersion, expectedIndexRevision: record.request.expectedIndexRevision });
            const body = { kind: "LocalWorkExecutionClaim", request: record.request, result, dispatchAuthorized: false };
            const expected = { ...body, claimDigest: canonicalJsonDigest(body) };
            if (!same(expected, record) || key !== `work-execution-claim:${expected.claimDigest}`) fail("claim evidence differs", "DR4964", 7);
            workClaims[attemptId] = record;
          }
          return { outcome: "verified", scope: "core-checkpoint-and-graph", lifecycleComplete: false, workClaims, workExecutionPreparations, qualityPolicyGate, qualityPolicyActivation, workQuality, workReadiness, assignmentActivation, assignmentGate, assignmentExecution, assignmentContext, assignmentContextFiles, dependencyActivation, dependencyGate, dependencyExecution, dependencyContext, dependencyContextFiles, workContext, workContextFiles, workGate, workActivation,
            moduleResultDigest: canonicalJsonDigest(receipt.moduleResult), applicationProof: proof, discoveryInterpretation, discoveryInterpretationHistory, discoveryGate, discoveryActivation, architectureContext, architectureContextFiles, architectureGate, architectureActivation, contractPlanning, contractExecution, contractGate, contractActivation, contractsNotApplicable, requirementsGate, requirementsActivation, requirementsContext, requirementsContextFiles, integrity: storage.verifyIntegrity() };
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
          qualityPolicyGate: observed.state.qualityPolicyGateKey ? records.get(observed.state.qualityPolicyGateKey) : null,
          qualityPolicyActivation: observed.state.qualityPolicyActivationKey ? records.get(observed.state.qualityPolicyActivationKey) : null,
          discoveryInterpretation: observed.state.discoveryInterpretationKey ? records.get(observed.state.discoveryInterpretationKey) : null,
          discoveryGate: observed.state.discoveryGateKey ? records.get(observed.state.discoveryGateKey) : null,
          discoveryActivation: observed.state.discoveryActivationKey ? records.get(observed.state.discoveryActivationKey) : null,
          architectureContext: observed.state.architectureContextKey ? records.get(observed.state.architectureContextKey) : null,
          architectureContextFiles: observed.state.architectureContextFilesKey ? records.get(observed.state.architectureContextFilesKey) : null,
          architectureGate: observed.state.architectureGateKey ? records.get(observed.state.architectureGateKey) : null,
          architectureActivation: observed.state.architectureActivationKey ? records.get(observed.state.architectureActivationKey) : null,
          contractPlanning: observed.state.contractPlanningKey ? records.get(observed.state.contractPlanningKey) : null,
          contractExecution: observed.state.contractExecutionKey ? records.get(observed.state.contractExecutionKey) : null,
          contractGate: observed.state.contractGateKey ? records.get(observed.state.contractGateKey) : null,
          contractActivation: observed.state.contractActivationKey ? records.get(observed.state.contractActivationKey) : null,
          contractsNotApplicable: observed.state.contractsNotApplicableKey ? records.get(observed.state.contractsNotApplicableKey) : null,
          workContext: observed.state.workContextKey ? records.get(observed.state.workContextKey) : null,
          workContextFiles: observed.state.workContextFilesKey ? records.get(observed.state.workContextFilesKey) : null,
          workGate: observed.state.workGateKey ? records.get(observed.state.workGateKey) : null,
          workActivation: observed.state.workActivationKey ? records.get(observed.state.workActivationKey) : null,
          dependencyContext: observed.state.dependencyContextKey ? records.get(observed.state.dependencyContextKey) : null,
          dependencyContextFiles: observed.state.dependencyContextFilesKey ? records.get(observed.state.dependencyContextFilesKey) : null,
          assignmentContext: observed.state.assignmentContextKey ? records.get(observed.state.assignmentContextKey) : null,
          assignmentContextFiles: observed.state.assignmentContextFilesKey ? records.get(observed.state.assignmentContextFilesKey) : null,
          assignmentExecution: observed.state.assignmentExecutionKey ? records.get(observed.state.assignmentExecutionKey) : null,
          assignmentGate: observed.state.assignmentGateKey ? records.get(observed.state.assignmentGateKey) : null,
          assignmentActivation: observed.state.assignmentActivationKey ? records.get(observed.state.assignmentActivationKey) : null,
          workReadiness: observed.state.workReadinessKey ? records.get(observed.state.workReadinessKey) : null,
          workQuality: Object.fromEntries(Object.entries(observed.state.workQualityKeys ?? {}).map(([id, key]) => [id, records.get(key)])),
          dependencyExecution: observed.state.dependencyExecutionKey ? records.get(observed.state.dependencyExecutionKey) : null,
          dependencyGate: observed.state.dependencyGateKey ? records.get(observed.state.dependencyGateKey) : null,
          dependencyActivation: observed.state.dependencyActivationKey ? records.get(observed.state.dependencyActivationKey) : null,
          discoveryInterpretationHistory: observed.state.discoveryInterpretationKey ? readDiscoveryInterpretationHistory({ headKey: observed.state.discoveryInterpretationKey, readRecord: key => records.get(key) }).map(entry => entry.record) : [],
          requirementsGate: observed.state.gateRecordKey ? records.get(observed.state.gateRecordKey) : null,
          requirementsActivation: observed.state.gateActivationKey ? records.get(observed.state.gateActivationKey) : null,
          requirementsContext: observed.state.contextHandoffKey ? records.get(observed.state.contextHandoffKey) : null,
          requirementsContextFiles: observed.state.contextMaterializationKey ? records.get(observed.state.contextMaterializationKey) : null,
          pendingRequest: observed.state.pendingRequestId ? exchange.readRequest(observed.state.pendingRequestId) : null };
      },
    });
    return Object.freeze({ cli, close: () => storage.close() });
  } catch (error) { storage.close(); throw error; }
}
