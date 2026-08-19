import {
  accountSummaryV2Schema,
  type AccountRoundOutcomeV2,
  type AccountSummaryV2,
} from "@spelsajt/contracts";

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
