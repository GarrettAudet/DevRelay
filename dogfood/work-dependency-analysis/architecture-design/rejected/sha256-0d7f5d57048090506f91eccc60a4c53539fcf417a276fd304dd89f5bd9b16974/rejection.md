# Architecture Gate rejection

Outcome: `reject -> redesign`
Promotion authorized: no

The owner approved the WorkDependencyAnalysis architectural direction but
rejected promotion of this exact candidate. The preserved candidate is bound
to:

- `ArchitectureChangeSetDraft`:
  `sha256:0d7f5d57048090506f91eccc60a4c53539fcf417a276fd304dd89f5bd9b16974`
- Architecture Gate review:
  `sha256:2bf817c98a14e10ba1ad985695e9cccd0dc8859a431b546c7fc0724cc228bf21`

Blocking corrections:

1. Replace invalid component nesting with software-system -> container ->
   component C4 hierarchy.
2. Materialize one container view and separate Generic Core and
   WorkDependencyAnalysis component views.
3. Parse and export `workspace.dsl` with the real Structurizr binary, normalize
   the exported model, and compare hierarchy, elements, relationships, and
   views with the canonical DevRelay architecture.
4. Preserve unchanged baseline entities and represent unchanged requirement
   coverage with `already-designed` rather than rewriting historical
   `sourceRequirementIds`.

Any replacement is a new gate candidate with new digests and requires new
owner approval.
