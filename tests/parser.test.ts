import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "@/lib/parser";

const opts = { today: "2026-11-08", defaultCurrency: "PHP" };
const p = (s: string) => parseQuickAdd(s, opts);

describe("parseQuickAdd", () => {
  it("Netflix ₱549 monthly on the 15th", () => {
    const r = p("Netflix ₱549 monthly on the 15th");
    expect(r).toMatchObject({ name: "Netflix", amount: "549", amountMinor: 54900, currency: "PHP", cycle: "monthly", nextRenewal: "2026-11-15", ok: true });
    expect(r.confidence.amount).toBeGreaterThan(0.9);
  });
  it("Spotify $11.99 yearly (no date -> low-confidence default)", () => {
    const r = p("Spotify $11.99 yearly");
    expect(r).toMatchObject({ name: "Spotify", amountMinor: 1199, currency: "USD", cycle: "yearly", nextRenewal: "2027-11-08", ok: true });
    expect(r.confidence.nextRenewal).toBeLessThan(0.5);
    expect(r.confidence.currency).toBeLessThan(0.9); // "$" is ambiguous
  });
  it("currency code after amount", () => expect(p("iCloud 2.99 USD monthly")).toMatchObject({ name: "iCloud", currency: "USD", amountMinor: 299 }));
  it("currency code before amount", () => expect(p("Notion EUR 8 monthly")).toMatchObject({ name: "Notion", currency: "EUR", amountMinor: 800 }));
  it("thousands separators", () => expect(p("Gym ₱1,299.50 monthly")).toMatchObject({ name: "Gym", amountMinor: 129950 }));
  it("euro and pound symbols", () => {
    expect(p("Adobe €59.99/mo")).toMatchObject({ currency: "EUR", cycle: "monthly", amountMinor: 5999 });
    expect(p("BBC £12 yearly")).toMatchObject({ currency: "GBP", cycle: "yearly" });
  });
  it("zero-decimal currency (JPY)", () => expect(p("Dazn ¥1500 monthly")).toMatchObject({ currency: "JPY", amountMinor: 1500 }));
  it("weekly", () => expect(p("Meal box $30 weekly")).toMatchObject({ cycle: "weekly", intervalCount: 1 }));
  it("every 2 weeks", () => expect(p("Cleaner $40 every 2 weeks")).toMatchObject({ cycle: "weekly", intervalCount: 2, amountMinor: 4000 }));
  it("quarterly -> every 3 months", () => expect(p("Insurance ₱900 quarterly")).toMatchObject({ cycle: "monthly", intervalCount: 3 }));
  it("annual / per year wording", () => {
    expect(p("Domain $12 annually").cycle).toBe("yearly");
    expect(p("Dropbox $120 per year").cycle).toBe("yearly");
  });
  it("month + day date", () => expect(p("Prime $139 yearly on Mar 5").nextRenewal).toBe("2027-03-05"));
  it("day + month date (future this year)", () => expect(p("Hulu $8 monthly on 20 December").nextRenewal).toBe("2026-12-20"));
  it("ISO date", () => expect(p("Figma $15 monthly 2026-12-01").nextRenewal).toBe("2026-12-01"));
  it("ordinal day already passed this month rolls to next month", () => expect(p("Disney+ ₱159 monthly on the 3rd").nextRenewal).toBe("2026-12-03"));
  it("day 31 in a short month clamps", () => {
    const r = parseQuickAdd("Rent-app $5 monthly on the 31st", { today: "2027-02-10", defaultCurrency: "USD" });
    expect(r.nextRenewal).toBe("2027-02-28");
  });
  it("default currency is used, with low confidence", () => {
    const r = p("Netflix 549 monthly");
    expect(r.currency).toBe("PHP");
    expect(r.confidence.currency).toBeLessThan(0.5);
  });
  it("multi-word names", () => expect(p("YouTube Premium ₱159 monthly").name).toBe("YouTube Premium"));
  it("name with digits survives (Disney+ / 1Password)", () => expect(p("1Password $2.99 monthly").name).toBe("1Password"));

  // failures -> ok:false so the UI shows a blank manual form
  it("empty input fails", () => expect(p("").ok).toBe(false));
  it("gibberish without amount fails", () => expect(p("asdf qwerty").ok).toBe(false));
  it("name only fails", () => expect(p("Netflix monthly").ok).toBe(false));
  it("amount only (no name) fails", () => expect(p("₱549 monthly").ok).toBe(false));
  it("zero amount fails", () => expect(p("Free thing $0 monthly").ok).toBe(false));
  it("impossible date is ignored, not crashed", () => {
    const r = p("Test $5 monthly on 2026-02-31");
    expect(r.confidence.nextRenewal).toBeLessThan(0.5);
  });
  it("overlong input is truncated safely", () => expect(() => p("a".repeat(5000))).not.toThrow());
});
