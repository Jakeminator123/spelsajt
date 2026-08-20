"use client";

import { ContactShadows, Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Group, MeshStandardMaterial } from "three";

import { clamp01, easeOutCubic, lerp } from "./scene/animation";
import { Croupier } from "./scene/croupier";
import { DummyHeroCards } from "./scene/dummy-card-decoration";
import { PlayingCard } from "./scene/playing-card";
import { GeneratedPlayerAvatar } from "./scene/generated-player-avatar";
import {
  type PresentationCard,
  type PresentationStage,
  presentationStore,
  recordedRouletteDemo,
  usePresentationState,
} from "./scene/presentation";
import { RouletteWheel, type RouletteVisualPhase } from "./scene/roulette-wheel";
import {
  cardTarget,
  chipMotionTransform,
  SCENE_ACCENT_COLOURS,
  type SceneFocus,
  type SceneVisualIntent,
  sceneVisualIntent,
} from "./scene/visual-intents";

const FELT_TOP = 0.1;
const DEALER_ORIGIN: [number, number, number] = [1.8, FELT_TOP + 0.48, -1];
const CAMERA_POSITION: [number, number, number] = [0.2, 5.3, 6.7];
const CAMERA_TARGET: [number, number, number] = [-0.3, 0.15, -0.1];

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

export interface PlayerAvatarPresentation {
  readonly displayName: string;
  readonly modelUrl: string | null;
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

function ChipStack({
  motion,
  position,
}: {
  motion: SceneVisualIntent["chipMotion"];
  position: [number, number, number];
}) {
  const group = useRef<Group>(null);
  const elapsed = useRef(0);
  const colors = ["#7c5cff", "#c6f24e", "#f4f5f8", "#7c5cff", "#c6f24e"];

  useFrame((_state, delta) => {
    if (!group.current) return;
    elapsed.current += delta;
    const visual = chipMotionTransform(motion, easeOutCubic(clamp01(elapsed.current / 0.75)));
    group.current.position.set(position[0] + visual.x, position[1], position[2] + visual.z);
    group.current.scale.setScalar(Math.max(0.001, visual.scale));
  });

  return (
    <group position={position} ref={group}>
      {colors.map((color, index) => (
        <mesh key={`${color}-${index}`} castShadow position={[0, index * 0.05, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 0.05, 32]} />
          <meshStandardMaterial color={color} metalness={0.3} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

function Table({ accent }: { accent: string }) {
  return (
    <group>
      <RoundedBox args={[8.4, 0.5, 4.8]} position={[0, -0.15, 0]} radius={0.28} receiveShadow smoothness={4}>
        <meshStandardMaterial color="#0d0e13" metalness={0.4} roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[7.8, 0.18, 4.2]} position={[0, 0.01, 0]} radius={0.16} receiveShadow smoothness={4}>
        <meshStandardMaterial color="#15251f" metalness={0} roughness={0.98} />
      </RoundedBox>
      <mesh position={[0, 0.101, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.55, 3.62, 96]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} metalness={0.3} roughness={0.4} />
      </mesh>
    </group>
  );
}

const CUE_FOCUS_POSITIONS: Record<SceneFocus, [number, number, number]> = {
  dealer: [0.55, FELT_TOP + 0.012, -0.45],
  player: [0.35, FELT_TOP + 0.012, 1.05],
  result: [1.75, FELT_TOP + 0.012, 0.65],
  table: [0, FELT_TOP + 0.012, 0.2],
  wheel: [-2.2, FELT_TOP + 0.012, 0.05],
};

function CuePulse({ accent, focus }: { accent: string; focus: SceneFocus }) {
  const group = useRef<Group>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const elapsed = useRef(0);

  useFrame((_state, delta) => {
    if (!group.current || !material.current) return;
    elapsed.current += delta;
    const progress = easeOutCubic(clamp01(elapsed.current / 1.15));
    group.current.scale.setScalar(0.72 + progress * 0.65);
    material.current.opacity = (1 - progress) * 0.78;
  });

  return (
    <group position={CUE_FOCUS_POSITIONS[focus]} ref={group} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[0.28, 0.36, 64]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={1.2}
          opacity={0.78}
          ref={material}
          transparent
        />
      </mesh>
    </group>
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

function Scene({
  cards,
  chipPosition,
  playerAvatar,
  resultPocket,
  roulettePhase,
  rouletteTransitionKey,
  showChips,
  showDummyCards,
  showRouletteWheel,
  transitionId,
  visualIntent,
}: {
  cards: readonly PresentationCard[];
  chipPosition: [number, number, number];
  playerAvatar: PlayerAvatarPresentation | null;
  resultPocket: number | null;
  roulettePhase: RouletteVisualPhase;
  rouletteTransitionKey: string;
  showChips: boolean;
  showDummyCards: boolean;
  showRouletteWheel: boolean;
  transitionId: number;
  visualIntent: SceneVisualIntent;
}) {
  const accent = SCENE_ACCENT_COLOURS[visualIntent.accent];
  return (
    <>
      <CameraRig />
      <ambientLight intensity={0.5} />
      <directionalLight color="#fbf7ff" intensity={2.4} position={[-4, 7, 5]} />
      <pointLight color="#c6f24e" distance={14} intensity={14} position={[3.5, 3, 2]} />
      <pointLight color="#7c5cff" distance={14} intensity={13} position={[-4.5, 2.5, 3]} />
      <Table accent={accent} />
      <CuePulse accent={accent} focus={visualIntent.focus} key={`pulse-${transitionId}`} />
      {showRouletteWheel ? (
        <RouletteWheel
          position={[-2.2, FELT_TOP, 0.05]}
          reduceMotion={false}
          resultPocket={resultPocket}
          transitionKey={rouletteTransitionKey}
          visualPhase={roulettePhase}
        />
      ) : null}
      {cards.map((card, index) => (
        <DealtCard card={card} cards={cards} index={index} key={card.visualId} reduceMotion={false} />
      ))}
      {showDummyCards ? <DummyHeroCards /> : null}
      {showChips ? (
        <ChipStack
          key={`chips-${transitionId}-${visualIntent.chipMotion}`}
          motion={visualIntent.chipMotion}
          position={chipPosition}
        />
      ) : null}
      {playerAvatar ? (
        <GeneratedPlayerAvatar
          active={visualIntent.focus === "player"}
          identity={{ displayName: playerAvatar.displayName }}
          modelUrl={playerAvatar.modelUrl}
          position={showRouletteWheel
            ? [3.05, FELT_TOP - 0.01, 1.25]
            : [-2.95, FELT_TOP - 0.01, 1.2]}
          reduceMotion={false}
        />
      ) : null}
      <Croupier pose={visualIntent.pose} position={[1.8, FELT_TOP, -1.15]} reduceMotion={false} />
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

export function CasinoScene({ game, playerAvatar = null, source = "recorded-demo" }: {
  game?: "blackjack" | "roulette";
  playerAvatar?: PlayerAvatarPresentation | null;
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
  const cueId = presentation.activeCue?.cueId ?? null;
  const visualIntent = sceneVisualIntent(cueId);
  const showChips = activeGame === "blackjack"
    ? presentation.hasBlackjackWager
    : activeGame === "roulette"
      && presentation.rouletteBets.length > 0
      && (presentation.stage !== "settled" || presentation.activeCue !== null);
  const chipPosition: [number, number, number] = activeGame === "blackjack"
    ? [0.55, FELT_TOP + 0.03, 1.55]
    : [1.95, FELT_TOP + 0.03, 0.9];

  if (reduceMotion === null) {
    return <div className="scene-loading">Läser rörelseinställning...</div>;
  }

  if (reduceMotion) {
    return (
      <div className="scene-stage scene-stage-reduced" data-accent={visualIntent.accent} data-cue={cueId ?? "idle"}>
        <div aria-live="polite" className="scene-reduced" role="status">
          <span>{source === "live" ? "LIVEBORD · REDUCERAD RÖRELSE" : "INSPELAD DEMO · REDUCERAD RÖRELSE"}</span>
          <strong>{fallback}</strong>
          {result ? <small>Vinnande nummer: {result.pocket} {ROULETTE_COLOUR_LABELS[result.colour]}.</small> : null}
          {playerAvatar ? (
            <small>Spelaravatar: {playerAvatar.displayName} · {playerAvatar.modelUrl ? "privat riggad GLB" : "initialfallback"}.</small>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="scene-stage" data-accent={visualIntent.accent} data-cue={cueId ?? "idle"}>
      <Canvas
        aria-hidden="true"
        camera={{ fov: 32, position: CAMERA_POSITION }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#0a0b10"]} />
        <fog attach="fog" args={["#0a0b10", 9, 18]} />
        <Scene
          cards={presentation.cards}
          chipPosition={chipPosition}
          playerAvatar={playerAvatar}
          resultPocket={result?.pocket ?? null}
          roulettePhase={roulettePhase}
          rouletteTransitionKey={rouletteTransitionKey}
          showChips={showChips}
          showDummyCards={showDummyCards}
          showRouletteWheel={activeGame !== "blackjack"}
          transitionId={presentation.transitionId}
          visualIntent={visualIntent}
        />
      </Canvas>
      {presentation.activeCue ? (
        <div aria-live="polite" className="scene-cue" data-accent={visualIntent.accent} key={presentation.activeCue.sourceEventId}>
          <span>{visualIntent.actorLabel}</span>
          <strong>{visualIntent.label}</strong>
        </div>
      ) : null}
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
