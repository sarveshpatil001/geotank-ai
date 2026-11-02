import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type {
  ActionCtx,
  MutationCtx,
  QueryCtx,
} from "../_generated/server";

/**
 * Single source of truth for "there is an authenticated Convex Auth identity
 * AND a real users row behind it". Actions cannot read ctx.db directly, so the
 * row is fetched through the read-only currentUser query.
 */
export type AuthedUser = Doc<"users">;

export async function requireUser(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<AuthedUser> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Sign in to access this resource.");
  }

  const user =
    "db" in ctx
      ? await ctx.db.get(userId as Id<"users">)
      : await ctx.runQuery(api.users.currentUser);

  if (!user) {
    throw new ConvexError(
      "Your account record was not found. Sign in again before continuing.",
    );
  }
  return user;
}
