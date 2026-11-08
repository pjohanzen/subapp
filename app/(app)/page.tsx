import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeTotals, type RateTable } from "@/lib/currency";
import { loadCore } from "@/lib/data";
import { serviceRoleConfigured } from "@/lib/env";
import { formatDateLabel, relativeDays } from "@/lib/format";
import { loadRateTable, refreshRates } from "@/lib/fx/store";
import { formatMoney } from "@/lib/money";
import { todayInTimezone } from "@/lib/renewals";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { upcoming } from "@/lib/upcoming";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { db, profile } = await requireUser();
  const home = profile.home_currency;
  const today = todayInTimezone(new Date(), profile.timezone);
  const { subs, categories, failed } = await loadCore(db);

  let rates: RateTable | null = await loadRateTable(db);
  const needsRates = subs.some((s) => (s.status === "active" || s.status === "trial") && s.currency !== home);
  if (needsRates && serviceRoleConfigured()) {
    // Lazy once-a-day refresh (guarded inside refreshRates); the daily cron does the same.
    const r = await refreshRates(createAdminClient(), new Date().toISOString().slice(0, 10));
    if (r.refreshed) rates = await loadRateTable(db);
  }

  const totals = computeTotals(
    subs.map((s) => ({
      id: s.id, name: s.name, amountMinor: s.amount_minor, currency: s.currency, cycle: s.cycle,
      intervalCount: s.interval_count, status: s.status, categoryId: s.category_id,
    })),
    home, rates, today,
  );
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const byCat = Object.entries(totals.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = byCat[0]?.[1] ?? 1;
  const next7 = upcoming(subs, today, 7);
  const next30 = upcoming(subs, today, 30).filter((u) => u.inDays > 7);

  if (failed) return <p role="alert" className="py-8 text-destructive">Couldn&apos;t load your data. Check that the database migration has been applied.</p>;

  if (subs.length === 0) {
    return (
      <section className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">No subscriptions yet</h1>
        <p className="text-muted-foreground">Add your first one in a few seconds: just type something like “Netflix ₱549 monthly on the 15th”.</p>
        <Button render={<Link href="/subscriptions/new" />}>Add a subscription</Button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {(totals.ratesUnavailable || totals.staleDays !== null || totals.excluded.length > 0) && (
        <div role="status" className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {totals.ratesUnavailable && <p>Exchange rates aren&apos;t available yet, so subscriptions in other currencies are left out of the totals.</p>}
          {totals.staleDays !== null && <p>Exchange rates are {totals.staleDays} days old (last stored rates are being used).</p>}
          {totals.excluded.length > 0 && !totals.ratesUnavailable && (
            <p>Not included in totals (no rate for the currency): {totals.excluded.map((e) => `${e.name} (${e.currency})`).join(", ")}.</p>
          )}
          {totals.ratesUnavailable && totals.excluded.length > 0 && (
            <p>Not included: {totals.excluded.map((e) => `${e.name} (${e.currency})`).join(", ")}.</p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Per month</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold tabular-nums">{formatMoney(totals.monthlyMinor, home)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Per year</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold tabular-nums">{formatMoney(totals.yearlyMinor, home)}</p></CardContent>
        </Card>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">{totals.counted} active or trial subscriptions, shown in {home}. Weekly × 52/12, yearly ÷ 12.</p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Renewing in the next 7 days</CardTitle></CardHeader>
          <CardContent>
            {next7.length === 0 ? <p className="text-sm text-muted-foreground">Nothing renews this week.</p> : (
              <ul className="divide-y">
                {next7.map(({ sub, date, inDays }) => (
                  <li key={sub.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span><span className="font-medium">{sub.name}</span> <span className="text-muted-foreground">{relativeDays(inDays)} · {formatDateLabel(date)}</span></span>
                    <span className="tabular-nums">{formatMoney(sub.amount_minor, sub.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Later in the next 30 days</CardTitle></CardHeader>
          <CardContent>
            {next30.length === 0 ? <p className="text-sm text-muted-foreground">Nothing else this month.</p> : (
              <ul className="divide-y">
                {next30.map(({ sub, date }) => (
                  <li key={sub.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span><span className="font-medium">{sub.name}</span> <span className="text-muted-foreground">{formatDateLabel(date)}</span></span>
                    <span className="tabular-nums">{formatMoney(sub.amount_minor, sub.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Spend by category <Badge variant="secondary">per month</Badge></CardTitle></CardHeader>
        <CardContent>
          {byCat.length === 0 ? <p className="text-sm text-muted-foreground">No spend to show yet.</p> : (
            <ul className="space-y-3" aria-label="Monthly spend by category">
              {byCat.map(([id, minor]) => (
                <li key={id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{catName.get(id) ?? "Uncategorised"}</span>
                    <span className="tabular-nums">{formatMoney(minor, home)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted" role="presentation">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (minor / maxCat) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
