export interface PlaybackState {
  readonly isPlaying: boolean;
  readonly scenarioId: string;
  readonly stepIndex: number;
}

export type PlaybackAction =
  | { readonly lastIndex: number; readonly type: "next" | "previous" | "toggle" | "tick" }
  | { readonly index: number; readonly type: "jump" }
  | { readonly scenarioId: string; readonly type: "select-scenario" }
  | { readonly type: "reset" };

export function createPlaybackState(scenarioId: string): PlaybackState {
  return { isPlaying: false, scenarioId, stepIndex: 0 };
}

export function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction,
): PlaybackState {
  switch (action.type) {
    case "select-scenario":
      return createPlaybackState(action.scenarioId);
    case "reset":
      return { ...state, isPlaying: false, stepIndex: 0 };
    case "jump":
      return { ...state, isPlaying: false, stepIndex: Math.max(0, action.index) };
    case "previous":
      return {
        ...state,
        isPlaying: false,
        stepIndex: Math.max(0, state.stepIndex - 1),
      };
    case "next":
      return {
        ...state,
        isPlaying: false,
        stepIndex: Math.min(action.lastIndex, state.stepIndex + 1),
      };
    case "toggle":
      if (state.isPlaying) {
        return { ...state, isPlaying: false };
      }
      return {
        ...state,
        isPlaying: true,
        stepIndex: state.stepIndex >= action.lastIndex ? 0 : state.stepIndex,
      };
    case "tick": {
      const nextIndex = Math.min(action.lastIndex, state.stepIndex + 1);
      return {
        ...state,
        isPlaying: nextIndex < action.lastIndex,
        stepIndex: nextIndex,
      };
    }
  }
}
