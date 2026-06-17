import { ResearchResponse } from "../types";
import { resolveDomain } from "../utils/domainResolver";
import { researchCompany } from "../engine/companyResearcher";
import { generateSignals } from "../engine/signalGenerator";
import { discoverCompanies } from "../engine/companyDiscovery";
import { enrichContacts } from "../engine/contactEnricher";
import { formatResponse } from "../utils/formatter";
import { logger } from "../utils/logger";

const STEP = "pipeline";

/**
 * Run the full research pipeline for a resolved domain.
 * Steps 1->2->3 are sequential; Step 4 fans out concurrently; Step 5 formats.
 */
export async function runPipeline(input: string): Promise<ResearchResponse> {
  const domain = resolveDomain(input).domain;
  const startedAt = Date.now();
  logger.info(STEP, `Start for ${domain}.`);

  const company = await researchCompany(domain); // Step 1
  const signals = await generateSignals(company); // Step 2
  const discovered = await discoverCompanies(company, signals); // Step 3 (deep, may take minutes)
  const enriched = await enrichContacts(company, discovered); // Step 4 (concurrent)

  // Only keep companies where we actually found emailable contacts.
  const companies = enriched.filter((c) => c.contacts.length > 0);
  const dropped = enriched.length - companies.length;
  if (dropped > 0) logger.info(STEP, `Dropped ${dropped} companies with no emailable contacts.`);

  const payload = formatResponse({ inputCompany: company, signals, companies }, domain); // Step 5

  logger.info(STEP, `Done in ${Math.round((Date.now() - startedAt) / 1000)}s.`, {
    companies: payload.meta.totalCompanies,
    contacts: payload.meta.totalContacts,
  });
  return payload;
}
