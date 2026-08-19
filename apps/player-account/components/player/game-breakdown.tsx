import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Spade, Dices } from "lucide-react"
import { gameTypeStats, type GameTypeStats } from "@/lib/player-data"

const icons = {
  Blackjack: Spade,
  Roulette: Dices,
}

function BreakdownRow({ stat }: { stat: GameTypeStats }) {
  const Icon = icons[stat.game]
  const winRate = Math.round((stat.wins / stat.rounds) * 100)
  const profitPositive = stat.netProfit >= 0

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="font-medium">{stat.game}</span>
        </div>
        <span
          className={
            profitPositive ? "text-sm font-semibold text-accent" : "text-sm font-semibold text-destructive"
          }
        >
          {profitPositive ? "+" : ""}
          {stat.netProfit.toLocaleString("sv-SE")}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{stat.rounds.toLocaleString("sv-SE")} spel</span>
        <span>{winRate}% vinst</span>
      </div>
      <Progress value={winRate} className="mt-1.5 h-2" />

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Total insats</span>
        <span className="font-medium text-foreground">{stat.wagered.toLocaleString("sv-SE")} kr</span>
      </div>
    </div>
  )
}

export function GameBreakdown() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium">Fördelning per spel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {gameTypeStats.map((stat) => (
          <BreakdownRow key={stat.game} stat={stat} />
        ))}
      </CardContent>
    </Card>
  )
}
