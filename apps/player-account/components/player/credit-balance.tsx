"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Coins, Plus, ArrowUpRight } from "lucide-react"
import { player } from "@/lib/player-data"

export function CreditBalance() {
  const [credits, setCredits] = useState(player.credits)

  const addCredits = (amount: number) => setCredits((c) => c + amount)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Kreditsaldo</CardTitle>
        <Coins className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold tracking-tight">{credits.toLocaleString("sv-SE")}</span>
          <span className="mb-1 text-sm text-muted-foreground">krediter</span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-accent">
          <ArrowUpRight className="h-3.5 w-3.5" />
          +{player.creditsChange.toLocaleString("sv-SE")} denna vecka
        </p>

        <div className="mt-4 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          Play-money-krediter. Fyll på gratis för att fortsätta spela blackjack och roulette.
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[1000, 5000, 10000].map((amount) => (
            <Button key={amount} size="sm" variant="secondary" onClick={() => addCredits(amount)}>
              +{amount.toLocaleString("sv-SE")}
            </Button>
          ))}
        </div>
        <Button className="mt-2 w-full" onClick={() => addCredits(25000)}>
          <Plus className="mr-2 h-4 w-4" /> Fyll på krediter
        </Button>
      </CardContent>
    </Card>
  )
}
