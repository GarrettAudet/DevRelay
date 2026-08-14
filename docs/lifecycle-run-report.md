# LifecycleRunReport

LifecycleRunReport is DevRelay's read-only, human-facing projection over canonical lifecycle artifacts. It does not route work, approve a Gate, mutate TraceabilityGraph, or replace any stage artifact.

An installed host can use the package root to:

1. append immutable workflow facts to a checkpointed run ledger;
2. record host observations and explicit comparability decisions;
3. derive the next ready work-item frontier from the approved dependency baseline and integrated completion facts;
4. project a deterministic lifecycle snapshot;
5. apply the closed content policy before rendering; and
6. render Markdown whose links retain exact artifact digests.

```js
import {
  createRunLedger,
  deriveReadyFrontier,
  ingestRunHostObservation,
  projectLifecycleRunSnapshot,
  renderLifecycleRunReport,
} from "devrelay";
```

The report is deliberately non-authoritative. Core and the stage Gates remain the only progression authorities, while the report makes their outcomes, evidence, replay state, adapter maturity, and next runnable frontier understandable to a human operator.

## Human-readable views

Use `view: "summary"` for the default operator-facing handoff. It keeps the executive summary, exact run/ledger/graph identities, the dynamic stage table, and next action. The stage table includes each digest-bound operation and adapter binding. Use `view: "full"` when the operator needs the expanded performance, maturity, traceability, diagnostics, and artifact sections. Both views link to the same canonical evidence. Structural placeholders and relationship arrows are ASCII (`N/A` and `->`) so Windows terminals and Markdown viewers do not introduce mojibake.

```js
const report = renderLifecycleRunReport({
  view: "summary",
  snapshot,
  contentPolicy,
  contentPolicyRef,
});
```

## Live-provider maturity

OpenSpec, Spec Kit, Structurizr, MADR, and any future adapter use the same trust boundary: adapter-native output remains untrusted, while a host-observed `ProviderExecutionAttestation` binds the exact request, command, tool version, outputs, and trusted observer. A binding remains `contract-defined` or `fixture-conformant` until that attestation exists and validates; the report never infers live maturity from a provider claim.
