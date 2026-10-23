import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHOTO_REMINDER,
  dayKey,
  daysBetween,
  daysSince,
  nextPhotoDate,
  photoDue,
  reminderHourReached,
  reminderMessage,
} from "../photo-reminders";

const on = { ...DEFAULT_PHOTO_REMINDER, enabled: true, everyDays: 14 };

describe("photo reminders", () => {
  it("is due only when enabled", () => {
    expect(photoDue(undefined, { ...on, enabled: false })).toBe(false);
    expect(photoDue(undefined, on)).toBe(true);
  });

  it("fires on the exact interval boundary, not before", () => {
    const now = new Date(2026, 9, 23, 12);
    expect(photoDue("2026-10-09", on, now)).toBe(true);
    expect(photoDue("2026-10-10", on, now)).toBe(false);
  });

  it("counts calendar days across DST", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-23")).toBe(0);
    expect(daysSince("2026-10-01", new Date(2026, 9, 23, 23, 59))).toBe(22);
  });

  it("uses the configured hour", () => {
    expect(reminderHourReached({ ...on, hour: 10 }, new Date(2026, 9, 23, 9, 59))).toBe(false);
    expect(reminderHourReached({ ...on, hour: 10 }, new Date(2026, 9, 23, 10))).toBe(true);
  });

  it("computes the next photo date", () => {
    expect(nextPhotoDate("2026-10-23", on)).toBe("2026-11-06");
    expect(nextPhotoDate(undefined, on)).toBeNull();
  });

  it("formats the day key and the message", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(reminderMessage("2026-10-09", new Date(2026, 9, 23))).toContain("14 дней");
    expect(reminderMessage(undefined)).toContain("ещё не сделал");
  });
});
