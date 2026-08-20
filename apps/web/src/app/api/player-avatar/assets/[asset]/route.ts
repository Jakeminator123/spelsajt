import {
  isPlayerAvatarAssetKey,
  type PlayerAvatarAnimationKey,
} from "../../../../_components/player-avatar/avatar-contract";
import { authenticateAvatarRequest, AvatarHttpError } from "../../../../../lib/server/player-avatar-auth";
import { isOwnedPlayerAvatarBlobPath, readPlayerAvatarBlob } from "../../../../../lib/server/player-avatar-blob";
import { readPlayerAvatarRow } from "../../../../../lib/server/player-avatar-profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ asset: string }> },
): Promise<Response> {
  try {
    const authenticated = await authenticateAvatarRequest(request);
    const { asset } = await context.params;
    if (!isPlayerAvatarAssetKey(asset)) throw new AvatarHttpError("Avatarfilen finns inte.", 404);
    const row = await readPlayerAvatarRow(authenticated.client, authenticated.user.id);
    const path = asset === "rigged"
      ? row?.model_path
      : row?.animation_paths[asset as PlayerAvatarAnimationKey];
    if (!path || !isOwnedPlayerAvatarBlobPath(authenticated.user.id, path)) {
      throw new AvatarHttpError("Avatarfilen finns inte.", 404);
    }
    const result = await readPlayerAvatarBlob(path);
    if (!result || result.statusCode !== 200) throw new AvatarHttpError("Avatarfilen finns inte.", 404);
    return new Response(result.stream, {
      headers: {
        "cache-control": "private, max-age=300",
        "content-length": String(result.blob.size),
        "content-type": "model/gltf-binary",
        etag: result.blob.etag,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof AvatarHttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Avatarfilen kunde inte hämtas.";
    return Response.json({ error: message }, { headers: { "cache-control": "no-store" }, status });
  }
}
