type LogLevel = "info" | "warn" | "error" | "debug";

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "DBG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
};

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(
  level: LogLevel,
  category: string,
  message: string,
  meta?: Record<string, unknown>
): string {
  const ts = formatTimestamp();
  const label = LEVEL_LABELS[level];
  const metaStr =
    meta && Object.keys(meta).length > 0
      ? " " + Object.entries(meta)
          .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join(" ")
      : "";
  return `${ts} ${label} [${category}] ${message}${metaStr}`;
}

function shouldLog(level: LogLevel): boolean {
  if (process.env.LOG_LEVEL === "debug") return true;
  if (level === "debug") return false;
  return true;
}

export const log = {
  info(category: string, message: string, meta?: Record<string, unknown>) {
    if (!shouldLog("info")) return;
    console.log(formatMessage("info", category, message, meta));
  },

  warn(category: string, message: string, meta?: Record<string, unknown>) {
    if (!shouldLog("warn")) return;
    console.warn(formatMessage("warn", category, message, meta));
  },

  error(
    category: string,
    message: string,
    error?: unknown,
    meta?: Record<string, unknown>
  ) {
    if (!shouldLog("error")) return;
    const errMeta: Record<string, unknown> = { ...meta };
    if (error instanceof Error) {
      errMeta.error = error.message;
      if (process.env.LOG_LEVEL === "debug" && error.stack) {
        errMeta.stack = error.stack;
      }
    } else if (error) {
      errMeta.error = String(error);
    }
    console.error(formatMessage("error", category, message, errMeta));
  },

  debug(category: string, message: string, meta?: Record<string, unknown>) {
    if (!shouldLog("debug")) return;
    console.log(formatMessage("debug", category, message, meta));
  },

  /** Log an HTTP request (call from middleware or API routes) */
  request(
    method: string,
    path: string,
    status: number,
    durationMs?: number,
    meta?: Record<string, unknown>
  ) {
    if (!shouldLog("info")) return;
    const m: Record<string, unknown> = { method, status, ...meta };
    if (durationMs !== undefined) m.duration = `${durationMs}ms`;
    console.log(formatMessage("info", "http", path, m));
  },
};
