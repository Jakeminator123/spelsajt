import { describe, expect, it } from "vitest";

import {
  createLabEventPlayback,
  inspectLabEventTimeline,
  replayLabEvents,
  resetLabEventPlayback,
  stepLabEventBackward,
  stepLabEventForward,
} from "./lab-event-controller";
import { getLabEventScenario } from "./lab-event-scenarios";

describe("3D lab event controller", () => {
  it("replays hidden-card state and reveals the same visual slot only on reveal", () => {
    const events = getLabEventScenario("blackjack-basic").events;
    const revealIndex = events.findIndex((event) => event.type === "blackjack.card.revealed");
    const beforeReveal = replayLabEvents(events, revealIndex);
    const hidden = beforeReveal.presentation.cards.find((card) => !card.faceUp);

    expect(beforeReveal.error).toBeNull();
    expect(hidden).toEqual(expect.objectContaining({
      faceUp: false,
      handId: "dealer",
      recipient: "dealer",
    }));
    expect(hidden).not.toHaveProperty("card");

    const afterReveal = replayLabEvents(events, revealIndex + 1);
    const revealed = afterReveal.presentation.cards.find(
      (card) => card.visualId === hidden?.visualId,
    );
    expect(revealed).toMatchObject({
      card: { cardId: "lab-bj-04" },
      faceUp: true,
      handId: "dealer",
      recipient: "dealer",
    });
  });

  it("does not invent a roulette result while only the spin event is active", () => {
    const events = getLabEventScenario("roulette-basic").events;
    const spinIndex = events.findIndex((event) => event.type === "roulette.spin.started");
    const spinning = replayLabEvents(events, spinIndex + 1);

    expect(spinning.presentation.stage).toBe("roulette-spinning");
    expect(spinning.presentation.rouletteResult).toBeNull();

    const result = replayLabEvents(events, spinIndex + 2);
    expect(result.presentation.stage).toBe("roulette-result");
    expect(result.presentation.rouletteResult).toEqual({ colour: "black", pocket: 17 });
  });

  it("preserves settlement state and cue after the runtime trailing turn event", () => {
    const events = getLabEventScenario("blackjack-basic").events;
    const final = replayLabEvents(events, events.length);

    expect(final.error).toBeNull();
    expect(final.presentation.stage).toBe("settled");
    expect(final.presentation.activeCue?.cueId).toBe("blackjack.settled-mixed");
    expect(final.presentation.lastSequence).toBe(21);
  });

  it("marks presentation ignores without replaying an avatar clip", () => {
    const events = getLabEventScenario("blackjack-basic").events;
    const rows = inspectLabEventTimeline(events, 9, ["idle_loop", "deal_left"]);
    const ignored = rows[8];

    expect(ignored).toMatchObject({
      clipStatus: "ignored",
      progress: "active",
      resolution: "ignored",
      runtimeClipName: null,
      visualIntent: null,
    });
    expect(ignored?.plan.kind).toBe("ignore");
  });

  it("distinguishes canonical clips from temporary and missing fallbacks", () => {
    const events = getLabEventScenario("blackjack-basic").events;
    const rows = inspectLabEventTimeline(events, events.length, [
      "Idle_6",
      "deal_left",
    ]);
    const prepared = rows.find((row) => row.event.type === "round.prepared");
    const deal = rows.find((row) => row.event.sequence === 4);
    const reveal = rows.find((row) => row.event.type === "blackjack.card.revealed");

    expect(prepared).toMatchObject({
      clipStatus: "temporary",
      resolution: "fallback",
      runtimeClipName: "Idle_6",
    });
    expect(deal).toMatchObject({
      clipStatus: "ready",
      resolution: "ready",
      runtimeClipName: "deal_left",
    });
    expect(reveal).toMatchObject({
      clipStatus: "missing",
      resolution: "fallback",
      runtimeClipName: null,
    });
  });

  it("steps backward by replaying from the beginning and resets cleanly", () => {
    const events = getLabEventScenario("roulette-basic").events;
    let playback = createLabEventPlayback();
    playback = stepLabEventForward(playback, events);
    playback = stepLabEventForward(playback, events);
    playback = stepLabEventForward(playback, events);

    expect(playback).toMatchObject({ cursor: 3, error: null });
    expect(playback.presentation.lastSequence).toBe(3);

    const backward = stepLabEventBackward(playback, events);
    expect(backward).toMatchObject({ cursor: 2, error: null });
    expect(backward.presentation.lastSequence).toBe(2);
    expect(backward.presentation.rouletteBets).toHaveLength(0);

    expect(resetLabEventPlayback()).toEqual(createLabEventPlayback());
  });

  it("surfaces sequence gaps as projection errors instead of skipping them", () => {
    const events = getLabEventScenario("roulette-basic").events;
    const gapped = [events[0], events[2]].filter((event) => event !== undefined);
    const playback = replayLabEvents(gapped, gapped.length);
    const rows = inspectLabEventTimeline(gapped, gapped.length, []);

    expect(playback.cursor).toBe(1);
    expect(playback.error).toContain("kunde inte appliceras");
    expect(rows[1]).toMatchObject({
      clipStatus: "error",
      resolution: "error",
    });
  });
});
