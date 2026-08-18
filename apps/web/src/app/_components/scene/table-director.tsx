"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { ReactNode } from "react";

import {
  advanceTableState,
  resolveTableState,
  type TablePhase,
  TableStateContext,
  type TableStateRef,
  useTableState,
} from "./presentation";

/**
 * Provides the shared, mutable table state to the scene subtree. The state is
 * held in a ref so components can read it every frame without re-rendering.
 */
export function TableStateProvider({
  children,
  initialClock = 0,
}: {
  children: ReactNode;
  initialClock?: number;
}) {
  const ref = useRef(resolveTableState(initialClock)) as TableStateRef;
  return <TableStateContext.Provider value={ref}>{children}</TableStateContext.Provider>;
}

/**
 * Ambient demo director: advances the semantic phase clock each frame and
 * reports phase changes to the caller (for the on-screen caption).
 *
 * When the real engine is connected, this component is replaced by a
 * subscription that writes backend-emitted phases into the same ref — the rest
 * of the scene is unaffected.
 */
export function TableDirector({ onPhaseChange }: { onPhaseChange?: (phase: TablePhase) => void }) {
  const stateRef = useTableState();
  const lastPhase = useRef<TablePhase | null>(null);

  const frames = useRef(0);

  useFrame((_, delta) => {
    // Clamp delta so a backgrounded tab does not fast-forward the timeline.
    advanceTableState(stateRef.current, Math.min(delta, 0.05));

    frames.current += 1;
    if (frames.current % 60 === 0) {
      console.log("[v0] director", stateRef.current.roundClock.toFixed(2), stateRef.current.phase);
    }

    const phase = stateRef.current.phase;
    if (phase !== lastPhase.current) {
      lastPhase.current = phase;
      onPhaseChange?.(phase);
    }
  });

  return null;
}
