import { redirect } from "next/navigation";
import { signInWithGoogle, signUp } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
import { supabaseConfigured } from "@/lib/env";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  if (!supabaseConfigured()) redirect("/setup");
  return (
    <>
      <AuthForm mode="signup" action={signUp} />
      <form action={signInWithGoogle}>
        <Button type="submit" variant="outline" className="w-full">Continue with Google</Button>
      </form>
    </>
  );
}
