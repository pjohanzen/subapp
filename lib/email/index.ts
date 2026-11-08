import { createLogger, maskEmail } from "../log";

/** Vendor boundary for outgoing email. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export interface EmailDriver {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id?: string }>;
}

/** Log-only driver for local dev and for when no verified sending domain is configured. Sends nothing. */
export class LogEmailDriver implements EmailDriver {
  readonly name = "log";
  async send(message: EmailMessage) {
    createLogger("email-log-driver").info("email (not sent: log driver)", {
      to: maskEmail(message.to),
      subject: message.subject,
    });
    return {};
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Resend driver. Endpoint and fields verified against https://resend.com/docs/api-reference/emails/send-email :
 * POST https://api.resend.com/emails, Bearer auth, JSON { from, to, subject, html, text }.
 * Sending to arbitrary recipients requires a domain verified in Resend (WAITING ON EXTERNAL PARTY).
 */
export class ResendEmailDriver implements EmailDriver {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly retries = 2,
    private readonly baseDelayMs = 500,
  ) {}

  async send(message: EmailMessage) {
    let lastError = "unknown";
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { id?: string };
          return { id: typeof body.id === "string" ? body.id : undefined };
        }
        lastError = `Resend responded ${res.status}`;
        if (res.status !== 429 && res.status < 500) break; // 4xx other than 429: retrying won't help
      } catch (e) {
        lastError = e instanceof Error ? e.message : "network error";
      }
      if (attempt < this.retries) await sleep(this.baseDelayMs * 2 ** attempt);
    }
    throw new Error(lastError);
  }
}

export function getEmailDriver(env: NodeJS.ProcessEnv = process.env): EmailDriver {
  if (env.EMAIL_DRIVER === "resend" && env.RESEND_API_KEY && env.EMAIL_FROM) {
    return new ResendEmailDriver(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  return new LogEmailDriver();
}
