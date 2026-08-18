// Reusable, framework-agnostic animation primitives for the 3D scenes.
//
// The pose-mixing technique here is intentionally generic: right now it drives
// the procedural croupier hands and the roulette ball, but the same
// PoseMixer/cross-fade approach is meant to later drive rigged croupier and
// player avatars (named clips + additive idle) as described in
// docs/PRESENTATION_AI.md. Keep this file free of any game logic, RNG or
// ledger concerns — it only interpolates numbers over time.

export const TAU = Math.PI * 2;

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Dampen toward a target and snap to its exact resting value near the end. */
export function dampToTarget(
  current: number,
  target: number,
  step: number,
  epsilon = 0.001,
): number {
  const remaining = target - current;
  if (Math.abs(remaining) <= epsilon) {
    return target;
  }
  return current + remaining * clamp01(step);
}

/** Keep an angle in the positive 0..TAU interval. */
export function normalizeAngle(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

/** Positive rotation from `from` to `to`, optionally with complete extra turns. */
export function forwardAngleDelta(from: number, to: number, extraTurns = 0): number {
  return normalizeAngle(to - from) + Math.max(0, extraTurns) * TAU;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

// A "pose" is a flat map of named channels to scalar values (radians, offsets,
// curl amounts...). Poses blend channel-by-channel, exactly like blending
// animation clips on a skeleton.
export type Pose = Record<string, number>;

export function blendPoses(from: Pose, to: Pose, t: number): Pose {
  const out: Pose = { ...from };
  for (const key in to) {
    const target = to[key] ?? 0;
    const start = from[key] ?? target;
    out[key] = lerp(start, target, t);
  }
  return out;
}

// PoseMixer cross-fades between named poses over a duration. This mirrors the
// Three.js AnimationMixer cross-fade concept so the same director pattern can
// be reused once real rigged GLB avatars are introduced.
export class PoseMixer {
  private readonly poses: Record<string, Pose>;
  private current: Pose;
  private fromPose: Pose;
  private targetName: string;
  private fade = 1;
  private fadeDuration = 0.4;

  constructor(poses: Record<string, Pose>, initial: string) {
    this.poses = poses;
    this.targetName = initial;
    const initialPose = poses[initial] ?? {};
    this.current = { ...initialPose };
    this.fromPose = { ...initialPose };
  }

  get active(): string {
    return this.targetName;
  }

  play(name: string, duration = 0.4): void {
    if (name === this.targetName || !this.poses[name]) {
      return;
    }
    this.fromPose = { ...this.current };
    this.targetName = name;
    this.fade = 0;
    this.fadeDuration = Math.max(0.0001, duration);
  }

  update(delta: number): Pose {
    if (this.fade < 1) {
      this.fade = clamp01(this.fade + delta / this.fadeDuration);
      const targetPose = this.poses[this.targetName] ?? this.current;
      this.current = blendPoses(this.fromPose, targetPose, easeInOutCubic(this.fade));
    }
    return this.current;
  }
}
