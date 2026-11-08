import { beforeEach, describe, expect, it } from "vitest";
import { runDaily } from "@/lib/cron/daily";
import type { EmailDriver, EmailMessage } from "@/lib/email";
import { createLogger } from "@/lib/log";
import type { SubscriptionRow } from "@/lib/types";
import { MemoryStore } from "./helpers/memory-store";

class FakeEmail implements EmailDriver {
  name = "fake";
  sent: EmailMessage[] = [];
  failNext = 0;
  async send(m: EmailMessage) {
    if (this.failNext > 0) { this.failNext--; throw new Error("boom"); }
    this.sent.push(m);
    return { id: "x" };
  }
}

const sub = (o: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: "s1", user_id: "u1", name: "Netflix", amount_minor: 54900, currency: "PHP", cycle: "monthly", interval_count: 1,
  next_renewal: "2026-11-15", anchor_day: null, category_id: "c", payment_method_id: "p", status: "active", notes: null, ...o,
});
const user = { id: "u1", email: "me@example.com", timezone: "Asia/Manila", reminderDays: [1, 3, 7] };
const log = createLogger("test");
// 2026-11-08 12:00 UTC == 20:00 in Manila (same calendar day)
const now = new Date("2026-11-08T12:00:00Z");

let email: FakeEmail;
beforeEach(() => { email = new FakeEmail(); });

describe("daily cron idempotency", () => {
  it("running twice the same day: one payment per renewal date, one reminder per (sub, date, days_before)", async () => {
    // Overdue sub (was due Nov 1, rolls to Dec 1, 23 days away) + a sub due in exactly 7 days.
    const store = new MemoryStore([user], [
      sub({ id: "overdue", next_renewal: "2026-11-01" }),
      sub({ id: "soon", name: "Spotify", next_renewal: "2026-11-15" }),
    ]);
    const r1 = await runDaily({ store, email, now, log });
    const r2 = await runDaily({ store, email, now, log });

    expect(r1.paymentsRecorded).toBe(1);
    expect(r2.paymentsRecorded).toBe(0);
    expect([...store.payments.keys()]).toEqual(["overdue|2026-11-01"]);

    expect(r1.remindersSent).toBe(1);
    expect(r2.remindersSent).toBe(0);
    expect(store.reminders.size).toBe(1);
    expect([...store.reminders.keys()]).toEqual(["soon|2026-11-15|7"]);
    expect(email.sent).toHaveLength(1);
    expect(store.subs.find((s) => s.id === "overdue")!.next_renewal).toBe("2026-12-01");
  });

  it("catches up several missed periods with one payment each, once", async () => {
    const store = new MemoryStore([user], [sub({ id: "m", next_renewal: "2026-08-31", anchor_day: 31 })]);
    await runDaily({ store, email, now, log });
    await runDaily({ store, email, now, log });
    expect([...store.payments.keys()].sort()).toEqual(["m|2026-08-31", "m|2026-09-30", "m|2026-10-31"]);
    expect(store.subs[0].next_renewal).toBe("2026-11-30");
  });

  it("different days_before values each get their own single reminder across consecutive days", async () => {
    const store = new MemoryStore([user], [sub({ id: "x", next_renewal: "2026-11-15" })]);
    for (const day of ["2026-11-08", "2026-11-12", "2026-11-14"]) {
      const d = new Date(`${day}T12:00:00Z`);
      await runDaily({ store, email, now: d, log });
      await runDaily({ store, email, now: d, log });
    }
    expect([...store.reminders.keys()].sort()).toEqual(["x|2026-11-15|1", "x|2026-11-15|3", "x|2026-11-15|7"]);
    expect(email.sent).toHaveLength(3);
  });

  it("respects the user's reminder settings", async () => {
    const store = new MemoryStore([{ ...user, reminderDays: [1] }], [sub({ next_renewal: "2026-11-15" })]);
    await runDaily({ store, email, now, log });
    expect(email.sent).toHaveLength(0);
  });

  it("uses each user's own time zone for 'today'", async () => {
    // 2026-11-08T20:00Z is Nov 9 in Manila but Nov 8 in Los Angeles. A sub due Nov 9 is due today in Manila only.
    const late = new Date("2026-11-08T20:00:00Z");
    const store = new MemoryStore(
      [user, { ...user, id: "u2", timezone: "America/Los_Angeles" }],
      [sub({ id: "a", user_id: "u1", next_renewal: "2026-11-09" }), sub({ id: "b", user_id: "u2", next_renewal: "2026-11-09" })],
    );
    await runDaily({ store, email, now: late, log });
    expect([...store.payments.keys()]).toEqual(["a|2026-11-09"]);
  });

  it("a failed send is not recorded as sent, is retried next run, and never double-sends after success", async () => {
    const store = new MemoryStore([user], [sub({ next_renewal: "2026-11-15" })]);
    email.failNext = 1;
    const r1 = await runDaily({ store, email, now, log });
    expect(r1.remindersFailed).toBe(1);
    expect(email.sent).toHaveLength(0);
    const r2 = await runDaily({ store, email, now, log });
    expect(r2.remindersSent).toBe(1);
    const r3 = await runDaily({ store, email, now, log });
    expect(r3.remindersSent).toBe(0);
    expect(email.sent).toHaveLength(1);
  });

  it("isolates failures per user", async () => {
    const store = new MemoryStore([user, { ...user, id: "u2", timezone: "Not/AZone" }], [sub({ user_id: "u1", next_renewal: "2026-11-15" })]);
    const r = await runDaily({ store, email, now, log });
    expect(r.errors).toBe(1);
    expect(r.remindersSent).toBe(1);
  });

  it("cancelled/paused subs are ignored", async () => {
    const store = new MemoryStore([user], [sub({ status: "cancelled", next_renewal: "2026-11-01" })]);
    const r = await runDaily({ store, email, now, log });
    expect(r.paymentsRecorded).toBe(0);
  });
});
