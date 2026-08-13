import { readFile } from "node:fs/promises";

export const goal = Object.freeze(JSON.parse(await readFile(new URL("goal.json", import.meta.url), "utf8")));
export const projectContext = Object.freeze(JSON.parse(await readFile(new URL("project-context.json", import.meta.url), "utf8")));

export const questions = Object.freeze([
  Object.freeze({
    id: "Q-OSS-DISTRIBUTION-001",
    prompt: "Should V0.10 be published to the public npm registry, or distributed only as GitHub source plus an installable release tarball?",
    rationale: "The distribution channel changes package metadata, release automation, credentials, provenance, and what BusinessAcceptance may claim.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Use GitHub source and an installable release tarball only; do not publish to the public npm registry (recommended)",
      "Publish both a GitHub release and a public npm package",
    ],
  }),
  Object.freeze({
    id: "Q-OSS-SECURITY-CONTACT-001",
    prompt: "Which public contact should SECURITY.md and the Code of Conduct use for private reports?",
    rationale: "A public open-source project needs a real reporting path and must not invent or publish an unapproved address.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "garrett.audet@gmail.com",
      "Use the GitHub owner profile without publishing an email address",
    ],
  }),
  Object.freeze({
    id: "Q-OSS-DEFAULT-BRANCH-001",
    prompt: "Should main become the protected default branch for the public open-source preview?",
    rationale: "The release promotion boundary depends on a stable default branch and enforceable protection against unverified direct changes.",
    blocking: true,
    responseType: "single-choice",
    options: [
      "Use main as the protected default branch (recommended)",
      "Keep the current release branch as the default without protection",
    ],
  }),
]);
