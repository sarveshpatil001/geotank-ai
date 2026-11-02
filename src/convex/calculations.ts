import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import {
  computeCapacity,
  LENGTH_UNITS,
  TANK_GEOMETRIES,
  type LengthUnit,
  type TankGeometry,
} from "../lib/tank-geometry";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";

/**
 * Calculations are re-executed here with the shared deterministic engine. The
 * client may display a live preview, but the stored record is always computed
 * from the submitted dimensions on the server, so a tampered client cannot
 * store an invented volume.
 */

const geometryValidator = v.union(
  v.literal("vertical-cylinder"),
  v.literal("horizontal-cylinder"),
);

const unitValidator = v.union(
  v.literal("m"),
  v.literal("cm"),
  v.literal("mm"),
  v.literal("ft"),
  v.literal("in"),
);

export const save = mutation({
  args: {
    geometry: geometryValidator,
    unit: unitValidator,
    diameterValue: v.number(),
    secondValue: v.number(),
    projectId: v.optional(v.id("researchProjects")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Sign in to save a calculation.");
    }

    const geometry = TANK_GEOMETRIES[args.geometry as TankGeometry];
    if (!geometry) {
      return { status: "invalid" as const, message: "Unsupported tank geometry." };
    }
    if (!(args.unit in LENGTH_UNITS)) {
      return { status: "invalid" as const, message: "Unsupported length unit." };
    }

    const outcome = computeCapacity({
      geometry: args.geometry as TankGeometry,
      unit: args.unit as LengthUnit,
      diameter: args.diameterValue,
      height: geometry.secondField === "height" ? args.secondValue : undefined,
      length: geometry.secondField === "length" ? args.secondValue : undefined,
    });

    if (!outcome.ok) {
      return {
        status: "invalid" as const,
        message: outcome.problems[0]?.message ?? "The dimensions are not valid.",
        problems: outcome.problems,
      };
    }

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.userId !== userId) {
        throw new ConvexError("Research record not found.");
      }
    }

    const calculation = outcome.calculation;
    const id = await ctx.db.insert("calculations", {
      userId,
      projectId: args.projectId ?? null,
      geometry: calculation.geometry,
      geometryLabel: calculation.geometryLabel,
      formula: calculation.formula,
      unit: calculation.unit,
      diameterInput: calculation.diameterInput,
      secondInput: calculation.secondInput,
      diameterM: calculation.diameterM,
      radiusM: calculation.radiusM,
      heightM: calculation.heightM ?? null,
      lengthM: calculation.lengthM ?? null,
      volume: calculation.volume,
      engineVersion: calculation.engineVersion,
      createdAt: Date.now(),
    });

    await ctx.runMutation(internal.audit.record, {
      userId,
      action: "calculation.saved",
      detail: `${calculation.geometryLabel}: ${calculation.volume.cubicMeters.toFixed(6)} m³ via ${calculation.engineVersion}`,
    });

    return { status: "ok" as const, id, calculation };
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
    return await ctx.db
      .query("calculations")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const listForProject = query({
  args: { projectId: v.id("researchProjects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("calculations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(50);
    return rows.filter((row) => row.userId === userId);
  },
});

export const remove = mutation({
  args: { id: v.id("calculations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Sign in to delete a calculation.");
    }
    const calculation = await ctx.db.get(args.id);
    if (!calculation || calculation.userId !== userId) {
      throw new ConvexError("Calculation not found.");
    }
    await ctx.db.delete(args.id);
    await ctx.runMutation(internal.audit.record, {
      userId,
      action: "calculation.deleted",
      detail: `Deleted calculation ${args.id}`,
    });
  },
});
