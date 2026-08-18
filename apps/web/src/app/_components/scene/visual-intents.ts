import type { CroupierVisualPose } from "./croupier";
import type { PresentationCard, PresentationCueId } from "./presentation";

export type SceneAccent = "amber" | "lime" | "neutral" | "red" | "violet";
export type SceneFocus = "dealer" | "player" | "result" | "table" | "wheel";
export type ChipMotion = "collect" | "hold" | "lock" | "payout" | "place" | "return";

export interface SceneVisualIntent {
  accent: SceneAccent;
  actorLabel: "BORD" | "DEALER" | "SPELARE";
  chipMotion: ChipMotion;
  focus: SceneFocus;
  label: string;
  pose: CroupierVisualPose;
}

export const SCENE_ACCENT_COLOURS: Record<SceneAccent, string> = {
  amber: "#ffb020",
  lime: "#c6f24e",
  neutral: "#8d91a0",
  red: "#ef6172",
  violet: "#9b82ff",
};

/**
 * Reviewed, exhaustive mapping from semantic server cues to approved visuals.
 * No entry derives rules, outcomes or balances; it only selects presentation.
 */
export const sceneVisualIntents = {
  "blackjack.round-prepared": {
    accent: "neutral", actorLabel: "BORD", chipMotion: "hold", focus: "table", label: "Nytt bord", pose: "rest",
  },
  "blackjack.round-start": {
    accent: "violet", actorLabel: "BORD", chipMotion: "place", focus: "table", label: "Rundan startar", pose: "present",
  },
  "blackjack.bet-accepted": {
    accent: "lime", actorLabel: "SPELARE", chipMotion: "place", focus: "player", label: "Insats accepterad", pose: "present",
  },
  "blackjack.deal-card": {
    accent: "violet", actorLabel: "DEALER", chipMotion: "hold", focus: "dealer", label: "Kort delas", pose: "deal",
  },
  "blackjack.reveal-card": {
    accent: "amber", actorLabel: "DEALER", chipMotion: "hold", focus: "dealer", label: "Hålkort visas", pose: "reveal",
  },
  "blackjack.split-hand": {
    accent: "violet", actorLabel: "DEALER", chipMotion: "place", focus: "player", label: "Handen delas", pose: "deal",
  },
  "blackjack.turn-change": {
    accent: "lime", actorLabel: "BORD", chipMotion: "hold", focus: "player", label: "Din tur", pose: "present",
  },
  "blackjack.hand-settled": {
    accent: "amber", actorLabel: "BORD", chipMotion: "lock", focus: "result", label: "Hand avgjord", pose: "present",
  },
  "roulette.round-prepared": {
    accent: "neutral", actorLabel: "BORD", chipMotion: "hold", focus: "table", label: "Nytt bord", pose: "rest",
  },
  "roulette.round-start": {
    accent: "violet", actorLabel: "BORD", chipMotion: "lock", focus: "wheel", label: "Rundan startar", pose: "present",
  },
  "roulette.betting-opened": {
    accent: "lime", actorLabel: "BORD", chipMotion: "hold", focus: "table", label: "Insatser öppna", pose: "present",
  },
  "roulette.bet-placed": {
    accent: "lime", actorLabel: "SPELARE", chipMotion: "place", focus: "player", label: "Markör placerad", pose: "rest",
  },
  "roulette.bets-locked": {
    accent: "amber", actorLabel: "BORD", chipMotion: "lock", focus: "table", label: "Inga fler insatser", pose: "present",
  },
  "roulette.spin-started": {
    accent: "violet", actorLabel: "DEALER", chipMotion: "hold", focus: "wheel", label: "Hjulet snurrar", pose: "present",
  },
  "roulette.land-pocket": {
    accent: "lime", actorLabel: "BORD", chipMotion: "hold", focus: "wheel", label: "Kulan har landat", pose: "reveal",
  },
  "roulette.bet-settled": {
    accent: "amber", actorLabel: "DEALER", chipMotion: "lock", focus: "result", label: "Insats avgörs", pose: "present",
  },
  "blackjack.settled-win": {
    accent: "lime", actorLabel: "BORD", chipMotion: "payout", focus: "result", label: "Vinst utbetald", pose: "celebrate",
  },
  "blackjack.settled-loss": {
    accent: "red", actorLabel: "BORD", chipMotion: "collect", focus: "result", label: "Insats samlad", pose: "sympathetic",
  },
  "blackjack.settled-push": {
    accent: "neutral", actorLabel: "BORD", chipMotion: "return", focus: "result", label: "Insats återlämnad", pose: "present",
  },
  "blackjack.settled-mixed": {
    accent: "amber", actorLabel: "BORD", chipMotion: "lock", focus: "result", label: "Händer avgjorda", pose: "present",
  },
  "roulette.settled-win": {
    accent: "lime", actorLabel: "BORD", chipMotion: "payout", focus: "result", label: "Vinst utbetald", pose: "celebrate",
  },
  "roulette.settled-loss": {
    accent: "red", actorLabel: "BORD", chipMotion: "collect", focus: "result", label: "Insats samlad", pose: "sympathetic",
  },
  "roulette.settled-push": {
    accent: "neutral", actorLabel: "BORD", chipMotion: "return", focus: "result", label: "Insats återlämnad", pose: "present",
  },
  "roulette.settled-mixed": {
    accent: "amber", actorLabel: "BORD", chipMotion: "lock", focus: "result", label: "Insatser avgjorda", pose: "present",
  },
} as const satisfies Record<PresentationCueId, SceneVisualIntent>;

export const idleSceneVisualIntent: SceneVisualIntent = {
  accent: "neutral",
  actorLabel: "BORD",
  chipMotion: "hold",
  focus: "table",
  label: "Väntar på spel",
  pose: "rest",
};

export function sceneVisualIntent(cueId: PresentationCueId | null): SceneVisualIntent {
  return cueId ? sceneVisualIntents[cueId] : idleSceneVisualIntent;
}

export function cardTarget(cards: readonly PresentationCard[], index: number): {
  position: [number, number, number];
  rotationY: number;
} {
  const card = cards[index];
  const recipient = card?.recipient ?? "player";
  const recipientCards = cards.slice(0, index).filter((candidate) => candidate.recipient === recipient);

  if (recipient === "dealer") {
    const laneIndex = recipientCards.length;
    return {
      position: [0.15 + laneIndex * 0.62, 0.24, -0.35 + laneIndex * 0.08],
      rotationY: 0.12 - laneIndex * 0.08,
    };
  }

  const playerHandIds = [...new Set(
    cards.filter((candidate) => candidate.recipient === "player").map((candidate) => candidate.handId),
  )];
  const handId = card?.handId ?? playerHandIds[0] ?? "player";
  const handIndex = Math.max(0, playerHandIds.indexOf(handId));
  const cardIndex = recipientCards.filter((candidate) => candidate.handId === handId).length;
  const handCount = Math.max(1, playerHandIds.length);
  const handCentre = handCount === 1
    ? 0.05
    : -1.15 + (2.3 * handIndex) / (handCount - 1);

  return {
    position: [handCentre + cardIndex * 0.46, 0.26, 1.05 - cardIndex * 0.08],
    rotationY: (handIndex - (handCount - 1) / 2) * -0.16 + cardIndex * -0.06,
  };
}

export function chipMotionTransform(motion: ChipMotion, progress: number): {
  scale: number;
  x: number;
  z: number;
} {
  const t = Math.max(0, Math.min(1, progress));
  switch (motion) {
    case "place": return { scale: 0.72 + t * 0.28, x: (1 - t) * 0.72, z: (1 - t) * 0.9 };
    case "collect": return { scale: 1 - t, x: t * 0.35, z: -t * 1.1 };
    case "payout": return { scale: 1 + Math.sin(t * Math.PI) * 0.12, x: 0, z: t * 0.78 };
    case "return": return { scale: 1, x: 0, z: t * 0.9 };
    case "lock": return { scale: 1 + Math.sin(t * Math.PI) * 0.08, x: 0, z: 0 };
    case "hold": return { scale: 1, x: 0, z: 0 };
  }
}
