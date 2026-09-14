# ProjectMemory on ChatGPT Desktop for Windows

ProjectMemory is DevRelay's authoritative, cross-cutting context service. A configured fresh Desktop task loads `CurrentSynopsis.md`, the exact `ProjectMemoryBaseline`, and a checkpoint-bound `TraceabilityContextProjection` before any lifecycle module. An unconcluded prior task blocks startup until the operator resumes, concludes, or explicitly abandons it.

The stable facade exposes `conclude(relay, { taskId, sessionId, ... })`. `/conclude` gathers a typed `MemoryUpdateCandidate`, presents every `add`, `replace`, `supersede`, `retain`, and `reject` proposal, and requires exact owner dispositions. Only `ProjectMemoryGate` can atomically promote the baseline, regenerate `CurrentSynopsis.md`, merge trusted traceability, synchronize the derived provider, and return a `ConcludeReceipt`. Worker tasks submit candidate-only conclusions to their parent; they never mutate the baseline.

Mem0 is optional, local-first, and derived. The adapter denies network and source transmission by default and accepts live maturity only from a digest-bound host-observed execution attestation. Provider failure blocks unless Core proves a complete native-equivalent context. Mem0 never receives baseline, Gate, filesystem-wide, or graph mutation authority.

Unreleased conclusion hardening binds canonical baseline, candidate and provider
receipt references and main-task lineage before promotion. Qualitative changes
routed to another owning Module/Gate cannot be approved by the memory Gate alone.
An exact conclusion retry reuses its committed result; changing the result graph,
provider receipt or source evidence under the same conclusion/approval identity
fails closed with `DR5369`, without another commit. These checks do not implement
owning-Gate resolution ingestion or prove that existing memory is semantically
current. The default conclusion journal remains an in-memory reference store;
durable atomic persistence and restart recovery require the host implementation.

For a repository task, `AGENTS.md` requires the deterministic
the dependency-free `plugins/devrelay-desktop/scripts/memory-bootstrap.mjs` command, using Codex Desktop's bundled Node runtime from the fresh worktree, before
substantive work. Managed task prompts carry the resulting receipt and every
`DesktopTaskPlan` pins its memory-context digest, so baseline drift changes the
plan identity and fails closed. The plug-in packages the orchestration skill;
Codex plug-in lifecycle hooks are not claimed or relied upon.

This release supports GitHub source operated from ChatGPT/Codex Desktop on Windows. It does not claim automatic tab-close interception, a one-click Desktop plug-in, a hosted memory backend, public npm publication, or access to unrelated chats.
