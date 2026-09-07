# DevRelay current implementation status

Last reconciled: 2026-09-07 CST
Protected branch: main
Working branch: codex/qc-001-quality-continuity
Released version: 0.11.0-rc.1
Candidate version: 0.11.0-rc.2
Candidate implementation seal: 779e6aa341b93aca99ff33177f95742284f6d606
Release boundary: GitHub source plus a deterministic installable tarball operated through ChatGPT/Codex Desktop on Windows

## Status

QC-001 is implementation-complete, system-verified, and owner-accepted for the controlled `0.11.0-rc.2` candidate boundary. It adds three separate provider-neutral cross-cutting Modules—QualityPolicy, WorkContinuity, and ProjectControl—composed through a generic deterministic boundary DAG without turning them into construction lifecycle stages or giving them Gate, integration, graph, or owner authority.

QualityPolicy resolves project rules, workflow profile, change risk, technology surfaces, and acceptance criteria into mandatory, evidence-bound verification obligations. WorkContinuity computes content-addressed work fingerprints, coordinates compare-and-swap claims, quarantines uncertain effects, persists exact attempt lineage, and permits automatic reuse only for an exact verified identity. ProjectControl reconciles approved sources into deterministic read-only status, diagnostics, and productivity observations.

Desktop task plans bind the exact ProjectMemory bootstrap context, quality resolution, work fingerprint, and reuse decision. The end-to-end proof ran `quick`, `standard`, and `assurance` profiles through real local Git worktrees and commits, independent quality evidence, durable continuity restart, exact reuse, ProjectControl projection, and ProjectMemory conclusion/fresh-task recovery.

Canonical verification passed 1,191 tests with 1,189 passing, zero failures, and two intentional skips in 1,033,518.6514 milliseconds. The QC-001 scale benchmark covered 100 cross-cutting bindings, 1,000 work items, and 10,000 attempt records at 186.5203 milliseconds p95 against the approved 500 millisecond local-host threshold.

The post-promotion regression set passed 24 of 24 tests. The final release catalog verifies 11,452 exact repository digests and 430 exact npm-package paths, covering 16 active Modules, 26 active plug-ins, one compatibility Module, and two compatibility plug-ins. Installable-package verification passed all 430 catalog-bound files and 214 installed export targets.

ProjectMemory `/conclude` promoted baseline 1.0.8 through ProjectMemory Gate and recorded `MEM-DEVRELAY-STATUS-QC001-RC2-CANDIDATE`. A fresh task recovered that exact record from baseline `PMB-MUC-F57D31C74EA7FDF8` (`sha256:8dfe14c7a6ce4f89028b7644ae4eb36e5e578a6b6e780007e51e7315d1c9912e`) with native-equivalent provider fallback; replay made zero provider calls. The synopsis digest is `sha256:9ab2ef27a6f7537aed47327fe25acdcfdda82f9292886724e1fe9ad937480de5`, and the existing graph checkpoint remains `sha256:1207f84ad9e7ea077f59f4a4d8731c31feb0b9e0ee8c22a75a02600e7d8dccee`.

The personal `devrelay-desktop@personal` plug-in remains installed and enabled at `0.1.1+codex.20260906044519`. ChatGPT Desktop project instructions plus the managed task prompt are the supported startup boundary; no undeclared automatic plug-in hook is claimed.

## Lifecycle

RequirementsGathering / RequirementsGate                  promoted paired project baseline 2.7.0
ArchitectureDiscovery                                     deterministic skip; current inventory sufficient
ArchitectureDesign / ArchitectureGate                     cross-cutting composition approved without Core authority changes
ContractGeneration / ContractGate                         four schemas and three ModuleDefinitions approved
WorkBreakdown / WorkDependencyAnalysis                    nine deliverables in six acyclic frontiers
SpecialistAssignment                                      bounded implementation, verification, release, and documentation roles
WorkExecution / WorkItemVerification                      implementation sealed; focused, adversarial, and canonical evidence passed
ChangeIntegration                                         implementation commit 779e6aa341b93aca99ff33177f95742284f6d606
SystemVerification                                        1,191 tests; 1,189 pass; zero fail; two intentional skips
BusinessAcceptance                                        accepted for controlled 0.11.0-rc.2 candidate sealing
ProjectMemory /conclude                                   baseline 1.0.8 promoted; fresh-task read and zero-call replay passed
ReleasePreparation                                        catalog and installable-package checks passed; evidence sealing complete

## Published evidence retained

- Release: https://github.com/GarrettAudet/DevRelay/releases/tag/v0.11.0-rc.1
- Release pull request: https://github.com/GarrettAudet/DevRelay/pull/19
- Protected-main release tag commit: `08be8385966223d16a20150ac804505b5fe40153`
- Release workflow run: `34034582831`

## Next action

Seal the exact `0.11.0-rc.2` catalog and installable package, then open the protected-branch pull request. Publication remains a separate external operation and is not authorized by candidate acceptance.

This candidate does not claim public npm publication, one-click Desktop installation, a hosted backend, non-Windows support, or guaranteed defect-free output.
