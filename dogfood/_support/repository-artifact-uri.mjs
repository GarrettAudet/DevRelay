import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEME_PREFIX = "devrelay://repository/";
const APPROVED_LEGACY_ROOTS = Object.freeze([
  "C:/repos/DevRelay",
  "C:/tmp/DevRelay-v04-work-dependency-analysis",
]);

export function repositoryArtifactUri(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new TypeError("repository artifact path must be a non-empty string");
  }
  if (relativePath.includes("\\") || relativePath.includes("?") || relativePath.includes("#")) {
    throw new Error("repository artifact path must use plain forward-slash segments");
  }
  if (relativePath.startsWith("/") || /^[A-Za-z]:/.test(relativePath)) {
    throw new Error("repository artifact path must be relative");
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("repository artifact path contains an empty or dot segment");
  }
  return `${SCHEME_PREFIX}${segments.map(encodeURIComponent).join("/")}`;
}

export function repositoryArtifactUriFromUrl(repositoryRootUrl, artifactUrl) {
  const rootPath = path.resolve(fileURLToPath(repositoryRootUrl));
  const artifactPath = path.resolve(fileURLToPath(artifactUrl));
  const relativePath = path.relative(rootPath, artifactPath);
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("artifact URL is outside the repository contract");
  }
  return repositoryArtifactUri(relativePath.split(path.sep).join("/"));
}

export function normalizeRepositoryArtifactUri(
  uri,
  { legacyRepositoryRoots = APPROVED_LEGACY_ROOTS } = {},
) {
  if (typeof uri !== "string") throw new TypeError("artifact URI must be a string");
  if (uri.startsWith(SCHEME_PREFIX)) {
    return repositoryArtifactUri(decodeURIComponent(uri.slice(SCHEME_PREFIX.length)));
  }
  if (!uri.startsWith("file:///")) return uri;
  const localPath = decodeURIComponent(new URL(uri).pathname)
    .replace(/^\/([A-Za-z]:\/)/, "$1")
    .replaceAll("\\", "/")
    .replace(/\/$/, "");
  const approvedRoot = legacyRepositoryRoots
    .map((root) => root.replaceAll("\\", "/").replace(/\/$/, ""))
    .find((root) =>
      localPath.toLowerCase().startsWith(`${root.toLowerCase()}/`),
    );
  if (!approvedRoot) throw new Error(`local artifact URI is not repository-owned: ${uri}`);
  return repositoryArtifactUri(localPath.slice(approvedRoot.length + 1));
}

export function normalizeRepositoryArtifactUris(value) {
  const normalized = structuredClone(value);
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (key === "uri" && typeof child === "string") {
        node[key] = normalizeRepositoryArtifactUri(child);
      } else {
        visit(child);
      }
    }
  };
  visit(normalized);
  return normalized;
}

export function assertLoadedJsonValueFidelity(bytes, value) {
  const parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  if (JSON.stringify(parsed) !== JSON.stringify(value)) {
    throw new Error("loaded artifact value differs from its exact raw JSON bytes");
  }
}
