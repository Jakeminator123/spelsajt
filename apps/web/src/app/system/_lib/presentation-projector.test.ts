import { describe, expect, it } from "vitest";

import { createPlaybackState, playbackReducer } from "./presentation-projector";

describe("system canvas playback", () => {
  it("starts paused and resets when the game changes", () => {
    const blackjack = createPlaybackState("blackjack-basic");
    const playing = playbackReducer(blackjack, { lastIndex: 7, type: "toggle" });
    const roulette = playbackReducer(playing, {
      scenarioId: "roulette-basic",
      type: "select-scenario",
    });

    expect(roulette).toEqual({
      isPlaying: false,
      scenarioId: "roulette-basic",
      stepIndex: 0,
    });
  });

  it("plays to the final step and then pauses", () => {
    const initial = {
      ...createPlaybackState("blackjack-basic"),
      isPlaying: true,
      stepIndex: 1,
    };

    const final = playbackReducer(initial, { lastIndex: 2, type: "tick" });

    expect(final).toEqual({
      isPlaying: false,
      scenarioId: "blackjack-basic",
      stepIndex: 2,
    });
  });

  it("clamps manual navigation to the scenario boundaries", () => {
    const initial = createPlaybackState("roulette-basic");
    const previous = playbackReducer(initial, { lastIndex: 5, type: "previous" });
    const final = playbackReducer(
      { ...previous, stepIndex: 5 },
      { lastIndex: 5, type: "next" },
    );

    expect(previous.stepIndex).toBe(0);
    expect(final.stepIndex).toBe(5);
  });
});
