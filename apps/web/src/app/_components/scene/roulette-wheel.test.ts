import { describe, expect, it } from "vitest";

import { EUROPEAN_WHEEL_SEQUENCE, roulettePocketAngle } from "./roulette-wheel";

const segmentAngle = Math.PI * 2 / EUROPEAN_WHEEL_SEQUENCE.length;

describe("roulettePocketAngle", () => {
  it.each([
    [0, 0],
    [17, 8],
    [26, 36],
  ])("maps pocket %i to its European wheel segment", (pocket, index) => {
    expect(roulettePocketAngle(pocket)).toBeCloseTo(
      -Math.PI / 2 + (index + 0.5) * segmentAngle,
      12,
    );
  });

  it.each([-1, 37, 1.5])("rejects invalid pocket %s", (pocket) => {
    expect(() => roulettePocketAngle(pocket)).toThrow(RangeError);
  });

  it.each(EUROPEAN_WHEEL_SEQUENCE.map((pocket, index) => [pocket, index] as const))(
    "locks pocket %i to visual segment %i",
    (pocket, index) => {
      const angle = roulettePocketAngle(pocket);
      expect(angle).toBeCloseTo(-Math.PI / 2 + (index + 0.5) * segmentAngle, 12);
      expect(Number.isFinite(angle)).toBe(true);
    },
  );

  it("keeps all 37 target angles unique", () => {
    const angles = EUROPEAN_WHEEL_SEQUENCE.map(roulettePocketAngle);
    expect(new Set(angles).size).toBe(37);
  });
});
