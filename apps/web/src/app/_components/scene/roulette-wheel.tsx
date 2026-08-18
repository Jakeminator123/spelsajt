"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  type Group,
  type Mesh,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

import {
  clamp01,
  easeOutCubic,
  forwardAngleDelta,
  lerp,
  normalizeAngle,
  TAU,
} from "./animation";

// Official single-zero European wheel order, clockwise from 0.
export const EUROPEAN_WHEEL_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;
const POCKET_INDEX = new Map<number, number>(
  EUROPEAN_WHEEL_SEQUENCE.map((pocket, index) => [pocket, index]),
);
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const SEGMENT_COUNT = EUROPEAN_WHEEL_SEQUENCE.length;
const SEGMENT_ANGLE = TAU / SEGMENT_COUNT;

// World radius of the number ring's outer edge.
const RING_OUTER = 1.4;
const RING_INNER = 1.02;

export type RouletteVisualPhase = "idle" | "spinning" | "result";

export function roulettePocketAngle(pocket: number): number {
  const index = POCKET_INDEX.get(pocket);
  if (index === undefined) {
    throw new RangeError(`Unknown European roulette pocket: ${pocket}`);
  }
  return -Math.PI / 2 + (index + 0.5) * SEGMENT_ANGLE;
}

function useWheelTexture(): CanvasTexture {
  const texture = useMemo(() => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return new CanvasTexture(canvas);
    }

    const cx = size / 2;
    const cy = size / 2;
    const rOuter = size * 0.49;
    const rInner = size * 0.355;

    ctx.fillStyle = "#0b0c11";
    ctx.fillRect(0, 0, size, size);

    // Colored number segments.
    for (let i = 0; i < SEGMENT_COUNT; i += 1) {
      const value = EUROPEAN_WHEEL_SEQUENCE[i] ?? 0;
      const a0 = -Math.PI / 2 + i * SEGMENT_ANGLE;
      const a1 = a0 + SEGMENT_ANGLE;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rOuter, a0, a1);
      ctx.closePath();
      ctx.fillStyle = value === 0 ? "#1f8a54" : RED_NUMBERS.has(value) ? "#b3122b" : "#15161d";
      ctx.fill();
    }

    // Inner metallic disc that hides the wedge tips.
    const grad = ctx.createRadialGradient(cx, cy, rInner * 0.15, cx, cy, rInner);
    grad.addColorStop(0, "#262933");
    grad.addColorStop(0.7, "#181a22");
    grad.addColorStop(1, "#0f1016");
    ctx.beginPath();
    ctx.arc(cx, cy, rInner, 0, TAU);
    ctx.fillStyle = grad;
    ctx.fill();

    // Fret separators baked as thin light lines for crispness.
    ctx.strokeStyle = "rgba(214, 219, 232, 0.55)";
    ctx.lineWidth = size * 0.0035;
    for (let i = 0; i < SEGMENT_COUNT; i += 1) {
      const a = -Math.PI / 2 + i * SEGMENT_ANGLE;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rInner, cy + Math.sin(a) * rInner);
      ctx.lineTo(cx + Math.cos(a) * rOuter, cy + Math.sin(a) * rOuter);
      ctx.stroke();
    }

    // Numbers, oriented so they read from the rim inward.
    ctx.fillStyle = "#f5f6fa";
    ctx.font = `600 ${Math.floor(size * 0.042)}px "Inter Tight", Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const rText = (rInner + rOuter) / 2 + size * 0.01;
    for (let i = 0; i < SEGMENT_COUNT; i += 1) {
      const value = EUROPEAN_WHEEL_SEQUENCE[i] ?? 0;
      const a = -Math.PI / 2 + (i + 0.5) * SEGMENT_ANGLE;
      const x = cx + Math.cos(a) * rText;
      const y = cy + Math.sin(a) * rText;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(String(value), 0, 0);
      ctx.restore();
    }

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  return texture;
}

function Frets() {
  const frets = useMemo(() => {
    const midRadius = (RING_INNER + RING_OUTER) / 2;
    return Array.from({ length: SEGMENT_COUNT }, (_, i) => {
      const a = i * SEGMENT_ANGLE;
      return {
        key: i,
        position: [Math.cos(a) * midRadius, 0.05, Math.sin(a) * midRadius] as [number, number, number],
        rotationY: -a,
      };
    });
  }, []);

  return (
    <group>
      {frets.map((fret) => (
        <mesh key={fret.key} position={fret.position} rotation={[0, fret.rotationY, 0]} castShadow>
          <boxGeometry args={[RING_OUTER - RING_INNER, 0.11, 0.022]} />
          <meshStandardMaterial color="#d7dbe6" metalness={0.95} roughness={0.22} />
        </mesh>
      ))}
    </group>
  );
}

function Rotor({
  reduceMotion,
  visualPhase,
  transitionKey,
}: {
  reduceMotion: boolean;
  visualPhase: RouletteVisualPhase;
  transitionKey: string;
}) {
  const rotor = useRef<Group>(null);
  const transition = useRef(transitionKey);
  const elapsed = useRef(0);
  const startRotation = useRef(0);
  const targetRotation = useRef(0);
  const texture = useWheelTexture();

  useFrame((_state, delta) => {
    if (!rotor.current) {
      return;
    }

    if (reduceMotion) {
      rotor.current.rotation.y = 0;
      return;
    }

    if (transition.current !== transitionKey) {
      transition.current = transitionKey;
      elapsed.current = 0;
      startRotation.current = rotor.current.rotation.y;
      targetRotation.current =
        startRotation.current - normalizeAngle(startRotation.current) - TAU * 2;
    }

    if (visualPhase === "spinning") {
      rotor.current.rotation.y -= delta * 2.15;
      return;
    }

    if (visualPhase === "result") {
      elapsed.current += delta;
      const progress = easeOutCubic(clamp01(elapsed.current / 2.4));
      rotor.current.rotation.y = lerp(startRotation.current, targetRotation.current, progress);
    }
  });

  return (
    <group ref={rotor}>
      {/* Numbered ring */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <cylinderGeometry args={[RING_OUTER, RING_OUTER, 0.09, 96]} />
        <meshStandardMaterial attach="material-0" color="#0e0f15" metalness={0.5} roughness={0.5} />
        <meshStandardMaterial attach="material-1" map={texture} metalness={0.35} roughness={0.55} />
        <meshStandardMaterial attach="material-2" color="#0e0f15" metalness={0.5} roughness={0.5} />
      </mesh>

      <Frets />

      {/* Central cone / hub */}
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.16, RING_INNER, 0.5, 64]} />
        <meshStandardMaterial color="#1c1e28" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 0.14, 48]} />
        <meshStandardMaterial color="#d7dbe6" metalness={0.95} roughness={0.16} />
      </mesh>

      {/* Turret spindle */}
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.045, 0.05, 0.5, 24]} />
        <meshStandardMaterial color="#c9cdd9" metalness={0.95} roughness={0.14} />
      </mesh>
      {/* Cross handle */}
      <mesh position={[0, 0.74, 0]}>
        <boxGeometry args={[0.62, 0.045, 0.05]} />
        <meshStandardMaterial color="#c9cdd9" metalness={0.95} roughness={0.16} />
      </mesh>
      <mesh position={[0, 0.74, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[0.62, 0.045, 0.05]} />
        <meshStandardMaterial color="#c9cdd9" metalness={0.95} roughness={0.16} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshStandardMaterial color="#7c5cff" metalness={0.7} roughness={0.2} emissive="#4a30c0" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function Ball({
  reduceMotion,
  visualPhase,
  resultPocket,
  transitionKey,
}: {
  reduceMotion: boolean;
  visualPhase: RouletteVisualPhase;
  resultPocket: number | null;
  transitionKey: string;
}) {
  const ball = useRef<Mesh>(null);
  const transition = useRef(transitionKey);
  const elapsed = useRef(0);
  const angle = useRef(-Math.PI / 2);
  const radius = useRef(1.5);
  const height = useRef(0.08);
  const resultStart = useRef({ angle: -Math.PI / 2, radius: 1.5, height: 0.08 });
  const resultTargetAngle = useRef(-Math.PI / 2);

  useFrame((_state, delta) => {
    if (!ball.current) {
      return;
    }

    const winningAngle = resultPocket === null ? null : roulettePocketAngle(resultPocket);

    if (reduceMotion) {
      const staticAngle = winningAngle ?? -Math.PI / 2;
      const staticRadius = winningAngle === null ? 1.5 : 1.14;
      const staticHeight = winningAngle === null ? 0.08 : -0.02;
      ball.current.position.set(
        Math.cos(staticAngle) * staticRadius,
        staticHeight,
        Math.sin(staticAngle) * staticRadius,
      );
      return;
    }

    if (transition.current !== transitionKey) {
      transition.current = transitionKey;
      elapsed.current = 0;
      resultStart.current = {
        angle: angle.current,
        radius: radius.current,
        height: height.current,
      };
      if (winningAngle !== null) {
        resultTargetAngle.current =
          angle.current + forwardAngleDelta(angle.current, winningAngle, 2);
      }
    }

    if (visualPhase === "spinning") {
      angle.current += delta * 5.8;
      radius.current = 1.5;
      height.current = 0.08;
    } else if (visualPhase === "result" && winningAngle !== null) {
      elapsed.current += delta;
      const progress = easeOutCubic(clamp01(elapsed.current / 2.4));
      angle.current = lerp(resultStart.current.angle, resultTargetAngle.current, progress);
      radius.current = lerp(resultStart.current.radius, 1.14, progress);
      height.current = lerp(resultStart.current.height, -0.02, progress);
    } else if (winningAngle === null) {
      radius.current = 1.5;
      height.current = 0.08;
    }

    ball.current.position.set(
      Math.cos(angle.current) * radius.current,
      height.current,
      Math.sin(angle.current) * radius.current,
    );
  });

  return (
    <mesh ref={ball} castShadow>
      <sphereGeometry args={[0.06, 24, 24]} />
      <meshStandardMaterial color="#f4f5f8" metalness={0.6} roughness={0.12} />
    </mesh>
  );
}

export function RouletteWheel({
  reduceMotion,
  visualPhase = "idle",
  resultPocket = null,
  transitionKey = "initial",
  position = [0, 0, 0],
}: {
  reduceMotion: boolean;
  visualPhase?: RouletteVisualPhase;
  resultPocket?: number | null;
  transitionKey?: string;
  position?: [number, number, number];
}) {
  return (
    <group position={position}>
      {/* Static bowl base (a shallow dish that sits below the number face) */}
      <mesh position={[0, 0.0, 0]} receiveShadow>
        <cylinderGeometry args={[2.0, 2.12, 0.2, 72]} />
        <meshStandardMaterial color="#191b24" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Sloped ball track wall around the number ring */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[1.62, 1.9, 0.24, 72, 1, true]} />
        <meshStandardMaterial color="#23262f" metalness={0.85} roughness={0.3} side={2} />
      </mesh>

      {/* Rotor + ball raised so the numbered face reads as the top surface */}
      <group position={[0, 0.2, 0]}>
        <Rotor
          reduceMotion={reduceMotion}
          transitionKey={transitionKey}
          visualPhase={visualPhase}
        />
        <Ball
          reduceMotion={reduceMotion}
          resultPocket={resultPocket}
          transitionKey={transitionKey}
          visualPhase={visualPhase}
        />
      </group>
    </group>
  );
}
