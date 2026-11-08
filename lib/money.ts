/** Money helpers. Amounts are integer minor units (e.g. cents); never floats in storage. */

const exponentCache = new Map<string, number>();

/** Number of minor-unit digits for an ISO 4217 code (USD=2, JPY=0, KWD=3), per the runtime's Intl data. */
export function minorExponent(currency: string): number {
  const cached = exponentCache.get(currency);
  if (cached !== undefined) return cached;
  let digits = 2;
  try {
    digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  exponentCache.set(currency, digits);
  return digits;
}

/**
 * Parse a user-entered decimal string ("1,299.50") into minor units without using floats.
 * Returns null if invalid or if it has more decimals than the currency allows.
 */
export function toMinor(input: string, currency: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const exp = minorExponent(currency);
  const [whole, frac = ""] = s.split(".");
  if (frac.length > exp) {
    if (/[1-9]/.test(frac.slice(exp))) return null;
  }
  const padded = (frac + "0".repeat(exp)).slice(0, exp);
  const minor = Number(whole + padded);
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Minor units -> plain decimal string ("549.00"), for CSV and form fields. */
export function fromMinor(minor: number, currency: string): string {
  const exp = minorExponent(currency);
  if (exp === 0) return String(minor);
  const s = String(Math.abs(minor)).padStart(exp + 1, "0");
  return `${minor < 0 ? "-" : ""}${s.slice(0, -exp)}.${s.slice(-exp)}`;
}

export function formatMoney(minor: number, currency: string, locale = "en"): string {
  const exp = minorExponent(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 10 ** exp);
}
