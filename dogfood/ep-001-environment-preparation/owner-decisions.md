# EP-001 EnvironmentPreparation/Verification owner decisions

Wave: `RQW-0FEF4753B3072E01`

The owner approved all twenty-four recommendations in the exact breadth-first clarification wave.

1. **EP-Q-005**

   Should the contract model two layers: the DevRelay host environment and one or more project-specific named target profiles used for build, test, staging, or other work?.

2. **EP-Q-003**

   Should Core establish or update the environment baseline after SpecialistAssignmentGate, verify it before the first ready execution frontier, and revalidate its fingerprint before every later frontier?.

3. **EP-Q-007**

   Should preparation default to project-local, reversible changes; require explicit grants for process, network, secrets, or filesystem effects; and require separate approval for machine-global changes?.

4. **EP-Q-001**

   Should EP-001 own only environment preparation plus readiness proof, while WorkExecution performs product work, SystemVerification evaluates the integrated system, and ReleasePreparation packages/promotes releases?.

5. **EP-Q-009**

   Should profiles classify checks as required or optional, where any failed/unknown required check blocks and optional failures produce visible warnings?.

6. **EP-Q-013**

   Should evidence preserve exact command/tool identity, version, configuration digest, exit code, duration, stdout/stderr receipt or artifact digest, repository commit, profile digest, and resulting fingerprint?.

7. **EP-Q-015**

   Should environment profiles contain secret references and required-presence metadata only, never secret values, with receipts proving access/redaction without recording the value?.

8. **EP-Q-017**

   Should readiness bind the repository commit, all upstream baseline digests, profile version/digest, adapter/tool versions, host fingerprint, and relevant target fingerprints so any change deterministically invalidates it?.

9. **EP-Q-011**

   Should a profile be able to pin OS/architecture, shells, runtimes, package managers, SDKs, system tools, services, environment variables, filesystem prerequisites, and external capability attestations?.

10. **EP-Q-019**

   Should V1 ship a deterministic native Windows inventory/verifier as the default, with acquisition/configuration and technology-specific analyzers as optional bounded adapters?.

11. **EP-Q-023**

   Should deterministic equality, fail-closed behavior, zero-call replay, redaction, crash recovery, and bounded parallel check execution be mandatory release acceptance properties?.

12. **EP-Q-021**

   Should missing requirements produce one consolidated remediation plan and clarification wave rather than prompting after each individual check?.

13. **EP-Q-006**

   Should DevRelay claim support only for its Windows Desktop host while permitting project profiles for arbitrary technologies through adapters, with no implied support until live evidence exists?.

14. **EP-Q-004**

   Should preparation be a module that proposes/prepares state and EnvironmentVerificationGate be the sole readiness authority that can unblock WorkExecution?.

15. **EP-Q-008**

   Must every mutation declare rollback/cleanup behavior, before/after fingerprints, and an idempotency key, with unsupported rollback blocking global changes?.

16. **EP-Q-002**

   Should EP-001 produce an approved EnvironmentBaseline/EnvironmentChangeSet plus per-use readiness receipts, without claiming deployment, staging success, or release readiness?.

17. **EP-Q-010**

   Should the Gate accept only exact, current, policy-compliant evidence and emit ready, needs-clarification, remediation-required, baseline-drift, or unable-to-proceed?.

18. **EP-Q-014**

   Should TraceabilityGraph link EnvironmentProfile -> required-by -> WorkItem and EnvironmentReadinessReceipt -> authorizes-environment-for -> execution attempt, with only forward factual edges?.

19. **EP-Q-016**

   Should network access be denied by default and allowed only by exact destination/purpose grants, with every attempt recorded and no silent fallback to an online provider?.

20. **EP-Q-018**

   Should exact checkpoint replay perform zero preparation effects, while expired or drifted state creates a new verification attempt rather than mutating historical evidence?.

21. **EP-Q-012**

   When ChatGPT Desktop version or another host fact cannot be read through a stable API, may a time-bounded user/host attestation satisfy the check if explicitly labeled non-native and policy permits it?.

22. **EP-Q-020**

   Should adapter slots be capability-oriented (inventory, acquire, configure, service-check, target-probe) so tools such as PowerShell, winget, Scoop, Chocolatey, Docker, or mise can be swapped without becoming module special cases?.

23. **EP-Q-024**

   Should V1 avoid a universal wall-clock SLA and instead record per-check/per-profile duration, cache hits, retries, and bottlenecks so later policy can set evidence-based thresholds?.

24. **EP-Q-022**

   Should ChatGPT Desktop show the proposed mutations, grants, expected impact, rollback plan, and evidence obligations before effectful preparation begins?.
