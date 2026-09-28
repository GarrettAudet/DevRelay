---
name: devrelay-code
description: Make a bounded coding change in an existing repository or start a new project through DevRelay's modular inspect, edit, and test workflow inside this Desktop conversation.
---

# Code with DevRelay in Desktop

Use this entry point for the modular preview. Desktop authors the change; the local DevRelay runtime validates and executes its declared steps. Use the existing orchestration skill only when the user requests the larger approved dependency-frontier workflow.

## Start with the project

Follow the target repository's instructions, including its ProjectMemory bootstrap when present. Keep the work in this conversation. Ask only for missing intent: existing repository or new project, target directory, intended behavior, and meaningful tests. Reuse answers and authorization already given.

Resolve this installed skill's plug-in root (two levels above this SKILL.md's directory). Use its `scripts/code.mjs` with an available Node >=22 runtime; on this Windows Desktop the bundled Node is normally under `$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`. Quote paths. Do not assume the plug-in cache contains the DevRelay runtime.

Run `node <plugin-root>/scripts/code.mjs list` to verify the configured runtime and display exact supported bindings. If configuration is missing or drifted, read the DevRelay runtime's `docs/modular-desktop-quickstart.md` and configure the explicitly selected local installation. Never download a runtime or choose a different project implicitly.

## Prepare context once

The project needs its own approved RequirementsBaseline, paired ProjectOverviewBaseline, and exact rendered ProjectOverview.md. Reuse an approved pair when this change is in scope. Copy their exact bytes into one context directory when canonical locations differ. Never promote a candidate, invent an approval, or borrow demonstration context for an unrelated project. When a pair is absent, perform the project's normal requirements clarification and Gate workflow with the user before setup.

Run `node <plugin-root>/scripts/code.mjs setup existing <workspace> <context-directory>`, or `setup new` for an absent or empty directory. Setup validates and saves the exact context. Existing setup is idempotent for identical bytes; a changed baseline needs a separately configured workspace in this preview.

## Make and verify the change

Read the relevant source and tests. Use test-first development for changed behavior. Write a request JSON with a unique requestId, goal, readPaths, changes, testFiles, and timeoutMs. Each change contains path, beforeDigest (SHA-256 of the exact current bytes, or null for a genuinely absent file), and full UTF-8 content. Use only explicit JavaScript Node test files and a timeout from 100 to 120000 ms. Never substitute a successful test process for meaningful assertions.

Run `node <plugin-root>/scripts/code.mjs run <workspace> <request.json>`. This invokes native inventory, bounded edits, and real Node tests through Core. On test failure inspect the retained diff/output and prepare a new scoped request; never rewrite an old request ID or erase its state to repeat uncertain effects.

Return the resulting diff, actual tests and outcome, and any limitation. A replay is historical evidence. Report currentWorkspaceMatches separately; stale replay cannot establish current success. Exit 0 means verified and current, 1 means tests failed or replay is stale, and 2 means invalid or blocked execution.

## Boundaries

This preview handles trusted local Node projects and explicit text-file creation/replacement. It does not install dependencies, delete files, run arbitrary inferred shell commands, grant OS isolation, promote graph facts, or replace lifecycle Gates. The runtime limits changes to 50 files, declared paths to 100, and each text file to 1 MiB; protected instruction paths are excluded. Inspect interrupted runs and active test processes before recovery. Do not delete .devrelay state to force retries.

The skill has no independent integration, publication, or memory-promotion authority. Preserve a candidate-only conclusion where the repository requires one.
