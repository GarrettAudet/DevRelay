# ArchitectureDesign Requirements Gate

Status: **pass**

Decision date: 2026-07-30

The restarted RequirementsGathering workflow asked the user four sequential,
user-visible clarification questions. The approved answers define one module,
two state-routed operations, an explicit discovery prerequisite, a
designer-to-modeler-to-decision-recorder chain, one primary candidate per
operation, seven subordinate architecture sections, and a separate
Architecture Gate.

## Deterministic checks

- Complete: the typed candidate covers business objectives, measurable success
  metrics, stakeholders, users, capabilities, a user journey, typed user
  stories, acceptance criteria, non-functional requirements, constraints,
  scope, non-goals, terminology, and current status.
- Clear: project state, not a model, selects the operation.
- Testable: every normative `US-*`, `NFR-*`, and `CON-*` item binds
  deterministic `AC-*` verification evidence.
- Covered: every business objective names its stakeholders, every stakeholder
  is covered by an objective or user, and every user participates in a
  capability, journey, and story.
- Canonical: top-level typed record arrays, nested identifier/string sets, and
  source-reference sets are strictly lexically ordered with no duplicates.
- Bounded: live upstream CLI execution, ArchitectureDiscovery implementation,
  ContractGeneration, enforcement, and Architecture Gate implementation remain
  out of scope.
- Traceable: the requirements draft binds the goal, project context, repository
  snapshot, and normalized interactive transcript by SHA-256 digest.
- Projected: `ProjectOverviewDraft` is the exact contract-versioned projection
  of `RequirementsDraft`; `ProjectOverview.md` is its exact digest-bound,
  UTF-8-without-BOM, NFC, LF-only rendering.
- Approved: the user's final response, "Alright build out that module then",
  followed the explicit discovery-prerequisite question and authorizes
  progression.
- Assumptions: all four typed assumptions are confirmed, explicitly
  nonblocking, and source-bound. Only an unconfirmed assumption with
  blocking=true would prevent promotion; nonblocking uncertainty would remain
  visible.
- Execution proof: the host revalidated the existing terminal checkpoint with
  `registry.verifyCheckpointedExecution` without invoking the adapter, then
  passed the returned unforgeable in-process receipt to the Requirements Gate.
  No serialized or portable receipt is claimed.

## Atomic promotion

This gate approves the exact `RequirementsDraft + ProjectOverviewDraft` pair
loaded by the process-local verified-checkpoint receipt. Plain ModuleResult JSON
or a serialized receipt is insufficient. The host must promote the candidates
together into a version-aligned
`RequirementsBaseline + ProjectOverviewBaseline` pair with this same approval
evidence, or persist neither baseline. `ProjectOverview.md` is a deterministic
attachment, not a separately editable source of truth.

## Bound artifacts

- ModuleInvocation: `sha256:9b602830932bdf54fc1ba88ec8720f7aefc75e03b5b82c90d1aea0dc1b0a196a`
- ModuleResult: `sha256:2cfecc1fd81b9ce00988bebebee52954aaec9a2876155f4a52e1d536f262758b`
- RequirementsDraft: `sha256:e8ab02df1b197b5b439b752e6688af66166cc3d8b87949bf8d97c7e67734943f`
- ProjectOverviewDraft: `sha256:bdfe3a44f8794312db365042560f49bcd9709f8c7c9fb962b03865c33404b01a`
- ProjectOverview.md: `sha256:fa6e6f96669bed0e6567b979cbf0c4c51d23ab51c1aca662bce07472b3756bad`
- NativeSourceBundle: `sha256:50b6066bf105e3f62565fc0890e8d3d66bc937f9bc51498807436101baf1fda9`
- Clarification transcript: `sha256:50bdc155bea2a91f43461f940bf4d84b340fdac3f0693bf52607ec00fdd32342`

The OpenSpec CLI was not executed. The configured bounded OpenSpec
`devrelay-requirements` agent-command bridge normalized the conversation into
DevRelay's canonical typed `RequirementsDraft`; DevRelay derived the overview
and Markdown deterministically.
