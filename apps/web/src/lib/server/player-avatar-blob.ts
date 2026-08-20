import "server-only";

import { del, get, put, type GetBlobResult } from "@vercel/blob";

import {
  PLAYER_AVATAR_MAX_MODEL_BYTES,
} from "../../app/_components/player-avatar/avatar-contract";
export { isOwnedPlayerAvatarBlobPath, playerAvatarBlobPath } from "../player-avatar-blob-path";

export async function storePlayerAvatarBlob(path: string, bytes: ArrayBuffer): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) throw new Error("Privat avatar-lagring är inte konfigurerad.");
  if (bytes.byteLength <= 0 || bytes.byteLength > PLAYER_AVATAR_MAX_MODEL_BYTES) {
    throw new Error("Avatarfilen är för stor.");
  }
  const result = await put(path, Buffer.from(bytes), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 3600,
    contentType: "model/gltf-binary",
  });
  if (result.pathname !== path) throw new Error("Avatarfilen sparades på en oväntad sökväg.");
  return result.pathname;
}

export async function readPlayerAvatarBlob(path: string): Promise<GetBlobResult | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) throw new Error("Privat avatar-lagring är inte konfigurerad.");
  return get(path, { access: "private", useCache: true });
}

export async function deletePlayerAvatarBlobs(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) throw new Error("Privat avatar-lagring är inte konfigurerad.");
  await del([...new Set(paths)]);
}
