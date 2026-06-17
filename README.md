# Signal Research Engine

A standalone, **plug-and-play** deep-research engine. Give it a company domain or
work email, and it returns 4–5 companies currently showing high-intent buying
signals for that company's ICP — each with 2–3 emailable decision-makers from
AI-Ark.

The same API call returns **structured JSON + pre-rendered HTML + plain text** in
one payload, so the exact same endpoint and template work whether you call it from
a website, an email workflow, Make, or anywhere else. No changes required.

---

## How it works

```
input (domain or email)
  └─ Step 1  Company Research      Claude + web_search server tool
  └─ Step 2  Signal Generation     non-obvious, in-market buying signals
  └─ Step 3  Company Discovery     4–5 real, DNS-verified matching companies
  └─ Step 4  Contact Enrichment    AI-Ark MCP email_finder (concurrent, rate-limited)
  └─ Step 5  Format                data + formattedHTML + formattedText + meta
```

Steps 1→2→3 run sequentially; Step 4 fans out concurrently across companies.
`formattedHTML` and `formattedText` are built deterministically in
[`src/utils/formatter.ts`](src/utils/formatter.ts) from the structured data — never
by the AI. The template never changes regardless of where the engine is deployed.

---

## Local setup

Requires Node.js 18+.

```bash
npm install
cp .env.example .env      # then fill in your keys
npm run dev               # ts-node-dev, hot reload
# or
npm run build && npm start
```

Open `http://localhost:3000` for the web UI, or call the API directly (below).

### Environment variables

| Var               | Required | Default                  | Purpose                                            |
| ----------------- | -------- | ------------------------ | -------------------------------------------------- |
| `ANTHROPIC_API_KEY`     | yes | —                | Claude key for the three research steps + web search |
| `CLAUDE_MODEL`          | no  | `claude-sonnet-4-6`| Model used for Steps 1–3                          |
| `CLAUDE_DEEP_SEARCH_USES`| no | `6`              | Web-search uses for the deep discovery step (Step 3) |
| `CLAUDE_WEBSEARCH_TOOL` | no  | `web_search_20250305` | Web-search tool version (classic = most robust) |
| `AIARK_MCP_URL`         | yes | —                | AI-Ark MCP endpoint (token in the `?token=` query) |
| `AIARK_MCP_TRANSPORT`   | no  | `http`           | MCP transport: `http` (Streamable HTTP) or `sse`   |
| `AIARK_API_KEY`         | no  | —                | Only if the MCP server also wants a header token   |
| `AIARK_CONTACTS_PER_COMPANY` | no | `3`         | Emailable contacts kept per company                |
| `AIARK_PEOPLE_SIZE`     | no  | `5`              | People looked up per company (some lack emails)    |
| `GMAIL_USER`            | no  | —                | Gmail address to send reports from (enables email) |
| `GMAIL_APP_PASSWORD`    | no  | —                | Google **App Password** (needs 2-Step Verification)|
| `WEBHOOK_SECRET`        | no  | (unset = open)   | Set to require `X-Webhook-Secret` on the API       |
| `PORT`                  | no  | `3000`           | Server port                                        |
| `BRAND_LOGO_URL`        | no  | (text wordmark)  | Hosted logo image; falls back to "Cymate" wordmark |

> **Security:** keep real keys in `.env` (gitignored). If an AI-Ark key was ever
> shared in plaintext, rotate it.

---

## Run a live demo (public URL, no hosting account)

Serve the engine from your machine behind a free Cloudflare quick tunnel:

```bash
start-demo.bat        # Windows: builds, starts the server, opens the tunnel
```

It prints a public `https://<random>.trycloudflare.com` URL. Open it (or share it),
enter a company domain or work email (and optionally an email to send the report to),
and the branded report appears on the page in ~10–15 minutes (and lands in the inbox
if an email was given). Keep both windows open for the duration. The URL is fresh each
run. (Manual equivalent: `npm run build && npm start`, then
`cloudflared.exe tunnel --url http://localhost:3000`.)

For an always-on deployment (so the email workflow can trigger it 24/7), deploy the
same app to any Node host (Railway/Render/Fly): `npm run build` then `npm start`,
binding `$PORT`; set the env vars above in the host dashboard.

---

## API (asynchronous)

Deep research can take **10–20 minutes**, so the engine runs it as a background job.
The full payload is delivered **all at once** when the job finishes — never partially.
Auth: every API call sends `X-Webhook-Secret: $WEBHOOK_SECRET`.

### `POST /api/research` — start a job

```bash
curl -X POST http://localhost:3000/api/research \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"input": "jane@acme.com"}'
# → 202 { "jobId": "job_...", "status": "pending", "statusUrl": "/api/research/job_..." }
```

`input` accepts a work email (`jane@acme.com`), a URL (`https://acme.com/about`), or a
bare domain (`acme.com`). Optional fields:
`"callbackUrl": "https://..."` — when set, the engine **POSTs the complete payload** there
once the job is `done` (so you don't have to poll). `"email": "to@company.com"` — when set
(and Gmail is configured), the finished report is emailed there; if `input` is itself an
email and no `email` is given, the report goes to that address.

### `GET /api/research/:jobId` — fetch status / result

```bash
curl http://localhost:3000/api/research/job_xxx -H "X-Webhook-Secret: $WEBHOOK_SECRET"
# pending/running → { "jobId", "status", "inputDomain", "createdAt", "updatedAt" }
# done            → { "jobId", "status":"done", ...full payload (data, formattedHTML, formattedText, meta) }
# error           → { "jobId", "status":"error", "error": "..." }
```

### `GET /health`
Returns `{ "status": "ok" }`.

### `GET /`
Serves the self-contained web UI (it starts a job and polls until done).

---

## Calling from an external workflow

The engine is the single integration point — Slack/Make/Smartlead connect to it,
not the other way around. Two patterns, both deliver the whole payload at once:

**Positive-reply workflow (Make):** on a positive reply, Make calls
`POST /api/research` with `{ "input": "{{lead.email}}", "callbackUrl": "https://your-make-webhook" }`
(and/or `"email"`). The engine runs the full motion and, when done (10–20 min later), POSTs the
full `{ jobId, status, data, formattedHTML, formattedText, meta }` to your `callbackUrl`. Your
scenario then sends `formattedHTML` back to the lead (that final send is out of scope here).

**Polling:**
1. `POST /api/research` → capture `jobId`.
2. `GET /api/research/:jobId` every ~30–60s until `status === "done"`, then use the payload.

The `formattedHTML` is email-safe (table-based, inline-styled, with a text wordmark
fallback for blocked images) — paste it straight into an email body.

---

## Response schema

```jsonc
{
  "data": {
    "inputCompany": {
      "companyName": "string",
      "domain": "string",
      "icpSummary": "string",      // one rich paragraph
      "targetBuyer": "string",     // persona/title; drives AI-Ark seniority
      "valueProp": "string",
      "services": ["string"],
      "painsSolved": ["string"],
      "uniqueInsight": "string"
    },
    "signals": {
      "signals": [
        { "signal": "string", "indicator": "string", "why": "string" }
      ],
      "icpPattern": "string"        // one-sentence ICP theme
    },
    "companies": [
      {
        "name": "string",
        "domain": "string",
        "matchReason": "string",    // what they're doing RIGHT NOW
        "contacts": [
          {
            "firstName": "string",
            "lastName": "string",
            "title": "string",
            "email": "string",      // only contacts WITH an email are included
            "linkedIn": "string"
          }
        ],
        "notFound": false           // true when AI-Ark returned no emailable contacts
      }
    ]
  },
  "formattedHTML": "string",        // ready-to-render Cymate-branded card
  "formattedText": "string",        // ready-to-send plain text
  "meta": {
    "generatedAt": "ISO-8601 string",
    "inputDomain": "string",
    "totalCompanies": 0,
    "totalContacts": 0
  }
}
```

Notes:
- If Step 3 finds fewer than 4 high-confidence companies, the engine returns what
  it found — it never pads with uncertain results.
- Discovered domains are DNS-validated; unresolvable (likely hallucinated) domains
  are dropped before enrichment.

---

## Project structure

```
server.ts                         Express entry point (auth, routes)
src/
  engine/
    companyResearcher.ts           Step 1
    signalGenerator.ts             Step 2
    companyDiscovery.ts            Step 3 — deep web discovery (+ DNS validation, retry)
    contactEnricher.ts             Step 4 (AI-Ark MCP, concurrent, 5 req/s)
  api/
    research.ts                    POST (start job) + GET (poll) handlers
    jobs.ts                        in-memory async job store + optional callback POST
    pipeline.ts                    the 5-step orchestration
  utils/
    formatter.ts                   Step 5 — HTML + text (owns the brand template)
    domainResolver.ts              email/URL -> domain
    claudeResearch.ts              Claude web-search calls + JSON extraction
    logger.ts
  types/index.ts                   shared interfaces
  web/index.html                   self-contained UI
```

## Rebranding

All brand values (colors, fonts, wordmark, optional logo) live in the `brand`
object at the top of [`src/utils/formatter.ts`](src/utils/formatter.ts). Change
them there (or set `BRAND_LOGO_URL`) to rebrand the entire output.
