import { ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../_generated/server";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const LIMIT_DEFAULTS = {
  aiHourly: 10,
  aiDaily: 100,
  aiProjectCooldown: 1,
  geocodeGlobal: 1,
  geocodeUserHourly: 30,
  imagerySearchHourly: 30,
  imagerySearchGlobalDaily: 500,
  imageryHealthHourly: 10,
  uploadDaily: 20,
  uploadGlobalDaily: 100,
} as const;

export const DEFAULT_AI_DAILY_CAP = LIMIT_DEFAULTS.aiDaily;

const MAX_OVERRIDES = {
  aiDaily: 10_000,
  geocodeGlobal: 20,
  imagerySearchGlobalDaily: 5_000,
  uploadGlobalDaily: 1_000,
} as const;

type LimitEnv = Record<string, string | undefined>;

/**
 * Empty, non-integer, zero, negative and non-finite overrides fall back to the
 * finite code default. Values above the ceiling are clamped.
 */
export function positiveIntegerOverride(
  raw: string | undefined,
  fallback: number,
  max: number,
): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return fallback;
  return Math.min(value, max);
}

/** Effective limits. Every capacity and window is finite and positive. */
export function effectiveLimits(env: LimitEnv = process.env) {
  return {
    aiHourly: { capacity: LIMIT_DEFAULTS.aiHourly, windowMs: HOUR_MS },
    aiDaily: {
      capacity: positiveIntegerOverride(
        env.AI_DAILY_CAP,
        LIMIT_DEFAULTS.aiDaily,
        MAX_OVERRIDES.aiDaily,
      ),
      windowMs: DAY_MS,
    },
    aiProjectCooldown: {
      capacity: LIMIT_DEFAULTS.aiProjectCooldown,
      windowMs: 60 * 1_000,
    },
    geocodeGlobal: {
      capacity: positiveIntegerOverride(
        env.GEOCODE_GLOBAL_PER_SECOND,
        LIMIT_DEFAULTS.geocodeGlobal,
        MAX_OVERRIDES.geocodeGlobal,
      ),
      windowMs: 1_000,
    },
    geocodeUserHourly: {
      capacity: LIMIT_DEFAULTS.geocodeUserHourly,
      windowMs: HOUR_MS,
    },
    imagerySearchHourly: {
      capacity: LIMIT_DEFAULTS.imagerySearchHourly,
      windowMs: HOUR_MS,
    },
    imagerySearchGlobalDaily: {
      capacity: positiveIntegerOverride(
        env.IMAGERY_SEARCH_GLOBAL_DAILY_CAP,
        LIMIT_DEFAULTS.imagerySearchGlobalDaily,
        MAX_OVERRIDES.imagerySearchGlobalDaily,
      ),
      windowMs: DAY_MS,
    },
    imageryHealthHourly: {
      capacity: LIMIT_DEFAULTS.imageryHealthHourly,
      windowMs: HOUR_MS,
    },
    uploadDaily: {
      capacity: LIMIT_DEFAULTS.uploadDaily,
      windowMs: DAY_MS,
    },
    uploadGlobalDaily: {
      capacity: positiveIntegerOverride(
        env.UPLOAD_GLOBAL_DAILY_CAP,
        LIMIT_DEFAULTS.uploadGlobalDaily,
        MAX_OVERRIDES.uploadGlobalDaily,
      ),
      windowMs: DAY_MS,
    },
  };
}

export function aiDailyCap(env: LimitEnv = process.env): number {
  return effectiveLimits(env).aiDaily.capacity;
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
  const limits = effectiveLimits();
  await debit(ctx, `ai:user:${userId}:hour`, limits.aiHourly, now);
  await debit(ctx, `ai:user:${userId}:day`, limits.aiDaily, now);
}

export async function enforceAiProjectCooldown(
  ctx: LimitCtx,
  projectId: Id<"researchProjects">,
  now = Date.now(),
) {
  await debit(
    ctx,
    `ai:project:${projectId}:cooldown`,
    effectiveLimits().aiProjectCooldown,
    now,
  );
}

export async function enforceGeocodeLimits(
  ctx: LimitCtx,
  userId: Id<"users">,
  now = Date.now(),
) {
  const limits = effectiveLimits();
  await debit(ctx, `geocode:user:${userId}:hour`, limits.geocodeUserHourly, now);
  await debit(ctx, "geocode:global:second", limits.geocodeGlobal, now);
}

export async function enforceImagerySearchLimit(
  ctx: LimitCtx,
  userId: Id<"users">,
  now = Date.now(),
) {
  const limits = effectiveLimits();
  await debit(
    ctx,
    `imagery:search:user:${userId}:hour`,
    limits.imagerySearchHourly,
    now,
  );
  await debit(
    ctx,
    "imagery:search:global:day",
    limits.imagerySearchGlobalDaily,
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
    effectiveLimits().imageryHealthHourly,
    now,
  );
}

export async function enforceUploadLimit(
  ctx: LimitCtx,
  userId: Id<"users">,
  now = Date.now(),
) {
  await debit(
    ctx,
    `upload:user:${userId}:day`,
    effectiveLimits().uploadDaily,
    now,
  );
}

export async function enforceUploadRegistrationLimit(
  ctx: LimitCtx,
  now = Date.now(),
) {
  await debit(
    ctx,
    "upload:register:global:day",
    effectiveLimits().uploadGlobalDaily,
    now,
  );
}
