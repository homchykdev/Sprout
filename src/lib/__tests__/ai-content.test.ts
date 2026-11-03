import { describe, expect, it } from "vitest";
import { normalizeAiContent } from "../ai-content";

describe("normalizeAiContent", () => {
  it("passes plain strings through", () => {
    expect(normalizeAiContent('{"a":1}')).toBe('{"a":1}');
    expect(normalizeAiContent("")).toBe("");
  });

  it("joins an array of string parts", () => {
    expect(normalizeAiContent(["a", "b"])).toBe("ab");
  });

  it("joins content-part objects by their text field", () => {
    expect(
      normalizeAiContent([
        { type: "text", text: "Привет" },
        { type: "text", text: ", мир" },
      ]),
    ).toBe("Привет, мир");
  });

  it("handles a single content-part object", () => {
    expect(normalizeAiContent({ type: "text", text: "одна часть" })).toBe("одна часть");
  });

  it("skips garbage between parts", () => {
    expect(normalizeAiContent(["a", 42, null, { noText: true }, { text: "b" }])).toBe("ab");
  });

  it("normalizes null and undefined to empty string", () => {
    expect(normalizeAiContent(null)).toBe("");
    expect(normalizeAiContent(undefined)).toBe("");
  });

  it("normalizes unknown object shapes to empty string (no crash)", () => {
    expect(normalizeAiContent({ weird: true })).toBe("");
    expect(normalizeAiContent({ text: 123 })).toBe("");
  });
});
