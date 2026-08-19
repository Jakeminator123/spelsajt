import styles from "./lab-event-inspector.module.css";
import type {
  LabClipStatus,
  LabEventInspection,
} from "./lab-event-controller";

export type LabInspectorStageState =
  | "resolved"
  | "ignored"
  | "fallback"
  | "error"
  | "unavailable";

export interface LabInspectorStage {
  readonly detail?: string;
  readonly id: string | null;
  readonly label: string;
  readonly state: LabInspectorStageState;
}

export interface LabEventInspectorProps {
  readonly inspection: LabEventInspection | null;
  readonly payloadInitiallyOpen?: boolean;
}

function clipStageState(status: LabClipStatus): LabInspectorStageState {
  switch (status) {
    case "ready":
      return "resolved";
    case "temporary":
    case "missing":
      return "fallback";
    case "ignored":
      return "ignored";
    case "error":
      return "error";
  }
}

function cueStage(inspection: LabEventInspection): LabInspectorStage {
  if (inspection.plan.kind === "ignore") {
    return {
      detail: inspection.plan.reason,
      id: inspection.plan.ignoreId,
      label: "Ingen egen animation",
      state: "ignored",
    };
  }

  return {
    detail: inspection.plan.reducedMotionText,
    id: inspection.plan.cueId,
    label: inspection.plan.cueId,
    state: "resolved",
  };
}

function visualIntentStage(inspection: LabEventInspection): LabInspectorStage {
  if (inspection.visualIntent) {
    return {
      detail: `Aktör: ${inspection.visualIntent.actorLabel} · fokus: ${inspection.visualIntent.focus} · pose: ${inspection.visualIntent.pose} · marker: ${inspection.visualIntent.chipMotion}`,
      id: `${inspection.visualIntent.focus}:${inspection.visualIntent.pose}`,
      label: inspection.visualIntent.label,
      state: "resolved",
    };
  }

  if (inspection.resolution === "ignored") {
    return {
      detail: "Eventet har ett granskat ignore-beslut och skapar därför inget visuellt intent.",
      id: null,
      label: "Explicit ignore",
      state: "ignored",
    };
  }

  return {
    detail: inspection.error ?? "Ingen godkänd visuell intention kunde härledas.",
    id: null,
    label: inspection.error ? "Mappningsfel" : "Inte tillgängligt",
    state: inspection.error ? "error" : "unavailable",
  };
}

function glbClipStage(inspection: LabEventInspection): LabInspectorStage {
  const state = clipStageState(inspection.clipStatus);
  const runtimeClipName = inspection.runtimeClipName ?? inspection.poseMapping?.clipName ?? null;
  const missingLabel = state === "ignored" ? "Inget klipp ska spelas" : "Text / säker pose";

  return {
    detail: inspection.error
      ?? (inspection.poseMapping
        ? `${inspection.poseMapping.label} · pose ${inspection.poseMapping.pose} · ${inspection.poseMapping.status}`
        : "Ingen clipmappning finns för detta steg."),
    id: runtimeClipName,
    label: runtimeClipName ?? missingLabel,
    state,
  };
}

const STAGE_PRESENTATION: Record<LabInspectorStageState, { icon: string; label: string }> = {
  error: { icon: "!", label: "Fel" },
  fallback: { icon: "↪", label: "Fallback" },
  ignored: { icon: "−", label: "Ignorerad" },
  resolved: { icon: "✓", label: "Klar" },
  unavailable: { icon: "○", label: "Saknas" },
};

function serializePayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2) ?? "null";
  } catch {
    return "Payloaden kunde inte serialiseras som JSON.";
  }
}

function MappingStage({ heading, stage }: { heading: string; stage: LabInspectorStage }) {
  const presentation = STAGE_PRESENTATION[stage.state];

  return (
    <article className={styles.mappingStage} data-state={stage.state}>
      <div className={styles.stageHeading}>
        <span className={styles.stageIcon} aria-hidden="true">{presentation.icon}</span>
        <span>
          <small>{heading}</small>
          <strong>{stage.label}</strong>
        </span>
        <i>{presentation.label}</i>
      </div>
      {stage.id ? <code>{stage.id}</code> : null}
      {stage.detail ? <p>{stage.detail}</p> : null}
    </article>
  );
}

function ChainConnector() {
  return (
    <div className={styles.connector} aria-hidden="true">
      <span />
      <i>↓</i>
    </div>
  );
}

export function LabEventInspector({
  inspection,
  payloadInitiallyOpen = false,
}: LabEventInspectorProps) {
  if (!inspection) {
    return (
      <aside className={styles.inspector} aria-label="Eventinspektör">
        <div className={styles.header}>
          <span className={styles.eyebrow}>Eventinspektör</span>
          <h2>Ingen händelse vald</h2>
          <p>Välj ett steg i tidslinjen för att granska hela presentationskedjan.</p>
        </div>
      </aside>
    );
  }

  const { event } = inspection;
  const cue = cueStage(inspection);
  const visualIntent = visualIntentStage(inspection);
  const glbClip = glbClipStage(inspection);

  return (
    <aside className={styles.inspector} aria-label="Eventinspektör">
      <div className={styles.header}>
        <span className={styles.eyebrow}>Eventinspektör</span>
        <div className={styles.eventTitle}>
          <h2>{event.type}</h2>
          <span>sekvens #{event.sequence}</span>
        </div>
        <p className={styles.eventId}>{event.eventId}</p>
      </div>

      <div className={styles.chain} aria-label="Event till GLB-klipp">
        <article className={styles.eventStage}>
          <div className={styles.stageHeading}>
            <span className={styles.eventIcon} aria-hidden="true">E</span>
            <span>
              <small>Backend-event</small>
              <strong>{event.type}</strong>
            </span>
            <i>Input</i>
          </div>
          <code>#{event.sequence}</code>
        </article>
        <ChainConnector />
        <MappingStage heading="Presentation cue" stage={cue} />
        <ChainConnector />
        <MappingStage heading="Visual intent" stage={visualIntent} />
        <ChainConnector />
        <MappingStage heading="GLB-klipp" stage={glbClip} />
      </div>

      <details className={styles.payload} open={payloadInitiallyOpen || undefined}>
        <summary>
          <span>JSON payload</span>
          <small>Visa / dölj</small>
        </summary>
        <pre>{serializePayload(event.payload)}</pre>
      </details>
    </aside>
  );
}
