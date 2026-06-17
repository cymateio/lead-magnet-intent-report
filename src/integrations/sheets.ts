import { google, sheets_v4 } from "googleapis";
import { logger } from "../utils/logger";

const STEP = "sheets";

// Lead sheet layout (founder's form-linked sheet):
//   A Date | B Email | C Website | D Sent | E Trigger Run ID
const TAB = process.env.SHEET_TAB || "Sheet1";

/** True when the Google Sheets service-account env is configured. */
export function sheetsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.SHEET_ID
  );
}

function client(): sheets_v4.Sheets {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export interface LeadRow {
  rowNumber: number; // 1-based sheet row
  date: string;
  email: string;
  website: string;
  sent: string;
}

/** Read all data rows from the lead sheet (skips the header row). */
export async function readLeadRows(): Promise<LeadRow[]> {
  if (!sheetsConfigured()) {
    logger.warn(STEP, "Google Sheets not configured; cannot read leads.");
    return [];
  }
  const res = await client().spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: `${TAB}!A2:E`,
  });
  const rows = res.data.values || [];
  return rows.map((r, i) => ({
    rowNumber: i + 2,
    date: (r[0] || "").toString(),
    email: (r[1] || "").toString().trim(),
    website: (r[2] || "").toString().trim(),
    sent: (r[3] || "").toString().trim(),
  }));
}

/** A row needs processing when it has an email and Sent is not "yes". */
export function needsProcessing(row: LeadRow): boolean {
  return !!row.email && row.sent.toLowerCase() !== "yes";
}

/** Mark a row's Sent column "yes" and record the Trigger run id. */
export async function markRowSent(rowNumber: number, runId: string): Promise<boolean> {
  if (!sheetsConfigured()) return false;
  try {
    await client().spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${TAB}!D${rowNumber}:E${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["yes", runId]] },
    });
    logger.info(STEP, `Row ${rowNumber} marked sent (run ${runId}).`);
    return true;
  } catch (err) {
    logger.error(STEP, `markRowSent(${rowNumber}) failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Append a lead row (legacy/manual use). Columns: Date | Email | Website | Sent | Run ID.
 * Not used by the form-driven flow (the website form writes the row).
 */
export async function appendLead(row: (string | number)[]): Promise<boolean> {
  if (!sheetsConfigured()) {
    logger.warn(STEP, "Google Sheets not configured; skipping append.");
    return false;
  }
  try {
    await client().spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    return true;
  } catch (err) {
    logger.error(STEP, `Append failed: ${(err as Error).message}`);
    return false;
  }
}
