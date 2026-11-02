import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireUser } from "./lib/auth";

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
    const userId = (await requireUser(ctx))._id;
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
    const userId = (await requireUser(ctx))._id;
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
 * Paginated export of everything this app stores for the signed-in user.
 * Image binary data is not inlined; upload records include the storage id and
 * metadata. The client walks every page until `isDone` is true.
 */
export const exportData = query({
  args: {
    table: v.union(v.literal("projects"), v.literal("calculations")),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = (await requireUser(ctx))._id;
    const requestedLimit = args.limit ?? 100;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 200)
      : 100;

    // Convex permits only one paginated query per function, so callers export
    // projects and calculations as two separate pages sequences.
    let researchProjects: Doc<"researchProjects">[] = [];
    let calculations: Doc<"calculations">[] = [];
    let cursor: string | null = null;
    let isDone = true;
    if (args.table === "projects") {
      const page = await ctx.db
        .query("researchProjects")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .order("desc")
        .paginate({ numItems: limit, cursor: args.cursor ?? null });
      researchProjects = page.page;
      cursor = page.isDone ? null : page.continueCursor;
      isDone = page.isDone;
    } else {
      const page = await ctx.db
        .query("calculations")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .order("desc")
        .paginate({ numItems: limit, cursor: args.cursor ?? null });
      calculations = page.page;
      cursor = page.isDone ? null : page.continueCursor;
      isDone = page.isDone;
    }

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
      researchProjects,
      calculations,
      cursor,
      isDone,
      note: "Uploaded image binaries are held in Convex file storage and are deleted when the related research record is deleted or when 'Delete all data' is used.",
    };
  },
});

type DeletionSummary = {
  status: "running" | "complete";
  jobId: Id<"deletionJobs">;
  projectsDeleted: number;
  imagesDeleted: number;
  calculationsDeleted: number;
  pendingUploadsDeleted: number;
  settingsDeleted: number;
  auditLogsDeleted: number;
};

function deletionSummary(job: Doc<"deletionJobs">): DeletionSummary {
  return {
    status: job.status,
    jobId: job._id,
    projectsDeleted: job.projectsDeleted,
    imagesDeleted: job.imagesDeleted,
    calculationsDeleted: job.calculationsDeleted,
    pendingUploadsDeleted: job.pendingUploadsDeleted,
    settingsDeleted: job.settingsDeleted,
    auditLogsDeleted: job.auditLogsDeleted,
  };
}

/** Starts (or resumes) a scheduled, batched deletion of all account data. */
export const deleteAll = mutation({
  args: {},
  handler: async (ctx): Promise<DeletionSummary> => {
    const userId = (await requireUser(ctx))._id;
    const active = await ctx.db
      .query("deletionJobs")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (active && active.status === "running") {
      return deletionSummary(active);
    }

    const now = Date.now();
    const jobId = await ctx.db.insert("deletionJobs", {
      userId,
      status: "running",
      projectsDeleted: 0,
      imagesDeleted: 0,
      calculationsDeleted: 0,
      pendingUploadsDeleted: 0,
      settingsDeleted: 0,
      auditLogsDeleted: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.settings.deleteBatch, { jobId });
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("The deletion job could not be created.");
    return deletionSummary(job);
  },
});

export const deletionStatus = query({
  args: { jobId: v.id("deletionJobs") },
  handler: async (ctx, args): Promise<DeletionSummary | null> => {
    const userId = (await requireUser(ctx))._id;
    const job = await ctx.db.get(args.jobId);
    if (!job || job.userId !== userId) return null;
    return deletionSummary(job);
  },
});

const PROJECT_BATCH = 25;
const ROW_BATCH = 50;

/** One bounded transaction. Counts only increase after each delete commits. */
export const deleteBatch = internalMutation({
  args: { jobId: v.id("deletionJobs") },
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "complete") return null;

    let projectsDeleted = job.projectsDeleted;
    let imagesDeleted = job.imagesDeleted;
    let calculationsDeleted = job.calculationsDeleted;
    let pendingUploadsDeleted = job.pendingUploadsDeleted;
    let settingsDeleted = job.settingsDeleted;
    let auditLogsDeleted = job.auditLogsDeleted;

    const projects: Doc<"researchProjects">[] = await ctx.db
      .query("researchProjects")
      .withIndex("by_user", (q) => q.eq("userId", job.userId))
      .take(PROJECT_BATCH);
    for (const project of projects) {
      const storageId = project.uploadStorageId ?? project.upload?.storageId;
      if (storageId) {
        const id = storageId as Id<"_storage">;
        if (await ctx.db.system.get(id)) {
          await ctx.storage.delete(id);
          imagesDeleted += 1;
        }
      }
      await ctx.db.delete(project._id);
      projectsDeleted += 1;
    }

    const calculations: Doc<"calculations">[] = await ctx.db
      .query("calculations")
      .withIndex("by_user", (q) => q.eq("userId", job.userId))
      .take(ROW_BATCH);
    for (const calculation of calculations) {
      await ctx.db.delete(calculation._id);
      calculationsDeleted += 1;
    }

    const pending: Doc<"pendingUploads">[] = await ctx.db
      .query("pendingUploads")
      .withIndex("by_user", (q) => q.eq("userId", job.userId))
      .take(ROW_BATCH);
    for (const upload of pending) {
      const id = upload.storageId as Id<"_storage">;
      if (await ctx.db.system.get(id)) {
        await ctx.storage.delete(id);
        imagesDeleted += 1;
      }
      await ctx.db.delete(upload._id);
      pendingUploadsDeleted += 1;
    }

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", job.userId))
      .first();
    if (settings) {
      await ctx.db.delete(settings._id);
      settingsDeleted += 1;
    }

    const logs: Doc<"auditLog">[] = await ctx.db
      .query("auditLog")
      .withIndex("by_user_at", (q) => q.eq("userId", job.userId))
      .take(ROW_BATCH);
    for (const log of logs) {
      await ctx.db.delete(log._id);
      auditLogsDeleted += 1;
    }

    const remainingProject = await ctx.db
      .query("researchProjects")
      .withIndex("by_user", (q) => q.eq("userId", job.userId))
      .first();
    const remainingCalculation = await ctx.db
      .query("calculations")
      .withIndex("by_user", (q) => q.eq("userId", job.userId))
      .first();
    const remainingPending = await ctx.db
      .query("pendingUploads")
      .withIndex("by_user", (q) => q.eq("userId", job.userId))
      .first();
    const remainingLog = await ctx.db
      .query("auditLog")
      .withIndex("by_user_at", (q) => q.eq("userId", job.userId))
      .first();
    const remainingSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", job.userId))
      .first();
    const complete =
      !remainingProject &&
      !remainingCalculation &&
      !remainingPending &&
      !remainingLog &&
      !remainingSettings;

    await ctx.db.patch(args.jobId, {
      status: complete ? "complete" : "running",
      projectsDeleted,
      imagesDeleted,
      calculationsDeleted,
      pendingUploadsDeleted,
      settingsDeleted,
      auditLogsDeleted,
      updatedAt: Date.now(),
    });

    if (!complete) {
      await ctx.scheduler.runAfter(0, internal.settings.deleteBatch, {
        jobId: args.jobId,
      });
    }
    return null;
  },
});
