import type { GameEventV2, GameSnapshotV2 } from "@spelsajt/contracts";

import { appendRoundEvent } from "./fairness-evidence-store";

export type LiveConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "subscribing"
  | "live"
  | "reconnecting"
  | "error"
  | "closed";

export interface LiveGameState {
  readonly connection: LiveConnectionStatus;
  readonly issue: string | null;
  readonly loading: boolean;
  readonly pendingCommand: boolean;
  readonly recentEvents: readonly GameEventV2[];
  readonly roundEvents: readonly GameEventV2[];
  readonly snapshot: GameSnapshotV2 | null;
}

export type LiveGameStateAction =
  | { readonly type: "load.failed"; readonly issue: string }
  | {
    readonly type: "load.succeeded";
    readonly roundEvents?: readonly GameEventV2[];
    readonly snapshot: GameSnapshotV2 | null;
  }
  | { readonly type: "command.started" }
  | { readonly type: "command.failed"; readonly issue: string }
  | { readonly type: "command.finished"; readonly snapshot: GameSnapshotV2 }
  | { readonly type: "connection.changed"; readonly connection: LiveConnectionStatus }
  | {
    readonly type: "snapshot.received";
    readonly roundEvents?: readonly GameEventV2[];
    readonly snapshot: GameSnapshotV2;
  }
  | { readonly type: "event.received"; readonly event: GameEventV2 }
  | { readonly type: "issue.cleared" };

export const initialLiveGameState: LiveGameState = {
  connection: "idle",
  issue: null,
  loading: true,
  pendingCommand: false,
  recentEvents: [],
  roundEvents: [],
  snapshot: null,
};

export function reduceLiveGameState(
  state: LiveGameState,
  action: LiveGameStateAction,
): LiveGameState {
  switch (action.type) {
    case "load.failed":
      return { ...state, issue: action.issue, loading: false };
    case "load.succeeded":
      return {
        ...state,
        issue: null,
        loading: false,
        roundEvents: action.roundEvents ?? [],
        snapshot: action.snapshot,
      };
    case "command.started":
      return { ...state, issue: null, pendingCommand: true };
    case "command.failed":
      return { ...state, issue: action.issue, pendingCommand: false };
    case "command.finished":
      {
        const snapshot = newerSnapshot(state.snapshot, action.snapshot);
        return {
          ...state,
          issue: null,
          pendingCommand: false,
          roundEvents: roundEventsForSnapshot(state, snapshot),
          snapshot,
        };
      }
    case "connection.changed":
      return { ...state, connection: action.connection };
    case "snapshot.received":
      return {
        ...state,
        roundEvents: action.roundEvents ?? [],
        snapshot: newerSnapshot(state.snapshot, action.snapshot),
      };
    case "event.received":
      {
        return {
          ...state,
          recentEvents: [...state.recentEvents, action.event].slice(-8),
          roundEvents: appendRoundEvent(state.roundEvents, action.event),
        };
      }
    case "issue.cleared":
      return { ...state, issue: null };
  }
}

function roundEventsForSnapshot(
  state: LiveGameState,
  snapshot: GameSnapshotV2,
): readonly GameEventV2[] {
  const roundId = snapshot.round?.roundId;
  if (!roundId) return [];
  if (state.roundEvents.at(-1)?.roundId === roundId) return state.roundEvents;
  return state.snapshot?.round?.roundId === roundId ? state.roundEvents : [];
}

function newerSnapshot(
  current: GameSnapshotV2 | null,
  candidate: GameSnapshotV2,
): GameSnapshotV2 {
  if (
    current?.tableId === candidate.tableId
    && (
      candidate.lastSequence < current.lastSequence
      || candidate.revision < current.revision
    )
  ) {
    return current;
  }
  return candidate;
}

export function connectionLabel(status: LiveConnectionStatus): string {
  switch (status) {
    case "live": return "Live";
    case "reconnecting": return "Återansluter";
    case "subscribing": return "Synkar bordet";
    case "connecting":
    case "connected": return "Ansluter";
    case "error": return "Anslutningsfel";
    case "closed": return "Frånkopplad";
    case "idle": return "Förbereder";
  }
}
