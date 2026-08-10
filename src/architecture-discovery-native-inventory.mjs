import { canonicalJsonDigest, sha256Digest } from "./content-digest.mjs";
import { validateArchitectureDiscoveryArtifact } from "./architecture-discovery-artifact-validator.mjs";

export class NativeArchitectureInventoryError extends Error {
  constructor(message) {
    super(`native architecture inventory is invalid: ${message}`);
    this.name = "NativeArchitectureInventoryError";
    this.code = "DR4312";
  }
}

const fail = (message) => { throw new NativeArchitectureInventoryError(message); };
const slash = (value) => value.replaceAll("\\", "/");
const ordered = (values) => [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
const idPart = (value) => value.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 180);
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const artifactDigest = (value, field) => canonicalJsonDigest(Object.fromEntries(Object.entries(value).filter(([key]) => !["apiVersion", "kind", field].includes(key))));

const languages = new Map([
  [".js", "JavaScript"], [".jsx", "JavaScript"], [".mjs", "JavaScript"], [".cjs", "JavaScript"],
  [".ts", "TypeScript"], [".tsx", "TypeScript"], [".py", "Python"], [".java", "Java"],
  [".cs", "C#"], [".fs", "F#"], [".vb", "Visual Basic .NET"], [".go", "Go"], [".rs", "Rust"],
]);
const manifestNames = new Set(["package.json", "pyproject.toml", "requirements.txt", "pom.xml", "build.gradle", "build.gradle.kts", "cargo.toml", "go.mod"]);
const manifestExtensions = new Set([".csproj", ".fsproj", ".vbproj", ".sln"]);
const extension = (path) => { const name=path.slice(path.lastIndexOf("/")+1); const index=name.lastIndexOf("."); return index < 0 ? "" : name.slice(index).toLowerCase(); };
const basename = (path) => path.slice(path.lastIndexOf("/") + 1);

function sourceRef(invocation, file) {
  return {
    artifact: {
      artifactId: `native-source-${idPart(file.path)}-${file.digest.slice(7, 19)}`,
      digest: file.digest,
      schema: "https://devrelay.dev/evidence/repository-file/v1",
      mediaType: "application/octet-stream",
      uri: `artifact://repository/${encodeURIComponent(invocation.repositorySnapshot.artifactId)}/${file.path.split("/").map(encodeURIComponent).join("/")}`,
    },
    location: { path: file.path },
  };
}

function finding(invocation, file, category, subject, statement, suffix = statement) {
  return {
    id: `NATIVE-${category.toUpperCase()}-${idPart(file.path)}-${canonicalJsonDigest({ file:file.path, category, suffix }).slice(7, 19)}`,
    category, subject:idPart(subject), statement,
    confidence: { disposition:"observed", score:1, rationale:"Observed directly in an exact privacy-guarded repository file." },
    method:"native-inventory", adapter:invocation.adapter, sources:[sourceRef(invocation, file)],
  };
}

function parseJson(text, path) {
  try { return JSON.parse(text); } catch { fail(`${path} is declared JSON but is not valid JSON`); }
}

function inventoryFile(invocation, file) {
  const results=[];
  const ext=extension(file.path), name=basename(file.path).toLowerCase();
  const language=languages.get(ext);
  if (language) results.push(finding(invocation,file,"language",`language:${language}`,`${file.path} is implemented in ${language}.`,language));
  if (manifestNames.has(name) || manifestExtensions.has(ext)) results.push(finding(invocation,file,"manifest",`manifest:${file.path}`,`${file.path} is a repository manifest.`));

  if (name === "package.json") {
    const value=parseJson(file.text,file.path);
    if (typeof value.name === "string" && value.name) results.push(finding(invocation,file,"package",`package:${value.name}`,`${file.path} declares package ${value.name}.`,value.name));
    const entries=[];
    if (typeof value.main === "string") entries.push(value.main);
    if (typeof value.module === "string") entries.push(value.module);
    if (typeof value.bin === "string") entries.push(value.bin);
    else if (value.bin && typeof value.bin === "object") entries.push(...Object.values(value.bin).filter(v=>typeof v === "string"));
    for (const entry of ordered(new Set(entries))) results.push(finding(invocation,file,"interface",`entry-point:${entry}`,`${file.path} declares entry point ${entry}.`,entry));
  }
  if (name === "pyproject.toml") {
    const match=file.text.match(/^name\s*=\s*["']([^"']+)["']/m);
    if (match) results.push(finding(invocation,file,"package",`package:${match[1]}`,`${file.path} declares package ${match[1]}.`,match[1]));
  }
  if ([".csproj",".fsproj",".vbproj"].includes(ext)) {
    const match=file.text.match(/<(?:AssemblyName|PackageId)>([^<]+)<\//);
    const packageName=match?.[1] ?? basename(file.path).slice(0,-ext.length);
    results.push(finding(invocation,file,"package",`package:${packageName}`,`${file.path} declares .NET project ${packageName}.`,packageName));
  }
  if (name === "pom.xml") {
    const match=file.text.match(/<artifactId>([^<]+)<\/artifactId>/);
    if (match) results.push(finding(invocation,file,"package",`package:${match[1]}`,`${file.path} declares Maven artifact ${match[1]}.`,match[1]));
  }

  const conventional=/^(?:index|main|app|program|startup)\.(?:[cm]?[jt]sx?|py|java|cs)$/i;
  if (conventional.test(basename(file.path))) results.push(finding(invocation,file,"interface",`entry-point:${file.path}`,`${file.path} is a conventional executable or module entry point.`));

  const patterns = language === "Python"
    ? [[/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/gm,"function"],[/^\s*class\s+([A-Za-z_]\w*)/gm,"class"]]
    : language === "Java" || language === "C#"
      ? [[/\b(?:public\s+)?(?:class|interface|record|enum)\s+([A-Za-z_]\w*)/g,"type"]]
      : language === "JavaScript" || language === "TypeScript"
        ? [[/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,"export"]]
        : [];
  for (const [pattern,kind] of patterns) for (const match of file.text.matchAll(pattern)) results.push(finding(invocation,file,"interface",`interface:${file.path}:${match[1]}`,`${file.path} exposes observed ${kind} ${match[1]}.`,match[1]));

  const relationships=[];
  if (language === "JavaScript" || language === "TypeScript") {
    for (const match of file.text.matchAll(/\b(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) relationships.push(match[1]);
    for (const match of file.text.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) relationships.push(match[1]);
  } else if (language === "Python") for (const match of file.text.matchAll(/^\s*(?:from|import)\s+([A-Za-z_][\w.]*)/gm)) relationships.push(match[1]);
  else if (language === "Java") for (const match of file.text.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)/gm)) relationships.push(match[1]);
  else if (language === "C#") for (const match of file.text.matchAll(/^\s*using\s+([\w.]+)/gm)) relationships.push(match[1]);
  for (const target of ordered(new Set(relationships))) results.push(finding(invocation,file,"relationship",`relationship:${file.path}:${target}`,`${file.path} references ${target}.`,target));
  return results;
}

export function createNativeArchitectureInventory({ invocation, files } = {}) {
  try { validateArchitectureDiscoveryArtifact(invocation); } catch (error) { fail(error.message); }
  if (invocation.kind !== "RepositoryInventoryInvocation") fail("invocation must be RepositoryInventoryInvocation");
  if (!Array.isArray(files)) fail("exact bounded files are required");
  const allowed=ordered(invocation.allowedPaths.map(slash));
  if (new Set(allowed).size !== allowed.length || allowed.some((path,index)=>path !== invocation.allowedPaths[index])) fail("allowedPaths must be normalized and sorted by the privacy guard");
  const seen=new Set();
  const prepared=files.map((input) => {
    const path=slash(input?.path ?? "");
    if (!allowed.includes(path) || seen.has(path)) fail(`${path || "file"} is outside or duplicates the exact allowed scope`);
    seen.add(path);
    if (!Buffer.isBuffer(input.bytes)) fail(`${path} requires exact bytes`);
    let text; try { text=textDecoder.decode(input.bytes); } catch { fail(`${path} is not UTF-8 text`); }
    return { path, text, digest:sha256Digest(input.bytes) };
  });
  if (seen.size !== allowed.length) fail("files do not cover the exact allowed scope");
  prepared.sort((a,b)=>a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const findings=prepared.flatMap(file=>inventoryFile(invocation,file)).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const nativeEvidence=prepared.map(file=>sourceRef(invocation,file).artifact);
  if (nativeEvidence.length === 0) nativeEvidence.push({ artifactId:`native-empty-${invocation.repositorySnapshot.artifactId}`, digest:canonicalJsonDigest({repositorySnapshot:invocation.repositorySnapshot,allowedPaths:allowed}), schema:"https://devrelay.dev/evidence/native-empty-inventory/v1", mediaType:"application/json", uri:`artifact://repository/${encodeURIComponent(invocation.repositorySnapshot.artifactId)}/empty-inventory` });
  const result={ apiVersion:"devrelay.dev/v1alpha1", kind:"NativeRepositoryInventory", invocationId:invocation.invocationId, invocationFingerprint:invocation.invocationFingerprint, repositorySnapshot:invocation.repositorySnapshot, adapter:invocation.adapter, status:"completed", findings, nativeEvidence };
  result.inventoryDigest=artifactDigest(result,"inventoryDigest");
  return validateArchitectureDiscoveryArtifact(result,{invocation});
}

export const runNativeArchitectureInventory = createNativeArchitectureInventory;
