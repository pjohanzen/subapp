import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadCore } from "@/lib/data";
import { formatDateLabel } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { addMonths, daysInMonth, formatDate, isValidDate, occurrencesBetween, parseDate, todayInTimezone } from "@/lib/renewals";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string }> }) {
  const sp = await searchParams;
  const { db, profile } = await requireUser();
  const today = todayInTimezone(new Date(), profile.timezone);
  const monthParam = sp.month && /^\d{4}-\d{2}$/.test(sp.month) && isValidDate(`${sp.month}-01`) ? sp.month : today.slice(0, 7);
  const first = `${monthParam}-01`;
  const { y, m } = parseDate(first);
  const total = daysInMonth(y, m);
  const last = formatDate(y, m, total);
  const prev = addMonths(first, -1).slice(0, 7);
  const next = addMonths(first, 1).slice(0, 7);

  const { subs } = await loadCore(db);
  const byDay = new Map<string, typeof subs>();
  for (const s of subs) {
    if (s.status !== "active" && s.status !== "trial") continue;
    const rule = { cycle: s.cycle, intervalCount: s.interval_count, anchorDay: s.anchor_day ?? Number(s.next_renewal.slice(8, 10)) };
    for (const d of occurrencesBetween(s.next_renewal, rule, first, last)) byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }

  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // Sunday = 0
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const selected = sp.day && isValidDate(sp.day) && sp.day.startsWith(monthParam) ? sp.day : null;
  const selectedSubs = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{formatDateLabel(first, { month: "long", year: "numeric" })}</h1>
        <div className="flex gap-2">
          <Button render={<Link href={`/calendar?month=${prev}`} />} variant="outline" size="sm" aria-label="Previous month">←</Button>
          <Button render={<Link href="/calendar" />} variant="outline" size="sm">Today</Button>
          <Button render={<Link href={`/calendar?month=${next}`} />} variant="outline" size="sm" aria-label="Next month">→</Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border text-sm" role="grid" aria-label="Renewals calendar">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} role="columnheader" className="bg-muted px-1 py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="min-h-14 bg-background sm:min-h-20" />;
          const date = formatDate(y, m, day);
          const items = byDay.get(date) ?? [];
          const isToday = date === today;
          const isSel = date === selected;
          return (
            <Link
              key={date}
              href={`/calendar?month=${monthParam}&day=${date}`}
              role="gridcell"
              aria-label={`${formatDateLabel(date)}${items.length ? `, ${items.length} renewal${items.length > 1 ? "s" : ""}` : ""}`}
              aria-current={isToday ? "date" : undefined}
              className={`min-h-14 bg-background p-1 text-left hover:bg-muted sm:min-h-20 sm:p-2 ${isSel ? "ring-2 ring-primary ring-inset" : ""}`}
            >
              <span className={`text-xs ${isToday ? "rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground" : "text-muted-foreground"}`}>{day}</span>
              {items.length > 0 && (
                <>
                  <span className="mt-1 hidden text-xs sm:block">{items.slice(0, 2).map((s) => s.name).join(", ")}{items.length > 2 ? ` +${items.length - 2}` : ""}</span>
                  <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-primary sm:hidden" aria-hidden />
                </>
              )}
            </Link>
          );
        })}
      </div>

      {selected && (
        <section aria-live="polite" className="rounded-xl border p-4">
          <h2 className="mb-2 font-medium">{formatDateLabel(selected, { weekday: "long", month: "long", day: "numeric" })}</h2>
          {selectedSubs.length === 0 ? <p className="text-sm text-muted-foreground">No renewals on this day.</p> : (
            <ul className="divide-y">
              {selectedSubs.map((s) => (
                <li key={s.id} className="flex justify-between py-2 text-sm">
                  <Link className="font-medium underline-offset-2 hover:underline" href={`/subscriptions/${s.id}`}>{s.name}</Link>
                  <span className="tabular-nums">{formatMoney(s.amount_minor, s.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {Array.from(byDay.keys()).length === 0 && <p className="text-sm text-muted-foreground">No renewals this month.</p>}
    </div>
  );
}
