import {
  type AnimationClip,
  Box3,
  type KeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from "three";

export const GENERATED_PLAYER_AVATAR_MAX_BYTES = 20 * 1024 * 1024;
export const GENERATED_PLAYER_AVATAR_TARGET_HEIGHT = 1.38;

const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const MIN_TARGET_HEIGHT = 0.25;
const MAX_TARGET_HEIGHT = 2.5;

export interface GeneratedAvatarPlacement {
  readonly offset: [number, number, number];
  readonly scale: number;
}

interface GlbResource {
  readonly uri?: unknown;
}

interface GlbJson {
  readonly asset?: { readonly version?: unknown };
  readonly buffers?: readonly GlbResource[];
  readonly images?: readonly GlbResource[];
}

function animationToken(name: string): string {
  return name.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]/g, "");
}

export function chooseGeneratedAvatarIdleClip(clips: readonly AnimationClip[]): AnimationClip | null {
  for (const preferred of ["idle", "idleloop", "standingidle", "neutralidle", "restidle"]) {
    const clip = clips.find((candidate) => animationToken(candidate.name) === preferred);
    if (clip) return clip;
  }
  return clips.find((clip) => {
    const token = animationToken(clip.name);
    return token.includes("idle") && !token.includes("sit") && !token.includes("walk") && !token.includes("run");
  }) ?? clips.find((clip) => {
    const token = animationToken(clip.name);
    return token.includes("breath") || token.includes("neutral") || token.includes("rest");
  }) ?? null;
}

function isRootPositionTrack(track: KeyframeTrack): track is VectorKeyframeTrack {
  if (!(track instanceof VectorKeyframeTrack) || !track.name.endsWith(".position")) return false;
  const target = animationToken(track.name.slice(0, -".position".length));
  return target.endsWith("root") || target.endsWith("armature") || target.endsWith("hips") || target.endsWith("pelvis");
}

export function sanitizeGeneratedAvatarIdleClip(clip: AnimationClip): AnimationClip {
  const sanitized = clip.clone();
  for (const track of sanitized.tracks) {
    if (!isRootPositionTrack(track) || track.values.length < 3) continue;
    const [initialX = 0, initialY = 0, initialZ = 0] = track.values;
    for (let index = 0; index + 2 < track.values.length; index += 3) {
      track.values[index] = initialX;
      track.values[index + 1] = initialY;
      track.values[index + 2] = initialZ;
    }
  }
  return sanitized;
}

export function generatedAvatarPlacement(
  bounds: Box3,
  targetHeight = GENERATED_PLAYER_AVATAR_TARGET_HEIGHT,
): GeneratedAvatarPlacement | null {
  if (bounds.isEmpty() || !Number.isFinite(targetHeight) || targetHeight < MIN_TARGET_HEIGHT || targetHeight > MAX_TARGET_HEIGHT) {
    return null;
  }
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z) || size.y <= Number.EPSILON) {
    return null;
  }
  const scale = targetHeight / size.y;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return {
    offset: [-center.x * scale, -bounds.min.y * scale, -center.z * scale],
    scale,
  };
}

export function validatePrivateGeneratedAvatarGlb(
  buffer: ArrayBuffer,
  maxBytes = GENERATED_PLAYER_AVATAR_MAX_BYTES,
): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 20 || buffer.byteLength > maxBytes) {
    throw new Error("Avatar-GLB:n är för stor.");
  }
  if (buffer.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) {
    throw new Error("Avatarfilen är inte en giltig GLB.");
  }
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(GLB_HEADER_BYTES, true);
  const jsonStart = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES;
  const jsonEnd = jsonStart + jsonLength;
  if (
    view.getUint32(0, true) !== GLB_MAGIC
    || view.getUint32(4, true) !== GLB_VERSION
    || view.getUint32(8, true) !== buffer.byteLength
    || view.getUint32(GLB_HEADER_BYTES + 4, true) !== JSON_CHUNK_TYPE
    || jsonLength === 0
    || jsonEnd > buffer.byteLength
  ) throw new Error("Avatarfilen är inte en giltig GLB 2.0.");

  let json: GlbJson;
  try {
    const text = new TextDecoder()
      .decode(new Uint8Array(buffer, jsonStart, jsonLength))
      .replaceAll(/\u0000|\s+$/g, "");
    json = JSON.parse(text) as GlbJson;
  } catch {
    throw new Error("Avatar-GLB:ns metadata är ogiltig.");
  }
  if (json.asset?.version !== "2.0") throw new Error("Avatar-GLB:n saknar glTF 2.0-metadata.");
  assertEmbedded(json.buffers);
  assertEmbedded(json.images);
}

function assertEmbedded(resources: readonly GlbResource[] | undefined): void {
  for (const resource of resources ?? []) {
    if (typeof resource.uri === "string" && !resource.uri.startsWith("data:")) {
      throw new Error("Avatar-GLB:n får inte hämta externa resurser.");
    }
  }
}
