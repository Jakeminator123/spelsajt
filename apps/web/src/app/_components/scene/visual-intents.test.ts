import { systemModel } from "@spelsajt/system-model";
import { describe, expect, it } from "vitest";

import type { PresentationCard, PresentationCueId } from "./presentation";
import {
  cardTarget,
  chipMotionTransform,
  sceneVisualIntent,
  sceneVisualIntents,
} from "./visual-intents";

describe("scene visual intents", () => {
  it("maps every reviewed cue to an explicit visual response", () => {
    expect(Object.keys(sceneVisualIntents).sort()).toEqual(
      systemModel.presentationCues.map((cue) => cue.id).sort(),
    );

    for (const cue of systemModel.presentationCues) {
      const intent = sceneVisualIntent(cue.id as PresentationCueId);
      expect(intent.label).not.toBe("");
      expect(intent.actorLabel).toMatch(/^(BORD|DEALER|SPELARE)$/);
      expect(intent.pose).toMatch(/^(rest|present|deal|reveal|celebrate|sympathetic)$/);
    }
  });

  it("separates split blackjack hands into distinct table lanes", () => {
    const cards: PresentationCard[] = [
      { card: { cardId: "a", rank: "8", suit: "spades" }, faceUp: true, handId: "left", recipient: "player", visualId: "a" },
      { card: { cardId: "b", rank: "8", suit: "hearts" }, faceUp: true, handId: "right", recipient: "player", visualId: "b" },
      { card: { cardId: "c", rank: "3", suit: "clubs" }, faceUp: true, handId: "left", recipient: "player", visualId: "c" },
      { card: { cardId: "d", rank: "K", suit: "diamonds" }, faceUp: true, handId: "right", recipient: "player", visualId: "d" },
    ];

    const left = cardTarget(cards, 0);
    const right = cardTarget(cards, 1);
    const leftSecond = cardTarget(cards, 2);

    expect(left.position[0]).toBeLessThan(0);
    expect(right.position[0]).toBeGreaterThan(0);
    expect(leftSecond.position[0]).toBeGreaterThan(left.position[0]);
    expect(leftSecond.position[0]).toBeLessThan(right.position[0]);
  });

  it("moves losing chips away and winning chips toward the player", () => {
    expect(chipMotionTransform("collect", 1)).toEqual({ scale: 0, x: 0.35, z: -1.1 });
    expect(chipMotionTransform("payout", 1).z).toBeGreaterThan(0);
    expect(chipMotionTransform("place", 0).z).toBeGreaterThan(0);
    expect(chipMotionTransform("place", 1)).toEqual({ scale: 1, x: 0, z: 0 });
  });
});
