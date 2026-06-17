// Shared interfaces for the Signal Research Engine pipeline.

/** Result of normalizing the raw input (email or URL) into a clean domain. */
export interface ResolvedInput {
  /** The raw value the caller sent. */
  raw: string;
  /** Normalized bare domain, e.g. "company.com". */
  domain: string;
}

/** Step 1 — research about the input company (expanded beyond the minimal spec). */
export interface CompanyResearch {
  companyName: string;
  domain: string;
  /** One-paragraph synthesis of who they sell to. */
  icpSummary: string;
  /** The buyer persona/title to target. Drives AI-Ark seniority inference. */
  targetBuyer: string;
  /** Core value proposition in one or two sentences. */
  valueProp: string;
  /** Distinct services / products they offer. */
  services: string[];
  /** The business motions / pains they solve. */
  painsSolved: string[];
  /** A unique, non-obvious insight useful for targeting. */
  uniqueInsight: string;
  /** Full deep-research dossier (the 12-dimension analysis) — feeds signal generation. */
  researchDossier: string;
  /** Synthesized paragraph: what a company must be experiencing to be ready to buy. */
  signalPreconditions: string;
}

/** A single buying signal. */
export interface Signal {
  /** Short label/name for the signal. */
  signal: string;
  /** One-line plain-language gist of the signal (for the trimmed report view). */
  summary: string;
  /** What to look for / how to find it via web search. */
  indicator: string;
  /** Why this means the company is in-market. */
  why: string;
}

/** Step 2 — the generated signal set. */
export interface SignalSet {
  signals: Signal[];
  /** One-sentence synthesis of the ICP theme. */
  icpPattern: string;
}

/** Step 3 — a discovered candidate company. */
export interface DiscoveredCompany {
  name: string;
  domain: string;
  /** One sentence: what they are doing RIGHT NOW that matches the signal pattern. */
  matchReason: string;
}

/** A decision-maker contact from AI-Ark. */
export interface Contact {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  linkedIn: string;
}

/** Step 4 — a discovered company enriched with contacts. */
export interface EnrichedCompany extends DiscoveredCompany {
  contacts: Contact[];
  /** True when AI-Ark returned no emailable contacts for this company. */
  notFound?: boolean;
}

/** Metadata about the run. */
export interface Meta {
  generatedAt: string;
  inputDomain: string;
  totalCompanies: number;
  totalContacts: number;
}

/** The structured data block of the final response. */
export interface ResearchData {
  inputCompany: CompanyResearch;
  signals: SignalSet;
  companies: EnrichedCompany[];
}

/** The full API response returned by POST /api/research. */
export interface ResearchResponse {
  data: ResearchData;
  formattedHTML: string;
  formattedText: string;
  meta: Meta;
}
