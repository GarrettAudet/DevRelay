export * from "./index.mjs";
export const DEVRELAY_COMPAT_V1 = Object.freeze({
  apiVersion: "devrelay.dev/v1alpha1",
  kind: "CompatibilityWindow",
  tier: "compat/v1",
  deprecated: true,
  supportedThrough: "0.11.x-prerelease",
  removal: "next-prerelease-major",
  migration: "docs/migrations/compat-v1-to-facade.md",
});

