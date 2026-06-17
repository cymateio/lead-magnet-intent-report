import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import { handleCreateResearch, handleGetResearch } from "./src/api/research";
import { logger } from "./src/utils/logger";

dotenv.config();

/** Locate web/index.html across dev (ts-node) and compiled (dist) layouts. */
function resolveIndexHtml(): string {
  const candidates = [
    path.join(__dirname, "src", "web", "index.html"),
    path.join(__dirname, "..", "src", "web", "index.html"),
    path.join(process.cwd(), "src", "web", "index.html"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json({ limit: "1mb" }));

// --- Health (open) ---
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// --- Web UI (open) ---
const indexHtml = resolveIndexHtml();
app.get("/", (_req: Request, res: Response) => {
  res.sendFile(indexHtml);
});

// --- Brand logo (open) — served from src/web/cymate-logo.png ---
const logoPath = path.join(path.dirname(indexHtml), "cymate-logo.png");
app.get("/brand/logo.png", (_req: Request, res: Response) => {
  res.sendFile(logoPath);
});

// --- Optional auth middleware ---
// Auth is OFF by default (open API). Set WEBHOOK_SECRET to require the
// X-Webhook-Secret header; leave it unset and anyone can call the endpoint.
function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return next(); // open
  if (req.header("X-Webhook-Secret") !== expected) {
    res.status(401).json({ error: "Invalid or missing X-Webhook-Secret header." });
    return;
  }
  next();
}

// --- Research endpoints ---
// POST starts a background job and returns 202 immediately; GET polls for the result.
app.post("/api/research", optionalAuth, handleCreateResearch);
app.get("/api/research/:jobId", optionalAuth, handleGetResearch);

app.listen(PORT, () => {
  logger.info("server", `Signal Research Engine listening on http://localhost:${PORT}`);
});
