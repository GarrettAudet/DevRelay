import crypto from "node:crypto";
import fs from "node:fs";

const digest = (path) =>
  `sha256:${crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")}`;

const expected = Object.freeze({
  candidate:
    "sha256:9ee1936ae7aafd8484466024273b6fabbc342a3553687dbd903d8d82515593d6",
  gateReview:
    "sha256:663a4b8aa6984b78b2924033108ad72abdd1a0e8a36407912ea1511128c5da38",
  conformance:
    "sha256:55355080bb1b50366b10dec9b9ba82a9dadbe4fdeb2654e19feedfdefb53436c",
  approval:
    "sha256:c5b902d0087a9133beac13b07c696c2651c89cbdcb661621193bd0d553d79430",
  baseline:
    "sha256:a2bc5b38377337dbc6e86eb45821b9fab4eca4be044693944442c6c45153fa29",
  proof:
    "sha256:4b71e760cf1e8fe00e2969b69b82714f38047e87fa5ada1fd6d7d49a31789597",
});

const paths = Object.freeze({
  candidate:
    "dogfood/lifecycle-run-report/architecture-design/architecture-change-set-draft.json",
  gateReview:
    "dogfood/lifecycle-run-report/architecture-design/architecture-gate-candidate.md",
  conformance:
    "dogfood/lifecycle-run-report/architecture-design/structurizr-conformance-proof.json",
  approval:
    "dogfood/lifecycle-run-report/architecture-design/architecture-gate-owner-approval.json",
  baseline:
    "project/history/architecture/architecture-baseline-devrelay-v1-lifecycle-run-report-001/architecture-baseline.json",
  proof:
    "dogfood/lifecycle-run-report/architecture-design/architecture-gate-promotion-proof.json",
});

for (const [key, path] of Object.entries(paths)) {
  const actual = digest(path);
  if (actual !== expected[key]) {
    throw new Error(`${key} historical digest ${actual} differs from ${expected[key]}`);
  }
}

const proof = JSON.parse(fs.readFileSync(paths.proof));
process.stdout.write(
  `${JSON.stringify(
    {
      status: "ARCHITECTURE_GATE_PROMOTED",
      operation: "design-change",
      adapterCalls: ["openspec-design", "structurizr", "madr"],
      checkpointCount: 3,
      replayAdapterCalls: 0,
      architectureChangeSetDigest: expected.candidate,
      architectureGateReviewDigest: expected.gateReview,
      structurizrConformanceProofDigest: expected.conformance,
      ownerApprovalDigest: expected.approval,
      architectureBaselineDigest: expected.baseline,
      promotionProofDigest: expected.proof,
      requiredContractInterfaces: proof.requiredContractInterfaces,
      contractGenerationProgressionAllowed: true,
      workBreakdownProgressionAllowed: false,
    },
    null,
    2,
  )}\n`,
);
