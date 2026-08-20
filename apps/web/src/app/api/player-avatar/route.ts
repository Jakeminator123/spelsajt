import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PLAYER_AVATAR_ANIMATIONS,
  PLAYER_AVATAR_ASSET_KEYS,
  PLAYER_AVATAR_CONSENT_VERSION,
  type PlayerAvatarAnimationKey,
  type PlayerAvatarAssetKey,
  type PlayerAvatarStatus,
} from "../../_components/player-avatar/avatar-contract";
import { MeshyApiError, MeshyPlayerAvatarClient, type MeshyTaskResult } from "../../../lib/server/meshy-player-avatar-client";
import { authenticateAvatarRequest, AvatarHttpError } from "../../../lib/server/player-avatar-auth";
import {
  deletePlayerAvatarBlobs,
  isOwnedPlayerAvatarBlobPath,
  playerAvatarBlobPath,
  storePlayerAvatarBlob,
} from "../../../lib/server/player-avatar-blob";
import {
  createPlayerAvatarJobToken,
  verifyPlayerAvatarJobToken,
  type PlayerAvatarJobClaims,
} from "../../../lib/server/player-avatar-job-token";
import {
  readPlayerAvatarRow,
  replaceActiveAvatarJobToken,
  upsertPlayerAvatarRow,
  type PlayerAvatarRow,
} from "../../../lib/server/player-avatar-profile";
import {
  PLAYER_AVATAR_INPUT_MAX_BYTES,
  sanitizePlayerAvatarJpeg,
} from "../../../lib/server/player-avatar-input";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

const MAX_MULTIPART_BYTES = PLAYER_AVATAR_INPUT_MAX_BYTES + 128 * 1024;
const NO_STORE_HEADERS = { "cache-control": "no-store" };

interface AvatarConfiguration {
  readonly apiKey: string;
  readonly jobSecret: string;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const authenticated = await authenticateAvatarRequest(request);
    const config = avatarConfiguration();
    const jobToken = new URL(request.url).searchParams.get("job");
    const row = await readPlayerAvatarRow(authenticated.client, authenticated.user.id);
    if (!jobToken) return json(statusFromRow(row, config !== null));
    if (!config) throw new AvatarHttpError("Avatarpipeline saknar säker serverkonfiguration.", 503);
    if (row?.active_job_token !== jobToken) {
      if (row?.state === "ready") return json(statusFromRow(row, true));
      throw new AvatarHttpError("Avatarjobbet har redan gått vidare. Läs in aktuell status igen.", 409);
    }
    const claims = verifyPlayerAvatarJobToken(jobToken, authenticated.user.id, config.jobSecret);
    return json(await advanceJob(authenticated.client, row, jobToken, claims, config));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authenticated = await authenticateAvatarRequest(request);
    const config = avatarConfiguration();
    if (!config) throw new AvatarHttpError("Meshy-avatarer är inte aktiverade i den här miljön.", 503);

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
      throw new AvatarHttpError("Avatarbilden är för stor.", 413);
    }
    const form = await request.formData().catch(() => null);
    if (!form || form.get("consent") !== PLAYER_AVATAR_CONSENT_VERSION) {
      throw new AvatarHttpError("Bekräfta att bilden får skickas till Meshy för avatargenereringen.", 400);
    }
    const image = form.get("image");
    if (!(image instanceof File) || image.type !== "image/jpeg") {
      throw new AvatarHttpError("Avatarbilden måste vara en JPEG.", 400);
    }
    let sanitized: ReturnType<typeof sanitizePlayerAvatarJpeg>;
    try {
      sanitized = sanitizePlayerAvatarJpeg(await image.arrayBuffer());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Avatarbilden är ogiltig.";
      throw new AvatarHttpError(message, 400);
    }
    const generationId = await claimGeneration(authenticated.client);
    const meshy = new MeshyPlayerAvatarClient(config.apiKey);
    const imageDataUri = `data:image/jpeg;base64,${Buffer.from(sanitized.bytes).toString("base64")}`;
    const imageTaskId = await meshy.createImageTask(imageDataUri);
    const claims: Omit<PlayerAvatarJobClaims, "version"> = {
      animationTaskIds: {},
      generationId,
      imageTaskId,
      issuedAt: Date.now(),
      rigTaskId: null,
      stage: "image",
      storedPaths: {},
      userId: authenticated.user.id,
    };
    const jobToken = createPlayerAvatarJobToken(claims, config.jobSecret);
    try {
      await upsertPlayerAvatarRow(authenticated.client, {
        active_job_token: jobToken,
        error_message: null,
        state: "image",
        user_id: authenticated.user.id,
      });
    } catch (error) {
      await meshy.deleteImageTask(imageTaskId).catch(() => undefined);
      throw error;
    }
    return json(jobStatus("image", jobToken, 0), 202);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const authenticated = await authenticateAvatarRequest(request);
    const row = await readPlayerAvatarRow(authenticated.client, authenticated.user.id);
    if (!row) return new Response(null, { headers: NO_STORE_HEADERS, status: 204 });

    const paths = avatarPaths(row).filter((path) => isOwnedPlayerAvatarBlobPath(authenticated.user.id, path));
    await deletePlayerAvatarBlobs(paths);
    const config = avatarConfiguration();
    if (config && row.active_job_token) {
      try {
        const claims = verifyPlayerAvatarJobToken(row.active_job_token, authenticated.user.id, config.jobSecret);
        await cleanupMeshyTasks(new MeshyPlayerAvatarClient(config.apiKey), claims);
      } catch {
        // A corrupt/expired local token must not prevent deletion of app-owned data.
      }
    }
    await upsertPlayerAvatarRow(authenticated.client, {
      active_job_token: null,
      animation_paths: {},
      error_message: null,
      model_path: null,
      state: "empty",
      user_id: authenticated.user.id,
    });
    return new Response(null, { headers: NO_STORE_HEADERS, status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

async function advanceJob(
  client: SupabaseClient,
  row: PlayerAvatarRow,
  currentToken: string,
  claims: PlayerAvatarJobClaims,
  config: AvatarConfiguration,
): Promise<PlayerAvatarStatus> {
  const meshy = new MeshyPlayerAvatarClient(config.apiKey);
  if (claims.stage === "image") {
    const task = await meshy.getImageTask(claims.imageTaskId);
    if (isFailed(task)) return failJob(client, meshy, claims, providerFailure(task));
    if (task.status !== "SUCCEEDED") return jobStatus("image", currentToken, scaleProgress(task.progress, 0, 55));

    const rigTaskId = await meshy.createRigTask(claims.imageTaskId);
    const nextClaims = { ...withoutVersion(claims), rigTaskId, stage: "rigging" as const };
    const nextToken = createPlayerAvatarJobToken(nextClaims, config.jobSecret);
    if (!await replaceActiveAvatarJobToken(client, claims.userId, currentToken, nextToken, "rigging")) {
      await meshy.deleteRigTask(rigTaskId).catch(() => undefined);
      throw new AvatarHttpError("Avatarjobbet uppdaterades parallellt. Läs in status igen.", 409);
    }
    return jobStatus("rigging", nextToken, 55);
  }

  if (claims.stage === "rigging") {
    const task = await meshy.getRigTask(claims.rigTaskId!);
    if (isFailed(task)) return failJob(client, meshy, claims, providerFailure(task));
    if (task.status !== "SUCCEEDED") return jobStatus("rigging", currentToken, scaleProgress(task.progress, 55, 70));

    const created: Partial<Record<PlayerAvatarAnimationKey, string>> = {};
    try {
      for (const animation of PLAYER_AVATAR_ANIMATIONS) {
        created[animation.key] = await meshy.createAnimationTask(claims.rigTaskId!, animation.actionId);
      }
    } catch (error) {
      await Promise.all(Object.values(created).map((taskId) => meshy.deleteAnimationTask(taskId).catch(() => undefined)));
      throw error;
    }
    const nextClaims = {
      ...withoutVersion(claims),
      animationTaskIds: created,
      stage: "animating" as const,
    };
    const nextToken = createPlayerAvatarJobToken(nextClaims, config.jobSecret);
    if (!await replaceActiveAvatarJobToken(client, claims.userId, currentToken, nextToken, "animating")) {
      await Promise.all(Object.values(created).map((taskId) => meshy.deleteAnimationTask(taskId).catch(() => undefined)));
      throw new AvatarHttpError("Avatarjobbet uppdaterades parallellt. Läs in status igen.", 409);
    }
    return jobStatus("animating", nextToken, 70);
  }

  if (claims.stage === "animating") {
    const tasks = await Promise.all(PLAYER_AVATAR_ANIMATIONS.map(async ({ key }) => (
      meshy.getAnimationTask(claims.animationTaskIds[key]!)
    )));
    const failed = tasks.find(isFailed);
    if (failed) return failJob(client, meshy, claims, providerFailure(failed));
    const average = tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length;
    if (tasks.some((task) => task.status !== "SUCCEEDED")) {
      return jobStatus("animating", currentToken, scaleProgress(average, 70, 90));
    }
    const nextClaims = { ...withoutVersion(claims), stage: "storing" as const };
    const nextToken = createPlayerAvatarJobToken(nextClaims, config.jobSecret);
    if (!await replaceActiveAvatarJobToken(client, claims.userId, currentToken, nextToken, "storing")) {
      throw new AvatarHttpError("Avatarjobbet uppdaterades parallellt. Läs in status igen.", 409);
    }
    return jobStatus("storing", nextToken, 90);
  }

  const missingAsset = PLAYER_AVATAR_ASSET_KEYS.find((key) => !claims.storedPaths[key]);
  if (missingAsset) {
    const task = await completedAssetTask(meshy, claims, missingAsset);
    if (!task.outputUrl) return failJob(client, meshy, claims, "Meshy blev klar utan en GLB-fil.");
    const bytes = await meshy.downloadGlb(task.outputUrl);
    const path = playerAvatarBlobPath(claims.userId, claims.generationId, missingAsset);
    await storePlayerAvatarBlob(path, bytes);
    const nextClaims = {
      ...withoutVersion(claims),
      storedPaths: { ...claims.storedPaths, [missingAsset]: path },
    };
    const nextToken = createPlayerAvatarJobToken(nextClaims, config.jobSecret);
    if (!await replaceActiveAvatarJobToken(client, claims.userId, currentToken, nextToken, "storing")) {
      throw new AvatarHttpError("Avatarjobbet uppdaterades parallellt. Läs in status igen.", 409);
    }
    const stored = Object.keys(nextClaims.storedPaths).length;
    return jobStatus("storing", nextToken, 90 + Math.round((stored / PLAYER_AVATAR_ASSET_KEYS.length) * 9));
  }

  const animationPaths = Object.fromEntries(PLAYER_AVATAR_ANIMATIONS.map(({ key }) => [key, claims.storedPaths[key]!])) as Record<PlayerAvatarAnimationKey, string>;
  const update = await client
    .from("player_avatars")
    .update({
      active_job_token: null,
      animation_paths: animationPaths,
      error_message: null,
      model_path: claims.storedPaths.rigged,
      state: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", claims.userId)
    .eq("active_job_token", currentToken)
    .select("user_id");
  if (update.error) throw update.error;
  if (update.data.length !== 1) throw new AvatarHttpError("Avatarjobbet uppdaterades parallellt.", 409);

  const currentPaths = new Set(Object.values(claims.storedPaths));
  const oldPaths = avatarPaths(row).filter((path) => !currentPaths.has(path));
  await deletePlayerAvatarBlobs(oldPaths).catch(() => undefined);
  await cleanupMeshyTasks(meshy, claims);
  return readyStatus(animationPaths);
}

async function completedAssetTask(
  meshy: MeshyPlayerAvatarClient,
  claims: PlayerAvatarJobClaims,
  asset: PlayerAvatarAssetKey,
): Promise<MeshyTaskResult> {
  const task = asset === "rigged"
    ? await meshy.getRigTask(claims.rigTaskId!)
    : await meshy.getAnimationTask(claims.animationTaskIds[asset]!);
  if (task.status !== "SUCCEEDED") throw new AvatarHttpError("Meshy-filen är inte längre färdig.", 502);
  return task;
}

async function failJob(
  client: SupabaseClient,
  meshy: MeshyPlayerAvatarClient,
  claims: PlayerAvatarJobClaims,
  message: string,
): Promise<PlayerAvatarStatus> {
  const clean = safeProviderError(message);
  await upsertPlayerAvatarRow(client, {
    active_job_token: null,
    error_message: clean,
    state: "failed",
    user_id: claims.userId,
  });
  await cleanupMeshyTasks(meshy, claims);
  return {
    animationKeys: [],
    available: true,
    error: clean,
    jobToken: null,
    modelAvailable: false,
    progress: 0,
    state: "failed",
    unavailableReason: null,
  };
}

async function cleanupMeshyTasks(meshy: MeshyPlayerAvatarClient, claims: PlayerAvatarJobClaims): Promise<void> {
  await Promise.all([
    meshy.deleteImageTask(claims.imageTaskId).catch(() => undefined),
    claims.rigTaskId ? meshy.deleteRigTask(claims.rigTaskId).catch(() => undefined) : Promise.resolve(),
    ...Object.values(claims.animationTaskIds).map((taskId) => meshy.deleteAnimationTask(taskId).catch(() => undefined)),
  ]);
}

async function claimGeneration(client: SupabaseClient): Promise<string> {
  const result = await client.rpc("claim_player_avatar_generation");
  if (result.error) {
    if (result.error.code === "P0001") throw new AvatarHttpError(result.error.message, 429);
    throw result.error;
  }
  if (typeof result.data !== "string" || !/^[0-9a-f-]{36}$/i.test(result.data)) {
    throw new AvatarHttpError("Avatarens kostnadsspärr svarade inte som väntat.", 502);
  }
  return result.data;
}

function avatarConfiguration(): AvatarConfiguration | null {
  if (process.env.MESHY_SELFIE_ENABLED?.trim().toLowerCase() !== "true") return null;
  const apiKey = process.env.MESHY_API_KEY?.trim();
  const jobSecret = process.env.PLAYER_AVATAR_JOB_SECRET?.trim();
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return apiKey && jobSecret && blobToken ? { apiKey, jobSecret } : null;
}

function statusFromRow(row: PlayerAvatarRow | null, available: boolean): PlayerAvatarStatus {
  const animationKeys = row
    ? PLAYER_AVATAR_ANIMATIONS.map(({ key }) => key).filter((key) => Boolean(row.animation_paths[key]))
    : [];
  return {
    animationKeys,
    available,
    error: row?.error_message ?? null,
    jobToken: row?.active_job_token ?? null,
    modelAvailable: Boolean(row?.model_path && row.animation_paths.idle),
    progress: row?.state === "ready" ? 100 : 0,
    state: row?.state ?? "empty",
    unavailableReason: available ? null : "Selfie-till-3D är avstängt tills Meshy-avtal och privat Blob-konfiguration är godkända.",
  };
}

function jobStatus(
  state: "image" | "rigging" | "animating" | "storing",
  jobToken: string,
  progress: number,
): PlayerAvatarStatus {
  return {
    animationKeys: [],
    available: true,
    error: null,
    jobToken,
    modelAvailable: false,
    progress,
    state,
    unavailableReason: null,
  };
}

function readyStatus(animationPaths: Record<PlayerAvatarAnimationKey, string>): PlayerAvatarStatus {
  return {
    animationKeys: PLAYER_AVATAR_ANIMATIONS.map(({ key }) => key).filter((key) => Boolean(animationPaths[key])),
    available: true,
    error: null,
    jobToken: null,
    modelAvailable: true,
    progress: 100,
    state: "ready",
    unavailableReason: null,
  };
}

function avatarPaths(row: PlayerAvatarRow): string[] {
  return [row.model_path, ...Object.values(row.animation_paths)].filter((path): path is string => typeof path === "string");
}

function withoutVersion(claims: PlayerAvatarJobClaims): Omit<PlayerAvatarJobClaims, "version"> {
  const { version, ...rest } = claims;
  void version;
  return rest;
}

function isFailed(task: MeshyTaskResult): boolean {
  return task.status === "FAILED" || task.status === "CANCELED";
}

function providerFailure(task: MeshyTaskResult): string {
  return task.error || (task.status === "CANCELED"
    ? "Meshy-jobbet avbröts. Prova en ny bild."
    : "Meshy kunde inte skapa avataren från bilden.");
}

function safeProviderError(message: string): string {
  return message.replaceAll(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240)
    || "Meshy kunde inte skapa avataren.";
}

function scaleProgress(progress: number, start: number, end: number): number {
  return Math.round(start + (Math.max(0, Math.min(100, progress)) / 100) * (end - start));
}

function errorResponse(error: unknown): Response {
  if (error instanceof AvatarHttpError) return json({ error: error.message }, error.status);
  if (error instanceof MeshyApiError) {
    if (error.status === 400) return json({ error: "Meshy avvisade bilden eller modellen. Prova en tydlig helkroppsbild." }, 400);
    if (error.status === 401 || error.status === 403) return json({ error: "Meshy API-nyckeln avvisades." }, 503);
    if (error.status === 402) return json({ error: "Meshy-krediterna räcker inte för en ny avatar." }, 402);
    if (error.status === 429) return json({ error: "Meshy är upptaget. Vänta en stund och försök igen." }, 429);
    return json({ error: "Meshy-anropet misslyckades. Försök igen senare." }, 502);
  }
  return json({ error: "Avatarservern misslyckades. Försök igen senare." }, 500);
}

function json(body: PlayerAvatarStatus | Record<string, unknown>, status = 200): Response {
  return Response.json(body, { headers: NO_STORE_HEADERS, status });
}
