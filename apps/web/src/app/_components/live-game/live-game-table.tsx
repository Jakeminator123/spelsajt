"use client";

import {
  gameCommandV2Schema,
  type GameCommandV2,
  type GameEventV2,
  type GameSnapshotV2,
  type PublicCardV2,
  type RouletteSelectionV2,
} from "@spelsajt/contracts";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { SceneLoader } from "../scene-loader";
import { presentationStore } from "../scene/presentation";
import {
  connectGameRealtime,
  getGameSnapshot,
  sendGameCommand,
  type GameRealtimeConnection,
} from "./game-client";
import {
  browserSupabaseClient,
  ensurePlaySession,
  publicGameConfiguration,
  tableIdForUser,
  type PublicGameConfiguration,
} from "./game-session";
import {
  connectionLabel,
  initialLiveGameState,
  reduceLiveGameState,
} from "./live-game-state";
import styles from "./live-game.module.css";

type GameName = "blackjack" | "roulette";
type BlackjackAction = Extract<
  GameCommandV2,
  { type: "BLACKJACK_ACTION" }
>["payload"]["action"];
type BlackjackSnapshot = Extract<GameSnapshotV2, { game: "blackjack" }>;
type RouletteSnapshot = Extract<GameSnapshotV2, { game: "roulette" }>;

const gameCopy = {
  blackjack: {
    eyebrow: "LIVE BLACKJACK",
    title: "Blackjackbord",
    description: "Sex lekar · S17 · 3:2 blackjack · servern delar och avgör",
  },
  roulette: {
    eyebrow: "LIVE ROULETTE",
    title: "Europeisk roulette",
    description: "Single zero · 37 fickor · serverägd spin och settlement",
  },
} as const;

export function LiveGameTable({ game }: { game: GameName }) {
  const [state, dispatch] = useReducer(reduceLiveGameState, initialLiveGameState);
  const configurationRef = useRef<PublicGameConfiguration | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const tableIdRef = useRef<string | null>(null);
  const realtimeRef = useRef<GameRealtimeConnection | null>(null);
  const lastPresentedSequenceRef = useRef(0);

  useEffect(() => {
    let active = true;
    let stopAuthListener: (() => void) | null = null;
    presentationStore.reset();
    const configuration = publicGameConfiguration();
    configurationRef.current = configuration;
    if (!configuration) {
      dispatch({
        type: "load.failed",
        issue: "Livebordet saknar publik Supabase- eller spelserverkonfiguration.",
      });
      return () => presentationStore.reset();
    }

    const client = browserSupabaseClient(configuration);
    void (async () => {
      try {
        const session = await ensurePlaySession(client);
        if (!active) return;
        accessTokenRef.current = session.access_token;
        const tableId = tableIdForUser(game, session.user.id);
        tableIdRef.current = tableId;
        const snapshot = await getGameSnapshot({
          accessToken: session.access_token,
          gameServerUrl: configuration.gameServerUrl,
          tableId,
        });
        if (!active) return;
        if (snapshot && snapshot.game !== game) {
          throw new Error("Bordets sparade speltyp matchar inte den här sidan.");
        }
        lastPresentedSequenceRef.current = snapshot?.lastSequence ?? 0;
        if (snapshot) presentationStore.anchor(snapshot);
        dispatch({ type: "load.succeeded", snapshot });

        const realtime = connectGameRealtime(
          configuration.gameServerUrl,
          session.access_token,
          {
            onError: (issue) => {
              if (!active) return;
              dispatch({ type: "command.failed", issue });
            },
            onEvent: (event) => {
              if (!active || event.tableId !== tableId) return;
              if (event.sequence <= lastPresentedSequenceRef.current) return;
              if (event.sequence !== lastPresentedSequenceRef.current + 1) {
                dispatch({
                  type: "command.failed",
                  issue: "Liveflödet fick ett sekvensgap och inväntar ett nytt snapshot.",
                });
                realtimeRef.current?.subscribe(tableId, lastPresentedSequenceRef.current);
                return;
              }
              if (!presentationStore.dispatch(event)) {
                dispatch({
                  type: "command.failed",
                  issue: "Livehändelsen kunde inte förankras i presentationen.",
                });
                realtimeRef.current?.subscribe(tableId, lastPresentedSequenceRef.current);
                return;
              }
              lastPresentedSequenceRef.current = event.sequence;
              dispatch({ type: "event.received", event });
            },
            onSnapshot: (nextSnapshot) => {
              if (!active || nextSnapshot.tableId !== tableId || nextSnapshot.game !== game) return;
              presentationStore.anchor(nextSnapshot);
              lastPresentedSequenceRef.current = Math.max(
                lastPresentedSequenceRef.current,
                nextSnapshot.lastSequence,
              );
              dispatch({ type: "snapshot.received", snapshot: nextSnapshot });
            },
            onStatus: (connection) => {
              if (!active) return;
              dispatch({
                type: "connection.changed",
                connection,
              });
              if (connection === "connected" || connection === "live") {
                dispatch({ type: "issue.cleared" });
              }
            },
          },
        );
        realtimeRef.current = realtime;
        if (snapshot) realtime.subscribe(tableId, snapshot.lastSequence);

        const authListener = client.auth.onAuthStateChange((_event, nextSession) => {
          if (!active || !nextSession?.access_token) return;
          if (nextSession.access_token === accessTokenRef.current) return;
          accessTokenRef.current = nextSession.access_token;
          realtime.refreshAccessToken(nextSession.access_token);
        });
        stopAuthListener = () => authListener.data.subscription.unsubscribe();
      } catch (error) {
        if (!active) return;
        dispatch({ type: "load.failed", issue: sessionErrorMessage(error) });
      }
    })();

    return () => {
      active = false;
      stopAuthListener?.();
      realtimeRef.current?.close();
      realtimeRef.current = null;
      accessTokenRef.current = null;
      tableIdRef.current = null;
      presentationStore.reset();
    };
  }, [game]);

  const execute = useCallback(async (rawCommand: unknown) => {
    const configuration = configurationRef.current;
    const accessToken = accessTokenRef.current;
    const tableId = tableIdRef.current;
    if (!configuration || !accessToken || !tableId) {
      dispatch({ type: "command.failed", issue: "Livebordet är inte anslutet ännu." });
      return;
    }
    const parsed = gameCommandV2Schema.safeParse(rawCommand);
    if (!parsed.success) {
      dispatch({
        type: "command.failed",
        issue: parsed.error.issues[0]?.message ?? "Kommandot är ogiltigt.",
      });
      return;
    }

    const tableExisted = state.snapshot !== null;
    dispatch({ type: "command.started" });
    try {
      const acknowledgement = await sendGameCommand({
        accessToken,
        command: parsed.data,
        gameServerUrl: configuration.gameServerUrl,
        tableId,
      });
      if (acknowledgement.status === "rejected") {
        if (acknowledgement.error.code === "STALE_REVISION") {
          const snapshot = await getGameSnapshot({
            accessToken,
            gameServerUrl: configuration.gameServerUrl,
            tableId,
          });
          if (snapshot?.game === game) {
            presentationStore.anchor(snapshot);
            lastPresentedSequenceRef.current = Math.max(
              lastPresentedSequenceRef.current,
              snapshot.lastSequence,
            );
            dispatch({ type: "snapshot.received", snapshot });
          }
        }
        dispatch({
          type: "command.failed",
          issue: commandErrorMessage(acknowledgement.error.code, acknowledgement.error.detail),
        });
        return;
      }
      if (acknowledgement.snapshot.game !== game) {
        throw new Error("Spelservern svarade med fel speltyp.");
      }
      if (state.connection !== "live") {
        presentationStore.anchor(acknowledgement.snapshot);
        lastPresentedSequenceRef.current = Math.max(
          lastPresentedSequenceRef.current,
          acknowledgement.snapshot.lastSequence,
        );
      }
      dispatch({ type: "command.finished", snapshot: acknowledgement.snapshot });
      if (!tableExisted) {
        realtimeRef.current?.subscribe(tableId, acknowledgement.snapshot.lastSequence);
      }
    } catch (error) {
      dispatch({ type: "command.failed", issue: errorMessage(error) });
    }
  }, [game, state.connection, state.snapshot]);

  const commandBase = useCallback(() => {
    const tableId = tableIdRef.current;
    if (!tableId) return null;
    return {
      commandId: crypto.randomUUID(),
      expectedRevision: state.snapshot?.revision ?? 0,
      issuedAt: new Date().toISOString(),
      schemaVersion: 2 as const,
      tableId,
    };
  }, [state.snapshot?.revision]);

  const prepareRound = useCallback(() => {
    const base = commandBase();
    if (!base) return;
    void execute({ ...base, payload: { game }, type: "PREPARE_ROUND" });
  }, [commandBase, execute, game]);

  const placeBlackjackBet = useCallback((amount: string, roundId: string) => {
    const base = commandBase();
    if (!base) return;
    void execute({
      ...base,
      payload: {
        amount,
        clientSeed: `web-${crypto.randomUUID()}`,
        currency: "PLAY",
        roundId,
      },
      type: "BLACKJACK_PLACE_BET",
    });
  }, [commandBase, execute]);

  const playBlackjackAction = useCallback((
    action: BlackjackAction,
    handId: string,
    roundId: string,
  ) => {
    const base = commandBase();
    if (!base) return;
    void execute({
      ...base,
      payload: { action, handId, roundId },
      type: "BLACKJACK_ACTION",
    });
  }, [commandBase, execute]);

  const placeRouletteBet = useCallback((
    amount: string,
    selection: RouletteSelectionV2,
    roundId: string,
  ) => {
    const base = commandBase();
    if (!base) return;
    void execute({
      ...base,
      payload: {
        bets: [{
          amount,
          betId: `bet-${crypto.randomUUID()}`,
          currency: "PLAY",
          selection,
        }],
        clientSeed: `web-${crypto.randomUUID()}`,
        roundId,
      },
      type: "ROULETTE_PLACE_BETS",
    });
  }, [commandBase, execute]);

  const spinRoulette = useCallback((roundId: string) => {
    const base = commandBase();
    if (!base) return;
    void execute({ ...base, payload: { roundId }, type: "ROULETTE_SPIN" });
  }, [commandBase, execute]);

  const copy = gameCopy[game];
  const snapshot = state.snapshot?.game === game ? state.snapshot : null;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>S</span>
          <span>Spelsajt</span>
        </Link>
        <nav className={styles.navigation} aria-label="Spel">
          <Link aria-current={game === "blackjack" ? "page" : undefined} href="/blackjack">
            Blackjack
          </Link>
          <Link aria-current={game === "roulette" ? "page" : undefined} href="/roulette">
            Roulette
          </Link>
          <Link href="/system">System</Link>
        </nav>
        <span className={styles.connection} data-status={state.connection}>
          <i /> {connectionLabel(state.connection)}
        </span>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <div className={styles.balance}>
          <span>Saldo</span>
          <strong>{snapshot?.balance ?? "—"}</strong>
          <small>PLAY</small>
        </div>
      </section>

      <div className={styles.tableGrid}>
        <section className={styles.scenePanel} aria-label="Livepresentation från serverevents">
          <SceneLoader game={game} source="live" />
        </section>

        <section className={styles.controls} aria-busy={state.pendingCommand}>
          {state.loading ? (
            <StatusPanel title="Ansluter livebordet" detail="Skapar eller återställer din gästsession…" />
          ) : null}

          {!state.loading && state.issue ? (
            <div className={styles.alert} role="alert">
              <strong>Något behöver åtgärdas</strong>
              <span>{state.issue}</span>
              {state.snapshot ? (
                <button type="button" onClick={() => dispatch({ type: "issue.cleared" })}>
                  Stäng
                </button>
              ) : null}
            </div>
          ) : null}

          {!state.loading && (!state.issue || state.snapshot) && game === "blackjack" ? (
            <BlackjackControls
              busy={state.pendingCommand}
              onAction={playBlackjackAction}
              onBet={placeBlackjackBet}
              onPrepare={prepareRound}
              snapshot={snapshot as BlackjackSnapshot | null}
            />
          ) : null}

          {!state.loading && (!state.issue || state.snapshot) && game === "roulette" ? (
            <RouletteControls
              busy={state.pendingCommand}
              onBet={placeRouletteBet}
              onPrepare={prepareRound}
              onSpin={spinRoulette}
              snapshot={snapshot as RouletteSnapshot | null}
            />
          ) : null}
        </section>
      </div>

      <EventRail events={state.recentEvents} />
    </main>
  );
}

function BlackjackControls({
  busy,
  onAction,
  onBet,
  onPrepare,
  snapshot,
}: {
  readonly busy: boolean;
  readonly onAction: (action: BlackjackAction, handId: string, roundId: string) => void;
  readonly onBet: (amount: string, roundId: string) => void;
  readonly onPrepare: () => void;
  readonly snapshot: BlackjackSnapshot | null;
}) {
  const [wager, setWager] = useState("100");
  if (!snapshot?.round) {
    return <StartPanel busy={busy} game="blackjack" onPrepare={onPrepare} />;
  }
  const round = snapshot.round;
  if (round.phase === "prepared") {
    const validWager = /^(?:[2468]|[1-9]\d*[02468])$/.test(wager) && wager.length <= 11;
    return (
      <div className={styles.controlStack}>
        <ControlHeading title="Placera insats" detail="Jämna heltal i PLAY. Servern kontrollerar saldo och regler." />
        <label className={styles.field}>
          <span>Insats</span>
          <input
            disabled={busy}
            inputMode="numeric"
            min="2"
            onChange={(event) => setWager(event.target.value)}
            step="2"
            type="number"
            value={wager}
          />
        </label>
        <button
          className={styles.primaryAction}
          disabled={busy || !validWager}
          onClick={() => onBet(wager, round.roundId)}
          type="button"
        >
          {busy ? "Delar…" : "Satsa och dela"}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.controlStack}>
      <ControlHeading
        title={round.phase === "settled" ? "Rundan är avgjord" : "Ditt beslut"}
        detail={`Fas: ${round.phase} · revision ${snapshot.revision}`}
      />
      <CardRow cards={round.dealerCards} label="Dealer" />
      <div className={styles.hands}>
        {round.hands.map((hand, index) => (
          <div className={styles.hand} key={hand.handId}>
            <div>
              <strong>Hand {index + 1}</strong>
              <span>{hand.status} · {hand.wager} PLAY</span>
            </div>
            <CardRow cards={hand.cards} label="Kort" compact />
            {hand.outcome ? <b>Utfall: {outcomeLabel(hand.outcome)} · payout {hand.payout}</b> : null}
          </div>
        ))}
      </div>
      {round.phase === "player" ? (
        <div className={styles.actionGrid}>
          {round.hands
            .find((hand) => hand.handId === round.activeHandId)
            ?.allowedActions.map((action) => (
              <button
                disabled={busy}
                key={action}
                onClick={() => onAction(action, round.activeHandId, round.roundId)}
                type="button"
              >
                {blackjackActionLabel(action)}
              </button>
            ))}
        </div>
      ) : null}
      {round.phase === "settled" ? (
        <button className={styles.primaryAction} disabled={busy} onClick={onPrepare} type="button">
          Ny blackjackrunda
        </button>
      ) : null}
    </div>
  );
}

function RouletteControls({
  busy,
  onBet,
  onPrepare,
  onSpin,
  snapshot,
}: {
  readonly busy: boolean;
  readonly onBet: (amount: string, selection: RouletteSelectionV2, roundId: string) => void;
  readonly onPrepare: () => void;
  readonly onSpin: (roundId: string) => void;
  readonly snapshot: RouletteSnapshot | null;
}) {
  const [amount, setAmount] = useState("25");
  const [betKind, setBetKind] = useState<"straight" | "red" | "black">("straight");
  const [pocket, setPocket] = useState("17");
  if (!snapshot?.round) {
    return <StartPanel busy={busy} game="roulette" onPrepare={onPrepare} />;
  }
  const round = snapshot.round;
  if (round.phase === "settled") {
    return (
      <div className={styles.controlStack}>
        <ControlHeading title="Kulan har stannat" detail="Resultatet kommer enbart från serverns fairness-kärna." />
        <div className={styles.rouletteResult} data-colour={round.result.colour}>
          <strong>{round.result.pocket}</strong>
          <span>{round.result.colour}</span>
        </div>
        <p className={styles.settlement}>Total insats {round.totalWager} PLAY · saldo {snapshot.balance} PLAY</p>
        <button className={styles.primaryAction} disabled={busy} onClick={onPrepare} type="button">
          Ny rouletterunda
        </button>
      </div>
    );
  }

  const canBet = round.phase === "betting" || round.phase === "prepared";
  const validAmount = /^[1-9]\d{0,10}$/.test(amount);
  const numericPocket = Number(pocket);
  const validPocket = /^\d{1,2}$/.test(pocket)
    && Number.isInteger(numericPocket)
    && numericPocket >= 0
    && numericPocket <= 36;
  const selection: RouletteSelectionV2 = betKind === "straight"
    ? { pocket: numericPocket, type: "straight" }
    : { colour: betKind, type: "red-black" };

  return (
    <div className={styles.controlStack}>
      <ControlHeading title="Placera marker" detail={`Fas: ${round.phase} · total insats ${round.totalWager} PLAY`} />
      {canBet ? (
        <>
          <div className={styles.betKinds} role="group" aria-label="Typ av rouletteinsats">
            {(["straight", "red", "black"] as const).map((kind) => (
              <button
                aria-pressed={betKind === kind}
                disabled={busy}
                key={kind}
                onClick={() => setBetKind(kind)}
                type="button"
              >
                {kind === "straight" ? "Nummer" : kind === "red" ? "Röd" : "Svart"}
              </button>
            ))}
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span>Insats</span>
              <input
                disabled={busy}
                inputMode="numeric"
                min="1"
                onChange={(event) => setAmount(event.target.value)}
                type="number"
                value={amount}
              />
            </label>
            {betKind === "straight" ? (
              <label className={styles.field}>
                <span>Nummer 0–36</span>
                <input
                  disabled={busy}
                  inputMode="numeric"
                  max="36"
                  min="0"
                  onChange={(event) => setPocket(event.target.value)}
                  type="number"
                  value={pocket}
                />
              </label>
            ) : null}
          </div>
          <button
            className={styles.secondaryAction}
            disabled={busy || !validAmount || (betKind === "straight" && !validPocket)}
            onClick={() => onBet(amount, selection, round.roundId)}
            type="button"
          >
            Lägg till insats
          </button>
        </>
      ) : null}
      {round.bets.length > 0 ? (
        <div className={styles.betList}>
          {round.bets.map((bet) => (
            <span key={bet.betId}>{rouletteBetLabel(bet.selection)} · {bet.amount} PLAY</span>
          ))}
        </div>
      ) : null}
      {canBet && round.bets.length > 0 ? (
        <button className={styles.primaryAction} disabled={busy} onClick={() => onSpin(round.roundId)} type="button">
          {busy ? "Servern spinner…" : "Lås och snurra"}
        </button>
      ) : null}
    </div>
  );
}

function StartPanel({
  busy,
  game,
  onPrepare,
}: {
  readonly busy: boolean;
  readonly game: GameName;
  readonly onPrepare: () => void;
}) {
  return (
    <div className={styles.controlStack}>
      <ControlHeading
        title="Ditt bord är redo att skapas"
        detail="En privat play-money-tabell knyts till din gästsession."
      />
      <button className={styles.primaryAction} disabled={busy} onClick={onPrepare} type="button">
        {busy ? "Förbereder…" : `Starta ${game === "blackjack" ? "blackjack" : "roulette"}`}
      </button>
    </div>
  );
}

function StatusPanel({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <div className={styles.statusPanel} role="status">
      <span className={styles.spinner} />
      <div><strong>{title}</strong><span>{detail}</span></div>
    </div>
  );
}

function ControlHeading({ title, detail }: { readonly title: string; readonly detail: string }) {
  return <div className={styles.controlHeading}><h2>{title}</h2><p>{detail}</p></div>;
}

function CardRow({
  cards,
  compact = false,
  label,
}: {
  readonly cards: readonly PublicCardV2[];
  readonly compact?: boolean;
  readonly label: string;
}) {
  return (
    <div className={styles.cardGroup}>
      <span>{label}</span>
      <div className={compact ? styles.cardsCompact : styles.cards}>
        {cards.map((card, index) => (
          <span className={styles.card} data-hidden={!card.faceUp} key={card.faceUp ? card.card.cardId : `hidden-${index}`}>
            {card.faceUp ? `${card.card.rank}${suitSymbol(card.card.suit)}` : "◆"}
          </span>
        ))}
      </div>
    </div>
  );
}

function EventRail({ events }: { readonly events: readonly GameEventV2[] }) {
  return (
    <section className={styles.eventRail} aria-live="polite">
      <div><span>SERVERHÄNDELSER</span><strong>{events.length ? "Liveflöde" : "Väntar på spel"}</strong></div>
      <ol>
        {events.length ? events.toReversed().map((event) => (
          <li key={event.eventId}><b>#{event.sequence}</b><span>{event.type}</span></li>
        )) : <li><span>Semantiska v2-events visas här.</span></li>}
      </ol>
    </section>
  );
}

function blackjackActionLabel(action: BlackjackAction): string {
  switch (action) {
    case "hit": return "Ta kort";
    case "stand": return "Stanna";
    case "double": return "Dubbla";
    case "split": return "Splitta";
  }
}

function rouletteBetLabel(selection: RouletteSelectionV2): string {
  switch (selection.type) {
    case "straight": return `Nummer ${selection.pocket}`;
    case "red-black": return selection.colour === "red" ? "Röd" : "Svart";
    case "split": return `Split ${selection.pockets.join("/")}`;
    case "street": return `Street ${selection.start}`;
    case "corner": return `Corner ${selection.topLeft}`;
    case "six-line": return `Six-line ${selection.start}`;
    case "column": return `Kolumn ${selection.column}`;
    case "dozen": return `Dussin ${selection.dozen}`;
    case "odd-even": return selection.parity === "odd" ? "Udda" : "Jämn";
    case "low-high": return selection.range === "low" ? "1–18" : "19–36";
  }
  return "Okänd insats";
}

function suitSymbol(suit: "clubs" | "diamonds" | "hearts" | "spades"): string {
  return { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" }[suit];
}

function outcomeLabel(outcome: "win" | "loss" | "push"): string {
  return { loss: "förlust", push: "lika", win: "vinst" }[outcome];
}

function commandErrorMessage(code: string, detail?: string): string {
  if (detail) return detail;
  switch (code) {
    case "INSUFFICIENT_FUNDS": return "PLAY-saldot räcker inte för insatsen.";
    case "STALE_REVISION": return "Bordet hann ändras. Snapshotet har synkats om.";
    case "ILLEGAL_ACTION": return "Handlingen är inte tillåten i bordets nuvarande fas.";
    case "ROUND_NOT_FOUND": return "Rundan hittades inte längre.";
    default: return code;
  }
}

function sessionErrorMessage(error: unknown): string {
  const message = errorMessage(error);
  if (message.includes("anonymous_provider_disabled")) {
    return "Anonymous sign-ins måste aktiveras i Supabase Auth för gästspel.";
  }
  return message;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ett okänt fel inträffade.";
}
