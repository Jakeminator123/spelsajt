import type { CommandAckV2, GameEventV2 } from "@spelsajt/contracts";
import type {
  BlackjackCard,
  BlackjackState,
  RouletteState,
} from "@spelsajt/game-core";

export interface StoredFairness {
  readonly commitment: string;
  readonly nonce: number;
  readonly serverSeed: string;
}

interface StoredRoundBase {
  readonly clientSeed: string | null;
  readonly fairness: StoredFairness;
  readonly roundId: string;
}

export interface StoredBlackjackRound extends StoredRoundBase {
  readonly game: "blackjack";
  readonly shoe: readonly BlackjackCard[];
  readonly state: BlackjackState;
}

export interface StoredRouletteRound extends StoredRoundBase {
  readonly game: "roulette";
  readonly state: RouletteState;
}

export type StoredRound = StoredBlackjackRound | StoredRouletteRound;

export interface StoredCommandReceipt {
  readonly ack: CommandAckV2;
  readonly fingerprint: string;
}

export interface StoredTable {
  readonly balance: number;
  readonly events: readonly GameEventV2[];
  readonly game: "blackjack" | "roulette" | null;
  readonly lastSequence: number;
  readonly nextNonce: number;
  readonly receipts: Readonly<Record<string, StoredCommandReceipt>>;
  readonly revision: number;
  readonly round: StoredRound | null;
  readonly tableId: string;
}

export interface RepositoryMutation<T> {
  readonly next: StoredTable;
  readonly result: T;
}

/**
 * The callback is the transaction boundary. A durable adapter must commit the
 * returned table, ledger effects, command receipt and events atomically.
 */
export interface GameRepository {
  read(tableId: string): Promise<StoredTable | null>;
  transact<T>(
    tableId: string,
    operation: (current: StoredTable | null) => RepositoryMutation<T>,
  ): Promise<T>;
}
