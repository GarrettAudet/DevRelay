# Modular coding workflow

Owner authorization: the 2026-09-28 "Proceed" following the inspect/change/test proposal. Both existing repositories and new projects remain supported, inside ChatGPT Desktop on Windows.

Extend the existing modular host example with one ordered Core adapter chain: inspect, edit, verify. Desktop interprets the user's coding request and authors explicit file replacements. DevRelay runs that declared change and reports actual results. There is no external coding-agent process or model dependency.

Reuse the generic Module registry/catalog, native architecture inventory, local SQLite/artifact storage and capability enforcer. Add only example bindings and host glue. Preserve the current approved 2.8.0 requirements/overview pair, Generic Core, lifecycle Gates and traceability APIs. This exercises CAP-DEV-EXTENSIBILITY-001 and BO-DEV-ADOPTION-001; the example is not a replacement for governed lifecycle acceptance.

Input: a request ID, goal, bounded read paths, full UTF-8 file replacements with exact before digests (null for creation), explicit Node test files and a timeout of 100..120000 ms. Context is the exact requirements/overview/Markdown triplet. Host configuration pins the workspace and Node executable. The empty workspace is a valid new-project input.

Contracts: one example.coding-change@1.0.0 Module operation apply-and-verify; inspect/edit handoffs and terminal verified/tests_failed results. Each step has a pinned plug-in and explicit grants. Whole-chain preflight occurs before reads/writes/processes.

The host rejects traversal, symlinks/junctions, Windows path aliases, control directories and duplicate paths. All edit preconditions are checked before any write. File changes are atomic per file; interrupted multi-file work is quarantined, not silently repeated. Existing content is retained in immutable artifacts. Only explicit trusted Node tests are executed; this is not an OS sandbox.

Persist artifacts and Core checkpoints using the existing local host store. Record an effect-started marker before file writes or process launch. A completed Core checkpoint replays with zero calls; an incomplete effect is quarantined. A request ID cannot be rebound to different content or workspace. Reports distinguish stored observations from current workspace state.

Prove a failing function is repaired in an existing repository and build/test a small new project. Test missing grants, stale preimages, malformed requests, unsafe paths, test failure, timeout, durable replay, request substitution and interrupted-effect recovery. Run the repository suite, package checks and independent review before updating PR #35.

Acceptance for this slice: the documented CLI performs the real chain and produces an inspectable diff and raw test evidence on both project types. External provider certification, automatic application design and full business acceptance remain outside this example.
