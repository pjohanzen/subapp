import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** OAuth / email-confirmation landing. Exchanges the code for a session, then redirects (relative paths only). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (supabaseConfigured() && code) {
    const db = await createClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }
  return NextResponse.redirect(`${origin}/login?error=callback`);
}
