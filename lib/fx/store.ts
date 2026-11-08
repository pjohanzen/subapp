import type { SupabaseClient } from "@supabase/supabase-js";
import type { RateTable } from "../currency";
import { daysBetween } from "../renewals";
import { OpenErApiProvider, type RateProvider } from "./provider";

export const RATE_BASE = "USD";
const REFRESH_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Read the cached rate table (RLS: any signed-in user can read). Null if nothing has ever been stored. */
export async function loadRateTable(db: SupabaseClient): Promise<RateTable | null> {
  const { data, error } = await db
    .from("exchange_rates")
    .select("currency, rate, rate_date")
    .eq("base_currency", RATE_BASE)
    .limit(1000);
  if (error || !data || data.length === 0) return null;
  const rates: Record<string, number> = {};
  let asOf = data[0].rate_date as string;
  for (const r of data) {
    rates[r.currency as string] = Number(r.rate);
    if ((r.rate_date as string) < asOf) asOf = r.rate_date as string;
  }
  return { base: RATE_BASE, rates, asOf };
}

/**
 * Fetch and upsert rates if the cache is missing or older than today. Needs a service-role client (writes).
 * On provider failure the previous rows are left untouched so the last stored rate stays usable.
 */
export async function refreshRates(
  admin: SupabaseClient,
  today: string,
  provider: RateProvider = new OpenErApiProvider(),
  { force = false }: { force?: boolean } = {},
): Promise<{ refreshed: boolean; asOf: string | null; error?: string }> {
  const current = await loadRateTable(admin);
  if (!force && current) {
    // Respect the provider's "about once per day" guidance: never fetch twice within 12h, even if its data is a day old.
    const { data: latest } = await admin
      .from("exchange_rates")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1);
    const last = latest?.[0]?.fetched_at ? new Date(latest[0].fetched_at as string).getTime() : 0;
    if (Date.now() - last < REFRESH_MIN_INTERVAL_MS || daysBetween(current.asOf, today) <= 0) {
      return { refreshed: false, asOf: current.asOf };
    }
  }
  try {
    const fetched = await provider.fetchLatest(RATE_BASE);
    const rows = Object.entries(fetched.rates).map(([currency, rate]) => ({
      base_currency: fetched.base,
      currency,
      rate,
      rate_date: fetched.asOf,
      fetched_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin.from("exchange_rates").upsert(rows.slice(i, i + 200), { onConflict: "base_currency,currency" });
      if (error) throw new Error(error.message);
    }
    return { refreshed: true, asOf: fetched.asOf };
  } catch (e) {
    return { refreshed: false, asOf: current?.asOf ?? null, error: e instanceof Error ? e.message : "unknown error" };
  }
}
