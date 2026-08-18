"use client";

import { ContactShadows, Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Vector3 } from "three";

import { clamp01, easeOutCubic, lerp } from "./scene/animation";
import { Croupier } from "./scene/croupier";
import { PlayingCard } from "./scene/playing-card";
import { PHASE_LABELS, type TablePhase, useTableState } from "./scene/presentation";
import { RouletteWheel } from "./scene/roulette-wheel";
import { TableDirector, TableStateProvider } from "./scene/table-director";

const FELT_TOP = 0.1;

// Where the croupier's hands sit — cards fly out from here during dealing.
const DEALER_ORIGIN: [number, number, number] = [1.8, FELT_TOP + 0.48, -1.0];

type Suit = "spade" | "heart" | "diamond" | "club";

interface DealtCardConfig {
  rank: string;
  suit: Suit;
  target: [number, number, number];
  rotationY: number;
  faceUp: boolean;
}

// A card that flies from the dealer's hands to its spot during the semantic
// "betting" phase, then stays put for the rest of the round. Uses the shared
// table state — the same event-driven approach that will drive future rigs.
function DealtCard({ config, index, reduceMotion }: { config: DealtCardConfig; index: number; reduceMotion: boolean }) {
  const group = useRef<Group>(null);
  const tableState = useTableState();

  useFrame(() => {
    if (!group.current) {
      return;
    }
    const [tx, ty, tz] = config.target;

    if (reduceMotion) {
      group.current.position.set(tx, ty, tz);
      group.current.rotation.set(0, config.rotationY, 0);
      return;
    }

    const { phase, phaseTime } = tableState.current;
    const dealStart = 0.6 + index * 0.7;
    const dealDuration = 0.9;
    const progress = phase === "betting" ? clamp01((phaseTime - dealStart) / dealDuration) : 1;
    const eased = easeOutCubic(progress);

    group.current.position.set(
      lerp(DEALER_ORIGIN[0], tx, eased),
      lerp(DEALER_ORIGIN[1], ty, eased) + Math.sin(progress * Math.PI) * 0.4,
      lerp(DEALER_ORIGIN[2], tz, eased),
    );
    group.current.rotation.y = lerp(0, config.rotationY, eased);
  });

  return (
    <group ref={group}>
      <PlayingCard rank={config.rank} suit={config.suit} faceUp={config.faceUp} />
    </group>
  );
}

function ChipStack({ position }: { position: [number, number, number] }) {
  const colors = ["#7c5cff", "#c6f24e", "#f4f5f8", "#7c5cff", "#c6f24e"];
  return (
    <group position={position}>
      {colors.map((color, i) => (
        <mesh key={i} position={[0, i * 0.05, 0]} castShadow>
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
      {/* Table frame */}
      <RoundedBox args={[8.4, 0.5, 4.8]} radius={0.28} smoothness={4} position={[0, -0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#0d0e13" metalness={0.4} roughness={0.5} />
      </RoundedBox>
      {/* Felt surface */}
      <RoundedBox args={[7.8, 0.18, 4.2]} radius={0.16} smoothness={4} position={[0, 0.01, 0]} receiveShadow>
        <meshStandardMaterial color="#15251f" roughness={0.98} metalness={0} />
      </RoundedBox>
      {/* Thin brand accent inlay around the felt */}
      <mesh position={[0, 0.101, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.55, 3.62, 96]} />
        <meshStandardMaterial color="#7c5cff" emissive="#5a3ff0" emissiveIntensity={0.4} metalness={0.3} roughness={0.4} />
      </mesh>
    </group>
  );
}

function CameraRig({ reduceMotion }: { reduceMotion: boolean }) {
  const target = useMemo(() => new Vector3(-0.3, 0.15, -0.1), []);

  useFrame((state) => {
    const cam = state.camera;
    if (reduceMotion) {
      cam.position.set(0.2, 5.3, 6.7);
      cam.lookAt(target);
      return;
    }
    const t = state.clock.elapsedTime;
    cam.position.set(0.2 + Math.sin(t * 0.16) * 0.4, 5.3 + Math.sin(t * 0.22) * 0.14, 6.7);
    cam.lookAt(target);
  });

  return null;
}

const CARD_CONFIGS: DealtCardConfig[] = [
  { rank: "A", suit: "spade", target: [0.05, FELT_TOP + 0.24, 1.05], rotationY: 0.24, faceUp: true },
  { rank: "K", suit: "heart", target: [0.7, FELT_TOP + 0.18, 0.9], rotationY: 0.04, faceUp: true },
  { rank: "Q", suit: "club", target: [1.35, FELT_TOP + 0.12, 0.72], rotationY: -0.16, faceUp: false },
];

function Scene({
  reduceMotion,
  onPhaseChange,
}: {
  reduceMotion: boolean;
  onPhaseChange: (phase: TablePhase) => void;
}) {
  return (
    <TableStateProvider>
      <TableDirector onPhaseChange={onPhaseChange} />
      <CameraRig reduceMotion={reduceMotion} />

      <ambientLight intensity={0.5} />
      <directionalLight color="#fbf7ff" intensity={2.4} position={[-4, 7, 5]} />
      <pointLight color="#c6f24e" intensity={14} position={[3.5, 3, 2]} distance={14} />
      <pointLight color="#7c5cff" intensity={13} position={[-4.5, 2.5, 3]} distance={14} />

      <Table />
      <RouletteWheel reduceMotion={reduceMotion} position={[-2.2, FELT_TOP, 0.05]} />

      {CARD_CONFIGS.map((config, index) => (
        <DealtCard key={`${config.rank}-${config.suit}`} config={config} index={index} reduceMotion={reduceMotion} />
      ))}

      <ChipStack position={[1.95, FELT_TOP + 0.03, 0.9]} />

      <Croupier reduceMotion={reduceMotion} position={[1.8, FELT_TOP, -1.15]} />

      <ContactShadows position={[0, FELT_TOP + 0.001, 0]} opacity={0.5} scale={12} blur={2.8} far={2.2} resolution={512} color="#04060a" />

      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} position={[0, 5, -4]} scale={[8, 4, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.6} position={[5, 2, 3]} scale={[3, 4, 1]} color="#c6f24e" />
        <Lightformer form="rect" intensity={1.4} position={[-5, 2, 2]} scale={[3, 4, 1]} color="#7c5cff" />
      </Environment>
    </TableStateProvider>
  );
}

export function CasinoScene() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [phase, setPhase] = useState<TablePhase>("betting");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReduceMotion(mediaQuery.matches);
    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  return (
    <div className="scene-stage">
      <Canvas
        camera={{ fov: 32, position: [0.6, 4.5, 6.9] }}
        dpr={[1, 1.75]}
        frameloop={reduceMotion ? "demand" : "always"}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#0a0b10"]} />
        <fog attach="fog" args={["#0a0b10", 9, 18]} />
        <Scene reduceMotion={reduceMotion} onPhaseChange={setPhase} />
      </Canvas>

      {!reduceMotion ? (
        <div className="scene-phase" aria-live="polite">
          <span className="scene-phase-dot" data-phase={phase} />
          <span className="scene-phase-label">{PHASE_LABELS[phase]}</span>
        </div>
      ) : null}
    </div>
  );
}
