import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
    // Deep research can legitimately run many minutes — set a high safety ceiling,
    // not a tight cap (the pipeline runs as an async background job).
    const timeout = Number(process.env.CLAUDE_REQUEST_TIMEOUT_MS) || 20 * 60_000;
    client = new Anthropic({ apiKey, timeout, maxRetries: 2 });
  }
  return client;
}

function getModel(): string {
  // Sonnet 4.6 (high effort + thinking) is the configured research model — strong
  // and faster than Opus for this web-search-heavy work. Override via CLAUDE_MODEL.
  return process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
}

// GA web-search server tool (built-in dynamic filtering). Override via env if needed.
function webSearchTool(maxUses: number) {
  return {
    // Classic web search (no code-execution-based dynamic filtering) is more robust
    // for our JSON-only research calls. Override with CLAUDE_WEBSEARCH_TOOL if needed.
    type: process.env.CLAUDE_WEBSEARCH_TOOL || "web_search_20250305",
    name: "web_search",
    max_uses: maxUses,
  };
}

/**
 * Pull the first balanced JSON object/array out of arbitrary model text,
 * tolerating ```json fences and surrounding prose.
 */
export function extractJson(text: string): string {
  if (!text) throw new Error("Model returned empty output.");

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const haystack = fence ? fence[1] : text;

  const start = haystack.search(/[{[]/);
  if (start === -1) throw new Error("No JSON found in model output.");

  const open = haystack[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < haystack.length; i++) {
    const ch = haystack[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return haystack.slice(start, i + 1);
    }
  }
  throw new Error("Unbalanced JSON in model output.");
}

/** Is this a transient network/stream error worth retrying? */
function isTransient(err: unknown): boolean {
  const msg = (err as Error)?.message?.toLowerCase() || "";
  const status = (err as any)?.status;
  return (
    msg.includes("terminated") ||
    msg.includes("socket") ||
    msg.includes("econnreset") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 529
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run one streamed Messages call, retrying on transient stream/network drops. */
async function streamWithRetry(
  step: string,
  body: Anthropic.MessageStreamParams
): Promise<Anthropic.Message> {
  const maxAttempts = Number(process.env.CLAUDE_STREAM_RETRIES) || 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const stream = getClient().messages.stream(body);
      return await stream.finalMessage();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransient(err)) {
        const backoff = Math.min(2000 * attempt, 8000);
        logger.warn(
          step,
          `Stream attempt ${attempt} failed (${(err as Error).message}); retrying in ${backoff}ms.`
        );
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Run one focused Claude research call and parse its JSON result into T.
 *
 * - Uses Claude's web_search server tool when `search.maxUses > 0` ("deep search"
 *   = more uses + high effort).
 * - Streams (server tool loops are long) and handles `pause_turn` by resuming.
 * - Caches the stable system prompt for cheaper repeat calls.
 */
export async function researchJson<T>(params: {
  step: string;
  instructions: string;
  input: string;
  search?: { maxUses: number };
  effort?: "low" | "medium" | "high";
  thinking?: "adaptive" | "disabled";
}): Promise<T> {
  const { step, instructions, input } = params;
  const effort = params.effort || "high";
  const thinkingMode = params.thinking || "adaptive";
  const model = getModel();
  const useSearch = !!params.search && params.search.maxUses > 0;

  logger.info(
    step,
    `Calling Claude (${model}, effort=${effort}, thinking=${thinkingMode}${useSearch ? `, web_search<=${params.search!.maxUses}` : ""}).`
  );

  const system = [
    {
      type: "text" as const,
      text:
        instructions +
        "\n\nReturn ONLY valid JSON matching the requested shape. " +
        "Do not include markdown fences, commentary, or any text before or after the JSON.",
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const tools = useSearch ? [webSearchTool(params.search!.maxUses)] : undefined;
  // Web search continues past the server tool-loop cap via pause_turn; allow many
  // resumes so deep research can search exhaustively.
  const MAX_RESUMES = Number(process.env.CLAUDE_MAX_RESUMES) || 12;
  const PARSE_ATTEMPTS = Number(process.env.CLAUDE_PARSE_RETRIES) || 3;

  let lastErr = "";
  for (let attempt = 1; attempt <= PARSE_ATTEMPTS; attempt++) {
    const userText =
      attempt === 1
        ? input
        : input +
          "\n\nIMPORTANT: Respond with ONLY the JSON object specified, starting with '{'. " +
          "No prose, no apologies, no commentary about tools. If a search failed, work with what you have and still return valid JSON.";
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];

    let finalText = "";
    for (let i = 0; i < MAX_RESUMES; i++) {
      const msg = await streamWithRetry(step, {
        model,
        max_tokens: 16000,
        thinking: thinkingMode === "disabled" ? { type: "disabled" } : { type: "adaptive" },
        output_config: { effort },
        system,
        ...(tools ? { tools } : {}),
        messages,
      } as Anthropic.MessageStreamParams);

      if (msg.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: msg.content });
        logger.info(step, `Resuming after pause_turn (${i + 1}).`);
        continue;
      }

      finalText = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      break;
    }

    try {
      return JSON.parse(extractJson(finalText)) as T;
    } catch (err) {
      lastErr = (err as Error).message;
      logger.warn(step, `JSON parse attempt ${attempt}/${PARSE_ATTEMPTS} failed: ${lastErr}`, finalText.slice(0, 300));
    }
  }

  throw new Error(`${step}: could not get valid JSON after ${PARSE_ATTEMPTS} attempts (${lastErr}).`);
}
