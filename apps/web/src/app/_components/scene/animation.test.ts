import { describe, expect, it } from "vitest";

import { dampToTarget } from "./animation";

describe("dampToTarget", () => {
  it("moves toward the target without overshooting", () => {
    expect(dampToTarget(Math.PI, 0, 0.25)).toBeCloseTo(Math.PI * 0.75);
  });

  it("snaps to the exact target inside the resting threshold", () => {
    expect(dampToTarget(0.0005, 0, 0.1)).toBe(0);
  });

  it("clamps a long frame to the exact target", () => {
    expect(dampToTarget(Math.PI, 0, 2)).toBe(0);
  });
});
