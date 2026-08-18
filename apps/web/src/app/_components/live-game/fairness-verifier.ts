import type { GameEventV2, GameSnapshotV2 } from "@spelsajt/contracts";

type RoundSettledEvent = Extract<GameEventV2, { type: "round.settled" }>;

export interface FairnessEvidence {
  readonly label: string;
  readonly value: string;
}

export interface FairnessVerification {
  readonly detail: string;
  readonly evidence: readonly FairnessEvidence[];
  readonly status: "failed" | "unavailable" | "verified";
  readonly title: string;
}

export async function verifySettledRound(
  snapshot: GameSnapshotV2,
  events: readonly GameEventV2[],
): Promise<FairnessVerification> {
  const round = snapshot.round;
  if (!round || round.phase !== "settled") {
    return unavailable("Rundan är inte avgjord ännu.");
  }

  const settlement = events.findLast((event): event is RoundSettledEvent => (
    event.type === "round.settled"
    && event.roundId === round.roundId
    && event.payload.game === snapshot.game
  ));
  if (!settlement) {
    return unavailable(
      "Den validerade fairness-revealen finns inte sparad för den här rundan. Spela en ny runda med liveanslutning och verifiera efter settlement.",
    );
  }

  const [fairness, config] = await Promise.all([
    import("@spelsajt/fairness/browser"),
    import("@spelsajt/config"),
  ]);
  const computedCommitment = await fairness.createCommitment(
    settlement.payload.fairness.serverSeed,
  );
  const baseEvidence: FairnessEvidence[] = [
    { label: "Algoritm", value: settlement.payload.fairness.algorithm },
    { label: "Commitment", value: round.fairness.commitment },
    { label: "Server seed", value: settlement.payload.fairness.serverSeed },
    { label: "Client seed", value: settlement.payload.fairness.clientSeed },
    { label: "Nonce", value: String(settlement.payload.fairness.nonce) },
    { label: "Rulesethash", value: round.rulesetHash },
  ];

  if (
    computedCommitment !== round.fairness.commitment
    || settlement.payload.fairness.nonce !== round.fairness.nonce
    || settlement.payload.fairness.algorithm !== round.fairness.algorithm
  ) {
    return {
      detail: "Reveal-data reproducerar inte det commitment som låstes före insatsen.",
      evidence: baseEvidence,
      status: "failed",
      title: "Fairnesskontrollen misslyckades",
    };
  }
  if (round.rulesetHash !== config.mvpRulesetHash) {
    return {
      detail: "Rundans rulesethash matchar inte den frysta mvp-v2-regeln som verifieraren använder.",
      evidence: baseEvidence,
      status: "failed",
      title: "Ruleset kan inte verifieras",
    };
  }

  const input = {
    clientSeed: settlement.payload.fairness.clientSeed,
    game: snapshot.game,
    nonce: settlement.payload.fairness.nonce,
    roundId: round.roundId,
    rulesetHash: round.rulesetHash,
  } as const;

  if (snapshot.game === "roulette") {
    const rouletteRound = snapshot.round;
    if (!rouletteRound || rouletteRound.phase !== "settled") {
      return unavailable("Rouletterundan är inte avgjord ännu.");
    }
    const computedPocket = await new fairness.FairRandom(
      settlement.payload.fairness.serverSeed,
      input,
    ).uniformInt(37);
    const evidence = [
      ...baseEvidence,
      { label: "Återskapad pocket", value: String(computedPocket) },
      { label: "Serverresultat", value: String(rouletteRound.result.pocket) },
    ];

    if (computedPocket !== rouletteRound.result.pocket) {
      return {
        detail: "Web Crypto återskapade inte serverns publicerade roulettepocket.",
        evidence,
        status: "failed",
        title: "Rouletteutfallet matchar inte",
      };
    }

    return {
      detail: `Web Crypto återskapade pocket ${computedPocket} från rundans låsta seed-data.`,
      evidence,
      status: "verified",
      title: "Rouletteutfallet är verifierat",
    };
  }

  const dealtCardIds = blackjackDrawOrder(events, round.roundId);
  if (!dealtCardIds) {
    return unavailable(
      "Den kompletta, sammanhängande korttranskriptionen finns inte sparad för den här rundan. Spela en ny blackjackrunda med liveanslutning.",
      baseEvidence,
    );
  }

  const gameCore = await import("@spelsajt/game-core");
  const canonicalShoe = gameCore.createBlackjackShoe(config.mvpRuleset);
  const shuffledShoe = await fairness.shuffle(
    canonicalShoe,
    new fairness.FairRandom(settlement.payload.fairness.serverSeed, input),
  );
  const expectedCardIds = shuffledShoe
    .slice(0, dealtCardIds.length)
    .map((card) => card.cardId);
  const mismatchIndex = dealtCardIds.findIndex(
    (cardId, index) => cardId !== expectedCardIds[index],
  );
  const evidence = [
    ...baseEvidence,
    { label: "Kontrollerade kort", value: String(dealtCardIds.length) },
    { label: "Återskapad skostart", value: expectedCardIds.slice(0, 6).join(" · ") },
  ];

  if (mismatchIndex !== -1) {
    return {
      detail: `Det utdelade kortet på position ${mismatchIndex + 1} matchar inte den återskapade sexleksskon.`,
      evidence,
      status: "failed",
      title: "Blackjackskon matchar inte",
    };
  }

  return {
    detail: `Web Crypto återskapade sexleksskon och matchade alla ${dealtCardIds.length} utdelade kort i ordning.`,
    evidence,
    status: "verified",
    title: "Blackjackrundan är verifierad",
  };
}

function blackjackDrawOrder(
  events: readonly GameEventV2[],
  roundId: string,
): readonly string[] | null {
  const roundEvents = events
    .filter((event) => event.roundId === roundId)
    .toSorted((left, right) => left.sequence - right.sequence);
  const startedIndex = roundEvents.findIndex((event) => event.type === "round.started");
  const settledIndex = roundEvents.findLastIndex((event) => event.type === "round.settled");
  if (startedIndex === -1 || settledIndex <= startedIndex) return null;

  const transcript = roundEvents.slice(startedIndex, settledIndex + 1);
  for (let index = 1; index < transcript.length; index += 1) {
    if (transcript[index]!.sequence !== transcript[index - 1]!.sequence + 1) return null;
  }

  const draws: Array<string | null> = [];
  for (const event of transcript) {
    if (event.type === "blackjack.card.dealt") {
      draws.push(event.payload.faceUp ? event.payload.card.cardId : null);
    } else if (event.type === "blackjack.card.revealed") {
      const hiddenIndex = draws.indexOf(null);
      if (hiddenIndex === -1) return null;
      draws[hiddenIndex] = event.payload.card.cardId;
    }
  }

  return draws.length >= 4 && draws.every((cardId): cardId is string => cardId !== null)
    ? draws
    : null;
}

function unavailable(
  detail: string,
  evidence: readonly FairnessEvidence[] = [],
): FairnessVerification {
  return {
    detail,
    evidence,
    status: "unavailable",
    title: "Verifiering behöver live-revealen",
  };
}
