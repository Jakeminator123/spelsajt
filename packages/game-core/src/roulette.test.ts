import { describe, expect, it } from "vitest";

import { rouletteColour } from "./roulette";

describe("rouletteColour", () => {
  it("maps zero to green", () => {
    expect(rouletteColour(0)).toBe("green");
  });

  it("maps standard red and black pockets", () => {
    expect(rouletteColour(1)).toBe("red");
    expect(rouletteColour(2)).toBe("black");
    expect(rouletteColour(36)).toBe("red");
  });

  it("rejects invalid pockets", () => {
    expect(() => rouletteColour(37)).toThrow(RangeError);
  });
});
