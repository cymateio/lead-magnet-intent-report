import { task } from "@trigger.dev/sdk";
import axios from "axios";
import { runPipeline } from "../api/pipeline";
import { logger } from "../utils/logger";
import type { ResearchResponse } from "../types";

/**
 * The PURE engine task. Given an input (domain or work email), it runs the full
 * research pipeline and returns the complete report payload. If `callbackUrl` is
 * provided, it also POSTs the payload there on completion.
 *
 * This task is intentionally side-effect-light and workflow-agnostic so any flow
 * can compose around it (trigger it + consume its output) WITHOUT editing it:
 *  - code workflows call `researchTask.triggerAndWait(...)` (see lead-magnet)
 *  - no-code tools (Make, etc.) trigger it via the API and pass a `callbackUrl`.
 */
export const researchTask = task({
  id: "research",
  maxDuration: 1800, // up to 30 min for deep research
  run: async (payload: { input: string; callbackUrl?: string }): Promise<ResearchResponse> => {
    const report = await runPipeline(payload.input);

    if (payload.callbackUrl) {
      try {
        await axios.post(
          payload.callbackUrl,
          { status: "done", ...report },
          { timeout: 30_000, headers: { "Content-Type": "application/json" } }
        );
        logger.info("research", `callbackUrl delivered -> ${payload.callbackUrl}`);
      } catch (err) {
        logger.warn("research", `callbackUrl post failed: ${(err as Error).message}`);
      }
    }

    return report;
  },
});
