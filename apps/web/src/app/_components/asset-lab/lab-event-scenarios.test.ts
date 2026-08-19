import { gameEventV2Schema } from "@spelsajt/contracts";
import { describe, expect, it } from "vitest";

import {
  getLabEventScenario,
  labEventScenarios,
} from "./lab-event-scenarios";

describe("3D lab event scenarios", () => {
  it("keeps both recordings schema-valid, contiguous, and identity-stable", () => {
    expect(labEventScenarios.map((scenario) => scenario.id)).toEqual([
      "blackjack-basic",
      "roulette-basic",
    ]);

    for (const scenario of labEventScenarios) {
      expect(gameEventV2Schema.array().safeParse(scenario.events).success).toBe(true);
      expect(scenario.events.map((event) => event.sequence)).toEqual(
        Array.from({ length: scenario.events.length }, (_, index) => index + 1),
      );
      expect(new Set(scenario.events.map((event) => event.tableId)).size).toBe(1);
      expect(new Set(scenario.events.map((event) => event.roundId)).size).toBe(1);
      expect(scenario.events[0]).toMatchObject({
        payload: { game: scenario.game },
        type: "round.prepared",
      });
    }
  });

  it("records the runtime blackjack split flow through its trailing settled turn", () => {
    const scenario = getLabEventScenario("blackjack-basic");

    expect(scenario.events).toHaveLength(21);
    expect(scenario.events[8]).toMatchObject({
      payload: { action: "split", handId: "hand-1" },
      sequence: 9,
      type: "blackjack.action.accepted",
    });
    expect(scenario.events[9]).toMatchObject({
      payload: { sourceHandId: "hand-1", splitHandIds: ["hand-1", "hand-2"] },
      sequence: 10,
      type: "blackjack.hand.split",
    });
    expect(scenario.events[19]).toMatchObject({
      payload: { game: "blackjack", outcome: "mixed" },
      sequence: 20,
      type: "round.settled",
    });
    expect(scenario.events[20]).toMatchObject({
      payload: { activeHandId: null, phase: "settled" },
      sequence: 21,
      type: "blackjack.turn.changed",
    });
  });

  it("never embeds the hidden blackjack card identity before reveal", () => {
    const events = getLabEventScenario("blackjack-basic").events;
    const hidden = events.find(
      (event) => event.type === "blackjack.card.dealt" && !event.payload.faceUp,
    );
    const revealed = events.find((event) => event.type === "blackjack.card.revealed");

    expect(hidden).toBeDefined();
    expect(hidden?.payload).not.toHaveProperty("card");
    expect(JSON.stringify(hidden)).not.toContain("lab-bj-04");
    expect(revealed).toMatchObject({
      payload: {
        card: { cardId: "lab-bj-04", rank: "10", suit: "diamonds" },
        handId: "dealer",
      },
      sequence: 16,
    });
  });

  it("records roulette spin before the authoritative result and a mixed settlement", () => {
    const events = getLabEventScenario("roulette-basic").events;
    const spinIndex = events.findIndex((event) => event.type === "roulette.spin.started");
    const resultIndex = events.findIndex((event) => event.type === "roulette.result");

    expect(events).toHaveLength(11);
    expect(spinIndex).toBeGreaterThan(-1);
    expect(resultIndex).toBe(spinIndex + 1);
    expect(events.slice(0, resultIndex).some((event) => event.type === "roulette.result"))
      .toBe(false);
    expect(events[resultIndex]).toMatchObject({
      payload: { colour: "black", pocket: 17 },
      type: "roulette.result",
    });
    expect(events.at(-1)).toMatchObject({
      payload: { game: "roulette", outcome: "mixed", totalPayout: "900" },
      type: "round.settled",
    });
  });
});
