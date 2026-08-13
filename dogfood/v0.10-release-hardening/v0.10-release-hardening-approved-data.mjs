const sortedCollectionKeys = new Set([
  "acceptanceCriteria", "assumptions", "businessObjectives", "capabilities",
  "constraints", "nonFunctionalRequirements", "nonGoals", "scope",
  "stakeholders", "successMetrics", "terminology", "userJourneys",
  "userStories", "users",
]);
const sortedStringArrayKeys = new Set([
  "acceptanceCriterionIds", "aliases", "businessObjectiveIds", "capabilityIds",
  "deliverables", "dependencies", "interests", "needs", "requiredEvidence",
  "risks", "stakeholderIds", "userIds", "userJourneyIds",
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry));
    if (key === "sourceRefs") {
      return entries.sort((left, right) =>
        compareText(
          [left.role, left.artifact.artifactId, left.artifact.digest, left.location ?? ""].join("\u0000"),
          [right.role, right.artifact.artifactId, right.artifact.digest, right.location ?? ""].join("\u0000"),
        ),
      );
    }
    if (sortedCollectionKeys.has(key)) {
      return entries.sort((left, right) => compareText(left.id, right.id));
    }
    if (sortedStringArrayKeys.has(key) && entries.every((entry) => typeof entry === "string")) {
      return [...new Set(entries)].sort(compareText);
    }
    return entries;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [
    childKey, canonicalize(child, childKey),
  ]));
}
function sourced(sourceRefs, value) {
  return { ...value, sourceRefs: structuredClone(sourceRefs) };
}
function appendUnique(entries, values) {
  return [...new Set([...entries, ...values])];
}
function replaceById(entries, id, update) {
  let found = false;
  const result = entries.map((entry) => {
    if (entry.id !== id) return entry;
    found = true;
    return update(entry);
  });
  if (!found) throw new Error(`Missing requirements record ${id}.`);
  return result;
}

export const ownerDecisions = Object.freeze([
  Object.freeze({ decisionId: "DEC-OSS-DISTRIBUTION-001", decision: "Distribute V0.10 through public GitHub source and an installable release tarball only; do not publish to the public npm registry.", questionId: "Q-OSS-DISTRIBUTION-001", answer: "Use GitHub source and an installable release tarball only; do not publish to the public npm registry (recommended)" }),
  Object.freeze({ decisionId: "DEC-OSS-SECURITY-001", decision: "Publish garrett.audet@gmail.com as the security and conduct contact and provide a private vulnerability-reporting path.", questionId: "Q-OSS-SECURITY-CONTACT-001", answer: "garrett.audet@gmail.com" }),
  Object.freeze({ decisionId: "DEC-OSS-BRANCH-001", decision: "Use main as the protected default branch and require release evidence before promotion.", questionId: "Q-OSS-DEFAULT-BRANCH-001", answer: "Use main as the protected default branch (recommended)" }),
]);

export function buildReleaseHardeningRequirements(currentRequirements, makeSourceRefs) {
  const requirements = structuredClone(currentRequirements);
  const sourceRefs = typeof makeSourceRefs === "function"
    ? makeSourceRefs() : structuredClone(makeSourceRefs);

  requirements.currentStatus = sourced(sourceRefs, {
    lifecycle: "existing",
    phase: "planning",
    summary: "The V0.10 public GitHub source/library preview requirements are clarified: GitHub-only distribution, Apache-2.0 with DCO, a public security contact, protected main, Windows Desktop support, package-export conformance, and complete recursive dogfood evidence.",
  });

  requirements.businessObjectives.push(sourced(sourceRefs, {
    id: "BO-DEV-OSS-001",
    statement: "Release DevRelay as a trustworthy open-source source/library distribution that supports deterministic end-to-end software engineering from ChatGPT Desktop on Windows.",
    stakeholderIds: ["STK-DEV-MAINTAINER-001", "STK-DEV-OWNER-001", "STK-DEV-WORKFLOW-AUTHOR-001"],
    priority: "must",
  }));
  requirements.successMetrics.push(
    sourced(sourceRefs, {
      id: "SM-DEV-OSS-EXPORTS-001",
      name: "Installed package export completeness",
      businessObjectiveIds: ["BO-DEV-OSS-001"],
      measure: "Declared package exports that resolve from a clean install of the generated release tarball.",
      target: "100 percent, including every fixed and wildcard export.",
      measurementMethod: "Enumerate package.json exports, pack and install the tarball in an isolated consumer, then resolve or import every expanded subpath.",
    }),
    sourced(sourceRefs, {
      id: "SM-DEV-OSS-DOGFOOD-001",
      name: "Accepted Windows Desktop dogfood",
      businessObjectiveIds: ["BO-DEV-OSS-001"],
      measure: "Applicable DevRelay lifecycle stages and required Gates completed for both the release hardening change and one minimal software project.",
      target: "100 percent, with explicit not-applicable dispositions for conditional stages.",
      measurementMethod: "Reconcile lifecycle run records, traceability updates, verification evidence, integration receipts, and BusinessAcceptance decisions.",
    }),
  );
  requirements.capabilities.push(sourced(sourceRefs, {
    id: "CAP-DEV-OSS-RELEASE-001",
    name: "Verified open-source source/library release",
    description: "Materialize, validate, and publish an Apache-2.0/DCO GitHub source and tarball release with complete package exports and Windows Desktop dogfood evidence.",
    businessObjectiveIds: ["BO-DEV-OSS-001"],
    userIds: ["USR-DEV-WORKFLOW-AUTHOR-001"],
    audience: "user-facing",
    key: true,
    priority: "must",
  }));
  requirements.users = replaceById(requirements.users, "USR-DEV-WORKFLOW-AUTHOR-001", (entry) => sourced(sourceRefs, {
    ...entry,
    needs: appendUnique(entry.needs, [
      "Install a complete DevRelay source/library artifact from GitHub without relying on public npm publication.",
      "Run the full deterministic lifecycle from ChatGPT Desktop on Windows with human-readable evidence.",
    ]),
  }));
  requirements.userJourneys.push(sourced(sourceRefs, {
    id: "UJ-DEV-OSS-RELEASE-001",
    name: "Release and consume the GitHub source/library preview",
    userId: "USR-DEV-WORKFLOW-AUTHOR-001",
    capabilityIds: ["CAP-DEV-OSS-RELEASE-001"],
    trigger: "The owner authorizes a public open-source preview of an accepted DevRelay source baseline.",
    outcome: "A Windows Desktop user can retrieve, install, verify, and dogfood the exact approved GitHub release artifact.",
    steps: [
      { sequence: 1, action: "Run the full DevRelay lifecycle over the release-hardening change.", expectedOutcome: "Every design, work, verification, integration, and acceptance decision is explicit and traceable." },
      { sequence: 2, action: "Pack and install the candidate in an isolated consumer and enumerate every declared export.", expectedOutcome: "All declared public subpaths resolve from the actual release artifact." },
      { sequence: 3, action: "Run the supported verification matrix and a minimal end-to-end software dogfood from ChatGPT Desktop on Windows.", expectedOutcome: "The supported host path is evidenced by production-like lifecycle execution." },
      { sequence: 4, action: "Promote the approved source and tarball through protected main and a GitHub release.", expectedOutcome: "The public artifact is bound to exact accepted evidence and repository state." },
    ],
  }));
  requirements.userStories.push(sourced(sourceRefs, {
    id: "US-DEV-OSS-CONSUME-001",
    userId: "USR-DEV-WORKFLOW-AUTHOR-001",
    capabilityId: "CAP-DEV-OSS-RELEASE-001",
    userJourneyIds: ["UJ-DEV-OSS-RELEASE-001"],
    need: "Consume a complete, verifiable DevRelay source/library release from GitHub and use it through ChatGPT Desktop on Windows.",
    benefit: "Production-quality software work can follow the deterministic lifecycle without hidden package omissions or unsupported distribution claims.",
    priority: "must",
    acceptanceCriterionIds: [
      "AC-DEV-OSS-DISTRIBUTION-001", "AC-DEV-OSS-DOGFOOD-001",
      "AC-DEV-OSS-EXPORTS-001", "AC-DEV-OSS-GOVERNANCE-001",
      "AC-DEV-OSS-MAIN-001", "AC-DEV-OSS-SECURITY-001",
      "AC-DEV-OSS-WINDOWS-001",
    ],
  }));

  requirements.acceptanceCriteria.push(
    sourced(sourceRefs, { id: "AC-DEV-OSS-DISTRIBUTION-001", statement: "V0.10 is distributed as public GitHub source plus an installable release tarball and makes no public npm publication claim.", verification: "Inspect package and release metadata, download the GitHub artifact, install it without registry publication, and reject any release evidence that claims a public npm package." }),
    sourced(sourceRefs, { id: "AC-DEV-OSS-EXPORTS-001", statement: "Every fixed and wildcard package.json export resolves from the packed and clean-installed tarball, including the ArchitectureDiscovery module definition and native discovery plug-in manifest.", verification: "Enumerate the complete export map, expand wildcard targets deterministically, install the tarball in a temporary consumer, and resolve/import every target." }),
    sourced(sourceRefs, { id: "AC-DEV-OSS-GOVERNANCE-001", statement: "The release contains Apache-2.0 LICENSE and NOTICE files, DCO contribution terms, contribution and conduct guidance, maintainer governance, support guidance, ownership rules, and community templates.", verification: "Validate required files in source and packed artifact, check their exact release catalog digests, and review the contribution path for DCO consistency." }),
    sourced(sourceRefs, { id: "AC-DEV-OSS-SECURITY-001", statement: "SECURITY.md identifies garrett.audet@gmail.com and GitHub private vulnerability reporting as the supported security-reporting paths without promising unsupported response guarantees.", verification: "Inspect the exact published security policy and exercise all referenced GitHub links or owner-only setup instructions." }),
    sourced(sourceRefs, { id: "AC-DEV-OSS-MAIN-001", statement: "main is the repository default branch and a protection rule prevents unverified direct release promotion.", verification: "Query GitHub repository and ruleset configuration, confirm main is default, and preserve owner-verifiable settings evidence." }),
    sourced(sourceRefs, { id: "AC-DEV-OSS-WINDOWS-001", statement: "The release-defining source/library verification and installed-package dogfood pass on Windows under every supported Node major version.", verification: "Run the canonical gate and clean installed-package consumer on Windows for Node 22 and Node 24, preserving exact logs and digests." }),
    sourced(sourceRefs, { id: "AC-DEV-OSS-DOGFOOD-001", statement: "The release hardening change and a separate minimal software project each run all applicable DevRelay modules in order, record conditional dispositions, merge traceability updates, and finish with SystemVerification and BusinessAcceptance.", verification: "Reconcile both complete LifecycleRunReports against module execution records, Gate proofs, graph checkpoints, change integration, system evidence, and final acceptance records." }),
  );
  requirements.nonFunctionalRequirements.push(
    sourced(sourceRefs, {
      id: "NFR-DEV-OSS-DETERMINISM-001", category: "reliability",
      statement: "Release catalog generation, export enumeration, tarball validation, installed-package verification, and lifecycle replay must be deterministic for exact source and configuration inputs.",
      applicability: { level: "project" }, measure: "Digest equality and zero-call replay across repeated candidate materialization and verification.",
      target: "100 percent equality for canonical artifacts and zero unexplained drift.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-OSS-EXPORTS-001", "AC-DEV-OSS-DOGFOOD-001"],
    }),
    sourced(sourceRefs, {
      id: "NFR-DEV-OSS-COMPATIBILITY-001", category: "compatibility",
      statement: "The V0.10 public source/library preview must remain usable from ChatGPT Desktop on Windows with supported Node LTS releases.",
      applicability: { level: "project" }, measure: "Passing Windows canonical gate and installed-package consumer runs for every supported Node major.",
      target: "100 percent of the declared Windows and Node matrix.", priority: "must",
      acceptanceCriterionIds: ["AC-DEV-OSS-WINDOWS-001"],
    }),
  );
  requirements.constraints.push(
    sourced(sourceRefs, { id: "CON-DEV-OSS-DISTRIBUTION-001", category: "business", statement: "V0.10 uses GitHub source and release tarballs only and is not published to the public npm registry.", rationale: "The owner selected a controlled public source/library preview before registry distribution.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-OSS-DISTRIBUTION-001"] }),
    sourced(sourceRefs, { id: "CON-DEV-OSS-LICENSE-001", category: "legal", statement: "Source and packaged artifacts use Apache-2.0 licensing and contributions use DCO sign-off.", rationale: "The owner selected a permissive open-source license and lightweight provenance model.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-OSS-GOVERNANCE-001"] }),
    sourced(sourceRefs, { id: "CON-DEV-OSS-PLATFORM-001", category: "platform", statement: "ChatGPT Desktop on Windows is the supported V0.10 product host; other desktop hosts and a hosted service are not release claims.", rationale: "The release scope is intentionally narrow and evidence must match the supported environment.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-OSS-WINDOWS-001", "AC-DEV-OSS-DOGFOOD-001"] }),
    sourced(sourceRefs, { id: "CON-DEV-OSS-BRANCH-001", category: "security", statement: "main is the protected default branch and release promotion requires verified evidence.", rationale: "Public source distribution needs an owner-controlled, auditable promotion boundary.", applicability: { level: "project" }, acceptanceCriterionIds: ["AC-DEV-OSS-MAIN-001"] }),
  );
  requirements.scope.push(
    sourced(sourceRefs, { id: "SCOPE-DEV-OSS-PREVIEW-001", statement: "A public Apache-2.0/DCO GitHub source/library preview with a deterministic installable tarball, complete package exports, community and security controls, supported Node verification, and protected-main promotion evidence." }),
    sourced(sourceRefs, { id: "SCOPE-DEV-OSS-DOGFOOD-001", statement: "A production-like ChatGPT Desktop on Windows run of the complete applicable DevRelay lifecycle for the release change plus a separate minimal software project." }),
  );
  requirements.nonGoals.push(
    sourced(sourceRefs, { id: "NG-DEV-OSS-NPM-001", statement: "Publish DevRelay to the public npm registry in V0.10.", rationale: "GitHub source and an installable release tarball are the approved distribution channels." }),
    sourced(sourceRefs, { id: "NG-DEV-OSS-PLUGIN-001", statement: "Ship a one-click ChatGPT Desktop plug-in in V0.10.", rationale: "The approved deliverable is a deterministic source/library used through the Desktop host." }),
    sourced(sourceRefs, { id: "NG-DEV-OSS-HOSTED-001", statement: "Operate a hosted DevRelay backend or service in V0.10.", rationale: "Hosted operations are outside the source/library preview boundary." }),
  );
  requirements.terminology.push(
    sourced(sourceRefs, { id: "TERM-DEV-OSS-PREVIEW-001", term: "Open-source preview", definition: "The public Apache-2.0/DCO GitHub source and installable tarball release that has passed the scoped V0.10 evidence gates without claiming npm publication or hosted operation.", aliases: ["OSS preview"] }),
    sourced(sourceRefs, { id: "TERM-DEV-RELEASE-DEFINING-HOST-001", term: "Release-defining host", definition: "The environment whose passing end-to-end evidence is required for the release claim; for V0.10 this is ChatGPT Desktop on Windows.", aliases: ["Supported host"] }),
  );
  requirements.assumptions.push(
    sourced(sourceRefs, { id: "ASM-DEV-OSS-DISTRIBUTION-001", statement: "GitHub source and an installable release tarball are sufficient for the V0.10 public preview.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-DEV-OSS-SECURITY-001", statement: "garrett.audet@gmail.com is the approved public security contact.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-DEV-OSS-BRANCH-001", statement: "main is the approved protected default branch.", status: "confirmed", blocking: false }),
    sourced(sourceRefs, { id: "ASM-DEV-OSS-HOST-001", statement: "ChatGPT Desktop on Windows is the only supported V0.10 product host.", status: "confirmed", blocking: false }),
  );

  requirements.dependencies = appendUnique(requirements.dependencies, [
    "GitHub repository settings allowing the owner to set main as default, enable branch protection or rulesets, and enable private vulnerability reporting.",
    "Windows runners with supported Node 22 and Node 24 toolchains.",
  ]);
  requirements.risks = appendUnique(requirements.risks, [
    "A declared package export may remain absent from the packed artifact unless verification derives required files from package.json itself.",
    "GitHub owner-only repository settings may remain incomplete even when source changes and local verification pass.",
    "Cross-platform CI may pass while the release-defining Windows Desktop host path remains untested.",
  ]);
  requirements.deliverables = appendUnique(requirements.deliverables, [
    "Apache-2.0 LICENSE and NOTICE plus DCO, contribution, conduct, governance, support, security, ownership, issue, and pull-request guidance.",
    "Deterministic package-export inventory and clean installed-package verifier.",
    "GitHub source and installable V0.10 release tarball with exact catalog, checksums, and provenance evidence.",
    "Complete release-hardening and minimal-software-project LifecycleRunReports for ChatGPT Desktop on Windows.",
  ]);
  requirements.requiredEvidence = appendUnique(requirements.requiredEvidence, [
    "oss/license-and-governance", "oss/security-contact", "oss/protected-main",
    "release/package-export-completeness", "release/installed-package-windows",
    "release/source-catalog", "dogfood/full-lifecycle", "dogfood/minimal-software-project",
  ]);
  requirements.sourceRefs = canonicalize(sourceRefs, "sourceRefs");
  return canonicalize(requirements);
}
