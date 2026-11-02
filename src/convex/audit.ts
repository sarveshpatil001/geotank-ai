import { v } from "convex/values";

import { internalMutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/**
 * Privacy-conscious activity log. Records what happened to a research record
 * (search, creation, AI run, deletion) without recording query text, uploaded
 * pixels or credentials.
 */

export const record = internalMutation({
  args: {
    userId: v.id("users"),
    action: v.string(),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: args.action.slice(0, 64),
      detail: args.detail.slice(0, 400),
      at: Date.now(),
    });
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = (await requireUser(ctx))._id;
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 50);
    return await ctx.db
      .query("auditLog")
      .withIndex("by_user_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});
