# SystemVerification confirmed design basis

1. **D-SV-SUBJECT-001**

   The subject is one immutable IntegratedSystemCandidate binding the final RepositorySnapshot, all required IntegratedChangeRecords, authoritative integrated-completion facts, and the complete approved project baselines.

2. **D-SV-OBLIGATIONS-001**

   Core deterministically expands applicable acceptance criteria and non-functional requirements into a complete SystemVerificationObligationSet; adapters cannot add, remove, or redefine obligations.

3. **D-SV-EVIDENCE-001**

   Configured verifier adapters return raw observations and native evidence only; Core normalizes evidence and evaluates the version-pinned SystemVerificationPolicy.

4. **D-SV-ENVIRONMENT-001**

   Verification environment context is explicit and version-pinned as VerificationEnvironmentSnapshot or ApprovedNotApplicable; conversational or ambient environment state is invalid.

5. **D-SV-OUTCOMES-001**

   Closed outcomes are verified, failed, needs-evidence, baseline-drift, and unable-to-proceed; only verified progresses to BusinessAcceptanceGate.

6. **D-SV-BOUNDARY-001**

   SystemVerification cannot modify code, integrate changes, deploy software, alter approved scope, or grant business acceptance.
