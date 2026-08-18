import { blackjackRuleset, europeanRouletteRuleset } from "@spelsajt/game-core";
import cors from "@fastify/cors";
import Fastify from "fastify";

import { GameApplication, type GameApplicationOptions } from "./application";
import { InMemoryGameRepository } from "./in-memory-repository";
import type { GameRepository } from "./repository";

export interface BuildAppOptions extends GameApplicationOptions {
  readonly repository?: GameRepository;
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

  const repository = options.repository ?? new InMemoryGameRepository();
  const application = new GameApplication(repository, options);

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
      const ack = await application.execute(request.params.tableId, request.body);
      if (ack.status === "rejected") {
        return reply.code(commandStatusCode(ack.error.code)).send(ack);
      }
      return reply.code(200).send(ack);
    },
  );

  app.get<{ Params: { tableId: string } }>(
    "/v2/tables/:tableId/snapshot",
    async (request, reply) => {
      const snapshot = await application.getSnapshot(request.params.tableId);
      if (!snapshot) {
        return reply.code(404).send({ error: "TABLE_NOT_FOUND" });
      }
      return reply.code(200).send(snapshot);
    },
  );

  return app;
}
