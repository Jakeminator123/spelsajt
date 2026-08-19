import {
  accountSummaryV2Schema,
  type AccountGameSummaryV2,
  type AccountRecentRoundV2,
  type AccountRoundOutcomeV2,
  type AccountSummaryV2,
} from "@spelsajt/contracts";

export interface SettledAccountRound {
  readonly game: "blackjack" | "roulette";
  readonly outcome: AccountRoundOutcomeV2;
  readonly payout: string;
  readonly roundId: string;
  readonly settledAt: string;
  readonly wager: string;
}

export interface AccountGameAggregate {
  readonly game: "blackjack" | "roulette";
  readonly lostRounds: number;
  readonly mixedRounds: number;
  readonly pushedRounds: number;
  readonly returned: string;
  readonly rounds: number;
  readonly wagered: string;
  readonly wonRounds: number;
}

const games = ["blackjack", "roulette"] as const;

function emptyAggregate(game: (typeof games)[number]): AccountGameAggregate {
  return {
    game,
    lostRounds: 0,
    mixedRounds: 0,
    pushedRounds: 0,
    returned: "0",
    rounds: 0,
    wagered: "0",
    wonRounds: 0,
  };
}

function withNet(aggregate: AccountGameAggregate): AccountGameSummaryV2 {
  return {
    ...aggregate,
    net: (BigInt(aggregate.returned) - BigInt(aggregate.wagered)).toString(),
  };
}

export function assembleAccountSummary(
  balance: number,
  aggregates: readonly AccountGameAggregate[],
  recentRounds: readonly AccountRecentRoundV2[],
): AccountSummaryV2 {
  const byGame = new Map(aggregates.map((aggregate) => [aggregate.game, aggregate]));
  const gameSummaries = games.map((game) => withNet(byGame.get(game) ?? emptyAggregate(game)));
  const totals = gameSummaries.reduce(
    (summary, game) => ({
      lostRounds: summary.lostRounds + game.lostRounds,
      mixedRounds: summary.mixedRounds + game.mixedRounds,
      net: (BigInt(summary.net) + BigInt(game.net)).toString(),
      pushedRounds: summary.pushedRounds + game.pushedRounds,
      returned: (BigInt(summary.returned) + BigInt(game.returned)).toString(),
      rounds: summary.rounds + game.rounds,
      wagered: (BigInt(summary.wagered) + BigInt(game.wagered)).toString(),
      wonRounds: summary.wonRounds + game.wonRounds,
    }),
    {
      lostRounds: 0,
      mixedRounds: 0,
      net: "0",
      pushedRounds: 0,
      returned: "0",
      rounds: 0,
      wagered: "0",
      wonRounds: 0,
    },
  );

  return accountSummaryV2Schema.parse({
    balance: String(balance),
    currency: "PLAY",
    games: gameSummaries,
    recentRounds: recentRounds.slice(0, 20),
    schemaVersion: 2,
    totals,
  });
}

export function summarizeAccountRounds(
  balance: number,
  rounds: readonly SettledAccountRound[],
): AccountSummaryV2 {
  const aggregates = games.map((game) => {
    const matching = rounds.filter((round) => round.game === game);
    return {
      game,
      lostRounds: matching.filter((round) => round.outcome === "loss").length,
      mixedRounds: matching.filter((round) => round.outcome === "mixed").length,
      pushedRounds: matching.filter((round) => round.outcome === "push").length,
      returned: matching.reduce(
        (total, round) => total + BigInt(round.payout),
        0n,
      ).toString(),
      rounds: matching.length,
      wagered: matching.reduce(
        (total, round) => total + BigInt(round.wager),
        0n,
      ).toString(),
      wonRounds: matching.filter((round) => round.outcome === "win").length,
    };
  });
  const recent = [...rounds]
    .sort((left, right) => right.settledAt.localeCompare(left.settledAt))
    .slice(0, 20);
  return assembleAccountSummary(balance, aggregates, recent);
}
