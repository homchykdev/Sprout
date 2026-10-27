import { describe, expect, it } from "vitest";
import { CAPTURE_MODES, framesFor, poseSpec } from "../pose";
import { analyzePose, StabilityTracker, type PosePoint } from "../pose-vision";

function makePose(
  opts: {
    cx?: number;
    top?: number;
    bottom?: number;
    span?: number;
    wristY?: number;
    visibility?: number;
  } = {},
): PosePoint[] {
  const { cx = 0.5, top = 0.1, bottom = 0.9, span = 0.18, wristY = 0.4 } = opts;
  const vis = opts.visibility ?? 0.9;
  const points: PosePoint[] = Array.from({ length: 33 }, () => ({
    x: cx,
    y: 0.5,
    visibility: vis,
  }));
  points[0] = { x: cx, y: top, visibility: vis };
  points[11] = { x: cx - span / 2, y: top + 0.12, visibility: vis };
  points[12] = { x: cx + span / 2, y: top + 0.12, visibility: vis };
  points[23] = { x: cx - span / 4, y: 0.55, visibility: vis };
  points[24] = { x: cx + span / 4, y: 0.55, visibility: vis };
  points[27] = { x: cx - 0.05, y: bottom, visibility: vis };
  points[28] = { x: cx + 0.05, y: bottom, visibility: vis };
  points[15] = { x: cx - span / 2 - 0.06, y: wristY, visibility: vis };
  points[16] = { x: cx + span / 2 + 0.06, y: wristY, visibility: vis };
  return points;
}

describe("capture sets", () => {
  it("has three modes: views, poses, full", () => {
    expect(CAPTURE_MODES.map((m) => m.id)).toEqual(["views", "poses", "full"]);
    expect(framesFor("views")).toHaveLength(3);
    expect(framesFor("poses")).toHaveLength(3);
    expect(framesFor("full")).toHaveLength(6);
    expect(framesFor("full").map((f) => f.id)).toEqual([
      "front-relaxed",
      "side-relaxed",
      "back-relaxed",
      "front-flexed",
      "side-flexed",
      "back-flexed",
    ]);
  });

  it("gives every frame a title and voice steps", () => {
    for (const f of framesFor("full")) {
      expect(f.title.length).toBeGreaterThan(3);
      expect(f.instruction.length).toBeGreaterThan(1);
    }
    expect(poseSpec("front", "flexed").title).toContain("напряжение");
  });
});

describe("analyzePose", () => {
  it("accepts a well-framed front pose", () => {
    const r = analyzePose(makePose(), "front", "relaxed");
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.bodyHeight).toBeCloseTo(0.8, 5);
  });

  it("detects a side view and rejects it for front", () => {
    const side = makePose({ span: 0.05 });
    expect(analyzePose(side, "side", "relaxed").problems).toEqual([]);
    expect(analyzePose(side, "front", "relaxed").problems).toContain("wrong-view");
    expect(analyzePose(makePose(), "side", "relaxed").problems).toContain("wrong-view");
  });

  it("asks to move when the body is too small, too close or off-center", () => {
    expect(
      analyzePose(makePose({ top: 0.28, bottom: 0.62 }), "front", "relaxed").problems,
    ).toContain("too-small");
    expect(analyzePose(makePose({ top: 0.02 }), "front", "relaxed").problems).toContain(
      "offscreen",
    );
    expect(analyzePose(makePose({ cx: 0.8 }), "front", "relaxed").problems).toContain("off-center");
  });

  it("requires visible key points and raised arms in flexed poses", () => {
    expect(analyzePose(makePose({ visibility: 0.1 }), "front", "relaxed").problems).toEqual([
      "partial",
    ]);
    expect(analyzePose(makePose({ wristY: 0.7 }), "front", "flexed").problems).toContain(
      "arms-low",
    );
    expect(analyzePose(makePose({ wristY: 0.35 }), "front", "flexed").problems).toEqual([]);
  });

  it("handles missing landmarks", () => {
    expect(analyzePose(null, "front", "relaxed").problems).toEqual(["no-person"]);
  });
});

describe("StabilityTracker", () => {
  it("measures how long the pose has been still", () => {
    const t = new StabilityTracker(0.01);
    const a = makePose();
    expect(t.update(a, 0)).toBe(0);
    expect(t.update(a, 500)).toBe(500);
    const moved = a.map((p) => ({ ...p, x: p.x + 0.1 }));
    expect(t.update(moved, 800)).toBe(0);
    expect(t.update(moved, 1400)).toBe(600);
  });
});
