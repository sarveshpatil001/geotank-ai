import { ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../_generated/server";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const LIMITS = {
  aiHourly: { capacity: 10, windowMs: HOUR_MS },
  geocodeGlobal: { capacity: 1, windowMs: 1_000 },
  geocodeUserHourly: { capacity: 30, windowMs: HOUR_MS },
  imagerySearchHourly: { capacity: 30, windowMs: HOUR_MS },
  imageryHealthHourly: { capacity: 10, windowMs: HOUR_MS },
  uploadDaily: { capacity: 20, windowMs: DAY_MS },
} as const;

export const DEFAULT_AI_DAILY_CAP = 100;

export function aiDailyCap(): number {
  const raw = Number(process.env.AI_DAILY_CAP);
  return Number.isInteger(raw) && raw > 0
    ? Math.min(raw, 10_000)
    : DEFAULT_AI_DAILY_CAP;
}

export function aiKillSwitchEngaged(): boolean {
  return process.env.AI_ENABLED?.trim().toLowerCase() === "false";
}

type LimitCtx = ActionCtx | MutationCtx;

async function debit(
  ctx: LimitCtx,
  key: string,
  spec: { capacity: number; windowMs: number },
  now: number,
) {
  const result = await ctx.runMutation(internal.rateLimits.consume, {
    key,
    capacity: spec.capacity,
    windowMs: spec.windowMs,
    now,
  });
  if (!result.allowed) {
    const seconds = Math.max(1, Math.ceil(result.retryAfterMs / 1_000));
    throw new ConvexError(
      `Rate limit reached. Try again in about ${seconds} second${seconds === 1 ? "" : "s"}.`,
    );
  }
}

export async function enforceAiLimits(
  ctx: LimitCtx,
  userId: Id<"users">,
  now = Date.now(),
) {
  await debit(ctx, `ai:user:${userId}:hour`, LIMITS.aiHourly, now);
  await debit(
    ctx,
    `ai:user:${userId}:day`,
    { capacity: aiDailyCap(), windowMs: DAY_MS },
    now,
  );
}

export async function enforceGeocodeLimits(
  ctx: LimitCtx,
  userId: Id<"users">,
  now = Date.now(),
) {
  await debit(ctx, `geocode:user:${userId}:hour`, LIMITS.geocodeUserHourly, now);
  await debit(ctx, "geocode:global:second", LIMITS.geocodeGlobal, now);
}

export async function enforceImagerySearchLimit(
  ctx: LimitCtx,
  userId: Id<"users">,
  now = Date.now(),
) {
  await debit(
    ctx,
    `imagery:search:user:${userId}:hour`,
    LIMITS.imagerySearchHourly,
    now,
  );
}

export async function enforceImageryHealthLimit(
  ctx: LimitCtx,
  userId: Id<"users">,
  now = Date.now(),
) {
  await debit(
    ctx,
    `imagery:health:user:${userId}:hour`,
    LIMITS.imageryHealthHourly,
    now,
  );
}

export async function enforceUploadLimit(
  ctx: LimitCtx,
  userId: Id<"users">,
  now = Date.now(),
) {
  await debit(ctx, `upload:user:${userId}:day`, LIMITS.uploadDaily, now);
}
