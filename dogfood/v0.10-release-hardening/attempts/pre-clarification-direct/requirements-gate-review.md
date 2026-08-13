# DevRelay V0.10 public OSS preview Requirements Gate review

Status: **awaiting owner approval**

RequirementsGathering produced one schema-valid, checkpoint-replay-valid full-body requirements change and deterministic ProjectOverview change. It adds the exact public GitHub source/library preview, package completeness, governance, protected-main, security-contact, Windows Desktop, recursive dogfood, and exclusion requirements. No baseline promotion or ArchitectureDesign progression is authorized until the exact candidate is approved.

## Decisions represented

- **DEC-OSS-DISTRIBUTION-001:** Distribute V0.10 through public GitHub source and an installable release tarball only; do not publish to the public npm registry.
- **DEC-OSS-LICENSE-001:** License DevRelay under Apache-2.0 and require Developer Certificate of Origin sign-off for contributions.
- **DEC-OSS-SECURITY-001:** Publish garrett.audet@gmail.com as the security contact and provide a private vulnerability-reporting path.
- **DEC-OSS-BRANCH-001:** Use main as the protected default branch and require release evidence before promotion.
- **DEC-OSS-HOST-001:** Define ChatGPT Desktop on Windows as the supported V0.10 product host.
- **DEC-OSS-DOGFOOD-001:** Run every applicable released DevRelay module for this release and complete a separate minimal software project end to end before BusinessAcceptance.
- **DEC-OSS-EXCLUSIONS-001:** V0.10 does not claim public npm publication, a one-click Desktop plug-in, or a hosted backend.

## Exact candidate evidence

- RequirementsBaseline input: sha256:c53332998c1b46848b0131f54341bed23b174d727e635731258fecf03aec5948
- ProjectOverviewBaseline input: sha256:b8f2910a06e208b73854baa64b24103193936a3c2a9a5bde61b294300f008985
- RequirementsChangeSet: sha256:e00a898a7e56df3c68067b209f8f899a3b856113cd495d59ab0070152a8fa0e7
- ProjectOverviewChangeSetDraft: sha256:a046d7271119bec05062c6d7ec6fdc8acc4540b06680cb1d77bc61a8029cb0c9
- Candidate ProjectOverview.md: sha256:9d31d62c868e1092cd0a40c4bc0f0f3adfe38ba7ab019ef1563ec2aac01250c9
- NativeSourceBundle: sha256:b6f0833d32d574f5ba48d7ea6ad99a87675b53a57ea10bd99b3be1c376de2a30
- Terminal checkpoint: sha256:140308aa6f72db2d45bbda97b8f9bb93673d4e3b521f1a6a2b6fe368414602ab
- Repository revision: a38d2ffde71b5226721a45fedf203c62fc093739
- Repository tree: sha256:5511e51c26b863a4fe0d34c161d814ce859e41430742b6a0a7dd2dda28d8a23b

## Gate checks

- PASS: exact current global requirements/project-overview baseline pair supplied
- PASS: accepted 0.9.0 repository revision and tree bytes are version-pinned and match
- PASS: no unconfirmed blocking assumptions remain
- PASS: GitHub-only distribution, Apache-2.0/DCO, security contact, protected main, supported host, and exclusions are explicit
- PASS: changed-section list is exhaustive and canonical
- PASS: ProjectOverview projection and Markdown bytes are deterministic
- PASS: owner decisions, capability evidence, and bounded OpenSpec native sources are digest-bound
- PASS: the OpenSpec binding is labeled fixture-conformant; no live CLI call is claimed
- PASS: checkpoint replay performs zero adapter reinvocations
- PENDING: owner approval of the exact candidate and atomic baseline-pair promotion
