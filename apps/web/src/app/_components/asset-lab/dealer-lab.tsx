"use client";

import { Environment, Grid, Lightformer, OrbitControls, useAnimations } from "@react-three/drei";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import {
  Component,
  type ChangeEvent,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AnimationClip,
  Box3,
  type Material,
  Mesh,
  Object3D,
  SkeletonHelper,
  SkinnedMesh,
  Texture,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

import { RouletteWheel } from "../scene/roulette-wheel";
import { sceneVisualIntents } from "../scene/visual-intents";
import {
  formatBytes,
  friendlyAnimationName,
  isTransientModelUrl,
  resolveDealerLabPoseMappings,
  runtimeAnimationName,
} from "./dealer-lab-utils";
import type { LabAsset } from "./lab-assets";
import styles from "./dealer-lab.module.css";

type CameraPreset = "full-body" | "gameplay" | "hands";
type RoomMode = "blackjack" | "neutral" | "roulette";

interface AnimationSummary {
  duration: number;
  name: string;
  rootMotionCandidate: boolean;
}

function animationClipWithRuntimeName(
  clip: AnimationClip,
  runtimeName: string,
): AnimationClip {
  if (runtimeName === clip.name) {
    return clip;
  }

  return new AnimationClip(
    runtimeName,
    clip.duration,
    clip.tracks.map((track) => track.clone()),
    clip.blendMode,
  );
}

interface ModelStats {
  animations: readonly AnimationSummary[];
  dimensions: { depth: number; height: number; width: number };
  eyeBones: number;
  fingerBones: number;
  joints: number;
  materials: number;
  meshes: number;
  morphTargets: number;
  rigHeight: number;
  skinnedMeshes: number;
  triangles: number;
}

interface ModelErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface ModelErrorBoundaryState {
  error: Error | null;
}

const CAMERA_PRESETS: Record<CameraPreset, {
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}> = {
  "full-body": {
    label: "Helkropp",
    position: [3.2, 2.25, 4.8],
    target: [0, 0.95, -0.35],
  },
  gameplay: {
    label: "Spelarvy",
    position: [0, 2.15, 3.8],
    target: [0, 1.16, -0.1],
  },
  hands: {
    label: "Händer och bord",
    position: [0, 1.72, 2.55],
    target: [0, 1.02, -0.05],
  },
};

const DEFAULT_TARGET_HEIGHT = 1.72;
const NO_EXTRA_ANIMATIONS: readonly string[] = [];
const TABLE_HEIGHT = 0.9;

class ModelErrorBoundary extends Component<ModelErrorBoundaryProps, ModelErrorBoundaryState> {
  state: ModelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ModelErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("3D-labbet kunde inte läsa GLB-filen.", error, info);
  }

  componentDidUpdate(previousProps: ModelErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className={styles.canvasMessage} role="alert">
          <strong>Modellen kunde inte öppnas</strong>
          <span>Kontrollera att filen är en giltig, binär GLB och välj den igen.</span>
        </div>
      );
    }

    return this.props.children;
  }
}

function trackHasTranslation(clip: AnimationClip): boolean {
  return clip.tracks.some((track) => {
    if (!track.name.endsWith(".position") || !/(root|hips|pelvis|armature)/i.test(track.name)) {
      return false;
    }
    if (track.values.length < 6) {
      return false;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < track.values.length; index += 3) {
      const x = track.values[index] ?? 0;
      const y = track.values[index + 1] ?? 0;
      const z = track.values[index + 2] ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    const horizontalTravel = Math.hypot(maxX - minX, maxZ - minZ);
    const verticalTravel = maxY - minY;
    return /(root|armature)/i.test(track.name)
      ? horizontalTravel > 0.01 || verticalTravel > 0.03
      : horizontalTravel > 0.15;
  });
}

function rigBounds(scene: Object3D): Box3 {
  const bounds = new Box3();
  const point = new Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (object.type === "Bone") {
      bounds.expandByPoint(object.getWorldPosition(point));
    }
  });
  return bounds;
}

function placementBounds(scene: Object3D): Box3 {
  const meshBounds = new Box3().setFromObject(scene);
  const skeletonBounds = rigBounds(scene);
  if (skeletonBounds.isEmpty()) {
    return meshBounds;
  }

  const meshHeight = meshBounds.getSize(new Vector3()).y;
  const skeletonHeight = skeletonBounds.getSize(new Vector3()).y;
  return skeletonHeight > meshHeight * 2 ? skeletonBounds : meshBounds;
}

function inspectModel(scene: Object3D, animations: readonly AnimationClip[]): ModelStats {
  const bounds = new Box3().setFromObject(scene);
  const size = bounds.getSize(new Vector3());
  const materials = new Set<Material>();
  const joints = new Set<Object3D>();
  let meshes = 0;
  let morphTargets = 0;
  let skinnedMeshes = 0;
  let triangles = 0;

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    meshes += 1;
    const position = object.geometry.getAttribute("position");
    triangles += object.geometry.index
      ? object.geometry.index.count / 3
      : (position?.count ?? 0) / 3;
    morphTargets = Math.max(
      morphTargets,
      Object.keys(object.morphTargetDictionary ?? {}).length,
    );
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
    }
    if (object instanceof SkinnedMesh) {
      skinnedMeshes += 1;
      for (const bone of object.skeleton.bones) {
        joints.add(bone);
      }
    }
  });

  const skeletonBounds = rigBounds(scene);
  const jointNames = Array.from(joints, (joint) => joint.name);

  return {
    animations: animations.map((clip) => ({
      duration: clip.duration,
      name: clip.name,
      rootMotionCandidate: trackHasTranslation(clip),
    })),
    dimensions: {
      depth: size.z,
      height: size.y,
      width: size.x,
    },
    eyeBones: jointNames.filter((name) => /eye/i.test(name)).length,
    fingerBones: jointNames.filter((name) => /(finger|index|middle|pinky|ring|thumb)/i.test(name)).length,
    joints: joints.size,
    materials: materials.size,
    meshes,
    morphTargets,
    rigHeight: skeletonBounds.isEmpty() ? 0 : skeletonBounds.getSize(new Vector3()).y,
    skinnedMeshes,
    triangles: Math.round(triangles),
  };
}

function disposeTransientModelResources(scene: Object3D): void {
  const materials = new Set<Material>();
  const skeletons = new Set<SkinnedMesh["skeleton"]>();
  const textures = new Set<Texture>();

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    object.geometry.dispose();
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
    }
    if (object instanceof SkinnedMesh) {
      skeletons.add(object.skeleton);
    }
  });

  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) {
        textures.add(value);
      }
    }
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
  }
  for (const skeleton of skeletons) {
    skeleton.dispose();
  }
}

function CameraRig({ preset }: { preset: CameraPreset }) {
  const camera = useThree((state) => state.camera);
  const definition = CAMERA_PRESETS[preset];

  useEffect(() => {
    camera.position.set(...definition.position);
    camera.lookAt(...definition.target);
    camera.updateMatrixWorld();
  }, [camera, definition]);

  return (
    <OrbitControls
      key={preset}
      makeDefault
      maxDistance={8}
      maxPolarAngle={Math.PI / 2 - 0.02}
      minDistance={1.4}
      target={definition.target}
    />
  );
}

function ReferenceTable({ roomMode }: { roomMode: Exclude<RoomMode, "neutral"> }) {
  const felt = roomMode === "blackjack" ? "#15382c" : "#211d3d";

  return (
    <group position={[0, 0, 0.18]}>
      <mesh castShadow position={[0, TABLE_HEIGHT - 0.06, 0]} receiveShadow>
        <boxGeometry args={[2.45, 0.12, 1.25]} />
        <meshStandardMaterial color="#171922" metalness={0.35} roughness={0.54} />
      </mesh>
      <mesh position={[0, TABLE_HEIGHT + 0.006, 0]} receiveShadow>
        <boxGeometry args={[2.28, 0.018, 1.08]} />
        <meshStandardMaterial color={felt} metalness={0.02} roughness={0.94} />
      </mesh>
      {[-0.95, 0.95].map((x) => (
        <mesh castShadow key={x} position={[x, 0.43, 0]}>
          <boxGeometry args={[0.1, 0.86, 0.72]} />
          <meshStandardMaterial color="#11131a" metalness={0.45} roughness={0.48} />
        </mesh>
      ))}
      {roomMode === "blackjack" ? (
        <group position={[0, TABLE_HEIGHT + 0.02, 0.13]}>
          {[-0.62, 0, 0.62].map((x) => (
            <mesh key={x} position={[x, 0, 0.26]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.14, 0.15, 40]} />
              <meshBasicMaterial color="#c6f24e" transparent opacity={0.58} />
            </mesh>
          ))}
        </group>
      ) : (
        <group position={[-0.58, TABLE_HEIGHT + 0.03, 0]} scale={0.32}>
          <RouletteWheel reduceMotion visualPhase="idle" />
        </group>
      )}
    </group>
  );
}

function DealerModel({
  animationName,
  animationUrls = NO_EXTRA_ANIMATIONS,
  normalizeScale,
  onReady,
  playing,
  playbackRate,
  rotationY,
  showSkeleton,
  targetHeightM,
  url,
}: {
  animationName: string | null;
  animationUrls?: readonly string[];
  normalizeScale: boolean;
  onReady: (stats: ModelStats) => void;
  playing: boolean;
  playbackRate: number;
  rotationY: number;
  showSkeleton: boolean;
  targetHeightM: number;
  url: string;
}) {
  const modelUrls = useMemo(() => [url, ...animationUrls], [animationUrls, url]);
  const loadedModels = useLoader(GLTFLoader, modelUrls);
  const gltf = loadedModels[0];
  if (!gltf) {
    throw new Error("Basmodellen saknas efter GLB-inläsning.");
  }
  const scene = useMemo(() => cloneSkeleton(gltf.scene), [gltf.scene]);
  const animations = useMemo(() => {
    const uniqueAnimations = new Map<string, AnimationClip>();
    for (const loadedModel of loadedModels) {
      for (const clip of loadedModel.animations) {
        const clipName = runtimeAnimationName(clip.name);
        if (!uniqueAnimations.has(clipName)) {
          uniqueAnimations.set(
            clipName,
            animationClipWithRuntimeName(clip, clipName),
          );
        }
      }
    }
    return Array.from(uniqueAnimations.values());
  }, [loadedModels]);
  const stats = useMemo(() => inspectModel(scene, animations), [animations, scene]);
  const bounds = useMemo(() => placementBounds(scene), [scene]);
  const center = useMemo(() => bounds.getCenter(new Vector3()), [bounds]);
  const sourceHeight = bounds.getSize(new Vector3()).y;
  const scale = normalizeScale && sourceHeight > 0
    ? targetHeightM / sourceHeight
    : 1;
  const skeleton = useMemo(() => new SkeletonHelper(scene), [scene]);
  const { actions } = useAnimations(animations, scene);
  const transientCleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (transientCleanupTimer.current !== null) {
      clearTimeout(transientCleanupTimer.current);
      transientCleanupTimer.current = null;
    }
    if (!isTransientModelUrl(url)) {
      return;
    }

    return () => {
      // Delay disposal by one task so React Strict Mode can remount and cancel
      // its development-only effect cleanup without invalidating the live scene.
      transientCleanupTimer.current = setTimeout(() => {
        useLoader.clear(GLTFLoader, modelUrls);
        disposeTransientModelResources(scene);
        transientCleanupTimer.current = null;
      }, 0);
    };
  }, [modelUrls, scene, url]);

  useEffect(() => {
    onReady(stats);
  }, [onReady, stats]);

  useEffect(() => {
    if (!animationName) {
      return;
    }
    actions[animationName]?.setEffectiveTimeScale(playing ? playbackRate : 0);
  }, [actions, animationName, playbackRate, playing]);

  useEffect(() => {
    if (!animationName) {
      return;
    }
    const action = actions[animationName];
    if (!action) {
      return;
    }
    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, animationName]);

  useEffect(() => () => skeleton.dispose(), [skeleton]);

  return (
    <>
      <group
        position={[0, -bounds.min.y * scale, -0.82]}
        rotation={[0, rotationY, 0]}
        scale={scale}
      >
        <primitive object={scene} position={[-center.x, 0, -center.z]} />
      </group>
      <primitive object={skeleton} visible={showSkeleton} />
    </>
  );
}

function LabScene({
  animationName,
  animationUrls = NO_EXTRA_ANIMATIONS,
  cameraPreset,
  modelUrl,
  normalizeScale,
  onModelReady,
  playing,
  playbackRate,
  roomMode,
  rotationY,
  showGrid,
  showSkeleton,
  targetHeightM,
}: {
  animationName: string | null;
  animationUrls?: readonly string[];
  cameraPreset: CameraPreset;
  modelUrl: string | null;
  normalizeScale: boolean;
  onModelReady: (stats: ModelStats) => void;
  playing: boolean;
  playbackRate: number;
  roomMode: RoomMode;
  rotationY: number;
  showGrid: boolean;
  showSkeleton: boolean;
  targetHeightM: number;
}) {
  const neutralLighting = roomMode === "neutral";

  return (
    <Canvas
      camera={{ fov: 36, position: CAMERA_PRESETS[cameraPreset].position }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.6;
      }}
      shadows
    >
      <color attach="background" args={[neutralLighting ? "#20242b" : "#181b22"]} />
      <fog attach="fog" args={[neutralLighting ? "#20242b" : "#181b22", 8, 15]} />
      <CameraRig preset={cameraPreset} />
      <hemisphereLight
        args={[neutralLighting ? "#fff8ef" : "#f7f1e7", "#303746", neutralLighting ? 3.2 : 2.7]}
      />
      <ambientLight intensity={neutralLighting ? 2.2 : 1.8} />
      <directionalLight
        castShadow
        color="#fff2df"
        intensity={5.2}
        position={[0.5, 5.5, 5]}
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight color="#ccdcff" intensity={2.8} position={[-4, 3, 2.5]} />
      <spotLight
        angle={0.72}
        color="#fff8ef"
        intensity={95}
        penumbra={0.75}
        position={[0, 4.5, 4.8]}
      />
      <pointLight
        color={neutralLighting ? "#fff3e8" : "#e8ffc0"}
        intensity={neutralLighting ? 26 : 20}
        position={[3, 2.7, 2]}
      />
      <pointLight
        color={neutralLighting ? "#dce7ff" : "#c9c1ff"}
        intensity={neutralLighting ? 24 : 18}
        position={[-3, 2.2, 1]}
      />

      {showGrid ? (
        <Grid
          cellColor="#353945"
          cellSize={0.1}
          fadeDistance={8}
          fadeStrength={1.8}
          infiniteGrid
          sectionColor="#697181"
          sectionSize={1}
        />
      ) : null}
      <axesHelper args={[1]} position={[-1.45, 0.01, 0.8]} />
      {roomMode === "neutral" ? null : <ReferenceTable roomMode={roomMode} />}

      {modelUrl ? (
        <Suspense
          fallback={null}
        >
          <DealerModel
            animationName={animationName}
            animationUrls={animationUrls}
            key={`${modelUrl}|${animationUrls.join("|")}`}
            normalizeScale={normalizeScale}
            onReady={onModelReady}
            playing={playing}
            playbackRate={playbackRate}
            rotationY={rotationY}
            showSkeleton={showSkeleton}
            targetHeightM={targetHeightM}
            url={modelUrl}
          />
        </Suspense>
      ) : null}

      <Environment resolution={128}>
        <Lightformer color="#ffffff" form="rect" intensity={1.8} position={[0, 5, -3]} scale={[6, 3, 1]} />
        <Lightformer color={neutralLighting ? "#fff3e8" : "#c6f24e"} form="rect" intensity={0.85} position={[4, 2, 2]} scale={[2, 3, 1]} />
        <Lightformer color={neutralLighting ? "#dce7ff" : "#7c5cff"} form="rect" intensity={0.8} position={[-4, 2, 1]} scale={[2, 3, 1]} />
      </Environment>
    </Canvas>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.toggle}>
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" />
      {label}
    </label>
  );
}

export function DealerLab({ assets }: { assets: readonly LabAsset[] }) {
  const initialAsset = assets[0] ?? null;
  const objectUrl = useRef<string | null>(null);
  const [animationName, setAnimationName] = useState<string | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("gameplay");
  const [fileSize, setFileSize] = useState<number | null>(initialAsset?.fileSize ?? null);
  const [modelName, setModelName] = useState(initialAsset?.label ?? "Ingen modell vald");
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(initialAsset?.modelUrl ?? null);
  const [normalizeScale, setNormalizeScale] = useState(true);
  const [playing, setPlaying] = useState(() => (
    typeof window === "undefined"
      || !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const [playbackRate, setPlaybackRate] = useState(1);
  const [roomMode, setRoomMode] = useState<RoomMode>("blackjack");
  const [rotationY, setRotationY] = useState(0);
  const [selectedAssetId, setSelectedAssetId] = useState<string>(initialAsset?.id ?? "local");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [targetHeightM, setTargetHeightM] = useState(initialAsset?.targetHeightM ?? DEFAULT_TARGET_HEIGHT);

  const handleModelReady = useCallback((stats: ModelStats) => {
    setModelStats(stats);
    setAnimationName(null);
    setPlaying(false);
  }, []);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setSelectionError("Välj en fil som slutar på .glb.");
      event.target.value = "";
      return;
    }

    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
    }
    const nextUrl = URL.createObjectURL(file);
    objectUrl.current = nextUrl;
    setAnimationName(null);
    setFileSize(file.size);
    setModelName(file.name);
    setModelStats(null);
    setModelUrl(nextUrl);
    setPlaying(false);
    setSelectedAssetId("local");
    setSelectionError(null);
    event.target.value = "";
  }, []);

  const handleAssetChange = useCallback((assetId: string) => {
    const asset = assets.find((candidate) => candidate.id === assetId);
    if (!asset) {
      return;
    }
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    setAnimationName(null);
    setFileSize(asset.fileSize);
    setModelName(asset.label);
    setModelStats(null);
    setModelUrl(asset.modelUrl);
    setPlaying(false);
    setSelectedAssetId(asset.id);
    setSelectionError(null);
    setTargetHeightM(asset.targetHeightM);
  }, [assets]);

  useEffect(() => () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
    }
  }, []);

  const selectedAnimation = modelStats?.animations.find(
    (animation) => animation.name === animationName,
  ) ?? null;
  const poseMappings = useMemo(
    () => resolveDealerLabPoseMappings(
      modelStats?.animations.map((animation) => animation.name) ?? [],
    ),
    [modelStats],
  );
  const meshRigScaleRatio = modelStats && modelStats.dimensions.height > 0
    ? modelStats.rigHeight / modelStats.dimensions.height
    : null;
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;

  return (
    <section className={styles.lab} aria-label="3D-labb för avatarer">
      <div className={styles.stage}>
        <div className={styles.stageToolbar}>
          <div>
            <span className={styles.liveDot} />
            LOKALT ASSET-LABB
          </div>
          <span>{roomMode === "neutral" ? "Neutral studio" : `${roomMode}-referens`}</span>
        </div>
        <div className={styles.canvasWrap}>
          <ModelErrorBoundary resetKey={modelUrl ?? "empty"}>
            <LabScene
              animationName={animationName}
              animationUrls={selectedAsset?.animationUrls ?? NO_EXTRA_ANIMATIONS}
              cameraPreset={cameraPreset}
              modelUrl={modelUrl}
              normalizeScale={normalizeScale}
              onModelReady={handleModelReady}
              playing={playing}
              playbackRate={playbackRate}
              roomMode={roomMode}
              rotationY={rotationY}
              showGrid={showGrid}
              showSkeleton={showSkeleton}
              targetHeightM={targetHeightM}
            />
          </ModelErrorBoundary>
          {!modelUrl ? (
            <div className={styles.canvasMessage}>
              <strong>Välj en riggad GLB</strong>
              <span>Modellen öppnas bara lokalt i webbläsaren.</span>
            </div>
          ) : null}
          {modelUrl && !modelStats ? (
            <div className={styles.modelLoading} role="status">
              <span /> Läser modell, texturer och animationer…
            </div>
          ) : null}
        </div>
        <div className={styles.eventDock} aria-label="Spelhändelser och animationer">
          <div className={styles.eventDockHeading}>
            <strong>Spelhändelser</strong>
            <span>Testknappar · påverkar aldrig spelutfallet</span>
          </div>
          <div className={styles.eventDockGrid}>
            <button
              aria-pressed={animationName === null}
              className={styles.eventButton}
              data-status="neutral"
              onClick={() => {
                setAnimationName(null);
                setPlaying(false);
              }}
              type="button"
            >
              <strong>Neutral pose</strong>
              <span>Bind pose</span>
            </button>
            {poseMappings.map((mapping) => {
              const matchingCues = Object.entries(sceneVisualIntents)
                .filter(([, intent]) => intent.pose === mapping.pose);
              const isActive = mapping.clipName !== null && mapping.clipName === animationName;
              const statusLabel = mapping.status === "ready"
                ? "Godkänd"
                : mapping.status === "temporary" ? "Testklipp" : "Saknas";

              return (
                <button
                  aria-pressed={isActive}
                  className={styles.eventButton}
                  data-status={mapping.status}
                  disabled={!mapping.clipName}
                  key={mapping.pose}
                  onClick={() => {
                    setAnimationName(mapping.clipName);
                    setPlaying(true);
                  }}
                  title={matchingCues.map(([cueId]) => cueId).join("\n")}
                  type="button"
                >
                  <strong>{mapping.label}</strong>
                  <span>{statusLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.stageFooter}>
          <span>X <i className={styles.axisX} /> Y <i className={styles.axisY} /> Z <i className={styles.axisZ} /></span>
          <span>Mus: rotera · scroll: zooma · högerklick: panorera</span>
        </div>
      </div>

      <aside className={styles.panel} aria-label="Inspektör och kontroller">
        <section className={styles.panelSection}>
          <div className={styles.sectionHeading}>
            <span>01</span>
            <div><small>ASSET</small><strong>Karaktär</strong></div>
          </div>
          <label className={styles.field}>
            <span>Förberedd kandidat</span>
            <select
              disabled={assets.length === 0}
              onChange={(event) => handleAssetChange(event.target.value)}
              value={selectedAssetId}
            >
              {selectedAssetId === "local" ? <option value="local">Egen lokal GLB</option> : null}
              {assets.length === 0 ? <option value="local">Inga lokala kandidater hittades</option> : null}
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.label}</option>
              ))}
            </select>
          </label>
          <div className={styles.fileCard}>
            <span className={styles.fileIcon}>GLB</span>
            <div>
              <strong>{modelName}</strong>
              <span>{fileSize === null ? "Välj fil för att börja" : formatBytes(fileSize)}</span>
            </div>
          </div>
          <label className={styles.fileButton}>
            <input accept=".glb,model/gltf-binary" onChange={handleFileChange} type="file" />
            Välj annan GLB
          </label>
          {selectionError ? <p className={styles.errorText} role="alert">{selectionError}</p> : null}
          <p className={styles.privacyNote}>Filen laddas i din browser och skickas inte till servern.</p>
          {selectedAsset ? (
            <div className={styles.assetStatus}>
              <strong>{selectedAsset.roleLabel} · labbkandidat</strong>
              <ul>
                {selectedAsset.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
              </ul>
            </div>
          ) : null}
        </section>

        <section className={styles.panelSection}>
          <div className={styles.sectionHeading}>
            <span>02</span>
            <div><small>RUM OCH KAMERA</small><strong>Referensscen</strong></div>
          </div>
          <label className={styles.field}>
            <span>Rum</span>
            <select value={roomMode} onChange={(event) => setRoomMode(event.target.value as RoomMode)}>
              <option value="blackjack">Blackjackreferens</option>
              <option value="roulette">Roulettereferens</option>
              <option value="neutral">Neutral studio</option>
            </select>
          </label>
          <div className={styles.segmented} aria-label="Kameravinkel">
            {(Object.entries(CAMERA_PRESETS) as [CameraPreset, (typeof CAMERA_PRESETS)[CameraPreset]][])
              .map(([value, preset]) => (
                <button
                  aria-pressed={cameraPreset === value}
                  key={value}
                  onClick={() => setCameraPreset(value)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
          </div>
          <label className={styles.field}>
            <span>Målhöjd i meter</span>
            <input
              max="2.2"
              min="1"
              onChange={(event) => {
                const nextHeight = Number(event.target.value);
                if (Number.isFinite(nextHeight) && nextHeight >= 1 && nextHeight <= 2.2) {
                  setTargetHeightM(nextHeight);
                }
              }}
              step="0.01"
              type="number"
              value={targetHeightM}
            />
          </label>
          <div className={styles.toggleGrid}>
            <Toggle checked={showGrid} label="Mätgrid" onChange={setShowGrid} />
            <Toggle checked={showSkeleton} label="Skelett" onChange={setShowSkeleton} />
            <Toggle
              checked={normalizeScale}
              label={`Normalisera ${targetHeightM.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} m`}
              onChange={setNormalizeScale}
            />
          </div>
          <div className={styles.segmented} aria-label="Dealerns riktning">
            <button aria-pressed={rotationY === 0} onClick={() => setRotationY(0)} type="button">0°</button>
            <button aria-pressed={rotationY === Math.PI} onClick={() => setRotationY(Math.PI)} type="button">180°</button>
          </div>
        </section>

        <section className={styles.panelSection}>
          <div className={styles.sectionHeading}>
            <span>03</span>
            <div><small>ANIMATION</small><strong>Klippkontroll</strong></div>
          </div>
          <label className={styles.field}>
            <span>Aktivt klipp</span>
            <select
              disabled={!modelStats?.animations.length}
              onChange={(event) => setAnimationName(event.target.value || null)}
              value={animationName ?? ""}
            >
              <option value="">Bind pose · ingen animation</option>
              {!modelStats?.animations.length ? <option value="">Inga klipp hittade</option> : null}
              {modelStats?.animations.map((animation) => (
                <option key={animation.name} value={animation.name}>
                  {friendlyAnimationName(animation.name)}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.transport}>
            <button disabled={!animationName} onClick={() => setPlaying((value) => !value)} type="button">
              {playing ? "Pausa" : "Spela"}
            </button>
            <label>
              <span>Hastighet {playbackRate.toLocaleString("sv-SE", { maximumFractionDigits: 2 })}×</span>
              <input
                max="1.5"
                min="0.25"
                onChange={(event) => setPlaybackRate(Number(event.target.value))}
                step="0.25"
                type="range"
                value={playbackRate}
              />
            </label>
          </div>
          {selectedAnimation ? (
            <div className={styles.clipMeta}>
              <span>{selectedAnimation.duration.toFixed(2)} s</span>
              <span data-warning={selectedAnimation.rootMotionCandidate || undefined}>
                {selectedAnimation.rootMotionCandidate ? "Root/hips-position finns" : "Ingen tydlig rootförflyttning"}
              </span>
            </div>
          ) : null}
        </section>

        <section className={styles.panelSection}>
          <div className={styles.sectionHeading}>
            <span>04</span>
            <div><small>TEKNISK STATUS</small><strong>Modellrapport</strong></div>
          </div>
          {modelStats ? (
            <dl className={styles.stats}>
              <div><dt>Rå höjd</dt><dd>{modelStats.dimensions.height.toFixed(3)} enheter</dd></div>
              <div><dt>Rigghöjd</dt><dd>{modelStats.rigHeight?.toFixed(3) ?? "–"} enheter</dd></div>
              <div><dt>Bredd × djup</dt><dd>{modelStats.dimensions.width.toFixed(2)} × {modelStats.dimensions.depth.toFixed(2)}</dd></div>
              <div><dt>Trianglar</dt><dd>{modelStats.triangles.toLocaleString("sv-SE")}</dd></div>
              <div><dt>Mesh / skinned</dt><dd>{modelStats.meshes} / {modelStats.skinnedMeshes}</dd></div>
              <div><dt>Material</dt><dd>{modelStats.materials}</dd></div>
              <div><dt>Ben</dt><dd>{modelStats.joints}</dd></div>
              <div><dt>Fingerben / ögonben</dt><dd>{modelStats.fingerBones ?? "–"} / {modelStats.eyeBones ?? "–"}</dd></div>
              <div><dt>Morph targets</dt><dd>{modelStats.morphTargets ?? "–"}</dd></div>
              <div><dt>Animationer</dt><dd>{modelStats.animations.length}</dd></div>
            </dl>
          ) : (
            <p className={styles.emptyStats}>Rapporten visas när modellen har lästs in.</p>
          )}
          {modelStats && modelStats.triangles > 70_000 ? (
            <p className={styles.warning}>Över första releasebudgeten på 70 000 trianglar.</p>
          ) : null}
          {fileSize !== null && fileSize > 10_000_000 ? (
            <p className={styles.warning}>Över runtime-målet på 10 MB. Godkänd för labb, inte för slutexport.</p>
          ) : null}
          {meshRigScaleRatio !== null && meshRigScaleRatio > 10 ? (
            <p className={styles.warning}>Mesh och rigg skiljer cirka {meshRigScaleRatio.toFixed(0)}× i råskala. Labbet kompenserar; normalisera exporten i Blender.</p>
          ) : null}
          {modelStats && (modelStats.fingerBones === 0 || modelStats.eyeBones === 0 || modelStats.morphTargets === 0) ? (
            <p className={styles.warning}>Fingerben, ögonben och ansiktsformer saknas fortfarande enligt första dealer-specen.</p>
          ) : null}
        </section>
      </aside>
    </section>
  );
}
