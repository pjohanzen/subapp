import type { SupabaseClient } from "@supabase/supabase-js";
import type { CronStore, CronUser, PaymentInput, ReminderClaim } from "./daily";
import type { SubscriptionRow } from "../types";

const UNIQUE_VIOLATION = "23505";

/** Service-role implementation. Idempotency comes from the unique keys in the schema. */
export function createSupabaseCronStore(admin: SupabaseClient): CronStore {
  return {
    async listUsers() {
      const emails = new Map<string, string>();
      for (let page = 1; ; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(error.message);
        for (const u of data.users) if (u.email) emails.set(u.id, u.email);
        if (data.users.length < 200) break;
      }
      const [{ data: profiles, error: pe }, { data: reminders, error: re }] = await Promise.all([
        admin.from("profiles").select("id, timezone"),
        admin.from("reminders").select("user_id, days_before"),
      ]);
      if (pe) throw new Error(pe.message);
      if (re) throw new Error(re.message);
      const days = new Map<string, number[]>();
      for (const r of reminders ?? []) days.set(r.user_id, [...(days.get(r.user_id) ?? []), r.days_before]);
      const users: CronUser[] = [];
      for (const p of profiles ?? []) {
        const email = emails.get(p.id);
        if (email) users.push({ id: p.id, email, timezone: p.timezone, reminderDays: days.get(p.id) ?? [] });
      }
      return users;
    },

    async listSubscriptions(userId) {
      const { data, error } = await admin
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["active", "trial"]);
      if (error) throw new Error(error.message);
      return (data ?? []) as SubscriptionRow[];
    },

    async recordPayment(p: PaymentInput) {
      const { error } = await admin.from("payments").insert(p);
      if (!error) return true;
      if (error.code === UNIQUE_VIOLATION) return false;
      throw new Error(error.message);
    },

    async updateNextRenewal(id, next) {
      const { error } = await admin.from("subscriptions").update({ next_renewal: next }).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async claimReminder(c: ReminderClaim) {
      const { data, error } = await admin.from("reminder_log").insert({ ...c, status: "pending" }).select("id").single();
      if (!error) return data.id as string;
      if (error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
      // Already claimed. Only a previously failed attempt may be re-claimed, atomically.
      const { data: re, error: ue } = await admin
        .from("reminder_log")
        .update({ status: "pending", error: null })
        .eq("subscription_id", c.subscription_id)
        .eq("renewal_date", c.renewal_date)
        .eq("days_before", c.days_before)
        .eq("status", "failed")
        .select("id");
      if (ue) throw new Error(ue.message);
      return re && re.length > 0 ? (re[0].id as string) : null;
    },

    async finishReminder(id, status, error) {
      const { error: e } = await admin
        .from("reminder_log")
        .update({ status, error: error ?? null, sent_at: status === "sent" ? new Date().toISOString() : null })
        .eq("id", id);
      if (e) throw new Error(e.message);
    },
  };
}
