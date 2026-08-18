import { gameEventV2Schema, type GameEventV2 } from "@spelsajt/contracts";

export type GameEventListener = (events: readonly GameEventV2[]) => void;
export type GameEventBusReadinessListener = (ready: boolean) => void;

export interface GameEventBusPort {
  close?(): Promise<void>;
  isReady?(): boolean;
  onReadinessChange?(listener: GameEventBusReadinessListener): () => void;
  publish(events: readonly GameEventV2[]): void;
  start?(): Promise<void>;
  subscribe(tableId: string, listener: GameEventListener): () => void;
}

/** Process-local adapter used by tests and as the relay's socket-facing fan-out. */
export class GameEventBus implements GameEventBusPort {
  readonly #listeners = new Map<string, Set<GameEventListener>>();

  isReady(): boolean {
    return true;
  }

  publish(events: readonly GameEventV2[]): void {
    const byTable = new Map<string, GameEventV2[]>();
    for (const candidate of events) {
      const event = gameEventV2Schema.parse(candidate);
      const batch = byTable.get(event.tableId) ?? [];
      batch.push(event);
      byTable.set(event.tableId, batch);
    }
    for (const [tableId, batch] of byTable) {
      const listeners = this.#listeners.get(tableId);
      if (!listeners) continue;
      const ordered = batch.toSorted((left, right) => left.sequence - right.sequence);
      for (const listener of listeners) {
        try {
          listener(ordered);
        } catch {
          // One disconnected or faulty subscriber must not block other sockets.
        }
      }
    }
  }

  subscribe(tableId: string, listener: GameEventListener): () => void {
    const listeners = this.#listeners.get(tableId) ?? new Set<GameEventListener>();
    listeners.add(listener);
    this.#listeners.set(tableId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(tableId);
    };
  }
}
