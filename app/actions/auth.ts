"use server";

import { redirect } from "next/navigation";
import { siteUrl, supabaseConfigured } from "@/lib/env";
import { emailPassword, firstError } from "@/lib/schemas";
import type { FormState } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  if (!supabaseConfigured()) redirect("/setup");
  const parsed = emailPassword.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const db = await createClient();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email or password is incorrect." };
  redirect("/");
}

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  if (!supabaseConfigured()) redirect("/setup");
  const parsed = emailPassword.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const db = await createClient();
  const { data, error } = await db.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/");
  return { ok: true, message: "Check your email to confirm your account, then sign in." };
}

export async function signInWithGoogle() {
  if (!supabaseConfigured()) redirect("/setup");
  const db = await createClient();
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function signOut() {
  if (supabaseConfigured()) {
    const db = await createClient();
    await db.auth.signOut();
  }
  redirect("/login");
}
