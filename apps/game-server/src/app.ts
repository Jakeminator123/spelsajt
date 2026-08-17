import { blackjackRuleset, europeanRouletteRuleset } from "@spelsajt/game-core";
import cors from "@fastify/cors";
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  void app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
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

  return app;
}
