# Next actions

## Resume order

1. Inspect GitHub Actions run `31457082371` for commit
   `c957db0865ef990b27eb86d6671ed0df2e35aa9e`. Confirm whether the six local-Git fixture
   failures are gone. Do not infer closure from the source patch alone.
2. Repair the LifecycleRunReport independent adversarial verifier's repository
   root calculation using a cross-platform file-URL/path conversion. Preserve
   every existing assertion and evidence binding.
3. Resolve the historical bootstrap source-closure policy without fabricating
   evidence:
   - preserve the immutable original `6ddd` manifest as unavailable historical
     evidence;
   - use committed superseding evidence/checkpoints where the runtime permits
     checkpoint-only verification; or
   - require an explicitly supplied trusted source bundle whose bytes match the
     recorded digest.
   Do not repoint the bootstrap verifiers at semantically different current
   files merely to make CI green.
4. Isolate the exact host-dependent field in the Structurizr conformance proof
   / ArchitectureGate review bytes. Make that evidence host-independent while
   preserving semantic architecture output, then prove Windows and Linux
   generate the same bound digests.
5. Re-run focused portability tests, then the complete supported checkout.
6. Close remaining PB-005 provenance and PB-006 catalog/documentation
   inconsistencies from one source of truth.
7. Only after all upstream bytes are stable, perform the single transactional
   PB-002 superseding-lineage regeneration and prove an immediate no-change
   rerun.
8. Resume DG-1 at the exact ContractGeneration/ContractGate boundary. Present
   the candidate for a separate ContractGate decision. Do not infer promotion.
9. Continue LifecycleRunReport DG-2 through DG-6 only after the supported
   prefix is clean.

## Current blocker-order status

| Blocker | Status at pause |
| --- | --- |
| PB-001 | Open. Historical/bootstrap source closure remains; one LRR path-only defect remains. |
| PB-003 | Partially closed. Java 21 CI setup is fixed; host-independent Structurizr/ArchitectureGate proof evidence remains. |
| PB-004 | Source repair committed at `c957db0865ef990b27eb86d6671ed0df2e35aa9e`; CI verification is in progress. |
| PB-005 | Partially improved by full-history checkout; end-to-end provenance closure remains open. |
| PB-006 | Open pending stable portable source/evidence bytes. |
| PB-002 | Intentionally not started; must remain last. |

Do not create or renumber PB authority as part of this handoff.

## Hard stop conditions

Stop without authority mutation if any of these occurs:

- source, checkpoint, baseline, candidate, verifier, or proof digest drift that
  cannot be explained by an explicitly non-semantic portable field;
- a historical referenced source is unavailable and the proposed fix would
  reconstruct, substitute, or silently re-author its bytes;
- a portability change depends on hidden context or a machine-specific path;
- the required ContractGeneration intent count differs from 48 or any of the
  nine false-disposition interfaces is selected;
- replay invokes the generator again when checkpoint-only replay is required,
  changes the terminal candidate, or loses exact checkpoint lineage;
- a tool or adapter attempts Gate, graph, completion, PB, routing, or promotion
  authority;
- an expected digest is proposed for update before the cause of cross-host byte
  drift is isolated;
- ContractGate approval, baseline promotion, accepted-prefix advancement, or
  LifecycleRunReport DG-2 work would be required while the supported checkout
  remains red.

## Release proof required after repairs

Before calling the active increment release-ready:

1. focused portability/evidence tests green;
2. full `npm run release:check` green;
3. supported Node/OS GitHub Actions matrix green;
4. exact content-addressed superseding lineage regenerated transactionally;
5. immediate deterministic no-change replay green;
6. later DG-5 supported-matrix proof satisfied as required by the lifecycle;
7. exact DG-6 promotion performed only from eligible evidence.
