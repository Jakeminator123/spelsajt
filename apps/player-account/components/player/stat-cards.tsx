import { Card, CardContent } from "@/components/ui/card"
import { Coins, Dices, Target, TrendingUp, TrendingDown } from "lucide-react"
import {
  totalGamesPlayed,
  winRate,
  avgBet,
  netProfit,
  player,
} from "@/lib/player-data"

const stats = [
  {
    label: "Krediter",
    value: player.credits.toLocaleString("sv-SE"),
    hint: `+${player.creditsChange.toLocaleString("sv-SE")} denna vecka`,
    icon: Coins,
    positive: true,
  },
  {
    label: "Spelade spel",
    value: totalGamesPlayed.toLocaleString("sv-SE"),
    hint: "Blackjack & Roulette",
    icon: Dices,
    positive: null,
  },
  {
    label: "Vinstprocent",
    value: `${winRate}%`,
    hint: `Snittinsats ${avgBet.toLocaleString("sv-SE")} kr`,
    icon: Target,
    positive: null,
  },
  {
    label: "Nettoresultat",
    value: `${netProfit >= 0 ? "+" : ""}${netProfit.toLocaleString("sv-SE")}`,
    hint: "Totalt över alla spel",
    icon: netProfit >= 0 ? TrendingUp : TrendingDown,
    positive: netProfit >= 0,
  },
]

export function StatCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <stat.icon className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight">{stat.value}</div>
            <p
              className={
                stat.positive === true
                  ? "mt-1 text-xs font-medium text-accent"
                  : stat.positive === false
                    ? "mt-1 text-xs font-medium text-destructive"
                    : "mt-1 text-xs text-muted-foreground"
              }
            >
              {stat.hint}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
