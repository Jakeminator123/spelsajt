"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  CanvasTexture,
  type Group,
  type Mesh,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

import { clamp01, easeOutCubic, TAU } from "./animation";
import { tableClock } from "./presentation";

// Official single-zero European wheel order, clockwise from 0.
const WHEEL_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const SEGMENT_COUNT = WHEEL_SEQUENCE.length;
const SEGMENT_ANGLE = TAU / SEGMENT_COUNT;

// World radius of the number ring's outer edge.
const RING_OUTER = 1.4;
const RING_INNER = 1.02;

function useWheelTexture(): CanvasTexture {
  return useMemo(() => {
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
      const value = WHEEL_SEQUENCE[i] ?? 0;
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
      const value = WHEEL_SEQUENCE[i] ?? 0;
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

function Rotor({ reduceMotion }: { reduceMotion: boolean }) {
  const rotor = useRef<Group>(null);
  const texture = useWheelTexture();

  useFrame((_state, delta) => {
    if (!reduceMotion && rotor.current) {
      rotor.current.rotation.y -= delta * 0.35;
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

function Ball({ reduceMotion }: { reduceMotion: boolean }) {
  const ball = useRef<Mesh>(null);

  useFrame((state) => {
    if (!ball.current) {
      return;
    }
    if (reduceMotion) {
      const restAngle = -Math.PI / 2 + 3.5 * SEGMENT_ANGLE;
      ball.current.position.set(Math.cos(restAngle) * 1.14, -0.02, Math.sin(restAngle) * 1.14);
      return;
    }

    // The ball only launches during the semantic "ball_in_motion" phase; it
    // rests in a pocket for every other phase. It never reports a winning
    // number — that stays authoritative on the backend.
    const { phase, phaseTime } = tableClock.state;
    const SPIN_DURATION = 3.5;
    const SETTLE_DURATION = 2;

    let radius: number;
    let y: number;
    let angularSpeed: number;

    if (phase === "ball_in_motion" && phaseTime < SPIN_DURATION) {
      // Fast orbit on the ball track.
      radius = 1.5;
      y = 0.08;
      angularSpeed = 5.4;
    } else if (phase === "ball_in_motion") {
      // Spiral inward and slow down into a pocket.
      const k = easeOutCubic(clamp01((phaseTime - SPIN_DURATION) / SETTLE_DURATION));
      radius = 1.5 - k * 0.36;
      y = 0.08 - k * 0.1;
      angularSpeed = 5.4 - k * 3.9;
    } else {
      // Resting in a pocket while the rotor drifts slowly.
      radius = 1.14;
      y = -0.02;
      angularSpeed = 1.2;
    }

    const angle = state.clock.elapsedTime * angularSpeed;
    ball.current.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
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
  position = [0, 0, 0],
}: {
  reduceMotion: boolean;
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
      {/* Polished chrome rim */}
      <mesh position={[0, 0.24, 0]}>
        <torusGeometry args={[1.9, 0.07, 20, 96]} />
        <meshStandardMaterial color="#c9cdd9" metalness={0.95} roughness={0.16} />
      </mesh>
      {/* Violet accent ring sunk into the rim to tie into the brand palette */}
      <mesh position={[0, 0.2, 0]}>
        <torusGeometry args={[1.72, 0.028, 16, 96]} />
        <meshStandardMaterial color="#7c5cff" emissive="#5a3ff0" emissiveIntensity={0.9} metalness={0.4} roughness={0.3} />
      </mesh>

      {/* Rotor + ball raised so the numbered face reads as the top surface */}
      <group position={[0, 0.2, 0]}>
        <Rotor reduceMotion={reduceMotion} />
        <Ball reduceMotion={reduceMotion} />
      </group>
    </group>
  );
}
