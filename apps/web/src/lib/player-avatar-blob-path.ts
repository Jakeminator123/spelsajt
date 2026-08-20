import {
  isPlayerAvatarAssetKey,
  type PlayerAvatarAssetKey,
} from "../app/_components/player-avatar/avatar-contract";

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PATH_PATTERN = new RegExp(`^player-avatars/(${UUID_PATTERN})/(${UUID_PATTERN})/([a-z]+)\\.glb$`, "i");

export function playerAvatarBlobPath(
  userId: string,
  generationId: string,
  asset: PlayerAvatarAssetKey,
): string {
  const path = `player-avatars/${userId}/${generationId}/${asset}.glb`;
  if (!isOwnedPlayerAvatarBlobPath(userId, path)) throw new Error("Avatarfilens sökväg är ogiltig.");
  return path;
}

export function isOwnedPlayerAvatarBlobPath(userId: string, path: string): boolean {
  const match = PATH_PATTERN.exec(path);
  return Boolean(match && match[1]?.toLowerCase() === userId.toLowerCase() && isPlayerAvatarAssetKey(match[3] ?? ""));
}
