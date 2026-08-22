# Current state

- Branch: `codex/ep-001-main-provenance-reconciliation`
- Package: `0.10.0-rc.3`
- PR #11: all checks passed; merged by protected linear history.
- Protected-main EP-001 head: `a9cb936f894a5ddbb86d26b31a5b3b4a61e2a9f4`.
- Canonical-main verify run `32570160277`: one failure only, the V0.11 two-phase provenance assertion after GitHub rewrote commit IDs.
- Original implementation/evidence pair: `868c00e2dc8c0d610d919dbc68256bab9d0e6ca2` -> `3374e75e4342efde0e395855a85600ed6614b4a8`.
- Protected-main equivalent pair: `fe8181766a9340e8a64033752d33ee76453b66d8` -> `3257e3086675581f0399c3a4603adde9e6a00255`.
- Both corresponding trees are byte-identical; subjects and direct-parent ordering are preserved.
- Provenance verifier repair: focused suite passed 17/17 and is independently executed, verified, and integrated.
- EP work: 9/9 work items plus four verification repair retries are verified and integrated.
- SystemVerification: verified; 175 acceptance criteria and 46 NFRs.
- BusinessAcceptance: accepted; 20 objectives, 28 success metrics, and 55 business-scope identities.
- Traceability: acceptance horizon, revision 35, zero blocking diagnostics.
- ProjectMemory: `/conclude` passed; fresh-task replay made zero provider calls.
- Immutable implementation/evidence commit: `4e67574f2811c943c77facca05bccf1ed2bb671d`.
- Authoritative local release check: 1,103 tests; 1,101 passed; 0 failed; 2 intentional skips; 10,075 catalog digests; 390 package paths; 193 installed exports.
- Next gate: exact status/catalog reseal and repeated release check.
- Final promotion: protected PR -> canonical-main checks -> tag `v0.10.0-rc.3` -> GitHub source prerelease.

The supported boundary is GitHub source plus an installable deterministic library operated through ChatGPT/Codex Desktop on Windows. Exclusions remain public npm publication, one-click Desktop installation, a hosted backend, and non-Windows hosts.
