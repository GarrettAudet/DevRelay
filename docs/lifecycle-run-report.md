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
