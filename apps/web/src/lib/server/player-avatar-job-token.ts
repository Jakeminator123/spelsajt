import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  PLAYER_AVATAR_ANIMATIONS,
  isPlayerAvatarAssetKey,
  type PlayerAvatarAnimationKey,
  type PlayerAvatarAssetKey,
} from "../../app/_components/player-avatar/avatar-contract";
import { playerAvatarBlobPath } from "../player-avatar-blob-path";

const TOKEN_DOMAIN = "spelsajt-player-avatar-v2";
const TOKEN_VERSION = 1;
const MAX_JOB_AGE_MS = 4 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AvatarJobStage = "image" | "rigging" | "animating" | "storing";

export interface PlayerAvatarJobClaims {
  readonly animationTaskIds: Partial<Record<PlayerAvatarAnimationKey, string>>;
  readonly generationId: string;
  readonly imageTaskId: string;
  readonly issuedAt: number;
  readonly rigTaskId: string | null;
  readonly stage: AvatarJobStage;
  readonly storedPaths: Partial<Record<PlayerAvatarAssetKey, string>>;
  readonly userId: string;
  readonly version: 1;
}

export function createPlayerAvatarJobToken(
  claims: Omit<PlayerAvatarJobClaims, "version">,
  secret: string,
): string {
  assertSecret(secret);
  const versioned: PlayerAvatarJobClaims = { ...claims, version: TOKEN_VERSION };
  assertClaims(versioned, claims.issuedAt);
  const encoded = Buffer.from(JSON.stringify(versioned), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

export function verifyPlayerAvatarJobToken(
  token: string,
  expectedUserId: string,
  secret: string,
  now = Date.now(),
): PlayerAvatarJobClaims {
  assertSecret(secret);
  if (token.length > 12_000) throw new Error("Avatarjobbet är ogiltigt.");
  const [encoded, encodedSignature, extra] = token.split(".");
  if (!encoded || !encodedSignature || extra !== undefined) throw new Error("Avatarjobbet är ogiltigt.");
  const expected = signature(encoded, secret);
  const provided = Buffer.from(encodedSignature, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Avatarjobbet är ogiltigt.");
  }
  let claims: PlayerAvatarJobClaims;
  try {
    claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PlayerAvatarJobClaims;
  } catch {
    throw new Error("Avatarjobbet är ogiltigt.");
  }
  assertClaims(claims, now);
  if (claims.userId !== expectedUserId) throw new Error("Avatarjobbet tillhör en annan spelare.");
  return claims;
}

function signature(encoded: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(TOKEN_DOMAIN).update("\0").update(encoded).digest();
}

function assertClaims(claims: PlayerAvatarJobClaims, now: number): void {
  if (
    claims.version !== TOKEN_VERSION
    || !UUID_PATTERN.test(claims.userId)
    || !UUID_PATTERN.test(claims.generationId)
    || !UUID_PATTERN.test(claims.imageTaskId)
    || !Number.isSafeInteger(claims.issuedAt)
    || claims.issuedAt > now + MAX_CLOCK_SKEW_MS
    || claims.issuedAt < now - MAX_JOB_AGE_MS
    || !["image", "rigging", "animating", "storing"].includes(claims.stage)
  ) throw new Error("Avatarjobbet är ogiltigt eller har gått ut.");

  const needsRig = claims.stage !== "image";
  if (needsRig !== Boolean(claims.rigTaskId) || (claims.rigTaskId && !UUID_PATTERN.test(claims.rigTaskId))) {
    throw new Error("Avatarjobbet har ett ogiltigt riggningssteg.");
  }
  if (!claims.animationTaskIds || typeof claims.animationTaskIds !== "object" || Array.isArray(claims.animationTaskIds)) {
    throw new Error("Avatarjobbet har ogiltiga animationsjobb.");
  }
  const taskEntries = Object.entries(claims.animationTaskIds);
  const expectedAnimationKeys = PLAYER_AVATAR_ANIMATIONS.map(({ key }) => key);
  if (claims.stage === "animating" || claims.stage === "storing") {
    if (
      taskEntries.length !== expectedAnimationKeys.length
      || taskEntries.some(([key, value]) => !expectedAnimationKeys.includes(key as PlayerAvatarAnimationKey) || !UUID_PATTERN.test(value))
    ) throw new Error("Avatarjobbet har ogiltiga animationsjobb.");
  } else if (taskEntries.length > 0) {
    throw new Error("Avatarjobbet har animationer i fel steg.");
  }
  if (!claims.storedPaths || typeof claims.storedPaths !== "object" || Array.isArray(claims.storedPaths)) {
    throw new Error("Avatarjobbet har ogiltig lagringsstatus.");
  }
  if (claims.stage !== "storing" && Object.keys(claims.storedPaths).length > 0) {
    throw new Error("Avatarjobbet har lagrade filer i fel steg.");
  }
  for (const [key, value] of Object.entries(claims.storedPaths)) {
    if (
      !isPlayerAvatarAssetKey(key)
      || typeof value !== "string"
      || value !== playerAvatarBlobPath(claims.userId, claims.generationId, key)
    ) throw new Error("Avatarjobbet har en ogiltig lagringssökväg.");
  }
}

function assertSecret(secret: string): void {
  if (secret.trim().length < 32) throw new Error("Avatarjobben är inte säkert konfigurerade.");
}
