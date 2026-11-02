import { ConvexError, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { takeToken } from "./lib/rateLimit";

/**
 * Persist one bucket debit. The internal mutation is the only database writer;
 * the action helpers in lib/limits.ts turn a denial into a ConvexError with a
 * precise retry hint.
 */
export const consume = internalMutation({
  args: {
    key: v.string(),
    capacity: v.number(),
    windowMs: v.number(),
    now: v.number(),
    cost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const key = args.key.trim();
    if (!key || key.length > 200) {
      throw new ConvexError("The rate-limit key is not valid.");
    }

    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    const result = takeToken(
      existing
        ? { tokens: existing.tokens, updatedAt: existing.updatedAt }
        : null,
      args.capacity,
      args.windowMs,
      args.now,
      args.cost,
    );

    if (existing) {
      await ctx.db.patch(existing._id, {
        tokens: result.tokens,
        updatedAt: result.updatedAt,
      });
    } else {
      await ctx.db.insert("rateLimits", {
        key,
        tokens: result.tokens,
        updatedAt: result.updatedAt,
      });
    }

    return {
      allowed: result.allowed,
      remaining: result.tokens,
      retryAfterMs: result.retryAfterMs,
    };
  },
});
