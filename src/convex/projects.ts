import { ConvexError, v } from "convex/values";

import {
  CDSE_STAC_BASE,
  SUPPORTED_COLLECTIONS,
  datePartOf,
  normalizeStacItem,
  validateBbox,
  validateCaptureDate,
  type CatalogueScene,
} from "../lib/catalogue";
import {
  buildSceneChecks,
  buildUploadChecks,
} from "../lib/scientific-validation";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  analysisValidator,
  locationValidator,
  sceneValidator,
  uploadValidator,
} from "./validators";

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

const STAC_ITEM_TIMEOUT_MS = 25_000;

type SceneCreationResult = {
  id: Id<"researchProjects">;
  dateMatch: "exact" | "window";
};

export const createFromScene = action({
  args: {
    itemId: v.string(),
    collectionId: v.string(),
    location: locationValidator,
    requestedDate: v.string(),
  },
  handler: async (ctx, args): Promise<SceneCreationResult> => {
    const userId = (await requireUser(ctx))._id;
    const hasControlCharacter = [...args.itemId].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    });
    if (
      args.itemId.length < 1 ||
      args.itemId.length > 400 ||
      hasControlCharacter
    ) {
      throw new ConvexError("The catalogue item identifier is not valid.");
    }
    const collection = SUPPORTED_COLLECTIONS.find(
      (entry) => entry.id === args.collectionId,
    );
    if (!collection) {
      throw new ConvexError("The requested catalogue collection is not supported.");
    }
    const dateResult = validateCaptureDate(args.requestedDate);
    if (!dateResult.ok) {
      throw new ConvexError(dateResult.message);
    }

    const url = `${CDSE_STAC_BASE}/collections/${encodeURIComponent(collection.id)}/items/${encodeURIComponent(args.itemId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STAC_ITEM_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/geo+json, application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut =
        error instanceof Error && error.name === "AbortError";
      throw new ConvexError(
        timedOut
          ? "The catalogue did not return this item within 25 seconds. Nothing was stored."
          : "The catalogue item could not be fetched. Nothing was stored.",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new ConvexError(
        `The catalogue could not return this item (HTTP ${response.status}). Nothing was stored.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ConvexError(
        "The catalogue item response was not valid JSON. Nothing was stored.",
      );
    }
    const scene = normalizeStacItem(payload, collection.id);
    if (!scene || scene.itemId !== args.itemId) {
      throw new ConvexError(
        "The catalogue item did not contain the required metadata. Nothing was stored.",
      );
    }

    return await ctx.runMutation(internal.projects.createFromSceneInternal, {
      userId,
      location: args.location,
      requestedDate: dateResult.date,
      scene,
    });
  },
});

export const createFromSceneInternal = internalMutation({
  args: {
    userId: v.id("users"),
    location: locationValidator,
    requestedDate: v.string(),
    scene: sceneValidator,
  },
  handler: async (ctx, args): Promise<SceneCreationResult> => {
    const dateResult = validateCaptureDate(args.requestedDate);
    if (!dateResult.ok) {
      throw new ConvexError(dateResult.message);
    }
    const scene = args.scene as unknown as CatalogueScene;
    if (!Number.isFinite(Date.parse(scene.acquiredAt))) {
      throw new ConvexError(
        "The catalogue acquisition timestamp could not be parsed.",
      );
    }

    // The provider timestamp decides the match; no client claim is accepted.
    const acquiredDate = datePartOf(scene.acquiredAt);
    const dateMatch: "exact" | "window" =
      acquiredDate === dateResult.date ? "exact" : "window";

    const checks = buildSceneChecks({
      requestedDate: dateResult.date,
      scene,
      dateMatch,
    });

    const validated = assertValidLocation(args.location);
    if (!validated) {
      throw new ConvexError("A research area is required for a catalogue record.");
    }
    const location = {
      ...validated,
      label: cleanText(validated.label, 240),
    };

    const now = Date.now();
    const title = cleanText(`${location.label} — ${dateResult.date}`, 120);
    const id = await ctx.db.insert("researchProjects", {
      userId: args.userId,
      uploadStorageId: null,
      title,
      source: "catalogue",
      location,
      requestedDate: dateResult.date,
      dateMatch,
      scene: {
        ...scene,
        geometry: scene.geometry ?? null,
      },
      upload: null,
      checks,
      analysis: null,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.audit.record, {
      userId: args.userId,
      action: "project.created",
      detail: `${dateMatch} catalogue record ${scene.itemId.slice(0, 120)} for ${dateResult.date}`,
    });

    return { id, dateMatch };
  },
});

export const createFromUploadInternal = internalMutation({
  args: {
    userId: v.id("users"),
    location: v.union(locationValidator, v.null()),
    requestedDate: v.string(),
    upload: uploadValidator,
    pendingUploadId: v.id("pendingUploads"),
  },
  handler: async (ctx, args): Promise<{ id: Id<"researchProjects"> }> => {
    const dateResult = validateCaptureDate(args.requestedDate);
    if (!dateResult.ok) {
      throw new ConvexError(dateResult.message);
    }
    const duplicate = await ctx.db
      .query("researchProjects")
      .withIndex("by_upload_storage", (q) =>
        q.eq("uploadStorageId", args.upload.storageId),
      )
      .first();
    if (duplicate) {
      throw new ConvexError("This file has already been attached to a record.");
    }

    const upload = args.upload;
    const checks = buildUploadChecks({
      requestedDate: dateResult.date,
      summary: {
        filename: upload.filename,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        signatureOk: upload.signatureOk,
        sha256: upload.sha256,
        exifStatus: upload.exifStatus,
        exifDateOriginal: upload.exifDateOriginal,
        exifHasGps: upload.exifHasGps,
        width: upload.width,
        height: upload.height,
      },
      quality: upload.clientMetrics,
    });

    const validated = assertValidLocation(args.location);
    const location = validated
      ? { ...validated, label: cleanText(validated.label, 240) }
      : null;
    const filename = cleanText(upload.filename || "upload", 120);
    const now = Date.now();
    const title = cleanText(
      `${location?.label ?? filename} — ${dateResult.date} (upload)`,
      120,
    );

    const id = await ctx.db.insert("researchProjects", {
      userId: args.userId,
      uploadStorageId: upload.storageId,
      title,
      source: "upload",
      location,
      requestedDate: dateResult.date,
      dateMatch: "upload",
      scene: null,
      upload: { ...upload, filename },
      checks,
      analysis: null,
      createdAt: now,
      updatedAt: now,
    });

    const pending = await ctx.db.get(args.pendingUploadId);
    if (
      pending &&
      pending.userId === args.userId &&
      pending.storageId === upload.storageId
    ) {
      await ctx.db.delete(pending._id);
    }

    await ctx.runMutation(internal.audit.record, {
      userId: args.userId,
      action: "project.upload_created",
      detail: `${upload.contentType}, ${(upload.sizeBytes / 1024).toFixed(0)} KiB, declared date ${dateResult.date}`,
    });

    return { id };
  },
});

export const get = query({
  args: { id: v.id("researchProjects") },
  handler: async (ctx, args) => {
    const userId = (await requireUser(ctx))._id;
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
    const userId = (await requireUser(ctx))._id;
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
    const userId = (await requireUser(ctx))._id;
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
    const userId = (await requireUser(ctx))._id;
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
