export const europeanRouletteRuleset = {
  pockets: 37,
  rulesetId: "mvp-v1",
  zeroes: 1,
} as const;

const redPockets = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteColour = "black" | "green" | "red";

export function rouletteColour(pocket: number): RouletteColour {
  if (!Number.isInteger(pocket) || pocket < 0 || pocket > 36) {
    throw new RangeError("Roulette pocket must be an integer from 0 to 36.");
  }

  if (pocket === 0) {
    return "green";
  }

  return redPockets.has(pocket) ? "red" : "black";
}
