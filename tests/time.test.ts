import { describe, expect, it } from "vitest";
import { addDays, nextRun, weekOf, zonedToUtc } from "@/server/utils/time";

describe("time helpers", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("computes a Monday-based week", () => {
    expect(weekOf("2026-11-04")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(weekOf("2026-11-08")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });

  it("converts zoned wall-clock time to UTC", () => {
    const utc = zonedToUtc(2026, 1, 1, 8, 0, "Asia/Singapore");
    expect(utc.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns a future daily run", () => {
    const run = nextRun("Asia/Singapore", "08:00");
    expect(Date.parse(run.iso)).toBeGreaterThan(Date.now());
    expect(run.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns a future weekly run on the requested weekday", () => {
    const run = nextRun("Asia/Singapore", "18:00", { weekday: 0 });
    expect(Date.parse(run.iso)).toBeGreaterThan(Date.now());
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Singapore", weekday: "short" }).format(
      new Date(run.iso),
    );
    expect(weekday).toBe("Sun");
  });
});
