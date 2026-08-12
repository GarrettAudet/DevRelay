# Next actions

Resume in this order.

1. Confirm the branch is clean at the handoff commit and do not revive the
   stale task checkout that stopped at `b0a4bf7`.
2. Run `WI-DESKTOP-LIFECYCLE` in its own visible ChatGPT Desktop task. Add a
   configured, version-pinned production stage-binding seam to the Core command
   adapter. Missing capabilities must produce a persisted resumable checkpoint;
   no stage may fabricate a completed artifact.
3. Prove the stage-binding seam through focused process, restart, drift, and
   resume tests. Integrate only an exact verified handoff.
4. Run `WI-DESKTOP-VERIFICATION` in a separate task. Extend the release gate so
   it installs the plugin and spawns the exact installed MCP declaration. Let
   the canonical gate run to a terminal result; do not convert a timeout into a
   pass.
5. Run the plugin-creator validator using an already-available compatible
   runtime, or record the missing validator dependency as an explicit release
   blocker. Do not install dependencies implicitly.
6. Apply the plugin cachebuster helper and reinstall using the documented
   marketplace flow. Start a new Desktop task so the updated skill and MCP
   server are actually loaded.
7. Execute `WI-DESKTOP-CLEAN-RUN`: use the clean-installed plugin to build one
   tiny real software feature through RequirementsGathering, Gates,
   ArchitectureDesign, conditional contracts, WorkBreakdown,
   WorkDependencyAnalysis, SpecialistAssignment, separate WorkExecution tasks,
   WorkItemVerification, ChangeIntegration, SystemVerification, and
   BusinessAcceptance.
8. Regenerate release evidence, update traceability and lifecycle reporting,
   run final SystemVerification and BusinessAcceptance, then update the handoff
   and push the final candidate.

Stop on baseline drift, missing release-ready bindings, nonterminal verification,
fixture substitution, bypassed stages, unverified task handoffs, or any claim
that exceeds the Windows Desktop/private repository-backed release boundary.

