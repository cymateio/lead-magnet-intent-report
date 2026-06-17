import dns from "dns/promises";
import { CompanyResearch, DiscoveredCompany, SignalSet } from "../types";
import { researchJson } from "../utils/claudeResearch";
import { logger } from "../utils/logger";

const STEP = "step3:discovery";

/**
 * Step 3 — find 4-5 real, named companies currently exhibiting the signals.
 * Domains are DNS-validated; unresolvable (likely hallucinated) domains are dropped.
 * Returns whatever is found with high confidence — never pads.
 */
export async function discoverCompanies(
  company: CompanyResearch,
  signalSet: SignalSet
): Promise<DiscoveredCompany[]> {
  logger.info(STEP, "Discovering companies matching the signal pattern.");

  const instructions = `You are an elite B2B account-research analyst. Your job is DEEP, EXHAUSTIVE
web research to surface 4-5 REAL, named, verifiable companies that RIGHT NOW are in-market for what
the input company sells — i.e. companies showing the buying signals below (or other, equally relevant
signals you reason your way to).

HOW TO THINK:
1. Internalize the input company's ICP and the provided signals. Then BRAINSTORM additional,
   non-obvious signals that would be just as strong an indicator that a company needs what the input
   company sells. Use both the given signals and your own — whichever actually surface real buyers.
2. Search the depths of the web, not just the first results. Run MANY targeted queries: LinkedIn
   company posts and job listings, press releases, funding/expansion news, careers pages, niche
   industry publications, podcasts, conference exhibitor lists, Crunchbase-style sources, etc.
   Prioritize evidence from the last 90 days, but go deeper if needed to find genuine matches.
3. For each candidate, verify it is a real company with a real, resolvable corporate domain and that
   it genuinely shows a signal RIGHT NOW. Never invent a company or a domain.

RULES:
- Return 4-5 companies. Keep digging across multiple searches until you have real, verifiable matches
  — do NOT give up and return an empty list. Only omit a company if you genuinely cannot verify it.
- Each company must be a strong, defensible match — not a generic name you guessed.
- matchReason must cite the specific, current thing they are doing that signals intent.

Produce a JSON object with EXACTLY this shape and NOTHING else:
{
  "companies": [
    {
      "name": string,
      "domain": string,        // real registrable domain, e.g. "acme.com" (no scheme, no path)
      "matchReason": string    // one sentence: the specific thing they are doing RIGHT NOW
    }
  ]
}

STYLE: Never use em-dashes, en-dashes, or hyphens as sentence punctuation. Use commas, periods,
colons, or parentheses instead.`;

  const input = `Input company we are finding BUYERS for:
${company.companyName} (${company.domain})
What they sell: ${company.valueProp}
Services: ${company.services.join("; ")}
Pains they solve: ${company.painsSolved.join("; ")}
Who they sell to (ICP): ${company.icpSummary}
Target buyer: ${company.targetBuyer}
Unique targeting insight: ${company.uniqueInsight}

ICP pattern: ${signalSet.icpPattern}

Seed signals to match (and extend with your own, equally relevant ones):
${signalSet.signals
    .map((s, i) => `${i + 1}. ${s.signal} — indicator: ${s.indicator} — why: ${s.why}`)
    .join("\n")}`;

  const deepSearch = { maxUses: Number(process.env.CLAUDE_DEEP_SEARCH_USES) || 12 };

  // Deep, thorough discovery — high effort + adaptive thinking, exhaustive web search.
  let result = await researchJson<{ companies: DiscoveredCompany[] }>({
    step: STEP,
    instructions,
    input,
    search: deepSearch,
    effort: "high",
    thinking: "adaptive",
  });
  let rawCount = Array.isArray(result.companies) ? result.companies.length : 0;
  logger.info(STEP, `Model returned ${rawCount} raw companies (attempt 1).`);

  // Retry once if the first pass came back empty — push it to dig harder.
  if (rawCount === 0) {
    logger.warn(STEP, "Empty first pass — retrying discovery with a harder nudge.");
    result = await researchJson<{ companies: DiscoveredCompany[] }>({
      step: STEP,
      instructions:
        instructions +
        "\n\nYour previous attempt returned no companies. That is not acceptable unless the market " +
        "truly has none. Search far more broadly and creatively across different sources and signal " +
        "types, and return the 4-5 strongest real, verifiable matches you can substantiate.",
      input,
      search: { maxUses: deepSearch.maxUses + 5 },
      effort: "high",
      thinking: "adaptive",
    });
    rawCount = Array.isArray(result.companies) ? result.companies.length : 0;
    logger.info(STEP, `Model returned ${rawCount} raw companies (attempt 2).`);
  }

  const raw = Array.isArray(result.companies) ? result.companies : [];
  const cleaned = raw
    .map((c) => ({
      name: (c.name || "").trim(),
      domain: normalizeDomain(c.domain || ""),
      matchReason: (c.matchReason || "").trim(),
    }))
    .filter((c) => c.name && c.domain);

  // Drop duplicates by domain.
  const seen = new Set<string>();
  const unique = cleaned.filter((c) => {
    if (seen.has(c.domain)) return false;
    seen.add(c.domain);
    return true;
  });

  // DNS-validate concurrently; keep only resolvable domains.
  const checks = await Promise.all(
    unique.map(async (c) => ({ company: c, ok: await domainResolves(c.domain) }))
  );
  const resolved = checks.filter((r) => r.ok).map((r) => r.company);

  const dropped = unique.length - resolved.length;
  if (dropped > 0) logger.warn(STEP, `Dropped ${dropped} companies with unresolvable domains.`);
  logger.info(STEP, `Discovered ${resolved.length} verified companies.`);

  return resolved;
}

function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0]
    .trim();
}

async function domainResolves(domain: string): Promise<boolean> {
  try {
    const records = await Promise.allSettled([dns.resolve(domain), dns.resolveMx(domain)]);
    return records.some((r) => r.status === "fulfilled" && Array.isArray(r.value) && r.value.length > 0);
  } catch {
    return false;
  }
}
