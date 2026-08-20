import "server-only";

import {
  PLAYER_AVATAR_MAX_MODEL_BYTES,
} from "../../app/_components/player-avatar/avatar-contract";
import { validateSelfContainedGlb } from "./player-avatar-glb";

const MESHY_BASE_URL = "https://api.meshy.ai";
const MESHY_ASSET_HOST = "assets.meshy.ai";
const REQUEST_TIMEOUT_MS = 25_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MeshyTaskStatus = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";

export interface MeshyTaskResult {
  readonly error: string | null;
  readonly id: string;
  readonly outputUrl: string | null;
  readonly progress: number;
  readonly status: MeshyTaskStatus;
}

export class MeshyApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MeshyApiError";
  }
}

export class MeshyPlayerAvatarClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (apiKey.trim().length < 16) throw new Error("Meshy API-nyckeln saknas.");
  }

  async createImageTask(jpegDataUri: string): Promise<string> {
    return this.createTask("/openapi/v1/image-to-3d", {
      ai_model: "meshy-7",
      enable_pbr: false,
      image_enhancement: false,
      image_url: jpegDataUri,
      model_type: "standard",
      moderation: true,
      pose_mode: "a-pose",
      save_pre_remeshed_model: false,
      should_remesh: true,
      should_texture: true,
      target_formats: ["glb"],
      target_polycount: 30_000,
      texture_resolution: "2k",
      topology: "triangle",
      ultra_mode: false,
    });
  }

  async createRigTask(imageTaskId: string): Promise<string> {
    assertTaskId(imageTaskId);
    return this.createTask("/openapi/v1/rigging", { height_meters: 1.75, input_task_id: imageTaskId });
  }

  async createAnimationTask(rigTaskId: string, actionId: number): Promise<string> {
    assertTaskId(rigTaskId);
    if (!Number.isSafeInteger(actionId) || actionId < 0) throw new Error("Animationens id är ogiltigt.");
    return this.createTask("/openapi/v1/animations", { action_id: actionId, rig_task_id: rigTaskId });
  }

  getImageTask(taskId: string): Promise<MeshyTaskResult> {
    return this.getTask("/openapi/v1/image-to-3d", taskId, (body) => {
      const urls = objectRecord(body, "model_urls");
      return urls ? objectString(urls, "glb") : null;
    });
  }

  getRigTask(taskId: string): Promise<MeshyTaskResult> {
    return this.getTask("/openapi/v1/rigging", taskId, (body) => {
      const result = objectRecord(body, "result");
      return result ? objectString(result, "rigged_character_glb_url") : null;
    });
  }

  getAnimationTask(taskId: string): Promise<MeshyTaskResult> {
    return this.getTask("/openapi/v1/animations", taskId, (body) => {
      const result = objectRecord(body, "result");
      return result ? objectString(result, "animation_glb_url") : null;
    });
  }

  deleteImageTask(taskId: string): Promise<void> {
    return this.deleteTask("/openapi/v1/image-to-3d", taskId);
  }

  deleteRigTask(taskId: string): Promise<void> {
    return this.deleteTask("/openapi/v1/rigging", taskId);
  }

  deleteAnimationTask(taskId: string): Promise<void> {
    return this.deleteTask("/openapi/v1/animations", taskId);
  }

  async downloadGlb(rawUrl: string): Promise<ArrayBuffer> {
    let url = validatedAssetUrl(rawUrl);
    let response: Response | null = null;
    for (let redirects = 0; redirects <= 2; redirects += 1) {
      response = await this.fetcher(url, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) throw new MeshyApiError("Meshy-filens omdirigering saknar mål.", 502);
      url = validatedAssetUrl(new URL(location, url).toString());
    }
    if (!response?.ok) throw await apiError(response ?? new Response(null, { status: 502 }));
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > PLAYER_AVATAR_MAX_MODEL_BYTES) {
      throw new MeshyApiError("Meshy-modellen är för stor för spelbordet.", 502);
    }
    const bytes = await boundedBody(response, PLAYER_AVATAR_MAX_MODEL_BYTES);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    validateSelfContainedGlb(buffer, PLAYER_AVATAR_MAX_MODEL_BYTES);
    return buffer;
  }

  private async createTask(path: string, payload: Record<string, unknown>): Promise<string> {
    const body = await this.requestJson(path, {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const taskId = objectString(body, "result");
    if (!taskId || !UUID_PATTERN.test(taskId)) throw new MeshyApiError("Meshy returnerade inget giltigt jobb-id.", 502);
    return taskId;
  }

  private async getTask(
    path: string,
    taskId: string,
    output: (body: Record<string, unknown>) => string | null,
  ): Promise<MeshyTaskResult> {
    assertTaskId(taskId);
    const body = await this.requestJson(`${path}/${taskId}`);
    const id = objectString(body, "id");
    const status = objectString(body, "status");
    if (id !== taskId || !isTaskStatus(status)) throw new MeshyApiError("Meshy returnerade ett ogiltigt jobbsvar.", 502);
    const rawProgress = objectNumber(body, "progress");
    const taskError = objectRecord(body, "task_error");
    return {
      error: taskError ? objectString(taskError, "message") : null,
      id,
      outputUrl: output(body),
      progress: rawProgress === null ? 0 : Math.max(0, Math.min(100, Math.round(rawProgress))),
      status,
    };
  }

  private async deleteTask(path: string, taskId: string): Promise<void> {
    assertTaskId(taskId);
    const response = await this.fetcher(`${MESHY_BASE_URL}${path}/${taskId}`, {
      headers: this.headers(),
      method: "DELETE",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok && response.status !== 404) throw await apiError(response);
  }

  private async requestJson(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`${MESHY_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: { ...this.headers(), ...init.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw await apiError(response);
    const body: unknown = await response.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new MeshyApiError("Meshy returnerade ett ogiltigt svar.", 502);
    }
    return body as Record<string, unknown>;
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.apiKey}` };
  }
}

async function boundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new MeshyApiError("Meshy-filen saknar innehåll.", 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new MeshyApiError("Meshy-modellen är för stor för spelbordet.", 502);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function validatedAssetUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MeshyApiError("Meshy returnerade en ogiltig fil-URL.", 502);
  }
  if (url.protocol !== "https:" || url.hostname !== MESHY_ASSET_HOST || url.port || url.username || url.password) {
    throw new MeshyApiError("Meshy returnerade en otillåten fil-URL.", 502);
  }
  return url.toString();
}

async function apiError(response: Response): Promise<MeshyApiError> {
  const body: unknown = await response.json().catch(() => null);
  const message = body && typeof body === "object" && !Array.isArray(body)
    ? objectString(body as Record<string, unknown>, "message")
    : null;
  return new MeshyApiError(message || `Meshy-anropet misslyckades (${response.status}).`, response.status);
}

function assertTaskId(taskId: string): void {
  if (!UUID_PATTERN.test(taskId)) throw new Error("Meshy-jobbets id är ogiltigt.");
}

function isTaskStatus(value: string | null): value is MeshyTaskStatus {
  return value === "PENDING" || value === "IN_PROGRESS" || value === "SUCCEEDED" || value === "FAILED" || value === "CANCELED";
}

function objectRecord(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const candidate = value[key];
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
}

function objectString(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

function objectNumber(value: Record<string, unknown>, key: string): number | null {
  return typeof value[key] === "number" && Number.isFinite(value[key]) ? value[key] : null;
}
