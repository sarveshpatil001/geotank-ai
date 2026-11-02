"use node";

import { createHash } from "node:crypto";
import { ConvexError, v } from "convex/values";

import { extractExif } from "../lib/exif";
import { MAX_UPLOAD_PIXELS, parseImageHeader } from "../lib/image-header";
import { detectImageSignature } from "../lib/image-quality";
import { UPLOAD_LIMITS } from "../lib/scientific-validation";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { locationValidator } from "./validators";

async function cleanupBlob(
  ctx: ActionCtx,
  pendingUploadId: Id<"pendingUploads">,
  storageId: string,
) {
  const referenced = await ctx.runQuery(internal.files.isStorageReferenced, {
    storageId,
  });
  if (!referenced) {
    try {
      await ctx.storage.delete(storageId as Id<"_storage">);
    } catch {
      // The blob may already have been removed; deleting the pending row is
      // still the correct cleanup action.
    }
  }
  await ctx.runMutation(internal.files.deletePending, { uploadId: pendingUploadId });
}

const FAILED = "The upload was rejected and its temporary blob was removed.";

export const finalizeUpload = action({
  args: {
    uploadId: v.id("pendingUploads"),
    location: v.union(locationValidator, v.null()),
    requestedDate: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ id: Id<"researchProjects"> }> => {
    const userId = (await requireUser(ctx))._id;
    const pending: Doc<"pendingUploads"> | null = await ctx.runQuery(
      internal.files.getPending,
      {
        uploadId: args.uploadId,
        userId,
      },
    );
    if (!pending) {
      throw new ConvexError("Pending upload not found for this account.");
    }

    try {
      const alreadyAttached = await ctx.runQuery(
        internal.files.isStorageReferenced,
        { storageId: pending.storageId },
      );
      if (alreadyAttached) {
        throw new ConvexError("This file has already been attached to a record.");
      }

      const blob = await ctx.storage.get(pending.storageId as Id<"_storage">);
      if (!blob) {
        throw new ConvexError("The uploaded file was not found in storage.");
      }
      const buffer = await blob.arrayBuffer();
      const sizeBytes = buffer.byteLength;
      if (sizeBytes <= 0 || sizeBytes > UPLOAD_LIMITS.maxBytes) {
        throw new ConvexError(
          `Images must be between 1 byte and ${UPLOAD_LIMITS.maxBytes / (1024 * 1024)} MB.`,
        );
      }
      if (sizeBytes !== pending.sizeBytes) {
        throw new ConvexError("The stored file size changed during finalisation.");
      }

      const bytes = new Uint8Array(buffer);
      const detectedType = detectImageSignature(bytes);
      const declared = pending.contentType === "image/jpg"
        ? "image/jpeg"
        : pending.contentType;
      if (!detectedType) {
        throw new ConvexError(
          "The file is not a supported JPEG, PNG or WebP image.",
        );
      }
      if (detectedType !== declared) {
        throw new ConvexError(
          "The file's magic bytes do not match its declared image type.",
        );
      }

      const header = parseImageHeader(buffer);
      if (!header) {
        throw new ConvexError(
          "The image header could not be read, so its dimensions are not trusted.",
        );
      }
      if (header.error === "PIXEL_LIMIT") {
        throw new ConvexError(
          `The image is ${header.width} × ${header.height} px, above the ${MAX_UPLOAD_PIXELS / 1_000_000} MP limit.`,
        );
      }
      if (header.width * header.height > MAX_UPLOAD_PIXELS) {
        throw new ConvexError(
          `The image is above the ${MAX_UPLOAD_PIXELS / 1_000_000} MP limit.`,
        );
      }

      const file = new Blob([buffer], { type: detectedType });
      const exif = await extractExif(file);
      const sha256 = createHash("sha256").update(Buffer.from(buffer)).digest("hex");

      const upload: NonNullable<Doc<"researchProjects">["upload"]> = {
        storageId: pending.storageId,
        filename: pending.filename,
        contentType: detectedType,
        sizeBytes,
        width: header.width,
        height: header.height,
        sha256,
        signatureOk: true,
        exifStatus: exif.status,
        exifDateOriginal: exif.dateTimeOriginal,
        exifHasGps: exif.gps !== null,
        exifMake: exif.make,
        exifModel: exif.model,
        declaredCaptureDate: args.requestedDate,
        clientMetrics: null,
      };

      return await ctx.runMutation(
        internal.projects.createFromUploadInternal,
        {
          userId,
          location: args.location,
          requestedDate: args.requestedDate,
          upload,
          pendingUploadId: pending._id,
        },
      );
    } catch (error) {
      await cleanupBlob(ctx, pending._id, pending.storageId);
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        `${FAILED} ${error instanceof Error ? error.message : "No details were available."}`,
      );
    }
  },
});
