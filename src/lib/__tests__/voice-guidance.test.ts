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
    expect(announce).toHaveBeenCalledTimes(3);

    guidance.stop();
    vi.advanceTimersByTime(12_000);
    expect(announce).toHaveBeenCalledTimes(3);
  });

  it("pauses repetitions during the countdown and resumes with the latest prompt", () => {
    vi.useFakeTimers();
    const announce = vi.fn();
    const guidance = createVoiceGuidance(announce);

    guidance.update("Повернись боком");
    guidance.pause();
    guidance.update("Подними руки");
    vi.advanceTimersByTime(12_000);
    expect(announce).toHaveBeenCalledTimes(1);

    guidance.resume();
    expect(announce).toHaveBeenLastCalledWith("Подними руки");
    vi.advanceTimersByTime(6_000);
    expect(announce).toHaveBeenCalledTimes(3);
    expect(announce).toHaveBeenLastCalledWith("Подними руки");
  });
});
