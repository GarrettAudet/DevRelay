import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { canonicalJson, canonicalJsonDigest } from "./content-digest.mjs";
import { validateChangeIntegrationArtifact } from "./change-integration-artifact-validator.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_OUTPUT_LIMIT = 1024 * 1024;
const DEFAULT_ADAPTER = Object.freeze({ id: "local-git-integration", version: "0.1.0" });

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function bytesOf(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError("native evidence bytes must be a string or Uint8Array");
}

function sameBytes(left, right) {
  const a = bytesOf(left); const b = bytesOf(right);
  return a.length === b.length && a.equals(b);
}

function observation(ref, commit, tree) {
  return { ref, commit, treeDigest: canonicalJsonDigest({ commit, tree }) };
}

function baseResult(invocation, preState, nativeEvidence) {
  return {
    apiVersion: "devrelay.dev/v1alpha1",
    kind: "RawIntegrationEffectResult",
    invocationId: invocation.invocationId,
    invocationFingerprint: invocation.invocationFingerprint,
    adapter: structuredClone(invocation.adapter),
    operation: structuredClone(invocation.operation),
    preState,
    nativeEvidence,
  };
}

function boundedText(value, maxOutputBytes) {
  const bytes = Buffer.from(typeof value === "string" ? value : "", "utf8");
  return bytes.subarray(0, maxOutputBytes).toString("utf8");
}

function commandRecord(executable, args, result, maxOutputBytes) {
  return {
    executable,
    args: [...args],
    exitCode: result.exitCode,
    signal: result.signal ?? null,
    timedOut: result.timedOut === true,
    stdoutDigest: canonicalJsonDigest(boundedText(result.stdout, maxOutputBytes)),
    stderrDigest: canonicalJsonDigest(boundedText(result.stderr, maxOutputBytes)),
  };
}

function processFailure(error) {
  return {
    exitCode: Number.isInteger(error?.code) ? error.code : null,
    signal: error?.signal ?? null,
    stdout: typeof error?.stdout === "string" ? error.stdout : "",
    stderr: typeof error?.stderr === "string" ? error.stderr : String(error?.message ?? error),
    timedOut: error?.code === "ETIMEDOUT" || error?.killed === true,
  };
}

export function localGitIntegrationConfiguration({
  repositoryPath,
  gitExecutable = "git",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_OUTPUT_LIMIT,
} = {}) {
  if (typeof repositoryPath !== "string" || !isAbsolute(repositoryPath)) throw new TypeError("repositoryPath must be an absolute local path");
  if (typeof gitExecutable !== "string" || gitExecutable.length === 0) throw new TypeError("gitExecutable must be a non-empty string");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new TypeError("timeoutMs must be an integer from 1 through 300000");
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1024 || maxOutputBytes > 16 * 1024 * 1024) throw new TypeError("maxOutputBytes must be an integer from 1024 through 16777216");
  return freeze({ repositoryPath, gitExecutable, timeoutMs, maxOutputBytes });
}

export function localGitIntegrationConfigurationDigest(configuration) {
  return canonicalJsonDigest(localGitIntegrationConfiguration(configuration));
}

/**
 * Creates the V1 bounded local-Git integration port implementation. The host
 * supplies one absolute repository path; the invocation supplies every piece
 * of semantic authority, including ref, commits, strategy, and adapter ID.
 */
export function createLocalGitIntegrationAdapter({
  repositoryPath,
  gitExecutable = "git",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_OUTPUT_LIMIT,
  expectedAdapter = DEFAULT_ADAPTER,
  spawnGit,
  persistNativeEvidence,
  readNativeEvidence,
  temporaryRoot = tmpdir(),
  removeWorkDirectory = rm,
} = {}) {
  const configuration = localGitIntegrationConfiguration({ repositoryPath, gitExecutable, timeoutMs, maxOutputBytes });
  const configurationDigest = canonicalJsonDigest(configuration);
  if (typeof persistNativeEvidence !== "function" || typeof readNativeEvidence !== "function") throw new TypeError("persistNativeEvidence and readNativeEvidence callbacks are required");
  if (typeof removeWorkDirectory !== "function") throw new TypeError("removeWorkDirectory must be a function");

  const invokeGit = spawnGit ?? (async (args) => {
    try {
      const { stdout, stderr } = await execFileAsync(gitExecutable, args, {
        encoding: "utf8",
        maxBuffer: maxOutputBytes,
        timeout: timeoutMs,
        killSignal: "SIGTERM",
        windowsHide: true,
      });
      return { exitCode: 0, signal: null, stdout, stderr };
    } catch (error) {
      return processFailure(error);
    }
  });

  return async function localGitIntegrationAdapter(invocation, runtimeAuthorization) {
    validateChangeIntegrationArtifact(invocation);
    if (invocation.adapter.id !== expectedAdapter.id || invocation.adapter.version !== expectedAdapter.version || invocation.adapter.configurationDigest !== configurationDigest) {
      throw new Error("local Git adapter identity does not match the configured binding");
    }

    const transition = invocation.operation.transition;
    if (!runtimeAuthorization || runtimeAuthorization.invocationFingerprint !== invocation.invocationFingerprint || runtimeAuthorization.targetRef !== transition.targetRef || runtimeAuthorization.expectedTargetCommit !== transition.expectedTargetCommit) {
      throw new Error("exact Core TARGET-CAS runtime authorization is required");
    }

    const commands = [];
    let effectAttempted = false;
    let preState;
    let workDirectory;

    const git = async (args) => {
      if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) throw new TypeError("Git arguments must be a string array");
      let result;
      try {
        result = await invokeGit(Object.freeze([...args]), freeze({ timeoutMs, maxOutputBytes }));
      } catch (error) {
        result = processFailure(error);
      }
      const normalized = {
        exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : null,
        signal: result?.signal ?? null,
        stdout: boundedText(result?.stdout, maxOutputBytes),
        stderr: boundedText(result?.stderr, maxOutputBytes),
        timedOut: result?.timedOut === true,
      };
      commands.push(commandRecord(gitExecutable, args, normalized, maxOutputBytes));
      return normalized;
    };
    const ok = async (args) => {
      const result = await git(args);
      if (result.exitCode !== 0 || result.timedOut || result.signal) throw Object.assign(new Error(result.stderr || `git exited ${result.exitCode}`), { gitResult: result });
      return result.stdout.trim();
    };

    const persistEvidence = async () => {
      const material = { apiVersion: "devrelay.dev/v1alpha1", kind: "LocalGitNativeEvidence", invocationId: invocation.invocationId, invocationFingerprint: invocation.invocationFingerprint, commands };
      const bytes = Buffer.from(canonicalJson(material), "utf8");
      const expectedDigest = canonicalJsonDigest(material);
      const ref = await persistNativeEvidence(bytes, freeze({ invocationId: invocation.invocationId, invocationFingerprint: invocation.invocationFingerprint, mediaType: "application/vnd.devrelay.local-git-native-evidence+json" }));
      if (!ref || typeof ref !== "object" || typeof ref.artifactId !== "string" || ref.artifactId.length === 0 || ref.digest !== expectedDigest) throw new Error("native evidence store returned an invalid or digest-mismatched ArtifactRef");
      const persisted = await readNativeEvidence(freeze(structuredClone(ref)));
      if (!sameBytes(persisted, bytes)) throw new Error("persisted native evidence bytes do not match the cited ArtifactRef");
      return freeze(structuredClone(ref));
    };

    try {
      const liveCommit = await ok(["-C", repositoryPath, "rev-parse", "--verify", transition.targetRef]);
      const liveTree = await ok(["-C", repositoryPath, "rev-parse", `${liveCommit}^{tree}`]);
      preState = observation(transition.targetRef, liveCommit, liveTree);
      if (liveCommit !== transition.expectedTargetCommit) {
        throw new Error("target ref no longer equals the authorized expected commit");
      }
      await ok(["-C", repositoryPath, "cat-file", "-e", `${transition.sourceCommit}^{commit}`]);

      workDirectory = await mkdtemp(join(temporaryRoot, "devrelay-local-git-"));
      const candidateRepository = join(workDirectory, "candidate.git");
      await ok(["clone", "--no-checkout", "--shared", "--", repositoryPath, candidateRepository]);
      await ok(["-C", candidateRepository, "checkout", "--detach", transition.expectedTargetCommit]);

      let candidateCommit;
      if (transition.strategy === "fast-forward") {
        const ancestry = await git(["-C", candidateRepository, "merge-base", "--is-ancestor", transition.expectedTargetCommit, transition.sourceCommit]);
        if (ancestry.exitCode !== 0) throw new Error("source commit is not a fast-forward of the expected target");
        candidateCommit = transition.sourceCommit;
      } else {
        const operationArgs = transition.strategy === "merge-commit"
          ? ["-C", candidateRepository, "-c", "user.name=DevRelay", "-c", "user.email=devrelay@invalid", "merge", "--no-ff", "--no-edit", transition.sourceCommit]
          : ["-C", candidateRepository, "-c", "user.name=DevRelay", "-c", "user.email=devrelay@invalid", "cherry-pick", "--no-edit", transition.sourceCommit];
        const operation = await git(operationArgs);
        if (operation.exitCode !== 0) {
          const conflicts = (await git(["-C", candidateRepository, "diff", "--name-only", "--diff-filter=U", "-z"])).stdout
            .split("\0").filter(Boolean).sort();
          await git(["-C", candidateRepository, transition.strategy === "merge-commit" ? "merge" : "cherry-pick", "--abort"]);
          if (conflicts.length > 0) {
            const nativeEvidence = [await persistEvidence()];
            const result = { ...baseResult(invocation, preState, nativeEvidence), terminalState: "conflict", effectState: "not-applied", conflictingPaths: conflicts };
            validateChangeIntegrationArtifact(result, { invocation });
            return freeze(result);
          }
          throw new Error(operation.stderr || `${transition.strategy} preparation failed`);
        }
        candidateCommit = await ok(["-C", candidateRepository, "rev-parse", "HEAD"]);
      }

      await ok(["-C", repositoryPath, "fetch", "--no-tags", "--no-write-fetch-head", "--", candidateRepository, candidateCommit]);
      effectAttempted = true;
      const update = await git(["-C", repositoryPath, "update-ref", transition.targetRef, candidateCommit, transition.expectedTargetCommit]);
      if (update.exitCode !== 0) throw new Error(update.stderr || "atomic target update was rejected");

      const postCommit = await ok(["-C", repositoryPath, "rev-parse", "--verify", transition.targetRef]);
      const postTree = await ok(["-C", repositoryPath, "rev-parse", `${postCommit}^{tree}`]);
      const nativeEvidence = [await persistEvidence()];
      const result = { ...baseResult(invocation, preState, nativeEvidence), terminalState: "integrated", effectState: "applied", postState: observation(transition.targetRef, postCommit, postTree) };
      validateChangeIntegrationArtifact(result, { invocation });
      return freeze(result);
    } catch (error) {
      const nativeEvidence = [await persistEvidence()];
      if (!preState) {
        const failure = new Error(`initial target pre-state was not fully observed: ${error instanceof Error ? error.message : String(error)}`);
        failure.nativeEvidence = nativeEvidence;
        throw failure;
      }
      const interrupted = error?.gitResult?.signal !== null && error?.gitResult?.signal !== undefined;
      const result = {
        ...baseResult(invocation, preState, nativeEvidence),
        terminalState: interrupted || error?.gitResult?.timedOut ? "interrupted" : effectAttempted ? "uncertain" : "failed",
        effectState: effectAttempted ? "unknown" : "not-applied",
      };
      validateChangeIntegrationArtifact(result, { invocation });
      return freeze(result);
    } finally {
      if (workDirectory) {
        try {
          await removeWorkDirectory(workDirectory, {
            recursive: true,
            force: true,
            maxRetries: 8,
            retryDelay: 100,
          });
        } catch {
          // Cleanup is deliberately best-effort. An exhausted Windows file-lock
          // retry must not replace the authoritative Git effect result after
          // the target CAS has already been observed and recorded.
        }
      }
    }
  };
}

export async function executeLocalGitIntegrationAdapter({ invocation, runtimeAuthorization, ...configuration } = {}) {
  return createLocalGitIntegrationAdapter(configuration)(invocation, runtimeAuthorization);
}

export const createChangeIntegrationLocalGitAdapter = createLocalGitIntegrationAdapter;
