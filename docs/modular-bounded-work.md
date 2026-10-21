# One bounded change in the existing conversation

This opt-in source/API slice plans one additional **code-change** or
**test-change** in an already approved, aligned, existing Node/Git project.
Requirements, overview, architecture and contract decisions are reused unchanged.
It does not relabel the eight-Gate `quick` profile or change the installed Desktop
default. Installed Windows Desktop execution and original owner acceptance still
need separate authorized evidence. Synthetic tests cover the real Core/Gate
mechanics and actual criterion assertions in a synthetic aligned project, not
owner acceptance or production authentication security.

## The card, not a JSON assignment

The conversation inspects the current source and proposes:

> Change: the observable behavior and the existing criterion's actual text.
>
> Reuse: the existing component/design and why it remains appropriate.
>
> Touch: the bounded paths.
>
> Verify: the regression assertion and relevant existing tests.
>
> Excludes/risks: the explicit exclusions and uncertainty.
>
> Approve this exact work and reviewed design reuse?

The user does not assemble invocations, artifact references or replay bundles.
The card projects a digest-bound candidate and is not another source of truth.
A revised card replaces the pending review; a prior decision cannot approve it.
A general “continue” is not converted into a work approval. Already-authorized
exact work reuses its decision identity without prompting again.

## Trusted conversation host API

`examples/modular/coding-bounded-host.mjs` exports:

1. `inspectBoundedCodingWork({workspace, paths})`: read-only current-head and
   file observation. It returns the exact `repositorySnapshot` and `inspection`
   documents, including references and bytes, for review.
2. `prepareBoundedCodingWork({workspace, preparationId, assessment, evidence,
   proposal})`: the conversation supplies a closed `{workItem, changeCard}`
   proposal and a reviewed design-reuse assessment. `evidence` is exact
   `[{ref, bytesBase64}]` semantic-review material. The assessment must bind the
   host's exact current snapshot and inspected file observation. The host does
   not silently rebind an old review to newer bytes.
3. `reviewBoundedCodingWork({workspace, preparationId, expectedHeadDigest,
   captureDecision})`: the **trusted embedding conversation host** captures
   `{decision: "approve" | "reject", originalMessage: {id, author, text,
   timestamp}}` for the exact supplied review view. The callback is a trust port,
   not authentication supplied by JSON. It must preserve the original human
   statement, determine whether it actually approves this card, and never be
   implemented by treating a provider proposal or boolean as a human decision.
   Invoke review only after the human responds; the callback retrieves that
   existing response rather than waiting for a user under the head lease.
4. `cancelBoundedCodingWork({workspace, preparationId, expectedHeadDigest})` and
   `inspectBoundedCodingWork({workspace})`: cancel/status without source effects.

Preparation writes only immutable candidate/evidence/checkpoint artifacts and
host review state in the existing `.devrelay/modular-coding` store. It never edits
source or launches tests. The truthful `conversation-bounded-work@0.1.0` adapter
has only this declared host-state write grant. It does not claim that OpenSpec,
Spec Kit, or another CLI ran. Generic Core derives the only new route,
`work-breakdown@0.2.0 / plan-bounded-work`, from the closed v2 state.

The existing launcher delegates `bounded-inspect`, `bounded-prepare`,
`bounded-status`, and `bounded-cancel`. Internal envelopes are authored by the
conversation, never assigned to the user. `bounded-review` needs the trusted
embedding host to pass `captureDecision` to the launcher's `main(args, host)` API;
plain command-line use blocks with `HUMAN_DECISION_REQUIRED`. This is an explicit
integration boundary, not a claim that installed Desktop supplies that port.
Never replace the missing port with an approval file or inferred authorization.

On approval, the owning Gate validates genuine Core replay, the exact decision,
card, reviewed reuse evidence, current snapshot and original head. It produces
only the exact cumulative baseline bytes. The host exports and validates the
full replay bundle, then refreshes through the existing approved-head CAS. No
edit, test, Git commit, publication, integration or business acceptance occurs
in prepare/review/export. After approval, use the existing `governed-plan` and
`governed-run` path with the exact bounded request. Actual code needs meaningful
criterion assertions; a passing process is not business acceptance.

## Two changes, one historical design

After an authorized integration process commits the first change, inspect the
new clean HEAD and prepare a new work item. The original architecture baseline
and historical repository evidence remain byte-identical. The new item binds a
separate current snapshot and semantically reviewed reuse assessment. Retained
satisfaction evidence must be revalidated when its repository binding changes;
no-work authority is retained exactly, never manufactured.

Replay bundle **formatVersion 2** extends the closed v1 wrapper with
`workHistory: [{invocation, baseline, ownerApproval?}, ...]` and an exact
`gates.workBreakdown.ownerApproval` reference. History begins at its genuine
v1 established baseline and every subsequent work invocation binds its exact
prior baseline. A v2 initial seed may carry an empty history only for a genuine
v1 `establish-breakdown` execution; its original no-work proofs are resolved
from the exact baseline/candidate, never minted again. A legacy change head
without original work invocation history is blocked during preparation, before
a human approval prompt. The resolver replays and validates every historical work Gate,
not merely an arbitrary baseline input. Original upstream invocations,
checkpoints, approvals, native evidence and full artifact closure remain.
No caller-defined catalog or serialized receipt authority is accepted.

The v1 bundle/catalog behavior and its strict architecture/work snapshot equality
remain unchanged. Only the pinned bounded operation can distinguish current
execution evidence from historical architecture evidence. The replay catalog
remains replay-only; it can never fall back to authoring.

## Fail closed

- New criteria, product intent, interfaces/contracts, dependencies/platform,
  security/permissions, migrations or material architecture changes require the
  normal full change path. Uncertain semantic reuse requires clarification.
- Cancellation, rejection, revised cards, stale heads, changed observed files,
  dirty unrelated work, and active/uncertain effects prevent approval/effects.
- Missing aligned approvals, initial WorkBreakdown establishment, onboarding,
  greenfield repository creation and rebaselining are outside this fast lane.
  Historical examples are not substitute project authority.
- All current-head leases, immutable request identities, preimage checks,
  quarantine and replay rules of the durable bridge remain in force. This does
  not implement general recovery from uncheckpointed edits or timed-out tests.
- No Desktop install/access/default change, release, merge, public provider
  interoperability or owner acceptance is established by this implementation.


## Graph and verification boundary

The optional `devrelay/bounded-work/traceability` exports use separate
`work-breakdown/bounded-candidate` and `work-breakdown/bounded-control` scopes.
Register both old and bounded contributors and explicitly select the exported
`boundedWorkTraceabilityVocabulary` (vocabulary/endpoint policy `1.9.0`) through
the existing graph upgrade mechanism. The default remains `1.5.0`; published
`1.0.0`–`1.8.0` contracts and endpoint policies are unchanged. The new policy
retains all `1.8.0` endpoints and adds only the exact bounded candidate scope.
Published v1 contributor ownership and prior nodes/history remain intact; the new
cumulative candidate projection never asserts implementation or acceptance.
Graph-aware Core execution checkpoints the exact prepared update before merge
and replays it without reauthoring. The thin coding host remains the existing
non-graph-aware bridge; it does not silently create or promote a project graph.

`test/modular-bounded-work.test.mjs` proves two ordinary lookup optimizations
under unchanged synthetic approvals, including second-item planning/review/export
in a fresh process after the first commit. Node assertions check all original
mapped criteria: matching-user sessions, indistinguishable known/unknown failures,
and p95 at most 500 ms under 100 concurrent attempts. The fixture is not a
production credential implementation. Tests also cover fresh-process effect
replay, full work history, retained genuine no-work authority, cancel/reject/revised
cards, exact decision bytes, stale heads and material-scope refusal.

The actual DevRelay project has not been rebaselined by these tests. Its current
requirements/overview pair and historical architecture/work baseline must be
aligned through the normal semantic path before claiming fast-lane dogfooding.
