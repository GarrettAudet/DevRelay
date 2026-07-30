# RequirementsGathering `0.1.0`

## Responsibility

`RequirementsGathering` turns an explicit goal and project context into a candidate requirements artifact. It can use a repository snapshot as evidence and an approved requirements baseline as the exact target for a change set.

```txt
Goal + Project Context + optional Snapshot/Baseline
                         |
                         v
                 RequirementsGathering
                         |
          +--------------+---------------+
          |              |               |
        draft        change set      clarification
          |              |               |
          +--------------+---------------+
                         |
                         v
          separate Requirements Validation Gate
```

The module does not validate, approve, merge, or baseline its own output.

## Inputs

| Port | Required | Meaning |
| --- | --- | --- |
| `goal` | yes | The objective, constraints, assumptions, and initial acceptance intent. |
| `project-context` | yes | Lifecycle, domain constraints, stakeholders, and source references. |
| `repository-snapshot` | no | Immutable codebase evidence. It is not an approved requirements baseline. |
| `requirements-baseline` | no | Exact approved baseline used by a change set. |
| `continuation` | no | Tool-neutral partial work from an earlier clarification outcome. |
| `clarification-responses` | no | Answers bound to an exact request artifact digest. |

## Outcomes

| Outcome | Required contract |
| --- | --- |
| `drafted` | `completed`; no baseline input; canonical draft, native-source bundle, and passing provenance evidence. |
| `change_set_drafted` | `completed`; baseline input; canonical change set, native-source bundle, and passing provenance evidence. |
| `needs_clarification` | `completed`; question set plus portable continuation; no promotable draft/change set. |
| `unable_to_proceed` | `completed`; diagnostics and no domain outputs. |
| `execution_failed` | `failed`; diagnostics and no domain outputs. |

Clarification is a completed, checkpointed invocation. The pipeline obtains answers and starts a new invocation. No plug-in session is authoritative.

## Stateless Clarification

The clarification request and continuation carry one exact goal and project-context digest plus optional snapshot/baseline digests. Responses carry the exact request digest, and continuation/responses must be supplied together. Artifact schema validation checks those structures; the host or downstream semantic validator must still compare the referenced digests to the current invocation before execution.

Because the continuation preserves a complete typed working state, the contract permits the next invocation to select another compatible plug-in. The included example proves that GitHub Spec Kit output can be resolved as OpenSpec input at the contract boundary; operational cross-tool resume remains a required host-adapter conformance test.

## Draft And Change Set

A `RequirementsDraft` contains:

- objective and in/out scope;
- confirmed or unconfirmed assumptions;
- constraints;
- stable requirements grouped by functional, quality, security, data, interface, operational, or constraint category;
- testable acceptance criteria;
- dependencies, risks, deliverables, required evidence, and source references.

A `RequirementsChangeSet` binds an exact baseline artifact/digest and records additions, modifications, and removals. Modifications/removals include the DevRelay Canonical JSON v1 digest of the prior requirement record so stale or ambiguous edits can be rejected by a later validator.

An existing repository without an approved baseline does not justify an inferred change set. The plug-in must emit a full draft or clarification.

## OpenSpec Plug-in

The OpenSpec manifest maps only its requirements capabilities:

- proposal and spec artifacts normalize into `RequirementsDraft`;
- delta specs normalize into `RequirementsChangeSet`;
- exploration/clarification becomes a request set and continuation;
- native proposal/spec files are preserved in `NativeSourceBundle`.

`design.md` and `tasks.md` are reserved for future architecture and work-decomposition Modules.

## GitHub Spec Kit Plug-in

The GitHub Spec Kit manifest maps:

- `/speckit.specify` to a canonical requirements candidate;
- `/speckit.clarify` to the stateless clarification loop;
- the feature spec and clarification content to `NativeSourceBundle`.

Constitution content enters through `ProjectContext`. `/speckit.plan`, `/speckit.tasks`, and `/speckit.implement` are outside this module.

These are contract mappings, not shipped command bridges. Each executable adapter must demonstrate every declared input/outcome profile against the same conformance suite before it is considered operational.

## Next Gate

The downstream Requirements Validation module should check:

- schema integrity and exact cross-artifact digest bindings;
- stable/unique IDs;
- completeness and testability;
- stale baseline/change detection;
- unresolved blocking assumptions;
- security, performance, and operational coverage as configured;
- approval policy.

Only that gate may promote a draft or change set into a new `RequirementsBaseline`.
