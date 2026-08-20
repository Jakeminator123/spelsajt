"use client";

import { useFrame } from "@react-three/fiber";
import { Component, memo, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AnimationMixer,
  Box3,
  LoopRepeat,
  type Material,
  Mesh,
  type Object3D,
  SkinnedMesh,
  type Texture,
} from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import {
  GENERATED_PLAYER_AVATAR_MAX_BYTES,
  GENERATED_PLAYER_AVATAR_TARGET_HEIGHT,
  chooseGeneratedAvatarIdleClip,
  generatedAvatarPlacement,
  sanitizeGeneratedAvatarIdleClip,
  validatePrivateGeneratedAvatarGlb,
} from "./generated-player-avatar-utils";
import { PlayerAvatar, type PlayerAvatarIdentity } from "./player-avatar";

const DEFAULT_ROTATION_Y = 0.5;
const ZERO_POSITION: [number, number, number] = [0, 0, 0];

interface LoadedGeneratedAvatar {
  readonly animations: GLTF["animations"];
  readonly bounds: Box3;
  readonly scene: Object3D;
  readonly url: string;
}

class GeneratedAvatarBoundary extends Component<{
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  readonly onFailure: () => void;
  readonly resetKey: string;
}, { readonly failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailure();
  }

  componentDidUpdate(previous: Readonly<typeof this.props>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function materialTextures(material: Material): readonly Texture[] {
  const textures = new Set<Texture>();
  for (const value of Object.values(material)) {
    if (value && typeof value === "object" && "isTexture" in value) textures.add(value as Texture);
  }
  return [...textures];
}

function disposeGeneratedAvatar(scene: Object3D): void {
  const geometries = new Set<Mesh["geometry"]>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const imageBitmaps = new Set<{ close(): void }>();
  const skeletons = new Set<SkinnedMesh["skeleton"]>();
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
      for (const texture of materialTextures(material)) textures.add(texture);
    }
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const texture of textures) {
    const image = texture.source.data as { close?: unknown } | null | undefined;
    if (image && typeof image.close === "function") imageBitmaps.add(image as { close(): void });
    texture.dispose();
  }
  for (const image of imageBitmaps) image.close();
  for (const skeleton of skeletons) skeleton.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

async function fetchGeneratedAvatar(url: string, signal: AbortSignal): Promise<LoadedGeneratedAvatar> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Spelaravataren kunde inte hämtas.");
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > GENERATED_PLAYER_AVATAR_MAX_BYTES) {
    throw new Error("Spelaravataren är för stor.");
  }
  const buffer = await response.arrayBuffer();
  validatePrivateGeneratedAvatarGlb(buffer);
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  gltf.scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(gltf.scene, true);
  if (!generatedAvatarPlacement(bounds)) {
    disposeGeneratedAvatar(gltf.scene);
    throw new Error("Spelaravatarens geometri kan inte normaliseras.");
  }
  return { animations: gltf.animations, bounds, scene: gltf.scene, url };
}

function useGeneratedAvatarModel(url: string): LoadedGeneratedAvatar | null {
  const [loaded, setLoaded] = useState<LoadedGeneratedAvatar | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetchGeneratedAvatar(url, controller.signal)
      .then((model) => {
        if (active) setLoaded(model);
        else disposeGeneratedAvatar(model.scene);
      })
      .catch(() => {
        if (active) setLoaded(null);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [url]);
  useEffect(() => () => {
    if (loaded) disposeGeneratedAvatar(loaded.scene);
  }, [loaded]);
  return loaded?.url === url ? loaded : null;
}

const GeneratedAvatarModel = memo(function GeneratedAvatarModel({
  model,
  placement,
  position,
  reduceMotion,
  rotationY,
}: {
  readonly model: LoadedGeneratedAvatar;
  readonly placement: NonNullable<ReturnType<typeof generatedAvatarPlacement>>;
  readonly position: [number, number, number];
  readonly reduceMotion: boolean;
  readonly rotationY: number;
}) {
  const mixer = useMemo(() => new AnimationMixer(model.scene), [model.scene]);
  const idleClip = useMemo(() => {
    const selected = chooseGeneratedAvatarIdleClip(model.animations);
    return selected ? sanitizeGeneratedAvatarIdleClip(selected) : null;
  }, [model.animations]);

  useFrame((_state, delta) => {
    if (!reduceMotion && idleClip) mixer.update(Math.min(delta, 0.1));
  });

  useEffect(() => {
    if (reduceMotion || !idleClip) return;
    const action = mixer.clipAction(idleClip, model.scene);
    action.reset().setLoop(LoopRepeat, Number.POSITIVE_INFINITY).play();
    return () => {
      action.stop();
      mixer.uncacheAction(idleClip, model.scene);
    };
  }, [idleClip, mixer, model.scene, reduceMotion]);

  useEffect(() => () => {
    mixer.stopAllAction();
    mixer.uncacheRoot(model.scene);
  }, [mixer, model.scene]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group position={placement.offset} scale={placement.scale}>
        <primitive dispose={null} object={model.scene} />
      </group>
    </group>
  );
});

function GeneratedPlayerAvatarSource({
  fallback,
  modelUrl,
  onFailure,
  position,
  reduceMotion,
  rotationY,
  targetHeight,
}: {
  readonly fallback: ReactNode;
  readonly modelUrl: string;
  readonly onFailure: (url: string) => void;
  readonly position: [number, number, number];
  readonly reduceMotion: boolean;
  readonly rotationY: number;
  readonly targetHeight: number;
}) {
  const model = useGeneratedAvatarModel(modelUrl);
  const placement = useMemo(
    () => model ? generatedAvatarPlacement(model.bounds, targetHeight) : null,
    [model, targetHeight],
  );
  if (!model || !placement) return fallback;
  return (
    <GeneratedAvatarBoundary
      fallback={fallback}
      onFailure={() => onFailure(model.url)}
      resetKey={model.url}
    >
      <GeneratedAvatarModel
        model={model}
        placement={placement}
        position={position}
        reduceMotion={reduceMotion}
        rotationY={rotationY}
      />
    </GeneratedAvatarBoundary>
  );
}

export function GeneratedPlayerAvatar({
  active,
  identity,
  modelUrl,
  position,
  reduceMotion,
  rotationY = DEFAULT_ROTATION_Y,
  targetHeight = GENERATED_PLAYER_AVATAR_TARGET_HEIGHT,
}: {
  readonly active: boolean;
  readonly identity: PlayerAvatarIdentity;
  readonly modelUrl: string | null;
  readonly position: [number, number, number];
  readonly reduceMotion: boolean;
  readonly rotationY?: number;
  readonly targetHeight?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const fallback = (
    <group position={position} rotation={[0, rotationY - DEFAULT_ROTATION_Y, 0]}>
      <PlayerAvatar
        active={active}
        identity={identity}
        position={ZERO_POSITION}
        reduceMotion={reduceMotion}
      />
    </group>
  );
  if (!modelUrl || failedUrl === modelUrl) return fallback;
  return (
    <GeneratedPlayerAvatarSource
      fallback={fallback}
      modelUrl={modelUrl}
      onFailure={setFailedUrl}
      position={position}
      reduceMotion={reduceMotion}
      rotationY={rotationY}
      targetHeight={targetHeight}
    />
  );
}
