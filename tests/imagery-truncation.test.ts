import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";
import {
  SEARCH_LIMIT,
  formatTruncationNotice,
  normalizeSearchResponse,
} from "../src/lib/catalogue";

const modules = import.meta.glob("../src/convex/**/*.ts");

function feature(index: number, date = "2024-06-28T10:50:31Z") {
  return {
    type: "Feature",
    id: `SCENE_${index}`,
    properties: {
      datetime: date,
      platform: "sentinel-2a",
      gsd: 10,
      "eo:cloud_cover": index % 10,
    },
  };
}

const normalizeOptions = {
  requestedDate: "2024-06-28",
  collectionId: "sentinel-2-l2a",
  mode: "exact" as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("catalogue truncation detection", () => {
  it("marks a full page and a provider next link as truncated", () => {
    const fullPage = normalizeSearchResponse(
      { features: Array.from({ length: SEARCH_LIMIT }, (_, i) => feature(i)) },
      normalizeOptions,
    );
    expect(fullPage.truncated).toBe(true);

    const nextPage = normalizeSearchResponse(
      {
        features: [feature(1)],
        links: [{ rel: "next", href: "https://example.test/page/2" }],
      },
      normalizeOptions,
    );
    expect(nextPage.truncated).toBe(true);
  });

  it("does not mark a short page without a next link as truncated", () => {
    const normalized = normalizeSearchResponse(
      {
        features: Array.from({ length: SEARCH_LIMIT - 1 }, (_, i) => feature(i)),
        links: [{ rel: "self", href: "https://example.test/page/1" }],
      },
      normalizeOptions,
    );

    expect(normalized.returnedFeatures).toBe(SEARCH_LIMIT - 1);
    expect(normalized.truncated).toBe(false);
  });

  it("uses copy that never calls a truncated result empty", () => {
    expect(formatTruncationNotice(SEARCH_LIMIT, true)).toBe(
      "Showing the first 24 results. Try a shorter date range.",
    );
    expect(formatTruncationNotice(SEARCH_LIMIT, false)).toBe(
      "Copernicus returned the first 24 results. More may exist, so the app cannot say this date has no images. Try a shorter date range.",
    );
  });
});

describe("imagery search truncation response", () => {
  it("returns truncated true for a full provider page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: Array.from({ length: SEARCH_LIMIT }, (_, i) => feature(i)),
          }),
          { status: 200, headers: { "Content-Type": "application/geo+json" } },
        ),
      ),
    );
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "truncated@test.dev" }),
    );

    const result = await t
      .withIdentity({
        subject: `${userId}|test-session`,
        issuer: "https://convex.test",
        tokenIdentifier: `https://convex.test|${userId}|test-session`,
      })
      .action(api.imagery.search, {
        bbox: [4, 51.8, 4.5, 52],
        date: "2024-06-28",
      });

    expect(result).toMatchObject({
      status: "ok",
      truncated: true,
      counts: { returnedFeatures: SEARCH_LIMIT },
    });
  });

  it("marks a full page with no exact-date matches as truncated, not empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: Array.from({ length: SEARCH_LIMIT }, (_, i) =>
              feature(i, "2024-06-27T10:50:31Z"),
            ),
          }),
          { status: 200, headers: { "Content-Type": "application/geo+json" } },
        ),
      ),
    );
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "truncated-empty@test.dev" }),
    );

    const result = await t
      .withIdentity({
        subject: `${userId}|test-session`,
        issuer: "https://convex.test",
        tokenIdentifier: `https://convex.test|${userId}|test-session`,
      })
      .action(api.imagery.search, {
        bbox: [4, 51.8, 4.5, 52],
        date: "2024-06-28",
      });

    expect(result).toMatchObject({
      status: "empty",
      truncated: true,
      counts: { returnedFeatures: SEARCH_LIMIT, exactDateMatches: 0 },
    });
  });
});
