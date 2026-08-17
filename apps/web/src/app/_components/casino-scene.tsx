"use client";

import { Float } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";

function RouletteWheel({ reduceMotion }: { reduceMotion: boolean }) {
  const group = useRef<Group>(null);

  useFrame((_state, delta) => {
    if (!reduceMotion && group.current) {
      group.current.rotation.z -= delta * 0.32;
    }
  });

  return (
    <group ref={group} rotation={[Math.PI / 2, 0, 0]} position={[1.65, 0.55, -0.1]}>
      <mesh>
        <cylinderGeometry args={[1.08, 1.08, 0.18, 37]} />
        <meshStandardMaterial color="#caa55f" metalness={0.78} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.84, 0.84, 0.12, 37]} />
        <meshStandardMaterial color="#101914" metalness={0.3} roughness={0.48} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <torusGeometry args={[0.61, 0.055, 16, 74]} />
        <meshStandardMaterial color="#ab2938" metalness={0.25} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.31, 0]}>
        <sphereGeometry args={[0.11, 24, 24]} />
        <meshStandardMaterial color="#f8f0da" roughness={0.15} />
      </mesh>
    </group>
  );
}

function Card({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <Float speed={1.2} floatIntensity={0.1} rotationIntensity={0.08}>
      <group position={position} rotation={[0, rotation, 0]}>
        <mesh>
          <boxGeometry args={[0.72, 0.035, 1.05]} />
          <meshStandardMaterial color="#eee7d8" roughness={0.36} />
        </mesh>
        <mesh position={[0, 0.025, 0]}>
          <boxGeometry args={[0.56, 0.01, 0.89]} />
          <meshStandardMaterial color="#15241c" roughness={0.55} />
        </mesh>
      </group>
    </Float>
  );
}

function TableScene({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <group rotation={[0.08, -0.23, 0]} position={[0, -0.55, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[3.65, 3.75, 0.3, 64]} />
        <meshStandardMaterial color="#0d3a2a" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <torusGeometry args={[3.15, 0.1, 18, 96]} />
        <meshStandardMaterial color="#d4b272" metalness={0.7} roughness={0.3} />
      </mesh>
      <Card position={[-1.45, 0.38, 0.2]} rotation={0.1} />
      <Card position={[-0.68, 0.42, -0.05]} rotation={-0.12} />
      <RouletteWheel reduceMotion={reduceMotion} />
    </group>
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
      camera={{ fov: 36, position: [0, 4.8, 7.2] }}
      dpr={[1, 1.6]}
      frameloop={reduceMotion ? "demand" : "always"}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#08120e"]} />
      <fog attach="fog" args={["#08120e", 7, 14]} />
      <ambientLight intensity={0.8} />
      <directionalLight color="#fff4d8" intensity={3.2} position={[-3, 6, 5]} />
      <pointLight color="#40e28c" intensity={17} position={[3, 2.5, 1]} />
      <TableScene reduceMotion={reduceMotion} />
    </Canvas>
  );
}
