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

export interface StoredLedgerEntry {
  /** Signed PLAY amount. Debits are negative and credits are positive. */
  readonly amount: number;
  readonly balanceAfter: number;
  readonly entryType: string;
  readonly metadata: Readonly<Record<string, unknown>>;
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
  readonly ledgerEntries?: readonly StoredLedgerEntry[];
  readonly next: StoredTable;
  readonly result: T;
}

export class TableOwnershipError extends Error {
  constructor(readonly tableId: string) {
    super(`Table ${tableId} belongs to another user.`);
  }
}

export class CommandIdConflictError extends Error {
  constructor(
    readonly commandId: string,
    readonly current: StoredTable | null,
  ) {
    super(`Command ${commandId} was already used on another table.`);
  }
}

/**
 * The callback is the transaction boundary. A durable adapter must commit the
 * returned table, ledger effects, command receipt and events atomically.
 */
export interface GameRepository {
  close?(): Promise<void>;
  read(userId: string, tableId: string): Promise<StoredTable | null>;
  transact<T>(
    userId: string,
    tableId: string,
    commandId: string,
    operation: (
      current: StoredTable | null,
      currentBalance: number | null,
    ) => RepositoryMutation<T>,
  ): Promise<T>;
}
