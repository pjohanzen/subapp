"use client";

import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormMessage } from "@/components/form-message";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseQuickAdd, KNOWN_CURRENCIES, type FieldName } from "@/lib/parser";
import type { FormState } from "@/lib/session";

type Option = { id: string; name: string };

export interface SubscriptionFormValues {
  name: string;
  amount: string;
  currency: string;
  cycle: string;
  interval_count: string;
  next_renewal: string;
  category_id: string;
  payment_method_id: string;
  status: string;
  notes: string;
}

interface Props {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  categories: Option[];
  paymentMethods: Option[];
  homeCurrency: string;
  today: string;
  initial?: SubscriptionFormValues;
  quickAdd?: boolean;
  submitLabel: string;
}

function pickDefault(options: Option[]): string {
  return (options.find((o) => o.name.toLowerCase() === "other") ?? options[0])?.id ?? "";
}

const CONFIDENCE_LABEL = (c: number) => (c >= 0.85 ? null : c >= 0.5 ? "Check" : "Guessed");

function Hint({ field, conf }: { field: FieldName; conf: Partial<Record<FieldName, number>> | null }) {
  const c = conf?.[field];
  if (c === undefined) return null;
  const label = CONFIDENCE_LABEL(c);
  if (!label) return null;
  return (
    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {label} · {Math.round(c * 100)}%
    </span>
  );
}

export function SubscriptionForm({ action, categories, paymentMethods, homeCurrency, today, initial, quickAdd, submitLabel }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  const [values, setValues] = useState<SubscriptionFormValues>(
    initial ?? {
      name: "", amount: "", currency: homeCurrency, cycle: "monthly", interval_count: "1", next_renewal: today,
      category_id: pickDefault(categories), payment_method_id: pickDefault(paymentMethods), status: "active", notes: "",
    },
  );
  const [quick, setQuick] = useState("");
  const [conf, setConf] = useState<Partial<Record<FieldName, number>> | null>(null);
  const [quickNote, setQuickNote] = useState<string | null>(null);

  const set = (k: keyof SubscriptionFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setConf((c) => (c ? { ...c, [k === "next_renewal" ? "nextRenewal" : k]: 1 } : c));
  };

  const currencies = useMemo(() => [...new Set([homeCurrency, ...KNOWN_CURRENCIES])].sort(), [homeCurrency]);

  function onQuick(text: string) {
    setQuick(text);
    if (!text.trim()) {
      setConf(null);
      setQuickNote(null);
      return;
    }
    const r = parseQuickAdd(text, { today, defaultCurrency: homeCurrency });
    if (!r.ok) {
      setConf(null);
      setQuickNote("Couldn't read that. Fill in the form below instead (try: Netflix ₱549 monthly on the 15th).");
      return;
    }
    setQuickNote(null);
    setConf(r.confidence);
    setValues((v) => ({
      ...v,
      name: r.name,
      amount: r.amount ?? "",
      currency: r.currency,
      cycle: r.cycle,
      interval_count: String(r.intervalCount),
      next_renewal: r.nextRenewal,
    }));
  }

  return (
    <div className="space-y-6">
      {quickAdd && (
        <div className="space-y-2 rounded-xl border bg-muted/40 p-4">
          <Label htmlFor="quick">Quick add</Label>
          <Input
            id="quick"
            autoFocus
            autoComplete="off"
            placeholder="Netflix ₱549 monthly on the 15th"
            value={quick}
            onChange={(e) => onQuick(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Type it naturally. The form below fills in; review it, then save.</p>
          {quickNote && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{quickNote}</p>}
        </div>
      )}

      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Name<Hint field="name" conf={conf} /></Label>
          <Input id="name" name="name" required maxLength={120} value={values.name} onChange={set("name")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount<Hint field="amount" conf={conf} /></Label>
          <Input id="amount" name="amount" required inputMode="decimal" placeholder="0.00" value={values.amount} onChange={set("amount")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency<Hint field="currency" conf={conf} /></Label>
          <Input id="currency" name="currency" required list="currency-list" maxLength={3} className="uppercase" value={values.currency} onChange={(e) => setValues((v) => ({ ...v, currency: e.target.value.toUpperCase() }))} />
          <datalist id="currency-list">{currencies.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cycle">Billing cycle<Hint field="cycle" conf={conf} /></Label>
          <NativeSelect id="cycle" name="cycle" value={values.cycle} onChange={set("cycle")}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom (every N days)</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="interval_count">
            {values.cycle === "custom" ? "Every how many days" : `Every how many ${values.cycle === "weekly" ? "weeks" : values.cycle === "yearly" ? "years" : "months"}`}
          </Label>
          <Input id="interval_count" name="interval_count" type="number" min={1} max={3650} required value={values.interval_count} onChange={set("interval_count")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="next_renewal">Next renewal<Hint field="nextRenewal" conf={conf} /></Label>
          <Input id="next_renewal" name="next_renewal" type="date" required value={values.next_renewal} onChange={set("next_renewal")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <NativeSelect id="status" name="status" value={values.status} onChange={set("status")}>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category_id">Category</Label>
          <NativeSelect id="category_id" name="category_id" required value={values.category_id} onChange={set("category_id")}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment_method_id">Payment method</Label>
          <NativeSelect id="payment_method_id" name="payment_method_id" required value={values.payment_method_id} onChange={set("payment_method_id")}>
            {paymentMethods.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" maxLength={2000} rows={3} value={values.notes} onChange={set("notes")} />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>
    </div>
  );
}
