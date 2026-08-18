import type {
  GameRepository,
  RepositoryMutation,
  StoredTable,
} from "./repository";
import { CommandIdConflictError, TableOwnershipError } from "./repository";

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Test/development adapter. Process restarts intentionally discard all state. */
export class InMemoryGameRepository implements GameRepository {
  readonly #balances = new Map<string, number>();
  readonly #locks = new Map<string, Promise<void>>();
  readonly #tables = new Map<string, { readonly table: StoredTable; readonly userId: string }>();

  async read(userId: string, tableId: string): Promise<StoredTable | null> {
    const owned = this.#tables.get(tableId);
    if (!owned) return null;
    if (owned.userId !== userId) throw new TableOwnershipError(tableId);
    return {
      ...clone(owned.table),
      balance: this.#balances.get(userId) ?? owned.table.balance,
    };
  }

  async transact<T>(
    userId: string,
    tableId: string,
    commandId: string,
    operation: (
      current: StoredTable | null,
      currentBalance: number | null,
    ) => RepositoryMutation<T>,
  ): Promise<T> {
    // A single process-local lock also makes commandId uniqueness atomic across tables.
    const lockKey = "repository";
    const previous = this.#locks.get(lockKey) ?? Promise.resolve();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.#locks.set(lockKey, tail);

    await previous;
    try {
      const owned = this.#tables.get(tableId);
      if (owned && owned.userId !== userId) throw new TableOwnershipError(tableId);
      for (const [candidateTableId, candidate] of this.#tables) {
        if (candidateTableId !== tableId && commandId in candidate.table.receipts) {
          throw new CommandIdConflictError(
            commandId,
            owned ? clone(owned.table) : null,
          );
        }
      }
      const currentBalance = this.#balances.get(userId) ?? owned?.table.balance ?? null;
      const current = owned
        ? { ...clone(owned.table), balance: currentBalance ?? owned.table.balance }
        : null;
      const mutation = operation(current, currentBalance);
      this.#balances.set(userId, mutation.next.balance);
      this.#tables.set(tableId, { table: clone(mutation.next), userId });
      return mutation.result;
    } finally {
      release();
      if (this.#locks.get(lockKey) === tail) {
        this.#locks.delete(lockKey);
      }
    }
  }
}
