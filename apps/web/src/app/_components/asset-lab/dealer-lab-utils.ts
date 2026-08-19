import type { CroupierVisualPose } from "../scene/croupier";

export type DealerLabMappingStatus = "ready" | "temporary" | "missing";

interface DealerLabPoseDefinition {
  fallbackNames: readonly string[];
  label: string;
  pose: CroupierVisualPose;
  preferredNames: readonly string[];
}

export interface DealerLabPoseMapping extends DealerLabPoseDefinition {
  clipName: string | null;
  status: DealerLabMappingStatus;
}

const DEALER_LAB_POSES = [
  {
    fallbackNames: ["Idle_11", "Idle_6", "Idle_03", "Idle_3"],
    label: "Vila",
    pose: "rest",
    preferredNames: ["idle_loop"],
  },
  {
    fallbackNames: ["Talk_with_Hands_Open", "Formal_Bow"],
    label: "Presentera",
    pose: "present",
    preferredNames: ["present"],
  },
  {
    fallbackNames: [],
    label: "Dela kort",
    pose: "deal",
    preferredNames: ["deal_left", "deal_right", "Deal_Card", "Deal_Cards"],
  },
  {
    fallbackNames: [],
    label: "Visa kort",
    pose: "reveal",
    preferredNames: ["reveal", "Reveal_Card", "Reveal_Hole_Card"],
  },
  {
    fallbackNames: ["Wave_One_Hand"],
    label: "Fira vinst",
    pose: "celebrate",
    preferredNames: ["celebrate_subtle", "Celebrate_Subtle", "Celebrate"],
  },
  {
    fallbackNames: [],
    label: "Beklaga förlust",
    pose: "sympathetic",
    preferredNames: ["sympathize_subtle", "Sympathetic_Subtle", "Sympathetic"],
  },
] as const satisfies readonly DealerLabPoseDefinition[];

function normalizedAnimationName(name: string): string {
  return name.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]/g, "");
}

function findAnimationName(
  names: readonly string[],
  candidates: readonly string[],
): string | null {
  const available = new Map(names.map((name) => [normalizedAnimationName(name), name]));
  for (const candidate of candidates) {
    const match = available.get(normalizedAnimationName(candidate));
    if (match) {
      return match;
    }
  }
  return null;
}

export function resolveDealerLabPoseMappings(
  animationNames: readonly string[],
): readonly DealerLabPoseMapping[] {
  return DEALER_LAB_POSES.map((definition) => {
    const preferredClip = findAnimationName(animationNames, definition.preferredNames);
    if (preferredClip) {
      return { ...definition, clipName: preferredClip, status: "ready" };
    }

    const fallbackClip = findAnimationName(animationNames, definition.fallbackNames);
    return {
      ...definition,
      clipName: fallbackClip,
      status: fallbackClip ? "temporary" : "missing",
    };
  });
}

export function chooseInitialAnimation(names: readonly string[]): string | null {
  const preferred = findAnimationName(
    names,
    ["idle_loop", "Idle_11", "Idle_6", "Idle_03", "Idle_3"],
  );
  if (preferred) {
    return preferred;
  }

  const stationaryFallback = findAnimationName(
    names,
    ["Listening_Gesture", "Talk_with_Hands_Open", "Talk_with_Left_Hand_Raised", "Wave_One_Hand"],
  );
  if (stationaryFallback) {
    return stationaryFallback;
  }

  return names.find((name) => /idle/i.test(name) && !/sit/i.test(name))
    ?? names[0]
    ?? null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Okänd storlek";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toLocaleString("sv-SE", {
    maximumFractionDigits: value >= 10 ? 1 : 2,
  })} ${units[unitIndex]}`;
}

export function isTransientModelUrl(url: string): boolean {
  return url.startsWith("blob:");
}

export function friendlyAnimationName(name: string): string {
  return name.replaceAll("_", " ").replaceAll("|", " · ");
}

export function runtimeAnimationName(name: string): string {
  const embeddedName = name.split("|")[1];
  return embeddedName?.trim() || name;
}
