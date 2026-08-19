import type { Metadata } from "next";

import { ProfileSettings } from "@/components/profile-settings";

export const metadata: Metadata = {
  title: "Profilinställningar | Spelsajt",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">Din identitet</p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Profil och inloggning</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Spelarnamnet lagras i din ägda profilrad. Ett gästkonto kan säkras med Google utan att
          byta användar-id.
        </p>
      </div>
      <ProfileSettings />
    </div>
  );
}
