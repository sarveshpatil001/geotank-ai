import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import { mutation } from "./_generated/server";

/**
 * Short-lived upload URLs for user-supplied images. Authentication is required
 * so anonymous visitors cannot write to this deployment's storage.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Sign in before uploading an image.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});
