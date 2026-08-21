import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJsonDigest, sha256Digest } from "../../src/content-digest.mjs";
import { assessRequirementsClosure } from "../../src/requirements-interview.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
const writeJson = (name, value) => fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const input = readJson("requirements-interview-input.json");
const waveBytes = fs.readFileSync(path.join(directory, "requirements-clarification-wave-1.json"));
const wave = JSON.parse(waveBytes);
const responses = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "RequirementsClarificationResponseSet",
  responseSetId: "RCRS-EP-001-WAVE-1",
  wave: {
    waveId: wave.waveId,
    digest: sha256Digest(waveBytes),
  },
  ownerStatement: "I see, I approve all",
  responses: wave.questions.map((question) => ({
    questionId: question.id,
    answer: "approved-as-recommended",
  })),
};
responses.contentDigest = canonicalJsonDigest({
  responseSetId: responses.responseSetId,
  wave: responses.wave,
  ownerStatement: responses.ownerStatement,
  responses: responses.responses,
});
writeJson("requirements-clarification-responses-wave-1.json", responses);

const decisions = {
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "OwnerDecisionSet",
  decisionSetId: "owner-decisions-ep-001-environment-preparation-v1",
  sourceResponseSet: {
    responseSetId: responses.responseSetId,
    digest: sha256Digest(Buffer.from(`${JSON.stringify(responses, null, 2)}\n`, "utf8")),
  },
  decisions: wave.questions.map((question) => ({
    questionId: question.id,
    domainId: question.domainId,
    decision: question.prompt.replace(/ Recommended: yes\.$/, "."),
    answer: "Approve exactly as recommended",
  })),
};
decisions.contentDigest = canonicalJsonDigest({
  decisionSetId: decisions.decisionSetId,
  sourceResponseSet: decisions.sourceResponseSet,
  decisions: decisions.decisions,
});
writeJson("owner-decisions.json", decisions);

const decisionMarkdown = [
  "# EP-001 EnvironmentPreparation/Verification owner decisions",
  "",
  `Wave: \`${wave.waveId}\``,
  "",
  "The owner approved all twenty-four recommendations in the exact breadth-first clarification wave.",
  "",
  ...decisions.decisions.flatMap((decision, index) => [
    `${index + 1}. **${decision.questionId}**`,
    "",
    `   ${decision.decision}`,
    "",
  ]),
].join("\n");
fs.writeFileSync(path.join(directory, "owner-decisions.md"), `${decisionMarkdown.trimEnd()}\n`, "utf8");

const evidenceRef = `dogfood/ep-001-environment-preparation/owner-decisions.json#${decisions.contentDigest}`;
const assessment = assessRequirementsClosure({
  domains: input.domains,
  domainEvidence: input.domains.map((domain) => ({
    domainId: domain.id,
    status: "resolved",
    confidence: 1,
    evidenceRefs: [evidenceRef],
  })),
  contradictions: [],
  minimumWeightedCoverage: input.minimumWeightedCoverage,
});
writeJson("requirements-closure-assessment-approved.json", assessment);

if (assessment.outcome !== "closed" || assessment.weightedCoverage !== 1 || assessment.blockingUnknowns.length !== 0) {
  throw new Error("EP-001 requirements did not close after exact owner approval.");
}

process.stdout.write(`${JSON.stringify({
  outcome: assessment.outcome,
  weightedCoverage: assessment.weightedCoverage,
  responseSetDigest: responses.contentDigest,
  decisionSetDigest: decisions.contentDigest,
  assessmentDigest: assessment.assessmentDigest,
}, null, 2)}\n`);
