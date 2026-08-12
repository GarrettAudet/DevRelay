# Next actions

## 1. Obtain exact owner decision

Present `dogfood/release-acceptance/candidate-001/23-business-acceptance-approval-request.json` (request digest `sha256:29c7606125b0280d05186cb3d532c4e8a8043984c109e853350c6dd57d6eca6e`).

The owner must explicitly approve or reject the exact request. The prior approval is stale because it names superseded source. General authorization to continue is not a substitute for this byte-bound decision.

## 2. Execute BusinessAcceptanceGate

Use the exact canonical candidate bytes, exact candidate raw digest, exact evaluation, subject, policy, evidence, technical coverage, and exact owner approval. Persist the Gate checkpoint and authoritative BusinessAcceptanceRecord. Replay must invoke the owner zero additional times.

## 3. Merge trusted acceptance traceability

Project only from the exact accepted Gate execution using the released BusinessAcceptance contributor. Prepare, checkpoint, atomically merge, and replay the exact update. Require zero blocking diagnostics.

## 4. Finalize release evidence

Update root status, this handoff package, release evidence, and release metadata. Regenerate the content-addressed catalog, run `npm run release:check`, push, and verify Node 20/22 on Ubuntu/Windows.

## Prohibited shortcuts

Do not reuse the superseded approval, hand-author the approval/record/update/receipt, alter the accepted scope, expand excluded delivery claims, or call the release complete before the final Gate, graph, catalog, and matrix evidence exist.
