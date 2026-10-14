import { describe, expect, it } from "vitest";
import { buildBackup, parseBackup } from "../backup";
describe("sectioned backup files", () => {
  it("one section per file round-trips only that section", () => {
    const f = buildBackup(["library"]);
    expect(Object.keys(f.sections)).toEqual(["library"]);
    expect(Object.keys(parseBackup(JSON.stringify(f)))).toEqual(["library"]);
  });
});
