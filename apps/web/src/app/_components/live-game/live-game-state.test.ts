import type { GameEventV2, GameSnapshotV2 } from "@spelsajt/contracts";
import { describe, expect, it } from "vitest";

import {
  connectionLabel,
  initialLiveGameState,
  reduceLiveGameState,
} from "./live-game-state";

const hash = "b".repeat(64);
const snapshot: GameSnapshotV2 = {
  balance: "10000",
  game: "roulette",
  lastSequence: 2,
  revision: 1,
  round: {
    bets: [],
    fairness: { algorithm: "pf-v1", commitment: hash, nonce: 0 },
    game: "roulette",
    phase: "betting",
    result: null,
    revision: 1,
    roundId: "22222222-2222-4222-8222-222222222223",
    rulesetHash: hash,
    rulesetId: "mvp-v2",
    totalWager: "0",
  },
  schemaVersion: 2,
  tableId: "roulette-user-1",
};
const event: GameEventV2 = {
  eventId: "11111111-1111-4111-8111-111111111111",
  occurredAt: "2026-08-18T00:00:00.000Z",
  payload: {
    commitment: hash,
    fairnessAlgorithm: "pf-v1",
    game: "roulette",
    nonce: 0,
    rulesetHash: hash,
    rulesetId: "mvp-v2",
  },
  revision: 1,
  roundId: snapshot.round!.roundId,
  schemaVersion: 2,
  sequence: 1,
  tableId: snapshot.tableId,
  type: "round.prepared",
};

describe("live game state", () => {
  it("covers loading, command error and authoritative recovery", () => {
    const loaded = reduceLiveGameState(initialLiveGameState, {
      snapshot,
      type: "load.succeeded",
    });
    expect(loaded).toMatchObject({ issue: null, loading: false, snapshot });

    const pending = reduceLiveGameState(loaded, { type: "command.started" });
    const failed = reduceLiveGameState(pending, {
      issue: "STALE_REVISION",
      type: "command.failed",
    });
    expect(failed).toMatchObject({ issue: "STALE_REVISION", pendingCommand: false });

    const recovered = reduceLiveGameState(failed, {
      snapshot: { ...snapshot, revision: 2 },
      type: "snapshot.received",
    });
    expect(recovered.snapshot?.revision).toBe(2);

    const stale = reduceLiveGameState(recovered, {
      snapshot,
      type: "snapshot.received",
    });
    expect(stale.snapshot?.revision).toBe(2);
  });

  it("makes reconnect state visible and keeps only recent contracted events", () => {
    let state = reduceLiveGameState(initialLiveGameState, {
      connection: "reconnecting",
      type: "connection.changed",
    });
    expect(connectionLabel(state.connection)).toBe("Återansluter");

    for (let index = 1; index <= 10; index += 1) {
      state = reduceLiveGameState(state, {
        event: { ...event, eventId: eventId(index), sequence: index },
        type: "event.received",
      });
    }
    expect(state.recentEvents).toHaveLength(8);
    expect(state.recentEvents[0]?.sequence).toBe(3);
    expect(state.recentEvents.at(-1)?.sequence).toBe(10);
  });

  it("stops loading with an actionable configuration error", () => {
    const failed = reduceLiveGameState(initialLiveGameState, {
      issue: "Konfiguration saknas",
      type: "load.failed",
    });
    expect(failed).toMatchObject({ issue: "Konfiguration saknas", loading: false });
  });
});

function eventId(value: number): string {
  return `11111111-1111-4111-8111-${String(value).padStart(12, "0")}`;
}
