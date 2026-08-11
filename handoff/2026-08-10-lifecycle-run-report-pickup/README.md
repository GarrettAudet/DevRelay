# LifecycleRunReport pickup package

This directory is the self-contained pause/resume handoff for active DevRelay
increment `DGI-LIFECYCLE-RUN-REPORT-2026-08-10` in
`https://github.com/GarrettAudet/DevRelay.git`.

Resume development from branch `codex/lifecycle-run-report-completion`. The source-work checkpoint
captured by this package is `c957db0865ef990b27eb86d6671ed0df2e35aa9e`. The exact package
commit is the branch head containing these files. The last fully green release
proof remains `31d79faed9a1b926188dc0eea34b0d443fda3a35`; do not mistake that historical green
baseline for the current portability branch.

Start with [CURRENT_STATE.md](CURRENT_STATE.md), then read
[DECISIONS_AND_INVARIANTS.md](DECISIONS_AND_INVARIANTS.md) before taking any
action. [NEXT_ACTIONS.md](NEXT_ACTIONS.md) defines the ordered work and stop
conditions. [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) and
[VERIFICATION.md](VERIFICATION.md) identify the evidence and honest test state.
[PICKUP_PROMPT.md](PICKUP_PROMPT.md) is ready to paste into a new implementation
owner session. [PR_BODY.md](PR_BODY.md) summarizes the paused branch.
[handoff.yaml](handoff.yaml) provides the same checkpoint in machine-readable
form. `MANIFEST.json` and `SHA256SUMS` bind the package bytes.

This package is a human-readable status projection. It is not lifecycle,
approval, baseline, Gate, graph, completion, PB, or release authority. Resolve
any conflict using the authority order in `DECISIONS_AND_INVARIANTS.md`.

The current boundary is deliberately narrower than the original pickup:
finish portability and evidence closure first. Do not reconstruct the immutable
historical `6ddd` source bytes, do not bless host-dependent proof digests, and
do not start LifecycleRunReport DG-2 or perform ContractGate promotion while
the supported checkout is red. Once portability is clean, regenerate the
superseding content-addressed lineage transactionally and resume the exact
ContractGeneration/ContractGate boundary.
