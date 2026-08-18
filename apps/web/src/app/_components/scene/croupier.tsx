"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";

import { lerp, type Pose, PoseMixer } from "./animation";
import { tableClock } from "./presentation";

// Named poses the croupier cross-fades between. The same channel-based pose
// approach is intended to later drive a rigged GLB dealer (idle / deal /
// reveal / celebrate) via the shared PoseMixer.
const POSES: Record<string, Pose> = {
  rest: { lift: 0, reach: 0, wrist: -0.16, curl: 0.5 },
  present: { lift: 0.07, reach: 0.14, wrist: -0.4, curl: 0.12 },
  deal: { lift: 0.03, reach: 0.22, wrist: -0.05, curl: 0.7 },
};

const SKIN = "#caa088";
const SLEEVE = "#1a1c25";
const CUFF = "#e9e8e2";

function DealerArm({ side, phaseOffset }: { side: number; phaseOffset: number }) {
  const hand = useRef<Group>(null);
  const fingers = useRef<Group>(null);
  const mixer = useMemo(() => new PoseMixer(POSES, "rest"), []);
  const baseZ = 0.12;

  useFrame((state, delta) => {
    if (!hand.current || !fingers.current) {
      return;
    }

    // Map the SEMANTIC table phase to an approved presentation pose; the
    // PoseMixer handles the cross-fade. This is the reusable director pattern
    // meant to later drive rigged croupier/player avatars.
    const phase = tableClock.state.phase;
    const target = phase === "betting" ? "deal" : phase === "no_more_bets" ? "present" : "rest";
    mixer.play(target, 0.7);

    const pose = mixer.update(delta);
    // Additive idle breathing layered on top of the base pose.
    const breath = Math.sin(state.clock.elapsedTime * 1.1 + phaseOffset) * 0.012;

    hand.current.position.y = (pose.lift ?? 0) + breath;
    hand.current.position.z = baseZ + (pose.reach ?? 0);
    hand.current.rotation.x = (pose.wrist ?? 0) + breath * 0.4;
    fingers.current.rotation.x = lerp(-0.08, 0.95, pose.curl ?? 0);
  });

  return (
    <group position={[side * 0.62, 0, 0]} rotation={[0, side * -0.18, 0]}>
      {/* Forearm sleeve lying back along the table toward the dealer's side */}
      <group rotation={[-1.32, 0, 0]}>
        <mesh position={[0, 0.68, 0]} castShadow>
          <cylinderGeometry args={[0.13, 0.18, 1.4, 24]} />
          <meshStandardMaterial color={SLEEVE} roughness={0.7} metalness={0.05} />
        </mesh>
        {/* White cuff */}
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.12, 24]} />
          <meshStandardMaterial color={CUFF} roughness={0.55} />
        </mesh>
      </group>

      {/* Hand */}
      <group ref={hand} position={[0, 0, baseZ]} rotation={[-0.16, 0, 0]}>
        <RoundedBox args={[0.34, 0.09, 0.3]} radius={0.04} smoothness={3} position={[0, 0, 0]} castShadow>
          <meshStandardMaterial color={SKIN} roughness={0.7} metalness={0.02} />
        </RoundedBox>
        {/* Fingers pivot at the front edge of the palm */}
        <group ref={fingers} position={[0, 0, 0.15]}>
          <RoundedBox args={[0.32, 0.07, 0.26]} radius={0.03} smoothness={3} position={[0, 0, 0.13]} castShadow>
            <meshStandardMaterial color={SKIN} roughness={0.7} metalness={0.02} />
          </RoundedBox>
          {/* Finger grooves */}
          {[-0.11, -0.037, 0.037, 0.11].map((x, i) => (
            <mesh key={i} position={[x, 0.04, 0.16]}>
              <boxGeometry args={[0.008, 0.02, 0.24]} />
              <meshStandardMaterial color="#a67c66" roughness={0.8} />
            </mesh>
          ))}
        </group>
        {/* Thumb */}
        <RoundedBox
          args={[0.09, 0.07, 0.2]}
          radius={0.03}
          smoothness={3}
          position={[side * 0.19, 0, 0.06]}
          rotation={[0, side * 0.5, 0]}
          castShadow
        >
          <meshStandardMaterial color={SKIN} roughness={0.7} metalness={0.02} />
        </RoundedBox>
      </group>
    </group>
  );
}

export function Croupier({
  reduceMotion,
  position = [0, 0, 0],
}: {
  reduceMotion: boolean;
  position?: [number, number, number];
}) {
  if (reduceMotion) {
    // Static, relaxed resting pose with no per-frame updates.
    return (
      <group position={position}>
        <StaticArm side={-1} />
        <StaticArm side={1} />
      </group>
    );
  }

  return (
    <group position={position}>
      <DealerArm side={-1} phaseOffset={0} />
      <DealerArm side={1} phaseOffset={2.4} />
    </group>
  );
}

function StaticArm({ side }: { side: number }) {
  return (
    <group position={[side * 0.62, 0, 0]} rotation={[0, side * -0.18, 0]}>
      <group rotation={[-1.32, 0, 0]}>
        <mesh position={[0, 0.68, 0]}>
          <cylinderGeometry args={[0.13, 0.18, 1.4, 24]} />
          <meshStandardMaterial color={SLEEVE} roughness={0.7} metalness={0.05} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.12, 24]} />
          <meshStandardMaterial color={CUFF} roughness={0.55} />
        </mesh>
      </group>
      <group position={[0, 0, 0.12]} rotation={[-0.16, 0, 0]}>
        <RoundedBox args={[0.34, 0.09, 0.3]} radius={0.04} smoothness={3}>
          <meshStandardMaterial color={SKIN} roughness={0.7} metalness={0.02} />
        </RoundedBox>
        <group position={[0, 0, 0.15]} rotation={[0.25, 0, 0]}>
          <RoundedBox args={[0.32, 0.07, 0.26]} radius={0.03} smoothness={3} position={[0, 0, 0.13]}>
            <meshStandardMaterial color={SKIN} roughness={0.7} metalness={0.02} />
          </RoundedBox>
        </group>
      </group>
    </group>
  );
}
