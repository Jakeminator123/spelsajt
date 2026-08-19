"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Crown } from "lucide-react"
import { useSettings } from "@/contexts/settings-context"
import { player } from "@/lib/player-data"

export function PlayerHeader() {
  const { settings } = useSettings()
  const xpPercent = Math.round((player.xp / player.xpToNextLevel) * 100)

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <Avatar className="h-20 w-20 border-2 border-primary">
            <AvatarImage src={settings.avatar || "/placeholder.svg"} alt={player.username} />
            <AvatarFallback>
              {player.username
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
            LV {player.level}
          </span>
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{player.username}</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
              <Crown className="h-3.5 w-3.5" />
              {player.rank}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Medlem sedan {player.memberSince}</p>

          <div className="mt-4 max-w-md">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Nivå {player.level} → {player.level + 1}
              </span>
              <span className="font-medium text-foreground">
                {player.xp.toLocaleString("sv-SE")} / {player.xpToNextLevel.toLocaleString("sv-SE")} XP
              </span>
            </div>
            <Progress value={xpPercent} className="h-2" />
          </div>
        </div>
      </div>
    </div>
  )
}
