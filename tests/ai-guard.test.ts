import { describe, expect, it } from "vitest";

import { checkAiOutputSafety, type AiNarrative } from "../src/convex/lib/aiGuard";

function narrative(overrides: Partial<AiNarrative> = {}): AiNarrative {
  return {
    summary:
      "The catalogue metadata records an acquisition timestamp and provider collection.",
    sections: [
      {
        title: "What the metadata supports",
        body: "The provider reports a scene identifier and acquisition time.",
      },
    ],
    limitations: ["No liquid level can be inferred from an external image."],
    ...overrides,
  };
}

describe("AI output scientific safety filter", () => {
  it("accepts negative limitations with no numeric measurement", () => {
    expect(checkAiOutputSafety(narrative())).toEqual({ ok: true });
    expect(
      checkAiOutputSafety(
        narrative({
          summary:
            "The image cannot establish whether the tank is full or what the inventory is.",
        }),
      ),
    ).toEqual({ ok: true });
  });

  it("rejects numbers carrying volume, length or percentage units", () => {
    for (const text of [
      "The tank volume is 1,200 m3.",
      "Internal liquid level is approximately 4.2 m.",
      "The scene has 10 m resolution.",
      "Cloud cover is 18.66% over the tile.",
      "The tank holds 500 barrels.",
    ]) {
      const result = checkAiOutputSafety(narrative({ summary: text }));
      expect(result.ok).toBe(false);
    }
  });

  it("rejects affirmative liquid-level, fill and inventory claims", () => {
    for (const text of [
      "The tank is 70% full.",
      "The tank is half full.",
      "The tank appears full.",
      "Product level is near the roof.",
      "Inventory is low.",
    ]) {
      const result = checkAiOutputSafety(
        narrative({
          sections: [{ title: "Observation", body: text }],
        }),
      );
      expect(result.ok).toBe(false);
    }
  });

  it("does not let a negated sentence excuse a separate positive claim", () => {
    const result = checkAiOutputSafety(
      narrative({
        summary:
          "The image does not prove the level. The tank is 70% full.",
      }),
    );
    expect(result.ok).toBe(false);
  });
});
