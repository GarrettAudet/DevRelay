import { canonicalJsonDigest } from "./content-digest.mjs";

export class DesktopReviewPolicyError extends Error {
  constructor(message, code = "DR6100") {
    super(`desktop review policy: ${message}`);
    this.name = "DesktopReviewPolicyError";
    this.code = code;
  }
}

const fail = (message, code) => { throw new DesktopReviewPolicyError(message, code); };
const RISK_CLASSES = Object.freeze(["low", "standard", "high", "critical"]);
const ADVERSARIAL_TAGS = Object.freeze(["cross-cutting", "integration", "migration", "release", "security"]);

export const DESKTOP_REVIEW_POLICY_VERSION = "1.0.0";

export function resolveDesktopReviewRequirement({ workItemId, risk = "standard", tags = [], policyVersion = DESKTOP_REVIEW_POLICY_VERSION } = {}) {
  if (typeof workItemId !== "string" || !workItemId) fail("workItemId is required");
  if (policyVersion !== DESKTOP_REVIEW_POLICY_VERSION) fail("unsupported or drifted policy version", "DR6101");
  if (!RISK_CLASSES.includes(risk)) fail("risk classification is invalid");
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string" || !tag)) fail("tags are invalid");
  const normalizedTags = [...new Set(tags)].sort();
  const matchedTags = normalizedTags.filter((tag) => ADVERSARIAL_TAGS.includes(tag));
  const adversarialRequired = risk === "high" || risk === "critical" || matchedTags.length > 0;
  const body = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "AdversarialReviewRequirement",
    workItemId,
    policy: { id: "desktop-review", version: policyVersion },
    risk,
    tags: normalizedTags,
    requiredEvidence: ["test" , "review", ...(adversarialRequired ? ["adversarial-review"] : [])],
    adversarialRequired,
    rationale: adversarialRequired
      ? `Independent adversarial review is required by ${risk} risk${matchedTags.length ? ` and tags ${matchedTags.join(", ")}` : ""}.`
      : "Standard independent review and tests are sufficient under the current policy.",
  };
  return Object.freeze({ ...body, requirementDigest: canonicalJsonDigest(body) });
}

export function evaluateDesktopMergeReadiness({
  requirement,
  implementerTaskId,
  testDisposition,
  reviewDisposition,
  adversarialReview,
  targetDrift = false,
  conflicts = [],
} = {}) {
  if (requirement?.kind !== "AdversarialReviewRequirement") fail("validated review requirement is required", "DR6102");
  if (canonicalJsonDigest(Object.fromEntries(Object.entries(requirement).filter(([key]) => key !== "requirementDigest"))) !== requirement.requirementDigest) {
    fail("review requirement digest drifted", "DR6102");
  }
  const blockers = [];
  if (testDisposition !== "pass") blockers.push(`test:${testDisposition ?? "missing"}`);
  if (reviewDisposition !== "pass") blockers.push(`review:${reviewDisposition ?? "missing"}`);
  if (requirement.adversarialRequired) {
    if (!adversarialReview) blockers.push("adversarial-review:missing");
    else {
      if (adversarialReview.reviewerTaskId === implementerTaskId) blockers.push("adversarial-review:self-review");
      if (adversarialReview.subjectDigest !== requirement.subjectDigest && requirement.subjectDigest !== undefined) blockers.push("adversarial-review:subject-drift");
      if (adversarialReview.disposition !== "pass") blockers.push(`adversarial-review:${adversarialReview.disposition ?? "invalid"}`);
    }
  }
  if (targetDrift) blockers.push("target:drifted");
  if (!Array.isArray(conflicts)) fail("conflicts must be an array", "DR6102");
  if (conflicts.length) blockers.push("integration:conflict-owner-review-required");
  const body = {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "DesktopMergeReadiness",
    workItemId: requirement.workItemId,
    requirementDigest: requirement.requirementDigest,
    outcome: blockers.length ? "blocked" : "merge-ready",
    blockers: [...new Set(blockers)].sort(),
    conflictDisposition: conflicts.length ? "owner-review-required" : "none",
  };
  return Object.freeze({ ...body, readinessDigest: canonicalJsonDigest(body) });
}
