# Host connection increment: Desktop-operated executable

Candidate implementation under the unchanged approved requirements/overview
pair 2.8.0, following durable graph commit
`f68b04a8e74590f86878043992fcf5323cfc3c02` in PR #28 (all eleven checks passed).
The owner explicitly confirmed that Desktop remains the agent operator.

## Scope and authority

This connects the existing CLI to the actual public facade, Core module registry,
checkpoint bridge and durable graph store using a closed, raw-digest-bound JSON
configuration. Desktop step requests and immutable candidate responses replace
no Gate or provider authority. All configured executable code comes from the
package; no arbitrary JavaScript loader or external executor is introduced.

The new schemas reuse the existing Core invocation, result and ArtifactRef
owners. Generic Core, published Module/plug-in versions, project baselines,
approved graph and ProjectMemory are unchanged. Storage adds a read-only mode,
not a database schema migration. The existing memory loader accepts an explicit
project identity while retaining its existing default.

## Verification boundary

Focused tests cover actual facade/Core execution, fresh-process Desktop result
exchange, checkpoint replay, raw byte bindings, immutable corrected-candidate
history, read-only SQLite, prior-session rejection and unbound CLI regression.
The isolated installed-package smoke invokes all seven commands through the
installed executable on Windows. The source fixture only materializes inputs;
it is not the execution implementation and does not imply live provider use.

On 2026-09-13 the combined targeted suite completed **52 tests, 52 pass, zero
failures and zero skips**, in 102,991.9586 milliseconds. It covered the connected
host, exchange, operator CLI/executable, local storage/checkpoints/traceability,
Desktop memory plug-in and unchanged release-completion baseline pair. The
actual Windows executable passed all seven commands in separate processes.
The first installed command matrix then passed **451 exact catalog-bound files
and 224 installed export targets**, including all seven actual Windows commands.
A subsequent review found that the facade resolved but did not enforce the
read-only profile. Its negative test reproduced the unwanted dispatch; the
candidate now rejects run/resume/conclude before bootstrap or dispatch while
preserving inspection and verification. Final reruns include this repair.
These checks do not establish a complete lifecycle acceptance run, managed
Desktop agent dispatch, independently produced code or owner review.

## Remaining full-goal work

### Native discovery connection evidence (2026-09-14)

The candidate on `codex/desktop-lifecycle-integration` adds a bounded offline
native discovery binding. Module 0.1.1 declares its paired requirements input;
plug-in 1.0.0 and observational contributor 1.1.0 are version-pinned separately
from the unchanged released definitions. The host supplies explicit source paths,
raw-byte digests and filesystem grants. Generic Core supports declared UTF-8 text
artifacts without product-specific branches; the graph retains opaque source
evidence rather than treating source text as an approved assertion.

Combined regression completed 88 tests with 88 passing, zero failures and zero
skips (210,082.948 milliseconds). Additional manifest consistency checks passed
7/7 after declaring canonical and compatibility catalog entries. Offline package
verification then passed 463 exact catalog-bound files and 232 installed export
targets. Its real installed Windows executable proved native discovery, durable
Core/graph replay, read-only verification and rejection of changed source bytes
on a new invocation. Existing installed checkpoint, graph and requirements Gate
smokes also passed. These checks use fixture project context; they do not prove
independent repository revision discovery, live code production, human approval
or full lifecycle acceptance.

The next integration boundary is concrete: native discovery emits the
observational snapshot schema, whereas ArchitectureDesign currently consumes
the older structured snapshot with project-state lineage and architecture
sections. An explicit validated handoff is required. Relabeling the schema or
inventing architecture facts would not satisfy that boundary. Native inventory
success alone must not be treated as proof that design-critical gaps are closed.

### Outstanding release acceptance

- Connect the complete lifecycle scheduler and owning Gates, then approved DAG
  frontiers, exact DesktopTaskPlans and durable isolated worktrees.
- Surface quality, duplicate-work/continuity and human operator controls through
  the connected host rather than relying solely on component tests.
- Prove installed code production with independent review, memory conclusion and
  fresh-task recovery, plus interrupted execution without duplicate effects.
- Reconcile roadmap/memory through their owning Gates, historical security
  findings, context refresh and existing graph history.
- Obtain independent human review and BusinessAcceptance, then seal a new release.

Every host execution remains `lifecycleComplete: false`; `verify` proves only
the exact Core checkpoint and graph receipt. No lifecycle or Gate approval is
fabricated by this candidate evidence record. Issue #25 remains open.
