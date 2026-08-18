"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

import { clamp01, easeOutCubic, lerp } from "./animation";
import { PlayingCard, type PlayingCardFace } from "./playing-card";

const FELT_TOP = 0.1;
const DUMMY_DEALER_ORIGIN: [number, number, number] = [1.8, FELT_TOP + 0.48, -1];

type DummyHeroCardConfig = {
  decorativeId: `dummy-hero-card-${string}`;
  face: PlayingCardFace;
  faceUp: boolean;
  rotationY: number;
  target: [number, number, number];
};

/**
 * Fixed hero artwork only. These values are never dispatched as GameEventV2,
 * never enter presentationStore and have no cardId that could resemble game data.
 */
export const DUMMY_HERO_CARD_CONFIGS = [
  {
    decorativeId: "dummy-hero-card-ace",
    face: { rank: "A", suit: "spades" },
    faceUp: true,
    rotationY: 0.24,
    target: [0.05, FELT_TOP + 0.24, 1.05],
  },
  {
    decorativeId: "dummy-hero-card-king",
    face: { rank: "K", suit: "hearts" },
    faceUp: true,
    rotationY: 0.04,
    target: [0.7, FELT_TOP + 0.18, 0.9],
  },
  {
    decorativeId: "dummy-hero-card-queen",
    face: { rank: "Q", suit: "clubs" },
    faceUp: false,
    rotationY: -0.16,
    target: [1.35, FELT_TOP + 0.12, 0.72],
  },
] satisfies readonly DummyHeroCardConfig[];

function DummyHeroCard({ config, index }: { config: DummyHeroCardConfig; index: number }) {
  const group = useRef<Group>(null);
  const elapsed = useRef(0);

  useFrame((_state, delta) => {
    if (!group.current) {
      return;
    }

    elapsed.current += delta;
    const dealStart = 0.45 + index * 0.42;
    const progress = clamp01((elapsed.current - dealStart) / 0.9);
    const eased = easeOutCubic(progress);
    const [targetX, targetY, targetZ] = config.target;

    group.current.position.set(
      lerp(DUMMY_DEALER_ORIGIN[0], targetX, eased),
      lerp(DUMMY_DEALER_ORIGIN[1], targetY, eased) + Math.sin(progress * Math.PI) * 0.4,
      lerp(DUMMY_DEALER_ORIGIN[2], targetZ, eased),
    );
    group.current.rotation.y = lerp(0, config.rotationY, eased);
  });

  return (
    <group ref={group}>
      {config.faceUp ? (
        <PlayingCard card={config.face} faceUp reduceMotion={false} />
      ) : (
        <PlayingCard faceUp={false} reduceMotion={false} />
      )}
    </group>
  );
}

export function DummyHeroCards() {
  return (
    <group name="dummy-hero-card-decoration" userData={{ purpose: "dummy-decoration" }}>
      {DUMMY_HERO_CARD_CONFIGS.map((config, index) => (
        <DummyHeroCard config={config} index={index} key={config.decorativeId} />
      ))}
    </group>
  );
}
