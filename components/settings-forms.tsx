"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/session";

type Act = (s: FormState, f: FormData) => Promise<FormState>;
type Opt = { id: string; name: string };

export function ProfileForm({ action, home, timezone, currencies, timezones }: { action: Act; home: string; timezone: string; currencies: string[]; timezones: string[] }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="home_currency">Home currency</Label>
        <Input id="home_currency" name="home_currency" list="home-currencies" defaultValue={home} maxLength={3} className="uppercase" required />
        <datalist id="home-currencies">{currencies.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="timezone">Time zone</Label>
        <Input id="timezone" name="timezone" list="timezones" defaultValue={timezone} required />
        <datalist id="timezones">{timezones.map((t) => <option key={t} value={t} />)}</datalist>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2"><SubmitButton>Save</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export function ReminderForm({ action, enabled }: { action: Act; enabled: number[] }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">Send a reminder email</legend>
        {[7, 3, 1].map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="days" value={d} defaultChecked={enabled.includes(d)} className="size-4" />
            {d} day{d > 1 ? "s" : ""} before
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-3"><SubmitButton>Save</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export function NamedList({ title, items, addAction, deleteAction }: { title: string; items: Opt[]; addAction: Act; deleteAction: Act }) {
  const [addState, add] = useActionState(addAction, undefined);
  const [delState, del] = useActionState(deleteAction, undefined);
  return (
    <div className="space-y-3">
      <h3 className="font-medium">{title}</h3>
      <ul className="divide-y rounded-lg border">
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span>{it.name}</span>
            {items.length > 1 && (
              <form action={del} className="flex items-center gap-2">
                <input type="hidden" name="id" value={it.id} />
                <label className="sr-only" htmlFor={`re-${it.id}`}>Move its subscriptions to</label>
                <NativeSelect id={`re-${it.id}`} name="reassign_to" required defaultValue="" className="h-8 w-auto text-xs">
                  <option value="" disabled>Move subscriptions to…</option>
                  {items.filter((o) => o.id !== it.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </NativeSelect>
                <SubmitButton variant="outline">Delete</SubmitButton>
              </form>
            )}
          </li>
        ))}
      </ul>
      <FormMessage state={delState} />
      <form action={add} className="flex gap-2">
        <Label htmlFor={`add-${title}`} className="sr-only">New name</Label>
        <Input id={`add-${title}`} name="name" placeholder="Add new…" maxLength={60} required />
        <SubmitButton>Add</SubmitButton>
      </form>
      <FormMessage state={addState} />
    </div>
  );
}

export function DeleteAccountForm({ action }: { action: Act }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted-foreground">This permanently deletes your account, subscriptions, payment history and settings. It cannot be undone. Export your data first if you want a copy.</p>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Type DELETE to confirm</Label>
        <Input id="confirm" name="confirm" autoComplete="off" required />
      </div>
      <div className="flex items-center gap-3"><SubmitButton variant="destructive" pendingLabel="Deleting…">Delete my account</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}
