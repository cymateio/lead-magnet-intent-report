import { task } from "@trigger.dev/sdk";
import { researchTask } from "./research";
import { sendReportEmail } from "../utils/mailer";
import { markRowSent } from "../integrations/sheets";
import { checkLeadWebsite } from "../utils/websiteCheck";
import { formatWebsiteNotice } from "../utils/formatter";
import { logger } from "../utils/logger";

const STEP = "lead-magnet";

/**
 * Processes ONE lead (one sheet row). Triggered by the `poll-leads` scheduler when
 * a new/unsent row appears. It runs the pure `research` engine, emails the report to
 * the lead, then flips that row's Sent column to "yes" (and records the run id).
 *
 * Research input: the website if provided, otherwise the email (the engine resolves
 * the domain from either). The email is always the delivery address.
 *
 * Edge case: if the lead supplied a website that genuinely does not exist (a typo /
 * dead domain, confirmed via a deliberately conservative DNS check), we skip the
 * research entirely and instead email a short branded notice asking for the correct
 * address. This never fires for a valid site (see checkLeadWebsite). The pure engine
 * is untouched — all of this lives in this wrapper.
 */
export const leadMagnetTask = task({
  id: "lead-magnet",
  maxDuration: 1800,
  run: async (
    payload: { email: string; website?: string; rowNumber?: number; replyTo?: string },
    { ctx }
  ) => {
    const website = payload.website && payload.website.trim() ? payload.website.trim() : "";

    // Rare edge case: a website was entered but its domain does not resolve at all.
    if (website && (await checkLeadWebsite(website)) === "unreachable") {
      logger.warn(STEP, `Website "${website}" is unreachable; sending correction notice to ${payload.email}.`);
      const notice = formatWebsiteNotice(website);
      const emailed = await sendReportEmail({
        to: payload.email,
        subject: "Quick check on the website for your signal report",
        html: notice.html,
        text: notice.text,
        replyTo: payload.replyTo,
      });
      if (emailed && payload.rowNumber) {
        await markRowSent(payload.rowNumber, ctx.run.id);
      }
      return { handled: "invalid-website", emailed, to: payload.email, website, rowNumber: payload.rowNumber };
    }

    const input = website || payload.email;

    const report = await researchTask.triggerAndWait({ input }).unwrap();

    const company = report.data.inputCompany.companyName || input;
    const emailed = await sendReportEmail({
      to: payload.email,
      subject: `Your high-intent signal report for ${company}`,
      html: report.formattedHTML,
      text: report.formattedText,
      replyTo: payload.replyTo,
    });

    // Mark the sheet row as sent once the report has gone out.
    if (emailed && payload.rowNumber) {
      await markRowSent(payload.rowNumber, ctx.run.id);
    }

    return {
      handled: "report",
      emailed,
      to: payload.email,
      company,
      companies: report.meta.totalCompanies,
      contacts: report.meta.totalContacts,
      rowNumber: payload.rowNumber,
    };
  },
});
