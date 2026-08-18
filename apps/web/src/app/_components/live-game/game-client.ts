import {
  commandAckV2Schema,
  gameCommandV2Schema,
  gameEventV2Schema,
  gameSnapshotV2Schema,
  serverReadyV2Schema,
  tableSubscriptionAckV2Schema,
  type CommandAckV2,
  type GameCommandV2,
  type GameEventV2,
  type GameSnapshotV2,
  type ServerReadyV2,
  type TableSubscriptionAckV2,
} from "@spelsajt/contracts";
import { io, type Socket } from "socket.io-client";

export class GameApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "GameApiError";
  }
}

interface ApiRequest {
  readonly accessToken: string;
  readonly gameServerUrl: string;
  readonly tableId: string;
}

interface CommandRequest extends ApiRequest {
  readonly command: GameCommandV2;
  readonly fetchImplementation?: typeof fetch;
}

interface SnapshotRequest extends ApiRequest {
  readonly fetchImplementation?: typeof fetch;
}

export async function sendGameCommand(request: CommandRequest): Promise<CommandAckV2> {
  const command = gameCommandV2Schema.parse(request.command);
  const response = await (request.fetchImplementation ?? fetch)(
    tableEndpoint(request.gameServerUrl, request.tableId, "commands"),
    {
      body: JSON.stringify(command),
      headers: {
        authorization: `Bearer ${request.accessToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  const payload = await jsonPayload(response);
  const parsed = commandAckV2Schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  throw new GameApiError(apiErrorMessage(response.status, payload), response.status);
}

export async function getGameSnapshot(
  request: SnapshotRequest,
): Promise<GameSnapshotV2 | null> {
  const response = await (request.fetchImplementation ?? fetch)(
    tableEndpoint(request.gameServerUrl, request.tableId, "snapshot"),
    {
      headers: { authorization: `Bearer ${request.accessToken}` },
      method: "GET",
    },
  );
  const payload = await jsonPayload(response);
  if (response.status === 404 && isErrorPayload(payload, "TABLE_NOT_FOUND")) return null;
  const parsed = gameSnapshotV2Schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  throw new GameApiError(apiErrorMessage(response.status, payload), response.status);
}

export type RealtimeStatus =
  | "connecting"
  | "connected"
  | "subscribing"
  | "live"
  | "reconnecting"
  | "error"
  | "closed";

interface ServerToClientEvents {
  "game.event": (event: unknown) => void;
  "server.ready": (payload: unknown) => void;
  "table.snapshot": (snapshot: unknown) => void;
}

interface ClientToServerEvents {
  "table.subscribe": (
    input: unknown,
    acknowledge: (acknowledgement: unknown) => void,
  ) => void;
}

export interface GameRealtimeCallbacks {
  readonly onError: (message: string) => void;
  readonly onEvent: (event: GameEventV2) => void;
  readonly onReady?: (ready: ServerReadyV2) => void;
  readonly onSnapshot: (snapshot: GameSnapshotV2) => void;
  readonly onStatus: (status: RealtimeStatus) => void;
  readonly onSubscription?: (acknowledgement: TableSubscriptionAckV2) => void;
}

export interface GameRealtimeConnection {
  close(): void;
  refreshAccessToken(accessToken: string): void;
  subscribe(tableId: string, lastSequence: number): void;
}

export function connectGameRealtime(
  gameServerUrl: string,
  accessToken: string,
  callbacks: GameRealtimeCallbacks,
): GameRealtimeConnection {
  let active = true;
  let subscription: { lastSequence: number; tableId: string } | null = null;
  let serverReady = false;
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
    normalizedBaseUrl(gameServerUrl),
    {
      auth: { accessToken, schemaVersion: 2 },
      autoConnect: false,
      reconnection: true,
      transports: ["websocket"],
    },
  );

  const subscribe = () => {
    if (!serverReady || !subscription || !socket.connected) return;
    callbacks.onStatus("subscribing");
    socket.emit("table.subscribe", {
      lastSequence: subscription.lastSequence,
      schemaVersion: 2,
      tableId: subscription.tableId,
    }, (rawAcknowledgement) => {
      const parsed = tableSubscriptionAckV2Schema.safeParse(rawAcknowledgement);
      if (!parsed.success) {
        callbacks.onStatus("error");
        callbacks.onError("Spelservern svarade med en ogiltig prenumerationsbekräftelse.");
        return;
      }
      callbacks.onSubscription?.(parsed.data);
      if (parsed.data.status === "rejected") {
        callbacks.onStatus("error");
        callbacks.onError(parsed.data.error.detail ?? parsed.data.error.code);
        return;
      }
      callbacks.onStatus("live");
    });
  };

  socket.on("connect", () => {
    serverReady = false;
    callbacks.onStatus("connected");
  });
  socket.on("server.ready", (rawReady) => {
    const parsed = serverReadyV2Schema.safeParse(rawReady);
    if (!parsed.success) {
      callbacks.onStatus("error");
      callbacks.onError("Spelservern skickade ett ogiltigt ready-event.");
      return;
    }
    serverReady = true;
    callbacks.onReady?.(parsed.data);
    subscribe();
  });
  socket.on("table.snapshot", (rawSnapshot) => {
    const parsed = gameSnapshotV2Schema.safeParse(rawSnapshot);
    if (!parsed.success) {
      callbacks.onError("Spelservern skickade ett ogiltigt snapshot.");
      return;
    }
    callbacks.onSnapshot(parsed.data);
  });
  socket.on("game.event", (rawEvent) => {
    const parsed = gameEventV2Schema.safeParse(rawEvent);
    if (!parsed.success) {
      callbacks.onError("Spelservern skickade ett ogiltigt game-event.");
      return;
    }
    callbacks.onEvent(parsed.data);
  });
  socket.on("connect_error", (error) => {
    callbacks.onStatus("error");
    callbacks.onError(realtimeErrorMessage(error.message));
  });
  socket.on("disconnect", (reason) => {
    serverReady = false;
    if (!active) return;
    callbacks.onStatus(reason === "io client disconnect" ? "closed" : "reconnecting");
  });

  callbacks.onStatus("connecting");
  socket.connect();

  return {
    close() {
      active = false;
      serverReady = false;
      callbacks.onStatus("closed");
      socket.removeAllListeners();
      socket.disconnect();
    },
    refreshAccessToken(nextAccessToken) {
      socket.auth = { accessToken: nextAccessToken, schemaVersion: 2 };
      serverReady = false;
      if (socket.connected) socket.disconnect();
      callbacks.onStatus("reconnecting");
      socket.connect();
    },
    subscribe(tableId, lastSequence) {
      subscription = { lastSequence, tableId };
      subscribe();
    },
  };
}

function tableEndpoint(baseUrl: string, tableId: string, resource: string): string {
  return `${normalizedBaseUrl(baseUrl)}/v2/tables/${encodeURIComponent(tableId)}/${resource}`;
}

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function jsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new GameApiError(
      `Spelservern svarade inte med JSON (HTTP ${response.status}).`,
      response.status,
    );
  }
}

function isErrorPayload(payload: unknown, code: string): boolean {
  return typeof payload === "object"
    && payload !== null
    && "error" in payload
    && payload.error === code;
}

function apiErrorMessage(status: number, payload: unknown): string {
  if (status === 401) return "Gästsessionen accepterades inte av spelservern.";
  if (status === 503) return "Spelservern är inte redo ännu.";
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = payload.error;
    if (typeof error === "string") return error;
  }
  return `Oväntat svar från spelservern (HTTP ${status}).`;
}

function realtimeErrorMessage(message: string): string {
  if (message === "UNAUTHENTICATED") return "Liveanslutningen saknar en giltig gästsession.";
  if (message === "SERVER_UNAVAILABLE") return "Liveleveransen är tillfälligt otillgänglig.";
  return `Liveanslutningen misslyckades: ${message}`;
}
