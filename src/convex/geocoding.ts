import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import {
  bboxAroundPoint,
  parseCoordinateInput,
  validateBbox,
  type GeoBbox,
} from "../lib/catalogue";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { locationValidator } from "./validators";

/**
 * Location resolution.
 *
 * Documented method: coordinates are parsed locally; place names are resolved
 * with OpenStreetMap Nominatim (https://nominatim.org/release-docs/latest/api/Search/).
 * Nominatim's usage policy requires an identifying User-Agent, low request
 * volume and caching, so successful lookups are cached in Convex for 30 days.
 * Results are returned as candidates for the user to choose from; the app never
 * silently picks a different place.
 */

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  "TankCalculatorAI/1.0 (private satellite imagery research workspace)";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_CANDIDATES = 5;

const OSM_ATTRIBUTION =
  "Geocoding © OpenStreetMap contributors, ODbL 1.0 (nominatim.openstreetmap.org)";
const COORDINATE_ATTRIBUTION =
  "Coordinates entered by the user; no geocoding service was queried.";

export type LocationCandidate = {
  label: string;
  lat: number;
  lon: number;
  bbox: number[];
  source: string;
  attribution: string;
  clamped: boolean;
};

export type GeocodeResponse =
  | {
      status: "ok";
      mode: "geocoder" | "coordinates";
      candidates: LocationCandidate[];
      cached: boolean;
    }
  | { status: "empty"; message: string }
  | { status: "invalid"; message: string }
  | { status: "error"; kind: string; message: string };

async function requireUserId(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Sign in before resolving a location.");
  }
  return userId;
}

function candidateFromNominatim(entry: unknown): LocationCandidate | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  const label = typeof record.display_name === "string" ? record.display_name : "";
  const lat = Number(record.lat);
  const lon = Number(record.lon);
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const box = Array.isArray(record.boundingbox)
    ? record.boundingbox.map((value) => Number(value))
    : null;
  const rawBbox: GeoBbox =
    box && box.length === 4 && box.every((value) => Number.isFinite(value))
      ? [box[2], box[0], box[3], box[1]] // Nominatim returns south,north,west,east
      : bboxAroundPoint(lat, lon);

  const validated = validateBbox(rawBbox);
  const bbox: GeoBbox = validated.ok ? validated.bbox : bboxAroundPoint(lat, lon);

  return {
    label,
    lat,
    lon,
    bbox,
    source: "OpenStreetMap Nominatim",
    attribution: OSM_ATTRIBUTION,
    clamped: validated.ok ? validated.clamped : true,
  };
}

export const resolveLocation = action({
  args: { query: v.string() },
  handler: async (ctx, args): Promise<GeocodeResponse> => {
    await requireUserId(ctx);

    const query = args.query.trim();
    if (query.length < 2) {
      return {
        status: "invalid",
        message: "Enter a place name or coordinates, for example 51.95, 4.14.",
      };
    }
    if (query.length > 200) {
      return {
        status: "invalid",
        message: "That location query is too long (200 characters maximum).",
      };
    }

    const coordinates = parseCoordinateInput(query);
    if (coordinates) {
      const candidate: LocationCandidate = {
        label: `${coordinates.lat.toFixed(4)}, ${coordinates.lon.toFixed(4)}`,
        lat: coordinates.lat,
        lon: coordinates.lon,
        bbox: bboxAroundPoint(coordinates.lat, coordinates.lon),
        source: "User-provided coordinates",
        attribution: COORDINATE_ATTRIBUTION,
        clamped: false,
      };
      return {
        status: "ok",
        mode: "coordinates",
        candidates: [candidate],
        cached: false,
      };
    }

    const cacheKey = query.toLowerCase().replace(/\s+/g, " ");
    const cached = await ctx.runQuery(internal.geocoding.readCache, {
      key: cacheKey,
    });
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return {
        status: "ok",
        mode: "geocoder",
        candidates: cached.payload.candidates,
        cached: true,
      };
    }

    const url = new URL(NOMINATIM_SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(MAX_CANDIDATES));
    url.searchParams.set("dedupe", "1");
    url.searchParams.set("accept-language", "en");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          status: "error",
          kind: response.status === 429 ? "rate_limited" : "upstream",
          message:
            response.status === 429
              ? "The geocoder rate limit was reached. Wait a moment and retry."
              : `The geocoder returned HTTP ${response.status}. The location was not resolved.`,
        };
      }

      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        return {
          status: "error",
          kind: "malformed",
          message:
            "The geocoder response was not a result list. Nothing from it has been used.",
        };
      }

      const candidates = payload
        .map(candidateFromNominatim)
        .filter((entry): entry is LocationCandidate => entry !== null);

      if (candidates.length === 0) {
        return {
          status: "empty",
          message: `No place matched “${query}”. Try a more specific name or enter coordinates directly.`,
        };
      }

      await ctx.runMutation(internal.geocoding.writeCache, {
        key: cacheKey,
        payload: { candidates, mode: "geocoder", rawQuery: query },
        fetchedAt: Date.now(),
      });

      return {
        status: "ok",
        mode: "geocoder",
        candidates,
        cached: false,
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : "";
      return {
        status: "error",
        kind:
          name === "AbortError" || /abort/i.test(message)
            ? "timeout"
            : "network",
        message:
          name === "AbortError" || /abort/i.test(message)
            ? "The geocoder did not answer within 12 seconds. The location was not resolved."
            : "The geocoder could not be reached. Check connectivity and retry.",
      };
    } finally {
      clearTimeout(timer);
    }
  },
});

export const readCache = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("geocodeCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
  },
});

export const writeCache = internalMutation({
  args: {
    key: v.string(),
    payload: v.object({
      candidates: v.array(locationValidator),
      mode: v.union(v.literal("geocoder"), v.literal("coordinates")),
      rawQuery: v.string(),
    }),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("geocodeCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        payload: args.payload,
        fetchedAt: args.fetchedAt,
      });
      return existing._id;
    }
    return await ctx.db.insert("geocodeCache", {
      key: args.key,
      payload: args.payload,
      fetchedAt: args.fetchedAt,
    });
  },
});
