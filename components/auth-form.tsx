"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/session";

export function AuthForm({ mode, action }: { mode: "login" | "signup"; action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="One moment…">{mode === "login" ? "Sign in" : "Create account"}</SubmitButton>
      <p className="text-sm text-muted-foreground">
        {mode === "login" ? (
          <>No account? <Link className="underline" href="/signup">Sign up</Link></>
        ) : (
          <>Already have an account? <Link className="underline" href="/login">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
