export const goal = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "GoalArtifact",
  goalId: "goal-chatgpt-desktop-runtime-v1",
  statement:
    "Make DevRelay release-ready as a deterministic library that is installed and fully used end to end from ChatGPT Desktop on Windows to build production-quality software.",
  objectives: [
    "Package DevRelay as a repository-backed plugin that can be installed and invoked from ChatGPT Desktop on Windows.",
    "Expose the deterministic lifecycle through a bounded typed local MCP surface while Core retains all routing, Gate, traceability, and progression authority.",
    "Create one isolated Codex task for each Core-derived runnable work item and validate immutable handoffs before downstream progression.",
    "Provide at least one genuinely live executable binding path through every mandatory lifecycle capability.",
    "Prove release readiness with a clean-install Desktop run that builds and business-accepts a real bounded software feature.",
  ],
  constraints: [
    "The supported V1 product surface is ChatGPT Desktop on Windows.",
    "The release distribution is a repository-backed local plugin marketplace rather than public directory publication.",
    "DevRelay remains provider-neutral and cannot become a coding-agent wrapper or transfer workflow authority to Desktop, MCP, app-server, a model, or an adapter.",
    "Alternative adapter bindings must retain evidence-backed maturity labels; fixture conformance cannot be presented as live interoperability.",
    "The reference release path is local-first and cannot require WSL, a hosted backend, or a second IDE.",
  ],
  acceptanceCriteria: [
    "A clean Windows user can install the repository plugin, restart ChatGPT Desktop, and start or resume a DevRelay run in a new task.",
    "The plugin exposes typed run, clarification, Gate, progression, task, evidence, and report operations without a route or approval bypass.",
    "Every ready work item is executed in a distinct Codex task with an immutable context bundle and raw verified handoff.",
    "Every mandatory module and Gate resolves to at least one release-ready binding in the accepted reference circuit.",
    "A clean-install reference run builds, verifies, integrates, system-verifies, and business-accepts a real bounded feature with complete traceability.",
    "Interrupted runs resume from checkpoints without repeated effects or duplicate integration.",
  ],
  assumptions: [
    "The local marketplace boundary, per-work-item task model, and live-path acceptance standard required owner confirmation.",
    "The bootstrap RequirementsGathering run uses the released bounded OpenSpec conversation contract and does not claim OpenSpec CLI execution.",
  ],
});

export const projectContext = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "ProjectContext",
  projectId: "devrelay",
  lifecycle: "existing",
  summary:
    "DevRelay 0.9.0 is a private, source-verification-green deterministic library with eleven executable module manifests and twenty-four adapter manifests, but it is not yet an installable ChatGPT Desktop product and many optional external bindings are only contract- or fixture-conformant.",
  stakeholders: [
    "DevRelay product owner",
    "Windows ChatGPT Desktop software builders",
    "Workflow and plugin maintainers",
    "Adapter authors",
    "Security and release reviewers",
  ],
  domainConstraints: [
    "Generic Core cannot branch on a Desktop, model, module, operation, plugin, or product identifier.",
    "ChatGPT Desktop is the supported user surface; DevRelay Core remains the workflow authority.",
    "Codex app-server is an execution-host integration and cannot select readiness, verify itself, approve Gates, or integrate its own work.",
    "External hosts enforce filesystem, process, network, and secret permissions.",
    "Traceability contributors are trusted Core infrastructure; plugin and task outputs may declare domain references only.",
  ],
  conventions: [
    "Use SHA-256-bound immutable artifacts, exact versions, checkpoints, raw task handoffs, and merge proofs at every authority boundary.",
    "Run the released lifecycle cumulatively and append every completed module or Gate before using it to build the next capability.",
    "Expose current stage, outcome, evidence, Gate state, runnable frontier, and performance in a human-readable run report.",
    "Fail closed on baseline or repository drift, missing live bindings, malformed handoffs, incomplete evidence, permission violations, and traceability gaps.",
    "Keep optional alternatives replaceable and state their exact maturity and availability.",
  ],
  sourceRefs: [],
});

export const questions = Object.freeze([
  Object.freeze({
    id: "Q-DEV-DESKTOP-DISTRIBUTION-001",
    prompt:
      "Should V1 be release-ready when installable from a repository-backed local marketplace in ChatGPT Desktop on Windows, without public OpenAI plugin-directory publication?",
    rationale:
      "The distribution boundary determines package layout, installation evidence, upgrade and rollback behavior, and whether external publication review is a release blocker.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Ship V1 as a repository-backed local marketplace plugin installable in ChatGPT Desktop on Windows; public directory publication is not required (recommended)",
      "Require public universal plugin-directory publication before calling V1 release-ready",
    ],
  }),
  Object.freeze({
    id: "Q-DEV-DESKTOP-WORK-ITEM-TASKS-001",
    prompt:
      "Should every Core-derived runnable work item execute in its own Codex task through local app-server, with DevRelay retaining dependency, Gate, verification, and integration authority?",
    rationale:
      "This choice determines whether the requested discrete-task workflow is a real execution contract or only a chat convention.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Create one Codex task per runnable work item through local app-server while DevRelay Core retains DAG, Gate, and verified-handoff authority (recommended)",
      "Execute all work items inside the single orchestration task",
    ],
  }),
  Object.freeze({
    id: "Q-DEV-DESKTOP-ACCEPTANCE-PROOF-001",
    prompt:
      "Should release acceptance require one live path through every mandatory module plus a clean-install Desktop run that builds and accepts a real bounded software feature, while alternatives remain maturity-labelled?",
    rationale:
      "A green library and fixture-conformant adapters do not prove that a user can actually complete the workflow from the supported Desktop surface.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Require one live path through every mandatory module plus a clean-install Desktop run that builds and accepts a real bounded software feature; keep alternative adapters maturity-labelled (recommended)",
      "Treat library tests and fixture-conformant adapter contracts as sufficient release proof",
    ],
  }),
]);
