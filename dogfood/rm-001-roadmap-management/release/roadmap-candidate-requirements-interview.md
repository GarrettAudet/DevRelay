# Roadmap candidate requirements interview

Candidate: Live optional roadmap planning-system adapters

- Objective: allow configured GitHub Projects and Linear adapters to propose roadmap changes without replacing the native file contract.
- Users: DevRelay project owners operating through ChatGPT Desktop on Windows.
- Scope: proposer-only intake, review, and reprioritization bindings with exact provider receipts and native artifact archival.
- Non-goals: no external system may approve, mutate the authoritative baseline, schedule work, execute work, or become required for offline operation.
- Success: both adapters normalize into the same candidate contract; substitution, unavailable providers, and permission drift fail closed; the native provider remains fully usable.
- Constraints: GitHub source distribution only, explicit grants, content-addressed artifacts, no hidden credentials, and no source transmission without approval.
- Dependencies: stable RoadmapManagement 0.1.0, provider-execution attestations, capability enforcement, and RoadmapGate.
- Operational boundary: optional future increment; triage must not start construction automatically.
