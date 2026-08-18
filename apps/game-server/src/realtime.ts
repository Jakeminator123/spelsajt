import {
  gameEventV2Schema,
  gameSnapshotV2Schema,
  serverReadyV2Schema,
  socketAuthV2Schema,
  tableSubscriptionAckV2Schema,
  tableSubscriptionV2Schema,
  type GameEventV2,
  type GameSnapshotV2,
  type ServerReadyV2,
  type TableSubscriptionAckV2,
} from "@spelsajt/contracts";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";

import { TableOwnershipError } from "./repository";

interface ClientToServerEvents {
  "table.subscribe": (
    input: unknown,
    acknowledge: (ack: TableSubscriptionAckV2) => void,
  ) => void;
}

interface ServerToClientEvents {
  "game.event": (event: GameEventV2) => void;
  "server.ready": (payload: ServerReadyV2) => void;
  "table.snapshot": (snapshot: GameSnapshotV2) => void;
}

interface SocketData {
  accessToken: string;
  userId: string;
}

export interface RealtimeOptions {
  readonly authRevalidationIntervalMs?: number;
}

export type GameRealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export function attachRealtime(
  app: FastifyInstance,
  options: RealtimeOptions = {},
): GameRealtimeServer {
  const allowedOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const { application, authVerifier, eventBus } = app.gameServices;
  const authRevalidationIntervalMs = options.authRevalidationIntervalMs ?? 60_000;
  if (!Number.isSafeInteger(authRevalidationIntervalMs) || authRevalidationIntervalMs <= 0) {
    throw new Error("authRevalidationIntervalMs must be a positive safe integer.");
  }
  const io: GameRealtimeServer = new Server(app.server, {
    cors: { origin: allowedOrigin },
    transports: ["websocket"],
  });

  const stopObservingReadiness = eventBus.onReadinessChange?.((ready) => {
    if (ready) return;
    app.log.error("Committed-event relay unavailable; disconnecting realtime clients");
    io.disconnectSockets(true);
  });
  app.addHook("onClose", async () => {
    stopObservingReadiness?.();
  });

  io.use(async (socket, next) => {
    if (eventBus.isReady?.() === false) return next(new Error("SERVER_UNAVAILABLE"));
    const auth = socketAuthV2Schema.safeParse(socket.handshake.auth);
    if (!auth.success) return next(new Error("UNAUTHENTICATED"));
    try {
      const userId = await authVerifier.verify(auth.data.accessToken);
      if (!userId) return next(new Error("UNAUTHENTICATED"));
      socket.data.accessToken = auth.data.accessToken;
      socket.data.userId = userId;
      return next();
    } catch {
      return next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    let unsubscribe: (() => void) | null = null;
    let authRevalidationTimer: NodeJS.Timeout | null = null;
    let disconnected = false;
    const scheduleAuthRevalidation = () => {
      authRevalidationTimer = setTimeout(async () => {
        try {
          const userId = await authVerifier.verify(socket.data.accessToken);
          if (userId !== socket.data.userId) {
            socket.disconnect(true);
            return;
          }
        } catch {
          socket.disconnect(true);
          return;
        }
        if (!disconnected && socket.connected) scheduleAuthRevalidation();
      }, authRevalidationIntervalMs);
      authRevalidationTimer.unref();
    };
    scheduleAuthRevalidation();
    socket.emit("server.ready", serverReadyV2Schema.parse({
      connectionId: socket.id,
      schemaVersion: 2,
      timestamp: new Date().toISOString(),
    }));

    socket.on("table.subscribe", async (input, acknowledge) => {
      if (typeof acknowledge !== "function") return;
      const parsed = tableSubscriptionV2Schema.safeParse(input);
      if (!parsed.success) {
        acknowledge(rejectedSubscription(
          "VALIDATION_ERROR",
          parsed.error.issues[0]?.message ?? "Subscription payload is invalid.",
        ));
        return;
      }

      unsubscribe?.();
      unsubscribe = null;
      const { lastSequence, tableId } = parsed.data;
      const buffered: GameEventV2[] = [];
      let active = true;
      let deliveredSequence = 0;
      let delivery = Promise.resolve();
      let live = false;
      const emitThrough = async (targetSequence: number): Promise<void> => {
        if (!active || targetSequence <= deliveredSequence) return;
        while (active && socket.connected && deliveredSequence < targetSequence) {
          const events = await application.getEvents(
            socket.data.userId,
            tableId,
            deliveredSequence + 1,
            targetSequence,
          );
          for (const candidate of events.toSorted((left, right) => left.sequence - right.sequence)) {
            if (!active || !socket.connected) return;
            const event = gameEventV2Schema.parse(candidate);
            if (event.sequence <= deliveredSequence) continue;
            if (event.sequence !== deliveredSequence + 1) {
              throw new Error(
                `Authoritative event sequence jumped from ${deliveredSequence} to ${event.sequence}.`,
              );
            }
            socket.emit("game.event", event);
            deliveredSequence = event.sequence;
          }
          if (events.length === 0) {
            throw new Error(
              `Authoritative events stop at ${deliveredSequence}; expected ${targetSequence}.`,
            );
          }
        }
      };
      const detach = eventBus.subscribe(tableId, (events) => {
        if (!live) {
          buffered.push(...events);
          return;
        }
        const targetSequence = events.reduce(
          (highest, event) => Math.max(highest, event.sequence),
          deliveredSequence,
        );
        delivery = delivery
          .then(() => emitThrough(targetSequence))
          .catch((error: unknown) => {
            app.log.error({ err: error, tableId }, "Realtime event gap repair failed");
          });
      });
      const stop = () => {
        active = false;
        detach();
      };
      unsubscribe = stop;

      try {
        const snapshot = await application.getSnapshot(socket.data.userId, tableId);
        if (!snapshot) {
          stop();
          if (unsubscribe === stop) unsubscribe = null;
          acknowledge(rejectedSubscription("TABLE_NOT_FOUND", "The table does not exist."));
          return;
        }
        if (lastSequence > snapshot.lastSequence) {
          stop();
          if (unsubscribe === stop) unsubscribe = null;
          acknowledge(rejectedSubscription(
            "VALIDATION_ERROR",
            "lastSequence cannot be ahead of the authoritative table.",
          ));
          return;
        }
        if (unsubscribe !== stop) {
          acknowledge(rejectedSubscription("VALIDATION_ERROR", "Subscription was superseded."));
          return;
        }

        const validatedSnapshot = gameSnapshotV2Schema.parse(snapshot);
        socket.emit("table.snapshot", validatedSnapshot);
        deliveredSequence = validatedSnapshot.lastSequence;
        while (buffered.length > 0) {
          const pending = buffered.splice(0);
          const targetSequence = pending.reduce(
            (highest, event) => Math.max(highest, event.sequence),
            deliveredSequence,
          );
          await emitThrough(targetSequence);
        }
        live = true;
        acknowledge(tableSubscriptionAckV2Schema.parse({
          lastSequence: validatedSnapshot.lastSequence,
          schemaVersion: 2,
          status: "accepted",
          tableId,
        }));
      } catch (error) {
        stop();
        if (unsubscribe === stop) unsubscribe = null;
        if (error instanceof TableOwnershipError) {
          acknowledge(rejectedSubscription("TABLE_NOT_FOUND", "The table does not exist."));
          return;
        }
        app.log.error({ err: error, tableId }, "Realtime table subscription failed");
        acknowledge(rejectedSubscription("INTERNAL_ERROR", "The subscription could not be completed."));
      }
    });

    socket.on("disconnect", () => {
      disconnected = true;
      if (authRevalidationTimer) clearTimeout(authRevalidationTimer);
      authRevalidationTimer = null;
      socket.data.accessToken = "";
      unsubscribe?.();
      unsubscribe = null;
    });
  });

  return io;
}

function rejectedSubscription(
  code: "VALIDATION_ERROR" | "TABLE_NOT_FOUND" | "INTERNAL_ERROR",
  detail: string,
): TableSubscriptionAckV2 {
  return tableSubscriptionAckV2Schema.parse({
    error: { code, detail: detail.slice(0, 256) },
    schemaVersion: 2,
    status: "rejected",
  });
}
