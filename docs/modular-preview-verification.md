# Modular preview verification

Date: 2026-09-28. Candidate: `0.12.0-modular.0`, branch `codex/modular-mvp`, based on `b9fdc997c21269c22ae2c46abbbb544b4e982c32`.

This is an additive developer preview. It does not promote a requirements baseline, approve a release, complete the full coding harness, or certify external integrations.

## Delivered boundary

The focused `devrelay/modular` export adds an immutable, exactly filtered registration catalog over the existing Core registry. Core validation, grants, artifact checks, effect checkpoints and traceability behavior remain unchanged. The bundled SHA-256 example has real Node and WebCrypto implementations, explicit project-context inputs, replacement and composition. A source Desktop skill and maturity-qualified support list accompany it.

Superpowers development skills were read from [commit 8ca22dba9a94f28898bbce59f2537ff4d87c747d](https://github.com/obra/superpowers/tree/8ca22dba9a94f28898bbce59f2537ff4d87c747d). Design, planning, test-first execution, independent review and completion verification were performed inside Desktop. Native PowerShell/Node replaced unavailable Bash progress helpers. Superpowers is not a runtime dependency.

## Verification observations

Host: Windows, bundled Node 24.19.0, existing npm 11.6.2. No new package dependencies.

- Focused catalog, example, Module registry, adapter-chain, artifact and traceability regressions: **75 passed**. Known independent digest vectors, actual file input in an existing repository and a newly created project, output-to-input composition, denied grants, malformed results and durable replay without repeating a real file effect are covered.
- Full repository command: **1,225 tests; 1,221 passed, 2 failed, 2 skipped; 998 seconds**. Both failures were version references: the BusinessAcceptance test pinned `0.11.0-rc.3`, and the README release inventory still named that version. Both were corrected. The two affected test files were rerun: **8 passed, 0 failed**. The entire suite was not rerun after those corrections.
- The two optional historical-source tests skipped because `DEVRELAY_DG1_ARCHITECTURE_SOURCE_ROOT` and `DEVRELAY_DG1_SOURCE_BUNDLE` were not configured. No live historical-source rerun is claimed.
- Repository static checks passed: JSON parsing, JavaScript syntax, LF policy and all 28 released downstream operations' explicit project-overview inputs.
- The package checker successfully packed, installed offline into an isolated consumer, and loaded **225 exported targets**, including the modular entry point and example. The branch has its own release catalog; existing published catalogs remain unchanged.
- The Python skill validator could not load PyYAML. Equivalent metadata/body checks passed using the already installed `js-yaml` parser; this does not claim execution of the Python helper.

The local raw logs and bootstrap/review bindings are retained under `.devrelay/modular-mvp/` in the implementation checkout. They are local run records, not public acceptance artifacts.

## Independent review and fixes

A separate read-only reviewer checked the exact source manifest and ran all 16 tests present at review time. It found one P2: the documented sample context used numbered filenames that the runner did not accept. A packaged sample-context directory now supplies the exact historical bytes under the documented filenames. New CLI tests first reproduced the failure and then passed.

An additional consumer test exposed execution on importing the exported CLI. A direct-execution guard now keeps imports inert. Three regression tests were added for these CLI behaviors. The reviewer returned a candidate-only conclusion and granted no approval or memory authority.

## ProjectMemory and approved context

Bootstrap `modular-mvp-build-20260928` passed, receipt `DPMBR-FACB94670ABAB6FC`; prior session state was `concluded`.

- Baseline: `PMB-MUC-7A172C974C0158E7`
- Baseline digest: `sha256:47eddea9836521b0b1557782740121feab15d5fbc9ad6556654172b0334a57e4`
- Synopsis digest: `sha256:4d1ec4b933d0736cb2d7ad568816788d50bcbc5dd018e7a95cce51fd83e6caab`
- Graph-checkpoint digest: `sha256:1207f84ad9e7ea077f59f4a4d8731c31feb0b9e0ee8c22a75a02600e7d8dccee`

The existing approved requirements/overview pair is version 2.8.0. Exact bytes, pairing and Markdown projection were verified. Requirements digest: `sha256:bc30f849481c962c66e33ced6791f37e227e949744e54ca42164fcb4df518284`; overview digest: `sha256:071ba150c1c1c760cc88839f1d84f3b829e49f9ece1b96557a7f7f023a72004d`. The additive work uses `CAP-DEV-EXTENSIBILITY-001`, `BO-DEV-MODULARITY-001` and `BO-DEV-ADOPTION-001`. The broader release-scope proposal remains separate from this implementation.

Candidate session conclusion: retain the smaller modular developer entry point and use the full lifecycle as a future reference workflow. The two local digest implementations prove substitution; they are not a complete coding workflow. No ProjectMemory promotion is claimed.

## Reproduce

With Node >=22, npm and repository dependencies available:

```powershell
node --test test/plugin-catalog.test.mjs test/modular-example.test.mjs
node --test test/business-acceptance-release.test.mjs test/work-item-verification-documentation.test.mjs
npm test
npm run release:check
node examples/modular/run.mjs README.md examples/modular/context node-sha256
node examples/modular/run.mjs README.md examples/modular/context webcrypto-sha256
```
