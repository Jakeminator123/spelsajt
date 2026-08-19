import { weeklyActivityPreview } from "@/lib/player-data";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

const peakRounds = Math.max(...weeklyActivityPreview.map((entry) => entry.rounds));
const totalRounds = weeklyActivityPreview.reduce((sum, entry) => sum + entry.rounds, 0);

export function ActivityChart() {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-medium">Veckoaktivitet · exempel</CardTitle>
        <span className="text-sm text-muted-foreground">{totalRounds} rundor</span>
      </CardHeader>
      <CardContent>
        <div aria-label="Exempel på antal spelade rundor per dag" className="grid h-56 grid-cols-7 items-end gap-2" role="img">
          {weeklyActivityPreview.map((entry) => {
            const height = Math.max(12, Math.round((entry.rounds / peakRounds) * 100));
            return (
              <div className="flex h-full flex-col items-center justify-end gap-2" key={entry.day}>
                <span className="text-[10px] tabular-nums text-muted-foreground">{entry.rounds}</span>
                <div className="w-full max-w-10 rounded-t-lg bg-gradient-to-t from-[#7c5cff] to-primary" style={{ height: `${height}%` }} />
                <span className="text-xs text-muted-foreground">{entry.day}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
