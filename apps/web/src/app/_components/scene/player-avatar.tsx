"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, SRGBColorSpace, type Group } from "three";

import { dampToTarget } from "./animation";

export interface PlayerAvatarIdentity {
  readonly displayName: string;
}

export function PlayerAvatar({
  active,
  identity,
  position,
  reduceMotion,
}: {
  readonly active: boolean;
  readonly identity: PlayerAvatarIdentity;
  readonly position: [number, number, number];
  readonly reduceMotion: boolean;
}) {
  const upperBody = useRef<Group>(null);
  const activeAmount = useRef(0);
  const texture = useMemo(() => createInitialTexture(identity.displayName), [identity.displayName]);
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ clock }, delta) => {
    if (!upperBody.current) return;
    activeAmount.current = dampToTarget(activeAmount.current, active ? 1 : 0, delta * 7, 0.001);
    const idle = reduceMotion ? 0 : Math.sin(clock.elapsedTime * 1.45) * 0.018;
    const response = reduceMotion ? 0 : Math.sin(Math.min(1, activeAmount.current) * Math.PI) * 0.06;
    upperBody.current.position.y = idle + response;
    upperBody.current.rotation.z = reduceMotion ? 0 : Math.sin(clock.elapsedTime * 1.1) * 0.012 + activeAmount.current * -0.035;
  });

  return (
    <group position={position} rotation={[0, 0.5, 0]}>
      <mesh castShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.46, 0.52, 0.22, 40]} />
        <meshStandardMaterial color="#12141b" metalness={0.58} roughness={0.34} />
      </mesh>
      <group ref={upperBody}>
        <mesh castShadow position={[0, 0.57, 0]}>
          <capsuleGeometry args={[0.31, 0.46, 8, 24]} />
          <meshStandardMaterial color="#6f56dc" metalness={0.16} roughness={0.72} />
        </mesh>
        <mesh castShadow position={[0, 1.05, 0]}>
          <sphereGeometry args={[0.34, 40, 24]} />
          <meshStandardMaterial color="#171923" metalness={0.08} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.05, 0.35]}>
          <circleGeometry args={[0.285, 48]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        <mesh position={[0, 1.05, 0.345]}>
          <ringGeometry args={[0.29, 0.325, 48]} />
          <meshStandardMaterial
            color={active ? "#c6f24e" : "#9b82ff"}
            emissive={active ? "#c6f24e" : "#7c5cff"}
            emissiveIntensity={active ? 0.85 : 0.38}
            metalness={0.32}
            roughness={0.38}
          />
        </mesh>
      </group>
    </group>
  );
}

function createInitialTexture(displayName: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#c6f24e");
    gradient.addColorStop(1, "#7c5cff");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#0b0c10";
    context.font = "800 132px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(Array.from(displayName.trim())[0]?.toUpperCase() ?? "S", 128, 136);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
