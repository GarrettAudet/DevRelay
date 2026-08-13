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

- Candidate evidence digest: `sha256:3e4d5edc4eac3617622e3b9fcb37a2fec28128e06a528cb3686697dd7819bf2b`.
- SystemVerification digest: `sha256:fbdd363eba0803b260d0057931a0f863fb4d9af5140e5045b7ee9529d44d79b5`.
- BusinessAcceptance record digest: `sha256:9295eee9227b109434d46c8188fa3a457b0f78ef2b01f61f8fdfc5966ee0eb13`.
- Final graph digest: `sha256:2e9dfbc7a2e2ff8d9bb0a4f915c4e2e8e1968bdfd6ef68fc76d6e1a82d0d9374`.
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
