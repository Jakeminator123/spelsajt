import type { GameCommandV2, GameSnapshotV2 } from "@spelsajt/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeSocket = vi.hoisted(() => {
  const handlers = new Map<string, (...arguments_: unknown[]) => void>();
  const socket = {
    auth: {} as Record<string, unknown>,
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (...arguments_: unknown[]) => void) => {
      handlers.set(event, handler);
      return socket;
    }),
    removeAllListeners: vi.fn(),
    trigger(event: string, ...arguments_: unknown[]) {
      handlers.get(event)?.(...arguments_);
    },
  };
  return socket;
});

vi.mock("socket.io-client", () => ({ io: () => fakeSocket }));

import {
  connectGameRealtime,
  GameApiError,
  getGameSnapshot,
  sendGameCommand,
} from "./game-client";

const id = "11111111-1111-4111-8111-111111111111";
const roundId = "22222222-2222-4222-8222-222222222222";
const hash = "a".repeat(64);
const preparedSnapshot: GameSnapshotV2 = {
  balance: "10000",
  game: "blackjack",
  lastSequence: 1,
  revision: 1,
  round: {
    activeHandId: null,
    dealerCards: [],
    fairness: { algorithm: "pf-v1", commitment: hash, nonce: 0 },
    game: "blackjack",
    hands: [],
    phase: "prepared",
    revision: 1,
    roundId,
    rulesetHash: hash,
    rulesetId: "mvp-v2",
  },
  schemaVersion: 2,
  tableId: "blackjack-user-1",
};
const prepareCommand: GameCommandV2 = {
  commandId: id,
  expectedRevision: 0,
  issuedAt: "2026-08-18T00:00:00.000Z",
  payload: { game: "blackjack" },
  schemaVersion: 2,
  tableId: preparedSnapshot.tableId,
  type: "PREPARE_ROUND",
};

describe("live game HTTP client", () => {
  it("validates commands and accepted acknowledgements", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      commandId: id,
      firstSequence: 1,
      lastSequence: 1,
      revision: 1,
      schemaVersion: 2,
      snapshot: preparedSnapshot,
      status: "accepted",
    }), { headers: { "content-type": "application/json" }, status: 200 }));

    const acknowledgement = await sendGameCommand({
      accessToken: "access-token",
      command: prepareCommand,
      fetchImplementation: fetchImplementation as typeof fetch,
      gameServerUrl: "http://localhost:4000/",
      tableId: preparedSnapshot.tableId,
    });

    expect(acknowledgement.status).toBe("accepted");
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://localhost:4000/v2/tables/blackjack-user-1/commands",
      expect.objectContaining({ method: "POST" }),
    );
    const options = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    expect(options.headers).toMatchObject({ authorization: "Bearer access-token" });
  });

  it("returns null only for the explicit table-not-found response", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: "TABLE_NOT_FOUND" }),
      { headers: { "content-type": "application/json" }, status: 404 },
    ));

    await expect(getGameSnapshot({
      accessToken: "access-token",
      fetchImplementation: fetchImplementation as typeof fetch,
      gameServerUrl: "http://localhost:4000",
      tableId: "new table",
    })).resolves.toBeNull();
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://localhost:4000/v2/tables/new%20table/snapshot",
      expect.anything(),
    );
  });

  it("rejects an uncontracted server response", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ status: "accepted", surprise: true }),
      { headers: { "content-type": "application/json" }, status: 200 },
    ));

    await expect(sendGameCommand({
      accessToken: "access-token",
      command: prepareCommand,
      fetchImplementation: fetchImplementation as typeof fetch,
      gameServerUrl: "http://localhost:4000",
      tableId: preparedSnapshot.tableId,
    })).rejects.toBeInstanceOf(GameApiError);
  });
});

describe("live game realtime client", () => {
  beforeEach(() => {
    fakeSocket.auth = {};
    fakeSocket.connected = false;
    fakeSocket.connect.mockClear();
    fakeSocket.disconnect.mockClear();
    fakeSocket.emit.mockReset();
    fakeSocket.removeAllListeners.mockClear();
    fakeSocket.emit.mockImplementation((event, _input, acknowledge) => {
      if (event === "table.subscribe" && typeof acknowledge === "function") {
        acknowledge({
          lastSequence: 1,
          schemaVersion: 2,
          status: "accepted",
          tableId: preparedSnapshot.tableId,
        });
      }
    });
  });

  it("subscribes after server.ready and reports reconnect without inventing state", () => {
    const statuses: string[] = [];
    const snapshots: GameSnapshotV2[] = [];
    const connection = connectGameRealtime("http://localhost:4000", "token-1", {
      onError: (message) => { throw new Error(message); },
      onEvent: () => undefined,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      onStatus: (status) => statuses.push(status),
    });
    connection.subscribe(preparedSnapshot.tableId, 1);
    fakeSocket.connected = true;
    fakeSocket.trigger("connect");
    fakeSocket.trigger("server.ready", {
      connectionId: "connection-1",
      schemaVersion: 2,
      timestamp: "2026-08-18T00:00:00.000Z",
    });

    expect(fakeSocket.emit).toHaveBeenCalledWith(
      "table.subscribe",
      {
        lastSequence: 1,
        schemaVersion: 2,
        tableId: preparedSnapshot.tableId,
      },
      expect.any(Function),
    );
    expect(statuses).toContain("live");

    fakeSocket.trigger("table.snapshot", preparedSnapshot);
    expect(snapshots).toEqual([preparedSnapshot]);
    fakeSocket.trigger("disconnect", "transport close");
    expect(statuses.at(-1)).toBe("reconnecting");

    connection.refreshAccessToken("token-2");
    expect(fakeSocket.auth).toEqual({ accessToken: "token-2", schemaVersion: 2 });
    connection.close();
    expect(statuses.at(-1)).toBe("closed");
  });
});
