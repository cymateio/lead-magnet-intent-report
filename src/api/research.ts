import { Request, Response } from "express";
import { createJob, getJob, jobView } from "./jobs";
import { logger } from "../utils/logger";

const STEP = "api:research";

/**
 * POST /api/research
 * Body: { input: "email@company.com" | "company.com", callbackUrl?: "https://..." }
 * Starts a background research job and returns 202 with a job id + status URL.
 * If callbackUrl is provided, the final payload is POSTed there when complete.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function handleCreateResearch(req: Request, res: Response): void {
  const input = req?.body?.input;
  const callbackUrl = req?.body?.callbackUrl;
  let email = req?.body?.email;

  if (typeof input !== "string" || !input.trim()) {
    res.status(400).json({ error: 'Request body must include a non-empty "input" string.' });
    return;
  }
  if (callbackUrl !== undefined && (typeof callbackUrl !== "string" || !/^https?:\/\//.test(callbackUrl))) {
    res.status(400).json({ error: '"callbackUrl" must be an http(s) URL when provided.' });
    return;
  }
  if (email !== undefined && (typeof email !== "string" || !EMAIL_RE.test(email.trim()))) {
    res.status(400).json({ error: '"email" must be a valid email address when provided.' });
    return;
  }
  email = typeof email === "string" ? email.trim() : undefined;
  // If no explicit email was given but the input itself is an email, deliver there.
  if (!email && typeof input === "string" && EMAIL_RE.test(input.trim())) {
    email = input.trim();
  }

  try {
    const job = createJob(input, { callbackUrl, email });
    logger.info(STEP, `Job ${job.id} created for ${job.inputDomain}.`);
    res.status(202).json({
      jobId: job.id,
      status: job.status,
      statusUrl: `/api/research/${job.id}`,
      ...(job.email ? { emailTo: job.email } : {}),
    });
  } catch (err) {
    // resolveDomain throws on unparseable input.
    res.status(400).json({ error: (err as Error).message });
  }
}

/**
 * GET /api/research/:jobId
 * Returns job status; when status is "done", the body also contains the full
 * { data, formattedHTML, formattedText, meta } payload.
 */
export function handleGetResearch(req: Request, res: Response): void {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found (unknown id or expired)." });
    return;
  }
  res.status(200).json(jobView(job));
}
