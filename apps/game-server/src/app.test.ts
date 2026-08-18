import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app";

const openApps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("game server", () => {
  it("reports a healthy play-money service", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: "game-server",
      status: "ok",
    });
  });

  it("publishes the frozen MVP rulesets", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/v1/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      games: {
        blackjack: { decks: 6, rulesetId: "mvp-v2" },
        roulette: { pockets: 37, rulesetId: "mvp-v2" },
      },
      mode: "play-money",
    });
  });
});
