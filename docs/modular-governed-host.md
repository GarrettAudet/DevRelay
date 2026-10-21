# Opt-in durable governed coding

The modular Desktop CLI can now reconstruct genuine approval lineage from
persisted bytes, hold a current-head lease across bounded edits/tests, and refresh
to another approved change without deleting state. This is a trusted local Git
host, not another engine or approval store. The installed Desktop default remains
the legacy preview; this bridge is opt-in and has not been tested in installed
ChatGPT Desktop. Tests use explicitly synthetic Gate decisions, not owner
acceptance or proof that the sample's business criteria were fulfilled.

## Normal use

Obtain a complete, aligned source bundle from the normal Requirements,
Architecture and WorkBreakdown Gate workflow. The change card must already be
attached to the approved WorkBreakdown candidate; see
[the preflight contract](modular-governed-preflight.md). Importing JSON checks
its consistency; it does not independently authenticate the approver. Do not use
sample approvals for your project or combine mismatched historical baselines.

```sh
node examples/modular/desktop.mjs governed-activate /project /evidence/bundle.json
node examples/modular/desktop.mjs governed-plan /project /evidence/request.json > /evidence/plan.json
node examples/modular/desktop.mjs governed-run /project /evidence/plan.json
```

Use the installed runtime's equivalent path when applicable. Keep evidence inputs
outside the target worktree (or in a deliberately Git-ignored evidence directory).
No legacy `setup` or duplicate context directory is necessary. `governed-plan`
only validates and prints `{formatVersion:1, headDigest, request}`; a host can also
construct that envelope from the activation/status result. It is not another Gate
or approval prompt. Existing scope approvals are revalidated silently.

Repeat `governed-run` with the **same saved plan** after restart to recover the
same historical result without another edit/test. It still checks current head,
repository identity and file evidence. Test success is not BusinessAcceptance;
results say `acceptance: "not-recorded"`.

One activated card binds one immutable request ID and body. A changed request
needs a new ID and a separately approved bundle. After the current change is
committed through your normal process, obtain the next aligned approved bundle:

```sh
node examples/modular/desktop.mjs governed-refresh /project /evidence/next-bundle.json <expected-current-head-digest>
node examples/modular/desktop.mjs governed-plan /project /evidence/next-request.json > /evidence/next-plan.json
node examples/modular/desktop.mjs governed-run /project /evidence/next-plan.json
```

Refresh never commits source, creates an approval, or overwrites old context or
request bytes. It validates/stages immutable bytes and compare-and-swaps one
host-owned current head. Old plans become stale and cannot authorize effects.
A missing approved dependency is blocked, not inferred unchanged. The separately
versioned [bounded-work lane](modular-bounded-work.md) can prepare one code/test
item under unchanged aligned upstream approvals, with reviewed design reuse and
an exact new human work decision. First use, greenfield and rebaseline remain
outside that lane.

## Source bundle contract

`validateCodingReplayBundle` accepts this closed, versioned JSON wrapper:

```text
formatVersion: 1
artifacts: [{ref, bytesBase64}, ...]
checkpoints: [{key, value}, ...]
invocations: {requirements, architecture, workBreakdown}
gates:
  requirements: {requirementsBaseline, projectOverviewBaseline, projectOverviewMarkdown}
  architecture: {baseline, ownerApproval}
  workBreakdown: {baseline}
changeCard: ArtifactRef
```

Gate fields are exact artifact references, not baseline objects or receipt JSON.
Include the original invocations, exact Core checkpoints, original approval and
baseline bytes, and the complete referenced artifact closure, including opaque
native/review evidence. Preserve full and short reference aliases exactly,
including URI when present. No URI is dereferenced on the network or filesystem.
Unknown fields, duplicate/unreferenced entries, missing bytes, mismatched digests
and bundles over 16 MiB fail closed. Owning runtime validators check schemas,
routes, checkpoint fingerprints and Gate lineage.

The resolver uses only bundled published definitions for RequirementsGathering,
ArchitectureDesign and WorkBreakdown and their existing supported plug-ins.
Every adapter in this catalog throws if invoked. Only
`verifyCheckpointedExecution` regenerates in-process receipt authority; missing
checkpoints never fall back to authoring or provider calls. The activated head
also pins the catalog fingerprint. The canonical bundle and coding artifacts use
`createLocalHostStorage` in `.devrelay/modular-coding`; there is no second approval
store. Old bytes and the SQLite transition journal remain intact.

## Repository and concurrency boundary

This initial bridge supports an existing Git worktree root with a committed HEAD.
The filesystem must expose nonzero directory device/inode identities; the root
check compares those identities, not case-folded or short/long path spellings.
Its approved RepositorySnapshot must use the existing local Git adapter convention:
`revision = commit` and `treeDigest = canonicalJsonDigest({commit, tree})`, with
`tree` the exact Git tree object ID. Other snapshot conventions are unsupported,
not silently converted. Activation and refresh require a clean tracked and
non-ignored untracked worktree. Only the actual `.devrelay/modular-coding/`
host-state path is excluded, not arbitrary content under `.devrelay/`.

Before each effect, HEAD/tree must still match and only this request's exact edits
may be dirty. Other tracked/non-ignored changes block. Declared files additionally
retain exact inspection/preimage checks; Node executable bytes are pinned.
Git-ignored files are outside the repository cleanliness claim and can include
local dependencies; this is not a claim that the complete physical directory is
immutable. Do not use untracked/ignored configuration as undeclared trusted input.
Tests are trusted code, not sandboxed processes, and can themselves cause effects.

All activation/refresh and run operations use the same SQLite head lease with a
unique attempt owner. Legacy preview reserves that same head row before its
effects; activation cannot overtake a live or uncertain legacy effect. A preview
constructed before activation must reread the promoted head and cannot edit. Before the first edit and before test launch, a durable
head-bound effect intent is committed. The lease covers the configured bounded
test timeout plus host overhead; expiry stops continuation. The intent remains
a blocker even after the lease expires or a process dies. The host does not
assume that lease expiry killed an external test process. Once a governed head is
active, the legacy preview entry rejects that workspace instead of bypassing it.
This fences cooperative operations sharing the CLI host state path. The bare
programmatic workflow accepts a caller-owned stateDirectory; a separate store is
not enrolled in this host boundary. This does not fence alternate stores, hostile
processes with filesystem control, or unrelated editors.

## Status and interrupted work

```sh
node examples/modular/desktop.mjs governed-status /project
node examples/modular/desktop.mjs governed-reconcile /project <expected-head-digest>
```

Reconciliation is checkpoint-only: it rebuilds the exact original invocation,
verifies terminal Core checkpoints and current file/repository evidence, then
clears the head intent atomically. It never invokes an adapter or reruns a test.
This handles a completed, durably checkpointed effect whose final head transition
was interrupted. For a legacy preview interrupted at that same terminal boundary,
repeat its exact saved request through the normal legacy entry before activation;
it verifies terminal checkpoints and current files without rerunning effects,
then clears its legacy intent. Incomplete legacy effects remain quarantined too.

**Incomplete effects remain quarantined.** An edit without its result checkpoint,
a timed-out test, or mismatching current bytes cannot be safely resolved by this
bridge. It reports the missing evidence, keeps refresh/new work blocked, and
requires a future supported exact-effect recovery procedure. Preserve the diff,
raw process evidence and state; do not delete state, blindly retry, or treat a
user-supplied assertion or timeout as proof of process termination. This slice
does not claim a general recovery path for arbitrary interrupted external effects.
