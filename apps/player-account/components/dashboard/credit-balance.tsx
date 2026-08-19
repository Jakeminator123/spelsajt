import { ArrowUpRight, Coins } from "lucide-react";

import { playerPreview } from "@/lib/player-data";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export function CreditBalance() {
  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Kreditsaldo · exempel</CardTitle>
        <Coins aria-hidden="true" className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <span className="font-display text-3xl font-bold tracking-tight">{playerPreview.credits.toLocaleString("sv-SE")}</span>
          <span className="mb-1 text-sm text-muted-foreground">krediter</span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary"><ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />+{playerPreview.creditsChange.toLocaleString("sv-SE")} denna vecka</p>
        <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-xs leading-5 text-muted-foreground">
          Balansen visas bara som presentationsdata här. Endast spelserverns privata PLAY-ledger får ändra eller rapportera ett verkligt saldo.
        </div>
      </CardContent>
    </Card>
  );
}
