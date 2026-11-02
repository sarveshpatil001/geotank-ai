import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  enforceUploadLimit,
  enforceUploadRegistrationLimit,
} from "./lib/limits";
import { UPLOAD_LIMITS } from "../lib/scientific-validation";

const PENDING_UPLOAD_TTL_MS = 60 * 60 * 1000;

function cleanFilename(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? "upload";
  let cleaned = "";
  for (const character of base) {
    const code = character.codePointAt(0) ?? 0;
    cleaned += code < 32 || code === 127 ? " " : character;
  }
  return cleaned.trim().slice(0, 120) || "upload";
}

/**
 * Short-lived upload URLs for user-supplied images. Authentication is required
 * so anonymous visitors cannot write to this deployment's storage.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = (await requireUser(ctx))._id;
    await enforceUploadLimit(ctx, userId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Records a completed storage upload before finalisation. The server records
 * only storage metadata it can verify; finalizeUpload re-reads the bytes.
 */
export const registerUpload = mutation({
  args: {
    storageId: v.string(),
    filename: v.string(),
    // Storage metadata normally carries the type. The test/local path may not;
    // finalizeUpload always re-derives it from magic bytes, so this is only a
    // preliminary filter, never the stored truth.
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = (await requireUser(ctx))._id;
    // The storage lookup below is authoritative; this only rejects control
    // characters and absurd lengths from a tampered client.
    if (
      !/^[A-Za-z0-9_-]{10,200}$/.test(args.storageId) ||
      args.storageId.length > 200
    ) {
      throw new ConvexError("The uploaded file reference is not valid.");
    }

    const existingPending = await ctx.db
      .query("pendingUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (existingPending) {
      if (existingPending.userId !== userId) {
        throw new ConvexError("This upload belongs to another account.");
      }
      return { uploadId: existingPending._id };
    }

    const existingProject = await ctx.db
      .query("researchProjects")
      .withIndex("by_upload_storage", (q) =>
        q.eq("uploadStorageId", args.storageId),
      )
      .first();
    if (existingProject) {        throw new ConvexError("This file is already attached to a record.");
    }

    const storageId = args.storageId as Id<"_storage">;
    const metadata = await ctx.db.system.get(storageId);
    if (!metadata) {
      throw new ConvexError(
        "The uploaded file was not found in storage. Upload it again.",
      );
    }
    const contentType = metadata.contentType ?? args.contentType ?? "";
    if (
      !UPLOAD_LIMITS.allowedTypes.includes(
        contentType as (typeof UPLOAD_LIMITS.allowedTypes)[number],
      )
    ) {
      throw new ConvexError(
        "Only JPEG, PNG and WebP images are accepted by this deployment.",
      );
    }
    if (!Number.isFinite(metadata.size) || metadata.size <= 0) {
      throw new ConvexError("The stored file size could not be determined.");
    }
    if (metadata.size > UPLOAD_LIMITS.maxBytes) {
      throw new ConvexError(
        `Images must be ${UPLOAD_LIMITS.maxBytes / (1024 * 1024)} MB or smaller.`,
      );
    }

    await enforceUploadRegistrationLimit(ctx);

    const uploadId = await ctx.db.insert("pendingUploads", {
      userId,
      storageId: args.storageId,
      filename: cleanFilename(args.filename),
      contentType,
      sizeBytes: metadata.size,
      createdAt: Date.now(),
    });
    return { uploadId };
  },
});

export const getPending = internalQuery({
  args: { uploadId: v.id("pendingUploads"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const pending = await ctx.db.get(args.uploadId);
    if (!pending || pending.userId !== args.userId) return null;
    return pending;
  },
});

export const isStorageReferenced = internalQuery({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("researchProjects")
      .withIndex("by_upload_storage", (q) =>
        q.eq("uploadStorageId", args.storageId),
      )
      .first();
    return project !== null;
  },
});

export const deletePending = internalMutation({
  args: { uploadId: v.id("pendingUploads") },
  handler: async (ctx, args) => {
    const pending = await ctx.db.get(args.uploadId);
    if (pending) await ctx.db.delete(pending._id);
  },
});

/** Hourly cleanup for uploads that were registered but never finalised. */
export const purgeUnfinalisedUploads = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cutoff = (args.now ?? Date.now()) - PENDING_UPLOAD_TTL_MS;
    let deleted = 0;
    let blobsDeleted = 0;

    for (let round = 0; round < 20; round += 1) {
      const rows = await ctx.db
        .query("pendingUploads")
        .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
        .take(100);
      if (rows.length === 0) break;

      for (const row of rows) {
        const storageId = row.storageId as Id<"_storage">;
        const referenced = await ctx.db
          .query("researchProjects")
          .withIndex("by_upload_storage", (q) =>
            q.eq("uploadStorageId", row.storageId),
          )
          .first();
        if (!referenced) {
          const metadata = await ctx.db.system.get(storageId);
          if (metadata) {
            await ctx.storage.delete(storageId);
            blobsDeleted += 1;
          }
        }
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }

    return { deleted, blobsDeleted, ranAt: Date.now() };
  },
});
