import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";

/**
 * Per-user settings and data controls. Defaults are returned without writing
 * a row, so merely opening Settings does not mutate the database.
 */

export const DEFAULT_SETTINGS = {
  aiEnabled: true,
} as const;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ...DEFAULT_SETTINGS, persisted: false };
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return settings
      ? { aiEnabled: settings.aiEnabled, persisted: true }
      : { ...DEFAULT_SETTINGS, persisted: false };
  },
});

export const getInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    return settings ? { aiEnabled: settings.aiEnabled } : { ...DEFAULT_SETTINGS };
  },
});

export const update = mutation({
  args: {
    aiEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Sign in to change settings.");
    }
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const next = {
      aiEnabled: args.aiEnabled ?? existing?.aiEnabled ?? DEFAULT_SETTINGS.aiEnabled,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, next);
      return { status: "ok" as const };
    }
    await ctx.db.insert("userSettings", { userId, ...next });
    return { status: "ok" as const };
  },
});

/**
 * Export of everything this app stores for the signed-in user. Image binary
 * data is not inlined; upload records include the storage id and metadata.
 */
export const exportData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const projects = await ctx.db
      .query("researchProjects")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .take(200);
    const calculations = await ctx.db
      .query("calculations")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .take(200);
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return {
      exportedAt: new Date().toISOString(),
      account: { userId },
      settings: settings
        ? { aiEnabled: settings.aiEnabled }
        : DEFAULT_SETTINGS,
      researchProjects: projects,
      calculations,
      note: "Uploaded image binaries are held in Convex file storage and are deleted when the related research record is deleted or when 'Delete all data' is used.",
    };
  },
});

/** Removes every research record, calculation, stored image, setting and log
 *  entry belonging to the signed-in user. */
export const deleteAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Sign in to delete your data.");
    }

    let projectsDeleted = 0;
    let imagesDeleted = 0;
    let calculationsDeleted = 0;

    // Delete in batches until nothing remains, so the operation is not limited
    // by a single page size.
    for (let round = 0; round < 40; round += 1) {
      const projects: Doc<"researchProjects">[] = await ctx.db
        .query("researchProjects")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(50);
      if (projects.length === 0) break;

      for (const project of projects) {
        if (project.upload) {
          const storageId = project.upload.storageId as Id<"_storage">;
          const metadata = await ctx.db.system.get(storageId);
          if (metadata) {
            await ctx.storage.delete(storageId);
            imagesDeleted += 1;
          }
        }
        const linked: Doc<"calculations">[] = await ctx.db
          .query("calculations")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .take(100);
        for (const calculation of linked) {
          if (calculation.userId === userId) {
            await ctx.db.delete(calculation._id);
            calculationsDeleted += 1;
          }
        }
        await ctx.db.delete(project._id);
        projectsDeleted += 1;
      }
    }

    for (let round = 0; round < 40; round += 1) {
      const calculations: Doc<"calculations">[] = await ctx.db
        .query("calculations")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(50);
      if (calculations.length === 0) break;
      for (const calculation of calculations) {
        await ctx.db.delete(calculation._id);
        calculationsDeleted += 1;
      }
    }

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (settings) await ctx.db.delete(settings._id);

    for (let round = 0; round < 20; round += 1) {
      const logs: Doc<"auditLog">[] = await ctx.db
        .query("auditLog")
        .withIndex("by_user_at", (q) => q.eq("userId", userId))
        .take(50);
      if (logs.length === 0) break;
      for (const log of logs) {
        await ctx.db.delete(log._id);
      }
    }

    return {
      status: "ok" as const,
      projectsDeleted,
      imagesDeleted,
      calculationsDeleted,
    };
  },
});
