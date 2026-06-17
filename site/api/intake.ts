import type { VercelRequest, VercelResponse } from "@vercel/node";
import { tasks } from "@trigger.dev/sdk";

/**
 * REFERENCE intake for the cymate.io/report form (your team owns the actual website
 * deployment — this just shows the contract). It validates { email, website } and
 * triggers the Trigger.dev "lead-magnet" task. Lead-to-Google-Sheet logging and the
 * report email both happen INSIDE that task, so an intake only needs to trigger it.
 *
 * Requires env: TRIGGER_SECRET_KEY (the project's server/secret API key).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const email = String(body.email || "").trim();
  const website = String(body.website || body.url || body.domain || "").trim();

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "A valid email is required." });
  if (!website) return res.status(400).json({ error: "A company website is required." });

  try {
    await tasks.trigger("lead-magnet", { email, website });
    return res.status(200).json({
      ok: true,
      message: "Thanks! Your report is being generated and will arrive by email shortly.",
    });
  } catch (err) {
    return res.status(502).json({ ok: false, error: (err as Error).message });
  }
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
