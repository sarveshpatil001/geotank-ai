import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";

const modules = import.meta.glob("../src/convex/**/*.ts");

function testBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof testBackend>;

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

async function seedProject(
  t: Backend,
  userId: Awaited<ReturnType<typeof seedUser>>,
  title: string,
  createdAt: number,
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("researchProjects", {
      userId,
      title,
      source: "upload",
      location: null,
      requestedDate: "2024-06-28",
      dateMatch: "upload",
      scene: null,
      upload: null,
      checks: [],
      analysis: null,
      createdAt,
      updatedAt: createdAt,
    });
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("paginated account export", () => {
  it("walks every page instead of truncating at one fixed batch", async () => {
    const t = testBackend();
    const userId = await seedUser(t, "export@test.dev");
    for (let index = 0; index < 3; index += 1) {
      await seedProject(t, userId, `Record ${index}`, index + 1);
    }
    await t.run(async (ctx) => {
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert("calculations", {
          userId,
          projectId: null,
          geometry: "vertical-cylinder",
          geometryLabel: "Vertical cylinder",
          formula: "V = π r² H",
          unit: "m",
          diameterInput: 4,
          secondInput: 5,
          diameterM: 4,
          radiusM: 2,
          heightM: 5,
          lengthM: null,
          volume: {
            cubicMeters: 62.83185307179586,
            liters: 62831.8530717959,
            usGallons: 16598.1174249563,
            oilBarrels: 395.193345832293,
          },
          engineVersion: "test",
          createdAt: index + 1,
        });
      }
    });
    const asUser = t.withIdentity(identity(userId));

    const first = await asUser.query(api.settings.exportData, {
      table: "projects",
      limit: 1,
    });
    expect(first.researchProjects).toHaveLength(1);
    expect(first.isDone).toBe(false);

    const second = await asUser.query(api.settings.exportData, {
      table: "projects",
      limit: 1,
      cursor: first.cursor,
    });
    expect(second.researchProjects).toHaveLength(1);
    expect(second.isDone).toBe(false);

    const third = await asUser.query(api.settings.exportData, {
      table: "projects",
      limit: 1,
      cursor: second.cursor,
    });
    expect(third.researchProjects).toHaveLength(1);
    expect(third.isDone).toBe(true);
    expect(third.cursor).toBeNull();

    const calculationsFirst = await asUser.query(api.settings.exportData, {
      table: "calculations",
      limit: 1,
    });
    expect(calculationsFirst.calculations).toHaveLength(1);
    expect(calculationsFirst.isDone).toBe(false);
    const calculationsSecond = await asUser.query(api.settings.exportData, {
      table: "calculations",
      limit: 1,
      cursor: calculationsFirst.cursor,
    });
    expect(calculationsSecond.calculations).toHaveLength(1);
    expect(calculationsSecond.isDone).toBe(true);
  });
});

describe("scheduled account deletion", () => {
  it("reports counts from the finished job and removes only that user's data", async () => {
    vi.useFakeTimers();
    const t = testBackend();
    const userA = await seedUser(t, "delete-a@test.dev");
    const userB = await seedUser(t, "delete-b@test.dev");
    await seedProject(t, userA, "A record one", 1);
    await seedProject(t, userA, "A record two", 2);
    await seedProject(t, userB, "B record", 3);

    const asA = t.withIdentity(identity(userA));
    const asB = t.withIdentity(identity(userB));

    await asA.mutation(api.calculations.save, {
      geometry: "vertical-cylinder",
      unit: "m",
      diameterValue: 4,
      secondValue: 5,
    });
    await asA.mutation(api.calculations.save, {
      geometry: "horizontal-cylinder",
      unit: "m",
      diameterValue: 4,
      secondValue: 6,
    });
    await asA.mutation(api.settings.update, { aiEnabled: false });
    await t.run(async (ctx) => {
      await ctx.db.insert("auditLog", {
        userId: userA,
        action: "test",
        detail: "deletion fixture",
        at: 1,
      });
    });

    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(
        new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
          type: "image/png",
        }),
      );
      await ctx.db.insert("pendingUploads", {
        userId: userA,
        storageId: id,
        filename: "pending.png",
        contentType: "image/png",
        sizeBytes: 4,
        createdAt: 1,
      });
      return id;
    });

    const started = await asA.mutation(api.settings.deleteAll, {});
    expect(started.status).toBe("running");
    expect(started.projectsDeleted).toBe(0);
    expect(started.calculationsDeleted).toBe(0);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const job = await asA.query(api.settings.deletionStatus, {
      jobId: started.jobId,
    });
    expect(job?.status).toBe("complete");
    expect(job?.projectsDeleted).toBe(2);
    expect(job?.calculationsDeleted).toBe(2);
    expect(job?.pendingUploadsDeleted).toBe(1);
    expect(job?.settingsDeleted).toBe(1);
    expect(job?.auditLogsDeleted).toBeGreaterThanOrEqual(1);

    expect(await asA.query(api.projects.list, {})).toHaveLength(0);
    expect(await asB.query(api.projects.list, {})).toHaveLength(1);
    const blobGone = await t.run(async (ctx) => {
      return (await ctx.db.system.get(storageId)) === null;
    });
    expect(blobGone).toBe(true);

    const account = await t.run(async (ctx) => ctx.db.get(userA));
    expect(account?.email).toBe("delete-a@test.dev");
  });
});
