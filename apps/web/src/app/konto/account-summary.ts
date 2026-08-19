import {
  accountSummaryV2Schema,
  type AccountRoundOutcomeV2,
  type AccountSummaryV2,
} from "@spelsajt/contracts";

export interface AccountOutcomeShare {
  readonly label: string;
  readonly outcome: AccountRoundOutcomeV2;
  readonly percentage: number;
  readonly rounds: number;
}

export async function fetchAccountSummary(
  gameServerUrl: string,
  accessToken: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AccountSummaryV2> {
  const response = await fetcher(`${gameServerUrl.replace(/\/$/, "")}/v2/account/summary`, {
    headers: { authorization: `Bearer ${accessToken}` },
    method: "GET",
    signal,
  });
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "Spelarsessionen behöver förnyas. Logga in igen."
        : "Spelöversikten kunde inte hämtas just nu.",
    );
  }
  return accountSummaryV2Schema.parse(await response.json());
}

export function formatPlayAmount(value: string, alwaysShowSign = false): string {
  const amount = BigInt(value);
  const formatted = new Intl.NumberFormat("sv-SE").format(amount < 0n ? -amount : amount);
  if (amount < 0n) return `-${formatted}`;
  return alwaysShowSign && amount > 0n ? `+${formatted}` : formatted;
}

export function accountOutcomeLabel(outcome: AccountRoundOutcomeV2): string {
  switch (outcome) {
    case "win":
      return "Vinst";
    case "loss":
      return "Förlust";
    case "push":
      return "Oavgjort";
    case "mixed":
      return "Blandat";
  }
}

export function accountWinRate(
  totals: Pick<AccountSummaryV2["totals"], "rounds" | "wonRounds">,
): number {
  if (totals.rounds === 0) return 0;
  return Math.round((totals.wonRounds / totals.rounds) * 100);
}

export function accountOutcomeShares(
  totals: AccountSummaryV2["totals"],
): readonly AccountOutcomeShare[] {
  const outcomes = [
    ["win", totals.wonRounds],
    ["loss", totals.lostRounds],
    ["push", totals.pushedRounds],
    ["mixed", totals.mixedRounds],
  ] as const;

  return outcomes.map(([outcome, rounds]) => ({
    label: accountOutcomeLabel(outcome),
    outcome,
    percentage: totals.rounds === 0 ? 0 : Math.round((rounds / totals.rounds) * 100),
    rounds,
  }));
}
