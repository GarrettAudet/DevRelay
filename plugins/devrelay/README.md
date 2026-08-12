# DevRelay Desktop plugin

This repository-owned `0.9.0` plugin connects ChatGPT Desktop on Windows to
the local typed DevRelay STDIO MCP bridge. Install, upgrade, diagnose, roll
back, and uninstall it with the receipt-bound commands in
[`docs/chatgpt-desktop-windows.md`](../../docs/chatgpt-desktop-windows.md).

The workflow skill presents Core-returned clarification questions, Gate
decisions, run reports, task state, and evidence. It never selects routes,
answers clarifications, approves Gates, edits lifecycle state, or claims that
a work-item handoff is verified or integrated.

Use `devrelay_list_runs` to discover persisted local runs without a known run
ID. It returns only privacy-safe run metadata in deterministic newest-first
pages (default 50, allowed 1 through 100) and an opaque `nextCursor` when more
results exist. The command is read-only: warnings identify unreadable or
corrupt persisted runs but do not repair them, and listing grants no routing,
Gate, progression, resume, or workflow-mutation authority. Inspect the chosen
run separately before acting on it.

This is a local personal-marketplace package, not a public plugin-directory
listing. Adapter maturity is evidence-bound: `fixture-conformant` does not mean
live interoperability, and only a unique `release-ready` binding satisfies a
mandatory Desktop capability.
