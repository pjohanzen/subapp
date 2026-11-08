import { NextResponse } from "next/server";
import { toCsv, type ExportRow } from "@/lib/csv";
import { supabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [subs, cats, pms] = await Promise.all([
    db.from("subscriptions").select("*").order("name"),
    db.from("categories").select("id, name"),
    db.from("payment_methods").select("id, name"),
  ]);
  if (subs.error || cats.error || pms.error) return NextResponse.json({ error: "export failed" }, { status: 500 });
  const catName = new Map((cats.data ?? []).map((c) => [c.id, c.name as string]));
  const pmName = new Map((pms.data ?? []).map((c) => [c.id, c.name as string]));
  const rows: ExportRow[] = (subs.data ?? []).map((s) => ({
    name: s.name, amountMinor: s.amount_minor, currency: s.currency, cycle: s.cycle, intervalCount: s.interval_count,
    nextRenewal: s.next_renewal, category: catName.get(s.category_id) ?? "", paymentMethod: pmName.get(s.payment_method_id) ?? "",
    status: s.status, notes: s.notes,
  }));
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscriptions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
