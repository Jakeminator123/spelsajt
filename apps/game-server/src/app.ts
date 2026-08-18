import { blackjackRuleset, europeanRouletteRuleset } from "@spelsajt/game-core";
import cors from "@fastify/cors";
import Fastify from "fastify";

import { GameApplication, type GameApplicationOptions } from "./application";
import { bearerToken, rejectAllAuthVerifier, type AuthVerifier } from "./auth";
import { GameEventBus } from "./event-bus";
import { InMemoryGameRepository } from "./in-memory-repository";
import { TableOwnershipError, type GameRepository } from "./repository";

export interface BuildAppOptions extends GameApplicationOptions {
  readonly authVerifier?: AuthVerifier;
  readonly eventBus?: GameEventBus;
  readonly repository?: GameRepository;
}

export interface GameServerServices {
  readonly application: GameApplication;
  readonly authVerifier: AuthVerifier;
  readonly eventBus: GameEventBus;
  readonly repository: GameRepository;
}

declare module "fastify" {
  interface FastifyInstance {
    gameServices: GameServerServices;
  }
}

function commandStatusCode(code: string): number {
  switch (code) {
    case "VALIDATION_ERROR":
      return 400;
    case "ROUND_NOT_FOUND":
      return 404;
    case "STALE_REVISION":
    case "IDEMPOTENCY_CONFLICT":
    case "ILLEGAL_ACTION":
    case "INSUFFICIENT_FUNDS":
      return 409;
    default:
      return 500;
  }
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  void app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  });

  const repository: GameRepository = options.repository ?? new InMemoryGameRepository();
  const authVerifier = options.authVerifier ?? rejectAllAuthVerifier;
  const eventBus = options.eventBus ?? new GameEventBus();
  const application = new GameApplication(repository, options);
  app.decorate("gameServices", { application, authVerifier, eventBus, repository });

  app.addHook("onClose", async () => {
    await repository.close?.();
  });

  app.get("/health", async () => ({
    service: "game-server",
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  app.get("/v1/status", async () => ({
    games: {
      blackjack: blackjackRuleset,
      roulette: europeanRouletteRuleset,
    },
    mode: "play-money",
    service: "game-server",
    transport: ["http", "websocket"],
    version: "0.1.0",
  }));

  app.post<{ Params: { tableId: string } }>(
    "/v2/tables/:tableId/commands",
    async (request, reply) => {
      const token = bearerToken(request.headers.authorization);
      const userId = token ? await authVerifier.verify(token) : null;
      if (!userId) {
        return reply.code(401).send({ error: "UNAUTHENTICATED" });
      }
      try {
        const ack = await application.execute(userId, request.params.tableId, request.body);
        if (ack.status === "accepted" && ack.firstSequence !== null) {
          try {
            const events = await application.getEvents(
              userId,
              request.params.tableId,
              ack.firstSequence,
              ack.lastSequence,
            );
            eventBus.publish(events);
          } catch (error) {
            request.log.error(
              { err: error, tableId: request.params.tableId },
              "Committed game events could not be published live",
            );
          }
        }
        if (ack.status === "rejected") {
          return reply.code(commandStatusCode(ack.error.code)).send(ack);
        }
        return reply.code(200).send(ack);
      } catch (error) {
        if (error instanceof TableOwnershipError) {
          return reply.code(404).send({ error: "TABLE_NOT_FOUND" });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { tableId: string } }>(
    "/v2/tables/:tableId/snapshot",
    async (request, reply) => {
      const token = bearerToken(request.headers.authorization);
      const userId = token ? await authVerifier.verify(token) : null;
      if (!userId) {
        return reply.code(401).send({ error: "UNAUTHENTICATED" });
      }
      try {
        const snapshot = await application.getSnapshot(userId, request.params.tableId);
        if (!snapshot) {
          return reply.code(404).send({ error: "TABLE_NOT_FOUND" });
        }
        return reply.code(200).send(snapshot);
      } catch (error) {
        if (error instanceof TableOwnershipError) {
          return reply.code(404).send({ error: "TABLE_NOT_FOUND" });
        }
        throw error;
      }
    },
  );

  return app;
}
