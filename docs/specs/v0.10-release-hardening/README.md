# DevRelay v0.10 release hardening

## Goal

Replace the invalidated `0.9.0` release claim with a content-addressed public
open-source preview whose package, runtime support, repository controls,
onboarding evidence, and declared boundary agree.

## Owner decisions

- Release model: public open-source preview.
- Distribution: GitHub source plus deterministic installable tarball.
- Supported host: ChatGPT Desktop on Windows.
- License: Apache-2.0.
- Contribution model: Developer Certificate of Origin sign-off.
- Candidate version: `0.10.0-rc.1`.
- Maintained CI: Node 22 and 24 on Windows and Ubuntu.

## Current stage

```text
intake: pass
clarify: pass
spec: pass
architecture check: pass
task plan: pass
implement: pass
verify: pass
review: pass
business acceptance: pass
promotion: in progress
```

All eight release work items have passed WorkExecution, WorkItemVerification,
ChangeIntegration, and trusted traceability projection. The exact candidate
passed SystemVerification and BusinessAcceptance, including zero-call replay.

## Final-gate evidence

- Candidate evidence digest: `sha256:3b9cf72560ffe0b920ea9e8f1a07cf628b1713fd63a423003f6dd92b91aea683`.
- SystemVerification digest: `sha256:0ed2af46a9d5ab067361ece9b98229320954f14f92565ad8b05127d2757bd593`.
- BusinessAcceptance record digest: `sha256:bb434c8785ddf3dabe3b1f534058260a776e5c9b2ba601768de088c02e5253ac`.
- Final graph digest: `sha256:6d32f1dd72535574497e4965cb9f204cb9b1298606ab6614187c688f2ca3945e`.
- Blocking traceability diagnostics: zero.

## Dogfood findings resolved

1. The installed package root did not expose the human-readable lifecycle-run
   report APIs required by the Desktop workflow; root exports and installed
   package smoke coverage were added.
2. Traceability vocabulary v1.6 inherited BusinessAcceptance edge semantics
   from v1.5, but one update-preflight branch checked only v1.5; Core and its
   regression coverage were corrected.
3. The living graph lacked approved business-scope observations; a bounded,
   trusted RequirementsBaseline reconciliation added only those missing facts
   before BusinessAcceptance.

## Remaining promotion gates

1. Regenerate and verify the final release catalog.
2. Pass the complete local kernel and installed-package gates.
3. Persist the exact candidate on the feature branch.
4. Pass protected-main Node 22/24 Windows/Ubuntu and security checks.
5. Merge and record the final source-release evidence.

## Explicit exclusions

No public npm publication, one-click ChatGPT Desktop plug-in, hosted backend,
or live upstream CLI interoperability is claimed.
