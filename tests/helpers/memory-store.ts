import type { CronStore, CronUser, PaymentInput, ReminderClaim } from "@/lib/cron/daily";
import type { SubscriptionRow } from "@/lib/types";

/** In-memory CronStore that enforces the same unique keys as the SQL schema. */
export class MemoryStore implements CronStore {
  payments = new Map<string, PaymentInput>(); // key: subscription_id|paid_on
  reminders = new Map<string, ReminderClaim & { id: string; status: string; error?: string }>(); // key: sub|date|days
  private n = 0;
  constructor(public users: CronUser[], public subs: SubscriptionRow[]) {}

  async listUsers() { return this.users; }
  async listSubscriptions(userId: string) {
    return this.subs.filter((s) => s.user_id === userId && (s.status === "active" || s.status === "trial")).map((s) => ({ ...s }));
  }
  async recordPayment(p: PaymentInput) {
    const k = `${p.subscription_id}|${p.paid_on}`;
    if (this.payments.has(k)) return false;
    this.payments.set(k, p);
    return true;
  }
  async updateNextRenewal(id: string, next: string) {
    const s = this.subs.find((x) => x.id === id)!;
    s.next_renewal = next;
  }
  async claimReminder(c: ReminderClaim) {
    const k = `${c.subscription_id}|${c.renewal_date}|${c.days_before}`;
    const existing = this.reminders.get(k);
    if (!existing) {
      const id = `log-${++this.n}`;
      this.reminders.set(k, { ...c, id, status: "pending" });
      return id;
    }
    if (existing.status === "failed") {
      existing.status = "pending";
      return existing.id;
    }
    return null;
  }
  async finishReminder(id: string, status: "sent" | "failed", error?: string) {
    for (const r of this.reminders.values()) if (r.id === id) Object.assign(r, { status, error });
  }
}
