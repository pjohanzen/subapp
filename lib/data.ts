import type { SupabaseClient } from "@supabase/supabase-js";
import type { Named, SubscriptionRow } from "./types";

export async function loadCore(db: SupabaseClient) {
  const [subs, cats, pms] = await Promise.all([
    db.from("subscriptions").select("*").order("next_renewal"),
    db.from("categories").select("id, name").order("name"),
    db.from("payment_methods").select("id, name").order("name"),
  ]);
  return {
    subs: (subs.data ?? []) as SubscriptionRow[],
    categories: (cats.data ?? []) as Named[],
    paymentMethods: (pms.data ?? []) as Named[],
    failed: Boolean(subs.error || cats.error || pms.error),
  };
}
