import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";

export class MadrConformanceError extends Error {
  constructor(message, code = "DR4880") {
    super(`MADR conformance: ${message}`);
    this.name = "MadrConformanceError";
    this.code = code;
  }
}

const fail = (message) => {
  throw new MadrConformanceError(message);
};
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const VERSION = /^\d+\.\d+\.\d+$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const REQUIRED_HEADINGS = Object.freeze([
  "Context and Problem Statement",
  "Decision Drivers",
  "Considered Options",
  "Decision Outcome",
]);

function containsSingleLinePlaceholder(text) {
  let state = "outside";
  for (const character of text) {
    if (character === "\n") {
      state = "outside";
    } else if (character === "{") {
      state = "opened";
    } else if (character === "}") {
      if (state === "content") return true;
      state = "outside";
    } else if (state === "opened") {
      state = "content";
    }
  }
  return false;
}

function exactTemplate(template) {
  if (
    !template ||
    !VERSION.test(template.version ?? "") ||
    !DIGEST.test(template.digest ?? "") ||
    !COMMIT.test(template.sourceCommit ?? "") ||
    template.repository !== "https://github.com/adr/madr"
  ) {
    fail("an exact official template identity is required");
  }
  return structuredClone(template);
}

export function validateMadrDocument({ documentId, bytes, template }) {
  if (typeof documentId !== "string" || !documentId) fail("documentId is required");
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) fail("document bytes are required");
  const raw = Buffer.from(bytes);
  const text = raw.toString("utf8");
  if (Buffer.from(text, "utf8").compare(raw) !== 0) fail("document is not canonical UTF-8");
  if (text.includes("\r")) fail("document must use LF line endings");
  const title = text.match(/^# ([^\n]+)$/mu)?.[1]?.trim();
  if (!title || containsSingleLinePlaceholder(title)) fail("document title is missing or unresolved");
  const headings = [...text.matchAll(/^## ([^\n]+)$/gmu)].map((match) => match[1].trim());
  const missing = REQUIRED_HEADINGS.filter((heading) => !headings.includes(heading));
  if (missing.length) fail(`required MADR headings are absent: ${missing.join(", ")}`);
  if (!/^Chosen option: "[^"\n]+", because .+$/mu.test(text)) fail("Decision Outcome must state a chosen option and rationale");
  if (!/^### Consequences$/mu.test(text)) fail("Consequences subsection is required");
  if (!/^\* Good, because .+$/mu.test(text) || !/^\* Bad, because .+$/mu.test(text)) {
    fail("Consequences must include explicit good and bad outcomes");
  }
  if (containsSingleLinePlaceholder(text)) fail("document contains unresolved MADR placeholders");
  const templateIdentity = exactTemplate(template);
  const material = {
    documentId,
    documentDigest: sha256Digest(raw),
    title,
    template: templateIdentity,
    requiredHeadings: [...REQUIRED_HEADINGS],
    outcome: "conformant",
    validator: "devrelay.madr-4-conformance/v1",
  };
  return Object.freeze({
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "MadrConformanceProof",
    proofId: `MCP-${canonicalJsonDigest(material).slice(7, 23).toUpperCase()}`,
    ...material,
    proofDigest: canonicalJsonDigest(material),
  });
}

