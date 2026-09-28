# Modular coding workflow implementation plan

> For agentic workers: use Superpowers executing-plans inline; TDD and one independent review.

**Goal:** Make the modular preview useful for an explicitly requested coding change inside Desktop.
**Architecture:** Extend the existing generic Core chain and catalog; reuse native inventory, capability enforcement and local host persistence. Desktop supplies explicit file replacements.
**Tech stack:** Node >=22, existing Ajv and node:sqlite; no new dependencies.
**Spec:** docs/superpowers/specs/2026-09-28-modular-coding-workflow.md

## Global constraints
- Preserve Generic Core and existing lifecycle authority.
- Exact project context enters through declared input ports.
- Existing workspaces and initially empty new-project directories both work.
- Trusted Node tests only; timeout 100..120000 ms; no implicit network or coding agent.
- Never repeat an uncertain effect; immutable evidence and exact replay are required.
- Keep evidence in .devrelay/modular-coding; use native PowerShell/Node instead of unavailable Bash bookkeeping.

## Review focus
- Windows path aliases, reparse points and hard links cannot broaden writes.
- Persisted success cannot be presented as fresh verification of a changed workspace.
- All edits and all step grants are checked before the first mutation.
- Crash/timeout cannot cause blind repeat of a file or process effect.
- New projects and failed tests return truthful, inspectable results.

## Task 1: Runnable chain
Files: examples/modular/coding-contracts.mjs, coding-storage.mjs, coding-files.mjs, coding.mjs; test/modular-coding.test.mjs.
Interface: createCodingWorkflow({workspace,stateDirectory,requirementsBytes,overviewBytes,overviewMarkdownBytes}) -> {catalog, invocation(request), execute(request), close()}. execute returns {result,report,replayed}; immutable requestId binding.
- [x] Write meaningful integration tests against temporary real files and Node tests; verify RED.
- [x] Define the Module/plug-in and request/artifact schemas before host implementation.
- [x] Implement exact paths, persistence, inventory, bounded changes and verification; verify GREEN.
- [x] Run existing chain, local-host, native-inventory and modular regressions; commit.

## Task 2: Desktop experience and delivery
Files: examples/modular/code.mjs; docs/modular-coding-quickstart.md; .codex/skills/devrelay-modular/SKILL.md; support list; package metadata.
CLI: node examples/modular/code.mjs <workspace> <context-directory> <request.json>; --list is read-only. Failed tests exit 1, malformed/blocked execution exits 2; success exits 0.
- [x] Write and run CLI success/failure/import tests to RED.
- [x] Implement CLI and Desktop instructions; verify GREEN.
- [x] Prove a real change on DevRelay and a new project; record exact evidence.
- [x] Run full regression, independent review, static and installed-package checks.
- [x] Fix material findings with regression tests; prepare verified delivery and evidence for PR #35.

Publishing and merge status are recorded by [PR #35](https://github.com/GarrettAudet/DevRelay/pull/35).
