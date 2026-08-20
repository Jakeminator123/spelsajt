export const PLAYER_AVATAR_CONSENT_VERSION = "meshy-player-avatar-v1";
export const PLAYER_AVATAR_MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const PLAYER_AVATAR_MAX_MODEL_BYTES = 20 * 1024 * 1024;

export const PLAYER_AVATAR_ANIMATIONS = [
  { actionId: 0, key: "idle", label: "Idle" },
  { actionId: 25, key: "agree", label: "Agree gesture" },
  { actionId: 36, key: "confused", label: "Confused scratch" },
  { actionId: 47, key: "listening", label: "Listening gesture" },
  { actionId: 59, key: "victory", label: "Victory cheer" },
] as const;

export type PlayerAvatarAnimationKey = typeof PLAYER_AVATAR_ANIMATIONS[number]["key"];
export type PlayerAvatarAssetKey = "rigged" | PlayerAvatarAnimationKey;

export const PLAYER_AVATAR_ASSET_KEYS: readonly PlayerAvatarAssetKey[] = [
  "rigged",
  ...PLAYER_AVATAR_ANIMATIONS.map((animation) => animation.key),
];

export type PlayerAvatarPipelineState =
  | "empty"
  | "image"
  | "rigging"
  | "animating"
  | "storing"
  | "ready"
  | "failed";

export interface PlayerAvatarStatus {
  readonly animationKeys: readonly PlayerAvatarAnimationKey[];
  readonly available: boolean;
  readonly error: string | null;
  readonly jobToken: string | null;
  readonly modelAvailable: boolean;
  readonly progress: number;
  readonly state: PlayerAvatarPipelineState;
  readonly unavailableReason: string | null;
}

export function isPlayerAvatarAssetKey(value: string): value is PlayerAvatarAssetKey {
  return PLAYER_AVATAR_ASSET_KEYS.includes(value as PlayerAvatarAssetKey);
}
