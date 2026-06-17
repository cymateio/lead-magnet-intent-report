import crypto from "crypto";
import axios from "axios";
import { ResearchResponse } from "../types";
import { runPipeline } from "./pipeline";
import { resolveDomain } from "../utils/domainResolver";
import { sendReportEmail } from "../utils/mailer";
import { logger } from "../utils/logger";

const STEP = "jobs";

export type JobStatus = "pending" | "running" | "done" | "error";

export interface Job {
  id: string;
  status: JobStatus;
  input: string;
  inputDomain: string;
  createdAt: string;
  updatedAt: string;
  callbackUrl?: string;
  email?: string;
  result?: ResearchResponse;
  error?: string;
}

/**
 * In-memory job store. Deep research runs as a background job (can take 10+ min);
 * callers poll GET /api/research/:id or receive a callback POST when complete.
 *
 * Note: in-memory means jobs do not survive a restart and are not shared across
 * instances. Run a single instance, or swap this for a shared store (Redis/DB)
 * if you scale out.
 */
const jobs = new Map<string, Job>();

// Drop finished jobs after a while so memory doesn't grow unbounded.
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS) || 6 * 60 * 60 * 1000; // 6h

function nowIso(): string {
  return new Date().toISOString();
}

/** Create a job and kick off the pipeline in the background. Returns immediately. */
export function createJob(input: string, opts?: { callbackUrl?: string; email?: string }): Job {
  const inputDomain = resolveDomain(input).domain; // validate up front (throws on bad input)
  const id = `job_${crypto.randomUUID()}`;
  const job: Job = {
    id,
    status: "pending",
    input,
    inputDomain,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    callbackUrl: opts?.callbackUrl,
    email: opts?.email,
  };
  jobs.set(id, job);

  // Fire-and-forget; the pipeline updates the job as it progresses.
  void run(job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

async function run(job: Job): Promise<void> {
  job.status = "running";
  job.updatedAt = nowIso();
  try {
    job.result = await runPipeline(job.input);
    job.status = "done";
  } catch (err) {
    job.status = "error";
    job.error = (err as Error).message;
    logger.error(STEP, `Job ${job.id} failed.`, job.error);
  } finally {
    job.updatedAt = nowIso();
    scheduleCleanup(job.id);
    await fireCallback(job);
    await fireEmail(job);
  }
}

async function fireEmail(job: Job): Promise<void> {
  if (!job.email || job.status !== "done" || !job.result) return;
  const company = job.result.data.inputCompany.companyName || job.inputDomain;
  await sendReportEmail({
    to: job.email,
    subject: `Your high-intent signal report for ${company}`,
    html: job.result.formattedHTML,
    text: job.result.formattedText,
  });
}

async function fireCallback(job: Job): Promise<void> {
  if (!job.callbackUrl) return;
  try {
    await axios.post(
      job.callbackUrl,
      job.status === "done"
        ? { jobId: job.id, status: job.status, ...job.result }
        : { jobId: job.id, status: job.status, error: job.error },
      { timeout: 30_000, headers: { "Content-Type": "application/json" } }
    );
    logger.info(STEP, `Callback delivered for ${job.id} -> ${job.callbackUrl}`);
  } catch (err) {
    logger.warn(STEP, `Callback failed for ${job.id}: ${(err as Error).message}`);
  }
}

function scheduleCleanup(id: string): void {
  const t = setTimeout(() => jobs.delete(id), JOB_TTL_MS);
  if (typeof t.unref === "function") t.unref();
}

/** Public view of a job — omits internal fields. */
export function jobView(job: Job): Record<string, unknown> {
  const base = {
    jobId: job.id,
    status: job.status,
    inputDomain: job.inputDomain,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
  if (job.status === "done") return { ...base, ...job.result };
  if (job.status === "error") return { ...base, error: job.error };
  return base;
}
