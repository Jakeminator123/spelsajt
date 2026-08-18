"use client";

import type { CardV2 } from "@spelsajt/contracts";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, type Group, SRGBColorSpace } from "three";

import { dampToTarget } from "./animation";

type Suit = CardV2["suit"];
export type PlayingCardFace = Pick<CardV2, "rank" | "suit">;

const SUIT_GLYPH: Record<Suit, string> = {
  spades: "\u2660",
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeFaceTexture(rank: string, suit: Suit): CanvasTexture {
  const w = 512;
  const h = 716;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new CanvasTexture(canvas);
  }

  const isRed = suit === "hearts" || suit === "diamonds";
  const ink = isRed ? "#c81d3b" : "#16171d";
  const glyph = SUIT_GLYPH[suit];

  ctx.fillStyle = "#f6f4ee";
  roundedRect(ctx, 0, 0, w, h, 46);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  roundedRect(ctx, 8, 8, w - 16, h - 16, 40);
  ctx.stroke();

  // Corner indices (top-left, then mirrored bottom-right).
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  const drawIndex = (cx: number, cy: number) => {
    ctx.font = '700 92px "Inter Tight", Inter, sans-serif';
    ctx.textBaseline = "alphabetic";
    ctx.fillText(rank, cx, cy);
    ctx.font = "72px serif";
    ctx.fillText(glyph, cx, cy + 78);
  };
  drawIndex(70, 108);
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  drawIndex(70, 108);
  ctx.restore();

  // Center pip.
  ctx.font = "300px serif";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, w / 2, h / 2 + 12);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeBackTexture(): CanvasTexture {
  const w = 512;
  const h = 716;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new CanvasTexture(canvas);
  }

  ctx.fillStyle = "#12131a";
  roundedRect(ctx, 0, 0, w, h, 46);
  ctx.fill();

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#1a1c26");
  grad.addColorStop(1, "#101119");
  ctx.fillStyle = grad;
  roundedRect(ctx, 26, 26, w - 52, h - 52, 30);
  ctx.fill();

  // Diagonal lattice in brand colors.
  ctx.save();
  roundedRect(ctx, 26, 26, w - 52, h - 52, 30);
  ctx.clip();
  ctx.lineWidth = 4;
  for (let i = -h; i < w; i += 34) {
    ctx.strokeStyle = i % 68 === 0 ? "rgba(198,242,78,0.30)" : "rgba(124,92,255,0.30)";
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(198,242,78,0.5)";
  ctx.lineWidth = 5;
  roundedRect(ctx, 40, 40, w - 80, h - 80, 24);
  ctx.stroke();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeBlankFaceTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 24;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f6f4ee";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

interface PlayingCardLayoutProps {
  position?: [number, number, number];
  reduceMotion?: boolean;
  rotationY?: number;
}

type PlayingCardProps = PlayingCardLayoutProps & (
  | { card: PlayingCardFace; faceUp: true }
  | { card?: never; faceUp: false }
);

export function PlayingCard(props: PlayingCardProps) {
  const { position = [0, 0, 0], reduceMotion = false, rotationY = 0 } = props;
  const faceUp = props.faceUp;
  const card = faceUp ? props.card : null;
  const group = useRef<Group>(null);
  const flip = useRef(faceUp ? 0 : Math.PI);
  const [initialFlip] = useState(faceUp ? 0 : Math.PI);
  const face = useMemo(
    () => card ? makeFaceTexture(card.rank, card.suit) : makeBlankFaceTexture(),
    [card],
  );
  const back = useMemo(() => makeBackTexture(), []);

  useEffect(() => () => face.dispose(), [face]);
  useEffect(() => () => back.dispose(), [back]);

  useFrame((_state, delta) => {
    if (!group.current) {
      return;
    }
    const target = faceUp ? 0 : Math.PI;
    if (flip.current === target) {
      return;
    }
    flip.current = reduceMotion ? target : dampToTarget(flip.current, target, delta * 8);
    group.current.rotation.z = flip.current;
  });

  return (
    <group ref={group} position={position} rotation={[0, rotationY, initialFlip]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.02, 1.4]} />
        <meshStandardMaterial attach="material-0" color="#efece3" roughness={0.6} />
        <meshStandardMaterial attach="material-1" color="#efece3" roughness={0.6} />
        <meshStandardMaterial attach="material-2" map={face} roughness={0.5} />
        <meshStandardMaterial attach="material-3" map={back} roughness={0.5} />
        <meshStandardMaterial attach="material-4" color="#efece3" roughness={0.6} />
        <meshStandardMaterial attach="material-5" color="#efece3" roughness={0.6} />
      </mesh>
    </group>
  );
}
