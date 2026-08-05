import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, "..");
const lockPath = path.join(scriptDirectory, "structurizr-toolchain-lock.json");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

async function assertDigest(filePath, expectedDigest, label) {
  const actualDigest = await sha256File(filePath);
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `${label} checksum mismatch: expected ${expectedDigest}, received ${actualDigest}`,
    );
  }
  return actualDigest;
}

async function downloadPinned(url, destination, expectedDigest, label) {
  await mkdir(path.dirname(destination), { recursive: true });
  if (await exists(destination)) {
    try {
      await assertDigest(destination, expectedDigest, label);
      return destination;
    } catch {
      await rm(destination, { force: true });
    }
  }

  const partial = `${destination}.partial`;
  await rm(partial, { force: true });
  const response = await fetch(url, {
    headers: { "user-agent": "DevRelay-Structurizr-conformance" },
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `${label} download failed with HTTP ${response.status}`,
    );
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  await assertDigest(partial, expectedDigest, label);
  await rename(partial, destination);
  return destination;
}

function assertJava21(javaPath) {
  const result = spawnSync(javaPath, ["-version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0 || !/version "21\./.test(output)) {
    throw new Error(
      `Structurizr conformance requires Java 21; ${javaPath} reported: ${output.trim()}`,
    );
  }
}

async function ensurePinnedJava(rootPath, lock) {
  const override = process.env.DEVRELAY_JAVA;
  if (override) {
    const javaPath = path.resolve(override);
    assertJava21(javaPath);
    return javaPath;
  }
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error(
      "Set DEVRELAY_JAVA to a Java 21 executable on non-Windows-x64 hosts.",
    );
  }

  const archivePath = path.resolve(rootPath, lock.java.cachePath);
  const javaPath = path.resolve(rootPath, lock.java.executablePath);
  await downloadPinned(
    lock.java.url,
    archivePath,
    lock.java.sha256,
    "Temurin Java runtime",
  );
  if (!(await exists(javaPath))) {
    await mkdir(path.dirname(javaPath), { recursive: true });
    const extractionRoot = path.dirname(
      path.dirname(path.dirname(javaPath)),
    );
    await mkdir(extractionRoot, { recursive: true });
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
        archivePath,
        extractionRoot,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    if (result.status !== 0) {
      throw new Error(
        `Temurin extraction failed: ${result.stderr || result.stdout}`,
      );
    }
  }
  assertJava21(javaPath);
  return javaPath;
}

export async function ensureStructurizrToolchain({
  rootPath = defaultRoot,
} = {}) {
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const warOverride = process.env.DEVRELAY_STRUCTURIZR_WAR;
  const warPath = warOverride
    ? path.resolve(warOverride)
    : path.resolve(rootPath, lock.structurizr.cachePath);
  if (warOverride) {
    await assertDigest(
      warPath,
      lock.structurizr.sha256,
      "Structurizr WAR",
    );
  } else {
    await downloadPinned(
      lock.structurizr.url,
      warPath,
      lock.structurizr.sha256,
      "Structurizr WAR",
    );
  }
  const javaPath = await ensurePinnedJava(rootPath, lock);
  return Object.freeze({
    javaPath,
    warPath,
    lock,
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const toolchain = await ensureStructurizrToolchain();
  console.log(
    JSON.stringify(
      {
        status: "ready",
        structurizrVersion: toolchain.lock.structurizr.version,
        structurizrSha256: toolchain.lock.structurizr.sha256,
        javaVersion: toolchain.lock.java.version,
        javaSha256: toolchain.lock.java.sha256,
      },
      null,
      2,
    ),
  );
}
