import { describe, expect, it } from "vitest";
import { computeTotals, convertMinor, monthlyFactor, type PricedSubscription, type RateTable } from "@/lib/currency";
import { formatMoney, fromMinor, toMinor } from "@/lib/money";

const rates: RateTable = { base: "USD", asOf: "2026-11-08", rates: { PHP: 58, EUR: 0.9, JPY: 150 } };
const sub = (o: Partial<PricedSubscription>): PricedSubscription => ({
  id: "1", name: "X", amountMinor: 1000, currency: "PHP", cycle: "monthly", intervalCount: 1,
  status: "active", categoryId: "c1", ...o,
});

describe("money", () => {
  it("toMinor avoids floats", () => {
    expect(toMinor("11.99", "USD")).toBe(1199);
    expect(toMinor("0.1", "USD")).toBe(10);
    expect(toMinor("1,299.50", "PHP")).toBe(129950);
    expect(toMinor("500", "JPY")).toBe(500);
    expect(toMinor("500.5", "JPY")).toBeNull();
    expect(toMinor("1.999", "USD")).toBeNull();
    expect(toMinor("abc", "USD")).toBeNull();
    expect(toMinor("-5", "USD")).toBeNull();
  });
  it("fromMinor/format", () => {
    expect(fromMinor(1199, "USD")).toBe("11.99");
    expect(fromMinor(5, "USD")).toBe("0.05");
    expect(fromMinor(500, "JPY")).toBe("500");
    expect(formatMoney(54900, "PHP")).toContain("549.00");
  });
});

describe("normalization", () => {
  it("yearly / 12, weekly x 52/12", () => {
    expect(monthlyFactor("yearly", 1)).toBeCloseTo(1 / 12);
    expect(monthlyFactor("weekly", 1)).toBeCloseTo(52 / 12);
    expect(monthlyFactor("monthly", 3)).toBeCloseTo(1 / 3);
    expect(monthlyFactor("custom", 7)).toBeCloseTo(52 / 12);
  });
});

describe("conversion", () => {
  it("same currency is identity, no rates needed", () => expect(convertMinor(500, "PHP", "PHP", null)).toBe(500));
  it("USD -> PHP", () => expect(convertMinor(1000, "USD", "PHP", rates)).toBe(58000));
  it("cross via base: EUR -> PHP", () => expect(convertMinor(900, "EUR", "PHP", rates)).toBe(58000));
  it("handles exponent differences (JPY has 0 decimals)", () => expect(convertMinor(100, "USD", "JPY", rates)).toBe(150));
  it("missing rate -> null", () => {
    expect(convertMinor(100, "USD", "XYZ", rates)).toBeNull();
    expect(convertMinor(100, "USD", "PHP", null)).toBeNull();
  });
});

describe("computeTotals", () => {
  const today = "2026-11-08";
  it("sums mixed currencies in home currency", () => {
    const t = computeTotals(
      [sub({ id: "a", amountMinor: 54900 }), sub({ id: "b", amountMinor: 1199, currency: "USD", cycle: "yearly" })],
      "PHP", rates, today);
    // 549.00 + (11.99 USD / 12 * 58) = 549 + 57.95 -> 606.95
    expect(t.monthlyMinor).toBe(60695);
    expect(t.yearlyMinor).toBe(728342); // (54900 + 1199/12*58) * 12, rounded once
    expect(t.excluded).toEqual([]);
    expect(t.counted).toBe(2);
  });
  it("paused and cancelled are not counted; trial is", () => {
    const t = computeTotals(
      [sub({ status: "paused" }), sub({ status: "cancelled" }), sub({ status: "trial", amountMinor: 200 })],
      "PHP", rates, today);
    expect(t.monthlyMinor).toBe(200);
    expect(t.counted).toBe(1);
  });
  it("missing rate: item excluded and reported, others still counted", () => {
    const t = computeTotals([sub({ id: "a" }), sub({ id: "z", name: "Zed", currency: "XYZ" })], "PHP", rates, today);
    expect(t.excluded).toEqual([{ id: "z", name: "Zed", currency: "XYZ" }]);
    expect(t.monthlyMinor).toBe(1000);
  });
  it("no rate table at all: foreign items excluded, flagged unavailable; home items still counted", () => {
    const t = computeTotals([sub({ id: "a" }), sub({ id: "u", currency: "USD" })], "PHP", null, today);
    expect(t.ratesUnavailable).toBe(true);
    expect(t.excluded.map((e) => e.id)).toEqual(["u"]);
    expect(t.monthlyMinor).toBe(1000);
  });
  it("stale rates (last stored) still used, with staleDays notice", () => {
    const old = { ...rates, asOf: "2026-11-01" };
    const t = computeTotals([sub({ currency: "USD", amountMinor: 100 })], "PHP", old, today);
    expect(t.monthlyMinor).toBe(5800);
    expect(t.staleDays).toBe(7);
  });
  it("fresh rates: no notice; home-only data never warns", () => {
    expect(computeTotals([sub({ currency: "USD" })], "PHP", rates, today).staleDays).toBeNull();
    expect(computeTotals([sub({})], "PHP", { ...rates, asOf: "2020-01-01" }, today).staleDays).toBeNull();
  });
  it("category breakdown", () => {
    const t = computeTotals([sub({ categoryId: "x", amountMinor: 300 }), sub({ categoryId: "y", amountMinor: 700 })], "PHP", rates, today);
    expect(t.byCategory).toEqual({ x: 300, y: 700 });
  });
});
