import { describe, expect, it } from "vitest";
import { parseCsvText, parseImport, toCsv, type ExportRow } from "@/lib/csv";

const row = (o: Partial<ExportRow> = {}): ExportRow => ({
  name: "Netflix", amountMinor: 54900, currency: "PHP", cycle: "monthly", intervalCount: 1,
  nextRenewal: "2026-11-15", category: "Entertainment", paymentMethod: "Credit card", status: "active", notes: null, ...o,
});

describe("csv export", () => {
  it("writes header + rows with decimal amounts", () => {
    const out = toCsv([row()]);
    expect(out.split("\r\n")[0]).toBe("name,amount,currency,cycle,interval_count,next_renewal,category,payment_method,status,notes");
    expect(out).toContain("Netflix,549.00,PHP,monthly,1,2026-11-15,Entertainment,Credit card,active,");
  });
  it("quotes commas, quotes and newlines", () => {
    const out = toCsv([row({ name: 'A, "B"', notes: "line1\nline2" })]);
    expect(parseCsvText(out)[1][0]).toBe('A, "B"');
    expect(parseCsvText(out)[1][9]).toBe("line1\nline2");
  });
  it("neutralises spreadsheet formulas", () => {
    expect(toCsv([row({ name: "=HYPERLINK(1)" })])).toContain("'=HYPERLINK(1)");
  });
  it("round-trips through import", () => {
    const rows = [row(), row({ name: "=evil", amountMinor: 1199, currency: "USD", cycle: "yearly", notes: "hi, there" })];
    const { rows: back, errors } = parseImport(toCsv(rows));
    expect(errors).toEqual([]);
    expect(back.map((r) => r.row.name)).toEqual(["Netflix", "=evil"]);
    expect(back[1].row).toMatchObject({ amountMinor: 1199, currency: "USD", cycle: "yearly", notes: "hi, there" });
  });
});

describe("csv import validation", () => {
  const header = "name,amount,currency,cycle,interval_count,next_renewal,category,payment_method,status,notes\n";
  it("accepts a valid row and applies defaults for optional columns", () => {
    const { rows, errors } = parseImport("name,amount,currency,next_renewal\nSpotify,11.99,usd,2026-12-01\n");
    expect(errors).toEqual([]);
    expect(rows[0].row).toMatchObject({ name: "Spotify", amountMinor: 1199, currency: "USD", cycle: "monthly", intervalCount: 1, status: "active", notes: null });
  });
  it("reports every bad field with its line number, keeps good rows", () => {
    const text = header + "Good,5,USD,monthly,1,2026-12-01,,,active,\n,5,USD,monthly,1,2026-12-01,,,active,\nBad,abc,USD,monthly,1,2026-12-01,,,active,\nBad2,5,US,weekly,1,2026-02-30,,,paused,\nBad3,5,USD,sometimes,0,2026-12-01,,,gone,\n";
    const { rows, errors } = parseImport(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(2);
    const lines = new Set(errors.map((e) => e.line));
    expect([...lines].sort()).toEqual([3, 4, 5, 6]);
    expect(errors.some((e) => e.line === 4 && /amount/.test(e.message))).toBe(true);
    expect(errors.some((e) => e.line === 5 && /next_renewal/.test(e.message))).toBe(true);
    expect(errors.some((e) => e.line === 6 && /interval_count/.test(e.message))).toBe(true);
  });
  it("rejects too many decimals for the currency", () => {
    expect(parseImport(header + "X,5.5,JPY,monthly,1,2026-12-01,,,active,\n").errors[0].message).toMatch(/amount/);
  });
  it("missing required columns", () => expect(parseImport("name,price\nA,5\n").errors[0].message).toMatch(/Missing required/));
  it("empty file", () => expect(parseImport("").errors[0].message).toMatch(/empty/i));
  it("handles BOM, CRLF and quoted newlines", () => {
    const text = '﻿name,amount,currency,next_renewal,notes\r\nA,1,USD,2026-12-01,"x\r\ny"\r\n';
    const { rows, errors } = parseImport(text);
    expect(errors).toEqual([]);
    expect(rows[0].row.notes).toBe("x\r\ny");
  });
  it("caps row count", () => {
    const body = Array.from({ length: 501 }, () => "A,1,USD,2026-12-01").join("\n");
    expect(parseImport("name,amount,currency,next_renewal\n" + body).errors[0].message).toMatch(/Too many/);
  });
});
