/**
 * Render a report that ties REAL discovered companies (signal-matched, enriched live
 * via AI-Ark) to the approved signals, using the trimmed formatter. Reuses the
 * approved signals from output/report.json and adds one-line summaries.
 */
import fs from "fs";
import path from "path";
import { formatResponse } from "../src/utils/formatter";
import { EnrichedCompany, ResearchData } from "../src/types";

const prev = JSON.parse(fs.readFileSync(path.join(process.cwd(), "output", "report.json"), "utf8"));
const inputCompany = prev.data.inputCompany;

// Approved 5 signals (same order) + a one-line plain summary each.
const summaries = [
  "A first AE was hired in the last 30 to 90 days with no SDR behind them, so their calendar is empty and the clock is ticking.",
  "Fresh lookalike sending domains plus a blacklisted primary domain show a team that tried outbound itself and is burning its deliverability.",
  "A non US company is opening US sales roles while having no US based team, so all early pipeline depends on cold outreach into a market where they have no network.",
  "Since funding they have added closers but zero pipeline generators, so the meetings to fill those reps have to come from somewhere.",
  "The founder has quietly shifted from posting customer wins to engaging outbound content, the tell of an inbound plateau they have not announced.",
];
const signals = {
  icpPattern: prev.data.signals.icpPattern,
  signals: prev.data.signals.signals.map((s: any, i: number) => ({
    signal: s.signal,
    summary: summaries[i] || "",
    indicator: s.indicator,
    why: s.why,
  })),
};

const companies: EnrichedCompany[] = [
  {
    name: "GoodFit",
    domain: "goodfit.io",
    matchReason:
      "Closer-heavy post-capital gap: after a 13M dollar Series A this London GTM data platform has added a VP of Revenue and a Founding GTM Executive but no SDR layer, so the meetings to feed those closers have to come from somewhere.",
    contacts: [
      { firstName: "Wahid", lastName: "Tashkandi", title: "VP of Revenue", email: "wahid@goodfit.io", linkedIn: "https://www.linkedin.com/in/wahidtashkandi" },
      { firstName: "John Michael", lastName: "Pang", title: "Founding GTM Executive", email: "john.pang@goodfit.io", linkedIn: "https://www.linkedin.com/in/john-michael-s-pang" },
      { firstName: "Al", lastName: "Simpson", title: "Head of Marketing", email: "al@goodfit.io", linkedIn: "https://www.linkedin.com/in/alastair-simpson" },
    ],
  },
  {
    name: "GetWhys",
    domain: "getwhys.io",
    matchReason:
      "AE calendar starvation: a recently funded GTM platform that has brought on a Founding Account Executive to carry quota with no SDR or BDR support behind them, the exact moment a founding seller needs outbound to fill the calendar.",
    contacts: [
      { firstName: "Philippe", lastName: "Boutros", title: "Co-Founder", email: "philippe@getwhys.io", linkedIn: "https://www.linkedin.com/in/philippeboutros" },
      { firstName: "Derek", lastName: "Morton", title: "Founding Account Executive", email: "derek.morton@getwhys.io", linkedIn: "https://www.linkedin.com/in/derek4morton" },
      { firstName: "Brandon", lastName: "Riggs", title: "Head of Product Marketing", email: "brandon.riggs@getwhys.io", linkedIn: "https://www.linkedin.com/in/brandonsriggs" },
    ],
  },
  {
    name: "Dolfin",
    domain: "heydolfin.com",
    matchReason:
      "Cross-border GTM crossing: a Barcelona based startup that just raised seed and is extending its go to market into the US, a market where it has no warm network and no local pipeline infrastructure.",
    contacts: [
      { firstName: "Daniel", lastName: "Seror", title: "Co-Founder, CEO", email: "daniel@heydolfin.com", linkedIn: "https://www.linkedin.com/in/daniel-seror" },
      { firstName: "Jessica", lastName: "Carneiro", title: "Head of Marketing", email: "jessica@heydolfin.com", linkedIn: "https://www.linkedin.com/in/carneirojessi" },
    ],
  },
  {
    name: "Leadbay",
    domain: "leadbay.ai",
    matchReason:
      "Cross-border GTM crossing: French founded and now headquartered in San Francisco, building its first US go to market with a tiny founding team and no local outbound engine.",
    contacts: [
      { firstName: "Ludovic", lastName: "Granger", title: "Co-Founder, CEO", email: "ludovic@leadbay.ai", linkedIn: "https://www.linkedin.com/in/ludovic-granger" },
      { firstName: "Milan", lastName: "Stankovic", title: "Co-Founder, CTO", email: "milan@leadbay.ai", linkedIn: "https://www.linkedin.com/in/milanstankovic" },
    ],
  },
];

const data: ResearchData = { inputCompany, signals, companies };
const out = formatResponse(data, "cymate.io");
const dir = path.join(process.cwd(), "output");
fs.writeFileSync(path.join(dir, "report.html"), out.formattedHTML, "utf8");
fs.writeFileSync(path.join(dir, "report.txt"), out.formattedText, "utf8");
fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(out, null, 2), "utf8");
console.log("Wrote output/report.{html,txt,json}. meta:", JSON.stringify(out.meta));
