import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev project config. Replace the project ref with your own from the
 * Trigger.dev dashboard (or set TRIGGER_PROJECT_REF). Tasks live in src/trigger.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_synkcffsufkoophgdrzy",
  dirs: ["./src/trigger"],
  // Deep research can run 10-20 min; allow up to 30 min by default.
  maxDuration: 1800,
  retries: {
    default: { maxAttempts: 1 },
  },
});
