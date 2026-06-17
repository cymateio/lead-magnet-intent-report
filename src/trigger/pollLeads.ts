import { schedules, idempotencyKeys } from "@trigger.dev/sdk";
import { leadMagnetTask } from "./leadMagnet";
import { readLeadRows, needsProcessing } from "../integrations/sheets";
import { logger } from "../utils/logger";

const STEP = "poll-leads";

/**
 * Scheduled watcher for the founder's form-linked Google Sheet. Runs every 2 minutes:
 * any row whose "Sent" column is not "yes" (a fresh form submission) is handed to the
 * `lead-magnet` task. An idempotency key per row (with a generous TTL) prevents the
 * same row being processed twice while its ~15-min run is still in flight — so the
 * sheet only ever shows "no" → "yes" (no transient state needed).
 */
export const pollLeadsTask = schedules.task({
  id: "poll-leads",
  cron: "*/2 * * * *", // every 2 minutes
  run: async () => {
    const rows = await readLeadRows();
    const pending = rows.filter(needsProcessing);
    logger.info(STEP, `${rows.length} rows, ${pending.length} pending.`);

    let triggered = 0;
    for (const row of pending) {
      // GLOBAL scope is essential: each 2-min poll is a *separate* run of this
      // scheduled task, and a raw-string idempotencyKey defaults to "run" scope —
      // so it would be unique per poll and never dedupe, re-triggering (and re-emailing)
      // the same row on every poll while its ~15-min run is still in flight. A globally
      // scoped key collapses all those polls onto one lead-magnet run.
      const idempotencyKey = await idempotencyKeys.create(
        `lead-row-${row.rowNumber}-${row.email}`,
        { scope: "global" }
      );
      await leadMagnetTask.trigger(
        { email: row.email, website: row.website, rowNumber: row.rowNumber },
        {
          idempotencyKey,
          idempotencyKeyTTL: "1h", // > the 30-min maxDuration, so a running job keeps its key
        }
      );
      triggered++;
    }

    return { rows: rows.length, pending: pending.length, triggered };
  },
});
