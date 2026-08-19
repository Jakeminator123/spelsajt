import { describe, expect, it, vi } from "vitest";

import {
  accountOutcomeShares,
  accountOutcomeLabel,
  accountWinRate,
  fetchAccountSummary,
  formatPlayAmount,
} from "./account-summary";

const summary = {
  balance: "10330",
  currency: "PLAY",
  games: [
    {
      game: "blackjack",
      lostRounds: 0,
      mixedRounds: 0,
      net: "0",
      pushedRounds: 0,
      returned: "0",
      rounds: 0,
      wagered: "0",
      wonRounds: 0,
    },
    {
      game: "roulette",
      lostRounds: 0,
      mixedRounds: 1,
      net: "330",
      pushedRounds: 0,
      returned: "360",
      rounds: 1,
      wagered: "30",
      wonRounds: 0,
    },
  ],
  recentRounds: [],
  schemaVersion: 2,
  totals: {
    lostRounds: 0,
    mixedRounds: 1,
    net: "330",
    pushedRounds: 0,
    returned: "360",
    rounds: 1,
    wagered: "30",
    wonRounds: 0,
  },
} as const;

describe("account summary client", () => {
  it("authenticates and validates the server response", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(summary), { status: 200 }));

    await expect(fetchAccountSummary(
      "https://game.example/",
      "access-token",
      undefined,
      fetcher as typeof fetch,
    )).resolves.toEqual(summary);
    expect(fetcher).toHaveBeenCalledWith(
      "https://game.example/v2/account/summary",
      expect.objectContaining({
        headers: { authorization: "Bearer access-token" },
        method: "GET",
      }),
    );
  });

  it("rejects malformed summaries instead of rendering guessed values", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ...summary, balance: 10330 }), {
      status: 200,
    }));

    await expect(fetchAccountSummary(
      "https://game.example",
      "access-token",
      undefined,
      fetcher as typeof fetch,
    )).rejects.toThrow();
  });

  it("formats integer PLAY amounts and outcome labels", () => {
    expect(formatPlayAmount("10330")).toContain("10");
    expect(formatPlayAmount("330", true).startsWith("+")).toBe(true);
    expect(formatPlayAmount("-30", true)).toContain("-30");
    expect(accountOutcomeLabel("mixed")).toBe("Blandat");
  });

  it("derives presentation metrics from the authoritative round totals", () => {
    const totals = {
      lostRounds: 2,
      mixedRounds: 1,
      net: "125",
      pushedRounds: 1,
      returned: "925",
      rounds: 10,
      wagered: "800",
      wonRounds: 6,
    };

    expect(accountWinRate(totals)).toBe(60);
    expect(accountOutcomeShares(totals)).toEqual([
      { label: "Vinst", outcome: "win", percentage: 60, rounds: 6 },
      { label: "Förlust", outcome: "loss", percentage: 20, rounds: 2 },
      { label: "Oavgjort", outcome: "push", percentage: 10, rounds: 1 },
      { label: "Blandat", outcome: "mixed", percentage: 10, rounds: 1 },
    ]);
  });

  it("keeps empty-account percentages finite and explicit", () => {
    const totals = {
      lostRounds: 0,
      mixedRounds: 0,
      net: "0",
      pushedRounds: 0,
      returned: "0",
      rounds: 0,
      wagered: "0",
      wonRounds: 0,
    };

    expect(accountWinRate(totals)).toBe(0);
    expect(accountOutcomeShares(totals).every((share) => share.percentage === 0)).toBe(true);
  });
});
