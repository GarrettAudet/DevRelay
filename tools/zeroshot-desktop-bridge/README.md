# Zeroshot → Desktop agent bridge

Experimental local build tool, separate from DevRelay's released product runtime.
It embeds the **unmodified Zeroshot v10.3.0 Rust engine** at commit
`054ad3fd6c763b98d12f5b2e90830b97116561ad` and supplies a `NodeDriver` that
exchanges files with an active Codex Desktop parent task on Windows.

```text
Active Desktop parent task
  ↕ reserve request / spawn native agent / record native final
Node broker + immutable request/result files
  ↕ NodeDriver
Zeroshot admission → SQLite ledger → supervisor → graph reducer
```

Zeroshot owns its graph scheduling, parallel reviews, bounded repair loop,
response-contract validation and terminal result. The parent task calls the
native collaboration tools. This executable never starts Codex CLI, requests
API credentials, invokes an undocumented Desktop API, or publishes Git changes.

## Scope and status

- This is a diagnostic/construction tool, **not a released DevRelay Module or
  approved lifecycle execution binding**. No requirements, architecture,
  downstream baselines or Gates are promoted by its results.
- `software-change.graph.json` is the actual v10.3.0 built-in graph exported
  with delivery disabled. Its worker, two reviews and repair loop are upstream
  behavior. The exported instructions mention delivery; this host rejects all
  Git-delivery bindings and does not perform that operation.
- Desktop agents inherit the parent model, effort and available permissions.
  `desktop-inherited` is an explicit host-selection marker, not a model name.
  Model/effort overrides, reusable native sessions, environment connections,
  API providers and delivery bindings are rejected before queue creation.
- `prepare-diagnostic-plan.mjs` binds a fresh, exact ProjectMemory bootstrap
  into a real `DesktopTaskPlan` for **read-only diagnostics** in the parent's
  retained Git worktree. Its lease describes that actual worktree; it is not
  issued by DevRelay's production durable-worktree manager. It does not grant
  product implementation or replace lifecycle approval.
- Native agents share the host's permissions. Read-only reviewer instructions
  are a behavioral boundary, not an OS-enforced sandbox. Queue digests detect
  drift/substitution; local files and parent-supplied receipts are not a security
  boundary against another process with the same filesystem access.

## Build and check

Validated toolchain: Rust 1.98.1 `x86_64-pc-windows-gnu` and portable w64devkit
2.10.0. Both can live under a project setup directory; no WSL or global PATH
change is needed. `Cargo.lock` pins all resolved dependencies; Cargo fetches
Zeroshot from the exact commit in `Cargo.toml`.

```powershell
./tools/zeroshot-desktop-bridge/build.ps1 -ToolchainRoot <local-toolchain> -TargetDirectory <build-output>
$env:DEVRELAY_ZEROSHOT_BRIDGE = '<build-output>/debug/devrelay-zeroshot-desktop.exe'
node --test tools/zeroshot-desktop-bridge/broker.test.mjs tools/zeroshot-desktop-bridge/engine.test.mjs
```

The engine tests use scripted response fixtures and are explicitly separate
from native-agent evidence. They test admission rejection, the real upstream
review/repair loop, malformed outputs, timeout, lost-runtime restart, and
terminal replay without dispatch. Broker tests exercise request/plan/memory
binding, reservations, agent identity, immutable finals and closed requests.

## Active Desktop coordinator procedure

1. Preserve the exact local source snapshot, task text and upstream graph.
   Use `configuration.mjs GRAPH WORKSPACE SNAPSHOT TASK OUTPUT RUN_ID GIT` to
   create a configuration. The source revision describes the Git base; the
   separate snapshot digest binds candidate input. It does not claim a clean
   checkout or approved product state.
2. Run `devrelay-zeroshot-desktop validate CONFIG QUEUE`, then `run CONFIG QUEUE`
   as an observed local process. Keep this parent task active. Inspect
   `broker.mjs status QUEUE`; dispatch only requests emitted by the engine.
3. For a diagnostic request, run
   `prepare-diagnostic-plan.mjs QUEUE REQUEST_ID GIT` and inspect the exact
   bootstrap/plan. Run `broker.mjs claim QUEUE REQUEST_ID PLAN`. A reservation
   is written **before** any native creation call.
4. Use the parent's native `collaboration.spawn_agent` with a fresh context,
   the request's exact prompt and the worktree/plan/startup instructions.
   Do not use sidebar task creation for these subordinate agents. Do not
   translate requested model settings into unsupported tool overrides.
5. Preserve the actual returned native identity/receipt. Bind it using
   `broker.mjs bind QUEUE REQUEST_ID AGENT_ID RECEIPT_FILE`. Keep the parent
   responsive while the agent works. Reviewers receive independent contexts.
6. Preserve the agent's actual final JSON without rewriting its verdict, then
   `broker.mjs respond QUEUE REQUEST_ID AGENT_ID FINAL_FILE`. The native final
   must be exactly `{ "response": ... }`; the Rust engine checks its required
   output/signal/diagnostic types. Worker `verified` is upstream nomenclature,
   not independent DevRelay verification or business acceptance.
7. Continue until `terminal.json` matches the SQLite terminal record. Return
   candidate-only session conclusions to the parent and reconcile every
   outstanding native agent before ending this task.

## Interruption and limits

A reservation with no native receipt is uncertain work: **do not automatically
spawn another agent**. Find the original native task or stop for reconciliation.
Only the parent can interrupt a known native agent; the Rust process cannot
call Desktop tools. Cancelling the engine does not itself terminate native
agents. Expired/cancelled/terminal requests reject late responses.

The broker requires a recent engine heartbeat and live process. The OS file
lock prevents two supervisors sharing one queue. Starting the same completed
configuration returns the saved terminal result without new dispatch. Starting
after a process loss with an outstanding execution follows Zeroshot's
`runtime_lost` behavior: it fails closed and retains the evidence. This version
does not resume an in-flight native agent or provide unattended background
operation after the parent task closes.

Use local NTFS storage. Immutable files are flushed then published with a
no-clobber hard link; SQLite owns durable graph history. This is not a claim of
power-loss atomicity across separate broker and engine files. A crash between
reservation, creation, binding or submission requires reconciliation.

## Follow-on product integration

The selected product direction remains ready-made workflows with swappable
modules/agent configurations, followed by measured Meta-Harness improvement.
Production use requires the current requirements/overview change lineage,
architecture and contract approval, approved execution planning, actual
worktree/capability policy, live conformance and business acceptance. Existing
rc.4 lifecycle drift is not resolved by this tool. The optimizer activation
policy remains an open decision for that later scope.
