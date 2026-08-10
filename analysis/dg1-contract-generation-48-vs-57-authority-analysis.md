# DG-1 ContractGeneration 48-vs-57 authority analysis

## Recommendation

Choose **B** with **99% confidence**: correct the capability-gap generator to select
`item.contractGeneration.required === true`, then transactionally rematerialize
the gap, run report, planning handoff, and content-addressed manifest. Resume
ContractGeneration with the 48 architecture-authorized required intents.

Do not create an `ArchitectureRevisionRequest` for the disputed nine. They are
real, approved architecture interfaces, but every one explicitly says:

```json
"contractGeneration": { "required": false, "suggestedKinds": [] }
```

Their omission from project ContractGeneration is intentional and does not
remove their module-owned runtime contracts.

## Root cause

The earliest incorrect artifact is the immutable continuation generator:

- `C:/Users/garre/.codex/worktrees/190a/DevRelay-v04-work-dependency-analysis/dogfood/prefix-integrity-repair-dg1-continuation-2026-08-10/materialize.mjs`
- raw SHA-256: `sha256:43d31875b1ac9f1cb9ab3727038c9c659ffea5b2b97d3d1bedee5d0184ad7e63`
- line 60: `filter((item) => item.required !== false)`

`required` is not a top-level InterfaceIntent field. It is nested under
`contractGeneration`. Consequently, `undefined !== false` admits every one of
the 57 architecture interfaces. The correct ContractGeneration runtime logic
selects only the 48 entries whose nested value is exactly `true`.

The resulting capability-gap file
(`sha256:4325ec7b9a7d283905be4f62f69928ddcd5b42cce2e283ab8caf7b318b92f03c`)
was therefore generated deterministically, but from a semantically wrong
selector. The nine IDs were not hand-written; they were mechanically injected
as a class by the selector bug.

## Per-interface authority

| Interface | First repository authority | Requirements authority | Architecture authority | Current contract | Runtime classification |
| --- | --- | --- | --- | --- | --- |
| `IF-WB-PLANNER` | `bef184c` WorkBreakdown release | Approved historical WB requirements; not in current global requirements | Approved and retained; `required:false` | None | Internal planner extension port |
| `IF-WB-GATE` | `bef184c` WorkBreakdown release | Approved historical WB requirements; not in current global requirements | Approved and retained; `required:false` | None | Internal Gate API |
| `IF-WB-TRACEABILITY` | `bef184c` WorkBreakdown release | Approved historical WB requirements; not in current global requirements | Approved and retained; `required:false` | None | Trusted contributor API |
| `IF-WDA-PROPOSER` | `4bda7fe` WDA 0.1.0 release | Current approved requirements and ACs | Approved and retained; `required:false` | None | Internal proposer extension port |
| `IF-WDA-GRAPH-MECHANICS` | `4bda7fe` WDA 0.1.0 release | Current approved requirements and ACs | Approved and retained; `required:false` | None | Core graph mechanics API |
| `IF-WDA-POLICY` | `4bda7fe` WDA 0.1.0 release | Current approved requirements and ACs | Approved and retained; `required:false` | None | Internal pinned-policy API |
| `IF-WDA-CONSISTENCY` | `4bda7fe` WDA 0.1.0 release | Current approved requirements and ACs | Approved and retained; `required:false` | None | Advisory reviewer API |
| `IF-WDA-GATE` | `4bda7fe` WDA 0.1.0 release | Current approved requirements and ACs | Approved and retained; `required:false` | None | Internal Gate API |
| `IF-WDA-TRACEABILITY` | `4bda7fe` WDA 0.1.0 release | Current approved requirements and ACs | Approved and retained; `required:false` | None | Trusted contributor API |

The machine-readable companion contains the exact source requirement and
acceptance-criterion IDs for every row.

## Evidence by lifecycle layer

### Requirements

The WorkBreakdown IDs derive from the approved feature-local baseline at
`dogfood/work-breakdown/requirements-baseline.json`
(`sha256:af5aa3ea3bea8ce1645bee526f1a64a16a58aad7a305dccaa90dd26e6096e311`).
Those WB requirements are no longer present in the current project-wide
requirements baseline; that is a separate historical/global-baseline concern,
but it does not change the explicit current architecture disposition.

The WDA IDs derive from must-priority stories, NFRs, and constraints in the
current `project/requirements-baseline.json`
(`sha256:c53332998c1b46848b0131f54341bed23b174d727e635731258fecf03aec5948`).
The baseline includes specific acceptance criteria for proposer isolation,
graph mechanics, OPA policy, consistency review, Gate validation,
determinism, and traceability.

Requirements authorize the behaviors. They do not independently declare that
the interfaces require generated external contracts; ArchitectureDesign owns
that disposition.

### Architecture and ArchitectureGate

The WB and WDA interfaces first appear in their feature architecture revisions.
The WDA candidate was owner-approved by
`project/architecture-gate-owner-approval-work-dependency-analysis-v1.json`
(`sha256:102439efcb9d8244151b583ac7c89710685a1cf9f2b81ab9c76bd27543ad939e`).
All nine remain present in the current ArchitectureBaseline
(`sha256:dcab07305935477707fdeda7c0c99a0a88afc246539844f8737ccfef29abc3bc`).

They are architecture-authorized interfaces, elements, and relationships, but
their ContractGeneration disposition has always been false in the relevant
approved/candidate materializers and current baseline. Architecture authority
therefore supports **existence**, while explicitly rejecting **generation**.

### Contracts

No `CT-IF-WB-*` or `CT-IF-WDA-*` contract occurs anywhere in the repository.
The current `CB-DEVRELAY-006`
(`sha256:919e64203cd557f6379b9c6e5909570ccca48e987b4a8ccda48b4715a7cd329a`)
contains 48 contracts and none of the disputed nine. There is consequently no
contract whose architecture lineage could be valid or invalid for these IDs.

### TraceabilityGraph

All nine occur as approved `interface-intent` observations in
`project/history/traceability/snapshots/093d92c0abb05bac94e682af9c72289a04620866d3842a217f97962d9296b2ed.json`
(`sha256:3c055fb373890a98a1cd2df5ab519a38608b345282056700abca68de926b5030`).
That proves approved architecture observation. It does not convert
`contractGeneration.required:false` to true and does not create contract
authority.

### Modules, manifests, dogfood, accepted prefix, and audit

The released WorkBreakdown and WDA module definitions and artifact schemas
govern these internal APIs. They do not use the nine architecture IDs as
runtime lookups and do not require corresponding `CT-*` artifacts. Existing
dogfood executions prove both modules operated without those generated
contracts.

The accepted-prefix and reviewed top-level Mode 2 audit package mention the
WorkBreakdown and WDA components but contain none of the nine IDs. They do not
override ArchitectureDesign's per-interface generation decision.

## Effect on released execution

Excluding the nine does not make WorkBreakdown or WDA impossible:

- planner/proposer/reviewer bindings are defined by module and plugin schemas;
- Gate payloads are module-owned canonical artifacts;
- graph mechanics and OPA are Core-owned implementation boundaries;
- contributor APIs are governed by traceability contracts;
- project ContractGeneration is reserved for interfaces explicitly marked as
  requiring a generated external contract.

Treating every architecture interface as a ContractGeneration target would
erase the declared conditional boundary and duplicate internal contracts.

## Correction-path comparison

### A. Architecture revision to 57

Not supported by current evidence. Changing nine flags from false to true is a
new semantic product decision. A promoted revision would supersede the current
`dcab...` ArchitectureBaseline. Because `CB-DEVRELAY-006` pins that exact
architecture digest, ContractGeneration and ContractGate would have to produce
and promote a replacement baseline. WorkBreakdown and every later artifact
pinned to the old architecture/contract pair would become stale and require
replay. Existing approvals remain historical evidence but cannot authorize the
new bytes.

### B. Correct the capability-gap lineage to 48

Supported and minimal. Fix the source selector, regenerate the entire affected
content-addressed continuation transactionally, preserve the 6ddd manifest as
superseded immutable evidence, and resume ContractGeneration with 48. This
requires no baseline, Gate, graph, or released-runtime mutation.

### C. Conditional future route

Use A only after an owner explicitly decides that these internal APIs must
become externally generated project contracts. That decision would need a
Requirements/Architecture change and full downstream replay; it cannot be
inferred from the current accepted prefix or audit.

## Read-only assurance

This analysis created only this Markdown file and its JSON companion. It did
not mutate candidate/product/evidence artifacts, baselines, Gate records,
TraceabilityGraph state, the index, commits, or remotes.
