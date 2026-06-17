import { Contact, CompanyResearch, DiscoveredCompany, EnrichedCompany } from "../types";
import { findPeopleWithEmails } from "./aiArkMcp";
import { logger } from "../utils/logger";

const STEP = "step4:enrich";

/**
 * Step 4 — enrich each discovered company with 2-3 emailable decision-makers via
 * AI-Ark's MCP (email_finder + email_finder_results). Companies are processed
 * concurrently under a 5 req/sec rate limit. Per-company failures are isolated.
 * Only contacts WITH a resolved email are kept (per product decision).
 */
export async function enrichContacts(
  company: CompanyResearch,
  companies: DiscoveredCompany[]
): Promise<EnrichedCompany[]> {
  if (companies.length === 0) return [];

  const seniority = inferSeniority(company.targetBuyer);
  const keep = Number(process.env.AIARK_CONTACTS_PER_COMPANY) || 3;
  const lookupSize = Number(process.env.AIARK_PEOPLE_SIZE) || Math.max(keep + 2, 5);
  const timeoutMs = Number(process.env.AIARK_EMAIL_TIMEOUT_MS) || 60_000;

  logger.info(STEP, `Enriching ${companies.length} companies. Seniority: ${seniority.join(", ")}.`);

  const gate = rateLimiter(5, 1000); // AI-Ark: 5 requests per second

  const enriched = await Promise.all(
    companies.map(async (c) => {
      try {
        await gate();
        const people = await findPeopleWithEmails({
          domain: c.domain,
          seniority,
          size: lookupSize,
          timeoutMs,
        });

        const contacts = people
          .map(mapContact)
          .filter((p): p is Contact => !!p && !!p.email)
          .slice(0, keep);

        if (contacts.length === 0) {
          logger.warn(STEP, `No emailable contacts for ${c.domain}.`);
          return { ...c, contacts: [], notFound: true };
        }
        logger.info(STEP, `Found ${contacts.length} emailable contacts for ${c.domain}.`);
        return { ...c, contacts };
      } catch (err) {
        logger.error(STEP, `AI-Ark lookup failed for ${c.domain}.`, (err as Error).message);
        return { ...c, contacts: [], notFound: true };
      }
    })
  );

  return enriched;
}

/** Map an AI-Ark person record (profile + email) to our Contact shape. */
function mapContact(p: any): Contact | null {
  if (!p || typeof p !== "object") return null;
  const profile = p.profile || {};

  const email = firstEmail(p);
  if (!email) return null;

  let firstName = str(profile.first_name);
  let lastName = str(profile.last_name);
  const fullName = str(profile.full_name);
  if ((!firstName || !lastName) && fullName) {
    const parts = fullName.split(/\s+/);
    firstName = firstName || parts[0] || "";
    lastName = lastName || parts.slice(1).join(" ") || "";
  }

  return {
    firstName,
    lastName,
    title: str(profile.title) || str(profile.headline),
    email,
    linkedIn: str(p.link?.linkedin),
  };
}

/** Extract the first resolved email address from a person record. */
function firstEmail(p: any): string {
  const out = p?.email?.output;
  if (Array.isArray(out)) {
    for (const o of out) {
      if (o && typeof o.address === "string" && o.address.trim()) return o.address.trim();
    }
  }
  // Defensive fallbacks in case the shape varies.
  if (typeof p?.email === "string" && p.email.includes("@")) return p.email.trim();
  return "";
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Infer AI-Ark seniority enum values from a free-text target buyer description.
 * Valid enums: founder, owner, partner, c_suite, vp, director, head, manager, ...
 */
export function inferSeniority(targetBuyer: string): string[] {
  const t = (targetBuyer || "").toLowerCase();
  const out = new Set<string>();

  if (/\b(ceo|cfo|coo|cto|cmo|cio|ciso|chief|c-level|c-suite|president)\b/.test(t)) out.add("c_suite");
  if (/\bfounder\b/.test(t)) out.add("founder");
  if (/\b(owner|principal)\b/.test(t)) out.add("owner");
  if (/\bpartner\b/.test(t)) out.add("partner");
  if (/\b(vp|vice president|svp|evp)\b/.test(t)) out.add("vp");
  if (/\bdirector\b/.test(t)) out.add("director");
  if (/\bhead\b/.test(t)) out.add("head");
  if (/\b(manager|lead)\b/.test(t)) out.add("manager");

  if (out.size === 0) return ["c_suite", "vp", "director", "head"];
  return Array.from(out);
}

/**
 * Returns an async gate; awaiting it ensures no more than `max` calls proceed
 * within each `windowMs`, smoothing bursts to respect AI-Ark's rate limit.
 */
function rateLimiter(max: number, windowMs: number): () => Promise<void> {
  const timestamps: number[] = [];
  return async function gate(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const now = Date.now();
      while (timestamps.length && now - timestamps[0] >= windowMs) timestamps.shift();
      if (timestamps.length < max) {
        timestamps.push(now);
        return;
      }
      const waitFor = windowMs - (now - timestamps[0]);
      await new Promise((r) => setTimeout(r, Math.max(waitFor, 5)));
    }
  };
}
