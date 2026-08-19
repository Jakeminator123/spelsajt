import { Dices, Spade } from "lucide-react";

import { gameTypePreview, type GameTypePreview } from "@/lib/player-data";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Progress } from "../ui/progress";

function BreakdownRow({ stat }: Readonly<{ stat: GameTypePreview }>) {
  const Icon = stat.game === "Blackjack" ? Spade : Dices;
  const winRate = Math.round((stat.wins / stat.rounds) * 100);

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon aria-hidden="true" className="h-4 w-4" /></span>
          <span className="font-medium">{stat.game}</span>
        </div>
        <span className={stat.netCredits >= 0 ? "text-sm font-semibold text-primary" : "text-sm font-semibold text-destructive"}>
          {stat.netCredits >= 0 ? "+" : ""}{stat.netCredits.toLocaleString("sv-SE")}
        </span>
      </div>
      <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{stat.rounds} rundor</span><span>{winRate}% vinst</span></div>
      <Progress className="mt-1.5" label={`${stat.game}, exempel på vinstprocent`} value={winRate} />
      <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>Omsatta exempel</span><span>{stat.wageredCredits.toLocaleString("sv-SE")} krediter</span></div>
    </div>
  );
}

export function GameBreakdown() {
  return (
    <Card className="h-full">
      <CardHeader><CardTitle className="text-lg font-medium">Fördelning per spel</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {gameTypePreview.map((stat) => <BreakdownRow key={stat.game} stat={stat} />)}
      </CardContent>
    </Card>
  );
}
