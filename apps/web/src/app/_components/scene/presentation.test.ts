import {
  gameEventTypesV2,
  gameEventV2Schema,
  gameSnapshotV2Schema,
  type GameEventV2,
} from "@spelsajt/contracts";
import { systemModel } from "@spelsajt/system-model";
import { afterEach, describe, expect, it } from "vitest";

import actionAcceptedRaw from "../../../../../../packages/contracts/fixtures/v2/blackjack-action-accepted.event.json";
import betAcceptedRaw from "../../../../../../packages/contracts/fixtures/v2/blackjack-bet-accepted.event.json";
import cardDealtRaw from "../../../../../../packages/contracts/fixtures/v2/blackjack-card-dealt.event.json";
import cardHiddenRaw from "../../../../../../packages/contracts/fixtures/v2/blackjack-card-hidden.event.json";
import cardRevealedRaw from "../../../../../../packages/contracts/fixtures/v2/blackjack-card-revealed.event.json";
import handSettledRaw from "../../../../../../packages/contracts/fixtures/v2/blackjack-hand-settled.event.json";
import handSplitRaw from "../../../../../../packages/contracts/fixtures/v2/blackjack-hand-split.event.json";
import turnChangedRaw from "../../../../../../packages/contracts/fixtures/v2/blackjack-turn-changed.event.json";
import blackjackSnapshotRaw from "../../../../../../packages/contracts/fixtures/v2/blackjack.snapshot.json";
import rouletteBetPlacedRaw from "../../../../../../packages/contracts/fixtures/v2/roulette-bet-placed.event.json";
import rouletteBetSettledRaw from "../../../../../../packages/contracts/fixtures/v2/roulette-bet-settled.event.json";
import rouletteBetsLockedRaw from "../../../../../../packages/contracts/fixtures/v2/roulette-bets-locked.event.json";
import rouletteBettingOpenedRaw from "../../../../../../packages/contracts/fixtures/v2/roulette-betting-opened.event.json";
import rouletteResultRaw from "../../../../../../packages/contracts/fixtures/v2/roulette-result.event.json";
import rouletteSpinStartedRaw from "../../../../../../packages/contracts/fixtures/v2/roulette-spin-started.event.json";
import rouletteSnapshotRaw from "../../../../../../packages/contracts/fixtures/v2/roulette.snapshot.json";
import roundPreparedRaw from "../../../../../../packages/contracts/fixtures/v2/round-prepared.event.json";
import roundSettledRaw from "../../../../../../packages/contracts/fixtures/v2/round-settled.event.json";
import roundStartedRaw from "../../../../../../packages/contracts/fixtures/v2/round-started.event.json";
import {
  createInitialPresentationState,
  planGameEvent,
  presentationCueDefinitions,
  presentationStore,
  projectGameEvent,
  projectGameSnapshot,
  recordedRouletteDemo,
} from "./presentation";

const parseEvent = (value: unknown): GameEventV2 => gameEventV2Schema.parse(value);

afterEach(() => presentationStore.reset());

describe("GameEventV2 presentation projector", () => {
  it("keeps cue and ignore coverage synchronized with the reviewed system model", () => {
    expect(Object.keys(presentationCueDefinitions).sort()).toEqual(
      systemModel.presentationCues.map((cue) => cue.id).sort(),
    );
    expect(systemModel.presentationIgnores.map((ignore) => ignore.id)).toEqual([
      "blackjack.action-accepted-ignore",
    ]);
  });

  it("plans every v2 event discriminant", () => {
    const fixtures = [
      roundPreparedRaw,
      roundStartedRaw,
      betAcceptedRaw,
      cardDealtRaw,
      cardRevealedRaw,
      actionAcceptedRaw,
      handSplitRaw,
      turnChangedRaw,
      handSettledRaw,
      rouletteBettingOpenedRaw,
      rouletteBetPlacedRaw,
      rouletteBetsLockedRaw,
      rouletteSpinStartedRaw,
      rouletteResultRaw,
      rouletteBetSettledRaw,
      roundSettledRaw,
    ].map(parseEvent);

    expect([...new Set(fixtures.map((event) => event.type))].sort()).toEqual(
      [...gameEventTypesV2].sort(),
    );
    expect(fixtures.map(planGameEvent).filter((plan) => plan.kind === "ignore")).toHaveLength(1);
  });

  it("selects round cues only from the event game and outcome", () => {
    const prepared = parseEvent(roundPreparedRaw);
    const started = parseEvent(roundStartedRaw);
    const settled = parseEvent(roundSettledRaw);

    for (const game of ["blackjack", "roulette"] as const) {
      const preparedPlan = planGameEvent(parseEvent({
        ...prepared,
        payload: { ...prepared.payload, game },
      }));
      const startedPlan = planGameEvent(parseEvent({
        ...started,
        payload: { ...started.payload, game },
      }));
      expect(preparedPlan.kind === "cue" ? preparedPlan.cueId : null).toBe(`${game}.round-prepared`);
      expect(startedPlan.kind === "cue" ? startedPlan.cueId : null).toBe(`${game}.round-start`);

      for (const outcome of ["win", "loss", "push", "mixed"] as const) {
        const plan = planGameEvent(parseEvent({
          ...settled,
          payload: { ...settled.payload, game, outcome },
        }));
        expect(plan.kind === "cue" ? plan.cueId : null).toBe(`${game}.settled-${outcome}`);
      }
    }
  });

  it("keeps a hidden dealer card opaque and replaces its visual slot on reveal", () => {
    const events = [
      roundPreparedRaw,
      roundStartedRaw,
      betAcceptedRaw,
      cardDealtRaw,
      cardHiddenRaw,
    ].map(parseEvent);
    const beforeReveal = events.reduce(projectGameEvent, createInitialPresentationState());
    const hidden = beforeReveal.cards[1];

    expect(hidden).toEqual({
      faceUp: false,
      handId: "dealer",
      recipient: "dealer",
      visualId: parseEvent(cardHiddenRaw).eventId,
    });
    expect(JSON.stringify(hidden)).not.toContain("card");

    const afterReveal = projectGameEvent(beforeReveal, parseEvent(cardRevealedRaw));
    expect(afterReveal.cards).toHaveLength(beforeReveal.cards.length);
    expect(afterReveal.cards[1]?.faceUp).toBe(true);
    expect(afterReveal.cards[1]?.visualId).toBe(hidden?.visualId);
  });

  it("does not replay a cue for an explicit presentation ignore", () => {
    const throughReveal = [
      roundPreparedRaw,
      roundStartedRaw,
      betAcceptedRaw,
      cardDealtRaw,
      cardHiddenRaw,
      cardRevealedRaw,
    ].map(parseEvent).reduce(projectGameEvent, createInitialPresentationState());
    const ignored = projectGameEvent(throughReveal, parseEvent(actionAcceptedRaw));

    expect(ignored.lastPlan?.kind).toBe("ignore");
    expect(ignored.activeCue).toBe(throughReveal.activeCue);
    expect(ignored.transitionId).toBe(throughReveal.transitionId);
    expect(ignored.lastSequence).toBe(throughReveal.lastSequence + 1);
  });

  it("holds state on sequence gaps, stale events and revision regressions", () => {
    const prepared = projectGameEvent(
      createInitialPresentationState(),
      parseEvent(roundPreparedRaw),
    );
    const started = parseEvent(roundStartedRaw);

    expect(projectGameEvent(prepared, { ...started, sequence: 3 })).toBe(prepared);
    expect(projectGameEvent(prepared, { ...started, sequence: 1 })).toBe(prepared);
    expect(projectGameEvent({ ...prepared, revision: 3 }, started)).toEqual({ ...prepared, revision: 3 });
  });

  it("anchors live presentation from authoritative blackjack and roulette snapshots", () => {
    const blackjack = projectGameSnapshot(
      createInitialPresentationState(),
      gameSnapshotV2Schema.parse(blackjackSnapshotRaw),
    );
    expect(blackjack).toMatchObject({
      activeHandId: "hand-1",
      allowedActions: ["hit", "stand", "double"],
      game: "blackjack",
      lastSequence: 9,
      stage: "active",
      tableId: "table-blackjack-1",
    });
    expect(blackjack.cards).toHaveLength(4);
    expect(blackjack.cards.find((card) => !card.faceUp)).not.toHaveProperty("card");

    const roulette = projectGameSnapshot(
      createInitialPresentationState(),
      gameSnapshotV2Schema.parse(rouletteSnapshotRaw),
    );
    expect(roulette).toMatchObject({
      game: "roulette",
      lastSequence: 4,
      rouletteBets: [{ betId: "bet-1" }],
      rouletteResult: null,
      stage: "roulette-locked",
      tableId: "table-roulette-1",
    });
  });

  it("accepts the next live event after a snapshot anchor and rejects stale anchors", () => {
    const snapshot = gameSnapshotV2Schema.parse(rouletteSnapshotRaw);
    const anchored = projectGameSnapshot(createInitialPresentationState(), snapshot);
    const spin = parseEvent({
      ...rouletteSpinStartedRaw,
      revision: snapshot.revision,
      roundId: snapshot.round?.roundId,
      sequence: snapshot.lastSequence + 1,
      tableId: snapshot.tableId,
    });
    const projected = projectGameEvent(anchored, spin);

    expect(projected.stage).toBe("roulette-spinning");
    expect(projected.lastSequence).toBe(5);
    expect(projectGameSnapshot(projected, snapshot)).toBe(projected);
  });

  it("projects the schema-validated recording without inventing a roulette result", () => {
    expect(() => gameEventV2Schema.array().parse(recordedRouletteDemo.events)).not.toThrow();
    const spinIndex = recordedRouletteDemo.events.findIndex((event) => event.type === "roulette.spin.started");
    const spinState = recordedRouletteDemo.events
      .slice(0, spinIndex + 1)
      .reduce(projectGameEvent, createInitialPresentationState());
    expect(spinState.stage).toBe("roulette-spinning");
    expect(spinState.rouletteResult).toBeNull();

    const finalState = recordedRouletteDemo.events.reduce(
      projectGameEvent,
      createInitialPresentationState(),
    );
    expect(finalState.stage).toBe("settled");
    expect(finalState.rouletteResult).toEqual({ colour: "black", pocket: 17 });
    expect(finalState.activeCue?.cueId).toBe("roulette.settled-win");
  });

  it("preserves pocket zero instead of treating it as an absent result", () => {
    const resultIndex = recordedRouletteDemo.events.findIndex((event) => event.type === "roulette.result");
    const beforeResult = recordedRouletteDemo.events
      .slice(0, resultIndex)
      .reduce(projectGameEvent, createInitialPresentationState());
    const recordedResult = recordedRouletteDemo.events[resultIndex];
    expect(recordedResult?.type).toBe("roulette.result");
    if (!recordedResult || recordedResult.type !== "roulette.result") return;

    const zeroResult = parseEvent({
      ...recordedResult,
      payload: { colour: "green", pocket: 0 },
    });
    expect(projectGameEvent(beforeResult, zeroResult).rouletteResult).toEqual({
      colour: "green",
      pocket: 0,
    });
  });

  it("rejects invalid runtime input at the store boundary", () => {
    presentationStore.reset();
    const before = presentationStore.getSnapshot();
    expect(presentationStore.dispatch({ type: "roulette.result", payload: { pocket: 99 } })).toBe(false);
    expect(presentationStore.getSnapshot()).toBe(before);
  });
});
