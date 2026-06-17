# Deployment — cymate.io/report lead magnet

## Architecture
```
cymate.io/report (Framer form: email* + website*)
   └─ POST ─▶ Vercel intake API (site/api/intake.ts)
                 ├─ append lead row to Google Sheet (every email captured)
                 └─ trigger Trigger.dev "lead-magnet" task
                       └─ research task (PURE ENGINE) → emails the branded report (from report@…)
```
The engine (`src/engine/*`, `src/api/pipeline.ts`) is unchanged and reusable. New flows (e.g. the
positive-reply workflow) attach by triggering the `research` task (with an optional `callbackUrl`) —
no engine edits.

## What you create + share with me (I wire + deploy)
1. **Google**: service-account email, its private key, and the Sheet ID (steps below).
2. **Trigger.dev**: project ref + (optional) a deploy token if you want me to run the deploy.
3. **Vercel**: account (a token if you want me to deploy), or you run the two deploy commands.
4. **Sending email**: `report@<domain>` mailbox creds (SMTP user + pass) + the From address, and the
   DNS records added (SPF/DKIM/DMARC).

---

## 1) Google Sheet + service account
1. console.cloud.google.com → create a project → **APIs & Services → Enable APIs → enable "Google Sheets API"**.
2. **Credentials → Create credentials → Service account** → create → open it → **Keys → Add key → JSON** (downloads a JSON).
3. Create a Google Sheet. Header row (row 1):
   `Timestamp | Email | Website | Domain | Source | Trigger Run ID`
4. **Share** the Sheet with the service account's email (the `client_email` in the JSON) as **Editor**.
5. From the JSON, share with me: `client_email`, `private_key`, and the Sheet ID (the long id in the
   sheet URL `/d/<SHEET_ID>/edit`).

## 2) Sending email (dedicated report@ domain)
1. Put the new domain on **Google Workspace** (or any SMTP provider) and create `report@<domain>`.
2. Add DNS on that domain: **SPF**, **DKIM** (Workspace → Apps → Gmail → Authenticate email generates
   the key), **DMARC** (start `p=none`), and **MX** if you want to receive replies. I can give exact
   values once the provider is set.
3. If Google: enable 2-Step Verification on `report@…` → create a 16-char **App Password**.
4. Share: `SMTP_HOST` (smtp.gmail.com for Workspace), `SMTP_PORT` (465), `SMTP_USER`/`SMTP_PASS`
   (report@ + app password), `MAIL_FROM` (report@…).

## 3) Trigger.dev (the engine + workflows)
1. Create an account + a project at trigger.dev; copy the **project ref** (`proj_…`) into
   `trigger.config.ts` (or set `TRIGGER_PROJECT_REF`).
2. In the Trigger.dev project **Environment variables**, set:
   `ANTHROPIC_API_KEY`, `AIARK_MCP_URL`, `CLAUDE_MODEL=claude-sonnet-4-6`, `CLAUDE_DEEP_SEARCH_USES=6`,
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
3. Deploy the tasks (from the repo root):
   ```
   npx trigger.dev@latest login
   npx trigger.dev@latest deploy
   ```
   This deploys the `research` + `lead-magnet` tasks.

## 4) Vercel (intake API)
1. From `site/`: `vercel` (link/create project) then `vercel --prod`. Note the deployment URL.
2. Set Vercel **Environment Variables**:
   `TRIGGER_SECRET_KEY` (Trigger.dev → project → API keys → server/secret key),
   `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (paste the full key incl. `\n`),
   `SHEET_ID`.
   Your intake endpoint is `https://<vercel-deployment>/api/intake`.

## 5) cymate.io/report (Framer)
1. Create the `/report` page in Framer.
2. Add an **Embed (HTML)** element and paste `site/framer-embed.html`, replacing `INTAKE_URL` with
   your `https://<vercel-deployment>/api/intake`.

---

## Verification
1. **Engine:** Trigger.dev dashboard → test-run `research` with `{ "input": "cymate.io" }` → confirm
   it completes (no "terminated") and returns the report.
2. **Full flow:** submit the form on /report with a test email + website → a row appears in the Sheet
   immediately, a `lead-magnet` run starts, and the branded report email arrives (~15 min).
3. **Composability:** trigger `research` via the Trigger.dev API with a `callbackUrl` (webhook.site) →
   confirm the payload is POSTed there.

## Notes
- CORS on the intake is open (`*`) so the Framer page (and previews) can call it; the endpoint only
  logs a lead + triggers research. Consider adding a hCaptcha/turnstile or simple rate-limit later to
  deter abuse.
- The report email logo is embedded inline (no hosting needed).
- The existing Express app + `start-demo.bat` remain for local/manual runs; they are not part of this
  deployment.
