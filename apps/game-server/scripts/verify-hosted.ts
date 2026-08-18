import {
  commandAckV2Schema,
  gameCommandV2Schema,
  gameEventV2Schema,
  gameSnapshotV2Schema,
  serverReadyV2Schema,
  tableSubscriptionAckV2Schema,
  type CommandAckV2,
  type GameCommandV2,
  type GameEventV2,
  type GameSnapshotV2,
  type TableSubscriptionAckV2,
} from "@spelsajt/contracts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { io as createSocket, type Socket } from "socket.io-client";

const DEFAULT_WEB_ORIGIN = "https://spelsajt.vercel.app";
const READY_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_INTERVAL_MS = 2_500;

interface ServerToClientEvents {
  "game.event": (payload: unknown) => void;
  "server.ready": (payload: unknown) => void;
  "table.snapshot": (payload: unknown) => void;
}

interface ClientToServerEvents {
  "table.subscribe": (
    input: unknown,
    acknowledge: (payload: unknown) => void,
  ) => void;
}

type HostedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type AcceptedCommand = Extract<CommandAckV2, { status: "accepted" | "replayed" }>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function configuredUrl(value: string | undefined, label: string): URL {
  assert(value, `${label} is required.`);
  const url = new URL(value);
  assert(
    url.protocol === "https:" || url.protocol === "http:",
    `${label} must use HTTP or HTTPS.`,
  );
  assert(!url.username && !url.password, `${label} must not contain credentials.`);
  return url;
}

function record(value: unknown): Record<string, unknown> {
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "Expected a JSON object.",
  );
  return value as Record<string, unknown>;
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return record(await response.json());
}

async function request(baseUrl: URL, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function waitUntilReady(baseUrl: URL): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastResult = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await request(baseUrl, "/ready");
      lastResult = `HTTP ${response.status}`;
      if (response.status === 200) {
        const body = await json(response);
        assert(
          body.service === "game-server" && body.status === "ready",
          "Unexpected /ready payload.",
        );
        return;
      }
    } catch (error) {
      lastResult = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
  }

  throw new Error(`/ready did not become available within ${READY_TIMEOUT_MS / 1_000}s (${lastResult}).`);
}

async function verifyHttp(baseUrl: URL, webOrigin: URL): Promise<void> {
  await waitUntilReady(baseUrl);

  const health = await request(baseUrl, "/health");
  assert(health.status === 200, `/health returned HTTP ${health.status}.`);
  const healthBody = await json(health);
  assert(
    healthBody.service === "game-server" && healthBody.status === "ok",
    "Unexpected /health payload.",
  );

  const status = await request(baseUrl, "/v1/status");
  assert(status.status === 200, `/v1/status returned HTTP ${status.status}.`);
  const statusBody = await json(status);
  const games = record(statusBody.games);
  assert(statusBody.mode === "play-money", "Hosted server is not in play-money mode.");
  assert(record(games.blackjack).rulesetId === "mvp-v2", "Unexpected blackjack ruleset.");
  assert(record(games.roulette).rulesetId === "mvp-v2", "Unexpected roulette ruleset.");

  const preflight = await request(baseUrl, "/v2/tables/hosted-smoke/commands", {
    headers: {
      "Access-Control-Request-Headers": "authorization,content-type",
      "Access-Control-Request-Method": "POST",
      Origin: webOrigin.origin,
    },
    method: "OPTIONS",
  });
  assert(preflight.ok, `CORS preflight returned HTTP ${preflight.status}.`);
  assert(
    preflight.headers.get("access-control-allow-origin") === webOrigin.origin,
    `CORS does not allow ${webOrigin.origin}.`,
  );

  const unauthenticated = await request(baseUrl, "/v2/tables/hosted-smoke/commands", {
    headers: { "Content-Type": "application/json", Origin: webOrigin.origin },
    method: "POST",
    body: "{}",
  });
  assert(
    unauthenticated.status === 401,
    `Unauthenticated command returned HTTP ${unauthenticated.status}.`,
  );
  assert(
    (await json(unauthenticated)).error === "UNAUTHENTICATED",
    "Command API did not fail closed.",
  );
}

async function verifyUnauthenticatedWebSocket(baseUrl: URL, webOrigin: URL): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = createSocket(baseUrl.origin, {
      auth: { accessToken: "hosted-smoke-invalid-token", schemaVersion: 2 },
      extraHeaders: { Origin: webOrigin.origin },
      forceNew: true,
      reconnection: false,
      timeout: REQUEST_TIMEOUT_MS,
      transports: ["websocket"],
    });
    const timeout = setTimeout(
      () => finish(new Error("WebSocket authentication check timed out.")),
      REQUEST_TIMEOUT_MS + 5_000,
    );

    function finish(error?: Error): void {
      clearTimeout(timeout);
      socket.close();
      if (error) reject(error);
      else resolve();
    }

    socket.once("connect", () => finish(new Error("WebSocket accepted an invalid access token.")));
    socket.once("connect_error", (error) => {
      if (error.message === "UNAUTHENTICATED") finish();
      else finish(new Error(`WebSocket handshake failed unexpectedly: ${error.message}`));
    });
  });
}

function acceptedCommand(acknowledgement: CommandAckV2, label: string): AcceptedCommand {
  if (acknowledgement.status === "rejected") {
    throw new Error(
      `${label} was rejected: ${acknowledgement.error.code}`
      + (acknowledgement.error.detail ? ` (${acknowledgement.error.detail})` : ""),
    );
  }
  return acknowledgement;
}

async function sendCommand(
  baseUrl: URL,
  webOrigin: URL,
  accessToken: string,
  command: GameCommandV2,
): Promise<CommandAckV2> {
  const validated = gameCommandV2Schema.parse(command);
  const response = await request(baseUrl, `/v2/tables/${encodeURIComponent(command.tableId)}/commands`, {
    body: JSON.stringify(validated),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Origin: webOrigin.origin,
    },
    method: "POST",
  });
  const payload = await response.json();
  const acknowledgement = commandAckV2Schema.parse(payload);
  assert(response.ok, `Command ${command.type} returned HTTP ${response.status}.`);
  return acknowledgement;
}

async function connectAuthenticated(
  baseUrl: URL,
  webOrigin: URL,
  accessToken: string,
): Promise<HostedSocket> {
  const socket: HostedSocket = createSocket(baseUrl.origin, {
    auth: { accessToken, schemaVersion: 2 },
    autoConnect: false,
    extraHeaders: { Origin: webOrigin.origin },
    forceNew: true,
    reconnection: false,
    timeout: REQUEST_TIMEOUT_MS,
    transports: ["websocket"],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Authenticated WebSocket ready check timed out."));
    }, REQUEST_TIMEOUT_MS + 5_000);
    socket.once("server.ready", (payload) => {
      try {
        serverReadyV2Schema.parse(payload);
        clearTimeout(timeout);
        socket.removeAllListeners("connect_error");
        resolve();
      } catch (error) {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      }
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      socket.close();
      reject(new Error(`Authenticated WebSocket failed: ${error.message}`));
    });
    socket.connect();
  });

  return socket;
}

async function subscribe(
  socket: HostedSocket,
  tableId: string,
  lastSequence: number,
): Promise<{ acknowledgement: TableSubscriptionAckV2; snapshot: GameSnapshotV2 }> {
  const snapshot = new Promise<GameSnapshotV2>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for the authoritative reconnect snapshot.")),
      REQUEST_TIMEOUT_MS,
    );
    socket.once("table.snapshot", (payload) => {
      try {
        clearTimeout(timeout);
        resolve(gameSnapshotV2Schema.parse(payload));
      } catch (error) {
        reject(error);
      }
    });
  });
  const acknowledgement = new Promise<TableSubscriptionAckV2>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for table.subscribe acknowledgement.")),
      REQUEST_TIMEOUT_MS,
    );
    socket.emit("table.subscribe", { lastSequence, schemaVersion: 2, tableId }, (payload) => {
      try {
        clearTimeout(timeout);
        resolve(tableSubscriptionAckV2Schema.parse(payload));
      } catch (error) {
        reject(error);
      }
    });
  });

  const [subscription, authoritativeSnapshot] = await Promise.all([acknowledgement, snapshot]);
  assert(subscription.status === "accepted", "Hosted table subscription was rejected.");
  assert(subscription.tableId === tableId, "Subscription acknowledgement changed tableId.");
  assert(authoritativeSnapshot.tableId === tableId, "Reconnect snapshot changed tableId.");
  assert(
    subscription.lastSequence === authoritativeSnapshot.lastSequence,
    "Subscription and snapshot sequence anchors differ.",
  );
  return { acknowledgement: subscription, snapshot: authoritativeSnapshot };
}

class EventCollector {
  readonly events: GameEventV2[] = [];
  readonly #socket: HostedSocket;
  readonly #tableId: string;
  #failure: Error | null = null;
  #nextSequence: number;
  readonly #waiters = new Set<{
    reject: (error: Error) => void;
    resolve: () => void;
    target: number;
    timeout: NodeJS.Timeout;
  }>();
  readonly #listener = (payload: unknown): void => {
    try {
      const event = gameEventV2Schema.parse(payload);
      assert(event.tableId === this.#tableId, "Realtime event crossed table ownership.");
      assert(
        event.sequence === this.#nextSequence,
        `Realtime sequence jumped from ${this.#nextSequence - 1} to ${event.sequence}.`,
      );
      this.events.push(event);
      this.#nextSequence += 1;
      this.#resolveWaiters();
    } catch (error) {
      this.#failure = error instanceof Error ? error : new Error(String(error));
      for (const waiter of this.#waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(this.#failure);
      }
      this.#waiters.clear();
    }
  };

  constructor(socket: HostedSocket, tableId: string, startSequence: number) {
    this.#socket = socket;
    this.#tableId = tableId;
    this.#nextSequence = startSequence + 1;
    socket.on("game.event", this.#listener);
  }

  close(): void {
    this.#socket.off("game.event", this.#listener);
    for (const waiter of this.#waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("Event collector closed before the target sequence arrived."));
    }
    this.#waiters.clear();
  }

  waitThrough(target: number): Promise<void> {
    if (this.#failure) return Promise.reject(this.#failure);
    if (this.#nextSequence > target) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = {
        reject,
        resolve,
        target,
        timeout: setTimeout(() => {
          this.#waiters.delete(waiter);
          reject(new Error(`Timed out waiting for realtime sequence ${target}.`));
        }, REQUEST_TIMEOUT_MS),
      };
      this.#waiters.add(waiter);
    });
  }

  #resolveWaiters(): void {
    for (const waiter of this.#waiters) {
      if (this.#nextSequence <= waiter.target) continue;
      clearTimeout(waiter.timeout);
      this.#waiters.delete(waiter);
      waiter.resolve();
    }
  }
}

function commandBase(tableId: string, expectedRevision: number) {
  return {
    commandId: crypto.randomUUID(),
    expectedRevision,
    issuedAt: new Date().toISOString(),
    schemaVersion: 2 as const,
    tableId,
  };
}

function assertHiddenDealerCardIsOpaque(snapshot: GameSnapshotV2): void {
  if (snapshot.game !== "blackjack" || snapshot.round?.game !== "blackjack") return;
  const hidden = snapshot.round.dealerCards.find((card) => !card.faceUp);
  if (!hidden) return;
  assert(!JSON.stringify(hidden).includes("cardId"), "Reconnect snapshot leaked a hidden card.");
}

async function verifyBlackjack(
  baseUrl: URL,
  webOrigin: URL,
  accessToken: string,
  userId: string,
): Promise<{ reconnectFrom: number; settledAt: number }> {
  const tableId = `hosted-blackjack-${userId}`;
  const prepare = acceptedCommand(await sendCommand(baseUrl, webOrigin, accessToken, {
    ...commandBase(tableId, 0),
    payload: { game: "blackjack" },
    type: "PREPARE_ROUND",
  }), "Blackjack prepare");
  assert(prepare.status === "accepted", "A fresh blackjack prepare was unexpectedly replayed.");
  assert(prepare.snapshot.game === "blackjack", "Blackjack prepare returned another game.");
  assert(prepare.snapshot.round?.phase === "prepared", "Blackjack did not enter prepared phase.");
  const roundId = prepare.snapshot.round.roundId;

  const firstSocket = await connectAuthenticated(baseUrl, webOrigin, accessToken);
  const firstSubscription = await subscribe(firstSocket, tableId, 0);
  const disconnectedAt = firstSubscription.snapshot.lastSequence;
  firstSocket.close();

  const betCommand = gameCommandV2Schema.parse({
    ...commandBase(tableId, prepare.revision),
    payload: {
      amount: "100",
      clientSeed: "hosted-blackjack-reconnect-v1",
      currency: "PLAY",
      roundId,
    },
    type: "BLACKJACK_PLACE_BET",
  });
  const bet = acceptedCommand(
    await sendCommand(baseUrl, webOrigin, accessToken, betCommand),
    "Blackjack bet",
  );
  assert(bet.status === "accepted", "A fresh blackjack bet was unexpectedly replayed.");
  const betReplay = acceptedCommand(
    await sendCommand(baseUrl, webOrigin, accessToken, betCommand),
    "Blackjack bet replay",
  );
  assert(betReplay.status === "replayed", "Blackjack idempotency replay was not recognized.");
  assert(betReplay.lastSequence === bet.lastSequence, "Blackjack replay appended events.");
  assert(
    betReplay.snapshot.balance === bet.snapshot.balance,
    "Blackjack bet replay changed the authoritative balance.",
  );

  const reconnected = await connectAuthenticated(baseUrl, webOrigin, accessToken);
  const reconnect = await subscribe(reconnected, tableId, disconnectedAt);
  assert(
    reconnect.snapshot.lastSequence > disconnectedAt,
    "Blackjack reconnect did not advance from the disconnected sequence.",
  );
  assert(reconnect.snapshot.game === "blackjack", "Blackjack reconnect returned another game.");
  assertHiddenDealerCardIsOpaque(reconnect.snapshot);

  let finalSnapshot = reconnect.snapshot;
  if (reconnect.snapshot.round?.phase === "player") {
    const collector = new EventCollector(
      reconnected,
      tableId,
      reconnect.snapshot.lastSequence,
    );
    const standCommand = gameCommandV2Schema.parse({
      ...commandBase(tableId, reconnect.snapshot.revision),
      payload: {
        action: "stand",
        handId: reconnect.snapshot.round.activeHandId,
        roundId,
      },
      type: "BLACKJACK_ACTION",
    });
    const stand = acceptedCommand(
      await sendCommand(baseUrl, webOrigin, accessToken, standCommand),
      "Blackjack stand",
    );
    await collector.waitThrough(stand.lastSequence);
    assert(
      collector.events.some((event) => event.type === "round.settled"),
      "Blackjack live stream omitted round.settled.",
    );
    collector.close();
    const standReplay = acceptedCommand(
      await sendCommand(baseUrl, webOrigin, accessToken, standCommand),
      "Blackjack stand replay",
    );
    assert(standReplay.status === "replayed", "Blackjack action replay was not recognized.");
    assert(standReplay.lastSequence === stand.lastSequence, "Blackjack action replay appended events.");
    assert(
      standReplay.snapshot.balance === stand.snapshot.balance,
      "Blackjack action replay changed the authoritative balance.",
    );
    assert(stand.snapshot.game === "blackjack", "Blackjack stand returned another game.");
    finalSnapshot = stand.snapshot;
  }

  reconnected.close();
  assert(finalSnapshot.game === "blackjack", "Blackjack final snapshot changed game.");
  assert(finalSnapshot.round?.phase === "settled", "Blackjack did not settle.");
  assert(/^\d+$/.test(finalSnapshot.balance), "Blackjack balance is not an integer string.");
  return { reconnectFrom: disconnectedAt, settledAt: finalSnapshot.lastSequence };
}

async function verifyRoulette(
  baseUrl: URL,
  webOrigin: URL,
  accessToken: string,
  userId: string,
): Promise<{ pocket: number; reconnectFrom: number; settledAt: number }> {
  const tableId = `hosted-roulette-${userId}`;
  const prepare = acceptedCommand(await sendCommand(baseUrl, webOrigin, accessToken, {
    ...commandBase(tableId, 0),
    payload: { game: "roulette" },
    type: "PREPARE_ROUND",
  }), "Roulette prepare");
  assert(prepare.status === "accepted", "A fresh roulette prepare was unexpectedly replayed.");
  assert(prepare.snapshot.game === "roulette", "Roulette prepare returned another game.");
  assert(prepare.snapshot.round?.phase === "betting", "Roulette did not open betting.");
  const roundId = prepare.snapshot.round.roundId;

  const socket = await connectAuthenticated(baseUrl, webOrigin, accessToken);
  const subscription = await subscribe(socket, tableId, 0);
  const collector = new EventCollector(socket, tableId, subscription.snapshot.lastSequence);
  const betCommand = gameCommandV2Schema.parse({
    ...commandBase(tableId, prepare.revision),
    payload: {
      bets: [{
        amount: "25",
        betId: `hosted-straight-${crypto.randomUUID()}`,
        currency: "PLAY",
        selection: { pocket: 17, type: "straight" },
      }],
      clientSeed: "hosted-roulette-reconnect-v1",
      roundId,
    },
    type: "ROULETTE_PLACE_BETS",
  });
  const bet = acceptedCommand(
    await sendCommand(baseUrl, webOrigin, accessToken, betCommand),
    "Roulette bet",
  );
  await collector.waitThrough(bet.lastSequence);
  assert(
    collector.events.some((event) => event.type === "roulette.bet.placed"),
    "Roulette live stream omitted roulette.bet.placed.",
  );
  collector.close();
  const disconnectedAt = bet.lastSequence;
  socket.close();

  const spinCommand = gameCommandV2Schema.parse({
    ...commandBase(tableId, bet.revision),
    payload: { roundId },
    type: "ROULETTE_SPIN",
  });
  const spin = acceptedCommand(
    await sendCommand(baseUrl, webOrigin, accessToken, spinCommand),
    "Roulette spin",
  );
  assert(spin.status === "accepted", "A fresh roulette spin was unexpectedly replayed.");
  const spinReplay = acceptedCommand(
    await sendCommand(baseUrl, webOrigin, accessToken, spinCommand),
    "Roulette spin replay",
  );
  assert(spinReplay.status === "replayed", "Roulette idempotency replay was not recognized.");
  assert(spinReplay.lastSequence === spin.lastSequence, "Roulette replay appended events.");
  assert(
    spinReplay.snapshot.balance === spin.snapshot.balance,
    "Roulette replay changed the authoritative balance.",
  );

  const reconnected = await connectAuthenticated(baseUrl, webOrigin, accessToken);
  const reconnect = await subscribe(reconnected, tableId, disconnectedAt);
  reconnected.close();
  assert(
    reconnect.snapshot.lastSequence > disconnectedAt,
    "Roulette reconnect did not advance from the disconnected sequence.",
  );
  assert(reconnect.snapshot.game === "roulette", "Roulette reconnect returned another game.");
  assert(reconnect.snapshot.round?.phase === "settled", "Roulette did not settle.");
  assert(reconnect.snapshot.round.result !== null, "Roulette settled without a result.");
  assert(/^\d+$/.test(reconnect.snapshot.balance), "Roulette balance is not an integer string.");
  return {
    pocket: reconnect.snapshot.round.result.pocket,
    reconnectFrom: disconnectedAt,
    settledAt: reconnect.snapshot.lastSequence,
  };
}

async function verifyGameplay(
  baseUrl: URL,
  webOrigin: URL,
  supabaseUrl: URL,
  supabasePublishableKey: string,
): Promise<void> {
  const client: SupabaseClient = createClient(supabaseUrl.origin, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const signedIn = await client.auth.signInAnonymously();
  if (signedIn.error) throw signedIn.error;
  const session = signedIn.data.session;
  assert(session, "Supabase did not create an anonymous hosted-test session.");

  try {
    const blackjack = await verifyBlackjack(
      baseUrl,
      webOrigin,
      session.access_token,
      session.user.id,
    );
    const roulette = await verifyRoulette(
      baseUrl,
      webOrigin,
      session.access_token,
      session.user.id,
    );
    process.stdout.write(
      "Authenticated hosted gameplay passed: "
      + `blackjack reconnected after ${blackjack.reconnectFrom} and settled at ${blackjack.settledAt}; `
      + `roulette reconnected after ${roulette.reconnectFrom}, settled at ${roulette.settledAt} `
      + `with pocket ${roulette.pocket}.\n`,
    );
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}

const argumentsWithoutSeparator = process.argv.slice(2).filter((argument) => argument !== "--");
const gameplayRequested = argumentsWithoutSeparator.includes("--gameplay");
const hostedUrl = argumentsWithoutSeparator.find((argument) => !argument.startsWith("--"));
const unknownFlags = argumentsWithoutSeparator.filter(
  (argument) => argument.startsWith("--") && argument !== "--gameplay",
);
assert(unknownFlags.length === 0, `Unknown option: ${unknownFlags.join(", ")}.`);

const baseUrl = configuredUrl(hostedUrl, "Hosted game-server URL");
const webOrigin = configuredUrl(process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN, "WEB_ORIGIN");

process.stdout.write(
  `Verifying ${baseUrl.origin} for ${webOrigin.origin} (cold start may take up to two minutes)...\n`,
);
await verifyHttp(baseUrl, webOrigin);
await verifyUnauthenticatedWebSocket(baseUrl, webOrigin);
process.stdout.write(
  "Hosted game server passed readiness, ruleset, CORS, fail-closed auth and WebSocket checks.\n",
);

if (gameplayRequested) {
  const supabaseUrl = configuredUrl(
    process.env.HOSTED_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    "HOSTED_SUPABASE_URL",
  );
  const supabasePublishableKey = (
    process.env.HOSTED_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )?.trim();
  assert(supabasePublishableKey, "HOSTED_SUPABASE_PUBLISHABLE_KEY is required with --gameplay.");
  await verifyGameplay(baseUrl, webOrigin, supabaseUrl, supabasePublishableKey);
}
