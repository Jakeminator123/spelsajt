"use client";

import styles from "./lab-event-timeline.module.css";
import type { LabEventTimelineRow } from "./lab-event-controller";
import type { LabScenarioId } from "./lab-event-scenarios";

export type LabTimelineMode = "dealer" | LabScenarioId;

export type LabTimelineStatus =
  | "pending"
  | "active"
  | "complete"
  | "ignored"
  | "fallback"
  | "error";

export interface LabEventTimelineProps {
  readonly activeEventId: string | null;
  readonly canGoNext: boolean;
  readonly canGoPrevious: boolean;
  readonly isPlaying: boolean;
  readonly onGoNext: () => void;
  readonly onGoPrevious: () => void;
  readonly onPlaybackRateChange: (rate: number) => void;
  readonly onReset: () => void;
  readonly onScenarioChange: (scenario: LabTimelineMode) => void;
  readonly onSelectEvent: (eventId: string) => void;
  readonly onTogglePlayback: () => void;
  readonly playbackRate: number;
  readonly rows: readonly LabEventTimelineRow[];
  readonly scenario: LabTimelineMode;
  readonly scenarioStepCounts?: Readonly<Partial<Record<LabTimelineMode, number>>>;
}

const SCENARIOS: readonly { id: LabTimelineMode; label: string }[] = [
  { id: "dealer", label: "Dealer" },
  { id: "blackjack-basic", label: "Blackjack" },
  { id: "roulette-basic", label: "Roulette" },
];

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.5, 2] as const;

const STATUS_PRESENTATION: Record<LabTimelineStatus, { icon: string; label: string }> = {
  active: { icon: "▶", label: "Aktiv" },
  complete: { icon: "✓", label: "Klar" },
  error: { icon: "!", label: "Fel" },
  fallback: { icon: "↪", label: "Fallback" },
  ignored: { icon: "−", label: "Ignorerad" },
  pending: { icon: "○", label: "Väntar" },
};

function playbackRateLabel(rate: number): string {
  return `${rate.toLocaleString("sv-SE", { maximumFractionDigits: 2 })}×`;
}

function timelineStatus(row: LabEventTimelineRow): LabTimelineStatus {
  if (row.progress === "pending") {
    return "pending";
  }
  if (row.resolution === "error") {
    return "error";
  }
  if (row.resolution === "ignored") {
    return "ignored";
  }
  if (row.resolution === "fallback") {
    return "fallback";
  }
  return row.progress;
}

function timelineLabel(row: LabEventTimelineRow): string {
  if (row.plan.kind === "ignore") {
    return "Explicit ignore";
  }
  return row.visualIntent?.label ?? row.plan.reducedMotionText;
}

function timelineDetail(row: LabEventTimelineRow): string | null {
  if (row.error) {
    return row.error;
  }
  if (row.plan.kind === "ignore") {
    return row.plan.reason;
  }
  if (row.runtimeClipName) {
    return `GLB: ${row.runtimeClipName}`;
  }
  if (row.resolution === "fallback") {
    return "Klipp saknas · text och säker pose används";
  }
  return null;
}

export function LabEventTimeline({
  activeEventId,
  canGoNext,
  canGoPrevious,
  isPlaying,
  onGoNext,
  onGoPrevious,
  onPlaybackRateChange,
  onReset,
  onScenarioChange,
  onSelectEvent,
  onTogglePlayback,
  playbackRate,
  rows,
  scenario,
  scenarioStepCounts,
}: LabEventTimelineProps) {
  const activeIndex = rows.findIndex(({ event }) => event.eventId === activeEventId);
  const progressText = activeIndex >= 0
    ? `Steg ${activeIndex + 1} av ${rows.length}`
    : `${rows.length} händelser`;

  return (
    <section className={styles.timeline} aria-label="Eventtidslinje">
      <div className={styles.scenarioTabs} role="tablist" aria-label="Scenario">
        {SCENARIOS.map(({ id, label }) => {
          const count = scenarioStepCounts?.[id];
          return (
            <button
              aria-selected={scenario === id}
              className={styles.scenarioTab}
              key={id}
              onClick={() => onScenarioChange(id)}
              role="tab"
              type="button"
            >
              <span>{label}</span>
              {typeof count === "number" ? <small>{count}</small> : null}
            </button>
          );
        })}
      </div>

      <div className={styles.transport}>
        <div className={styles.transportButtons}>
          <button
            aria-label="Föregående händelse"
            disabled={!canGoPrevious}
            onClick={onGoPrevious}
            type="button"
          >
            <span aria-hidden="true">‹</span>
            Föregående
          </button>
          <button
            aria-label={isPlaying ? "Pausa scenariot" : "Spela scenariot"}
            className={styles.primaryAction}
            disabled={rows.length === 0}
            onClick={onTogglePlayback}
            type="button"
          >
            <span aria-hidden="true">{isPlaying ? "‖" : "▶"}</span>
            {isPlaying ? "Paus" : "Spela"}
          </button>
          <button
            aria-label="Nästa händelse"
            disabled={!canGoNext}
            onClick={onGoNext}
            type="button"
          >
            Nästa
            <span aria-hidden="true">›</span>
          </button>
          <button
            aria-label="Återställ scenariot"
            disabled={rows.length === 0}
            onClick={onReset}
            type="button"
          >
            <span aria-hidden="true">↺</span>
            Reset
          </button>
        </div>

        <label className={styles.speedControl}>
          <span>Hastighet</span>
          <select
            aria-label="Uppspelningshastighet"
            onChange={(event) => onPlaybackRateChange(Number(event.target.value))}
            value={playbackRate}
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>{playbackRateLabel(rate)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.timelineHeading}>
        <div>
          <span className={styles.eyebrow}>Semantiska events</span>
          <strong>{progressText}</strong>
        </div>
        <span aria-live="polite" className={styles.playbackState}>
          <i aria-hidden="true" data-playing={isPlaying} />
          {isPlaying ? "Spelar" : "Pausad"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className={styles.emptyState}>Det finns inga event i det valda scenariot.</p>
      ) : (
        <ol className={styles.stepList} aria-label="Händelser i scenariot">
          {rows.map((row) => {
            const status = timelineStatus(row);
            const presentation = STATUS_PRESENTATION[status];
            const detail = timelineDetail(row);
            const isSelected = row.event.eventId === activeEventId;
            return (
              <li data-status={status} key={row.event.eventId}>
                <button
                  aria-current={isSelected ? "step" : undefined}
                  className={styles.stepButton}
                  onClick={() => onSelectEvent(row.event.eventId)}
                  type="button"
                >
                  <span className={styles.statusIcon} aria-hidden="true">
                    {presentation.icon}
                  </span>
                  <span className={styles.stepContent}>
                    <span className={styles.stepTopline}>
                      <strong>{timelineLabel(row)}</strong>
                      <span className={styles.statusText}>{presentation.label}</span>
                    </span>
                    <code>{row.event.type}</code>
                    {detail ? <small>{detail}</small> : null}
                  </span>
                  <span className={styles.sequence}>#{row.event.sequence}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
