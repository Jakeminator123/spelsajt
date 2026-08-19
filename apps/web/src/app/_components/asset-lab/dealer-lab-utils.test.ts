import { describe, expect, it } from "vitest";

import {
  chooseInitialAnimation,
  formatBytes,
  friendlyAnimationName,
  resolveDealerLabPoseMappings,
  runtimeAnimationName,
} from "./dealer-lab-utils";

describe("dealer lab utilities", () => {
  it("prefers a standing idle animation", () => {
    expect(chooseInitialAnimation(["Chair_Sit_Idle_F", "Walking", "Idle_6"]))
      .toBe("Idle_6");
    expect(chooseInitialAnimation(["Walking", "IDLE-LOOP"]))
      .toBe("IDLE-LOOP");
  });

  it("falls back deterministically when no idle exists", () => {
    expect(chooseInitialAnimation(["Wave_One_Hand", "Formal_Bow"]))
      .toBe("Wave_One_Hand");
    expect(chooseInitialAnimation(["Running", "Talk_with_Hands_Open"]))
      .toBe("Talk_with_Hands_Open");
    expect(chooseInitialAnimation([])).toBeNull();
  });

  it("formats asset metadata for the inspector", () => {
    expect(formatBytes(37_817_392)).toBe("36,1 MB");
    expect(friendlyAnimationName("Armature|clip0|baselayer"))
      .toBe("Armature · clip0 · baselayer");
    expect(runtimeAnimationName("Armature|Idle_11|baselayer")).toBe("Idle_11");
    expect(runtimeAnimationName("Walking")).toBe("Walking");
  });

  it("resolves the runtime poses without pretending missing clips exist", () => {
    const mappings = resolveDealerLabPoseMappings([
      "Idle_6",
      "Formal_Bow",
      "Wave_One_Hand",
    ]);

    expect(mappings.map(({ clipName, pose, status }) => ({ clipName, pose, status })))
      .toEqual([
        { clipName: "Idle_6", pose: "rest", status: "temporary" },
        { clipName: "Formal_Bow", pose: "present", status: "temporary" },
        { clipName: null, pose: "deal", status: "missing" },
        { clipName: null, pose: "reveal", status: "missing" },
        { clipName: "Wave_One_Hand", pose: "celebrate", status: "temporary" },
        { clipName: null, pose: "sympathetic", status: "missing" },
      ]);
  });

  it("keeps generic Meshy gestures marked as test-only fallbacks", () => {
    const present = resolveDealerLabPoseMappings(["talk-with-hands-open"])
      .find((mapping) => mapping.pose === "present");

    expect(present).toMatchObject({
      clipName: "talk-with-hands-open",
      status: "temporary",
    });

    const canonical = resolveDealerLabPoseMappings([
      "idle_loop",
      "deal_left",
      "reveal",
      "celebrate_subtle",
      "sympathize_subtle",
    ]);
    expect(canonical.filter((mapping) => mapping.status === "ready")).toHaveLength(5);
  });
});
