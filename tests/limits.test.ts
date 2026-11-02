import { describe, expect, it } from "vitest";

import {
  DEFAULT_AI_DAILY_CAP,
  LIMIT_DEFAULTS,
  audienceForUser,
  effectiveLimits,
} from "../src/convex/lib/limits";

type Limits = ReturnType<typeof effectiveLimits>;

function capacityFor(limits: Limits, envName: string): number {
  switch (envName) {
    case "AI_DAILY_CAP":
      return limits.aiDaily.capacity;
    case "AI_GUEST_GLOBAL_DAILY_CAP":
      return limits.aiGuestGlobalDaily.capacity;
    case "AI_SIGNED_IN_GLOBAL_DAILY_CAP":
      return limits.aiSignedInGlobalDaily.capacity;
    case "GEOCODE_GLOBAL_PER_SECOND":
      return limits.geocodeGlobal.capacity;
    case "IMAGERY_SEARCH_GLOBAL_DAILY_CAP":
      return limits.imagerySearchGlobalDaily.capacity;
    case "IMAGERY_SEARCH_GUEST_GLOBAL_DAILY_CAP":
      return limits.imagerySearchGuestGlobalDaily.capacity;
    case "UPLOAD_GLOBAL_DAILY_CAP":
      return limits.uploadGlobalDaily.capacity;
    case "UPLOAD_GUEST_GLOBAL_DAILY_CAP":
      return limits.uploadGuestGlobalDaily.capacity;
    default:
      throw new Error(`Unknown limit override: ${envName}`);
  }
}

const fallbackCases = [
  ["AI_DAILY_CAP", DEFAULT_AI_DAILY_CAP],
  ["AI_GUEST_GLOBAL_DAILY_CAP", LIMIT_DEFAULTS.aiGuestGlobalDaily],
  ["AI_SIGNED_IN_GLOBAL_DAILY_CAP", LIMIT_DEFAULTS.aiSignedInGlobalDaily],
  ["GEOCODE_GLOBAL_PER_SECOND", LIMIT_DEFAULTS.geocodeGlobal],
  ["IMAGERY_SEARCH_GLOBAL_DAILY_CAP", LIMIT_DEFAULTS.imagerySearchGlobalDaily],
  ["IMAGERY_SEARCH_GUEST_GLOBAL_DAILY_CAP", LIMIT_DEFAULTS.imagerySearchGuestGlobalDaily],
  ["UPLOAD_GLOBAL_DAILY_CAP", LIMIT_DEFAULTS.uploadGlobalDaily],
  ["UPLOAD_GUEST_GLOBAL_DAILY_CAP", LIMIT_DEFAULTS.uploadGuestGlobalDaily],
] as const;

describe("effective limits", () => {
  it("prints finite positive defaults for every limit", () => {
    const limits = effectiveLimits({});

    expect(limits).toMatchObject({
      aiHourly: { capacity: 10, windowMs: 3_600_000 },
      aiDaily: { capacity: 100, windowMs: 86_400_000 },
      aiGuestGlobalDaily: { capacity: 20, windowMs: 86_400_000 },
      aiSignedInGlobalDaily: { capacity: 200, windowMs: 86_400_000 },
      aiProjectCooldown: { capacity: 1, windowMs: 60_000 },
      geocodeGlobal: { capacity: 1, windowMs: 1_000 },
      geocodeUserHourly: { capacity: 30, windowMs: 3_600_000 },
      imagerySearchHourly: { capacity: 30, windowMs: 3_600_000 },
      imagerySearchGuestGlobalDaily: { capacity: 100, windowMs: 86_400_000 },
      imagerySearchGlobalDaily: { capacity: 500, windowMs: 86_400_000 },
      imageryHealthHourly: { capacity: 10, windowMs: 3_600_000 },
      uploadDaily: { capacity: 20, windowMs: 86_400_000 },
      uploadGuestGlobalDaily: { capacity: 20, windowMs: 86_400_000 },
      uploadGlobalDaily: { capacity: 100, windowMs: 86_400_000 },
    });

    for (const limit of Object.values(limits)) {
      expect(Number.isFinite(limit.capacity)).toBe(true);
      expect(limit.capacity).toBeGreaterThan(0);
      expect(Number.isFinite(limit.windowMs)).toBe(true);
      expect(limit.windowMs).toBeGreaterThan(0);
    }
  });

  it("falls back for empty, NaN, zero and negative overrides", () => {
    for (const [envName, fallback] of fallbackCases) {
      for (const raw of ["", " ", "NaN", "0", "-10", "Infinity", "1.5"]) {
        expect(capacityFor(effectiveLimits({ [envName]: raw }), envName)).toBe(
          fallback,
        );
      }
    }
  });

  it("accepts positive integer overrides and caps them", () => {
    expect(
      effectiveLimits({
        AI_DAILY_CAP: "7",
        GEOCODE_GLOBAL_PER_SECOND: "2",
        IMAGERY_SEARCH_GLOBAL_DAILY_CAP: "40",
        UPLOAD_GLOBAL_DAILY_CAP: "9",
      }),
    ).toMatchObject({
      aiDaily: { capacity: 7 },
      geocodeGlobal: { capacity: 2 },
      imagerySearchGlobalDaily: { capacity: 40 },
      uploadGlobalDaily: { capacity: 9 },
    });

    expect(effectiveLimits({ AI_DAILY_CAP: "999999" }).aiDaily.capacity).toBe(
      10_000,
    );
  });

  it("splits guest and signed-in global caps with lower guest limits", () => {
    const limits = effectiveLimits({});

    expect(audienceForUser({ isAnonymous: true })).toBe("guest");
    expect(audienceForUser({ isAnonymous: false })).toBe("signed-in");
    expect(audienceForUser({})).toBe("signed-in");

    expect(limits.aiGuestGlobalDaily.capacity).toBeLessThan(
      limits.aiSignedInGlobalDaily.capacity,
    );
    expect(limits.imagerySearchGuestGlobalDaily.capacity).toBeLessThan(
      limits.imagerySearchGlobalDaily.capacity,
    );
    expect(limits.uploadGuestGlobalDaily.capacity).toBeLessThan(
      limits.uploadGlobalDaily.capacity,
    );
  });
});
