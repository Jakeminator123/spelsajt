import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Spade, Dices, ShieldCheck, ShieldAlert } from "lucide-react"
import { gameHistory, verifiedRate, type GameResult } from "@/lib/player-data"

const resultLabel: Record<GameResult, string> = {
  win: "Vinst",
  loss: "Förlust",
  push: "Lika",
  mixed: "Delat",
}

const resultClass: Record<GameResult, string> = {
  win: "bg-accent/15 text-accent",
  loss: "bg-destructive/15 text-destructive",
  push: "bg-muted text-muted-foreground",
  mixed: "bg-primary/15 text-primary",
}

export function GameHistory() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-medium">Senaste rundor</CardTitle>
        <span className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">
          <ShieldCheck className="h-3.5 w-3.5" />
          {verifiedRate}% verifierade
        </span>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Spel</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Insats</TableHead>
              <TableHead>Resultat</TableHead>
              <TableHead className="text-right">Utfall</TableHead>
              <TableHead className="hidden text-center md:table-cell">Fairness</TableHead>
              <TableHead className="hidden text-right md:table-cell">Tid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gameHistory.map((round) => {
              const net = round.payout - round.bet
              return (
                <TableRow key={round.seq}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {round.game === "Blackjack" ? (
                        <Spade className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Dices className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="flex flex-col">
                        <span>{round.game}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {round.tableId} · #{round.seq}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {round.bet.toLocaleString("sv-SE")}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${resultClass[round.result]}`}
                    >
                      {resultLabel[round.result]}
                    </span>
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums ${
                      net > 0 ? "text-accent" : net < 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {net > 0 ? "+" : ""}
                    {net.toLocaleString("sv-SE")}
                  </TableCell>
                  <TableCell className="hidden text-center md:table-cell">
                    {round.verified ? (
                      <ShieldCheck className="mx-auto h-4 w-4 text-accent" aria-label="Fairness verifierad" />
                    ) : (
                      <ShieldAlert
                        className="mx-auto h-4 w-4 text-muted-foreground"
                        aria-label="Ej verifierad"
                      />
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right text-xs text-muted-foreground md:table-cell">
                    {round.date}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
