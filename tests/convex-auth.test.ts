import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";
import { isFailureFresh } from "../src/convex/lib/negativeCache";

const modules = import.meta.glob("../src/convex/**/*.ts");

function testBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof testBackend>;
type UserId = Awaited<ReturnType<typeof seedUser>>;

async function seedUser(t: Backend, email: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", { email });
  });
}

function identity(userId: string) {
  return {
    subject: `${userId}|test-session`,
    issuer: "https://convex.test",
    tokenIdentifier: `https://convex.test|${userId}|test-session`,
  };
}

async function seedProject(t: Backend, userId: UserId) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("researchProjects", {
      userId,
      title: "Owner A record",
      source: "upload",
      location: null,
      requestedDate: "2024-06-28",
      dateMatch: "upload",
      scene: null,
      upload: null,
      checks: [],
      analysis: null,
      createdAt: 1,
      updatedAt: 1,
    });
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireUser and ownership", () => {
  it("rejects unauthenticated protected reads and writes", async () => {
    const t = testBackend();
    const projectId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { email: "owner@test.dev" });
      return await ctx.db.insert("researchProjects", {
        userId: ownerId,
        title: "x",
        source: "upload",
        location: null,
        requestedDate: "2024-06-28",
        dateMatch: "upload",
        scene: null,
        upload: null,
        checks: [],
        analysis: null,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(t.query(api.projects.list, {})).rejects.toThrow(/sign in/i);
    await expect(
      t.query(api.projects.get, { id: projectId }),
    ).rejects.toThrow(/sign in/i);
    await expect(
      t.action(api.geocoding.resolveLocation, { query: "51.95, 4.14" }),
    ).rejects.toThrow(/sign in/i);
    await expect(
      t.action(api.imagery.search, {
        bbox: [4, 51, 4.1, 51.1],
        date: "2024-06-28",
      }),
    ).rejects.toThrow(/sign in/i);
    await expect(
      t.mutation(api.files.generateUploadUrl, {}),
    ).rejects.toThrow(/sign in/i);
    await expect(
      t.action(api.ai.interpret, { projectId }),
    ).rejects.toThrow(/sign in/i);
  });

  it("rejects an identity whose user row no longer exists", async () => {
    const t = testBackend();
    const userId = await seedUser(t, "deleted@test.dev");
    const ghost = t.withIdentity(identity(userId));
    await t.run(async (ctx) => {
      await ctx.db.delete(userId);
    });

    await expect(ghost.query(api.projects.list, {})).rejects.toThrow(
      /account record|sign in/i,
    );
  });

  it("keeps user B out of user A's projects, calculations and analysis", async () => {
    const t = testBackend();
    const userA = await seedUser(t, "a@test.dev");
    const userB = await seedUser(t, "b@test.dev");
    const projectId = await seedProject(t, userA);

    const asA = t.withIdentity(identity(userA));
    const asB = t.withIdentity(identity(userB));

    expect(await asA.query(api.projects.get, { id: projectId })).not.toBeNull();
    expect(await asB.query(api.projects.get, { id: projectId })).toBeNull();

    await expect(
      asB.mutation(api.projects.remove, { id: projectId }),
    ).rejects.toThrow(/not found/i);
    await expect(
      asB.mutation(api.projects.clearAnalysis, { projectId }),
    ).rejects.toThrow(/not found/i);
    await expect(
      asB.mutation(api.calculations.save, {
        geometry: "vertical-cylinder",
        unit: "m",
        diameterValue: 4,
        secondValue: 5,
        projectId,
      }),
    ).rejects.toThrow(/not found/i);

    const bAnalysis = await asB.action(api.ai.interpret, { projectId });
    expect(bAnalysis.status).toBe("invalid");
  });
});

describe("token bucket limits", () => {
  it("allows the burst, denies over-budget calls and refills after the window", async () => {
    const t = testBackend();
    const first = await t.mutation(internal.rateLimits.consume, {
      key: "test:user",
      capacity: 1,
      windowMs: 1_000,
      now: 0,
    });
    expect(first.allowed).toBe(true);

    const denied = await t.mutation(internal.rateLimits.consume, {
      key: "test:user",
      capacity: 1,
      windowMs: 1_000,
      now: 100,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);

    const refilled = await t.mutation(internal.rateLimits.consume, {
      key: "test:user",
      capacity: 1,
      windowMs: 1_000,
      now: 1_000,
    });
    expect(refilled.allowed).toBe(true);
  });

  it("uses separate buckets per key", async () => {
    const t = testBackend();
    await t.mutation(internal.rateLimits.consume, {
      key: "ai:user-a",
      capacity: 1,
      windowMs: 1_000,
      now: 0,
    });
    const other = await t.mutation(internal.rateLimits.consume, {
      key: "ai:user-b",
      capacity: 1,
      windowMs: 1_000,
      now: 0,
    });
    expect(other.allowed).toBe(true);
  });
});

describe("AI kill switch", () => {
  it("returns blocked and stores no analysis when AI_ENABLED=false", async () => {
    vi.stubEnv("AI_ENABLED", "false");
    const t = testBackend();
    const userId = await seedUser(t, "ai@test.dev");
    const projectId = await seedProject(t, userId);
    const asUser = t.withIdentity(identity(userId));

    const result = await asUser.action(api.ai.interpret, { projectId });
    expect(result.status).toBe("blocked");
    const project = await t.run(async (ctx) => await ctx.db.get(projectId));
    expect(project?.analysis).toBeNull();
  });
});

describe("geocode cache hygiene", () => {
  it("treats failures as fresh for exactly 60 seconds", () => {
    expect(isFailureFresh(1_000, 60_999)).toBe(true);
    expect(isFailureFresh(1_000, 61_000)).toBe(false);
  });

  it("deletes cache and failure rows older than 30 days only", async () => {
    const t = testBackend();
    const now = Date.now();
    const thirtyOneDays = 31 * 24 * 60 * 60 * 1000;
    const old = now - thirtyOneDays;
    const fresh = now - 1_000;

    await t.run(async (ctx) => {
      await ctx.db.insert("geocodeCache", {
        key: "old-success",
        payload: { candidates: [], mode: "geocoder", rawQuery: "old" },
        fetchedAt: old,
      });
      await ctx.db.insert("geocodeCache", {
        key: "new-success",
        payload: { candidates: [], mode: "geocoder", rawQuery: "new" },
        fetchedAt: fresh,
      });
      await ctx.db.insert("geocodeFailures", {
        key: "old-failure",
        kind: "network",
        message: "old",
        at: old,
      });
      await ctx.db.insert("geocodeFailures", {
        key: "new-failure",
        kind: "network",
        message: "new",
        at: fresh,
      });
    });

    const result = await t.mutation(internal.geocoding.purgeExpired, {});
    expect(result.cacheDeleted).toBe(1);
    expect(result.failuresDeleted).toBe(1);

    const keys = await t.run(async (ctx) => {
      const cache = await ctx.db.query("geocodeCache").collect();
      const failures = await ctx.db.query("geocodeFailures").collect();
      return {
        cache: cache.map((row) => row.key),
        failures: failures.map((row) => row.key),
      };
    });
    expect(keys.cache).toEqual(["new-success"]);
    expect(keys.failures).toEqual(["new-failure"]);
  });
});
