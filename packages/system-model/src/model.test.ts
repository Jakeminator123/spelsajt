import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { gameCommandTypes, gameEventTypes, gameNames } from "@spelsajt/contracts";
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

  it("covers every exported command and event type exactly once in its transport interfaces", () => {
    const commands = systemModel.interfaces.flatMap((interfaceDefinition) =>
      interfaceDefinition.kind === "http" ? interfaceDefinition.accepts : []
    );
    const events = systemModel.interfaces.flatMap((interfaceDefinition) =>
      interfaceDefinition.kind === "realtime" && interfaceDefinition.payload === "GameEvent"
        ? interfaceDefinition.eventTypes
        : []
    );

    expectExactCoverage(commands, gameCommandTypes, "command interface coverage");
    expectExactCoverage(events, gameEventTypes, "event interface coverage");

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

  it("gives every GameEvent a realtime producer and presentation consumer", () => {
    const gameEventInterface = systemModel.interfaces.find(({ id }) => id === "realtime.game-event");
    expect(gameEventInterface?.kind).toBe("realtime");
    expect(gameEventInterface?.kind === "realtime" ? gameEventInterface.payload : undefined).toBe(
      "GameEvent",
    );

    const producedEvents = new Set(
      gameEventInterface?.kind === "realtime" ? gameEventInterface.eventTypes : [],
    );
    const scenarioEvents = new Set(
      systemModel.scenarios.flatMap(({ steps }) =>
        steps.flatMap((step) => step.kind === "event" ? [step.eventType] : [])
      ),
    );

    expectExactCoverage([...producedEvents], gameEventTypes, "realtime.game-event coverage");

    for (const eventType of gameEventTypes) {
      expect(producedEvents.has(eventType), `${eventType} has no realtime.game-event producer`).toBe(true);
      expect(
        systemModel.presentationCues.some((cue) => cue.eventType === eventType),
        `${eventType} has no presentation consumer`,
      ).toBe(true);
    }

    for (const cue of systemModel.presentationCues) {
      expect(producedEvents.has(cue.eventType), `${cue.id} consumes an unproduced event`).toBe(true);
      expect(scenarioEvents.has(cue.eventType), `${cue.id} has no scenario event producer`).toBe(true);
    }
  });

  it("covers every settlement outcome and delegates every reaction actor to its event", () => {
    for (const game of gameNames) {
      const gameCues = systemModel.presentationCues.filter((cue) => cue.game === game);
      const settlementOutcomes = gameCues
        .filter((cue) => cue.eventType === "round.settled")
        .map((cue) => cue.condition?.path === "payload.outcome" ? cue.condition.equals : undefined)
        .filter((outcome): outcome is string => outcome !== undefined);
      const reactionCues = gameCues.filter((cue) => cue.eventType === "reaction.cue");

      expectExactCoverage(settlementOutcomes, ["loss", "push", "win"], `${game} settlement outcomes`);
      expect(reactionCues).toHaveLength(1);
      expect(reactionCues[0]).toMatchObject({
        actor: "from-event",
        clip: "reaction.by-mood",
      });
      expect(reactionCues[0]?.condition).toBeUndefined();
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

  it("contains one end-to-end command, event and animation flow per MVP game", () => {
    expect(systemModel.scenarios.map(({ game }) => game).toSorted()).toEqual(["blackjack", "roulette"]);

    for (const scenario of systemModel.scenarios) {
      const kinds = new Set(scenario.steps.map(({ kind }) => kind));
      expect(kinds.has("command"), `${scenario.game} lacks a command step`).toBe(true);
      expect(kinds.has("event"), `${scenario.game} lacks an event step`).toBe(true);
      expect(kinds.has("animation"), `${scenario.game} lacks an animation step`).toBe(true);
    }
  });

  it("labels current and proposed transports honestly", () => {
    const maturity = Object.fromEntries(systemModel.interfaces.map(({ id, maturity }) => [id, maturity]));

    expect(maturity["http.health"]).toMatchObject({ contract: "ad-hoc", runtime: "implemented" });
    expect(maturity["http.status"]).toMatchObject({ contract: "ad-hoc", runtime: "implemented" });
    expect(maturity["http.commands"]).toMatchObject({ lifecycle: "planned", runtime: "absent" });
    expect(maturity["realtime.server-ready"]).toMatchObject({ contract: "ad-hoc", runtime: "implemented" });
    expect(maturity["realtime.game-event"]).toMatchObject({ lifecycle: "planned", runtime: "absent" });

    const webControls = systemModel.nodes.find(({ id }) => id === "node.web-controls");
    expect(webControls?.maturity).toEqual({
      contract: "none",
      lifecycle: "planned",
      runtime: "partial",
      verification: "none",
    });
  });
});
