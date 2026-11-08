"use server";

import { revalidatePath } from "next/cache";
import { MAX_IMPORT_ROWS, parseImport, type ImportError, type ImportRow } from "@/lib/csv";
import { requireUser } from "@/lib/session";

const MAX_BYTES = 512 * 1024;

export type PreviewResult =
  | { error: string }
  | { rows: { line: number; row: ImportRow }[]; errors: ImportError[]; csv: string };

/** Step 1: parse and validate only. Nothing is written. */
export async function previewImport(formData: FormData): Promise<PreviewResult> {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > MAX_BYTES) return { error: "File is too large (max 512 KB)." };
  const csv = await file.text();
  const { rows, errors } = parseImport(csv);
  return { rows, errors, csv };
}

/** Step 2: re-validate server-side from the original text (never trust the preview payload), then insert valid rows. */
export async function commitImport(csv: string): Promise<{ error?: string; imported?: number }> {
  const { db, user } = await requireUser();
  if (typeof csv !== "string" || csv.length > MAX_BYTES) return { error: "Invalid import." };
  const { rows } = parseImport(csv);
  if (rows.length === 0) return { error: "No valid rows to import." };
  if (rows.length > MAX_IMPORT_ROWS) return { error: "Too many rows." };

  const [cats, pms] = await Promise.all([
    db.from("categories").select("id, name"),
    db.from("payment_methods").select("id, name"),
  ]);
  if (cats.error || pms.error) return { error: "Could not read categories." };

  async function resolver(table: "categories" | "payment_methods", existing: { id: string; name: string }[], fallback: string) {
    const map = new Map(existing.map((e) => [e.name.toLowerCase(), e.id]));
    return async (name: string): Promise<string> => {
      const wanted = (name || fallback).trim();
      const hit = map.get(wanted.toLowerCase());
      if (hit) return hit;
      const { data, error } = await db.from(table).insert({ user_id: user.id, name: wanted }).select("id").single();
      if (error || !data) throw new Error("create failed");
      map.set(wanted.toLowerCase(), data.id);
      return data.id;
    };
  }

  try {
    const catId = await resolver("categories", cats.data ?? [], "Other");
    const pmId = await resolver("payment_methods", pms.data ?? [], "Other");
    const payload = [];
    for (const { row } of rows) {
      payload.push({
        user_id: user.id,
        name: row.name,
        amount_minor: row.amountMinor,
        currency: row.currency,
        cycle: row.cycle,
        interval_count: row.intervalCount,
        next_renewal: row.nextRenewal,
        anchor_day: Number(row.nextRenewal.slice(8, 10)),
        category_id: await catId(row.category),
        payment_method_id: await pmId(row.paymentMethod),
        status: row.status,
        notes: row.notes,
      });
    }
    const { error } = await db.from("subscriptions").insert(payload);
    if (error) return { error: "Import failed. Nothing was imported." };
    revalidatePath("/", "layout");
    return { imported: payload.length };
  } catch {
    return { error: "Import failed while creating categories. Nothing was imported." };
  }
}
