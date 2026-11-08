import { z } from "zod";

/** Vendor boundary for exchange rates. Swap the implementation without touching callers. */
export interface FetchedRates {
  base: string;
  rates: Record<string, number>;
  /** Date the provider says the rates were published (YYYY-MM-DD, UTC). */
  asOf: string;
}
export interface RateProvider {
  fetchLatest(base: string): Promise<FetchedRates>;
}

// Shape verified against https://open.er-api.com/v6/latest/USD on 2026-11-08 and the Open Access docs:
// { result: "success", base_code, time_last_update_utc, rates: { CODE: number } }
// Terms: attribution link required ("Rates By Exchange Rate API"); request at most about once per day.
const responseSchema = z.object({
  result: z.literal("success"),
  base_code: z.string(),
  time_last_update_utc: z.string(),
  rates: z.record(z.string(), z.number()),
});

export class OpenErApiProvider implements RateProvider {
  async fetchLatest(base: string): Promise<FetchedRates> {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`FX provider responded ${res.status}`); // 429 = rate limited (20 min cool-down)
    const parsed = responseSchema.parse(await res.json());
    const updated = new Date(parsed.time_last_update_utc);
    if (Number.isNaN(updated.getTime())) throw new Error("FX provider returned an unreadable date");
    const rates: Record<string, number> = {};
    for (const [code, rate] of Object.entries(parsed.rates)) {
      if (/^[A-Z]{3}$/.test(code) && rate > 0 && Number.isFinite(rate)) rates[code] = rate;
    }
    return { base: parsed.base_code, rates, asOf: updated.toISOString().slice(0, 10) };
  }
}

export const FX_ATTRIBUTION = { href: "https://www.exchangerate-api.com", label: "Rates By Exchange Rate API" };
