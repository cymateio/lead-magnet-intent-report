import { CompanyResearch, SignalSet } from "../types";
import { researchJson } from "../utils/claudeResearch";
import { logger } from "../utils/logger";

const STEP = "step2:signals";

/**
 * Step 2 — synthesize 3-5 genuinely non-obvious buying signals from the Step 1
 * intelligence (adapted from the "GTM signal strategist" prompt). The model reasons
 * with the full causal-chain / observable-proxy / confluence / timing framework, then
 * expresses each signal in our report format { signal, indicator, why }.
 */
export async function generateSignals(company: CompanyResearch): Promise<SignalSet> {
  logger.info(STEP, `Generating signals for ${company.companyName}.`);

  const instructions = `ROLE & MISSION
You are an elite GTM signal strategist. Take the deep company intelligence provided and synthesize
it into 3 to 5 buying signals so specific, well-reasoned, and non-obvious that the company's sales
team says: "We haven't thought about it this way, but this is exactly right." Signals must be
observable in the real world (findable via web research, databases, job postings, press, public
filings, LinkedIn) and distinctive enough that a standard intent-data tool would not already surface them.

THINKING FRAMEWORK (reason through all four for every signal):
- Causal Chain: an observable external event/pattern reveals a specific internal organizational state
  that maps directly to the buying conditions in the intelligence. Find events that CAUSALLY PRODUCE
  the internal state of being ready, urgent, and receptive, not events that merely correlate.
- Observable Proxy: the internal state is rarely directly visible. Identify the indirect, public
  proxies that reliably indicate it (job-posting patterns and language, LinkedIn team-structure
  changes, press-release sequencing, product-review sentiment, tech-stack indicators, partnership
  news, customer-facing changes, filings, leadership interview language, conference topics).
- Confluence Logic: the best signals are combinations. Identify the 2 to 4 indicators that, seen
  together, compress uncertainty dramatically and feel almost diagnostic.
- Timing Precision: where in the company's lifecycle the signal appears, and how long the buying
  window stays open before it closes.

DO NOT PRODUCE these commoditized signals (if a signal reduces to one of these at its core, discard
and rebuild): new executive hire; funding round announcement; headcount growth percentage; generic
new office opening; "company is hiring for X role" as a single standalone role; revenue-milestone
announcement; rebranding; generic "digital transformation" language.

NON-OBVIOUSNESS BAR: each signal must require either (a) connecting dots across sources not normally
connected, (b) reading patterns over time rather than point-in-time events, or (c) interpreting
something that looks ordinary on its surface but is revealing in context.

OUTPUT
Return ONE JSON object in EXACTLY this shape:
{
  "signals": [
    {
      "signal": string,      // a precise, memorable name. Not generic, not vague.
      "summary": string,     // ONE line, max ~16 words, plain language: the gist of the signal a
                             // reader can grasp at a glance (no jargon, no sources). Phrase it in the
                             // PRESENT TENSE and PLURAL, describing the companies: begin with
                             // "Companies " and keep it grammatically correct (e.g. "Companies hiring
                             // closers but with no one to generate their pipeline.").
      "indicator": string,   // WHAT to look for (the specific combination/confluence of observable
                             // proxies) and WHERE to find it. Concrete enough to act on tomorrow. Concise.
      "why": string          // the causal chain in plain language (this observable thing means this
                             // internal state, which produces this pain, which is exactly what the
                             // company solves) plus the one-line "aha" framing. Concise.
    }
  ],
  "icpPattern": string       // one sentence synthesizing the ICP theme across the signals
}

Produce 3 to 5 signals. Make each one deeply reasoned but expressed tightly: at most 1 to 2 sentences
per field, so the final report stays readable. Never use em-dashes, en-dashes, or hyphens as sentence
punctuation; use commas, periods, colons, or parentheses instead.`;

  const input = `INPUT COMPANY (we are finding buyers for this company):
${company.companyName} (${company.domain})
Value proposition: ${company.valueProp}
Services: ${company.services.join("; ")}
Pains solved: ${company.painsSolved.join("; ")}
Target buyer: ${company.targetBuyer}

DEEP RESEARCH DOSSIER:
${company.researchDossier || "(not available)"}

SIGNAL PRECONDITIONS SUMMARY:
${company.signalPreconditions || company.icpSummary}`;

  const result = await researchJson<SignalSet>({
    step: STEP,
    instructions,
    input,
    effort: "high",
    thinking: "adaptive",
  });
  result.signals = Array.isArray(result.signals) ? result.signals : [];

  logger.info(STEP, `Generated ${result.signals.length} signals.`);
  return result;
}
