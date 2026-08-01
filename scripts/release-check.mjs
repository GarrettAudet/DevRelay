import {
  runPackageCheck,
  runReleaseManifestCheck,
  runVerification,
} from "./release-tools.mjs";

try {
  runVerification();
  runReleaseManifestCheck();
  runPackageCheck();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
