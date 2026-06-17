import { ResolvedInput } from "../types";

const DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

// Public-suffix-ish second-level TLDs we should NOT collapse to two labels
// (e.g. "foo.co.uk" must keep three labels, not become "co.uk").
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "co.nz", "co.za", "com.au", "net.au",
  "org.au", "com.br", "com.sg", "co.jp", "co.in", "co.kr",
]);

/**
 * Normalize a raw input (work email OR URL OR bare domain) into a clean domain.
 * Throws a descriptive error when the input contains no recognizable domain.
 */
export function resolveDomain(input: string): ResolvedInput {
  const raw = (input ?? "").trim();
  if (!raw) {
    throw new Error("Input is empty. Provide a company domain or a work email.");
  }

  let host = raw.toLowerCase();

  // Email -> take the part after @
  if (host.includes("@")) {
    const afterAt = host.split("@").pop() ?? "";
    host = afterAt;
  }

  // URL -> strip scheme, path, query, port. Also handle scheme-less "www.x.com/path".
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme://
  host = host.split("/")[0]; // drop path
  host = host.split("?")[0];
  host = host.split("#")[0];
  host = host.split(":")[0]; // drop port
  host = host.replace(/^www\./, "");
  host = host.trim();

  if (!host || !DOMAIN_RE.test(host)) {
    throw new Error(`Could not extract a valid domain from input: "${raw}".`);
  }

  return { raw, domain: collapseToRegistrable(host) };
}

/** Collapse a hostname to its registrable domain (handles common multi-part TLDs). */
function collapseToRegistrable(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;

  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}
