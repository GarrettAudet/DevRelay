# WorkBreakdown dogfood RequirementsGathering run

This directory is the authoritative RequirementsGathering run used to define
WorkBreakdown 0.1.0 before ArchitectureDesign or implementation.

The canonical purpose is to convert approved scope into a complete set of
bounded, traceable, independently executable and verifiable work-item drafts.
WorkBreakdown does not execute or build code.

The authoritative WorkItemDraft contract contains only: id, objective,
bounded-scope, deliverables, work-type, acceptance-criterion-refs,
architecture-refs, contract-refs, required-capabilities, dependency-hints,
verification-plan, required-evidence, and source-refs. Requirements and user
stories remain reachable transitively through acceptance criteria; direct
requirement-refs and user-story-refs are forbidden.

The transcript also preserves the user's typed add/update/retire delta approval
as an ArchitectureDesign decision. RequirementsGathering does not claim to have
selected or authored that delta schema.

The final V1 work-type vocabulary is code-change, configuration-change,
documentation-change, infrastructure-change, migration, operational-readiness,
and test-change. The OpenSpec CLI was not executed; the chat acted only as the
declared bounded agent-command bridge.

- Approved RequirementsBaseline digest: `sha256:af5aa3ea3bea8ce1645bee526f1a64a16a58aad7a305dccaa90dd26e6096e311`
- Approved ProjectOverviewBaseline digest: `sha256:005fcec20ca10d27d06dc84bf35c2e4c24144099a7ba28cb516759036afa703e`
- Requirements Gate digest: `sha256:af421c6fb34e03313fab9a7e289fe5cf024c46835c7ffb3ca8d012967450d107`
- ProjectOverview.md digest: `sha256:f2240c49db270864df42e48725199e3424fd350615173210e8c59495b30ee4ba`
- Repository snapshot commit: `7d3b9c16d4c197bf80dce8279e027b953e32f21a`
- Repository tree-listing digest: `sha256:1b27077b4c9cb4b749c36241ad50bff8e4af7640470e584980eefd9356e9e161`
