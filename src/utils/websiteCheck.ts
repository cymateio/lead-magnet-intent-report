import dns from "dns/promises";
import { resolveDomain } from "./domainResolver";
import { logger } from "./logger";

const STEP = "website-check";

export type WebsiteVerdict = "ok" | "unreachable" | "inconclusive";

// DNS error codes meaning the name itself does NOT exist.
const NAME_DOES_NOT_EXIST = new Set(["ENOTFOUND", "NXDOMAIN"]);
// ENODATA = the name exists, just has no record of that type -> proof of existence.
const NAME_EXISTS_NO_RECORD = new Set(["ENODATA"]);

type AttemptResult = "exists" | "notfound" | "error";

/**
 * One DNS round for a single host. Queries several record types in parallel.
 * - Any successful answer (or ENODATA) => "exists" (the name is real).
 * - All record types ENOTFOUND/NXDOMAIN => "notfound".
 * - Any other failure (SERVFAIL, timeout, resolver/network) => "error" (inconclusive).
 */
async function attemptResolve(host: string): Promise<AttemptResult> {
  const settled = await Promise.allSettled([
    dns.resolve4(host),
    dns.resolve6(host),
    dns.resolveMx(host),
    dns.resolveCname(host),
    dns.resolveNs(host),
  ]);

  let sawHardError = false; // SERVFAIL / timeout / network -> inconclusive, NOT proof of absence
  let sawNotFound = false;

  for (const r of settled) {
    if (r.status === "fulfilled" && Array.isArray(r.value) && r.value.length > 0) {
      return "exists"; // a real record => the domain is real
    }
    if (r.status === "rejected") {
      const code = (r.reason as NodeJS.ErrnoException)?.code || "";
      if (NAME_EXISTS_NO_RECORD.has(code)) return "exists"; // ENODATA => name exists
      if (NAME_DOES_NOT_EXIST.has(code)) {
        sawNotFound = true;
        continue;
      }
      sawHardError = true; // unknown/transient -> never treat as absence
    }
  }

  if (sawHardError) return "error";
  return sawNotFound ? "notfound" : "error";
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Decide whether a lead-entered website is genuinely unreachable. Deliberately biased
 * HARD toward letting the report run: we return "unreachable" ONLY when DNS says the
 * domain name does not exist (ENOTFOUND/NXDOMAIN), consistently across retries, for BOTH
 * the bare domain and its www. host. Any timeout, SERVFAIL, resolver hiccup, or a name
 * that exists without an A record returns "ok"/"inconclusive" -> the report proceeds.
 *
 * Net effect: a valid site that merely blocks bots, is slow, redirects, or has no A
 * record is NEVER flagged. Only a typo'd / non-existent domain is. (This trades the rare
 * miss for zero false flags, per product requirement.)
 */
export async function checkLeadWebsite(rawWebsite: string): Promise<WebsiteVerdict> {
  const website = (rawWebsite || "").trim();
  if (!website) return "ok"; // nothing entered -> nothing to validate

  let domain: string;
  try {
    domain = resolveDomain(website).domain;
  } catch {
    // Non-empty but not parseable as any domain (e.g. "my site") -> can't be reached/researched.
    logger.info(STEP, `Unparseable website "${website}" -> unreachable.`);
    return "unreachable";
  }

  const candidates = domain.startsWith("www.") ? [domain] : [domain, `www.${domain}`];
  const ATTEMPTS = 3;

  for (let i = 0; i < ATTEMPTS; i++) {
    const results = await Promise.all(candidates.map(attemptResolve));

    if (results.includes("exists")) return "ok"; // any host real => valid
    if (results.includes("error")) {
      // Inconclusive (resolver/network) -> never condemn; retry, then proceed with the report.
      if (i < ATTEMPTS - 1) {
        await delay(700);
        continue;
      }
      logger.info(STEP, `Inconclusive DNS for ${domain}; proceeding with report.`);
      return "inconclusive";
    }

    // Every candidate returned "notfound" this round. Re-confirm before condemning.
    if (i < ATTEMPTS - 1) {
      await delay(500);
      continue;
    }
    logger.warn(STEP, `Domain ${domain} does not resolve after ${ATTEMPTS} checks -> unreachable.`);
    return "unreachable";
  }

  return "inconclusive";
}
