/** Render a YYYY-MM-DD calendar date without any time-zone shifting. */
export function formatDateLabel(date: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function relativeDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}
