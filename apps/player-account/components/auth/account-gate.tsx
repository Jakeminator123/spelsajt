"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { useAuth } from "./auth-provider";

export function AccountGate({ children }: Readonly<{ children: ReactNode }>) {
  const { phase, session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (phase === "ready" && !userId) router.replace("/login");
  }, [phase, router, userId]);

  if (phase === "unconfigured") {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="max-w-lg rounded-2xl border bg-card p-8 text-center shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Konto ej anslutet</p>
          <h1 className="mt-3 font-display text-3xl font-bold">Supabase saknas i miljön.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Lägg till publik Supabase URL och publishable key för att aktivera login och dashboard.
          </p>
        </section>
      </main>
    );
  }

  if (phase === "loading" || !userId) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p aria-live="polite" className="text-sm text-muted-foreground">Läser spelarsession…</p>
      </main>
    );
  }

  return children;
}
