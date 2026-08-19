"use client";

import { ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { oauthRedirectUrl } from "@/lib/supabase";

import { useAuth } from "./auth-provider";

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
      <path d="M21.35 12.2c0-.7-.06-1.2-.19-1.74H12v3.32h5.38a4.6 4.6 0 0 1-1.99 2.93v2.15h3.22c1.89-1.74 2.74-4.31 2.74-6.66Z" fill="#4285F4" />
      <path d="M12 21.7c2.7 0 4.96-.89 6.61-2.42l-3.22-2.57c-.9.6-2.04.96-3.39.96-2.6 0-4.81-1.76-5.6-4.13H3.08v2.23A9.99 9.99 0 0 0 12 21.7Z" fill="#34A853" />
      <path d="M6.4 13.54a6 6 0 0 1 0-3.83V7.48H3.08a9.99 9.99 0 0 0 0 8.29l3.32-2.23Z" fill="#FBBC04" />
      <path d="M12 5.58c1.47 0 2.79.5 3.83 1.5l2.85-2.85A9.56 9.56 0 0 0 12 1.55a9.99 9.99 0 0 0-8.92 5.93L6.4 9.71C7.19 7.34 9.4 5.58 12 5.58Z" fill="#EA4335" />
    </svg>
  );
}

export function LoginCard() {
  const { client, phase, session } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (phase === "ready" && userId) router.replace("/");
  }, [phase, router, userId]);

  async function signInWithGoogle() {
    if (!client) return;
    setBusy("google");
    setError(null);
    const result = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: oauthRedirectUrl(window.location.origin, "/") },
    });
    if (result.error) {
      setError(result.error.message);
      setBusy(null);
    }
  }

  async function continueAsGuest() {
    if (!client) return;
    setBusy("guest");
    setError(null);
    const result = await client.auth.signInAnonymously();
    if (result.error) {
      setError(result.error.message);
      setBusy(null);
      return;
    }
    router.replace("/");
  }

  return (
    <section className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-[#101219]/95 p-6 shadow-2xl shadow-black/50 sm:p-8">
      <div aria-hidden="true" className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[#7c5cff]/20 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-24 -left-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-10 w-10 -rotate-6 place-items-center rounded-xl bg-gradient-to-br from-primary to-[#7c5cff] font-display text-lg font-extrabold text-[#08090c]">S</span>
          <div>
            <p className="font-display text-lg font-bold">Spelsajt</p>
            <p className="text-xs text-muted-foreground">Ditt play-money-konto</p>
          </div>
        </div>

        <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-primary">Välkommen tillbaka</p>
        <h1 className="font-display text-4xl font-bold leading-none tracking-[-0.045em]">Ett konto.<br />Alla bord.</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Google ger åtkomst på fler enheter. Gästläget tar dig direkt vidare utan personuppgifter.
        </p>

        <div className="mt-7 space-y-3">
          <button className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white px-5 text-sm font-bold text-[#111318] transition hover:-translate-y-0.5 hover:bg-[#f2f2f2] disabled:cursor-wait disabled:opacity-60" disabled={busy !== null || phase !== "ready"} onClick={signInWithGoogle} type="button">
            <GoogleMark />
            {busy === "google" ? "Öppnar Google…" : "Fortsätt med Google"}
          </button>
          <button className="h-12 w-full rounded-full border border-white/15 bg-white/[0.03] px-5 text-sm font-bold transition hover:-translate-y-0.5 hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-60" disabled={busy !== null || phase !== "ready"} onClick={continueAsGuest} type="button">
            {busy === "guest" ? "Skapar gästkonto…" : "Fortsätt som gäst"}
          </button>
        </div>

        {phase === "unconfigured" ? (
          <p className="mt-4 rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            Supabase URL och publishable key saknas i den här miljön.
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}

        <div className="mt-7 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Endast play money</span>
          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#9b82ff]" /> Verifierbar fairness</span>
        </div>
      </div>
    </section>
  );
}
