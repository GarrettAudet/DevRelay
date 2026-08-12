import { resolve } from "node:path";

import { createChatGptDesktopLifecycleController } from "./chatgpt-desktop-lifecycle-controller.mjs";
import { createChatGptDesktopRunStore } from "./chatgpt-desktop-run-store.mjs";

export const CHATGPT_DESKTOP_RUN_ROOT_ENV = "DEVRELAY_DESKTOP_RUN_ROOT";

export function createChatGptDesktopCoreCommandAdapter({ runRoot } = {}) {
  if (typeof runRoot !== "string" || runRoot.trim().length === 0) {
    throw new TypeError(`${CHATGPT_DESKTOP_RUN_ROOT_ENV} must identify the configured local run root`);
  }
  const runStore = createChatGptDesktopRunStore({ rootPath: resolve(runRoot) });
  const controller = createChatGptDesktopLifecycleController({
    runStore,
    loadArtifact: async (ref) => runStore.getArtifact(ref),
    resolveCapabilities: async ({ stage }) => ({
      outcome: "unable-to-proceed",
      diagnostic: `No production stage binding is configured for ${stage.id}.`,
    }),
    executeStage: async () => {
      throw new Error("A lifecycle stage cannot execute without a configured production binding.");
    },
  });
  return Object.freeze({ executeDesktopCommand: controller.execute });
}
