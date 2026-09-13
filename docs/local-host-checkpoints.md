# Durable Core checkpoints

This host implementation connects Core's existing immutable `get`/`put` and
traceability `get`/`putIfAbsent` contracts to the SQLite/CAS reference storage.
It is part of the existing `IF-SIM-HOST-STATE` and crash-recovery scope, not a new
workflow Module, executor, Gate, graph authority, or independent agent launcher.
Desktop remains the agent operator, as the owner confirmed on 2026-09-13.

## Contract

`createLocalHostCheckpointStore({ storage, namespace })` uses an explicitly
opened LocalHostStorage and a nonempty namespace. The caller owns the storage
lifetime and its filesystem grants. It never derives a filesystem path from a
checkpoint key. Separate namespaces cannot substitute one another's values.

- `get(key)` returns an immutable JSON value or `undefined` only when absent.
- `put(key, value)` persists before returning. Exact repeats are idempotent;
  different values for one key fail closed without overwriting the winner.
- `putIfAbsent(key, value)` atomically selects one winner and returns its exact
  immutable value, including when another process wins. Core must compare that
  winner with its prepared update before graph merge.

Values must be plain JSON data: no undefined, sparse arrays, cycles, accessors,
functions, class instances, non-finite numbers or implicit `toJSON` execution.
The closed wire envelope is `contracts/local-host-checkpoint.schema.json`.
Reads verify SQLite identity, immutable version, envelope schema and namespace,
artifact metadata and raw CAS digest. Corruption is an error, never a cache miss.

```js
import { createLocalHostStorage, createLocalHostCheckpointStore } from "devrelay/advanced";

const storage = createLocalHostStorage({ rootDirectory: approvedAbsoluteStatePath });
const checkpoints = createLocalHostCheckpointStore({ storage, namespace: "project/run/execution" });
const traceabilityCheckpoints = createLocalHostCheckpointStore({ storage, namespace: "project/run/traceability" });
// Bind these exact stores into the configured Core execution context. Keep the
// declared graph service and artifact resolver separate. This store grants no
// adapter access to the graph and cannot promote any Gate result.
// The owner of `storage` closes it only after every bound operation has finished.
```

CAS bytes are durable before the immutable SQLite key becomes visible. A failed
key insertion may leave unreferenced CAS evidence; it does not make a checkpoint
visible or authorize a repeated external effect. Cleanup remains an explicit
host responsibility. Ambiguous external effects still require the Desktop
execution coordinator's quarantine/reconciliation protocol.

## Release evidence boundary

This is a required host component, not proof that the complete installed CLI or
Desktop workflow is connected. Final acceptance still requires actual Core
execution and zero-effect replay across restart, plus the full installed-product
memory/worktree/quality/human-orchestration test tracked in GitHub issue #25.
The current approved requirements/overview pair remains unchanged. This repair
does not manufacture an interview, Gate promotion, or BusinessAcceptance.

The candidate tests exercise an actual Core effect checkpoint in a new process
with a fixture adapter that is forbidden to run during replay. A separate
graph-aware test reopens the durable checkpoint database after a simulated merge
outage and proves the exact prepared update and resulting graph proof are reused.
That original test retains the graph service in memory. The subsequent
`local-host-traceability` increment adds separate-process graph persistence and
abrupt-exit recovery tests; see `docs/local-host-traceability.md`. Neither test
claims live upstream adapter conformance or complete product acceptance.
