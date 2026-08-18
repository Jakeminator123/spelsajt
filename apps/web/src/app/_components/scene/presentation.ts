"use client";

// Semantic presentation layer for the roulette table scene.
//
// This module models a roulette round as a small, ordered state machine of
// SEMANTIC phases — the same vocabulary the backend is expected to emit as
// authoritative events (see docs/PRESENTATION_AI.md and AGENTS.md). The 3D
// scene subscribes to the current phase and maps it to APPROVED presentations
// (croupier poses, card dealing, ball spin).
//
// IMPORTANT (per AGENTS.md):
//   * This layer never decides an outcome. The ambient director below is a
//     cosmetic demo clock only; it produces no winning number and no ledger
//     effect. When the real engine is wired in, replace `advanceTableState`
//     with a subscription that sets `phase`/`phaseTime` from backend events.
//   * No Math.random is used for anything that could be read as an outcome.

import { useSyncExternalStore } from "react";

export type TablePhase = "betting" | "no_more_bets" | "ball_in_motion" | "result" | "payout";

export interface PhaseWindow {
  name: TablePhase;
  start: number;
  end: number;
}

// One full presentation round, in seconds. Ordered, non-overlapping windows.
export const ROUND_LENGTH = 15;

export const PHASE_WINDOWS: readonly PhaseWindow[] = [
  { name: "betting", start: 0, end: 5 },
  { name: "no_more_bets", start: 5, end: 6.5 },
  { name: "ball_in_motion", start: 6.5, end: 12 },
  { name: "result", start: 12, end: 13.5 },
  { name: "payout", start: 13.5, end: ROUND_LENGTH },
];

// Human-facing captions for each semantic phase (site language: Swedish).
export const PHASE_LABELS: Record<TablePhase, string> = {
  betting: "Lägg dina marker",
  no_more_bets: "Inga fler insatser",
  ball_in_motion: "Bollen rullar",
  result: "Vinnande nummer",
  payout: "Utbetalning",
};

export interface TableState {
  /** Position within the round, 0..ROUND_LENGTH. */
  roundClock: number;
  /** Current semantic phase. */
  phase: TablePhase;
  /** Seconds elapsed since the current phase began. */
  phaseTime: number;
  /** Total length of the current phase. */
  phaseDuration: number;
  /** Progress through the current phase, 0..1. */
  phaseProgress: number;
}

function windowAt(roundClock: number): PhaseWindow {
  for (const window of PHASE_WINDOWS) {
    if (roundClock >= window.start && roundClock < window.end) {
      return window;
    }
  }
  return PHASE_WINDOWS[0] as PhaseWindow;
}

/** Pure mapping from a round clock to a fully-resolved semantic table state. */
export function resolveTableState(roundClock: number): TableState {
  const clamped = ((roundClock % ROUND_LENGTH) + ROUND_LENGTH) % ROUND_LENGTH;
  const window = windowAt(clamped);
  const phaseDuration = Math.max(0.0001, window.end - window.start);
  const phaseTime = clamped - window.start;
  return {
    roundClock: clamped,
    phase: window.name,
    phaseTime,
    phaseDuration,
    phaseProgress: phaseTime / phaseDuration,
  };
}

// A single shared clock, implemented as a tiny external store.
//
// The <Canvas> mounts its own React reconciler root, so bridging state from
// inside useFrame back to the DOM via setState is unreliable. Instead we keep
// the state in a module-level store: the DOM side advances it and reads the
// phase via useSyncExternalStore, while the 3D scene components only READ
// `tableClock.state` each frame. Reading a plain object across roots is always
// safe, and phase-change notifications reach the DOM through subscribers.
//
// When the real engine is connected, replace the `advance` caller (the rAF
// loop) with a subscription that writes backend-emitted phases into the store.

type Listener = () => void;

let currentState: TableState = resolveTableState(0);
let lastEmittedPhase: TablePhase = currentState.phase;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export const tableClock = {
  /** Latest resolved table state; safe to read every frame from any root. */
  get state(): TableState {
    return currentState;
  },
  /** Advance the cosmetic demo clock by `delta` seconds. */
  advance(delta: number): void {
    currentState = resolveTableState(currentState.roundClock + Math.min(Math.max(delta, 0), 0.05));
    if (currentState.phase !== lastEmittedPhase) {
      lastEmittedPhase = currentState.phase;
      emit();
    }
  },
  /** Jump directly to a round clock position (e.g. a static reduced-motion pose). */
  set(roundClock: number): void {
    currentState = resolveTableState(roundClock);
    if (currentState.phase !== lastEmittedPhase) {
      lastEmittedPhase = currentState.phase;
      emit();
    }
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getPhaseSnapshot(): TablePhase {
    return currentState.phase;
  },
};

/** Subscribe a DOM component to the current semantic phase. */
export function useTablePhase(): TablePhase {
  return useSyncExternalStore(
    tableClock.subscribe,
    tableClock.getPhaseSnapshot,
    tableClock.getPhaseSnapshot,
  );
}
