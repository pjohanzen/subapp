import { daysBetween, rollForward, todayInTimezone, type RecurrenceRule } from "../renewals";
import { formatMoney } from "../money";
import type { EmailDriver } from "../email";
import type { Logger } from "../log";
import { maskEmail } from "../log";
import type { SubscriptionRow } from "../types";

export interface CronUser {
  id: string;
  email: string;
  timezone: string;
  reminderDays: number[];
}

export interface PaymentInput {
  user_id: string;
  subscription_id: string;
  paid_on: string;
  amount_minor: number;
  currency: string;
}
export interface ReminderClaim {
  user_id: string;
  subscription_id: string;
  renewal_date: string;
  days_before: number;
  driver: string;
}

/** Persistence boundary for the job. The Supabase implementation relies on unique keys for idempotency. */
export interface CronStore {
  listUsers(): Promise<CronUser[]>;
  listSubscriptions(userId: string): Promise<SubscriptionRow[]>;
  /** Returns true if a new row was written, false if (subscription_id, paid_on) already existed. */
  recordPayment(p: PaymentInput): Promise<boolean>;
  updateNextRenewal(subscriptionId: string, next: string): Promise<void>;
  /** Insert-or-skip on (subscription_id, renewal_date, days_before). Returns a log id if THIS call claimed it, else null.
   *  A previously 'failed' row may be re-claimed so a later run can retry. */
  claimReminder(c: ReminderClaim): Promise<string | null>;
  finishReminder(id: string, status: "sent" | "failed", error?: string): Promise<void>;
}

export interface DailyResult {
  users: number;
  paymentsRecorded: number;
  rolled: number;
  remindersSent: number;
  remindersFailed: number;
  errors: number;
}

function ruleOf(s: SubscriptionRow): RecurrenceRule {
  return { cycle: s.cycle, intervalCount: s.interval_count, anchorDay: s.anchor_day };
}

export function buildDigest(items: { sub: SubscriptionRow; daysBefore: number }[]): { subject: string; text: string; html: string } {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const lines = items.map(({ sub, daysBefore }) => {
    const when = daysBefore === 1 ? "tomorrow" : `in ${daysBefore} days`;
    return { plain: `${sub.name}: ${formatMoney(sub.amount_minor, sub.currency)} renews ${when} (${sub.next_renewal})`, html: `<li><strong>${esc(sub.name)}</strong>: ${esc(formatMoney(sub.amount_minor, sub.currency))} renews ${when} (${sub.next_renewal})</li>` };
  });
  const subject = items.length === 1 ? `${items[0].sub.name} renews ${items[0].daysBefore === 1 ? "tomorrow" : `in ${items[0].daysBefore} days`}` : `${items.length} subscriptions renew soon`;
  return {
    subject,
    text: `Upcoming renewals:\n\n${lines.map((l) => l.plain).join("\n")}\n`,
    html: `<p>Upcoming renewals:</p><ul>${lines.map((l) => l.html).join("")}</ul>`,
  };
}

/**
 * Daily job: for each user (in their own time zone) 1) roll overdue renewals forward and write a payment per passed date,
 * then 2) send reminders. Safe to run any number of times for the same day:
 *  - payments: unique (subscription_id, paid_on); next_renewal is only moved after payments are recorded
 *  - reminders: claimed by inserting into reminder_log first; only the claimer sends
 * Delivery is at-most-once per (subscription, renewal date, days_before); a crash after claim and before send loses
 * that single reminder rather than risking a duplicate. Failed sends are marked 'failed' and retried on the next run.
 */
export async function runDaily(deps: { store: CronStore; email: EmailDriver; now: Date; log: Logger }): Promise<DailyResult> {
  const { store, email, now, log } = deps;
  const result: DailyResult = { users: 0, paymentsRecorded: 0, rolled: 0, remindersSent: 0, remindersFailed: 0, errors: 0 };

  const users = await store.listUsers();
  for (const user of users) {
    result.users++;
    try {
      const today = todayInTimezone(now, user.timezone);
      const subs = await store.listSubscriptions(user.id);

      // 1) roll forward + payments
      const current: SubscriptionRow[] = [];
      for (const sub of subs) {
        if (sub.next_renewal > today) {
          current.push(sub);
          continue;
        }
        const rule = { ...ruleOf(sub), anchorDay: sub.anchor_day ?? Number(sub.next_renewal.slice(8, 10)) };
        const { passed, next } = rollForward(sub.next_renewal, today, rule);
        for (const date of passed) {
          const inserted = await store.recordPayment({
            user_id: user.id, subscription_id: sub.id, paid_on: date, amount_minor: sub.amount_minor, currency: sub.currency,
          });
          if (inserted) result.paymentsRecorded++;
        }
        await store.updateNextRenewal(sub.id, next);
        result.rolled++;
        log.info("rolled renewal", { subscription_id: sub.id, from: sub.next_renewal, to: next, payments: passed.length });
        current.push({ ...sub, next_renewal: next });
      }

      // 2) reminders
      const claimed: { sub: SubscriptionRow; daysBefore: number; logId: string }[] = [];
      for (const sub of current) {
        const daysLeft = daysBetween(today, sub.next_renewal);
        if (!user.reminderDays.includes(daysLeft)) continue;
        const logId = await store.claimReminder({
          user_id: user.id, subscription_id: sub.id, renewal_date: sub.next_renewal, days_before: daysLeft, driver: email.name,
        });
        if (logId) claimed.push({ sub, daysBefore: daysLeft, logId });
      }
      if (claimed.length > 0) {
        const digest = buildDigest(claimed);
        try {
          const sent = await email.send({ to: user.email, ...digest });
          for (const c of claimed) await store.finishReminder(c.logId, "sent");
          result.remindersSent += claimed.length;
          log.info("reminders sent", { user_id: user.id, to: maskEmail(user.email), count: claimed.length, driver: email.name, provider_id: sent.id });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "send failed";
          for (const c of claimed) await store.finishReminder(c.logId, "failed", msg);
          result.remindersFailed += claimed.length;
          log.error("reminder send failed", { user_id: user.id, error: msg });
        }
      }
    } catch (e) {
      result.errors++;
      log.error("user failed", { user_id: user.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
