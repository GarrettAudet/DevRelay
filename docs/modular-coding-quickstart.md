# Run a coding change inside Desktop

The modular coding example is a working local workflow: native inventory → explicit file change → real Node tests → diff and evidence. Desktop interprets your request and authors the change. DevRelay validates and executes the declared steps through its existing Core. No external coding agent or model API is required.

## Try the new-project example

From this checkout, using Node >=22 (the bundled Desktop runtime also works):

```powershell
node examples/modular/code.mjs --list
New-Item -ItemType Directory -Path .devrelay/hello-project
node examples/modular/code.mjs .devrelay/hello-project examples/modular/context examples/modular/new-project-request.json
```

The command creates a small greeting module, its package manifest and its test, then actually runs the test. It prints JSON containing the outcome, full-file unified diff, native inventory (null for an initially empty project), process exit code, stdout/stderr and a digest-bound host receipt.

The context above is explicitly historical demonstration context. Governed work supplies the project's exact approved requirements/overview pair and matching rendered Markdown. No baseline is manufactured or promoted by this example.

Repeating the same command loads the stored result without applying the change or rerunning tests. `replayed: true` labels historical evidence. `currentWorkspaceMatches` checks the declared file set against that evidence; a mismatch exits unsuccessfully even if the stored tests passed. A fresh verification needs a new explicitly scoped request, not an implied rerun of old effects.

## Use it for an existing project

In Desktop, describe a bounded change and its intended test. The agent reads the relevant files, follows repository instructions, and writes a request JSON with:

- A unique `requestId` and a concrete `goal`.
- `readPaths`: extra project files relevant to inspection.
- `changes`: each relative path, SHA-256 digest of its exact current bytes, and complete proposed UTF-8 content. Use null only to create a file that does not exist.
- `testFiles`: explicit JavaScript files to run with Node's test runner.
- `timeoutMs`: 100 to 120000.

Then run:

```powershell
node examples/modular/code.mjs <workspace> <context-directory> <request.json>
```

The context directory contains `requirements-baseline.json`, `project-overview-baseline.json` and `ProjectOverview.md`. If the project's canonical files live in different directories, copy their exact bytes to a run-context directory; keep the canonical sources unchanged. The existing runtime validates pairing, digests and the deterministic Markdown projection.

Desktop should present the requested change, the resulting diff, actual tests and their outcome, and whether the result is replayed. A test failure retains the change and evidence for diagnosis; it never becomes a passing result. Exit codes: 0 verified/current, 1 failed tests or stale replay, 2 invalid or blocked execution.

## Scope and recovery

This initial coding example supports trusted local Node tests and bounded UTF-8 file creation/replacement. It accepts at most 50 changes, 100 declared files and 1 MiB per source file. It rejects traversal, Windows aliases, symlinks/junctions, multiply linked files, and instruction/control paths. It does not delete files, install dependencies or infer test commands.

All edit preconditions and all step grants are checked before mutation. Writes are atomic per file, not across the batch. Use one active writer and one state directory per workspace; this is not isolation from other editors or an OS sandbox. Tests are trusted project code and can have their own effects.

Artifacts, before/after content and Core checkpoints persist under `<workspace>/.devrelay/modular-coding/`. A marker is committed before file writes or process launch. If an operation is interrupted before its Core checkpoint is saved, that operation is quarantined on retry. Inspect the workspace, stored evidence and any still-running test processes before an explicitly authorized recovery; never delete the state directory to force a blind repeat. Completed results replay without duplicate effects.

These native example bindings do not replace WorkExecution or WorkItemVerification Gates and do not create business-acceptance or graph facts. The larger governed lifecycle remains available as a separate workflow.

See [support status](supported-plugins.md) and [the generic modular quickstart](modular-quickstart.md) for adapter contracts and host boundaries.
