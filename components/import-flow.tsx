"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitImport, previewImport, type PreviewResult } from "@/app/actions/import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";

export function ImportFlow() {
  const router = useRouter();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onPreview(formData: FormData) {
    setMessage(null);
    start(async () => setPreview(await previewImport(formData)));
  }
  function onCommit() {
    if (!preview || "error" in preview) return;
    start(async () => {
      const r = await commitImport(preview.csv);
      if (r.error) setMessage(r.error);
      else router.push("/subscriptions");
    });
  }

  return (
    <div className="space-y-6">
      <form action={onPreview} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="file">CSV file</Label>
          <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
          <p className="text-xs text-muted-foreground">
            Columns: name, amount, currency, next_renewal (required); cycle, interval_count, category, payment_method, status, notes (optional). Export first to see the format.
          </p>
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Preview"}</Button>
      </form>

      {preview && "error" in preview && <p role="alert" className="text-destructive">{preview.error}</p>}
      {preview && !("error" in preview) && (
        <section className="space-y-4" aria-live="polite">
          <p className="text-sm"><strong>{preview.rows.length}</strong> valid row{preview.rows.length === 1 ? "" : "s"}, <strong>{preview.errors.length}</strong> problem{preview.errors.length === 1 ? "" : "s"}.</p>
          {preview.errors.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-lg border border-destructive/40 p-3 text-sm">
              {preview.errors.map((e, i) => <li key={i}><span className="font-medium">Line {e.line}:</span> {e.message}</li>)}
            </ul>
          )}
          {preview.rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left"><tr><th className="p-2">Line</th><th className="p-2">Name</th><th className="p-2">Amount</th><th className="p-2">Cycle</th><th className="p-2">Next renewal</th><th className="p-2">Status</th></tr></thead>
                <tbody>
                  {preview.rows.map(({ line, row }) => (
                    <tr key={line} className="border-t">
                      <td className="p-2">{line}</td><td className="p-2">{row.name}</td>
                      <td className="p-2 tabular-nums">{formatMoney(row.amountMinor, row.currency)}</td>
                      <td className="p-2">{row.intervalCount > 1 ? `every ${row.intervalCount} ` : ""}{row.cycle}</td>
                      <td className="p-2">{row.nextRenewal}</td><td className="p-2">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.rows.length > 0 && (
            <div className="flex items-center gap-3">
              <Button onClick={onCommit} disabled={pending}>{pending ? "Importing…" : `Import ${preview.rows.length} valid row${preview.rows.length === 1 ? "" : "s"}`}</Button>
              {preview.errors.length > 0 && <span className="text-sm text-muted-foreground">Rows with problems will be skipped.</span>}
            </div>
          )}
          {message && <p role="alert" className="text-destructive">{message}</p>}
        </section>
      )}
    </div>
  );
}
