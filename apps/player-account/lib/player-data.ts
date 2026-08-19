// Presentation-only example data. These values are never sent to the game server and must
// be replaced by an authenticated account-summary contract before the dashboard is labelled live.

export type GameType = "Blackjack" | "Roulette";
export type GameResult = "win" | "loss" | "push" | "mixed";

export interface GameRoundPreview {
  readonly bet: number;
  readonly date: string;
  readonly game: GameType;
  readonly payout: number;
  readonly result: GameResult;
  readonly sequence: number;
  readonly tableId: string;
  readonly verified: boolean;
}

export interface GameTypePreview {
  readonly game: GameType;
  readonly netCredits: number;
  readonly rounds: number;
  readonly wageredCredits: number;
  readonly wins: number;
}

export const playerPreview = {
  credits: 48_250,
  creditsChange: 3_120,
  level: 27,
  memberSince: "Mars 2024",
  rank: "Guld III",
  xp: 6_420,
  xpToNextLevel: 8_000,
} as const;

export const gameHistoryPreview: readonly GameRoundPreview[] = [
  { sequence: 1284, tableId: "bj-07", game: "Blackjack", bet: 500, payout: 1000, result: "win", verified: true, date: "19 aug 21:42" },
  { sequence: 1283, tableId: "rl-02", game: "Roulette", bet: 250, payout: 0, result: "loss", verified: true, date: "19 aug 21:30" },
  { sequence: 1282, tableId: "bj-07", game: "Blackjack", bet: 300, payout: 300, result: "push", verified: true, date: "19 aug 20:58" },
  { sequence: 1281, tableId: "bj-07", game: "Blackjack", bet: 600, payout: 900, result: "mixed", verified: true, date: "19 aug 20:40" },
  { sequence: 1280, tableId: "rl-02", game: "Roulette", bet: 400, payout: 1400, result: "win", verified: true, date: "19 aug 20:12" },
];

export const gameTypePreview: readonly GameTypePreview[] = [
  { game: "Blackjack", rounds: 842, wins: 401, wageredCredits: 312_400, netCredits: 14_850 },
  { game: "Roulette", rounds: 486, wins: 198, wageredCredits: 176_200, netCredits: -6_320 },
];

export const weeklyActivityPreview = [
  { day: "Mån", rounds: 42 },
  { day: "Tis", rounds: 68 },
  { day: "Ons", rounds: 51 },
  { day: "Tor", rounds: 95 },
  { day: "Fre", rounds: 120 },
  { day: "Lör", rounds: 168 },
  { day: "Sön", rounds: 134 },
] as const;

export const totalGamesPreview = gameTypePreview.reduce((sum, game) => sum + game.rounds, 0);
const totalWinsPreview = gameTypePreview.reduce((sum, game) => sum + game.wins, 0);
const totalWageredPreview = gameTypePreview.reduce((sum, game) => sum + game.wageredCredits, 0);
export const winRatePreview = Math.round((totalWinsPreview / totalGamesPreview) * 100);
export const averageBetPreview = Math.round(totalWageredPreview / totalGamesPreview);
export const netCreditsPreview = gameTypePreview.reduce((sum, game) => sum + game.netCredits, 0);
export const verifiedRatePreview = Math.round(
  (gameHistoryPreview.filter((round) => round.verified).length / gameHistoryPreview.length) * 100,
);
