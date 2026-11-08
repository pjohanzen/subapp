/** Env access. Secrets come from env vars only. Never import server-only values into client components. */

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function serviceRoleConfigured(): boolean {
  return Boolean(supabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
