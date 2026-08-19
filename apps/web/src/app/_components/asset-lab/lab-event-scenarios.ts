import { gameEventV2Schema, type GameEventV2 } from "@spelsajt/contracts";

export type LabScenarioId = "blackjack-basic" | "roulette-basic";

export interface LabEventScenario {
  events: readonly GameEventV2[];
  game: "blackjack" | "roulette";
  id: LabScenarioId;
  label: string;
  summary: string;
}

interface ScenarioIdentity {
  eventIdPrefix: string;
  occurredAt: string;
  roundId: string;
  tableId: string;
}

const BLACKJACK_IDENTITY: ScenarioIdentity = {
  eventIdPrefix: "41111111-1111-4111-8111-",
  occurredAt: "2026-08-19T12:00:00.000Z",
  roundId: "21111111-1111-4111-8111-111111111111",
  tableId: "lab-blackjack-basic",
};

const ROULETTE_IDENTITY: ScenarioIdentity = {
  eventIdPrefix: "42222222-2222-4222-8222-",
  occurredAt: "2026-08-19T12:10:00.000Z",
  roundId: "22222222-2222-4222-8222-222222222222",
  tableId: "lab-roulette-basic",
};

function eventBase(identity: ScenarioIdentity, sequence: number, revision: number) {
  return {
    eventId: `${identity.eventIdPrefix}${String(sequence).padStart(12, "0")}`,
    occurredAt: identity.occurredAt,
    revision,
    roundId: identity.roundId,
    schemaVersion: 2 as const,
    sequence,
    tableId: identity.tableId,
  };
}

const blackjackEventsInput = [
  {
    ...eventBase(BLACKJACK_IDENTITY, 1, 1),
    payload: {
      commitment: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fairnessAlgorithm: "pf-v1",
      game: "blackjack",
      nonce: 0,
      rulesetHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      rulesetId: "mvp-v2",
    },
    type: "round.prepared",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 2, 2),
    payload: { game: "blackjack", totalWager: "100" },
    type: "round.started",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 3, 2),
    payload: { handId: "hand-1", totalWager: "100", wager: "100" },
    type: "blackjack.bet.accepted",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 4, 2),
    payload: {
      card: { cardId: "lab-bj-01", rank: "K", suit: "spades" },
      faceUp: true,
      handId: "hand-1",
      recipient: "player",
    },
    type: "blackjack.card.dealt",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 5, 2),
    payload: {
      card: { cardId: "lab-bj-02", rank: "6", suit: "hearts" },
      faceUp: true,
      handId: "dealer",
      recipient: "dealer",
    },
    type: "blackjack.card.dealt",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 6, 2),
    payload: {
      card: { cardId: "lab-bj-03", rank: "Q", suit: "clubs" },
      faceUp: true,
      handId: "hand-1",
      recipient: "player",
    },
    type: "blackjack.card.dealt",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 7, 2),
    payload: { faceUp: false, handId: "dealer", recipient: "dealer" },
    type: "blackjack.card.dealt",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 8, 2),
    payload: {
      activeHandId: "hand-1",
      allowedActions: ["hit", "stand", "double", "split"],
      phase: "player",
    },
    type: "blackjack.turn.changed",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 9, 3),
    payload: { action: "split", handId: "hand-1" },
    type: "blackjack.action.accepted",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 10, 3),
    payload: {
      sourceHandId: "hand-1",
      splitHandIds: ["hand-1", "hand-2"],
    },
    type: "blackjack.hand.split",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 11, 3),
    payload: {
      card: { cardId: "lab-bj-05", rank: "A", suit: "clubs" },
      faceUp: true,
      handId: "hand-1",
      recipient: "player",
    },
    type: "blackjack.card.dealt",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 12, 3),
    payload: {
      card: { cardId: "lab-bj-06", rank: "8", suit: "hearts" },
      faceUp: true,
      handId: "hand-2",
      recipient: "player",
    },
    type: "blackjack.card.dealt",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 13, 3),
    payload: {
      activeHandId: "hand-2",
      allowedActions: ["hit", "stand", "double"],
      phase: "player",
    },
    type: "blackjack.turn.changed",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 14, 4),
    payload: { action: "stand", handId: "hand-2" },
    type: "blackjack.action.accepted",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 15, 4),
    payload: { activeHandId: null, allowedActions: [], phase: "dealer" },
    type: "blackjack.turn.changed",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 16, 4),
    payload: {
      card: { cardId: "lab-bj-04", rank: "10", suit: "diamonds" },
      handId: "dealer",
    },
    type: "blackjack.card.revealed",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 17, 4),
    payload: {
      card: { cardId: "lab-bj-07", rank: "5", suit: "spades" },
      faceUp: true,
      handId: "dealer",
      recipient: "dealer",
    },
    type: "blackjack.card.dealt",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 18, 4),
    payload: {
      blackjack: false,
      handId: "hand-1",
      outcome: "push",
      payout: "100",
      total: 21,
      wager: "100",
    },
    type: "blackjack.hand.settled",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 19, 4),
    payload: {
      blackjack: false,
      handId: "hand-2",
      outcome: "loss",
      payout: "0",
      total: 18,
      wager: "100",
    },
    type: "blackjack.hand.settled",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 20, 4),
    payload: {
      balance: "9900",
      fairness: {
        algorithm: "pf-v1",
        clientSeed: "lab-blackjack-client",
        nonce: 0,
        serverSeed: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
      game: "blackjack",
      outcome: "mixed",
      totalPayout: "100",
      totalWager: "200",
    },
    type: "round.settled",
  },
  {
    ...eventBase(BLACKJACK_IDENTITY, 21, 4),
    payload: { activeHandId: null, allowedActions: [], phase: "settled" },
    type: "blackjack.turn.changed",
  },
] as const satisfies readonly GameEventV2[];

const rouletteEventsInput = [
  {
    ...eventBase(ROULETTE_IDENTITY, 1, 1),
    payload: {
      commitment: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      fairnessAlgorithm: "pf-v1",
      game: "roulette",
      nonce: 0,
      rulesetHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      rulesetId: "mvp-v2",
    },
    type: "round.prepared",
  },
  {
    ...eventBase(ROULETTE_IDENTITY, 2, 1),
    payload: {},
    type: "roulette.betting.opened",
  },
  {
    ...eventBase(ROULETTE_IDENTITY, 3, 2),
    payload: {
      bet: {
        amount: "25",
        betId: "lab-bet-straight-17",
        currency: "PLAY",
        selection: { pocket: 17, type: "straight" },
      },
      totalWager: "25",
    },
    type: "roulette.bet.placed",
  },
  {
    ...eventBase(ROULETTE_IDENTITY, 4, 2),
    payload: {
      bet: {
        amount: "25",
        betId: "lab-bet-red",
        currency: "PLAY",
        selection: { colour: "red", type: "red-black" },
      },
      totalWager: "50",
    },
    type: "roulette.bet.placed",
  },
  {
    ...eventBase(ROULETTE_IDENTITY, 5, 2),
    payload: { game: "roulette", totalWager: "50" },
    type: "round.started",
  },
  {
    ...eventBase(ROULETTE_IDENTITY, 6, 3),
    payload: { betCount: 2, totalWager: "50" },
    type: "roulette.bets.locked",
  },
  {
    ...eventBase(ROULETTE_IDENTITY, 7, 3),
    payload: {},
    type: "roulette.spin.started",
  },
  {
    ...eventBase(ROULETTE_IDENTITY, 8, 3),
    payload: { colour: "black", pocket: 17 },
    type: "roulette.result",
  },
  {
    ...eventBase(ROULETTE_IDENTITY, 9, 4),
    payload: { betId: "lab-bet-straight-17", payout: "900", won: true },
    type: "roulette.bet.settled",
  },
  {
    ...eventBase(ROULETTE_IDENTITY, 10, 4),
    payload: { betId: "lab-bet-red", payout: "0", won: false },
    type: "roulette.bet.settled",
  },
  {
    ...eventBase(ROULETTE_IDENTITY, 11, 4),
    payload: {
      balance: "10850",
      fairness: {
        algorithm: "pf-v1",
        clientSeed: "lab-roulette-client",
        nonce: 0,
        serverSeed: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      },
      game: "roulette",
      outcome: "mixed",
      totalPayout: "900",
      totalWager: "50",
    },
    type: "round.settled",
  },
] as const satisfies readonly GameEventV2[];

function parseScenario(
  definition: Omit<LabEventScenario, "events"> & { events: readonly GameEventV2[] },
): LabEventScenario {
  const events = gameEventV2Schema.array().parse(definition.events);
  const first = events[0];
  if (!first || first.type !== "round.prepared" || first.payload.game !== definition.game) {
    throw new Error(`Lab scenario ${definition.id} must begin with its matching round.prepared event.`);
  }

  for (const [index, event] of events.entries()) {
    if (event.sequence !== index + 1) {
      throw new Error(`Lab scenario ${definition.id} has a sequence gap at index ${index}.`);
    }
    if (event.tableId !== first.tableId || event.roundId !== first.roundId) {
      throw new Error(`Lab scenario ${definition.id} mixes table or round identities.`);
    }
    if (index > 0 && event.revision < (events[index - 1]?.revision ?? 0)) {
      throw new Error(`Lab scenario ${definition.id} has a revision regression at sequence ${event.sequence}.`);
    }
    if (event.type.startsWith("blackjack.") && definition.game !== "blackjack") {
      throw new Error(`Lab scenario ${definition.id} contains a blackjack event.`);
    }
    if (event.type.startsWith("roulette.") && definition.game !== "roulette") {
      throw new Error(`Lab scenario ${definition.id} contains a roulette event.`);
    }
  }

  return { ...definition, events };
}

const blackjackScenario = parseScenario({
  events: blackjackEventsInput,
  game: "blackjack",
  id: "blackjack-basic",
  label: "Blackjack · split och blandat resultat",
  summary: "En runtime-trogen splitrunda med dolt kort, reveal, dealerdrag och två separata handresultat.",
});

const rouletteScenario = parseScenario({
  events: rouletteEventsInput,
  game: "roulette",
  id: "roulette-basic",
  label: "Roulette · två bets och blandat resultat",
  summary: "En rak nummerinsats vinner på svart 17 medan en röd färginsats förlorar.",
});

export const labEventScenarios = [
  blackjackScenario,
  rouletteScenario,
] as const satisfies readonly LabEventScenario[];

export function getLabEventScenario(id: LabScenarioId): LabEventScenario {
  const scenario = labEventScenarios.find((candidate) => candidate.id === id);
  if (!scenario) {
    throw new RangeError(`Unknown lab event scenario: ${id}`);
  }
  return scenario;
}
