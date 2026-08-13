# Code-scanning hardening dogfood

This directory is the authoritative, content-addressed DevRelay lifecycle for
the scanner correction discovered after the first protected-main v0.10 merge.
It is a new increment; it does not rewrite or pretend to extend the accepted
evidence of the prior candidate.

`materialize-lifecycle.mjs` executes the released pre-execution circuit. It:

1. validates and deterministically reuses the approved RequirementsBaseline and
   ProjectOverview pair;
2. runs the mandatory offline native ArchitectureDiscovery inventory against
   exact protected-main bytes;
3. records and gates the bounded architecture change;
4. routes ContractGeneration to an approved not-applicable disposition;
5. creates and validates a four-item WorkBreakdown change set;
6. analyzes the full candidate work snapshot with the native proposer,
   Graphology-DAG, and the pinned OPA WASM policy;
7. performs native provider-neutral specialist assignment; and
8. derives the forward-only planning traceability proposal.

Run it from the repository root:

```powershell
node dogfood\v0.10.1-code-scanning-hardening\materialize-lifecycle.mjs
```

The materializer is deterministic for the exact protected-main source commit
`37e968516623c3d135f8829b0e56e19a7ba59722`. Generated module records are
planning and Gate evidence only. WorkExecution, WorkItemVerification,
ChangeIntegration, SystemVerification, graph merge proof, and
BusinessAcceptance must be appended from their actual effects; this package
does not claim those outcomes early.


After implementation, run:

```powershell
node dogfood\v0.10.1-code-scanning-hardening\materialize-local-evidence.mjs
```

This binds the exact dirty candidate file set and canonical local gate result
to a content-addressed evidence record. Its WorkItemVerification outcome stays
`needs-external-evidence` until protected CI, CodeQL, Scorecard, and the
installed source-release checks complete.
