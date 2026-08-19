"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { weeklyActivity } from "@/lib/player-data"

const chartConfig = {
  rounds: {
    label: "Spel",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig

export function ActivityChart() {
  const total = weeklyActivity.reduce((sum, d) => sum + d.rounds, 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-medium">Spelaktivitet denna vecka</CardTitle>
        <span className="text-sm text-muted-foreground">
          {total.toLocaleString("sv-SE")} spel totalt
        </span>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[240px] w-full">
          <BarChart accessibilityLayer data={weeklyActivity}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="rounds" fill="var(--color-rounds)" radius={6} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
