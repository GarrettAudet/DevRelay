---
name: devrelay-code
description: Prepare a plain bounded change card and use DevRelay's opt-in governed coding path for an approved existing project, or use its explicitly separate legacy preview when requested.
---

# Code with DevRelay in Desktop

Use this entry point for the modular preview. Desktop authors the change; the local DevRelay runtime validates and executes its declared steps. Use the existing orchestration skill only when the user requests the larger approved dependency-frontier workflow.

This is the legacy preview, not the governed approval boundary. The additive programmatic `createGovernedCodingWorkflow` is documented in `docs/modular-governed-preflight.md`; its opt-in durable CLI bridge and limits are in `docs/modular-governed-host.md`. This does not switch the installed default. A blocked `governed-run` must not silently fall back to this preview. Read-only `inspect <workspace> <paths...>` remains available without setup or approval.

## Start with the project

Follow the target repository's instructions, including its ProjectMemory bootstrap when present. Keep the work in this conversation. Ask only for missing intent: existing repository or new project, target directory, intended behavior, and meaningful tests. Reuse answers and authorization already given.

Resolve this installed skill's plug-in root (two levels above this SKILL.md's directory). Use its `scripts/code.mjs` with an available Node >=22 runtime; on this Windows Desktop the bundled Node is normally under `$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`. Quote paths. Do not assume the plug-in cache contains the DevRelay runtime.

Run `node <plugin-root>/scripts/code.mjs list` to verify the configured runtime and display exact supported bindings. If configuration is missing or drifted, read the DevRelay runtime's `docs/modular-desktop-quickstart.md` and configure the explicitly selected local installation. Never download a runtime or choose a different project implicitly.

## Opt-in governed bounded work

When the governed lane is selected, keep authoring in this conversation and read
`docs/modular-bounded-work.md`. Do not switch the installed default, install a
plug-in, or access a different computer implicitly. This lane requires an already
active, aligned approved existing Git project; onboarding, new repositories and
rebaselining are outside this slice. Never fall back to legacy preview when it
blocks.

Use `bounded-inspect <workspace> <paths...>` through this same launcher. Review
the actual criterion text, approved design/contract targets, current source and
tests. Prefer existing components. Author one code/test item, its exact card,
and semantic design-reuse evidence bound to the returned current snapshot and
inspection. Do not classify unchanged scope from path names alone. New criteria,
interfaces, dependencies, platform/security changes, migrations or material
design changes belong in the normal full-change path; uncertain effects require
clarification.

Generate the internal prepare envelope yourself; never ask the user to edit JSON
or collect replay bundles. `bounded-prepare` may write candidate evidence only in
the existing host state area. Present its readable card with Change, Reuse, Touch,
Verify, and Excludes/risks, retaining criterion text and meaningful regression
assertions. Put IDs and digests in technical evidence, not the main explanation.
Ask for approval only for this genuinely new exact work. A changed card needs a
new preparation identity and decision. General continuing-work instructions do
not authenticate an owner decision.

Approval must pass through the trusted embedding conversation host's
`captureDecision` port, preserving the original exact human message and binding
it to the pending candidate/card/head. The launcher's `main(args, trustedHost)`
supports that port, but ordinary command-line JSON cannot supply it. If the host
does not expose authenticated conversation capture, report `HUMAN_DECISION_REQUIRED`
and preserve the prepared card; do not invent an approval file, callback result,
or missing Desktop capability. No installed Desktop proof is implied here.

A rejected/cancelled/revised card causes no code effects. After exact approval,
the host exports and refreshes the complete validated lineage automatically;
then author the bounded coding request and use `governed-plan` / `governed-run`.
Never expose the replay bundle as user setup work. Existing tests must assert the
actual criterion behavior. After independently authorized integration commits a
change, inspect the new clean HEAD and plan the next item without reapproving
unchanged upstreams. Preserve historical approvals/evidence; do not rewrite an
architecture snapshot to make it current. Use `bounded-status` to resume and
`bounded-cancel` to dismiss the exact pending card.

## Legacy preview: prepare context once

The project needs its own approved RequirementsBaseline, paired ProjectOverviewBaseline, and exact rendered ProjectOverview.md. Reuse an approved pair when this change is in scope. Copy their exact bytes into one context directory when canonical locations differ. Never promote a candidate, invent an approval, or borrow demonstration context for an unrelated project. When a pair is absent, perform the project's normal requirements clarification and Gate workflow with the user before setup.

Run `node <plugin-root>/scripts/code.mjs setup existing <workspace> <context-directory>`, or `setup new` for an absent or empty directory. Setup validates and saves the exact context. Existing setup is idempotent for identical bytes; a changed baseline needs a separately configured workspace in this preview.

## Legacy preview: make and verify the change

Read the relevant source and tests. Use test-first development for changed behavior. Write a request JSON with a unique requestId, goal, readPaths, changes, testFiles, and timeoutMs. Each change contains path, beforeDigest (SHA-256 of the exact current bytes, or null for a genuinely absent file), and full UTF-8 content. Use only explicit JavaScript Node test files and a timeout from 100 to 120000 ms. Never substitute a successful test process for meaningful assertions.

Run `node <plugin-root>/scripts/code.mjs run <workspace> <request.json>`. This invokes native inventory, bounded edits, and real Node tests through Core. On test failure inspect the retained diff/output and prepare a new scoped request; never rewrite an old request ID or erase its state to repeat uncertain effects.

Return the resulting diff, actual tests and outcome, and any limitation. A replay is historical evidence. Report currentWorkspaceMatches separately; stale replay cannot establish current success. Exit 0 means verified and current, 1 means tests failed or replay is stale, and 2 means invalid or blocked execution.

## Boundaries

This preview handles trusted local Node projects and explicit text-file creation/replacement. It does not install dependencies, delete files, run arbitrary inferred shell commands, grant OS isolation, promote graph facts, or replace lifecycle Gates. The runtime limits changes to 50 files, declared paths to 100, and each text file to 1 MiB; protected instruction paths are excluded. Inspect interrupted runs and active test processes before recovery. Do not delete .devrelay state to force retries.

The skill has no independent integration, publication, or memory-promotion authority. Preserve a candidate-only conclusion where the repository requires one.
