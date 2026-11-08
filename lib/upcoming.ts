import { addDays, daysBetween, rollForward } from "./renewals";
import type { SubscriptionRow } from "./types";

/** The renewal date to show: the stored one, rolled forward in memory if the daily job hasn't run yet. */
export function effectiveNext(s: SubscriptionRow, today: string): string {
  if (s.next_renewal > today) return s.next_renewal;
  try {
    return rollForward(s.next_renewal, today, { cycle: s.cycle, intervalCount: s.interval_count, anchorDay: s.anchor_day ?? Number(s.next_renewal.slice(8, 10)) }).next;
  } catch {
    return s.next_renewal;
  }
}

export function upcoming(subs: SubscriptionRow[], today: string, withinDays: number) {
  const end = addDays(today, withinDays);
  return subs
    .filter((s) => s.status === "active" || s.status === "trial")
    .map((s) => ({ sub: s, date: effectiveNext(s, today) }))
    .filter(({ date }) => date >= today && date <= end)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((x) => ({ ...x, inDays: daysBetween(today, x.date) }));
}
