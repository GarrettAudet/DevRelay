# Construction bridge continuity settlement candidate

The helper is ready for independent parent review. It was exercised only against temporary durable stores. No live continuity index, claim lease, approved head, completion ledger, graph, verification result, integration result or ProjectMemory baseline was changed. No commit, dispatch or publication was performed.

## Exact task and memory context

- Task: `mes-bridge-continuity-settlement-20260918`.
- Starting revision: `848b0ca3914e8645a1219090eec315f5c3784a22`.
- Plan: `sha256:1a2b44fdf4a775342bd7af736132393abc29c8fd7a98f1a974cf920f8c21b060`; validated by the owning Desktop artifact validator.
- Prompt: `sha256:ec0c98745dc541b9a0b5b97a6c06db1fafae920bdae5a0552ec3839abbe63b2a`.
- Memory context: `sha256:3008f9e2aa71b53a8f9263e0bc0a4bfbe595e265ff12372f96f6150957395437`.
- Bootstrap: pass, receipt `DPMBR-5DF5EB2BC48A3529`; receipt digest `sha256:48bcaf5fb85f6e5a7b47d603ca8ec55ff177ed7185dd790a8d74548b96d69ba3`; receipt reference digest `sha256:955fbf7da867bccd3db74f6f5603214c66551ace46fdcad13f4916644fa1eee6`.
- Approved memory: `PMB-MUC-7A172C974C0158E7`, version `1.0.11`, digest `sha256:47eddea9836521b0b1557782740121feab15d5fbc9ad6556654172b0334a57e4`.
- Synopsis: `sha256:4d1ec4b933d0736cb2d7ad568816788d50bcbc5dd018e7a95cce51fd83e6caab`.
- Graph checkpoint: `sha256:1207f84ad9e7ea077f59f4a4d8731c31feb0b9e0ee8c22a75a02600e7d8dccee`.
- Prior session `PMSS-5BF63897CD4DE501` / `HO-001-RC3-PUBLICATION` was already concluded. This task produces a candidate-only conclusion; only the ProjectMemory Gate can promote it.

## Behavior and evidence boundary

`settleBridgeAttempt({ storage, store, stageDirectory, checkpointNamespace, loadArtifact, apply: false })` is read-only by default. The caller supplies already-open LocalHostStorage and an existing durable continuity store. The helper never initializes a store or starts a process. Explicit boolean `apply: true` is required for writes.

The helper rederives original inputs, quality resolution, invocation and work fingerprint through `prepareLocalWorkDispatch`, then invokes `executeWorkItem` itself against the existing immutable `result/work-execution/<attemptId>` record in the explicit checkpoint namespace. Its executor and checkpoint claim/complete methods throw. Success requires `outcome: proposed`, `replayed: true`, and `executorCalls: 0`. A saved `runtime-replay.json`, a serialized runtime result, or a caller-authored receipt cannot substitute for that runtime replay.

Every required native queue record must match the exact archived artifact bound into that replay's raw executor result and evidence. Validation covers configuration, original source snapshot and graph bytes, worker and two independent review requests/plans/claims/dispatches, ProjectMemory bootstraps, native receipts, finals/responses, and the successful three-node Zeroshot terminal. Reviewers must bind the same candidate snapshot. Its unique file set must equal the original source plus the checkpoint's exact mutations; before/after source bytes are checked by digest and changes must fall within the original writable paths.

The historical records use both `collaboration.spawn_agent` task-name receipts and one `collaboration.followup_task` observation with a target, null returned content and observed running status. The helper accepts those two explicit observed shapes, binds the identity throughout the archived result, and retains observation-only authority. It does not create an installed `DesktopTaskReceipt`, claim provider model identity, or infer an installed coordinator effect.

`verifyLocalWorkContinuityClaim` verifies the original durable claim journal and preserves its immutable attempt ID, owner, fingerprint, target revision, quality digest, lease expiry and original revisions. Settlement uses only `transitionWorkAttempt` and the durable store's CAS/journaling API for `prepared -> dispatched -> running -> completed`. The completion records an execution attempt, with `verified: false`, `integrated: false` and `completionAuthority: false`. WorkItemVerification and integration remain pending; `WI-MES-CHANGE-HANDOFF` remains incomplete.

Receipt, raw result and evidence bytes are content-addressed before progression. Every restart revalidates the evidence, exact prior transition journal and next-index bytes. A lost response after any transition resumes from the durable prefix. A completed replay does not call artifact writes, commits or leases. Unexplained progression, missing or altered evidence, stale CAS, missing current claim, and absent runtime checkpoints fail closed. An unresolved attempt continues blocking new same-work-item claims.

The relatively long evidence check is intentional: each file belongs to a different existing authority boundary. It is one bounded construction function with two small phases (evidence inspection and durable progression), not a new orchestration framework or a product API.

## Temporary-store test result

Command, from the exact worktree:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test dogfood/modular-engineering-20260918/continuity/settle-bridge-attempt.test.mjs
```

Final run: **22 tests, 22 passed, 0 failed, 0 skipped/cancelled**, **16,504.9026 ms** under Node `v24.19.0`.

Tests create new temporary LocalHostStorage, reconstruct both original claims with the owning API, and use a clearly marked fixture executor returning archived bytes to create a genuine temporary WorkExecution checkpoint. They then exercise the helper's zero-executor replay. This fixture setup is not a new live native execution or approval.

Coverage includes both historical attempts; default inspection with write methods denied; explicit apply; immutable claim preservation; completed replay with writes denied; restart after each of three durable transitions; changed claim/configuration/source/native receipt/terminal/candidate/claim receipt/runtime projection; absent genuine runtime checkpoint despite saved replay JSON; missing native receipt; altered archived source bytes; duplicate candidate path; missing current claim; damaged durable settlement evidence; unexplained advanced state; concurrent intervening claim/CAS preservation; and invalid arguments. A separate sentinel representing approved heads and completion ledger remains byte-for-byte unchanged in every fixture.

**These are local replay-fixture tests, not portable repository conformance.** They depend on the existing uncommitted native construction records and content-addressed cycle artifact cache. The repository test runner discovers `dogfood/*.test.mjs`; therefore this test file must not be published without self-contained fixtures or another deliberate publication decision. No skip workaround or test-runner change was made. No full repository regression was run.

## Parent replay preparation

No fabricated replay proof is needed. The parent should independently review these files and repeat the temporary tests, then inspect each actual attempt using the existing store and exact artifacts before considering explicit apply:

| Stage under `execution/` | Attempt | Existing checkpoint namespace |
| --- | --- | --- |
| `recovery-1` | `MES-RECOVERY-001` | `MES-001-recovery-effects` |
| `byte-handoff-1` | `MES-BYTE-HANDOFF-001` | `MES-001-handoff-effects` |

The original continuity store is `work-continuity/devrelay` under `requirements/durable`. The read-only artifact loader must resolve all exact historical inputs/native/source artifacts from the cycle cache and the pinned original graph bytes. It must not normalize or rewrite historical artifacts. Source graph bytes were not separately cached by the original preparation; the helper asks `loadArtifact` for their exact original digest and file URI. If those bytes have moved or changed, preserve their authentic historical bytes in the parent artifact lookup; do not synthesize them from a parsed graph.

If the actual recorded runtime checkpoint is absent or cannot pass owning replay, stop and report that missing proof. The temporary test checkpoints and serialized runtime projections are not a live-store recovery substitute. The parent should preserve the inspection result and actual zero-call proof, and decide separately whether to apply the candidate helper. This author task did not inspect through or apply the helper to the live store.

## File digests and conclusion

- `settle-bridge-attempt.mjs`: `sha256:e7ae306291723d72b6b67fe856df8055f33e2925e8e932185261ac0fe80c00da`.
- `settle-bridge-attempt.test.mjs`: `sha256:84b26bb13f144e29c2250c9148de025a011223af903fc0d52ea48a09df4e9e8e`.

Candidate-only session disposition: retain approved ProjectMemory unchanged; propose recording this bounded helper and local replay validation as construction evidence. No approved knowledge, lifecycle completion, provider attestation, live interoperability, verification or integration is promoted by this conclusion.
