import { redirect } from "next/navigation";
import { supabaseConfigured } from "./env";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

/** Verified user + RLS-scoped client. Every page and server action calls this; never trust the client. */
export async function requireUser() {
  if (!supabaseConfigured()) redirect("/setup");
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("id, home_currency, timezone").eq("id", data.user.id).maybeSingle();
  const p: Profile = profile ?? { id: data.user.id, home_currency: "PHP", timezone: "Asia/Manila" };
  return { db, user: data.user, profile: p };
}

export type FormState = { error?: string; ok?: boolean; message?: string } | undefined;
