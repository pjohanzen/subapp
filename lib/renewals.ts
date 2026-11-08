/**
 * Renewal date math. Dates are calendar dates as "YYYY-MM-DD" strings and all arithmetic is done in UTC,
 * so there is no DST dependency. Time zones only matter for deciding what "today" is (see todayInTimezone).
 */

export type Cycle = "weekly" | "monthly" | "yearly" | "custom";

export interface RecurrenceRule {
  cycle: Cycle;
  /** weekly: every N weeks; monthly: every N months; yearly: every N years; custom: every N days. */
  intervalCount: number;
  /** Original day-of-month (1-31). Prevents Jan 31 -> Feb 28 -> Mar 28 drift. Defaults to the date's own day. */
  anchorDay?: number | null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function parseDate(s: string): { y: number; m: number; d: number } {
  if (!isValidDate(s)) throw new Error(`Invalid date: ${s}`);
  const m = DATE_RE.exec(s)!;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function formatDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toUtcMs(s: string): number {
  const { y, m, d } = parseDate(s);
  return Date.UTC(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const dt = new Date(toUtcMs(s) + n * 86_400_000);
  return formatDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

/** Add months, clamping to month-end (Jan 31 + 1 month = Feb 28/29). `anchorDay` restores the day when it fits. */
export function addMonths(s: string, months: number, anchorDay?: number | null): string {
  const { y, m, d } = parseDate(s);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const wanted = Math.max(anchorDay ?? d, 1);
  return formatDate(ny, nm, Math.min(wanted, daysInMonth(ny, nm)));
}

/** The renewal after `date` for the given rule. */
export function advance(date: string, rule: RecurrenceRule): string {
  const n = rule.intervalCount;
  if (!Number.isInteger(n) || n < 1) throw new Error("intervalCount must be a positive integer");
  switch (rule.cycle) {
    case "weekly":
      return addDays(date, 7 * n);
    case "custom":
      return addDays(date, n);
    case "monthly":
      return addMonths(date, n, rule.anchorDay);
    case "yearly":
      return addMonths(date, 12 * n, rule.anchorDay);
  }
}

/**
 * Roll an overdue renewal forward until it is strictly after `today`.
 * Returns each renewal date that has passed (these become `payments` rows) and the new next date.
 * A date equal to `today` counts as due today and is rolled (the charge happens today).
 */
export function rollForward(
  next: string,
  today: string,
  rule: RecurrenceRule,
  maxSteps = 1000,
): { passed: string[]; next: string } {
  const passed: string[] = [];
  let cur = next;
  let steps = 0;
  while (cur <= today) {
    if (++steps > maxSteps) throw new Error("rollForward exceeded maxSteps");
    passed.push(cur);
    cur = advance(cur, rule);
  }
  return { passed, next: cur };
}

/** All renewal dates within [from, to] inclusive, starting at `next` (for the calendar). */
export function occurrencesBetween(
  next: string,
  rule: RecurrenceRule,
  from: string,
  to: string,
  maxSteps = 2000,
): string[] {
  const out: string[] = [];
  let cur = next;
  let steps = 0;
  while (cur <= to) {
    if (++steps > maxSteps) break;
    if (cur >= from) out.push(cur);
    cur = advance(cur, rule);
  }
  return out;
}

/** Today's calendar date in an IANA time zone, as YYYY-MM-DD. */
export function todayInTimezone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Next date on/after `today` that falls on day-of-month `day` (clamped to short months). */
export function nextOnDayOfMonth(day: number, today: string): string {
  const { y, m, d } = parseDate(today);
  const thisMonth = formatDate(y, m, Math.min(day, daysInMonth(y, m)));
  if (thisMonth >= today && d <= daysInMonth(y, m)) return thisMonth;
  return addMonths(formatDate(y, m, 1), 1, day);
}
