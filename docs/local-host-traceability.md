# Durable local traceability storage

`createLocalHostTraceabilityStore({ storage, namespace, graphId })` implements
the existing trusted graph service's synchronous storage interface using an
explicitly opened LocalHostStorage. Bind it to `createTraceabilityGraphService`;
never pass it to adapters. Desktop remains the agent operator. This is a host
implementation, not a new semantic Module, contributor, Gate or agent launcher.

```js
import { createLocalHostStorage, createLocalHostTraceabilityStore,
  createTraceabilityGraphService } from "devrelay/advanced";

const storage = createLocalHostStorage({ rootDirectory: approvedAbsoluteStatePath });
const store = createLocalHostTraceabilityStore({ storage, namespace: "project/trace", graphId });
const graph = createTraceabilityGraphService({ graphId, projectId, store,
  contributors: explicitlyConfiguredTrustedContributors });
// Bind graph and the separate durable Core/traceability checkpoint stores into
// Core. The host owns storage lifetime and approved filesystem access.
```

## Persistence contract

- `initialize(graphId, entry)` creates only a genesis graph or returns the exact
  existing head. Reopening never replaces a nonempty graph with genesis.
- `capture`, `load`, `receipt` and `isAncestor` verify exact graph identities,
  raw bytes, existing graph schemas and immutable historical references.
- `commit` writes artifact/result checkpoints first, then atomically publishes
  the graph head and receipt journal entry in one SQLite transaction. A prepared
  or orphaned candidate artifact is not an applied receipt.
- Exact replay returns the previously committed receipt. A stale expected head
  returns no result for Core to reconcile/rebase. Active foreign leases,
  corruption and unexpected storage failures remain explicit errors.
- A head is bound to its same-version committed journal record and exact result
  checkpoint. Receipt lookup binds the update's complete ArtifactRef, not only
  its digest. Different namespaces and graph identities cannot substitute data.

Host head and commit records have closed schemas in `contracts/`. Artifact
references reuse Core's existing schema owner. Graph semantic validation,
trusted contributor ownership, ancestor verification and in-process prepared
update authority remain in the existing graph service; no Generic Core routing
or published Module/plug-in version changes.

LocalHostStorage's backwards-compatible `readTransitionJournal(runId, options)`
accepts optional exact `transitionId` and positive `toVersion` filters. SQLite
indexes both; head and receipt lookup do not scan or copy the full journal.
This does not make graph traversal or full-snapshot validation constant-time.
The additive indexes preserve database schema version 1 and existing rows.

## Recovery and limits

Before commit, transaction rollback leaves the old head and no applied receipt.
After commit, a lost process response cannot undo the head or receipt. Fresh
Core execution revalidates the stored prepared checkpoint and receipt without
reinvoking the effect adapter. A terminated process's active lease is not stolen;
the caller can retry after its exact expiry. No implicit timer, cleanup, command,
provider call, approval or external effect is introduced by this store.

The tests cover separate processes, abrupt exits immediately before/after the
SQLite commit, active-lease rejection, expiry recovery, pointer/journal/CAS
corruption, identity substitution, interleaved connections and installed-package
restart/replay. Abrupt-exit tests use an explicit controlled clock for expiry.
They are not filesystem power-loss tests or multi-process saturation benchmarks.

This implementation initializes new graphs; importing arbitrary pre-existing
in-memory histories is not exposed by this API. It does not migrate the approved
project graph or ProjectMemory. The connected installed Desktop/CLI workflow,
actual code-production E2E, owning-Gate memory/roadmap reconciliation and release
acceptance remain separate unfinished work under issue #25.
