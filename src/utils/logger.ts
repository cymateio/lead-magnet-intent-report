// Minimal timestamped, step-labelled structured logger.

type Level = "info" | "warn" | "error";

function emit(level: Level, step: string, message: string, extra?: unknown): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}] [${step}]`;
  const line = `${prefix} ${message}`;
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (extra !== undefined) {
    sink(line, typeof extra === "string" ? extra : JSON.stringify(extra));
  } else {
    sink(line);
  }
}

export const logger = {
  info: (step: string, message: string, extra?: unknown) => emit("info", step, message, extra),
  warn: (step: string, message: string, extra?: unknown) => emit("warn", step, message, extra),
  error: (step: string, message: string, extra?: unknown) => emit("error", step, message, extra),
};
