"use client";

import type { SystemModel, SystemScenario } from "@spelsajt/system-model";
import Link from "next/link";
import { useEffect, useReducer } from "react";

import styles from "../system-canvas.module.css";
import {
  createPlaybackState,
  playbackReducer,
} from "../_lib/presentation-projector";

type Game = SystemScenario["game"];
type ScenarioStep = SystemScenario["steps"][number];
type Maturity = SystemModel["nodes"][number]["maturity"];
type RuntimeMaturity = Maturity["runtime"];
type InterfaceDefinition = SystemModel["interfaces"][number];
type PresentationCue = SystemModel["presentationCues"][number];

const runtimeLabel: Readonly<Record<RuntimeMaturity, string>> = {
  absent: "Saknas",
  implemented: "Implementerad",
  partial: "Delvis",
};

const contractLabel: Readonly<Record<Maturity["contract"], string>> = {
  "ad-hoc": "Ad hoc",
  none: "Saknas",
  "zod-v1": "Zod v1",
};

const verificationLabel: Readonly<Record<Maturity["verification"], string>> = {
  direct: "Direkt test",
  "fixture-only": "Fixture",
  none: "Saknas",
  partial: "Delvis",
};

function requireFirst<T>(values: readonly T[], label: string): T {
  const first = values[0];
  if (!first) {
    throw new Error(`Systemmodellen saknar ${label}.`);
  }

  return first;
}

function MaturityBadge({ maturity }: { readonly maturity: Maturity }) {
  return (
    <span className={`${styles.badge} ${styles[maturity.runtime]}`}>
      {runtimeLabel[maturity.runtime]}
    </span>
  );
}

function MaturityAxes({ maturity }: { readonly maturity: Maturity }) {
  return (
    <dl className={styles.axes} aria-label="Mognadsstatus">
      <div>
        <dt>Runtime</dt>
        <dd>{runtimeLabel[maturity.runtime]}</dd>
      </div>
      <div>
        <dt>Kontrakt</dt>
        <dd>{contractLabel[maturity.contract]}</dd>
      </div>
      <div>
        <dt>Verifiering</dt>
        <dd>{verificationLabel[maturity.verification]}</dd>
      </div>
      <div>
        <dt>Livscykel</dt>
        <dd>{maturity.lifecycle === "active" ? "Aktiv" : maturity.lifecycle === "planned" ? "Planerad" : "Utfasad"}</dd>
      </div>
    </dl>
  );
}

function formatInterface(definition: InterfaceDefinition): string {
  return definition.kind === "http"
    ? `${definition.method} ${definition.path}`
    : `Socket.IO ${definition.event}`;
}

function formatActor(actor: PresentationCue["actor"]): string {
  return actor === "from-event" ? "actor från eventet" : actor;
}

function stepType(step: ScenarioStep): string {
  switch (step.kind) {
    case "animation":
      return step.cueId;
    case "command":
      return step.commandType;
    case "event":
      return step.eventType;
    case "system":
      return "intern transition";
  }
}

function stepMaturity(step: ScenarioStep, model: SystemModel): Maturity | undefined {
  switch (step.kind) {
    case "animation":
      return model.presentationCues.find(({ id }) => id === step.cueId)?.maturity;
    case "command":
    case "event":
      return model.interfaces.find(({ id }) => id === step.interfaceId)?.maturity;
    case "system":
      return model.nodes.find(({ id }) => id === step.nodeId)?.maturity;
  }
}

function SystemFlow({
  activeNodeId,
  model,
}: {
  readonly activeNodeId: ScenarioStep["nodeId"];
  readonly model: SystemModel;
}) {
  return (
    <section className={styles.flowSection} aria-labelledby="system-flow-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>SAMMANHÄNGANDE SYSTEM</p>
          <h2 id="system-flow-title">Från avsikt till presentation</h2>
        </div>
        <p>Den markerade ytan äger det valda steget. Pilarna beskriver informationsflödet.</p>
      </div>

      <ol className={styles.flowList}>
        {model.nodes.map((node, index) => {
          const isActive = node.id === activeNodeId;
          return (
            <li
              aria-current={isActive ? "step" : undefined}
              className={`${styles.flowNode} ${isActive ? styles.activeNode : ""}`}
              key={node.id}
            >
              <span className={styles.nodeNumber}>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <span className={styles.nodeMeta}>{node.lane} · {node.owner}</span>
                <strong>{node.label}</strong>
                <p>{node.summary}</p>
                <code>{node.source}</code>
              </div>
              <MaturityBadge maturity={node.maturity} />
            </li>
          );
        })}
      </ol>

      <ul className={styles.connectionList} aria-label="Systemkopplingar">
        {model.connections.map((connection) => (
          <li key={`${connection.from}-${connection.to}`}>
            <code>{connection.from}</code>
            <span aria-hidden="true">→</span>
            <strong>{connection.label}</strong>
            <span aria-hidden="true">→</span>
            <code>{connection.to}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepInspector({
  cue,
  interfaceDefinition,
  maturity,
  model,
  step,
}: {
  readonly cue?: PresentationCue;
  readonly interfaceDefinition?: InterfaceDefinition;
  readonly maturity?: Maturity;
  readonly model: SystemModel;
  readonly step: ScenarioStep;
}) {
  const node = model.nodes.find(({ id }) => id === step.nodeId);

  return (
    <article className={styles.inspector} aria-labelledby="active-step-title">
      <div className={styles.inspectorHeader}>
        <div>
          <p className={styles.eyebrow}>AKTIVT STEG</p>
          <h2 id="active-step-title">{step.label}</h2>
        </div>
        {maturity ? <MaturityBadge maturity={maturity} /> : null}
      </div>

      <p className={styles.summary}>{step.detail}</p>

      <dl className={styles.stepFacts}>
        <div>
          <dt>Typ</dt>
          <dd><code>{stepType(step)}</code></dd>
        </div>
        <div>
          <dt>Ansvarig yta</dt>
          <dd>{node?.label ?? step.nodeId}</dd>
        </div>
        <div>
          <dt>Transport</dt>
          <dd>{interfaceDefinition ? <code>{formatInterface(interfaceDefinition)}</code> : "Intern"}</dd>
        </div>
      </dl>

      {interfaceDefinition ? <MaturityAxes maturity={interfaceDefinition.maturity} /> : null}

      {cue ? (
        <div className={styles.presentationCallout}>
          <span>Frontendreaktion</span>
          <p><code>{cue.clip}</code> för {formatActor(cue.actor)}. {cue.reducedMotionText}</p>
        </div>
      ) : null}

      <details className={styles.payload}>
        <summary>Visa validerat modellsteg</summary>
        <pre tabIndex={0}><code>{JSON.stringify(step, null, 2)}</code></pre>
      </details>
    </article>
  );
}

function TransportReference({ interfaces }: { readonly interfaces: SystemModel["interfaces"] }) {
  return (
    <section className={styles.referenceCard} aria-labelledby="transport-title">
      <div className={styles.referenceHeading}>
        <p className={styles.eyebrow}>TRANSPORTYTAN</p>
        <h2 id="transport-title">Verkligt kontra planerat</h2>
      </div>
      <ul className={styles.transportList}>
        {interfaces.map((definition) => (
          <li key={definition.id}>
            <div>
              <code>{formatInterface(definition)}</code>
              <span>{definition.kind === "http" ? definition.returns : definition.payload}</span>
            </div>
            <p>{definition.summary}</p>
            <MaturityAxes maturity={definition.maturity} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PresentationReference({
  cues,
  game,
}: {
  readonly cues: SystemModel["presentationCues"];
  readonly game: Game;
}) {
  const visibleCues = cues.filter((cue) => cue.game === game);

  return (
    <section className={styles.referenceCard} aria-labelledby="mapping-title">
      <div className={styles.referenceHeading}>
        <p className={styles.eyebrow}>EMILS PRESENTATIONSKONTRAKT</p>
        <h2 id="mapping-title">Event → intention</h2>
      </div>
      <div
        aria-label="Event till presentationsintentioner"
        className={styles.tableScroll}
        role="region"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Villkor</th>
              <th scope="col">Presentation</th>
              <th scope="col">Textfallback</th>
            </tr>
          </thead>
          <tbody>
            {visibleCues.map((cue) => (
              <tr key={cue.id}>
                <th scope="row"><code>{cue.eventType}</code></th>
                <td>{cue.condition ? `${cue.condition.path} = ${cue.condition.equals}` : "Alla"}</td>
                <td><code>{cue.clip}</code> · {formatActor(cue.actor)}</td>
                <td>{cue.reducedMotionText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SystemCanvas({ model }: { readonly model: SystemModel }) {
  const firstScenario = requireFirst(model.scenarios, "scenarier");
  const [playback, dispatch] = useReducer(
    playbackReducer,
    firstScenario.id,
    createPlaybackState,
  );
  const scenario = model.scenarios.find(({ id }) => id === playback.scenarioId) ?? firstScenario;
  const firstStep = requireFirst(scenario.steps, `steg för ${scenario.id}`);
  const lastIndex = scenario.steps.length - 1;
  const step = scenario.steps[playback.stepIndex] ?? firstStep;
  const interfaceId = step.kind === "command" || step.kind === "event" ? step.interfaceId : undefined;
  const interfaceDefinition = interfaceId
    ? model.interfaces.find(({ id }) => id === interfaceId)
    : undefined;
  const cue = step.kind === "animation"
    ? model.presentationCues.find(({ id }) => id === step.cueId)
    : undefined;
  const maturity = stepMaturity(step, model);

  useEffect(() => {
    if (!playback.isPlaying) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      dispatch({ lastIndex, type: "tick" });
    }, 1700);

    return () => window.clearInterval(timer);
  }, [lastIndex, playback.isPlaying]);

  return (
    <main className={styles.systemPage}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="Till Spelsajt startsida">
          <span aria-hidden="true">S</span>
          Spelsajt / System
        </Link>
        <div className={styles.topbarMeta}>
          <span>MODELL v{model.schemaVersion}</span>
          <span>PLAY MONEY ONLY</span>
        </div>
      </header>

      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>KÖRBAR SYSTEMDOKUMENTATION</p>
          <h1>Två spel. En sammanhängande sanning.</h1>
        </div>
        <p>
          Spela igenom flödena steg för steg. Vyn skiljer på runtime, kontrakt,
          verifiering och plan så att Emil och backend arbetar mot samma karta.
        </p>
      </section>

      <section className={styles.player} aria-labelledby="scenario-title">
        <div className={styles.playerTop}>
          <div>
            <p className={styles.eyebrow}>SCENARIO</p>
            <h2 id="scenario-title">{scenario.label}</h2>
            <p>{scenario.summary}</p>
          </div>
          <div className={styles.gameSelector} role="group" aria-label="Välj spel">
            {model.scenarios.map((candidate) => (
              <button
                aria-pressed={candidate.id === scenario.id}
                className={candidate.id === scenario.id ? styles.selectedGame : undefined}
                key={candidate.id}
                onClick={() => dispatch({ scenarioId: candidate.id, type: "select-scenario" })}
                type="button"
              >
                {candidate.game === "blackjack" ? "Blackjack" : "Roulette"}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.progressRow}>
          <span>Steg {playback.stepIndex + 1} av {scenario.steps.length}</span>
          <progress
            aria-label={`Scenarioförlopp: steg ${playback.stepIndex + 1} av ${scenario.steps.length}`}
            max={scenario.steps.length}
            value={playback.stepIndex + 1}
          >
            {playback.stepIndex + 1} av {scenario.steps.length}
          </progress>
        </div>

        <div className={styles.controls} role="group" aria-label="Scenariokontroller">
          <button
            disabled={playback.stepIndex === 0}
            onClick={() => dispatch({ lastIndex, type: "previous" })}
            type="button"
          >
            Föregående
          </button>
          <button
            className={styles.playButton}
            onClick={() => dispatch({ lastIndex, type: "toggle" })}
            type="button"
          >
            {playback.isPlaying ? "Pausa" : "Spela"}
          </button>
          <button
            disabled={playback.stepIndex === lastIndex}
            onClick={() => dispatch({ lastIndex, type: "next" })}
            type="button"
          >
            Nästa
          </button>
          <button onClick={() => dispatch({ type: "reset" })} type="button">
            Börja om
          </button>
        </div>

        <p className={styles.liveStatus} aria-live="polite" aria-atomic="true">
          Steg {playback.stepIndex + 1}: {step.label}. {stepType(step)}.
        </p>

        <div className={styles.playerGrid}>
          <ol className={styles.timeline} aria-label={`Steg för ${scenario.label}`}>
            {scenario.steps.map((candidate, index) => {
              const isActive = index === playback.stepIndex;
              const candidateMaturity = stepMaturity(candidate, model);
              return (
                <li key={candidate.id}>
                  <button
                    aria-current={isActive ? "step" : undefined}
                    className={isActive ? styles.activeStep : undefined}
                    onClick={() => dispatch({ index, type: "jump" })}
                    type="button"
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{candidate.label}</strong>
                    {candidateMaturity ? <MaturityBadge maturity={candidateMaturity} /> : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <StepInspector
            cue={cue}
            interfaceDefinition={interfaceDefinition}
            maturity={maturity}
            model={model}
            step={step}
          />
        </div>
      </section>

      <SystemFlow activeNodeId={step.nodeId} model={model} />

      <section className={styles.legend} aria-labelledby="legend-title">
        <div>
          <p className={styles.eyebrow}>LÄSANVISNING</p>
          <h2 id="legend-title">Mognad har fyra axlar</h2>
        </div>
        <dl>
          <div><dt>Runtime</dt><dd>Finns funktionen faktiskt i körbar kod?</dd></div>
          <div><dt>Kontrakt</dt><dd>Är meddelandet låst av Zod eller ännu ad hoc?</dd></div>
          <div><dt>Verifiering</dt><dd>Finns direkta tester, fixtures eller inget skydd?</dd></div>
          <div><dt>Livscykel</dt><dd>Är ytan aktiv, planerad eller på väg bort?</dd></div>
        </dl>
      </section>

      <div className={styles.references}>
        <TransportReference interfaces={model.interfaces} />
        <PresentationReference game={scenario.game} cues={model.presentationCues} />
      </div>

      <footer className={styles.footer}>
        <span>Validerad dokumentationsprojektion</span>
        <span>Backend avgör · frontend presenterar</span>
      </footer>
    </main>
  );
}
