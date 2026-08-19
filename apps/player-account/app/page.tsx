import { PlayerHeader } from "@/components/player/player-header"
import { StatCards } from "@/components/player/stat-cards"
import { CreditBalance } from "@/components/player/credit-balance"
import { GameBreakdown } from "@/components/player/game-breakdown"
import { ActivityChart } from "@/components/player/activity-chart"
import { GameHistory } from "@/components/player/game-history"

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <PlayerHeader />

      <StatCards />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <CreditBalance />
        </div>
        <div className="lg:col-span-2">
          <ActivityChart />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <GameBreakdown />
        </div>
        <div className="lg:col-span-2">
          <GameHistory />
        </div>
      </div>
    </div>
  )
}
