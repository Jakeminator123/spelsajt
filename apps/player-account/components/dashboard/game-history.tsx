import { Dices, ShieldCheck, Spade } from "lucide-react";

import {
  gameHistoryPreview,
  type GameResult,
  verifiedRatePreview,
} from "@/lib/player-data";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

const resultLabel: Record<GameResult, string> = {
  loss: "Förlust",
  mixed: "Delat",
  push: "Lika",
  win: "Vinst",
};

const resultClass: Record<GameResult, string> = {
  loss: "bg-destructive/10 text-destructive",
  mixed: "bg-[#7c5cff]/10 text-[#b9a9ff]",
  push: "bg-muted text-muted-foreground",
  win: "bg-primary/10 text-primary",
};

export function GameHistory() {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-medium">Senaste rundor · exempel</CardTitle>
        <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />{verifiedRatePreview}% verifierade</span>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Spel</TableHead><TableHead>Resultat</TableHead><TableHead className="text-right">Utfall</TableHead><TableHead className="hidden text-right md:table-cell">Tid</TableHead></TableRow></TableHeader>
          <TableBody>
            {gameHistoryPreview.map((round) => {
              const netCredits = round.payout - round.bet;
              const Icon = round.game === "Blackjack" ? Spade : Dices;
              return (
                <TableRow key={round.sequence}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium"><Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" /><span>{round.game}<small className="block font-normal text-muted-foreground">{round.tableId} · #{round.sequence}</small></span></div>
                  </TableCell>
                  <TableCell><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${resultClass[round.result]}`}>{resultLabel[round.result]}</span></TableCell>
                  <TableCell className={netCredits >= 0 ? "text-right font-semibold tabular-nums text-primary" : "text-right font-semibold tabular-nums text-destructive"}>{netCredits > 0 ? "+" : ""}{netCredits.toLocaleString("sv-SE")}</TableCell>
                  <TableCell className="hidden text-right text-xs text-muted-foreground md:table-cell">{round.date}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
