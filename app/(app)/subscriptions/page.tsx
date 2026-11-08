import Link from "next/link";
import { deleteSubscription } from "@/app/actions/subscriptions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadCore } from "@/lib/data";
import { formatDateLabel } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { todayInTimezone } from "@/lib/renewals";
import { requireUser } from "@/lib/session";
import { effectiveNext } from "@/lib/upcoming";

export const metadata = { title: "Subscriptions" };
export const dynamic = "force-dynamic";

const CYCLE: Record<string, string> = { weekly: "week", monthly: "month", yearly: "year", custom: "day" };

export default async function SubscriptionsPage() {
  const { db, profile } = await requireUser();
  const today = todayInTimezone(new Date(), profile.timezone);
  const { subs, categories, paymentMethods } = await loadCore(db);
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const pm = new Map(paymentMethods.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Subscriptions</h1>
        <div className="flex gap-2">
          <Button render={<Link href="/import" />} variant="outline" size="sm">Import CSV</Button>
          <Button render={<a href="/api/export" download />} variant="outline" size="sm">Export CSV</Button>
        </div>
      </div>
      {subs.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nothing here yet. <Link className="underline" href="/subscriptions/new">Add your first subscription</Link>.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {subs.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{s.name} {s.status !== "active" && <Badge variant="secondary">{s.status}</Badge>}</p>
                <p className="text-sm text-muted-foreground">
                  {cat.get(s.category_id)} · {pm.get(s.payment_method_id)} · next {formatDateLabel(effectiveNext(s, today))}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="tabular-nums">
                  {formatMoney(s.amount_minor, s.currency)}
                  <span className="text-sm text-muted-foreground"> / {s.interval_count > 1 ? `${s.interval_count} ` : ""}{CYCLE[s.cycle]}{s.interval_count > 1 ? "s" : ""}</span>
                </p>
                <Button render={<Link href={`/subscriptions/${s.id}`} />} variant="outline" size="sm">Edit</Button>
                <form action={deleteSubscription}>
                  <input type="hidden" name="id" value={s.id} />
                  <Button type="submit" variant="ghost" size="sm" aria-label={`Delete ${s.name}`}>Delete</Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
