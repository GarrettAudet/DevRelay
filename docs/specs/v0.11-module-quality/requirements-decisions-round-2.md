# RequirementsGathering decision record - round 2

Date: 2026-08-13

Status: owner-approved requirements decisions and open question wave

## RG-MQ-D005 - Native composite and optional strategy adapters

Decision: approved.

DevRelay ships a provider-neutral native composite interviewing strategy so
deep requirements elicitation does not depend on an external provider. Bounded
Spec Kit, BMAD, GSD, Superpowers, and OpenSpec strategies may be selected or
chained through configuration-driven adapters after separate evaluation.

Core owns the strategy chain, decision-domain catalog, question admission,
deduplication, contradiction detection, coverage, closure, and progression.
Adapters propose questions, assumptions, examples, and native artifacts only.
There is no silent provider selection or provider-owned completion decision.

## RG-MQ-D006 - Breadth-first clarification waves

Decision: approved.

RequirementsGathering asks all presently knowable relevant questions in a
single breadth-first wave. After answers are normalized, Core recomputes domain
coverage, contradictions, dependencies, risks, and closure. Another wave is
issued only for newly exposed gaps, conflicts, or required follow-ups.

Each wave records:

- its stable ID and parent invocation;
- applicable decision domains and why they apply;
- questions, rationale, blocking status, answer schema, and source strategy;
- answers, approved assumptions, deferrals, and contradictions;
- coverage before and after the wave;
- remaining gaps and the deterministic reason for another wave or closure.

Question count is not a success metric. Closure quality and decision coverage
are. A sensitive or dependency-ordered question may be deferred to a later
wave only when its prerequisite answer is not yet available.

## Open question wave RG-MQ-WAVE-002

### Provider acquisition and execution

1. Should live provider executables be installed project-locally in a
   checksum-pinned cache, with explicit approval before the first download and
   no global installation? Recommended: yes.
2. Should every provider version remain locked until a controlled adapter
   evaluation and promotion updates it, with no floating `latest` or automatic
   upgrade? Recommended: yes.
3. Should adapters default to local/offline execution and require an explicit
   `network.connect` grant before any remote call or source transmission?
   Recommended: yes.
4. If a configured provider is missing or fails, should DevRelay forbid silent
   fallback, record `unavailable` or `execution-failed`, and use the native
   strategy only when fallback was explicitly configured? Recommended: yes.

### Interview authority and usability

5. May non-blocking unknowns proceed only as explicit owner-approved
   assumptions, while security, privacy, destructive behavior, public API,
   data-loss, and acceptance ambiguities always remain blocking? Recommended:
   yes.
6. Should interviews have no arbitrary question cap, but always show coverage,
   blocking gaps, completed domains, and save/resume state between waves?
   Recommended: yes.
7. When strategy adapters disagree, should Core present one deduplicated
   conflict set with alternatives and trade-offs, leaving the decision to the
   owner rather than using adapter priority as truth? Recommended: yes.

### Godot pack

8. Should V0.11 attest Godot 4.7 on Windows first, matching the current
   BubbleGift project, and mark other Godot versions unavailable until added to
   a verified compatibility matrix? Recommended: yes.
9. Should Godot inspection be read-only by default, with scene/script writes,
   input simulation, project execution, screenshots, and test execution
   separately allowlisted in the exact invocation grant? Recommended: yes.
10. Should screenshot evidence preserve original image bytes and hashes plus
    capture metadata, while input receipts preserve the exact action sequence,
    timing, target, and result? A vision description would be supplemental and
    never equivalent to the source screenshot. Recommended: yes.
11. Should Godot release acceptance require focused tests, the complete GdUnit4
    suite, flake/soak execution, export, exported-build smoke testing, and
    artifact hashing, with an explicit ApprovedNotApplicable disposition for
    any inapplicable family? Recommended: yes.

### Evidence, privacy, and telemetry

12. Should raw receipts remain local immutable artifacts, while Git receives
    their digest-bound redacted views; any detected secret or unsafe content
    blocks persistence until resolved? Recommended: yes.
13. Should performance telemetry be local and enabled by default, with no
    network export, and record only host-observed metrics such as durations,
    retries, test time, cache hits, changed files, receipt bytes, and available
    token/tool usage? Recommended: yes.
14. Should Sentry and PostHog remain disabled, uninstalled, and outside V0.11
    release scope pending a separate privacy and production-feedback design?
    Recommended: yes.

### Release maturity and acceptance

15. Should the V0.11 live-integration target require OpenSpec, Spec Kit,
    current Structurizr tooling, MADR format conformance, Godot AI, and GdUnit4
    to reach `live-conformant`, with the complete shipped path reaching
    `release-ready` through an end-to-end Windows Desktop dogfood? Recommended:
    yes.
16. Should BMAD, GSD, and Superpowers require completed adapter evaluations in
    V0.11, but reach live maturity only where a bounded, license-compatible,
    deterministic provider operation exists? Otherwise DevRelay ships the
    adopted strategy through its native composite and labels the external
    binding honestly. Recommended: yes.
17. Should final acceptance require a clean GitHub source checkout operated
    from ChatGPT Desktop on Windows to build and verify a small Godot change
    through the full DevRelay circuit, including raw receipts, queryable
    traceability, two-phase Git sealing, compact reporting, and all four
    repository skills? Recommended: yes.

## Current outcome

`clarify`

The wave is complete when each question has an approved answer or explicit
alternative. Core must then recompute closure before determining whether a
further wave is required.
