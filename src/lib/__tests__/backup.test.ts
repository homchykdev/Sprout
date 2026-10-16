import { describe, expect, it } from "vitest";
import {
  buildBackup,
  buildSingleFile,
  countRecords,
  parseBackup,
  parseSingleFile,
} from "../backup";
describe("sectioned backup files", () => {
  it("one section per file round-trips only that section", () => {
    const f = buildBackup(["library"]);
    expect(Object.keys(f.sections)).toEqual(["library"]);
    expect(Object.keys(parseBackup(JSON.stringify(f)))).toEqual(["library"]);
  });
  it("single-file round-trips its section", () => {
    const f = buildSingleFile("library");
    expect(f.section).toBe("library");
    const back = parseSingleFile(JSON.stringify(f), "library");
    expect(Array.isArray(back.exercises)).toBe(true);
  });
  it("rejects a foreign section without touching data", () => {
    const f = buildSingleFile("workouts");
    expect(() => parseSingleFile(JSON.stringify(f), "library")).toThrow("wrong-section:workouts");
  });
  it("rejects non-pulse files", () => {
    expect(() => parseSingleFile(`{"app":"other"}`, "library")).toThrow("not-pulse");
    expect(() => parseSingleFile("nope", "library")).toThrow("not-json");
  });
  it("counts records for the confirm dialog", () => {
    const f = buildSingleFile("library");
    const c = countRecords("library", f.data);
    expect(c.label).toContain("упражн");
    expect(c.count).toBeGreaterThanOrEqual(0);
  });
  it("keys section carries the ffmpeg key", () => {
    const f = buildSingleFile("keys");
    expect("ffmpegKey" in f.data).toBe(true);
    expect(countRecords("keys", { ...f.data, ffmpegKey: "x" }).count).toBeGreaterThanOrEqual(1);
  });
});
