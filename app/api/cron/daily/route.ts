import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDaily } from "@/lib/cron/daily";
import { createSupabaseCronStore } from "@/lib/cron/supabase-store";
import { getEmailDriver } from "@/lib/email";
import { serviceRoleConfigured } from "@/lib/env";
import { refreshRates } from "@/lib/fx/store";
import { createLogger } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false; // refuse to run with a missing/weak secret
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!serviceRoleConfigured()) return NextResponse.json({ error: "service role not configured" }, { status: 503 });

  const log = createLogger(randomUUID());
  const now = new Date();
  const admin = createAdminClient();
  log.info("daily job started");

  const fx = await refreshRates(admin, now.toISOString().slice(0, 10));
  if (fx.error) log.warn("fx refresh failed; keeping last stored rates", { error: fx.error });

  const result = await runDaily({ store: createSupabaseCronStore(admin), email: getEmailDriver(), now, log });
  log.info("daily job finished", { ...result });
  return NextResponse.json({ ok: result.errors === 0, fx: { refreshed: fx.refreshed, asOf: fx.asOf }, ...result });
}
