# ChatGPT Desktop on Windows

This guide covers the private DevRelay `0.9.0` source release. It installs a
repository-owned plugin through a local personal marketplace and runs a typed
STDIO MCP bridge on the same Windows host. It is not a public plugin-directory
release and it does not introduce a hosted DevRelay backend.

## What is required

- Windows `x64` or `arm64` with ChatGPT Desktop and a local Codex host.
- Node.js 20 or newer and the `node` and `codex` commands on `PATH`.
- An authorized DevRelay source checkout at the exact revision to install.
- Write access to dedicated plugin, marketplace, and receipt directories.

Run commands from PowerShell at the repository root. Choose empty, dedicated
destinations; the examples keep operational state outside the checkout.

```powershell
$Repo = (Resolve-Path .).Path
$State = Join-Path $env:LOCALAPPDATA 'DevRelay\ChatGPTDesktop'
$Marketplace = Join-Path $State 'marketplaces\devrelay'
$Plugin = Join-Path $Marketplace 'plugins\devrelay'
$RunRoot = Join-Path $State 'runs'
$Receipt = Join-Path $State 'receipts\install.json'

npm ci
npm run desktop:install:test
& .\scripts\install-chatgpt-desktop-plugin.ps1 `
  -Operation install `
  -RepositoryPath $Repo `
  -PluginPath $Plugin `
  -MarketplacePath $Marketplace `
  -RunRootPath $RunRoot `
  -ReceiptPath $Receipt
& .\scripts\chatgpt-desktop-plugin-health-check.ps1 -ReceiptPath $Receipt
```

The installer verifies the local manifest and marketplace entry, checks Node
and Codex, installs the plugin beneath the marketplace root so
`./plugins/devrelay` resolves, materializes an absolute repository-backed MCP
transport configuration and dedicated run root, and writes an installation receipt
containing the source revision, package digests, and every installed-file
digest. Keep the receipt: upgrade, rollback, uninstall, and health checks bind
to it. The repository checkout and its installed dependencies remain required;
the installer does not copy `node_modules`. Do not use `-SkipDependencyCheck` for an operator install; that switch is
for isolated tests.

Add or select the installed personal marketplace in ChatGPT Desktop, enable
the DevRelay plugin, and restart Desktop if it does not discover the plugin or
its `devrelay` MCP server. The bridge is local STDIO; it does not require a
DevRelay network service.

## Operate a run

Ask ChatGPT Desktop to use the DevRelay plugin, for example:

> Start a DevRelay run for this repository and show every clarification or
> approval point before progressing.

The plugin exposes eight typed operations through the local bridge:

| MCP tool | Operator intent |
| --- | --- |
| `devrelay_create_run` | Create or load a content-addressed run from an exact goal and project context. |
| `devrelay_inspect_run` | Render the approved run view and report for an exact revision. |
| `devrelay_submit_clarification` | Submit the operator's answers against the returned checkpoint. |
| `devrelay_submit_gate_decision` | Submit `approve`, `reject`, or `request-revision` with exact approval evidence. |
| `devrelay_progress_run` | Request progression from an exact approved predecessor. |
| `devrelay_resume_run` | Resume from an exact checkpoint and checkpoint digest. |
| `devrelay_get_evidence` | Retrieve one evidence artifact by its exact identity. |
| `devrelay_list_runs` | Discover persisted runs through privacy-safe, read-only metadata. |

Run-scoped requests carry a `runId`, `requestId`, and `expectedRevision`. Reuse the
artifact references and revision returned by the latest response. A stale
revision, changed digest, missing live capability, or permission failure is a
stop condition, not an invitation to edit repository JSON or bypass Core.

Expected responses report one of `completed`, `clarification-required`,
`gate-required`, `unable-to-proceed`, or `failed`, plus diagnostics and a typed
next action. At a clarification or Gate:

1. Inspect the current run and present the exact questions, candidate, evidence,
   and diagnostics to the responsible human.
2. Record that human's answer or decision. The plugin and work-item tasks do
   not approve themselves.
3. Submit it with the exact checkpoint or Gate candidate and current revision.
4. Progress or resume only after DevRelay reports the decision or checkpoint
   as durable.

At an execution frontier, Core determines which work items are ready. The
Desktop supervisor creates or reconnects one isolated Codex task per ready
item and preserves its task identity and raw handoff. A task's handoff is only
a candidate: WorkItemVerification and ChangeIntegration remain separate
authorities. Never interpret task completion as verification, integration, or
BusinessAcceptance.

## Discover persisted runs safely

Use `devrelay_list_runs` when the run ID is unknown, such as after restarting
ChatGPT Desktop. The request is deliberately smaller than every workflow
command:

```json
{"operation":"list-runs","requestId":"REQ-LIST-RUNS-001","limit":50}
```

`operation` and `requestId` are required. `limit` is optional, defaults to 50,
and accepts integers from 1 through 100. If a response includes `nextCursor`,
pass that opaque value back unchanged as `cursor` to request the next page. Do
not decode, edit, or persist assumptions about cursor contents. Omitting
`nextCursor` means the current page is terminal. Repeating the same request
against unchanged persisted state returns the same deterministic page.

Each returned run contains only `runId`, `revision`, `lifecycleState`,
`checkpoint`, `recoveryStatus`, `createdAt`, and `updatedAt`. Results are newest
first by `updatedAt`, with `runId` providing a stable tie break. The list does
not return prompts, goals, source content, credentials, raw evidence, reports,
or lifecycle artifacts. `createdAt` and `updatedAt` are derived from the local
persisted revision files; they are not remote-service timestamps.

The response status is `completed` and may include bounded warning diagnostics
with codes `DESKTOP_RUN_UNREADABLE` or `DESKTOP_RUN_CORRUPT`. A recovered run
uses `recoveryStatus: "recovered"` and reports the latest valid readable
revision. Preserve the warning and inspect the selected run before acting; the
list command does not repair or delete corrupt state.

Listing is discovery only. It has no `runId` or `expectedRevision` input and no
authority to create, inspect, progress, resume, route, repair, approve, reject,
or mutate a workflow. Use `devrelay_inspect_run` with the selected `runId` and
current revision before making any workflow decision.

## Read status, reports, and evidence

Use `devrelay_inspect_run` for normal status checks. Its run view includes the
active stage, pending Gate, runnable frontier, task states, evidence,
traceability, performance observations, report reference, and durable
checkpoint. These are observations; the report never controls routing or
satisfies a Gate.

Use `devrelay_get_evidence` when the view names evidence that must be reviewed.
Preserve its artifact ID and SHA-256 digest when escalating or auditing. A
metric may be explicitly captured, not reported, or not applicable; do not
invent a value when the report records an absence disposition.

## Capability maturity and limitations

Maturity applies to an exact, version-pinned adapter binding:

- `contract-defined`: the interface exists, but executable conformance has not
  been demonstrated.
- `fixture-conformant`: bounded fixtures pass; this is not live upstream-tool
  interoperability.
- `live-conformant`: the real configured tool path has executed conformantly,
  but is not automatically release-ready.
- `release-ready`: the exact binding is eligible for the controlled Desktop
  release path.

Capability resolution fails closed when a mandatory capability has no unique
`release-ready` binding. The source release still explicitly does not claim
live OpenSpec, GitHub Spec Kit, Task Master, Structurizr, or MADR command
adapters, universal alternative-adapter maturity, public marketplace
publication, or a durable hosted graph service. Consult the current typed run
evidence rather than promoting a fixture label in prose.

## Diagnose and recover

First check installed bytes against the receipt:

```powershell
& .\scripts\chatgpt-desktop-plugin-health-check.ps1 -ReceiptPath $Receipt
```

Use these bounded responses:

- **Plugin or MCP server unavailable:** confirm `node` and `codex` resolve in
  the Desktop host environment, rerun the health check, inspect the startup
  diagnostic, then restart Desktop. Do not simulate a run from repository
  artifacts.
- **Installed-file digest mismatch:** treat the installation as drifted. Do
  not overwrite it with `install`; perform a receipt-bound `upgrade` or restore
  the prior version with `rollback`.
- **Stale revision or compare-and-swap conflict:** inspect the run again and
  retry with the returned revision. Never change the run store by hand.
- **Checkpoint or digest mismatch:** locate the last durable checkpoint from
  the run view and call resume with that exact reference and digest. If it is
  unavailable or corrupt, stop and preserve the diagnostic.
- **Task disconnect or Desktop restart:** inspect the run. The supervisor may
  reconnect only to the persisted task identity; it must not silently create a
  replacement for an ambiguous task.
- **Missing live capability:** inspect the maturity inventory and install or
  configure the exact approved binding. A fixture-only alternative cannot be
  relabeled to unblock the run.
- **Permission denial:** review the task's declared read, write, process, and
  external-service grants. Expand permissions only through an approved policy
  change; do not bypass the denial.

### Upgrade, rollback, and uninstall

An upgrade requires the current receipt and creates a new receipt whose backup
can be used for rollback:

```powershell
$UpgradeReceipt = Join-Path $State 'receipts\upgrade.json'
& .\scripts\install-chatgpt-desktop-plugin.ps1 `
  -Operation upgrade -RepositoryPath $Repo -PluginPath $Plugin `
  -MarketplacePath $Marketplace -ReceiptPath $UpgradeReceipt `
  -PriorReceiptPath $Receipt

$RollbackReceipt = Join-Path $State 'receipts\rollback.json'
& .\scripts\install-chatgpt-desktop-plugin.ps1 `
  -Operation rollback -RepositoryPath $Repo -PluginPath $Plugin `
  -MarketplacePath $Marketplace -ReceiptPath $RollbackReceipt `
  -PriorReceiptPath $UpgradeReceipt -RollbackReceiptPath $UpgradeReceipt
```

After either operation, rerun the health check against the new receipt and
restart Desktop. To remove the local package, preserve the latest receipt and
run:

```powershell
$UninstallReceipt = Join-Path $State 'receipts\uninstall.json'
& .\scripts\install-chatgpt-desktop-plugin.ps1 `
  -Operation uninstall -RepositoryPath $Repo -PluginPath $Plugin `
  -MarketplacePath $Marketplace -ReceiptPath $UninstallReceipt `
  -PriorReceiptPath $RollbackReceipt
```

Uninstall removes the declared plugin and marketplace targets. Run history,
repository artifacts, and receipts are separate evidence and are not deleted
by the installer.

## Release evidence

Repository maintainers can run `npm run desktop:release:verify` on Windows.
It provisions the exact lockfile, runs the focused Desktop suites, packs and
installs the source package, probes public exports, and writes durable evidence
under `release/chatgpt-desktop/`. Passing repository evidence proves only the
checks it records; it does not by itself prove a clean external Desktop
session, public publication, or unexecuted adapter paths.
