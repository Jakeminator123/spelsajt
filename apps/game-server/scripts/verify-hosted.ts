import { io as createSocket } from "socket.io-client";

const DEFAULT_WEB_ORIGIN = "https://spelsajt.vercel.app";
const READY_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_INTERVAL_MS = 2_500;

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

async function verifyWebSocket(baseUrl: URL, webOrigin: URL): Promise<void> {
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

const hostedUrl = process.argv.slice(2).find((argument) => argument !== "--");
const baseUrl = configuredUrl(hostedUrl, "Hosted game-server URL");
const webOrigin = configuredUrl(process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN, "WEB_ORIGIN");

process.stdout.write(
  `Verifying ${baseUrl.origin} for ${webOrigin.origin} (cold start may take up to two minutes)...\n`,
);
await verifyHttp(baseUrl, webOrigin);
await verifyWebSocket(baseUrl, webOrigin);
process.stdout.write("Hosted game server passed readiness, ruleset, CORS, fail-closed auth and WebSocket checks.\n");
