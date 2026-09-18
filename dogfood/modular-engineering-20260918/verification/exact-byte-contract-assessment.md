# Exact-byte input implementation contract assessment

This bounded repair is part of approved WI-MES-CHANGE-HANDOFF reconciliation.
It is a candidate implementation fix, not completion or Gate authority.

The released `work-item-verification@0.1.0` and `change-integration@0.1.0`
definitions declare immutable artifact references and exact subject/baseline
lineage. Their schemas constrain reference fields and digests, without requiring
upstream baseline files to have canonical JSON serialization. ChangeIntegration's
existing documentation explicitly requires checking every raw-byte digest.
ProjectMemory and owning baseline Gates preserve exact stored artifact bytes.

The two JavaScript input helpers currently assume canonical serialization for
the baseline object/reference pair. That assumption rejects five actual current
approved baselines. Adding optional `rawBytes` to those seven baseline helper
bindings implements the existing exact-reference contract. It changes neither
the Module ports, artifact schemas, outcomes, immutable published definitions,
nor Gate approval rules. No new Module version is needed for this implementation
correction. The owning documentation must describe this additive helper input
before source changes, and fixtures must cover accepted and rejected inputs.

Legacy object/reference callers retain their canonical hash path. If `rawBytes`
is explicitly present it must be validated, even if undefined or malformed; no
canonical fallback may hide bad evidence. Exact UTF-8 JSON bytes must match both
the reference digest and parsed object. Existing generic
`loadOwnedJsonArtifact` already supplies those integrity checks and should be
reused. The seven approved reference identities must survive unchanged into
verification subjects and integration bindings. Baseline and kind/identity/
attempt checks remain owned by each Module.

Work-item projections remain canonical because obligation expansion requires
that identity. Other verification inputs and legacy opaque ChangeIntegration
effect/policy byte parameters are outside this repair. Do not silently change
those contracts. Existing-project planning routes, whole-work-item verification,
regression, integration, and business acceptance remain outstanding.
