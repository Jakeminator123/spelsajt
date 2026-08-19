"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { initialDisplayName } from "@/lib/profile";

import { useAuth } from "./auth/auth-provider";

export function TopNav() {
  const { client, session } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const displayName = session ? initialDisplayName(session.user) : "Spelare";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  async function signOut() {
    if (!client) return;
    setBusy(true);
    const result = await client.auth.signOut();
    if (result.error) {
      setBusy(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#08090c]/85 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Spelsajt</p>
          <p className="font-display text-sm font-semibold">{pathname === "/settings" ? "Inställningar" : "Mitt konto"}</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link className="hidden rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-white/[0.05] hover:text-white sm:inline-flex" href="/settings">
            <Settings aria-hidden="true" className="mr-2 h-4 w-4" /> Profil
          </Link>
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full border border-primary/30 bg-primary/10 text-xs font-bold text-primary">{initials || "S"}</span>
          <button className="inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50" disabled={busy} onClick={signOut} type="button">
            <LogOut aria-hidden="true" className="mr-2 h-4 w-4" />
            {busy ? "Loggar ut…" : "Logga ut"}
          </button>
        </div>
      </div>
    </header>
  );
}
