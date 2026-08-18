import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  gameCommandTypesV2,
  gameEventTypesV2,
  gameNamesV2,
} from "@spelsajt/contracts";
import { describe, expect, it } from "vitest";

import { systemModel } from "./index";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

function expectUnique(values: readonly string[]): void {
  expect(new Set(values).size).toBe(values.length);
}

function expectExactCoverage(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  expectUnique(actual);
  expect(actual.toSorted(), `${label} must exactly match its authoritative registry`).toEqual(
    expected.toSorted(),
  );
}

describe("play-money system model", () => {
  it("keeps identifiers unique", () => {
    expectUnique(systemModel.nodes.map(({ id }) => id));
    expectUnique(systemModel.interfaces.map(({ id }) => id));
    expectUnique(systemModel.presentationCues.map(({ id }) => id));
    expectUnique(systemModel.presentationIgnores.map(({ id }) => id));
    expectUnique([
      ...systemModel.presentationCues.map(({ id }) => id),
      ...systemModel.presentationIgnores.map(({ id }) => id),
    ]);
    expectUnique(systemModel.scenarios.flatMap(({ steps }) => steps.map(({ id }) => id)));
  });

  it("keeps every graph and scenario reference resolvable", () => {
    const nodeIds = new Set(systemModel.nodes.map(({ id }) => id));
    const interfaceIds = new Set(systemModel.interfaces.map(({ id }) => id));
    const cueIds = new Set(systemModel.presentationCues.map(({ id }) => id));

    for (const connection of systemModel.connections) {
      expect(nodeIds.has(connection.from), `unknown connection source ${connection.from}`).toBe(true);
      expect(nodeIds.has(connection.to), `unknown connection target ${connection.to}`).toBe(true);
    }

    for (const step of systemModel.scenarios.flatMap(({ steps }) => steps)) {
      expect(nodeIds.has(step.nodeId), `unknown step node ${step.nodeId}`).toBe(true);

      if (step.kind === "command" || step.kind === "event") {
        expect(interfaceIds.has(step.interfaceId), `unknown interface ${step.interfaceId}`).toBe(true);
      }

      if (step.kind === "animation") {
        expect(cueIds.has(step.cueId), `unknown cue ${step.cueId}`).toBe(true);
      }
    }
  });

  it("keeps every declared source inside the repository and on disk", () => {
    const sources = [
      ...systemModel.nodes.map(({ source }) => source),
      ...systemModel.interfaces.map(({ source }) => source),
    ];

    for (const source of new Set(sources)) {
      const absoluteSource = resolve(repositoryRoot, source);
      const repositoryRelativeSource = relative(repositoryRoot, absoluteSource);
      const escapesRepository = repositoryRelativeSource === ".."
        || repositoryRelativeSource.startsWith(`..${sep}`)
        || isAbsolute(repositoryRelativeSource);

      expect(escapesRepository, `${source} escapes the repository root`).toBe(false);

      const exists = existsSync(absoluteSource);
      expect(exists, `source does not exist: ${source}`).toBe(true);

      if (exists) {
        expect(statSync(absoluteSource).isFile(), `source is not a file: ${source}`).toBe(true);
      }
    }
  });

  it("covers every v2 command and event discriminant exactly once in transport", () => {
    const commands = systemModel.interfaces.flatMap((interfaceDefinition) =>
      interfaceDefinition.kind === "http" ? interfaceDefinition.accepts : []
    );
    const events = systemModel.interfaces.flatMap((interfaceDefinition) =>
      interfaceDefinition.kind === "realtime" && interfaceDefinition.payload === "GameEvent"
        ? interfaceDefinition.eventTypes
        : []
    );

    expectExactCoverage(commands, gameCommandTypesV2, "v2 command interface coverage");
    expectExactCoverage(events, gameEventTypesV2, "v2 event interface coverage");

    for (const interfaceDefinition of systemModel.interfaces) {
      if (interfaceDefinition.kind === "http" && interfaceDefinition.method === "GET") {
        expect(
          interfaceDefinition.accepts,
          `${interfaceDefinition.id} is a GET interface and must not accept commands`,
        ).toHaveLength(0);
      }

      if (interfaceDefinition.kind === "realtime" && interfaceDefinition.payload !== "GameEvent") {
        expect(
          interfaceDefinition.eventTypes,
          `${interfaceDefinition.id} does not carry GameEvent and must not declare event types`,
        ).toHaveLength(0);
      }
    }
  });

  it("routes implemented v2 commands and snapshots through versioned paths", () => {
    const commands = systemModel.interfaces.find(({ id }) => id === "http.commands");
    const snapshot = systemModel.interfaces.find(({ id }) => id === "http.snapshot");

    expect(commands).toMatchObject({
      kind: "http",
      method: "POST",
      path: "/v2/tables/{tableId}/commands",
      maturity: {
        contract: "zod-v2",
        lifecycle: "active",
        runtime: "implemented",
        verification: "direct",
      },
    });
    expect(snapshot).toMatchObject({
      kind: "http",
      method: "GET",
      path: "/v2/tables/{tableId}/snapshot",
      maturity: {
        contract: "zod-v2",
        lifecycle: "active",
        runtime: "implemented",
        verification: "direct",
      },
    });
  });

  it("assigns every v2 GameEvent to a cue or an explicit ignore", () => {
    const gameEventInterface = systemModel.interfaces.find(({ id }) => id === "realtime.game-event");
    expect(gameEventInterface?.kind).toBe("realtime");
    expect(gameEventInterface?.kind === "realtime" ? gameEventInterface.payload : undefined).toBe(
      "GameEvent",
    );

    const producedEvents = new Set(
      gameEventInterface?.kind === "realtime" ? gameEventInterface.eventTypes : [],
    );
    const cueEvents = new Set(systemModel.presentationCues.map(({ eventType }) => eventType));
    const ignoredEvents = new Set(systemModel.presentationIgnores.map(({ eventType }) => eventType));
    const scenarioEvents = new Set(
      systemModel.scenarios.flatMap(({ steps }) =>
        steps.flatMap((step) => step.kind === "event" ? [step.eventType] : [])
      ),
    );

    expectExactCoverage([...producedEvents], gameEventTypesV2, "realtime.game-event coverage");
    expectExactCoverage([...cueEvents, ...ignoredEvents], gameEventTypesV2, "presentation handling");

    for (const eventType of cueEvents) {
      expect(ignoredEvents.has(eventType), `${eventType} cannot be both cued and ignored`).toBe(false);
    }

    for (const eventType of gameEventTypesV2) {
      expect(producedEvents.has(eventType), `${eventType} has no realtime producer`).toBe(true);
      expect(scenarioEvents.has(eventType), `${eventType} has no scenario example`).toBe(true);
    }

    for (const cue of systemModel.presentationCues) {
      expect(producedEvents.has(cue.eventType), `${cue.id} consumes an unproduced event`).toBe(true);
    }

    for (const ignored of systemModel.presentationIgnores) {
      expect(producedEvents.has(ignored.eventType), `${ignored.id} ignores an unproduced event`).toBe(true);
      expect(scenarioEvents.has(ignored.eventType), `${ignored.id} has no scenario event`).toBe(true);
    }

    expect([...producedEvents]).not.toContain("reaction.cue");
    expect(systemModel.presentationIgnores).toContainEqual(expect.objectContaining({
      eventType: "blackjack.action.accepted",
      game: "blackjack",
    }));
  });

  it("covers all v2 round settlement outcomes, including mixed", () => {
    for (const game of gameNamesV2) {
      const settlementOutcomes = systemModel.presentationCues
        .filter((cue) => cue.game === game && cue.eventType === "round.settled")
        .map((cue) => cue.condition?.path === "payload.outcome" ? cue.condition.equals : undefined)
        .filter((outcome): outcome is string => outcome !== undefined);

      expectExactCoverage(
        settlementOutcomes,
        ["loss", "mixed", "push", "win"],
        `${game} v2 settlement outcomes`,
      );
    }
  });

  it("matches every scenario step to a compatible interface and presentation cue", () => {
    const interfacesById = new Map(systemModel.interfaces.map((entry) => [entry.id, entry]));
    const cuesById = new Map(systemModel.presentationCues.map((cue) => [cue.id, cue]));

    for (const scenario of systemModel.scenarios) {
      for (const [stepIndex, step] of scenario.steps.entries()) {
        if (step.kind === "command") {
          const interfaceDefinition = interfacesById.get(step.interfaceId);
          expect(interfaceDefinition?.kind, `${step.id} must use an HTTP command interface`).toBe("http");

          if (interfaceDefinition?.kind === "http") {
            expect(interfaceDefinition.method, `${step.id} must submit through POST`).toBe("POST");
            expect(
              interfaceDefinition.accepts.includes(step.commandType),
              `${step.interfaceId} does not accept ${step.commandType}`,
            ).toBe(true);
          }
        }

        if (step.kind === "event") {
          const interfaceDefinition = interfacesById.get(step.interfaceId);
          expect(interfaceDefinition?.kind, `${step.id} must use a realtime interface`).toBe("realtime");

          if (interfaceDefinition?.kind === "realtime") {
            expect(interfaceDefinition.payload, `${step.id} must consume GameEvent`).toBe("GameEvent");
            expect(
              interfaceDefinition.eventTypes.includes(step.eventType),
              `${step.interfaceId} does not transport ${step.eventType}`,
            ).toBe(true);
          }
        }

        if (step.kind === "animation") {
          const cue = cuesById.get(step.cueId);
          expect(cue?.game, `${step.id} uses a cue for the wrong game`).toBe(scenario.game);

          if (cue) {
            const precedingEvents = scenario.steps
              .slice(0, stepIndex)
              .flatMap((candidate) => candidate.kind === "event" ? [candidate.eventType] : []);
            expect(
              precedingEvents.includes(cue.eventType),
              `${step.id} has no preceding ${cue.eventType} event`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("keeps graph and transport identities unambiguous", () => {
    expectUnique(systemModel.connections.map(({ from, label, to }) => `${from}|${label}|${to}`));
    expectUnique(systemModel.interfaces.map((entry) =>
      entry.kind === "http" ? `${entry.method} ${entry.path}` : entry.event
    ));

    for (const connection of systemModel.connections) {
      expect(connection.from, `self-referencing connection at ${connection.from}`).not.toBe(connection.to);
    }

    expect(systemModel.connections).toContainEqual({
      from: "node.fairness",
      label: "deterministiska bytes",
      to: "node.game-core",
    });
  });

  it("contains one v2 command, event and animation flow per MVP game", () => {
    expect(systemModel.scenarios.map(({ game }) => game).toSorted()).toEqual(["blackjack", "roulette"]);

    const scenarioCommands = new Set(
      systemModel.scenarios.flatMap(({ steps }) =>
        steps.flatMap((step) => step.kind === "command" ? [step.commandType] : [])
      ),
    );
    expect([...scenarioCommands].toSorted()).toEqual([...gameCommandTypesV2].toSorted());

    for (const scenario of systemModel.scenarios) {
      const kinds = new Set(scenario.steps.map(({ kind }) => kind));
      expect(kinds.has("command"), `${scenario.game} lacks a command step`).toBe(true);
      expect(kinds.has("event"), `${scenario.game} lacks an event step`).toBe(true);
      expect(kinds.has("animation"), `${scenario.game} lacks an animation step`).toBe(true);
    }
  });

  it("records the directly verified HTTP and realtime transports", () => {
    const maturity = Object.fromEntries(systemModel.interfaces.map(({ id, maturity }) => [id, maturity]));

    expect(maturity["http.health"]).toMatchObject({ contract: "ad-hoc", runtime: "implemented" });
    expect(maturity["http.status"]).toMatchObject({ contract: "ad-hoc", runtime: "implemented" });
    expect(maturity["http.commands"]).toMatchObject({
      contract: "zod-v2",
      lifecycle: "active",
      runtime: "implemented",
      verification: "direct",
    });
    expect(maturity["http.snapshot"]).toMatchObject({
      contract: "zod-v2",
      lifecycle: "active",
      runtime: "implemented",
      verification: "direct",
    });
    expect(maturity["realtime.server-ready"]).toMatchObject({
      contract: "zod-v2",
      lifecycle: "active",
      runtime: "implemented",
      verification: "direct",
    });
    expect(maturity["realtime.game-event"]).toMatchObject({
      contract: "zod-v2",
      lifecycle: "active",
      runtime: "implemented",
      verification: "direct",
    });
    expect(maturity["realtime.table-subscribe"]).toMatchObject({
      contract: "zod-v2",
      lifecycle: "active",
      runtime: "implemented",
      verification: "direct",
    });
    expect(maturity["realtime.table-snapshot"]).toMatchObject({
      contract: "zod-v2",
      lifecycle: "active",
      runtime: "implemented",
      verification: "direct",
    });

    const gameCore = systemModel.nodes.find(({ id }) => id === "node.game-core");
    expect(gameCore?.maturity).toEqual({
      contract: "none",
      lifecycle: "active",
      runtime: "implemented",
      verification: "direct",
    });
    expect(gameCore?.summary).toMatch(/blackjack.*roulette/i);

    const verifier = systemModel.nodes.find(({ id }) => id === "node.verifier");
    expect(verifier?.maturity).toEqual({
      contract: "none",
      lifecycle: "active",
      runtime: "implemented",
      verification: "direct",
    });
    expect(verifier?.summary).toMatch(/Web Crypto.*roulettepocket.*blackjackkortordning/i);

    const presentation = systemModel.nodes.find(({ id }) => id === "node.presentation");
    expect(presentation?.maturity).toMatchObject({
      contract: "zod-v2",
      runtime: "implemented",
      verification: "direct",
    });
    expect(presentation?.summary).toContain("reaction.cue");
  });
});
