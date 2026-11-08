/** Structured JSON logs with a correlation id. Redacts email addresses and anything that looks like a secret. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

const SENSITIVE_KEY = /(key|secret|token|password|authorization|cookie)/i;

function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, (m) => maskEmail(m));
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v)]),
    );
  }
  return value;
}

export function createLogger(correlationId: string) {
  const emit = (level: "info" | "warn" | "error", msg: string, fields?: Record<string, unknown>) => {
    const line = JSON.stringify({ level, msg, correlationId, ts: new Date().toISOString(), ...(redact(fields ?? {}) as object) });
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  };
  return {
    info: (msg: string, f?: Record<string, unknown>) => emit("info", msg, f),
    warn: (msg: string, f?: Record<string, unknown>) => emit("warn", msg, f),
    error: (msg: string, f?: Record<string, unknown>) => emit("error", msg, f),
  };
}
export type Logger = ReturnType<typeof createLogger>;
