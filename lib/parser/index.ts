/**
 * Rule-based quick-add parser. Pure: no I/O, no clock (pass `today`), no LLM.
 * "Netflix ₱549 monthly on the 15th" -> { name, amount, currency, cycle, nextRenewal } + per-field confidence.
 * The UI must always let the user confirm/edit before saving.
 */
import { addDays, advance, daysInMonth, formatDate, isValidDate, nextOnDayOfMonth, parseDate } from "../renewals";
import type { Cycle } from "../renewals";
import { toMinor } from "../money";

export const SYMBOL_TO_CURRENCY: Record<string, string> = {
  "₱": "PHP",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₩": "KRW",
  "₫": "VND",
  "฿": "THB",
  "$": "USD",
};

export const KNOWN_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "PHP", "INR", "AUD", "CAD", "NZD", "CHF", "CNY", "HKD", "SGD", "KRW",
  "THB", "VND", "IDR", "MYR", "TWD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY", "BRL", "MXN",
  "ZAR", "AED", "SAR", "ILS", "RUB", "UAH", "NGN", "EGP", "COP", "CLP", "ARS", "PEN",
]);

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

export interface ParseOptions {
  /** Today's date in the user's time zone, YYYY-MM-DD. */
  today: string;
  /** Used when no currency is found in the text. */
  defaultCurrency: string;
}

export type FieldName = "name" | "amount" | "currency" | "cycle" | "nextRenewal";

export interface ParsedSubscription {
  name: string;
  /** Decimal string as typed, normalised (e.g. "11.99"). Convert with toMinor(). */
  amount: string | null;
  amountMinor: number | null;
  currency: string;
  cycle: Cycle;
  intervalCount: number;
  nextRenewal: string;
  /** 0..1 per field. 0 means "not found, defaulted". */
  confidence: Record<FieldName, number>;
  /** True when enough was understood to prefill the form (a name and an amount). Otherwise show a blank form. */
  ok: boolean;
}

interface Hit {
  start: number;
  end: number;
}

function blank(s: string, h: Hit): string {
  return s.slice(0, h.start) + " ".repeat(h.end - h.start) + s.slice(h.end);
}

const AMOUNT = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;

function findAmountAndCurrency(text: string): {
  amount?: string;
  currency?: string;
  currencyFromSymbol?: boolean;
  hits: Hit[];
  consumed: string;
} {
  const hits: Hit[] = [];
  let consumed = text;
  const syms = Object.keys(SYMBOL_TO_CURRENCY).map((s) => (s === "$" ? "\\$" : s)).join("|");

  // 1) [CODE] [symbol] amount   e.g. "PHP 549", "USD$5", "$11.99", "₱549"
  const re1 = new RegExp(`(?:\\b([A-Za-z]{3})\\s*)?(${syms})?\\s*(${AMOUNT})(?![\\d])(?:\\s*([A-Za-z]{3})\\b)?`, "g");
  let best: { m: RegExpExecArray; code?: string; sym?: string } | null = null;
  for (const m of text.matchAll(re1)) {
    const pre = m[1]?.toUpperCase();
    const post = m[4]?.toUpperCase();
    const sym = m[2];
    const preOk = pre && KNOWN_CURRENCIES.has(pre) ? pre : undefined;
    const postOk = post && KNOWN_CURRENCIES.has(post) ? post : undefined;
    const idx = m.index!;
    // Skip digits that are part of ordinals/dates ("15th", "2026-03-05")
    const after = text.slice(idx + m[0].length);
    const before = text.slice(0, idx);
    if (/^(st|nd|rd|th)\b/i.test(after) && !sym && !preOk && !postOk) continue;
    if (/\d-$/.test(before) || /^-\d/.test(after)) continue;
    if (!sym && !preOk && !postOk) {
      // bare number: only accept if nothing better found, and not directly after "on"/"the"/month
      if (/\b(on|the|day)\s*$/i.test(before)) continue;
      if (/\b[a-z]{3,9}\s*$/i.test(before) && MONTHS[before.trim().split(/\s+/).pop()!.toLowerCase()]) continue;
      if (/^\s*(day|days|week|weeks|month|months|year|years|yr|yrs)\b/i.test(after)) continue;
    }
    const score = (sym ? 2 : 0) + (preOk || postOk ? 2 : 0);
    const bestScore = best ? (best.sym ? 2 : 0) + (best.code ? 2 : 0) : -1;
    if (score > bestScore) best = { m, code: preOk ?? postOk, sym };
  }
  if (!best) return { hits, consumed };

  const { m } = best;
  // Only blank out the currency code if it was recognised, so the name keeps unrecognised 3-letter words.
  let start = m.index!;
  let end = start + m[0].length;
  let text2 = m[0];
  if (m[1] && !(best.code && m[1].toUpperCase() === best.code)) {
    const off = text2.indexOf(m[1]) + m[1].length;
    start += off;
    text2 = text2.slice(off);
  }
  if (m[4] && !(best.code && m[4].toUpperCase() === best.code)) {
    const off = text2.lastIndexOf(m[4]);
    end = start + off;
  }
  hits.push({ start, end });
  consumed = blank(text, { start, end });

  const amount = m[3]!.replace(/,/g, "");
  const currency = best.sym ? SYMBOL_TO_CURRENCY[best.sym] : best.code;
  // An explicit code beats an ambiguous "$".
  const finalCurrency = best.code && best.sym === "$" ? best.code : currency;
  return {
    amount,
    currency: finalCurrency,
    currencyFromSymbol: !!best.sym && !best.code,
    hits,
    consumed,
  };
}

function findCycle(text: string): { cycle?: Cycle; interval: number; confidence: number; consumed: string } {
  let consumed = text;
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(consumed);
    if (m) consumed = blank(consumed, { start: m.index, end: m.index + m[0].length });
    return m;
  };
  const unit = (u: string): Cycle =>
    /^w/i.test(u) ? "weekly" : /^(m|mo)/i.test(u) ? "monthly" : /^(y|a)/i.test(u) ? "yearly" : "custom";

  // "every 2 weeks", "every 3 months", "every 45 days"
  let m = take(/\bevery\s+(\d+)\s*(day|days|week|weeks|month|months|year|years)\b/i);
  if (m) {
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    if (n >= 1) return { cycle: u.startsWith("day") ? "custom" : unit(u), interval: n, confidence: 0.95, consumed };
  }
  m = take(/\b(quarterly|every\s+quarter)\b/i);
  if (m) return { cycle: "monthly", interval: 3, confidence: 0.9, consumed };
  m = take(/\b(bi-?weekly|fortnightly)\b/i);
  if (m) return { cycle: "weekly", interval: 2, confidence: 0.9, consumed };
  m = take(/\b(daily|every\s+day)\b/i);
  if (m) return { cycle: "custom", interval: 1, confidence: 0.85, consumed };
  m = take(/\b(yearly|annual|annually|per\s+year|a\s+year|\/\s*(?:yr|year)|every\s+year|each\s+year)\b/i);
  if (m) return { cycle: "yearly", interval: 1, confidence: 0.95, consumed };
  m = take(/\b(monthly|per\s+month|a\s+month|every\s+month|each\s+month)\b|\/\s*(?:mo|month)\b/i);
  if (m) return { cycle: "monthly", interval: 1, confidence: 0.95, consumed };
  m = take(/\b(weekly|per\s+week|a\s+week|every\s+week|each\s+week)\b|\/\s*(?:wk|week)\b/i);
  if (m) return { cycle: "weekly", interval: 1, confidence: 0.95, consumed };
  m = take(/\b(?:\/\s*)?(mo|yr)\b/i);
  if (m) return { cycle: m[1].toLowerCase() === "mo" ? "monthly" : "yearly", interval: 1, confidence: 0.7, consumed };
  return { interval: 1, confidence: 0, consumed };
}

function findDate(
  text: string,
  today: string,
): { date?: string; confidence: number; consumed: string; dayOfMonth?: number } {
  let consumed = text;
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(consumed);
    if (m) consumed = blank(consumed, { start: m.index, end: m.index + m[0].length });
    return m;
  };
  const { y: ty } = parseDate(today);

  // ISO date
  let m = take(/\b(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/i);
  if (m) return isValidDate(m[1]) ? { date: m[1], confidence: 0.95, consumed } : { confidence: 0, consumed };

  const monthRe = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  // "Mar 5", "March 5th", "on 5 March"
  m = take(new RegExp(`\\b(?:on\\s+)?(${monthRe})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"));
  let mon: number | undefined;
  let day: number | undefined;
  if (m) {
    mon = MONTHS[m[1].toLowerCase()];
    day = Number(m[2]);
  } else {
    m = take(new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthRe})\\b`, "i"));
    if (m) {
      day = Number(m[1]);
      mon = MONTHS[m[2].toLowerCase()];
    }
  }
  if (mon && day) {
    if (day < 1 || day > daysInMonth(ty, mon)) return { confidence: 0, consumed };
    let cand = formatDate(ty, mon, day);
    if (cand < today) cand = formatDate(ty + 1, mon, Math.min(day, daysInMonth(ty + 1, mon)));
    return { date: cand, confidence: 0.9, consumed };
  }

  // "on the 15th", "every 15th", "on 15", "the 15th"
  m = take(/\b(?:on\s+(?:the\s+)?|every\s+(?:the\s+)?|the\s+)(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*(?:day|week|month|year|yr|mo)s?\b)/i);
  if (!m) m = take(/\b(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (m) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) return { date: nextOnDayOfMonth(d, today), confidence: 0.9, consumed, dayOfMonth: d };
  }

  if (take(/\b(?:starting\s+|from\s+)?today\b/i)) return { date: today, confidence: 0.8, consumed };
  if (take(/\btomorrow\b/i)) return { date: addDays(today, 1), confidence: 0.8, consumed };
  return { confidence: 0, consumed };
}

function cleanName(s: string): string {
  return s
    .replace(/\b(on|every|for|at|per|a|the|costs?|@|-|—|:)\b/gi, (w) => (/^(costs?)$/i.test(w) ? " " : " "))
    .replace(/[,;|()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:@]+|[\s\-–—:@]+$/g, "")
    .trim();
}

export function parseQuickAdd(input: string, opts: ParseOptions): ParsedSubscription {
  const text = input.replace(/\s+/g, " ").trim().slice(0, 300);
  const confidence: Record<FieldName, number> = { name: 0, amount: 0, currency: 0, cycle: 0, nextRenewal: 0 };

  // Order matters: dates first so "15th"/"Mar 5" are not mistaken for amounts, then cycle, then money.
  const dateRes = findDate(text, opts.today);
  const cycleRes = findCycle(dateRes.consumed);
  const money = findAmountAndCurrency(cycleRes.consumed);

  const amountMinor = money.amount !== undefined ? toMinor(money.amount, money.currency ?? opts.defaultCurrency) : null;
  const amountOk = money.amount !== undefined && amountMinor !== null && amountMinor > 0;
  if (amountOk) confidence.amount = 0.95;

  let currency = opts.defaultCurrency;
  if (money.currency) {
    currency = money.currency;
    // "$" alone is ambiguous (USD/AUD/CAD/...), so confidence is lower than for an explicit code.
    confidence.currency = money.currencyFromSymbol ? (money.currency === "USD" ? 0.7 : 0.95) : 0.98;
  } else if (amountOk) {
    confidence.currency = 0.3;
  }

  const cycle: Cycle = cycleRes.cycle ?? "monthly";
  confidence.cycle = cycleRes.cycle ? cycleRes.confidence : 0.3;

  let nextRenewal = dateRes.date;
  if (nextRenewal) {
    confidence.nextRenewal = dateRes.confidence;
  } else {
    nextRenewal = advance(opts.today, { cycle, intervalCount: cycleRes.interval });
    confidence.nextRenewal = 0.2;
  }

  // Name = whatever is left. Remove the consumed amount region too.
  let leftover = cycleRes.consumed;
  for (const h of money.hits) leftover = blank(leftover, h);
  const name = cleanName(leftover);
  confidence.name = name ? (name.split(" ").length <= 4 ? 0.9 : 0.6) : 0;

  return {
    name,
    amount: amountOk ? money.amount! : null,
    amountMinor: amountOk ? amountMinor : null,
    currency,
    cycle,
    intervalCount: cycleRes.interval,
    nextRenewal,
    confidence,
    ok: name.length > 0 && amountOk,
  };
}
