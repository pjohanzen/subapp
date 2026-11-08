/** CSV export / import. Pure functions; no I/O. */
import { z } from "zod";
import { fromMinor, toMinor } from "./money";
import { isValidDate } from "./renewals";

export const CSV_COLUMNS = [
  "name",
  "amount",
  "currency",
  "cycle",
  "interval_count",
  "next_renewal",
  "category",
  "payment_method",
  "status",
  "notes",
] as const;

export const MAX_IMPORT_ROWS = 500;

export interface ExportRow {
  name: string;
  amountMinor: number;
  currency: string;
  cycle: string;
  intervalCount: number;
  nextRenewal: string;
  category: string;
  paymentMethod: string;
  status: string;
  notes: string | null;
}

/** Spreadsheet formula injection guard: neutralise cells that start with = + - @ (or tab/CR). */
function guard(cell: string): string {
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}

function escapeCell(cell: string): string {
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    const cells = [
      r.name,
      fromMinor(r.amountMinor, r.currency),
      r.currency,
      r.cycle,
      String(r.intervalCount),
      r.nextRenewal,
      r.category,
      r.paymentMethod,
      r.status,
      r.notes ?? "",
    ];
    lines.push(cells.map((c, i) => escapeCell(i === 1 ? c : guard(c))).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** RFC 4180-ish parser: quoted fields, escaped quotes, newlines in quotes, CRLF/LF. Returns raw string rows. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

const rowSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120, "name is too long"),
  amount: z.string(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "currency must be a 3-letter ISO code"),
  cycle: z.string().trim().toLowerCase().pipe(z.enum(["weekly", "monthly", "yearly", "custom"])),
  interval_count: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 3650, "must be a whole number from 1 to 3650"),
  next_renewal: z.string().trim().refine(isValidDate, "next_renewal must be a real date as YYYY-MM-DD"),
  category: z.string().trim().max(60),
  payment_method: z.string().trim().max(60),
  status: z.string().trim().toLowerCase().pipe(z.enum(["active", "trial", "paused", "cancelled"])),
  notes: z.string().max(2000, "notes too long"),
});

export interface ImportRow {
  name: string;
  amountMinor: number;
  currency: string;
  cycle: "weekly" | "monthly" | "yearly" | "custom";
  intervalCount: number;
  nextRenewal: string;
  /** Names, resolved to ids by the server action (created if missing). Empty string = use default. */
  category: string;
  paymentMethod: string;
  status: "active" | "trial" | "paused" | "cancelled";
  notes: string | null;
}

export interface ImportError {
  /** 1-based line number in the file (header is line 1). */
  line: number;
  message: string;
}

export interface ImportPreview {
  rows: { line: number; row: ImportRow }[];
  errors: ImportError[];
}

export function parseImport(text: string): ImportPreview {
  const out: ImportPreview = { rows: [], errors: [] };
  const table = parseCsvText(text);
  if (table.length === 0) {
    out.errors.push({ line: 1, message: "File is empty" });
    return out;
  }
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = (["name", "amount", "currency", "next_renewal"] as const).filter((c) => !header.includes(c));
  if (missing.length) {
    out.errors.push({ line: 1, message: `Missing required column(s): ${missing.join(", ")}` });
    return out;
  }
  const dataRows = table.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    out.errors.push({ line: 1, message: `Too many rows (max ${MAX_IMPORT_ROWS})` });
    return out;
  }

  dataRows.forEach((cells, idx) => {
    const line = idx + 2;
    const get = (col: string, fallback = "") => {
      const i = header.indexOf(col);
      return i === -1 ? fallback : (cells[i] ?? fallback);
    };
    const unguard = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);
    const parsed = rowSchema.safeParse({
      name: unguard(get("name")),
      amount: get("amount"),
      currency: get("currency"),
      cycle: get("cycle", "monthly") || "monthly",
      interval_count: get("interval_count", "1") || "1",
      next_renewal: get("next_renewal"),
      category: unguard(get("category")),
      payment_method: unguard(get("payment_method")),
      status: get("status", "active") || "active",
      notes: unguard(get("notes")),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        out.errors.push({ line, message: `${issue.path.join(".") || "row"}: ${issue.message}` });
      }
      return;
    }
    const d = parsed.data;
    const rowErrors: string[] = [];
    const amountMinor = toMinor(d.amount, d.currency);
    if (amountMinor === null) rowErrors.push("amount: must be a positive number with valid decimals for the currency");
    const interval = Number(d.interval_count);
    if (rowErrors.length) {
      rowErrors.forEach((message) => out.errors.push({ line, message }));
      return;
    }
    out.rows.push({
      line,
      row: {
        name: d.name,
        amountMinor: amountMinor!,
        currency: d.currency,
        cycle: d.cycle,
        intervalCount: interval,
        nextRenewal: d.next_renewal,
        category: d.category,
        paymentMethod: d.payment_method,
        status: d.status,
        notes: d.notes === "" ? null : d.notes,
      },
    });
  });
  return out;
}
