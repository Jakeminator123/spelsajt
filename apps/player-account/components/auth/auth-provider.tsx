"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import {
  createBrowserSupabaseClient,
  publicSupabaseConfiguration,
} from "@/lib/supabase";

type AuthPhase = "loading" | "ready" | "unconfigured";

interface AuthContextValue {
  readonly client: SupabaseClient | null;
  readonly phase: AuthPhase;
  readonly session: Session | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [configuration] = useState(publicSupabaseConfiguration);
  const [client] = useState<SupabaseClient | null>(() => (
    configuration ? createBrowserSupabaseClient(configuration) : null
  ));
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<AuthPhase>(client ? "loading" : "unconfigured");

  useEffect(() => {
    if (!client) return;
    let active = true;

    void client.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setPhase("ready");
      }
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setPhase("ready");
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthContextValue>(() => ({ client, phase, session }), [client, phase, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
