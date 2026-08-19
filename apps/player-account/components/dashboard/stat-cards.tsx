import { Coins, Dices, Target, TrendingUp } from "lucide-react";

import {
  averageBetPreview,
  netCreditsPreview,
  playerPreview,
  totalGamesPreview,
  winRatePreview,
} from "@/lib/player-data";

import { Card, CardContent } from "../ui/card";

const stats = [
  { label: "Krediter", value: playerPreview.credits.toLocaleString("sv-SE"), hint: "Exempelsaldo", icon: Coins },
  { label: "Spelade rundor", value: totalGamesPreview.toLocaleString("sv-SE"), hint: "Blackjack & roulette", icon: Dices },
  { label: "Vinstprocent", value: `${winRatePreview}%`, hint: `Snittinsats ${averageBetPreview.toLocaleString("sv-SE")} krediter`, icon: Target },
  { label: "Nettoresultat", value: `+${netCreditsPreview.toLocaleString("sv-SE")}`, hint: "Exempel över alla rundor", icon: TrendingUp },
] as const;

export function StatCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><stat.icon aria-hidden="true" className="h-5 w-5" /></span>
            </div>
            <p className="mt-3 font-display text-2xl font-bold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
