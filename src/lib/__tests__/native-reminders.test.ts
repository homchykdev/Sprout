import { describe, expect, it } from "vitest";
import { buildNativeReminders, dateFromReminderId, isManagedReminderId } from "../native-reminders";
import type { AppState } from "../store";

const state: Pick<
  AppState,
  | "plan"
  | "sessions"
  | "vacations"
  | "reminders"
  | "lastNotified"
  | "photoReminder"
  | "lastPhotoNotified"
> = {
  plan: {
    origin: "2026-10-27",
    steps: [
      { id: "workout", kind: "workout" },
      { id: "rest", kind: "rest" },
    ],
    settings: { bonusMax: 0, bonusRestoreDays: 7, freezeMax: 0, freezeThresholdPct: 80 },
  },
  sessions: [],
  vacations: [],
  reminders: { enabled: true, windowStart: 900, windowEnd: 1020, preferred: 900 },
  lastNotified: "",
  photoReminder: { enabled: false, everyDays: 7, hour: 10 },
  lastPhotoNotified: "",
};

describe("native reminders", () => {
  it("builds future notifications for workout and rest days in the local schedule", () => {
    const now = new Date(2026, 9, 27, 10);
    const notifications = buildNativeReminders(state, undefined, now);
    const todayCode = 20261027;
    const tomorrowCode = 20261028;

    expect(notifications.some((n) => Math.floor(n.id / 10) === todayCode)).toBe(true);
    expect(notifications.some((n) => Math.floor(n.id / 10) === tomorrowCode)).toBe(true);
    expect(notifications.every((n) => n.schedule?.at && n.schedule.at > now)).toBe(true);
    expect(notifications.every((n) => n.isExactNotification === true)).toBe(true);
    expect(notifications.every((n) => n.isExactMandatory === false)).toBe(true);
    expect(notifications.every((n) => n.channelId === "reminders")).toBe(true);
    expect(notifications.every((n) => n.schedule?.allowWhileIdle)).toBe(true);
  });

  it("schedules photo reminders from the due date and skips dates already notified", () => {
    const now = new Date(2026, 9, 27, 10);
    const withPhoto = {
      ...state,
      reminders: { ...state.reminders, enabled: false },
      photoReminder: { enabled: true, everyDays: 7, hour: 10 },
    };
    const notifications = buildNativeReminders(withPhoto, "2026-10-27", now);
    const first = notifications[0]!;
    expect(dateFromReminderId(first.id)).toBe("2026-11-03");

    const alreadySent = buildNativeReminders(
      { ...withPhoto, lastPhotoNotified: "2026-11-03" },
      "2026-10-27",
      now,
    );
    expect(alreadySent.some((n) => dateFromReminderId(n.id) === "2026-11-03")).toBe(false);
  });

  it("identifies only app reminder identifiers", () => {
    expect(isManagedReminderId(202610270)).toBe(true);
    expect(isManagedReminderId(202610279)).toBe(true);
    expect(dateFromReminderId(202610279)).toBe("2026-10-27");
    expect(isManagedReminderId(202610278)).toBe(false);
    expect(isManagedReminderId(1234)).toBe(false);
  });
});
