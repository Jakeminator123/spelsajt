import type { GameEventV2, GameSnapshotV2 } from "@spelsajt/contracts";
import { describe, expect, it } from "vitest";

import {
  appendRoundEvent,
  evidenceForSnapshot,
  persistFairnessEvidence,
  restoreFairnessEvidence,
} from "./fairness-evidence-store";

const hash = "b".repeat(64);
const roundId = "22222222-2222-4222-8222-222222222223";
const tableId = "roulette-user-1";
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
    roundId,
    rulesetHash: hash,
    rulesetId: "mvp-v2",
    totalWager: "0",
  },
  schemaVersion: 2,
  tableId,
};

describe("fairness evidence storage", () => {
  it("keeps one validated round transcript across a page reload", () => {
    const storage = new MemoryStorage();
    const events = [preparedEvent(1), preparedEvent(2)];

    persistFairnessEvidence(tableId, events, storage);

    expect(restoreFairnessEvidence(snapshot, storage)).toEqual(events);
    expect(evidenceForSnapshot(snapshot, [], storage)).toEqual(events);
    expect(evidenceForSnapshot(snapshot, events)).toBe(events);
  });

  it("starts over when a new round arrives and ignores duplicate delivery", () => {
    const first = preparedEvent(1);
    const duplicate = appendRoundEvent([first], first);
    expect(duplicate).toEqual([first]);

    const nextRound = preparedEvent(2, "33333333-3333-4333-8333-333333333333");
    expect(appendRoundEvent(duplicate, nextRound)).toEqual([nextRound]);
  });

  it("fails closed for corrupt, cross-table or cross-round evidence", () => {
    const storage = new MemoryStorage();
    persistFairnessEvidence(tableId, [preparedEvent(1)], storage);
    const otherTable = { ...snapshot, tableId: "roulette-user-2" };
    expect(restoreFairnessEvidence(otherTable, storage)).toEqual([]);

    storage.setItem(
      `spelsajt:fairness-evidence:v1:${tableId}`,
      JSON.stringify([{ ...preparedEvent(1), tableId: "roulette-user-2" }]),
    );
    expect(restoreFairnessEvidence(snapshot, storage)).toEqual([]);

    storage.setItem(`spelsajt:fairness-evidence:v1:${tableId}`, "not-json");
    expect(restoreFairnessEvidence(snapshot, storage)).toEqual([]);

    persistFairnessEvidence(tableId, [preparedEvent(1, "44444444-4444-4444-8444-444444444444")], storage);
    expect(restoreFairnessEvidence(snapshot, storage)).toEqual([]);
  });
});

function preparedEvent(sequence: number, eventRoundId = roundId): GameEventV2 {
  return {
    eventId: `11111111-1111-4111-8111-${String(sequence).padStart(12, "0")}`,
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
    roundId: eventRoundId,
    schemaVersion: 2,
    sequence,
    tableId,
    type: "round.prepared",
  };
}

class MemoryStorage {
  readonly #values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}
