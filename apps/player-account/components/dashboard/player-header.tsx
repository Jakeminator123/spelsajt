"use client";

import { Crown } from "lucide-react";

import { initialDisplayName } from "@/lib/profile";
import { playerPreview } from "@/lib/player-data";

import { useAuth } from "../auth/auth-provider";
import { Progress } from "../ui/progress";

export function PlayerHeader() {
  const { session } = useAuth();
  const displayName = session ? initialDisplayName(session.user) : "Spelare";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const xpPercent = Math.round((playerPreview.xp / playerPreview.xpToNextLevel) * 100);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-xl shadow-black/10 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full border-2 border-primary bg-primary/10 font-display text-xl font-bold text-primary">
          {initials || "S"}
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">LV {playerPreview.level}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{displayName}</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Crown aria-hidden="true" className="h-3.5 w-3.5" /> {playerPreview.rank} · exempel
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Exempelprofil · medlem sedan {playerPreview.memberSince}</p>

          <div className="mt-4 max-w-md">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Nivå {playerPreview.level} → {playerPreview.level + 1}</span>
              <span>{playerPreview.xp.toLocaleString("sv-SE")} / {playerPreview.xpToNextLevel.toLocaleString("sv-SE")} XP</span>
            </div>
            <Progress label="Exempelprogression till nästa nivå" value={xpPercent} />
          </div>
        </div>
      </div>
    </section>
  );
}
