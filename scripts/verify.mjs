import { runVerification } from "./release-tools.mjs";

try {
  runVerification();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
