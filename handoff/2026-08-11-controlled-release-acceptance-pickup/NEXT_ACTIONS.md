# Next actions

Follow this order exactly.

1. Confirm the pickup commit checks out cleanly and rerun
   `npm.cmd run release:check` if any source byte changed after `477e7a4`.
2. Review `candidate-materializer.wip.txt` against the current exported APIs.
   Move it into an appropriate scripts/dogfood location only after correcting
   formatting and any path/import differences.
3. Execute the candidate circuit using the released implementations:
   - restore the approved graph recovery seed and integrated graph head;
   - validate and atomically merge only the two owner-approved `designed-by`
     links through a trusted contributor;
   - execute all 81 acceptance-criterion test obligations and all 18 NFR review
     obligations through the typed adapters;
   - prove the second exact run makes zero verifier calls;
   - merge `systemVerificationTraceabilityContributor` and replay the merge;
   - derive 81 exact forward technical-coverage paths from the merged graph;
   - evaluate 8 objectives, 9 metrics, and 32 business-scope identities;
   - prove BusinessAcceptance checkpoint replay performs zero evaluation and
     evidence calls.
4. Persist an approval request that binds all of:
   - target commit `477e7a449cb90d4ecb86c7271cb59f3e2d09b0d6`;
   - candidate semantic digest;
   - canonical candidate raw digest;
   - technical-coverage digest;
   - exact graph checkpoint;
   - the three release exclusions.
5. Ask the owner to approve that exact request. Do not infer this approval from
   the earlier exact approval of `33e65ba`.
6. With the exact approval bytes, call `executeBusinessAcceptanceGate` twice.
   Require one owner call on first execution and zero on replay.
7. Feed the exact accepted record to
   `businessAcceptanceTraceabilityContributor`; prepare, validate, atomically
   merge, and replay the same update through TraceabilityGraph Core.
8. Require zero blocking diagnostics for approved active requirements, scope,
   architecture, implementation, verification, and acceptance paths.
9. Replace the pending release disposition with an accepted record while
   preserving the pending artifact as history. Update human-readable release,
   progress, evidence, and handoff documents.
10. Run the full local release gate, commit, push, and require all four GitHub
    Actions jobs to pass at the final metadata commit.

Stop on any digest drift, missing source closure, non-zero replay call count,
incomplete technical path, blocking graph diagnostic, or candidate/approval
substitution. Do not widen the release boundary.
