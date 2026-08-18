import {
  gameEventV2Schema,
  type GameEventV2,
  type GameSnapshotV2,
} from "@spelsajt/contracts";

const MAX_ROUND_EVENTS = 256;
const STORAGE_PREFIX = "spelsajt:fairness-evidence:v1:";

interface EvidenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function appendRoundEvent(
  events: readonly GameEventV2[],
  event: GameEventV2,
): readonly GameEventV2[] {
  const sameRound = events.at(-1)?.roundId === event.roundId ? events : [];
  if (sameRound.some(({ eventId }) => eventId === event.eventId)) return sameRound;
  return [...sameRound, event].slice(-MAX_ROUND_EVENTS);
}

export function persistFairnessEvidence(
  tableId: string,
  events: readonly GameEventV2[],
  storage: EvidenceStorage | null = browserStorage(),
): void {
  if (!storage || events.length === 0) return;
  try {
    storage.setItem(storageKey(tableId), JSON.stringify(events));
  } catch {
    // Storage may be unavailable or full. Verification remains explicitly unavailable.
  }
}

export function restoreFairnessEvidence(
  snapshot: GameSnapshotV2,
  storage: EvidenceStorage | null = browserStorage(),
): readonly GameEventV2[] {
  const roundId = snapshot.round?.roundId;
  if (!storage || !roundId) return [];

  try {
    const raw = storage.getItem(storageKey(snapshot.tableId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > MAX_ROUND_EVENTS) return [];

    const events: GameEventV2[] = [];
    for (const candidate of parsed) {
      const event = gameEventV2Schema.safeParse(candidate);
      if (!event.success) return [];
      if (event.data.tableId !== snapshot.tableId || event.data.roundId !== roundId) return [];
      events.push(event.data);
    }
    return events;
  } catch {
    return [];
  }
}

export function evidenceForSnapshot(
  snapshot: GameSnapshotV2,
  current: readonly GameEventV2[],
  storage: EvidenceStorage | null = browserStorage(),
): readonly GameEventV2[] {
  const roundId = snapshot.round?.roundId;
  return roundId && current.at(-1)?.roundId === roundId
    ? current
    : restoreFairnessEvidence(snapshot, storage);
}

function browserStorage(): EvidenceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(tableId: string): string {
  return `${STORAGE_PREFIX}${tableId}`;
}
