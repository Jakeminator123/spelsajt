"use client";

import { ContactShadows, Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Group } from "three";

import { clamp01, easeOutCubic, lerp } from "./scene/animation";
import { Croupier, type CroupierVisualPose } from "./scene/croupier";
import { DummyHeroCards } from "./scene/dummy-card-decoration";
import { PlayingCard } from "./scene/playing-card";
import {
  type PresentationCard,
  type PresentationCueId,
  type PresentationStage,
  presentationStore,
  recordedRouletteDemo,
  usePresentationState,
} from "./scene/presentation";
import { RouletteWheel, type RouletteVisualPhase } from "./scene/roulette-wheel";

const FELT_TOP = 0.1;
const DEALER_ORIGIN: [number, number, number] = [1.8, FELT_TOP + 0.48, -1];
const CAMERA_POSITION: [number, number, number] = [0.1, 8.6, 12.2];
const CAMERA_TARGET: [number, number, number] = [-0.2, -0.1, 0];
const DEALER_ZONE_Z = -0.7;
const PLAYER_ZONE_Z = 1.05;

const STAGE_LABELS: Record<PresentationStage, string> = {
  idle: "Väntar på V2-event",
  prepared: "Rundan är förberedd",
  active: "Rundan är aktiv",
  "roulette-betting": "Insatserna är öppna",
  "roulette-locked": "Inga fler insatser",
  "roulette-spinning": "Bollen rullar",
  "roulette-result": "Resultatet visas",
  settling: "Insatserna avgörs",
  settled: "Rundan är klar",
};

const ROULETTE_COLOUR_LABELS = {
  black: "svart",
  green: "grön",
  red: "röd",
} as const;

function cardTarget(cards: readonly PresentationCard[], index: number): {
  position: [number, number, number];
  rotationY: number;
} {
  const card = cards[index];
  const recipient = card?.recipient ?? "player";
  const laneIndex = cards
    .slice(0, index)
    .filter((candidate) => (candidate.recipient ?? "player") === recipient).length;
  const total = Math.max(
    cards.filter((candidate) => (candidate.recipient ?? "player") === recipient).length,
    1,
  );
  // Lay each hand out as a centered, slightly overlapping horizontal row so the
  // table reads like a real blackjack layout instead of a fanned spread.
  const spacing = 0.7;
  const offsetX = (laneIndex - (total - 1) / 2) * spacing;
  const lift = laneIndex * 0.012;
  const z = recipient === "dealer" ? DEALER_ZONE_Z : PLAYER_ZONE_Z;
  return {
    position: [offsetX, FELT_TOP + 0.14 + lift, z],
    rotationY: 0,
  };
}

function DealtCard({
  card,
  cards,
  index,
  reduceMotion,
}: {
  card: PresentationCard;
  cards: readonly PresentationCard[];
  index: number;
  reduceMotion: boolean;
}) {
  const group = useRef<Group>(null);
  const elapsed = useRef(0);
  const target = cardTarget(cards, index);

  useFrame((_state, delta) => {
    if (!group.current) {
      return;
    }
    elapsed.current += delta;
    const progress = reduceMotion ? 1 : easeOutCubic(clamp01(elapsed.current / 0.85));
    const [tx, ty, tz] = target.position;
    group.current.position.set(
      lerp(DEALER_ORIGIN[0], tx, progress),
      lerp(DEALER_ORIGIN[1], ty, progress) + Math.sin(progress * Math.PI) * 0.4,
      lerp(DEALER_ORIGIN[2], tz, progress),
    );
    group.current.rotation.y = lerp(0, target.rotationY, progress);
  });

  return (
    <group ref={group}>
      {card.faceUp ? (
        <PlayingCard card={card.card} faceUp reduceMotion={reduceMotion} />
      ) : (
        <PlayingCard faceUp={false} reduceMotion={reduceMotion} />
      )}
    </group>
  );
}

function ChipStack({ position }: { position: [number, number, number] }) {
  const colors = ["#7c5cff", "#c6f24e", "#f4f5f8", "#7c5cff", "#c6f24e"];
  return (
    <group position={position}>
      {colors.map((color, index) => (
        <mesh key={`${color}-${index}`} castShadow position={[0, index * 0.05, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 0.05, 32]} />
          <meshStandardMaterial color={color} metalness={0.3} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

function Table() {
  return (
    <group>
      <RoundedBox args={[8.4, 0.5, 4.8]} position={[0, -0.15, 0]} radius={0.28} receiveShadow smoothness={4}>
        <meshStandardMaterial color="#0d0e13" metalness={0.4} roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[7.8, 0.18, 4.2]} position={[0, 0.01, 0]} radius={0.16} receiveShadow smoothness={4}>
        <meshStandardMaterial color="#15251f" metalness={0} roughness={0.98} />
      </RoundedBox>
    </group>
  );
}

// A flat outlined rectangle painted onto the felt marking where a hand is dealt.
function HandZone({ position }: { position: [number, number, number] }) {
  const width = 2.5;
  const depth = 1.4;
  const border = 0.05;
  return (
    <group position={position}>
      {/* Accent frame */}
      <RoundedBox args={[width, 0.008, depth]} position={[0, 0.006, 0]} radius={0.08} smoothness={4}>
        <meshStandardMaterial color="#7c5cff" emissive="#5a3ff0" emissiveIntensity={0.35} metalness={0.2} roughness={0.5} />
      </RoundedBox>
      {/* Felt-colored interior sits above the frame so only the rim shows */}
      <RoundedBox args={[width - border * 2, 0.008, depth - border * 2]} position={[0, 0.02, 0]} radius={0.06} smoothness={4}>
        <meshStandardMaterial color="#18291f" metalness={0} roughness={0.98} />
      </RoundedBox>
    </group>
  );
}

function HandZones() {
  return (
    <>
      <HandZone position={[0, FELT_TOP, DEALER_ZONE_Z]} />
      <HandZone position={[0, FELT_TOP, PLAYER_ZONE_Z]} />
    </>
  );
}

function CameraRig() {
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    camera.position.set(...CAMERA_POSITION);
    camera.lookAt(...CAMERA_TARGET);
    camera.updateMatrixWorld();
  }, [camera]);

  return null;
}

function croupierPose(cueId: PresentationCueId | null): CroupierVisualPose {
  switch (cueId) {
    case "blackjack.deal-card": return "deal";
    case "blackjack.reveal-card": return "reveal";
    case "roulette.bets-locked":
    case "roulette.spin-started":
    case "roulette.bet-settled": return "present";
    case "blackjack.settled-win":
    case "roulette.settled-win": return "celebrate";
    case "blackjack.settled-loss":
    case "roulette.settled-loss": return "sympathetic";
    default: return "rest";
  }
}

function Scene({
  cards,
  croupierVisualPose,
  resultPocket,
  roulettePhase,
  rouletteTransitionKey,
  showChips,
  showDummyCards,
  showRouletteWheel,
}: {
  cards: readonly PresentationCard[];
  croupierVisualPose: CroupierVisualPose;
  resultPocket: number | null;
  roulettePhase: RouletteVisualPhase;
  rouletteTransitionKey: string;
  showChips: boolean;
  showDummyCards: boolean;
  showRouletteWheel: boolean;
}) {
  return (
    <>
      <CameraRig />
      <ambientLight intensity={0.5} />
      <directionalLight color="#fbf7ff" intensity={2.4} position={[-4, 7, 5]} />
      <pointLight color="#c6f24e" distance={14} intensity={14} position={[3.5, 3, 2]} />
      <pointLight color="#7c5cff" distance={14} intensity={13} position={[-4.5, 2.5, 3]} />
      <Table />
      {showRouletteWheel ? (
        <RouletteWheel
          position={[-2.2, FELT_TOP, 0.05]}
          reduceMotion={false}
          resultPocket={resultPocket}
          transitionKey={rouletteTransitionKey}
          visualPhase={roulettePhase}
        />
      ) : (
        <HandZones />
      )}
      {cards.map((card, index) => (
        <DealtCard card={card} cards={cards} index={index} key={card.visualId} reduceMotion={false} />
      ))}
      {showDummyCards ? <DummyHeroCards /> : null}
      {showChips ? <ChipStack position={[1.95, FELT_TOP + 0.03, 0.9]} /> : null}
      <Croupier pose={croupierVisualPose} position={[1.8, FELT_TOP, -1.15]} reduceMotion={false} />
      <ContactShadows blur={2.8} color="#04060a" far={2.2} opacity={0.5} position={[0, FELT_TOP + 0.001, 0]} resolution={512} scale={12} />
      <Environment resolution={256}>
        <Lightformer color="#ffffff" form="rect" intensity={2} position={[0, 5, -4]} scale={[8, 4, 1]} />
        <Lightformer color="#c6f24e" form="rect" intensity={1.6} position={[5, 2, 3]} scale={[3, 4, 1]} />
        <Lightformer color="#7c5cff" form="rect" intensity={1.4} position={[-5, 2, 2]} scale={[3, 4, 1]} />
      </Environment>
    </>
  );
}

function demoDelay(eventType: string): number {
  if (eventType === "roulette.spin.started") return 3600;
  if (eventType === "roulette.result") return 2600;
  if (eventType === "round.settled") return 3200;
  return 1200;
}

function stageDataPhase(stage: PresentationStage): string {
  if (stage === "roulette-spinning") return "ball_in_motion";
  if (stage === "roulette-locked") return "no_more_bets";
  return stage;
}

export function CasinoScene({ game, source = "recorded-demo" }: {
  game?: "blackjack" | "roulette";
  source?: "live" | "recorded-demo";
}) {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const presentation = usePresentationState();

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReduceMotion(mediaQuery.matches);
    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (reduceMotion === null) {
      return;
    }
    if (source === "live") {
      return;
    }
    presentationStore.reset();
    if (reduceMotion) {
      for (const event of recordedRouletteDemo.events) {
        presentationStore.dispatch(event);
      }
      return;
    }

    let cancelled = false;
    let eventIndex = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const playNext = () => {
      if (cancelled) return;
      const event = recordedRouletteDemo.events[eventIndex];
      if (!event) {
        presentationStore.reset();
        eventIndex = 0;
        timer = setTimeout(playNext, 900);
        return;
      }
      presentationStore.dispatch(event);
      eventIndex += 1;
      timer = setTimeout(playNext, demoDelay(event.type));
    };
    playNext();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reduceMotion, source]);

  const result = presentation.rouletteResult;
  const roulettePhase: RouletteVisualPhase = result
    ? "result"
    : presentation.stage === "roulette-spinning" ? "spinning" : "idle";
  const rouletteTransitionKey = result
    ? `result-${presentation.roundId}-${result.pocket}`
    : roulettePhase === "spinning"
      ? `spin-${presentation.roundId}-${presentation.transitionId}`
      : `idle-${presentation.roundId ?? "none"}`;
  const status = result
    ? `${STAGE_LABELS[presentation.stage]} · ${result.pocket} ${ROULETTE_COLOUR_LABELS[result.colour]}`
    : STAGE_LABELS[presentation.stage];
  const fallback = presentation.activeCue?.reducedMotionText ?? status;
  const showDummyCards = source === "recorded-demo" && presentation.cards.length === 0;
  const activeGame = presentation.game ?? game ?? null;

  if (reduceMotion === null) {
    return <div className="scene-loading">Läser rörelseinställning...</div>;
  }

  if (reduceMotion) {
    return (
      <div className="scene-stage">
        <div aria-live="polite" className="scene-loading" role="status">
          {source === "live" ? "Livebord" : "Inspelad demo"} · {fallback}{result ? ` Vinnande nummer: ${result.pocket}.` : ""}
        </div>
      </div>
    );
  }

  return (
    <div className="scene-stage">
      <Canvas
        aria-hidden="true"
        camera={{ fov: 44, position: CAMERA_POSITION }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#0a0b10"]} />
        <fog attach="fog" args={["#0a0b10", 9, 18]} />
        <Scene
          cards={presentation.cards}
          croupierVisualPose={croupierPose(presentation.activeCue?.cueId ?? null)}
          resultPocket={result?.pocket ?? null}
          roulettePhase={roulettePhase}
          rouletteTransitionKey={rouletteTransitionKey}
          showChips={activeGame === "roulette" && presentation.rouletteBets.length > 0}
          showDummyCards={showDummyCards}
          showRouletteWheel={activeGame !== "blackjack"}
        />
      </Canvas>
      {showDummyCards ? (
        <div className="scene-dummy-label" role="note">
          <span>DUMMYKORT</span>
          <strong>Frikopplad dekoration · ej speldata</strong>
        </div>
      ) : null}
      <div className="scene-phase">
        <span className="scene-phase-dot" data-phase={stageDataPhase(presentation.stage)} />
        <span className="scene-phase-label">{status}</span>
      </div>
    </div>
  );
}
