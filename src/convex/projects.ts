import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import {
  datePartOf,
  validateBbox,
  validateCaptureDate,
} from "../lib/catalogue";
import {
  buildSceneChecks,
  buildUploadChecks,
  UPLOAD_LIMITS,
  type UploadQualityMetrics,
} from "../lib/scientific-validation";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  analysisValidator,
  locationValidator,
  sceneValidator,
  uploadValidator,
} from "./validators";

async function requireUserId(ctx: MutationCtx | QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Sign in to access research records.");
  }
  return userId;
}

function cleanText(value: string, maxLength: number): string {
  let cleaned = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    cleaned += code < 32 || code === 127 ? " " : character;
  }
  return cleaned.trim().slice(0, maxLength);
}

/** Validates a user-declared search area before it is stored. A location is
 *  user input, so it is checked here rather than trusted from the client. */
function assertValidLocation(
  location: {
    label: string;
    lat: number;
    lon: number;
    bbox: number[];
    source: string;
    attribution: string;
    clamped: boolean;
  } | null,
) {
  if (!location) return null;
  if (
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lon) ||
    Math.abs(location.lat) > 90 ||
    Math.abs(location.lon) > 180
  ) {
    throw new ConvexError("The location coordinates are not valid.");
  }
  const bbox = validateBbox(location.bbox, 1);
  if (!bbox.ok) {
    throw new ConvexError(`The search area is not valid: ${bbox.message}`);
  }
  return { ...location, bbox: bbox.bbox };
}

function sanitizeMetrics(value: unknown): UploadQualityMetrics | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const keys = [
    "width",
    "height",
    "sampleWidth",
    "sampleHeight",
    "meanLuma",
    "stdDevLuma",
    "darkPixelFraction",
    "brightPixelFraction",
    "laplacianVariance",
  ] as const;
  const numbers: Record<string, number> = {};
  for (const key of keys) {
    const number = record[key];
    if (typeof number !== "number" || !Number.isFinite(number)) return null;
    numbers[key] = number;
  }
  if (
    numbers.width <= 0 ||
    numbers.height <= 0 ||
    numbers.width > 60_000 ||
    numbers.height > 60_000 ||
    numbers.sampleWidth <= 0 ||
    numbers.sampleHeight <= 0 ||
    numbers.meanLuma < 0 ||
    numbers.meanLuma > 255 ||
    numbers.stdDevLuma < 0 ||
    numbers.darkPixelFraction < 0 ||
    numbers.darkPixelFraction > 1 ||
    numbers.brightPixelFraction < 0 ||
    numbers.brightPixelFraction > 1 ||
    numbers.laplacianVariance < 0
  ) {
    return null;
  }
  return numbers as UploadQualityMetrics;
}

export const createFromScene = mutation({
  args: {
    location: locationValidator,
    requestedDate: v.string(),
    dateMatch: v.union(v.literal("exact"), v.literal("window")),
    scene: sceneValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    if (args.scene.itemId.length > 400) {
      throw new ConvexError("The catalogue item identifier is not valid.");
    }
    if (args.scene.assets.length > 80) {
      throw new ConvexError(
        "The catalogue item contains more assets than this app supports.",
      );
    }
    if (!Number.isFinite(Date.parse(args.scene.acquiredAt))) {
      throw new ConvexError(
        "The catalogue acquisition timestamp could not be parsed.",
      );
    }

    const dateResult = validateCaptureDate(args.requestedDate);
    if (!dateResult.ok) {
      throw new ConvexError(dateResult.message);
    }

    // Never trust the client's claim that the date matches. The provider
    // timestamp decides, and a mismatch is recorded as a window selection.
    const acquiredDate = datePartOf(args.scene.acquiredAt);
    const dateMatch: "exact" | "window" =
      acquiredDate === dateResult.date ? "exact" : "window";

    const checks = buildSceneChecks({
      requestedDate: dateResult.date,
      scene: {
        ...args.scene,
        bbox: args.scene.bbox
          ? ([...args.scene.bbox] as [number, number, number, number])
          : null,
        geometry: args.scene.geometry ?? null,
      },
      dateMatch,
    });

    const location = assertValidLocation(args.location);
    if (!location) {
      throw new ConvexError("A research area is required for a catalogue record.");
    }

    const now = Date.now();
    const title = cleanText(`${location.label} — ${dateResult.date}`, 120);

    const id = await ctx.db.insert("researchProjects", {
      userId,
      title,
      source: "catalogue",
      location: {
        ...location,
        label: cleanText(location.label, 240),
      },
      requestedDate: dateResult.date,
      dateMatch,
      scene: {
        ...args.scene,
        bbox: args.scene.bbox
          ? ([...args.scene.bbox] as [number, number, number, number])
          : null,
        geometry: args.scene.geometry ?? null,
      },
      upload: null,
      checks,
      analysis: null,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.audit.record, {
      userId,
      action: "project.created",
      detail: `${dateMatch} catalogue record ${args.scene.itemId.slice(0, 120)} for ${dateResult.date}`,
    });

    return { id, dateMatch };
  },
});

export const createFromUpload = mutation({
  args: {
    location: v.union(locationValidator, v.null()),
    requestedDate: v.string(),
    upload: uploadValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const dateResult = validateCaptureDate(args.requestedDate);
    if (!dateResult.ok) {
      throw new ConvexError(dateResult.message);
    }

    if (!/^[a-z0-9]{20,}$/i.test(args.upload.storageId)) {
      throw new ConvexError("The uploaded file reference is not valid.");
    }
    const storageId = args.upload.storageId as Id<"_storage">;
    const metadata = await ctx.db.system.get(storageId);
    if (!metadata) {
      throw new ConvexError(
        "The uploaded file was not found in storage. Upload it again.",
      );
    }

    const contentType = metadata.contentType ?? args.upload.contentType;
    if (
      !UPLOAD_LIMITS.allowedTypes.includes(
        contentType as (typeof UPLOAD_LIMITS.allowedTypes)[number],
      )
    ) {
      throw new ConvexError(
        "Only JPEG, PNG and WebP images are accepted by this deployment.",
      );
    }

    const sizeBytes = metadata.size;
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new ConvexError("The stored file size could not be determined.");
    }
    if (sizeBytes > UPLOAD_LIMITS.maxBytes) {
      throw new ConvexError(
        `Images must be ${UPLOAD_LIMITS.maxBytes / (1024 * 1024)} MB or smaller.`,
      );
    }

    const metrics = sanitizeMetrics(args.upload.clientMetrics);
    const filename = cleanText(args.upload.filename || "upload", 120);

    const uploadRecord = {
      storageId: args.upload.storageId,
      filename,
      contentType,
      sizeBytes,
      width: args.upload.width,
      height: args.upload.height,
      sha256: metadata.sha256 ?? args.upload.sha256,
      signatureOk: args.upload.signatureOk,
      exifStatus: args.upload.exifStatus,
      exifDateOriginal: args.upload.exifDateOriginal,
      exifHasGps: args.upload.exifHasGps,
      exifMake: args.upload.exifMake,
      exifModel: args.upload.exifModel,
      declaredCaptureDate: dateResult.date,
      clientMetrics: metrics,
    };

    const checks = buildUploadChecks({
      requestedDate: dateResult.date,
      summary: {
        filename,
        contentType,
        sizeBytes,
        signatureOk: args.upload.signatureOk,
        sha256: uploadRecord.sha256,
        exifStatus: args.upload.exifStatus,
        exifDateOriginal: args.upload.exifDateOriginal,
        exifHasGps: args.upload.exifHasGps,
        width: args.upload.width,
        height: args.upload.height,
      },
      quality: metrics,
    });

    const validatedLocation = assertValidLocation(args.location);
    const now = Date.now();
    const location = validatedLocation
      ? {
          ...validatedLocation,
          label: cleanText(validatedLocation.label, 240),
        }
      : null;
    const title = cleanText(
      `${location?.label ?? filename} — ${dateResult.date} (upload)`,
      120,
    );

    const id = await ctx.db.insert("researchProjects", {
      userId,
      title,
      source: "upload",
      location,
      requestedDate: dateResult.date,
      dateMatch: "upload",
      scene: null,
      upload: uploadRecord,
      checks,
      analysis: null,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.audit.record, {
      userId,
      action: "project.upload_created",
      detail: `${contentType}, ${(sizeBytes / 1024).toFixed(0)} KiB, declared date ${dateResult.date}`,
    });

    return { id };
  },
});

export const get = query({
  args: { id: v.id("researchProjects") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== userId) return null;

    let imageUrl: string | null = null;
    if (project.upload) {
      imageUrl = await ctx.storage.getUrl(
        project.upload.storageId as Id<"_storage">,
      );
    }
    return { ...project, imageUrl };
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 60);
    return await ctx.db
      .query("researchProjects")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const getOwnedInternal = internalQuery({
  args: { projectId: v.id("researchProjects"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== args.userId) return null;
    return project;
  },
});

export const setAnalysis = internalMutation({
  args: {
    projectId: v.id("researchProjects"),
    userId: v.id("users"),
    analysis: analysisValidator,
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== args.userId) {
      throw new ConvexError("Research record not found for this user.");
    }
    await ctx.db.patch(args.projectId, {
      analysis: args.analysis,
      updatedAt: Date.now(),
    });
  },
});

export const clearAnalysis = mutation({
  args: { projectId: v.id("researchProjects") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) {
      throw new ConvexError("Research record not found.");
    }
    await ctx.db.patch(args.projectId, {
      analysis: null,
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.audit.record, {
      userId,
      action: "analysis.cleared",
      detail: `Cleared AI commentary on ${args.projectId}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("researchProjects") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== userId) {
      throw new ConvexError("Research record not found.");
    }

    if (project.upload) {
      await ctx.storage.delete(project.upload.storageId as Id<"_storage">);
    }

    for (let round = 0; round < 10; round += 1) {
      const linked = await ctx.db
        .query("calculations")
        .withIndex("by_project", (q) => q.eq("projectId", args.id))
        .take(50);
      if (linked.length === 0) break;
      for (const calculation of linked) {
        if (calculation.userId === userId) {
          await ctx.db.delete(calculation._id);
        }
      }
    }

    await ctx.db.delete(args.id);
    await ctx.runMutation(internal.audit.record, {
      userId,
      action: "project.deleted",
      detail: `Deleted research record ${args.id}${project.upload ? " including stored image" : ""}`,
    });
  },
});
