"use client";

import { Dices, LayoutDashboard, Settings, Spade } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const internalNavigation = [
  { href: "/", icon: LayoutDashboard, label: "Översikt" },
  { href: "/settings", icon: Settings, label: "Inställningar" },
] as const;

function internalClass(active: boolean): string {
  return active
    ? "flex items-center gap-3 rounded-xl bg-primary/12 px-3 py-2.5 text-sm font-semibold text-primary"
    : "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-white/[0.04] hover:text-white";
}

export function Sidebar() {
  const pathname = usePathname();
  const gameAppUrl = (process.env.NEXT_PUBLIC_GAME_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return (
    <aside className="border-b border-white/[0.07] bg-[#0b0c11]/80 px-4 py-4 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
      <Link className="flex items-center gap-3 px-2" href="/">
        <span className="grid h-9 w-9 -rotate-6 place-items-center rounded-xl bg-gradient-to-br from-primary to-[#7c5cff] font-display font-extrabold text-[#08090c]">S</span>
        <span className="font-display text-lg font-bold">Spelarkonto</span>
      </Link>

      <nav aria-label="Kontonavigering" className="mt-5 flex gap-2 overflow-x-auto lg:mt-9 lg:block lg:space-y-1">
        {internalNavigation.map((item) => {
          const active = pathname === item.href;
          return (
            <Link aria-current={active ? "page" : undefined} className={internalClass(active)} href={item.href} key={item.href}>
              <item.icon aria-hidden="true" className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 hidden border-t border-white/[0.07] pt-4 lg:block">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Till borden</p>
        <a className={internalClass(false)} href={`${gameAppUrl}/blackjack`}>
          <Spade aria-hidden="true" className="h-4 w-4" /> Blackjack
        </a>
        <a className={internalClass(false)} href={`${gameAppUrl}/roulette`}>
          <Dices aria-hidden="true" className="h-4 w-4" /> Roulette
        </a>
      </div>

      <p className="mt-8 hidden px-3 text-xs leading-5 text-muted-foreground lg:block">
        Endast play money. Inga köp, insättningar eller uttag.
      </p>
    </aside>
  );
}
