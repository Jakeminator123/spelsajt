// Datamodellen speglar spelsajtens v2 command/event-arkitektur (se /system):
// - Rundor committas i en privat Postgres PLAY-ledger (play-money).
// - Varje round.settled har ett utfall: win | loss | push | mixed.
//   "mixed" uppstår när delade blackjack-händer får olika resultat.
// - Fairness verifieras via commit/reveal i webbklienten efter settlement.

export type GameType = "Blackjack" | "Roulette"
export type GameResult = "win" | "loss" | "push" | "mixed"

export interface GameRound {
  /** Sekvensnummer i eventströmmen (stigande per bord) */
  seq: number
  /** Bord-id som rundan spelades vid */
  tableId: string
  game: GameType
  bet: number
  payout: number
  result: GameResult
  /** Fairness-commitment verifierad lokalt efter settlement */
  verified: boolean
  date: string
  level: number
}

export interface PlayerProfile {
  username: string
  memberSince: string
  rank: string
  level: number
  xp: number
  xpToNextLevel: number
  /** Play-money-saldo i ledgern */
  credits: number
  creditsChange: number
}

export const player: PlayerProfile = {
  username: "Alex Karlsson",
  memberSince: "Mars 2024",
  rank: "Guld III",
  level: 27,
  xp: 6420,
  xpToNextLevel: 8000,
  credits: 48250,
  creditsChange: 3120,
}

export const gameHistory: GameRound[] = [
  { seq: 1284, tableId: "bj-07", game: "Blackjack", bet: 500, payout: 1000, result: "win", verified: true, date: "2026-08-19 21:42", level: 27 },
  { seq: 1283, tableId: "rl-02", game: "Roulette", bet: 250, payout: 0, result: "loss", verified: true, date: "2026-08-19 21:30", level: 27 },
  { seq: 1282, tableId: "bj-07", game: "Blackjack", bet: 300, payout: 300, result: "push", verified: true, date: "2026-08-19 20:58", level: 27 },
  { seq: 1281, tableId: "bj-07", game: "Blackjack", bet: 600, payout: 900, result: "mixed", verified: true, date: "2026-08-19 20:40", level: 27 },
  { seq: 1280, tableId: "rl-02", game: "Roulette", bet: 400, payout: 1400, result: "win", verified: true, date: "2026-08-19 20:12", level: 26 },
  { seq: 1279, tableId: "bj-03", game: "Blackjack", bet: 750, payout: 0, result: "loss", verified: true, date: "2026-08-18 23:05", level: 26 },
  { seq: 1278, tableId: "rl-02", game: "Roulette", bet: 200, payout: 700, result: "win", verified: true, date: "2026-08-18 22:47", level: 26 },
  { seq: 1277, tableId: "bj-03", game: "Blackjack", bet: 1000, payout: 2500, result: "win", verified: true, date: "2026-08-18 22:10", level: 26 },
  { seq: 1276, tableId: "rl-05", game: "Roulette", bet: 350, payout: 0, result: "loss", verified: false, date: "2026-08-17 19:33", level: 25 },
]

export interface GameTypeStats {
  game: GameType
  rounds: number
  wins: number
  wagered: number
  netProfit: number
}

export const gameTypeStats: GameTypeStats[] = [
  { game: "Blackjack", rounds: 842, wins: 401, wagered: 312400, netProfit: 14850 },
  { game: "Roulette", rounds: 486, wins: 198, wagered: 176200, netProfit: -6320 },
]

// Aggregerad statistik härledd från mock-historik/typstatistik
export const totalGamesPlayed = gameTypeStats.reduce((sum, g) => sum + g.rounds, 0)
export const totalWins = gameTypeStats.reduce((sum, g) => sum + g.wins, 0)
export const totalWagered = gameTypeStats.reduce((sum, g) => sum + g.wagered, 0)
export const winRate = Math.round((totalWins / totalGamesPlayed) * 100)
export const avgBet = Math.round(totalWagered / totalGamesPlayed)
export const netProfit = gameTypeStats.reduce((sum, g) => sum + g.netProfit, 0)
// Andel rundor med lokalt verifierad fairness-commitment
export const verifiedRate = Math.round(
  (gameHistory.filter((r) => r.verified).length / gameHistory.length) * 100,
)

// Veckoaktivitet (rundor per dag)
export const weeklyActivity = [
  { day: "Mån", rounds: 42 },
  { day: "Tis", rounds: 68 },
  { day: "Ons", rounds: 51 },
  { day: "Tor", rounds: 95 },
  { day: "Fre", rounds: 120 },
  { day: "Lör", rounds: 168 },
  { day: "Sön", rounds: 134 },
]
