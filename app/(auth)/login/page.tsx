import { redirect } from "next/navigation";
import { signIn, signInWithGoogle } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
import { supabaseConfigured } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  if (!supabaseConfigured()) redirect("/setup");
  const sp = await searchParams;
  return (
    <>
      {sp.deleted && <p role="status" className="rounded-lg bg-muted p-3 text-sm">Your account and all its data were deleted.</p>}
      {sp.error && <p role="alert" className="text-sm text-destructive">Sign-in failed. Please try again.</p>}
      <AuthForm mode="login" action={signIn} />
      <form action={signInWithGoogle}>
        <Button type="submit" variant="outline" className="w-full">Continue with Google</Button>
      </form>
    </>
  );
}
