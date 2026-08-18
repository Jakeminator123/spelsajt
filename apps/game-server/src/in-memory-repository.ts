import type {
  GameRepository,
  RepositoryMutation,
  StoredTable,
} from "./repository";

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Test/development adapter. Process restarts intentionally discard all state. */
export class InMemoryGameRepository implements GameRepository {
  readonly #locks = new Map<string, Promise<void>>();
  readonly #tables = new Map<string, StoredTable>();

  async read(tableId: string): Promise<StoredTable | null> {
    const table = this.#tables.get(tableId);
    return table ? clone(table) : null;
  }

  async transact<T>(
    tableId: string,
    operation: (current: StoredTable | null) => RepositoryMutation<T>,
  ): Promise<T> {
    const previous = this.#locks.get(tableId) ?? Promise.resolve();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.#locks.set(tableId, tail);

    await previous;
    try {
      const current = this.#tables.get(tableId);
      const mutation = operation(current ? clone(current) : null);
      this.#tables.set(tableId, clone(mutation.next));
      return mutation.result;
    } finally {
      release();
      if (this.#locks.get(tableId) === tail) {
        this.#locks.delete(tableId);
      }
    }
  }
}
