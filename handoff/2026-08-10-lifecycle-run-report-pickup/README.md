# LifecycleRunReport pickup package

This directory is the self-contained handoff for the active DevRelay increment
`DGI-LIFECYCLE-RUN-REPORT-2026-08-10` on branch
`codex/v0.5-lifecycle-run-report` in
`https://github.com/GarrettAudet/DevRelay.git`.

Start with [CURRENT_STATE.md](CURRENT_STATE.md), then read
[DECISIONS_AND_INVARIANTS.md](DECISIONS_AND_INVARIANTS.md) before taking any
action. [NEXT_ACTIONS.md](NEXT_ACTIONS.md) defines the ordered work and stop
conditions. [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) and
[VERIFICATION.md](VERIFICATION.md) identify the evidence and honest test state.
[PICKUP_PROMPT.md](PICKUP_PROMPT.md) is ready to paste into a new implementation
owner session. [PR_BODY.md](PR_BODY.md) is the polished draft pull-request
description. [handoff.yaml](handoff.yaml) provides the same checkpoint in a
machine-readable form. `MANIFEST.json` and `SHA256SUMS` bind the final package
bytes.

This package is a human-readable status projection. It is not lifecycle,
approval, baseline, Gate, graph, completion, or release authority. Resolve any
conflict using the authority order in `DECISIONS_AND_INVARIANTS.md`.

The current boundary is narrow: make the ContractGeneration continuation
portable, perform exact checkpoint-bound ContractGeneration replay for the 48
required intents, and then stop at ContractGate for a separate decision.
ContractGate promotion is not authorized by this handoff.
