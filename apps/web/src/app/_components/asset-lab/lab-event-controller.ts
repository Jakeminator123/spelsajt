import type { GameEventV2 } from "@spelsajt/contracts";

import {
  createInitialPresentationState,
  planGameEvent,
  type PresentationIntent,
  type PresentationState,
  projectGameEvent,
} from "../scene/presentation";
import {
  sceneVisualIntent,
  type SceneVisualIntent,
} from "../scene/visual-intents";
import {
  resolveDealerLabPoseMappings,
  type DealerLabPoseMapping,
} from "./dealer-lab-utils";

export type LabTimelineProgress = "pending" | "active" | "complete";
export type LabClipStatus = "ready" | "temporary" | "missing" | "ignored" | "error";
export type LabResolutionStatus = "ready" | "fallback" | "ignored" | "error";

export interface LabEventPlayback {
  cursor: number;
  error: string | null;
  presentation: PresentationState;
}

export interface LabEventInspection {
  clipStatus: LabClipStatus;
  error: string | null;
  event: GameEventV2;
  index: number;
  plan: PresentationIntent;
  poseMapping: DealerLabPoseMapping | null;
  resolution: LabResolutionStatus;
  runtimeClipName: string | null;
  visualIntent: SceneVisualIntent | null;
}

export type LabEventTimelineRow = LabEventInspection & {
  progress: LabTimelineProgress;
};

function requireCursor(events: readonly GameEventV2[], cursor: number): void {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > events.length) {
    throw new RangeError(`Lab event cursor ${cursor} is outside 0..${events.length}.`);
  }
}

function projectionError(event: GameEventV2): string {
  return `Event ${event.sequence} (${event.type}) kunde inte appliceras på presentationsstate.`;
}

function eventWasApplied(state: PresentationState, event: GameEventV2): boolean {
  return state.tableId === event.tableId
    && state.roundId === event.roundId
    && state.lastSequence === event.sequence
    && state.revision === event.revision;
}

export function createLabEventPlayback(): LabEventPlayback {
  return {
    cursor: 0,
    error: null,
    presentation: createInitialPresentationState(),
  };
}

export function replayLabEvents(
  events: readonly GameEventV2[],
  cursor: number,
): LabEventPlayback {
  requireCursor(events, cursor);
  let presentation = createInitialPresentationState();

  for (let index = 0; index < cursor; index += 1) {
    const event = events[index];
    if (!event) {
      break;
    }
    const next = projectGameEvent(presentation, event);
    if (!eventWasApplied(next, event)) {
      return {
        cursor: index,
        error: projectionError(event),
        presentation,
      };
    }
    presentation = next;
  }

  return { cursor, error: null, presentation };
}

export function stepLabEventForward(
  playback: LabEventPlayback,
  events: readonly GameEventV2[],
): LabEventPlayback {
  return replayLabEvents(events, Math.min(events.length, playback.cursor + 1));
}

export function stepLabEventBackward(
  playback: LabEventPlayback,
  events: readonly GameEventV2[],
): LabEventPlayback {
  return replayLabEvents(events, Math.max(0, playback.cursor - 1));
}

export function resetLabEventPlayback(): LabEventPlayback {
  return createLabEventPlayback();
}

function progressAt(index: number, cursor: number): LabTimelineProgress {
  if (index >= cursor) {
    return "pending";
  }
  return index === cursor - 1 ? "active" : "complete";
}

export function inspectLabEventTimeline(
  events: readonly GameEventV2[],
  cursor: number,
  animationNames: readonly string[],
): readonly LabEventTimelineRow[] {
  requireCursor(events, cursor);
  const poseMappings = resolveDealerLabPoseMappings(animationNames);
  let presentation = createInitialPresentationState();
  let blocked = false;

  return events.map((event, index): LabEventTimelineRow => {
    const plan = planGameEvent(event);
    const progress = progressAt(index, cursor);

    if (blocked) {
      return {
        clipStatus: "error",
        error: "Ett tidigare event stoppade projektionen.",
        event,
        index,
        plan,
        poseMapping: null,
        progress,
        resolution: "error",
        runtimeClipName: null,
        visualIntent: null,
      };
    }

    const next = projectGameEvent(presentation, event);
    if (!eventWasApplied(next, event)) {
      blocked = true;
      return {
        clipStatus: "error",
        error: projectionError(event),
        event,
        index,
        plan,
        poseMapping: null,
        progress,
        resolution: "error",
        runtimeClipName: null,
        visualIntent: null,
      };
    }
    presentation = next;

    if (plan.kind === "ignore") {
      return {
        clipStatus: "ignored",
        error: null,
        event,
        index,
        plan,
        poseMapping: null,
        progress,
        resolution: "ignored",
        runtimeClipName: null,
        visualIntent: null,
      };
    }

    const visualIntent = sceneVisualIntent(plan.cueId);
    const poseMapping = poseMappings.find((mapping) => mapping.pose === visualIntent.pose) ?? null;
    if (!poseMapping) {
      return {
        clipStatus: "error",
        error: `Ingen posemappning finns för ${visualIntent.pose}.`,
        event,
        index,
        plan,
        poseMapping: null,
        progress,
        resolution: "error",
        runtimeClipName: null,
        visualIntent,
      };
    }

    return {
      clipStatus: poseMapping.status,
      error: null,
      event,
      index,
      plan,
      poseMapping,
      progress,
      resolution: poseMapping.status === "ready" ? "ready" : "fallback",
      runtimeClipName: poseMapping.clipName,
      visualIntent,
    };
  });
}
