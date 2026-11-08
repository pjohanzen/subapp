import { minorExponent } from "./money";
import { daysBetween } from "./renewals";
import type { Cycle } from "./renewals";

/**
 * Rates relative to one base: rates[X] = units of X per 1 unit of `base` (base itself is implicitly 1).
 * `asOf` is the date the rates were published/fetched (YYYY-MM-DD).
 */
export interface RateTable {
  base: string;
  rates: Record<string, number>;
  asOf: string;
}

export const STALE_AFTER_DAYS = 3;

/** Multiplier turning one billing charge into a monthly equivalent. weekly x 52/12, yearly / 12, custom = N days. */
export function monthlyFactor(cycle: Cycle, intervalCount: number): number {
  const n = Math.max(1, intervalCount);
  switch (cycle) {
    case "weekly":
      return 52 / 12 / n;
    case "monthly":
      return 1 / n;
    case "yearly":
      return 1 / (12 * n);
    case "custom":
      // Consistent with weekly: 7 days == 52/12 per month.
      return 364 / 12 / n;
  }
}

function rateOf(code: string, table: RateTable): number | null {
  if (code === table.base) return 1;
  const r = table.rates[code];
  return typeof r === "number" && r > 0 ? r : null;
}

/**
 * Convert minor units between currencies (handles different minor exponents).
 * Returns an unrounded value in the target's minor units, or null if either rate is missing.
 */
export function convertMinorExact(
  amountMinor: number,
  from: string,
  to: string,
  table: RateTable | null,
): number | null {
  const fromExp = minorExponent(from);
  const toExp = minorExponent(to);
  if (from === to) return amountMinor;
  if (!table) return null;
  const rf = rateOf(from, table);
  const rt = rateOf(to, table);
  if (rf === null || rt === null) return null;
  const major = amountMinor / 10 ** fromExp;
  return (major * (rt / rf)) * 10 ** toExp;
}

export function convertMinor(
  amountMinor: number,
  from: string,
  to: string,
  table: RateTable | null,
): number | null {
  const v = convertMinorExact(amountMinor, from, to, table);
  return v === null ? null : Math.round(v);
}

export interface PricedSubscription {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  cycle: Cycle;
  intervalCount: number;
  status: "active" | "trial" | "paused" | "cancelled";
  categoryId: string;
}

export interface Totals {
  monthlyMinor: number;
  yearlyMinor: number;
  byCategory: Record<string, number>; // monthly, home currency minor units
  /** Subscriptions left out of the totals because no usable rate exists. */
  excluded: { id: string; name: string; currency: string }[];
  counted: number;
  /** Set when rates exist but are older than STALE_AFTER_DAYS. */
  staleDays: number | null;
  /** True when no rate table is available at all. */
  ratesUnavailable: boolean;
}

/** Statuses that count towards spend. Paused and cancelled do not. */
export function countsTowardsSpend(status: PricedSubscription["status"]): boolean {
  return status === "active" || status === "trial";
}

export function computeTotals(
  subs: PricedSubscription[],
  home: string,
  table: RateTable | null,
  today: string,
): Totals {
  let monthly = 0;
  let counted = 0;
  const byCategoryExact: Record<string, number> = {};
  const excluded: Totals["excluded"] = [];

  for (const s of subs) {
    if (!countsTowardsSpend(s.status)) continue;
    const monthlyInOwn = s.amountMinor * monthlyFactor(s.cycle, s.intervalCount);
    const homeValue = convertMinorExact(monthlyInOwn, s.currency, home, table);
    if (homeValue === null) {
      excluded.push({ id: s.id, name: s.name, currency: s.currency });
      continue;
    }
    monthly += homeValue;
    byCategoryExact[s.categoryId] = (byCategoryExact[s.categoryId] ?? 0) + homeValue;
    counted++;
  }

  const byCategory: Record<string, number> = {};
  for (const [k, v] of Object.entries(byCategoryExact)) byCategory[k] = Math.round(v);

  const needsRates = subs.some((s) => countsTowardsSpend(s.status) && s.currency !== home);
  const age = table ? daysBetween(table.asOf, today) : null;
  return {
    monthlyMinor: Math.round(monthly),
    yearlyMinor: Math.round(monthly * 12),
    byCategory,
    excluded,
    counted,
    staleDays: needsRates && age !== null && age > STALE_AFTER_DAYS ? age : null,
    ratesUnavailable: needsRates && table === null,
  };
}
