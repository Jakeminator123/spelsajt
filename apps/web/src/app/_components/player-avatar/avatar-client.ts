import {
  PLAYER_AVATAR_CONSENT_VERSION,
  type PlayerAvatarAssetKey,
  type PlayerAvatarStatus,
} from "./avatar-contract";

type Fetcher = typeof fetch;

export async function getPlayerAvatarStatus(
  accessToken: string,
  jobToken: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<PlayerAvatarStatus> {
  const query = jobToken ? `?job=${encodeURIComponent(jobToken)}` : "";
  return avatarRequest(`/api/player-avatar${query}`, accessToken, { cache: "no-store" }, fetcher);
}

export async function startPlayerAvatarGeneration(
  accessToken: string,
  photo: Blob,
  fetcher: Fetcher = fetch,
): Promise<PlayerAvatarStatus> {
  if (photo.type !== "image/jpeg" || photo.size <= 0) {
    throw new Error("Avatarbilden är inte en giltig JPEG.");
  }
  const form = new FormData();
  form.set("consent", PLAYER_AVATAR_CONSENT_VERSION);
  form.set("image", photo, "player-avatar.jpg");
  return avatarRequest("/api/player-avatar", accessToken, { body: form, method: "POST" }, fetcher);
}

export async function deletePlayerAvatar(
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const response = await fetcher("/api/player-avatar", {
    cache: "no-store",
    headers: authHeaders(accessToken),
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await responseError(response));
}

export async function downloadPlayerAvatarAssetUrl(
  accessToken: string,
  asset: PlayerAvatarAssetKey,
  fetcher: Fetcher = fetch,
): Promise<string> {
  const response = await fetcher(`/api/player-avatar/assets/${asset}`, {
    cache: "no-store",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return URL.createObjectURL(await response.blob());
}

async function avatarRequest(
  url: string,
  accessToken: string,
  init: RequestInit,
  fetcher: Fetcher,
): Promise<PlayerAvatarStatus> {
  const response = await fetcher(url, {
    ...init,
    headers: { ...authHeaders(accessToken), ...init.headers },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorFromBody(body));
  return body as PlayerAvatarStatus;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

async function responseError(response: Response): Promise<string> {
  return errorFromBody(await response.json().catch(() => null));
}

function errorFromBody(body: unknown): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return "Avatarservern svarade inte som väntat.";
}
