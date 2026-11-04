import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceGuidance } from "../voice-guidance";

describe("voice guidance", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("announces new guidance and repeats the latest prompt every six seconds", () => {
    vi.useFakeTimers();
    const announce = vi.fn();
    const guidance = createVoiceGuidance(announce);

    guidance.update("Встань по центру кадра");
    guidance.update("Встань по центру кадра");
    vi.advanceTimersByTime(5_999);
    expect(announce).toHaveBeenCalledTimes(1);

    guidance.update("Отойди чуть назад");
    expect(announce).toHaveBeenLastCalledWith("Отойди чуть назад");
    vi.advanceTimersByTime(6_000);
    expect(announce).toHaveBeenLastCalledWith("Отойди чуть назад");
    // update announce + the interval tick anchored to the first repeat cycle.
    expect(announce).toHaveBeenCalledTimes(3);

    guidance.pause();
    vi.advanceTimersByTime(12_000);
    expect(announce).toHaveBeenCalledTimes(3);
    guidance.stop();
  });

  it("pauses repetitions during the countdown and resumes with the latest prompt", () => {
    vi.useFakeTimers();
    const announce = vi.fn();
    const guidance = createVoiceGuidance(announce);

    guidance.update("Стой неподвижно…");
    guidance.pause();
    // Queued updates while paused never announce.
    guidance.update("Готовься…");
    expect(announce).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(announce).toHaveBeenCalledTimes(1);

    guidance.resume();
    expect(announce).toHaveBeenLastCalledWith("Готовься…");
    vi.advanceTimersByTime(6_000);
    expect(announce).toHaveBeenLastCalledWith("Готовься…");
    expect(announce).toHaveBeenCalledTimes(3);
  });

  it("uses a custom repeat interval", () => {
    vi.useFakeTimers();
    const announce = vi.fn();
    const guidance = createVoiceGuidance(announce, { repeatMs: 2_500 });

    guidance.update("Встань по центру кадра");
    vi.advanceTimersByTime(2_499);
    expect(announce).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("reannounces the current prompt on demand without waiting for the timer", () => {
    vi.useFakeTimers();
    const announce = vi.fn();
    const guidance = createVoiceGuidance(announce, { repeatMs: 2_500 });

    guidance.update("Опустите плечи");
    expect(announce).toHaveBeenCalledTimes(1);
    expect(guidance.getPrompt()).toBe("Опустите плечи");

    guidance.reannounce();
    expect(announce).toHaveBeenLastCalledWith("Опустите плечи");
    expect(announce).toHaveBeenCalledTimes(2);

    guidance.reannounce();
    expect(announce).toHaveBeenCalledTimes(3);

    // Silent when there is no prompt or guidance is paused.
    guidance.stop();
    expect(guidance.getPrompt()).toBeNull();
    expect(() => guidance.reannounce()).not.toThrow();
    const callsBefore = announce.mock.calls.length;
    guidance.update("Снова");
    guidance.pause();
    expect(() => guidance.reannounce()).not.toThrow();
    expect(announce).toHaveBeenCalledTimes(callsBefore);
  });
});
