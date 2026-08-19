import type { Metadata } from "next";

import { LoginCard } from "@/components/auth/login-card";

export const metadata: Metadata = {
  title: "Logga in | Spelsajt",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <LoginCard />
    </main>
  );
}
