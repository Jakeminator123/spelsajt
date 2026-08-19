import { ActivityChart } from "@/components/dashboard/activity-chart";
import { CreditBalance } from "@/components/dashboard/credit-balance";
import { GameBreakdown } from "@/components/dashboard/game-breakdown";
import { GameHistory } from "@/components/dashboard/game-history";
import { PlayerHeader } from "@/components/dashboard/player-header";
import { StatCards } from "@/components/dashboard/stat-cards";

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <aside className="rounded-xl border border-[#7c5cff]/35 bg-[#7c5cff]/10 px-4 py-3 text-sm text-[#d7d0ff]">
        <strong className="font-display text-white">UI-förhandsvisning:</strong>{" "}
        saldo, statistik och historik är tydligt markerad exempeldata tills ett auktoritativt
        account-summary-kontrakt finns i spelservern.
      </aside>

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
  );
}
