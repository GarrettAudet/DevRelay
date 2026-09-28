# Modular coding in Desktop

The Desktop preview adds a small front door to the existing modular coding workflow. Describe a change in this conversation; the devrelay-code skill prepares an exact request, runs native inspect/edit/test bindings, and returns a diff plus actual test evidence. Both existing repositories and new project directories are supported. No separate model service is required.

## Install the local runtime and Desktop plug-in

Use Node >=22 and a trusted DevRelay source checkout with its exact dependencies installed, or install the release tarball into a stable local directory:

```powershell
npm install --prefix C:\DevRelayRuntime C:\Downloads\devrelay-0.12.0-modular.2.tgz
```

The runtime root is then C:\DevRelayRuntime\node_modules\devrelay. For a source checkout, it is the checkout root. The tarball is published on GitHub; this does not require public npm publication. Dependency installation is an explicit operator step.

Copy the runtime's plugins/devrelay-desktop directory to the local source registered for your Desktop plug-in. For an existing personal installation, inspect `codex plugin list --marketplace personal --json` and use its exact local source directory. Do not overwrite an unrelated plug-in or hand-edit the marketplace.

Configure that source copy, then reinstall it:

```powershell
node <local-plugin-source>/scripts/configure-runtime.mjs <runtime-root>
codex plugin add devrelay-desktop@personal
```

When updating an existing runtime configuration use --replace explicitly. Refresh the local source's version cachebuster with the Desktop plugin-creator workflow before reinstalling; do not change the numeric release version merely to force cache refresh. A first-time personal-marketplace registration uses that same plugin-creator workflow. The runtime directory must remain available: the plug-in cache holds a configured launcher and skills, not a bundled copy of the runtime or its dependencies.

Open a new Desktop chat after installation so it discovers the updated skill. Say: **Use DevRelay to change this repository** or **Use DevRelay to start a new project**, then describe the intended behavior. The runtime pins its configured path, package version, and entry-point digest; it does not attest every dependency or isolate hostile local processes.

## One-time project setup

Supply this project's approved requirements-baseline.json, project-overview-baseline.json, and exact ProjectOverview.md in one context directory. The runtime verifies schemas, the exact pair, and Markdown projection before creating a new project. Missing approval must go through the project's requirements/Gate workflow. Historical example context is only for demonstrations.

```powershell
node <local-plugin-source>/scripts/code.mjs list
node <local-plugin-source>/scripts/code.mjs setup existing <workspace> <context-directory>
# Or: setup new <absent-or-empty-workspace> <context-directory>
node <local-plugin-source>/scripts/code.mjs run <workspace> <request.json>
```

Setup stores an immutable context snapshot at .devrelay/modular-project.json; the same context can be reopened without copying it each run. A different approved context requires a separately configured workspace in this preview. Existing source files remain in place.

The installed runtime also exposes examples/modular/desktop.mjs with the same commands for an explicit manual invocation from Desktop.

## Evidence and limitations

The result preserves the raw report, unified diff, test exit code/output, and effect receipts. Replayed results are historical, and currentWorkspaceMatches reports drift separately. Failures retain changes for diagnosis. Tests are trusted project code, with an explicit Node test file list rather than arbitrary inferred commands.

See [coding requests and recovery](modular-coding-quickstart.md) and [supported plug-ins](supported-plugins.md). The larger governed lifecycle remains available through devrelay-orchestrate. Superpowers guides development of DevRelay; it is not a runtime dependency.
