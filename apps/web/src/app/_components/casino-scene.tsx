"use client";

import { ContactShadows, Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { Vector3 } from "three";

import { Croupier } from "./scene/croupier";
import { PlayingCard } from "./scene/playing-card";
import { RouletteWheel } from "./scene/roulette-wheel";

const FELT_TOP = 0.1;

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

function Scene({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <>
      <CameraRig reduceMotion={reduceMotion} />

      <ambientLight intensity={0.5} />
      <directionalLight color="#fbf7ff" intensity={2.4} position={[-4, 7, 5]} />
      <pointLight color="#c6f24e" intensity={14} position={[3.5, 3, 2]} distance={14} />
      <pointLight color="#7c5cff" intensity={13} position={[-4.5, 2.5, 3]} distance={14} />

      <Table />
      <RouletteWheel reduceMotion={reduceMotion} position={[-2.2, FELT_TOP, 0.05]} />

      <PlayingCard rank="A" suit="spade" position={[-0.3, 1.4, -0.1]} rotationY={0.12} />
      <PlayingCard rank="K" suit="heart" position={[1.2, FELT_TOP + 0.02, -0.05]} rotationY={-0.08} />
      <PlayingCard rank="Q" suit="club" position={[0.35, FELT_TOP + 0.02, 0.55]} rotationY={0.32} faceUp={false} />

      <ChipStack position={[1.95, FELT_TOP + 0.03, -0.15]} />

      <Croupier reduceMotion={reduceMotion} position={[1.8, FELT_TOP, -1.05]} />

      <ContactShadows position={[0, FELT_TOP + 0.005, 0]} opacity={0.55} scale={12} blur={2.6} far={4} resolution={512} color="#04060a" />

      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} position={[0, 5, -4]} scale={[8, 4, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.6} position={[5, 2, 3]} scale={[3, 4, 1]} color="#c6f24e" />
        <Lightformer form="rect" intensity={1.4} position={[-5, 2, 2]} scale={[3, 4, 1]} color="#7c5cff" />
      </Environment>
    </>
  );
}

export function CasinoScene() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReduceMotion(mediaQuery.matches);
    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  return (
    <Canvas
      camera={{ fov: 32, position: [0.6, 4.5, 6.9] }}
      dpr={[1, 1.75]}
      frameloop={reduceMotion ? "demand" : "always"}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#0a0b10"]} />
      <fog attach="fog" args={["#0a0b10", 9, 18]} />
      <Scene reduceMotion={reduceMotion} />
    </Canvas>
  );
}
