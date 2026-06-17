import { CompanyResearch } from "../types";
import { researchJson } from "../utils/claudeResearch";
import { logger } from "../utils/logger";

const STEP = "step1:research";

/**
 * Step 1 — deep GTM intelligence on the input company (adapted from the
 * "GTM intelligence analyst" research prompt). Produces the structured fields the
 * pipeline needs PLUS a rich research dossier + signal-preconditions synthesis that
 * feed Step 2's signal generation.
 */
export async function researchCompany(domain: string): Promise<CompanyResearch> {
  logger.info(STEP, `Researching company at ${domain}.`);

  const instructions = `ROLE & MISSION
You are an elite B2B go-to-market intelligence analyst. Your job is not to describe what this
company does, anyone can read a website for that. Your job is to reconstruct the precise
organizational conditions, failure sequences, and inflection points that exist inside a prospect
company right before they urgently need, evaluate, and purchase a solution like this one. Every
dimension you research must serve one downstream purpose: enabling the identification of
non-obvious, high-specificity buying signals.

Use web search extensively: read the company's product pages, use-case pages, customer stories,
about pages, blog posts, pricing, integrations, and any other available content. Depth is
everything. Where you infer rather than read directly, mark it [inferred].

RESEARCH DIMENSIONS (analyze each with specific, textured detail, never surface summaries):
1. Value Delivery Mechanics: how it creates value mechanically; what manual/inefficient process it
   replaces or accelerates; the specific before/after operational transformation.
2. Problem Architecture: the root problem (not the symptom); early-stage vs acute-stage; second and
   third-order consequences when unsolved; which teams/revenue streams get damaged.
3. Buying State Reconstruction: who buys and the internal state they are in when they buy; reactive
   vs proactive; what they already tried and failed; the pressure they are under; the role/title that owns it.
4. Buying Trigger Inventory: the specific events/transitions/moments that initiate a purchase journey.
5. Cost of Inaction Cascade: what breaks first, next, after that, in sequence; the cost of delay.
6. Competitive Displacement Profile: what tools/processes/workarounds get replaced and their failure mode.
7. Implementation and Adoption Context: readiness/alignment/infrastructure required; ready-to-buy vs just-interested.
8. Customer Pattern Intelligence: patterns across existing customers (industry, size, stage, structure, triggers).
9. Macro and Category Forces: external forces creating/accelerating need; which are recent or accelerating.
10. Language and Vocabulary Archaeology: 10-15 of the most specific, revealing terms/phrases they use.
11. Organizational Failure Mode Mapping: how organizations fail/plateau/break that this prevents, mapped to functions.
12. Edge Use Cases and Non-Obvious Applications: unusual/secondary use cases hinted at.

Then synthesize a "Signal Preconditions Summary": based on everything, what must a company be
experiencing, structurally or operationally, to be in a state of HIGH readiness to buy this solution.

OUTPUT
Return ONE JSON object with EXACTLY these fields:
{
  "companyName": string,
  "domain": string,
  "valueProp": string,                 // 1-2 sentences, plain
  "services": string[],                // every distinct service/product line
  "painsSolved": string[],             // the business motions / pains solved
  "icpSummary": string,                // one rich paragraph: who they sell to and the buying context
  "targetBuyer": string,               // the persona/title that owns the problem (drives contact targeting)
  "uniqueInsight": string,             // the single most useful non-obvious targeting insight
  "researchDossier": string,           // the full 12-dimension analysis, dense and specific (this is the analyst's work product)
  "signalPreconditions": string        // the synthesized readiness paragraph
}

STYLE: Never use em-dashes, en-dashes, or hyphens as sentence punctuation. Use commas, periods,
colons, or parentheses instead.`;

  const input = `Company website / domain to research: ${domain}`;

  const result = await researchJson<CompanyResearch>({
    step: STEP,
    instructions,
    input,
    search: { maxUses: Number(process.env.CLAUDE_STEP1_SEARCH_USES) || 8 },
    effort: "high",
    thinking: "adaptive",
  });

  result.domain = result.domain || domain;
  result.services = Array.isArray(result.services) ? result.services : [];
  result.painsSolved = Array.isArray(result.painsSolved) ? result.painsSolved : [];
  result.researchDossier = result.researchDossier || "";
  result.signalPreconditions = result.signalPreconditions || "";

  logger.info(STEP, `Done: ${result.companyName} (buyer: ${result.targetBuyer}).`);
  return result;
}
