import { task } from "@trigger.dev/sdk";
import { researchTask } from "./research";
import { sendReportEmail } from "../utils/mailer";
import { markRowSent } from "../integrations/sheets";

/**
 * Processes ONE lead (one sheet row). Triggered by the `poll-leads` scheduler when
 * a new/unsent row appears. It runs the pure `research` engine, emails the report to
 * the lead, then flips that row's Sent column to "yes" (and records the run id).
 *
 * Research input: the website if provided, otherwise the email (the engine resolves
 * the domain from either). The email is always the delivery address.
 */
export const leadMagnetTask = task({
  id: "lead-magnet",
  maxDuration: 1800,
  run: async (
    payload: { email: string; website?: string; rowNumber?: number; replyTo?: string },
    { ctx }
  ) => {
    const input = payload.website && payload.website.trim() ? payload.website.trim() : payload.email;

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
      emailed,
      to: payload.email,
      company,
      companies: report.meta.totalCompanies,
      contacts: report.meta.totalContacts,
      rowNumber: payload.rowNumber,
    };
  },
});
