import { describe, expect, it } from "vitest";
import {
  addDays, addMonths, advance, daysBetween, isValidDate, nextOnDayOfMonth,
  occurrencesBetween, rollForward, todayInTimezone,
} from "@/lib/renewals";

describe("addMonths / month-end", () => {
  it("Jan 31 + 1 month = Feb 28 (non-leap)", () => expect(addMonths("2027-01-31", 1)).toBe("2027-02-28"));
  it("Jan 31 + 1 month = Feb 29 (leap year)", () => expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"));
  it("anchor day restores 31 after a short month", () => {
    const feb = addMonths("2027-01-31", 1, 31);
    expect(feb).toBe("2027-02-28");
    expect(addMonths(feb, 1, 31)).toBe("2027-03-31");
  });
  it("without anchor, the day drifts (documented reason for anchor_day)", () => {
    expect(addMonths(addMonths("2027-01-31", 1), 1)).toBe("2027-03-28");
  });
  it("crosses year boundaries", () => expect(addMonths("2026-12-15", 1)).toBe("2027-01-15"));
  it("handles negative/large offsets via yearly math", () => expect(addMonths("2026-03-10", 24)).toBe("2028-03-10"));
});

describe("advance", () => {
  it("weekly", () => expect(advance("2026-11-08", { cycle: "weekly", intervalCount: 1 })).toBe("2026-11-15"));
  it("every 2 weeks", () => expect(advance("2026-11-08", { cycle: "weekly", intervalCount: 2 })).toBe("2026-11-22"));
  it("monthly every 3 months", () => expect(advance("2026-11-30", { cycle: "monthly", intervalCount: 3 })).toBe("2027-02-28"));
  it("yearly from Feb 29 -> Feb 28, then back to 29 with anchor", () => {
    const rule = { cycle: "yearly", intervalCount: 1, anchorDay: 29 } as const;
    const y1 = advance("2028-02-29", rule);
    expect(y1).toBe("2029-02-28");
    expect(advance(advance(advance(y1, rule), rule), rule)).toBe("2032-02-29");
    expect(advance("2031-02-28", rule)).toBe("2032-02-29");
  });
  it("custom = every N days, across DST dates (UTC math, no DST drift)", () => {
    expect(advance("2026-03-07", { cycle: "custom", intervalCount: 2 })).toBe("2026-03-09");
    expect(advance("2026-10-30", { cycle: "custom", intervalCount: 3 })).toBe("2026-11-02");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
  it("rejects bad intervals", () => {
    expect(() => advance("2026-01-01", { cycle: "monthly", intervalCount: 0 })).toThrow();
    expect(() => advance("2026-01-01", { cycle: "monthly", intervalCount: 1.5 })).toThrow();
  });
});

describe("rollForward", () => {
  const monthly = { cycle: "monthly", intervalCount: 1, anchorDay: 31 } as const;
  it("does nothing if renewal is in the future", () => {
    expect(rollForward("2026-11-20", "2026-11-08", monthly)).toEqual({ passed: [], next: "2026-11-20" });
  });
  it("renewal due today is charged today and rolled", () => {
    expect(rollForward("2026-11-08", "2026-11-08", { cycle: "weekly", intervalCount: 1 })).toEqual({
      passed: ["2026-11-08"], next: "2026-11-15",
    });
  });
  it("catches up multiple missed periods", () => {
    const r = rollForward("2026-08-31", "2026-11-08", monthly);
    expect(r.passed).toEqual(["2026-08-31", "2026-09-30", "2026-10-31"]);
    expect(r.next).toBe("2026-11-30");
  });
  it("is stable: rolling the result again is a no-op (idempotent)", () => {
    const r = rollForward("2026-08-31", "2026-11-08", monthly);
    expect(rollForward(r.next, "2026-11-08", monthly).passed).toEqual([]);
  });
});

describe("dates & timezones", () => {
  it("validates real dates", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2027-02-29")).toBe(false);
    expect(isValidDate("2027-13-01")).toBe(false);
    expect(isValidDate("nope")).toBe(false);
  });
  it("daysBetween", () => expect(daysBetween("2026-11-08", "2026-12-08")).toBe(30));
  it("today differs by timezone around midnight UTC", () => {
    const now = new Date("2026-11-08T20:00:00Z");
    expect(todayInTimezone(now, "Asia/Manila")).toBe("2026-11-09");
    expect(todayInTimezone(now, "America/Los_Angeles")).toBe("2026-11-08");
  });
  it("nextOnDayOfMonth", () => {
    expect(nextOnDayOfMonth(15, "2026-11-08")).toBe("2026-11-15");
    expect(nextOnDayOfMonth(15, "2026-11-15")).toBe("2026-11-15");
    expect(nextOnDayOfMonth(5, "2026-11-08")).toBe("2026-12-05");
    expect(nextOnDayOfMonth(31, "2027-02-10")).toBe("2027-02-28");
  });
  it("occurrencesBetween lists calendar hits", () => {
    expect(occurrencesBetween("2026-10-15", { cycle: "weekly", intervalCount: 1 }, "2026-11-01", "2026-11-30"))
      .toEqual(["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"]);
  });
});
