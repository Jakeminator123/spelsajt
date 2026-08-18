import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  commandAckV2Schema,
  gameCommandTypesV2,
  gameCommandV2Schema,
  gameEventTypesV2,
  gameEventV2Schema,
  gameSnapshotV2Schema,
  rouletteBetTypesV2,
  rouletteSelectionV2Schema,
  serverReadyV2Schema,
  socketAuthV2Schema,
  tableSubscriptionAckV2Schema,
  tableSubscriptionV2Schema,
} from "./v2";

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

describe("v2 network contracts", () => {
  const commandFixtures = [
    "../fixtures/v2/prepare-round.command.json",
    "../fixtures/v2/blackjack-place-bet.command.json",
    "../fixtures/v2/blackjack-action.command.json",
    "../fixtures/v2/roulette-place-bets.command.json",
    "../fixtures/v2/roulette-spin.command.json",
  ] as const;

  const eventFixtures = [
    "../fixtures/v2/round-prepared.event.json",
    "../fixtures/v2/round-started.event.json",
    "../fixtures/v2/blackjack-bet-accepted.event.json",
    "../fixtures/v2/blackjack-card-dealt.event.json",
    "../fixtures/v2/blackjack-card-hidden.event.json",
    "../fixtures/v2/blackjack-card-revealed.event.json",
    "../fixtures/v2/blackjack-action-accepted.event.json",
    "../fixtures/v2/blackjack-hand-split.event.json",
    "../fixtures/v2/blackjack-turn-changed.event.json",
    "../fixtures/v2/blackjack-hand-settled.event.json",
    "../fixtures/v2/roulette-betting-opened.event.json",
    "../fixtures/v2/roulette-bet-placed.event.json",
    "../fixtures/v2/roulette-bets-locked.event.json",
    "../fixtures/v2/roulette-spin-started.event.json",
    "../fixtures/v2/roulette-result.event.json",
    "../fixtures/v2/roulette-bet-settled.event.json",
    "../fixtures/v2/round-settled.event.json",
  ] as const;

  it.each(commandFixtures)("accepts command fixture %s", (path) => {
    expect(gameCommandV2Schema.safeParse(readJson(path)).success).toBe(true);
  });

  it.each(eventFixtures)("accepts event fixture %s", (path) => {
    expect(gameEventV2Schema.safeParse(readJson(path)).success).toBe(true);
  });

  it.each([
    "../fixtures/v2/blackjack-prepared.snapshot.json",
    "../fixtures/v2/blackjack.snapshot.json",
    "../fixtures/v2/roulette.snapshot.json",
  ] as const)("accepts snapshot fixture %s", (path) => {
    expect(gameSnapshotV2Schema.safeParse(readJson(path)).success).toBe(true);
  });

  it.each([
    "../fixtures/v2/accepted.command-ack.json",
    "../fixtures/v2/replayed.command-ack.json",
    "../fixtures/v2/rejected.command-ack.json",
  ] as const)("accepts command acknowledgement fixture %s", (path) => {
    expect(commandAckV2Schema.safeParse(readJson(path)).success).toBe(true);
  });

  it("accepts realtime transport fixtures", () => {
    expect(socketAuthV2Schema.safeParse(
      readJson("../fixtures/v2/socket-auth.json"),
    ).success).toBe(true);
    expect(serverReadyV2Schema.safeParse(
      readJson("../fixtures/v2/server-ready.json"),
    ).success).toBe(true);
    expect(tableSubscriptionV2Schema.safeParse(
      readJson("../fixtures/v2/table-subscription.json"),
    ).success).toBe(true);
    expect(tableSubscriptionAckV2Schema.safeParse(
      readJson("../fixtures/v2/table-subscription-ack.json"),
    ).success).toBe(true);
  });

  it("rejects unknown table subscription fields", () => {
    const subscription = readJson("../fixtures/v2/table-subscription.json") as object;
    expect(tableSubscriptionV2Schema.safeParse({ ...subscription, accessToken: "secret" }).success)
      .toBe(false);
  });

  it("rejects unknown server ready fields", () => {
    const ready = readJson("../fixtures/v2/server-ready.json") as object;
    expect(serverReadyV2Schema.safeParse({ ...ready, internalHost: "game-1" }).success)
      .toBe(false);
  });

  it("keeps command and event fixture coverage exhaustive", () => {
    const commandTypes = new Set(commandFixtures.map((path) => (
      readJson(path) as { type: string }
    ).type));
    const eventTypes = new Set(eventFixtures.map((path) => (
      readJson(path) as { type: string }
    ).type));

    expect([...commandTypes].toSorted()).toEqual([...gameCommandTypesV2].toSorted());
    expect([...eventTypes].toSorted()).toEqual([...gameEventTypesV2].toSorted());
  });

  it("covers every roulette selection discriminant", () => {
    const selections = readJson("../fixtures/v2/roulette-selections.json") as unknown[];
    expect(selections.every((selection) => rouletteSelectionV2Schema.safeParse(selection).success)).toBe(true);
    expect(selections.map((selection) => (selection as { type: string }).type).toSorted())
      .toEqual([...rouletteBetTypesV2].toSorted());
  });

  it("never accepts a card value on a face-down deal", () => {
    const hidden = readJson("../fixtures/v2/blackjack-card-hidden.event.json") as {
      payload: Record<string, unknown>;
    } & Record<string, unknown>;
    const leaked = {
      ...hidden,
      payload: {
        ...hidden.payload,
        card: {
          cardId: "leaked-card",
          rank: "A",
          suit: "spades",
        },
      },
    };

    expect(gameEventV2Schema.safeParse(leaked).success).toBe(false);
  });

  it("requires blackjack wagers to be divisible by the ruleset wager unit", () => {
    const command = readJson("../fixtures/v2/blackjack-place-bet.command.json") as {
      payload: Record<string, unknown>;
    } & Record<string, unknown>;

    expect(gameCommandV2Schema.safeParse({
      ...command,
      payload: { ...command.payload, amount: "101" },
    }).success).toBe(false);
  });

  it("bounds command amounts so every accepted wager and worst-case payout stays exact", () => {
    const blackjack = readJson("../fixtures/v2/blackjack-place-bet.command.json") as {
      payload: Record<string, unknown>;
    } & Record<string, unknown>;
    const roulette = readJson("../fixtures/v2/roulette-place-bets.command.json") as {
      payload: { bets: Record<string, unknown>[] };
    } & Record<string, unknown>;

    expect(gameCommandV2Schema.safeParse({
      ...blackjack,
      payload: { ...blackjack.payload, amount: "100000000000" },
    }).success).toBe(false);
    expect(gameCommandV2Schema.safeParse({
      ...roulette,
      payload: {
        ...roulette.payload,
        bets: roulette.payload.bets.map((bet) => ({ ...bet, amount: "100000000000" })),
      },
    }).success).toBe(false);
  });

  it("accepts the exact safe-integer credit ceiling and rejects the next integer", () => {
    const snapshot = readJson("../fixtures/v2/blackjack.snapshot.json") as Record<string, unknown>;

    expect(gameSnapshotV2Schema.safeParse({
      ...snapshot,
      balance: String(Number.MAX_SAFE_INTEGER),
    }).success).toBe(true);
    expect(gameSnapshotV2Schema.safeParse({
      ...snapshot,
      balance: "9007199254740992",
    }).success).toBe(false);
  });

  it("correlates snapshot game, phase and result fields", () => {
    const blackjack = readJson("../fixtures/v2/blackjack.snapshot.json") as {
      round: Record<string, unknown>;
    } & Record<string, unknown>;
    const roulette = readJson("../fixtures/v2/roulette.snapshot.json") as {
      round: Record<string, unknown>;
    } & Record<string, unknown>;

    expect(gameSnapshotV2Schema.safeParse({ ...blackjack, round: roulette.round }).success).toBe(false);
    expect(gameSnapshotV2Schema.safeParse({
      ...roulette,
      round: { ...roulette.round, phase: "settled", result: null },
    }).success).toBe(false);
    expect(gameSnapshotV2Schema.safeParse({
      ...blackjack,
      round: { ...blackjack.round, activeHandId: null, phase: "settled" },
    }).success).toBe(false);
  });

  it("locks replay acknowledgements to the original accepted result", () => {
    const accepted = readJson("../fixtures/v2/accepted.command-ack.json") as Record<string, unknown>;
    const replayed = readJson("../fixtures/v2/replayed.command-ack.json") as Record<string, unknown>;
    const { status: acceptedStatus, ...acceptedResult } = accepted;
    const { status: replayedStatus, ...replayedResult } = replayed;

    expect(acceptedStatus).toBe("accepted");
    expect(replayedStatus).toBe("replayed");
    expect(replayedResult).toEqual(acceptedResult);
  });

  it("keeps protocol objects strict and rejects unknown fields", () => {
    const command = readJson("../fixtures/v2/prepare-round.command.json") as Record<string, unknown>;
    expect(gameCommandV2Schema.safeParse({ ...command, debugOutcome: 17 }).success).toBe(false);
  });
});
