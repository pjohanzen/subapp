import { supabaseConfigured } from "@/lib/env";
import { redirect } from "next/navigation";

export const metadata = { title: "Setup required" };

export default function SetupPage() {
  if (supabaseConfigured()) redirect("/");
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Almost there: connect Supabase</h1>
      <p className="text-muted-foreground">
        The app is running, but it has no database yet. Accounts and subscriptions are stored in your own free Supabase project.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Create a project at supabase.com (free plan).</li>
        <li>In the SQL editor, run the file <code>supabase/migrations/20261108000001_initial_schema.sql</code>.</li>
        <li>Copy <code>.env.example</code> to <code>.env.local</code> and fill in <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> (Project Settings, API).</li>
        <li>In Authentication, URL Configuration, add <code>http://localhost:3000/auth/callback</code> as a redirect URL.</li>
        <li>Restart <code>npm run dev</code>.</li>
      </ol>
      <p className="text-sm text-muted-foreground">Full steps are in the README. Never share the service-role key or commit <code>.env.local</code>.</p>
    </main>
  );
}
