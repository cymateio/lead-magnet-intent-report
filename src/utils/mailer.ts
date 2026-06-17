import nodemailer, { Transporter } from "nodemailer";
import { logger } from "./logger";
import { LOGO_PNG_BASE64 } from "./logoAsset";

const STEP = "mailer";
const LOGO_CID = "cymatelogo";

let transporter: Transporter | null = null;

/**
 * Resolve SMTP config from env. Defaults to Gmail's SMTP so a Google Workspace
 * mailbox (e.g. report@<domain>) works with just SMTP_USER + SMTP_PASS (an App
 * Password). Any other provider works by setting SMTP_HOST / SMTP_PORT.
 * Falls back to the legacy GMAIL_USER / GMAIL_APP_PASSWORD names if present.
 */
function smtpConfig() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || "";
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "";
  const from = process.env.MAIL_FROM || process.env.GMAIL_FROM || user;
  return { host, port, user, pass, from };
}

/** True when sending credentials are configured. */
export function emailConfigured(): boolean {
  const { user, pass } = smtpConfig();
  return !!(user && pass);
}

function getTransport(): Transporter {
  if (!transporter) {
    const { host, port, user, pass } = smtpConfig();
    if (!user || !pass) throw new Error("SMTP_USER / SMTP_PASS (or GMAIL_USER / GMAIL_APP_PASSWORD) not set.");
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // SSL on 465, STARTTLS otherwise
      auth: { user, pass },
    });
  }
  return transporter;
}

/**
 * Send the report. The logo is embedded as an inline (CID) attachment from a
 * base64 constant, so it renders in email clients with no external hosting and
 * no static-file dependency (works on Trigger.dev / Vercel / local). Never throws
 * — logs and returns false so a delivery problem can't fail the research job.
 */
export async function sendReportEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  if (!emailConfigured()) {
    logger.warn(STEP, "Email requested but SMTP creds not set; skipping.");
    return false;
  }
  try {
    const { from } = smtpConfig();

    // Swap the report's single <img> src for a cid: reference and attach the logo inline.
    let html = params.html;
    const attachments: nodemailer.SendMailOptions["attachments"] = [];
    if (/<img\s+src="/.test(html)) {
      html = html.replace(/(<img\s+src=")[^"]*(")/, `$1cid:${LOGO_CID}$2`);
      attachments.push({
        filename: "cymate-logo.png",
        content: Buffer.from(LOGO_PNG_BASE64, "base64"),
        cid: LOGO_CID,
      });
    }

    await getTransport().sendMail({
      from: `Cymate Reports <${from}>`,
      to: params.to,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      subject: params.subject,
      text: params.text,
      html,
      attachments,
    });
    logger.info(STEP, `Report emailed to ${params.to} (from ${from}).`);
    return true;
  } catch (err) {
    logger.error(STEP, `Failed to email ${params.to}: ${(err as Error).message}`);
    return false;
  }
}
