# Modular coding workflow verification

Date: 2026-09-28. Candidate: `0.12.0-modular.1`, branch `codex/modular-mvp`.
Host: ChatGPT/Codex Desktop on Windows, bundled Node 24.19.0 and existing npm 11.6.2. No new dependencies.

## Working boundary

The existing generic Core runs a declared inspect → edit → verify chain. Its three native bindings reuse the repository inventory, capability enforcement and SQLite/artifact storage already in DevRelay. Desktop authors explicit requests. A request pins project context, file preimages, Node executable, grants and tests.

The workflow created `examples/modular/code.mjs` in the real DevRelay checkout, ran all five CLI tests successfully, and replayed the stored result from a reopened host without repeating effects. This execution used DevRelay's exact approved requirements/overview pair and matching rendered Markdown. A separate initially empty directory received the greeting source, package manifest and test through the CLI; its actual Node test passed.

The sample project context is historical demonstration data. These local example runs do not approve lifecycle Gates, promote graph facts, certify external providers, or establish full-product acceptance.

## Superpowers development method

Read and applied source skills from [Superpowers commit 8ca22dba9a94f28898bbce59f2537ff4d87c747d](https://github.com/obra/superpowers/tree/8ca22dba9a94f28898bbce59f2537ff4d87c747d): design/planning, inline plan execution, TDD, systematic debugging, independent review and verification before completion. Superpowers is a development method, not a runtime dependency or an installed plug-in claim.

Native PowerShell/Node maintained the progress ledger and receipts in place of unavailable Bash helpers.

Ruling: the existing process enforcer accepts an optional explicit environment. Inherited `NODE_TEST_CONTEXT` was suppressing nested test execution. The coding verifier removes that variable and `NODE_OPTIONS`; existing callers retain the default environment. A failing real-process test demonstrated the defect before the fix. Generic Core is unchanged.

## Independent review

A separate read-only reviewer checked the exact 16-file source manifest and reproduced two important defects: ancestor/descendant file conflicts and UTF-8 replacements exceeding the byte limit could fail after a partial edit. Both now reject during request preflight, before request binding or mutation.

New tests first reproduced both failures. The fixed workflow and affected host/Core regressions then passed **94 tests, zero failures**. The tests also prove the rejected request can be corrected and executed without a poisoned effect record. No review findings were deferred. The review conclusion is candidate evidence only; no Gate or ProjectMemory promotion occurred.

Other covered behaviors include existing/new projects, real failed tests, denied grants before edits, stale preimages, path/link protection, replay without repeated tests, stale current-workspace flags, immutable request identities, and quarantine after checkpoint failure or process timeout.

## Repository and package checks

- Full local run: **1,243 tests; 1,241 passed, zero failed, two skipped** in 828 seconds. The optional historical-source cases require DEVRELAY_DG1_ARCHITECTURE_SOURCE_ROOT and DEVRELAY_DG1_SOURCE_BUNDLE.
- That run started before the two review fixes; the affected 94-test suite was rerun after both fixes and passed. Do not treat the earlier full run as a separate full-suite rerun of the final edits.
- Static checks passed: 9,822 JSON files, 969 JavaScript modules, LF policy and all 28 downstream operations' explicit ProjectOverview context. The final added documentation also passed the LF check.
- The generated catalog binds 11,582 source-file digests and 461 package files. Offline installation succeeded and all 232 exported targets loaded.
- The Desktop skill's YAML metadata and body passed checks with the repository's existing js-yaml parser.

Two review boundaries remain explicit: concurrent writers/link-replacement races require an additional workspace lease or isolated host; untrusted tests require a sandbox and subprocess supervisor. This example promises neither. These are scope rulings, not deferred defects.

## ProjectMemory and context

Bootstrap receipt `DPMBR-A2C9EEFD120735CC` passed; the prior session state was `concluded`.

- Baseline: `PMB-MUC-7A172C974C0158E7`
- Baseline digest: `sha256:47eddea9836521b0b1557782740121feab15d5fbc9ad6556654172b0334a57e4`
- Synopsis digest: `sha256:4d1ec4b933d0736cb2d7ad568816788d50bcbc5dd018e7a95cce51fd83e6caab`
- Graph-checkpoint digest: `sha256:1207f84ad9e7ea077f59f4a4d8731c31feb0b9e0ee8c22a75a02600e7d8dccee`

The approved version 2.8.0 requirements/overview pair, raw-byte references and exact Markdown projection were revalidated. Requirements digest: `sha256:bc30f849481c962c66e33ced6791f37e227e949744e54ca42164fcb4df518284`; overview digest: `sha256:071ba150c1c1c760cc88839f1d84f3b829e49f9ece1b96557a7f7f023a72004d`. This additive example supports `CAP-DEV-EXTENSIBILITY-001` and `BO-DEV-ADOPTION-001`.

The review's exact DesktopTaskPlan digest is `sha256:ac29a42199a4996a97ff0d6aac6026c3680a561e41cead61546618467c6339b5`; its memory-context digest is `sha256:9ccefe82ece78e5966d86c2ca9a455eea242ed8d0abe27b1eb0fd7f1a37b6422`, with bootstrap `DPMBR-88200351A869E772`. The reviewer recomputed these bindings and all source hashes.

## Reproduction and local records

```powershell
node --test test/modular-coding.test.mjs test/modular-coding-cli.test.mjs
node examples/modular/code.mjs --list
npm test
npm run release:check
```

Follow [the coding quickstart](modular-coding-quickstart.md) for the sample project or a bounded existing-project request. Raw RED/GREEN logs, self-host result/diff, new-project report, bootstrap/review bindings and progress ledger are retained locally under `.devrelay/modular-coding/`; they are not public acceptance artifacts.

Candidate session conclusion: the modular framework now has a functioning local coding reference workflow for trusted Node projects. It retains one-writer operation, bounded UTF-8 creation/replacement and explicit project context. It is not an OS sandbox, a general command runner, or a completed governed engineering lifecycle.
