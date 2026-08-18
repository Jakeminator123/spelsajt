"use client";

import type {
  CardV2,
  GameEventV2,
  RouletteBetV2,
} from "@spelsajt/contracts";
import { gameEventV2Schema } from "@spelsajt/contracts";
import { useSyncExternalStore } from "react";

export const presentationCueDefinitions = {
  "blackjack.round-prepared": ["table", "table.reset", "Blackjackbordet är förberett för en ny runda."],
  "blackjack.round-start": ["table", "table.round-start", "Blackjackrundan har startat."],
  "blackjack.bet-accepted": ["player", "player.place-bet", "Blackjackinsatsen är accepterad."],
  "blackjack.deal-card": ["dealer", "dealer.deal-card", "Dealern delar ett kort utan att exponera ett nedvänt kort."],
  "blackjack.reveal-card": ["dealer", "dealer.reveal-hole-card", "Dealern visar sitt nedvända kort."],
  "blackjack.split-hand": ["dealer", "dealer.split-hand", "Spelarens hand delas i två händer."],
  "blackjack.turn-change": ["table", "table.turn-change", "Bordet visar vems tur det är och vilka handlingar som är tillåtna."],
  "blackjack.hand-settled": ["table", "table.settle-hand", "Blackjackhandens resultat och payout visas."],
  "roulette.round-prepared": ["table", "table.reset", "Roulettebordet är förberett för en ny runda."],
  "roulette.round-start": ["table", "table.round-start", "Rouletterundan har startat med accepterade insatser."],
  "roulette.betting-opened": ["table", "table.open-betting", "Roulettebordet tar emot insatser."],
  "roulette.bet-placed": ["player", "player.place-bet", "En accepterad roulettemarkör placeras på bettingmattan."],
  "roulette.bets-locked": ["table", "table.lock-bets", "Rouletteinsatserna är låsta."],
  "roulette.spin-started": ["dealer", "dealer.spin-wheel", "Roulettehjulet och bollen börjar röra sig."],
  "roulette.land-pocket": ["table", "table.roulette-land", "Roulettehjulet visar serverns vinnande pocket."],
  "roulette.bet-settled": ["dealer", "dealer.settle-bet", "Den enskilda rouletteinsatsen markeras som vunnen eller förlorad."],
  "blackjack.settled-win": ["table", "table.pay-winning-bet", "Spelaren vann blackjackrundan."],
  "blackjack.settled-loss": ["table", "table.collect-losing-bet", "Spelaren förlorade blackjackrundan."],
  "blackjack.settled-push": ["table", "table.return-push", "Blackjackrundan slutade oavgjort."],
  "blackjack.settled-mixed": ["table", "table.settle-mixed", "De delade blackjackhänderna fick olika resultat."],
  "roulette.settled-win": ["table", "table.pay-winning-bet", "Alla avgjorda rouletteinsatser vann."],
  "roulette.settled-loss": ["table", "table.collect-losing-bet", "Alla avgjorda rouletteinsatser förlorade."],
  "roulette.settled-push": ["table", "table.return-push", "Rouletterundan avslutades utan nettovinst eller nettoförlust."],
  "roulette.settled-mixed": ["table", "table.settle-mixed", "Rouletterundan innehöll både vinnande och förlorande insatser."],
} as const;

type EventOf<T extends GameEventV2["type"]> = Extract<GameEventV2, { type: T }>;
type BlackjackActionV2 = EventOf<"blackjack.action.accepted">["payload"]["action"];
type CueEventMap = {
  "blackjack.round-prepared": EventOf<"round.prepared">;
  "blackjack.round-start": EventOf<"round.started">;
  "blackjack.bet-accepted": EventOf<"blackjack.bet.accepted">;
  "blackjack.deal-card": EventOf<"blackjack.card.dealt">;
  "blackjack.reveal-card": EventOf<"blackjack.card.revealed">;
  "blackjack.split-hand": EventOf<"blackjack.hand.split">;
  "blackjack.turn-change": EventOf<"blackjack.turn.changed">;
  "blackjack.hand-settled": EventOf<"blackjack.hand.settled">;
  "roulette.round-prepared": EventOf<"round.prepared">;
  "roulette.round-start": EventOf<"round.started">;
  "roulette.betting-opened": EventOf<"roulette.betting.opened">;
  "roulette.bet-placed": EventOf<"roulette.bet.placed">;
  "roulette.bets-locked": EventOf<"roulette.bets.locked">;
  "roulette.spin-started": EventOf<"roulette.spin.started">;
  "roulette.land-pocket": EventOf<"roulette.result">;
  "roulette.bet-settled": EventOf<"roulette.bet.settled">;
  "blackjack.settled-win": EventOf<"round.settled">;
  "blackjack.settled-loss": EventOf<"round.settled">;
  "blackjack.settled-push": EventOf<"round.settled">;
  "blackjack.settled-mixed": EventOf<"round.settled">;
  "roulette.settled-win": EventOf<"round.settled">;
  "roulette.settled-loss": EventOf<"round.settled">;
  "roulette.settled-push": EventOf<"round.settled">;
  "roulette.settled-mixed": EventOf<"round.settled">;
};

export type PresentationCueId = keyof CueEventMap;

type PresentationCueFor<K extends PresentationCueId> = {
  actor: (typeof presentationCueDefinitions)[K][0];
  clip: (typeof presentationCueDefinitions)[K][1];
  cueId: K;
  data: CueEventMap[K]["payload"];
  eventType: CueEventMap[K]["type"];
  kind: "cue";
  reducedMotionText: (typeof presentationCueDefinitions)[K][2];
  sourceEventId: string;
};

export type PresentationCue = {
  [K in PresentationCueId]: PresentationCueFor<K>;
}[PresentationCueId];

export interface PresentationIgnore {
  eventType: "blackjack.action.accepted";
  ignoreId: "blackjack.action-accepted-ignore";
  kind: "ignore";
  reason: "Eventet kvitterar spelarens avsikt men skapar ingen egen animation; efterföljande kort-, split- och turn-events styr presentationen.";
  sourceEventId: string;
}

export type PresentationIntent = PresentationCue | PresentationIgnore;

export type PresentationCard =
  | {
      card: CardV2;
      faceUp: true;
      handId: string;
      recipient: "dealer" | "player";
      visualId: string;
    }
  | {
      faceUp: false;
      handId: "dealer";
      recipient: "dealer";
      visualId: string;
    };

export type PresentationStage =
  | "idle"
  | "prepared"
  | "active"
  | "roulette-betting"
  | "roulette-locked"
  | "roulette-spinning"
  | "roulette-result"
  | "settling"
  | "settled";

export interface PresentationState {
  activeCue: PresentationCue | null;
  activeHandId: string | null;
  allowedActions: readonly BlackjackActionV2[];
  cards: readonly PresentationCard[];
  game: "blackjack" | "roulette" | null;
  lastPlan: PresentationIntent | null;
  lastSequence: number;
  revision: number;
  rouletteBets: readonly RouletteBetV2[];
  rouletteResult: { colour: "red" | "black" | "green"; pocket: number } | null;
  roundId: string | null;
  stage: PresentationStage;
  tableId: string | null;
  transitionId: number;
}

export function createInitialPresentationState(): PresentationState {
  return {
    activeCue: null,
    activeHandId: null,
    allowedActions: [],
    cards: [],
    game: null,
    lastPlan: null,
    lastSequence: 0,
    revision: 0,
    rouletteBets: [],
    rouletteResult: null,
    roundId: null,
    stage: "idle",
    tableId: null,
    transitionId: 0,
  };
}

function cue<K extends PresentationCueId>(cueId: K, event: CueEventMap[K]): PresentationCueFor<K> {
  const definition = presentationCueDefinitions[cueId];
  return {
    actor: definition[0],
    clip: definition[1],
    cueId,
    data: event.payload,
    eventType: event.type,
    kind: "cue",
    reducedMotionText: definition[2],
    sourceEventId: event.eventId,
  } as PresentationCueFor<K>;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled GameEventV2: ${JSON.stringify(value)}`);
}

export function planGameEvent(event: GameEventV2): PresentationIntent {
  switch (event.type) {
    case "round.prepared":
      return event.payload.game === "blackjack"
        ? cue("blackjack.round-prepared", event)
        : cue("roulette.round-prepared", event);
    case "round.started":
      return event.payload.game === "blackjack"
        ? cue("blackjack.round-start", event)
        : cue("roulette.round-start", event);
    case "blackjack.bet.accepted":
      return cue("blackjack.bet-accepted", event);
    case "blackjack.card.dealt":
      return cue("blackjack.deal-card", event);
    case "blackjack.card.revealed":
      return cue("blackjack.reveal-card", event);
    case "blackjack.action.accepted":
      return {
        eventType: event.type,
        ignoreId: "blackjack.action-accepted-ignore",
        kind: "ignore",
        reason: "Eventet kvitterar spelarens avsikt men skapar ingen egen animation; efterföljande kort-, split- och turn-events styr presentationen.",
        sourceEventId: event.eventId,
      };
    case "blackjack.hand.split":
      return cue("blackjack.split-hand", event);
    case "blackjack.turn.changed":
      return cue("blackjack.turn-change", event);
    case "blackjack.hand.settled":
      return cue("blackjack.hand-settled", event);
    case "roulette.betting.opened":
      return cue("roulette.betting-opened", event);
    case "roulette.bet.placed":
      return cue("roulette.bet-placed", event);
    case "roulette.bets.locked":
      return cue("roulette.bets-locked", event);
    case "roulette.spin.started":
      return cue("roulette.spin-started", event);
    case "roulette.result":
      return cue("roulette.land-pocket", event);
    case "roulette.bet.settled":
      return cue("roulette.bet-settled", event);
    case "round.settled": {
      if (event.payload.game === "blackjack") {
        switch (event.payload.outcome) {
          case "win": return cue("blackjack.settled-win", event);
          case "loss": return cue("blackjack.settled-loss", event);
          case "push": return cue("blackjack.settled-push", event);
          case "mixed": return cue("blackjack.settled-mixed", event);
        }
      }
      switch (event.payload.outcome) {
        case "win": return cue("roulette.settled-win", event);
        case "loss": return cue("roulette.settled-loss", event);
        case "push": return cue("roulette.settled-push", event);
        case "mixed": return cue("roulette.settled-mixed", event);
      }
      return assertNever(event.payload.outcome);
    }
    default:
      return assertNever(event);
  }
}

function resetRoundState(state: PresentationState): PresentationState {
  return {
    ...state,
    activeCue: null,
    activeHandId: null,
    allowedActions: [],
    cards: [],
    game: null,
    lastPlan: null,
    rouletteBets: [],
    rouletteResult: null,
    roundId: null,
    stage: "idle",
  };
}

export function projectGameEvent(current: PresentationState, event: GameEventV2): PresentationState {
  if (current.tableId === null && (event.sequence !== 1 || event.type !== "round.prepared")) {
    return current;
  }
  if (current.tableId === event.tableId) {
    if (event.sequence <= current.lastSequence || event.revision < current.revision) {
      return current;
    }
    if (current.lastSequence > 0 && event.sequence !== current.lastSequence + 1) {
      return current;
    }
  }

  let state = current;
  if (state.tableId !== null && state.tableId !== event.tableId) {
    return current;
  }
  if (state.roundId !== null && state.roundId !== event.roundId) {
    if (event.type !== "round.prepared") {
      return current;
    }
    state = resetRoundState(state);
  }

  const plan = planGameEvent(event);
  if (plan.kind === "ignore") {
    return {
      ...state,
      game: "blackjack",
      lastPlan: plan,
      lastSequence: event.sequence,
      revision: event.revision,
      roundId: event.roundId,
      tableId: event.tableId,
    };
  }
  let next: PresentationState = {
    ...state,
    activeCue: plan,
    lastPlan: plan,
    lastSequence: event.sequence,
    revision: event.revision,
    roundId: event.roundId,
    tableId: event.tableId,
    transitionId: state.transitionId + 1,
  };

  switch (event.type) {
    case "round.prepared":
      next = {
        ...resetRoundState(next),
        activeCue: plan.kind === "cue" ? plan : null,
        game: event.payload.game,
        lastPlan: plan,
        lastSequence: event.sequence,
        revision: event.revision,
        roundId: event.roundId,
        stage: "prepared",
        tableId: event.tableId,
        transitionId: state.transitionId + 1,
      };
      break;
    case "round.started":
      next = { ...next, game: event.payload.game, stage: "active" };
      break;
    case "blackjack.bet.accepted":
      next = { ...next, game: "blackjack", stage: "active" };
      break;
    case "blackjack.card.dealt":
      next = {
        ...next,
        cards: [
          ...next.cards,
          event.payload.faceUp
            ? {
                card: event.payload.card,
                faceUp: true,
                handId: event.payload.handId,
                recipient: event.payload.recipient,
                visualId: event.eventId,
              }
            : {
                faceUp: false,
                handId: "dealer",
                recipient: "dealer",
                visualId: event.eventId,
              },
        ],
        game: "blackjack",
        stage: "active",
      };
      break;
    case "blackjack.card.revealed": {
      const hiddenIndex = next.cards.findIndex((card) => !card.faceUp);
      if (hiddenIndex < 0) {
        return current;
      }
      const revealedCard: PresentationCard = {
        card: event.payload.card,
        faceUp: true,
        handId: event.payload.handId,
        recipient: "dealer",
        visualId: next.cards[hiddenIndex]?.visualId ?? event.eventId,
      };
      next = {
        ...next,
        cards: next.cards.map((card, index) => index === hiddenIndex ? revealedCard : card),
        game: "blackjack",
        stage: "active",
      };
      break;
    }
    case "blackjack.action.accepted":
    case "blackjack.hand.split":
      next = { ...next, game: "blackjack", stage: "active" };
      break;
    case "blackjack.turn.changed":
      next = {
        ...next,
        activeHandId: event.payload.activeHandId,
        allowedActions: event.payload.allowedActions,
        game: "blackjack",
        stage: event.payload.phase === "settled" ? "settling" : "active",
      };
      break;
    case "blackjack.hand.settled":
      next = { ...next, game: "blackjack", stage: "settling" };
      break;
    case "roulette.betting.opened":
      next = { ...next, game: "roulette", stage: "roulette-betting" };
      break;
    case "roulette.bet.placed":
      next = {
        ...next,
        game: "roulette",
        rouletteBets: [...next.rouletteBets, event.payload.bet],
        stage: "roulette-betting",
      };
      break;
    case "roulette.bets.locked":
      next = { ...next, game: "roulette", stage: "roulette-locked" };
      break;
    case "roulette.spin.started":
      next = { ...next, game: "roulette", stage: "roulette-spinning" };
      break;
    case "roulette.result":
      next = {
        ...next,
        game: "roulette",
        rouletteResult: event.payload,
        stage: "roulette-result",
      };
      break;
    case "roulette.bet.settled":
      next = { ...next, game: "roulette", stage: "settling" };
      break;
    case "round.settled":
      next = {
        ...next,
        activeHandId: null,
        allowedActions: [],
        game: event.payload.game,
        stage: "settled",
      };
      break;
    default:
      return assertNever(event);
  }

  return next;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let currentState = createInitialPresentationState();
const serverState = createInitialPresentationState();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export const presentationStore = {
  dispatch(input: unknown): boolean {
    const parsed = gameEventV2Schema.safeParse(input);
    if (!parsed.success) {
      return false;
    }
    const next = projectGameEvent(currentState, parsed.data);
    if (next !== currentState) {
      currentState = next;
      emit();
      return true;
    }
    return false;
  },
  getSnapshot(): PresentationState {
    return currentState;
  },
  reset(): void {
    currentState = {
      ...createInitialPresentationState(),
      transitionId: currentState.transitionId + 1,
    };
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function usePresentationState(): PresentationState {
  return useSyncExternalStore(
    presentationStore.subscribe,
    presentationStore.getSnapshot,
    () => serverState,
  );
}

const demoTableId = "table-roulette-demo";
const demoRoundId = "22222222-2222-4222-8222-222222222223";
const demoBase = {
  occurredAt: "2026-08-18T00:00:00.000Z",
  roundId: demoRoundId,
  schemaVersion: 2 as const,
  tableId: demoTableId,
};

const recordedRouletteDemoEvents = [
    {
      ...demoBase,
      eventId: "33333333-3333-4333-8333-333333333310",
      payload: {
        commitment: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        fairnessAlgorithm: "pf-v1",
        game: "roulette",
        nonce: 0,
        rulesetHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        rulesetId: "mvp-v2",
      },
      revision: 1,
      sequence: 1,
      type: "round.prepared",
    },
    {
      ...demoBase,
      eventId: "33333333-3333-4333-8333-333333333311",
      payload: {},
      revision: 1,
      sequence: 2,
      type: "roulette.betting.opened",
    },
    {
      ...demoBase,
      eventId: "33333333-3333-4333-8333-333333333312",
      payload: {
        bet: {
          amount: "25",
          betId: "bet-1",
          currency: "PLAY",
          selection: { pocket: 17, type: "straight" },
        },
        totalWager: "25",
      },
      revision: 2,
      sequence: 3,
      type: "roulette.bet.placed",
    },
    {
      ...demoBase,
      eventId: "33333333-3333-4333-8333-333333333318",
      payload: { game: "roulette", totalWager: "25" },
      revision: 2,
      sequence: 4,
      type: "round.started",
    },
    {
      ...demoBase,
      eventId: "33333333-3333-4333-8333-333333333313",
      payload: { betCount: 1, totalWager: "25" },
      revision: 3,
      sequence: 5,
      type: "roulette.bets.locked",
    },
    {
      ...demoBase,
      eventId: "33333333-3333-4333-8333-333333333314",
      payload: {},
      revision: 3,
      sequence: 6,
      type: "roulette.spin.started",
    },
    {
      ...demoBase,
      eventId: "33333333-3333-4333-8333-333333333315",
      payload: { colour: "black", pocket: 17 },
      revision: 3,
      sequence: 7,
      type: "roulette.result",
    },
    {
      ...demoBase,
      eventId: "33333333-3333-4333-8333-333333333316",
      payload: { betId: "bet-1", payout: "900", won: true },
      revision: 4,
      sequence: 8,
      type: "roulette.bet.settled",
    },
    {
      ...demoBase,
      eventId: "33333333-3333-4333-8333-333333333317",
      payload: {
        balance: "10875",
        fairness: {
          algorithm: "pf-v1",
          clientSeed: "client-seed-002",
          nonce: 0,
          serverSeed: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
        game: "roulette",
        outcome: "win",
        totalPayout: "900",
        totalWager: "25",
      },
      revision: 4,
      sequence: 9,
      type: "round.settled",
    },
] as const satisfies readonly GameEventV2[];

export const recordedRouletteDemo = {
  events: gameEventV2Schema.array().parse(recordedRouletteDemoEvents),
  game: "roulette",
  source: "recorded-demo",
} as const;
