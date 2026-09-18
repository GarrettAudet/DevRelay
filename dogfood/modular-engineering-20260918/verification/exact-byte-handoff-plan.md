# Exact-byte verification handoff repair proposal

This is a candidate implementation plan under MES existing-project handoff
reconciliation. It grants no verification, integration or completion authority.

The current approved artifact references identify exact stored bytes. The direct
WorkItemVerification and ChangeIntegration input helpers currently accept only
an object and reference and compare the reference with a canonical object hash.
The diagnostic `preflight/baseline-byte-bindings.json` proves that this rejects
five actual approved MES baselines. Re-rendering or re-identifying the approved
baselines would lose the current Gate lineage and is not an acceptable repair.

The existing public Module ports and artifact-reference schemas already describe
exact artifact references; ChangeIntegration documentation explicitly requires
raw-byte validation. Review an additive implementation input that accepts exact
loaded bytes beside the existing object/reference pair. Preserve the existing
canonical-only input for legacy callers. If exact bytes are supplied, validate
their digest and UTF-8 JSON value against the bound reference and object; never
fall back to a canonical digest after failure. Retain the supplied reference in
the resulting subject and integration binding.

Before changing source, prove the owning contract interpretation against the
released manifests and documentation. If this requires changing a published
Module contract rather than correcting its implementation, introduce a new
version and run its actual contract lifecycle; do not edit an exact released
version in place.

Required conformance cases:

- Legacy canonical object/reference inputs remain byte-for-byte compatible.
- Pretty JSON, property-order differences and trailing newline retain their
  actual approved byte identity when exact bytes are supplied.
- Changed bytes, changed object views, invalid UTF-8/JSON, missing references,
  unknown fields and mismatched work/attempt identities fail closed.
- Verification subject, Gate evidence and integration inputs keep the same
  seven actual activated baseline pointers, including explicit overview input.
- Current project bytes and historical artifacts remain unchanged.
- The real recovery proposal can reach current-baseline verification without
  manufactured results or rewritten upstream digests.

Likely bounded source surfaces are the two Module-owned input guards, their
focused tests and documentation. Keep validation ownership there; Generic Core
must not gain product/Module routing branches. This proposal has not run and
does not relax the recovery work's mandatory quality obligations.
