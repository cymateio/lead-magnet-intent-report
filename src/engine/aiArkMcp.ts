import { logger } from "../utils/logger";

const STEP = "aiark:mcp";

/**
 * Thin client for AI-Ark's MCP server. Step 4 uses `email_finder` (which searches
 * people AND resolves their emails in one async job) followed by polling
 * `email_finder_results` until the job is DONE.
 *
 * The MCP SDK is ESM-only; we lazy `import()` it from our CommonJS build (Node 18+
 * / 24 support require-of-ESM and dynamic import interop). Types are shimmed in
 * src/types/mcp-sdk.d.ts.
 */

let clientPromise: Promise<any> | null = null;

function config() {
  const url = process.env.AIARK_MCP_URL;
  if (!url) throw new Error("AIARK_MCP_URL is not set.");
  // AI-Ark carries the token in the URL query (?token=...). An explicit
  // AIARK_API_KEY is optional and, if present, is also sent as a header.
  const apiKey = process.env.AIARK_API_KEY || "";
  const transport = (process.env.AIARK_MCP_TRANSPORT || "http").toLowerCase(); // "http" | "sse"
  const authHeader = process.env.AIARK_MCP_AUTH_HEADER || "X-TOKEN";
  return { url, apiKey, transport, authHeader };
}

async function getClient(): Promise<any> {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const { url, apiKey, transport, authHeader } = config();
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");

    // Token is in the URL query; only attach headers if an explicit key is set.
    const requestInit = apiKey
      ? { headers: { [authHeader]: apiKey, Authorization: `Bearer ${apiKey}` } }
      : undefined;

    let mcpTransport: any;
    if (transport === "sse") {
      const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");
      mcpTransport = new SSEClientTransport(new URL(url), requestInit ? { requestInit } : {});
    } else {
      const { StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/streamableHttp.js"
      );
      mcpTransport = new StreamableHTTPClientTransport(
        new URL(url),
        requestInit ? { requestInit } : {}
      );
    }

    const client = new Client(
      { name: "signal-research-engine", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(mcpTransport);
    logger.info(STEP, `Connected to AI-Ark MCP (${transport}).`);
    return client;
  })().catch((err) => {
    clientPromise = null; // allow retry on next request
    throw err;
  });

  return clientPromise;
}

/** Parse the JSON payload out of an MCP tool result's text content. */
function parseToolResult(result: any): any {
  const content = result?.content;
  if (Array.isArray(content)) {
    const text = content
      .filter((c: any) => c && c.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text)
      .join("");
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return { _raw: text };
      }
    }
  }
  return result?.structuredContent ?? result ?? null;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<any> {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args });
  return parseToolResult(result);
}

/**
 * Find people at a domain and resolve their emails. Returns the raw AI-Ark people
 * records (profile + email). Bounded by `timeoutMs`; returns whatever resolved so far.
 */
export async function findPeopleWithEmails(params: {
  domain: string;
  seniority: string[];
  size: number;
  timeoutMs: number;
  pollIntervalMs?: number;
}): Promise<any[]> {
  const { domain, seniority, size, timeoutMs } = params;
  const pollIntervalMs = params.pollIntervalMs ?? 3000;

  const init = await callTool("email_finder", {
    companyDomain: domain,
    seniority: seniority.join(","),
    size,
  });

  const trackId: string | undefined = init?.trackId;
  if (!trackId) {
    throw new Error(`email_finder returned no trackId for ${domain}.`);
  }
  logger.info(STEP, `email_finder started for ${domain} (track ${trackId}, state ${init?.state}).`);

  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;

  // Poll until the job stops being PENDING, results arrive, or we hit the deadline.
  // (We can't use Date.now-based sleeps lightly, but this is request-scoped runtime code.)
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    let res: any;
    try {
      res = await callTool("email_finder_results", { trackId, page: 0, size });
    } catch (err) {
      logger.warn(STEP, `Polling error for ${domain}: ${(err as Error).message}`);
      continue;
    }

    if (res?.error) {
      // "not found / expired" can briefly occur before the job registers; keep polling.
      continue;
    }

    const people: any[] = res?.content ?? res?.results ?? [];
    lastCount = people.length;
    const finder = res?.finder ?? res?.statistics;
    const state: string | undefined = res?.state ?? finder?.state;
    const found = finder?.found;

    // Done when the job reports DONE, or when enough emails have surfaced.
    const withEmail = people.filter(hasEmail).length;
    if (state === "DONE" || (typeof found === "number" && found >= size) || withEmail >= size) {
      return people;
    }
  }

  logger.warn(STEP, `email_finder timed out for ${domain}; returning ${lastCount} partial records.`);
  // Best-effort final fetch.
  try {
    const res = await callTool("email_finder_results", { trackId, page: 0, size });
    return res?.content ?? res?.results ?? [];
  } catch {
    return [];
  }
}

function hasEmail(person: any): boolean {
  const out = person?.email?.output;
  return Array.isArray(out) && out.some((o: any) => o?.address);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
