import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Health check. Reports only booleans; never leaks configuration values. */
export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ ok: false, supabase: "not_configured" }, { status: 503 });
  try {
    const db = await createClient();
    const { error } = await db.from("exchange_rates").select("currency", { head: true, count: "exact" }).limit(1);
    // RLS returns no rows (not an error) for signed-out callers, so any non-error means the DB is reachable.
    if (error) return NextResponse.json({ ok: false, supabase: "error" }, { status: 503 });
    return NextResponse.json({ ok: true, supabase: "ok" });
  } catch {
    return NextResponse.json({ ok: false, supabase: "unreachable" }, { status: 503 });
  }
}
