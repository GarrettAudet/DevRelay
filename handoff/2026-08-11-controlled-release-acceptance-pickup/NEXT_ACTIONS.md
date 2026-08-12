# Next actions

Follow this order exactly.

## 1. Recover the exact candidate artifact

Resolve materialization run `31564607304`, artifact name `controlled-release-candidate-9d2b0d8e6b358dd6aed922de420224fe9efc320c`, artifact ID `9129184024`, and ZIP digest `sha256:137f05e9685d5c504f26b53c31c2814243b538ab0a7101d451afc1fed7b12ed6`. Stop if any identity differs or the artifact is unavailable.

Do not reconstruct or normalize the candidate. Use the exact 25 canonical JSON files produced by the materialization run.

## 2. Revalidate and persist the candidate

Re-run the existing candidate cross-binding checks and confirm:

- candidate `BA-CANDIDATE-ed2476ac90e1359f796d1ab8` / `sha256:92b25f9e6e898b780e126079ce945a92841bd3e8508dc18503d4d85f2d42ee22`;
- candidate raw digest `sha256:f0ed398f7abdd8c9540ba83842d88ecf728433011fbc2dbfe05bc751a99c8f04`;
- technical coverage `BA-TECH-COVERAGE-fb1044a00dcbd9cd94fe4243` / `sha256:8c1a9bb891a68aa66ce1d7e49b5860b821c07c1bccbbf355caa2b01e0baba88d`;
- approval request `BA-APPROVAL-REQUEST-CONTROLLED-WINDOWS-SOURCE-001` / `sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e`;
- candidate proof `DEVRELAY-CONTROLLED-RELEASE-CANDIDATE-001` / `sha256:39794039b87830b5ad89aa37c9603680f3c64b90f852ed1c3260ffef13609265`;
- SystemVerification result `SVR-3A6BA4ABED95BD19` / `sha256:e2aec86627f6afbd1116dc16d1bfd96ff14e66f6679b66d9e2dc0ed9f74610f4`;
- graph checkpoint `traceability-graph-devrelay-work-breakdown-r3` / `sha256:b0b64c6453fe02a9b7fbda50bd63139a7e71adcea28e0c3940db269a5974f754`;
- exactly 25 files and no extras.

Persist the exact package under `dogfood/release-acceptance/candidate-001/`.

## 3. Separate the workflow-permission boundary

Persistence run `31566991321` failed only at push because its commit modified a workflow file without workflow-file permission.

Use one of these exact-safe paths:

- persist candidate, status, handoff, and catalog bytes without modifying workflow files, then perform workflow freezing and temporary-workflow cleanup in a separately authorized commit; or
- rerun the complete transaction with an actor permitted to update workflow files.

Do not force-push, bypass branch compare-and-swap, or omit the intended workflow cleanup from the eventual final state.

## 4. Regenerate and verify the final pre-approval repository state

After every candidate, status, handoff, script, and workflow byte is final:

1. regenerate the content-addressed release catalog;
2. run `npm run release:check`;
3. verify the installed package smoke test;
4. commit and push under branch compare-and-swap; and
5. require Node 20/22 on Ubuntu/Windows to pass 4/4.

A documentation-only update is not release verification and will require catalog regeneration.

## 5. Obtain the exact owner decision

Present the persisted `23-business-acceptance-approval-request.json` to the owner. The owner must explicitly approve or reject those exact bytes. The stale earlier approval and general instructions to continue are not substitutes.

## 6. Complete BusinessAcceptance

If the exact request is approved:

1. execute BusinessAcceptanceGate with the exact canonical inputs and approval bytes;
2. prove replay invokes the owner zero additional times;
3. project trusted BusinessAcceptance traceability from the accepted Gate execution;
4. prepare, checkpoint, atomically merge, and replay the exact update;
5. require zero blocking diagnostics; and
6. update final release evidence, handoff, catalog, and matrix results.

Stop on artifact drift, changed candidate bytes, missing source closure, workflow-permission ambiguity, non-zero replay calls, incomplete coverage, blocking diagnostics, or approval substitution.
