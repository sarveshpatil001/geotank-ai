import { v } from "convex/values";

import {
  CATALOGUE_PROVIDER,
  CDSE_STAC_LANDING_URL,
  CDSE_STAC_SEARCH_URL,
  SEARCH_LIMIT,
  SUPPORTED_COLLECTIONS,
  buildSearchBody,
  classifyCatalogueFailure,
  dayInterval,
  normalizeSearchResponse,
  normalizeWindowDays,
  validateBbox,
  validateCaptureDate,
  windowInterval,
  type CatalogueFailure,
  type CatalogueScene,
} from "../lib/catalogue";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  enforceImageryHealthLimit,
  enforceImagerySearchLimit,
} from "./lib/limits";

/**
 * Copernicus Data Space Ecosystem STAC search.
 *
 * Verified live against https://stac.dataspace.copernicus.eu/v1/search:
 * anonymous POST works, items carry an acquisition datetime, eo:cloud_cover,
 * gsd and assets. Data downloads need OIDC/S3 credentials; this connector only
 * searches metadata and reads the provider's public quicklook preview.
 *
 * Empty results, timeouts, auth failures, rate limits, upstream errors and
 * malformed payloads are returned as distinct states.
 */

const REQUEST_TIMEOUT_MS = 25_000;

export type ImagerySearchResult =
  | {
      status: "ok" | "empty";
      mode: "exact" | "window";
      requestedDate: string;
      interval: string;
      window: { startDate: string; endDate: string; windowDays: number } | null;
      provider: typeof CATALOGUE_PROVIDER;
      collection: { id: string; name: string };
      query: {
        bbox: number[];
        datetime: string;
        maxCloudPct: number | null;
      };
      scenes: CatalogueScene[];
      counts: {
        returnedFeatures: number;
        exactDateMatches: number;
        differentDateFeatures: number;
        filteredByCloud: number;
        malformedFeatures: number;
      };
      note: string;
    }
  | CatalogueFailure
  | { status: "invalid"; message: string };

export const search = action({
  args: {
    bbox: v.array(v.number()),
    date: v.string(),
    maxCloudPct: v.optional(v.number()),
    windowDays: v.optional(v.number()),
    collection: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ImagerySearchResult> => {
    const userId = (await requireUser(ctx))._id;
    await enforceImagerySearchLimit(ctx, userId);

    const dateResult = validateCaptureDate(args.date);
    if (!dateResult.ok) {
      return { status: "invalid", message: dateResult.message };
    }

    const bboxResult = validateBbox(args.bbox);
    if (!bboxResult.ok) {
      return { status: "invalid", message: bboxResult.message };
    }

    const collectionId = args.collection ?? "sentinel-2-l2a";
    const collection = SUPPORTED_COLLECTIONS.find(
      (entry) => entry.id === collectionId,
    );
    if (!collection) {
      return {
        status: "invalid",
        message: `Collection ${collectionId} is not supported by this deployment.`,
      };
    }

    let maxCloudPct: number | undefined;
    if (args.maxCloudPct !== undefined) {
      if (
        !Number.isFinite(args.maxCloudPct) ||
        args.maxCloudPct < 0 ||
        args.maxCloudPct > 100
      ) {
        return {
          status: "invalid",
          message: "Maximum cloud cover must be between 0 and 100 percent.",
        };
      }
      maxCloudPct = args.maxCloudPct;
    }

    let windowDays: number | undefined;
    if (args.windowDays !== undefined) {
      const normalized = normalizeWindowDays(args.windowDays);
      if (normalized === null) {
        return {
          status: "invalid",
          message:
            "The nearby-date window must be a finite number between 1 and 15 days.",
        };
      }
      windowDays = normalized;
    }

    const mode: "exact" | "window" =
      windowDays !== undefined ? "window" : "exact";
    const window =
      windowDays !== undefined
        ? windowInterval(dateResult.date, windowDays)
        : null;
    const interval = window ? window.interval : dayInterval(dateResult.date);

    const body = buildSearchBody({
      bbox: bboxResult.bbox,
      interval,
      collectionId,
      maxCloudPct,
      limit: SEARCH_LIMIT,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/geo+json, application/json",
    };
    if (process.env.CDSE_STAC_TOKEN) {
      // Optional: only used if the deployment owner supplies a token.
      headers.Authorization = `Bearer ${process.env.CDSE_STAC_TOKEN}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(CDSE_STAC_SEARCH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const failure = classifyCatalogueFailure({
          httpStatus: response.status,
        });
        await ctx.runMutation(internal.audit.record, {
          userId,
          action: "imagery.search_failed",
          detail: `${failure.kind} (HTTP ${response.status}) for ${dateResult.date}`,
        });
        return failure;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        const failure = classifyCatalogueFailure({
          errorName: "SyntaxError",
          message: "Invalid JSON",
        });
        await ctx.runMutation(internal.audit.record, {
          userId,
          action: "imagery.search_failed",
          detail: `${failure.kind} for ${dateResult.date}`,
        });
        return failure;
      }

      const normalized = normalizeSearchResponse(payload, {
        requestedDate: dateResult.date,
        collectionId,
        mode,
        maxCloudPct,
      });

      const scenes = normalized.scenes;
      const status = scenes.length > 0 ? "ok" : "empty";

      await ctx.runMutation(internal.audit.record, {
        userId,
        action: "imagery.search",
        detail: `${status}: ${scenes.length} scene(s) for ${dateResult.date} in ${collectionId}${mode === "window" ? ` (window ±${window?.windowDays} days)` : ""}`,
      });

      return {
        status,
        mode,
        requestedDate: dateResult.date,
        interval,
        window,
        provider: CATALOGUE_PROVIDER,
        collection: { id: collection.id, name: collection.name },
        query: {
          bbox: bboxResult.bbox,
          datetime: interval,
          maxCloudPct: maxCloudPct ?? null,
        },
        scenes,
        counts: {
          returnedFeatures: normalized.returnedFeatures,
          exactDateMatches: normalized.exactDateMatches,
          differentDateFeatures: normalized.differentDateFeatures,
          filteredByCloud: normalized.filteredByCloud,
          malformedFeatures: normalized.malformedFeatures,
        },
        note:
          status === "empty"
            ? mode === "exact"
              ? "The catalogue responded successfully but returned no imagery acquired on this exact date for the requested area. No other date was substituted."
              : "The catalogue responded successfully but returned no imagery in the selected date window for this area."
            : `All ${scenes.length} result(s) were acquired within the requested ${
                mode === "exact" ? "date" : "window"
              }. Acquisition date is taken from the provider timestamp, not the processing date.`,
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : "";
      const failure = classifyCatalogueFailure({
        errorName:
          name === "AbortError" || /abort/i.test(message) ? "AbortError" : name,
        message,
      });
      await ctx.runMutation(internal.audit.record, {
        userId,
        action: "imagery.search_failed",
        detail: `${failure.kind} for ${dateResult.date}`,
      });
      return failure;
    } finally {
      clearTimeout(timer);
    }
  },
});

export const health = action({
  args: {},
  handler: async (ctx) => {
    const userId = (await requireUser(ctx))._id;
    await enforceImageryHealthLimit(ctx, userId);
    const checkedAt = Date.now();
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(CDSE_STAC_LANDING_URL, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      return {
        provider: CATALOGUE_PROVIDER.name,
        endpoint: CDSE_STAC_LANDING_URL,
        reachable: response.ok,
        httpStatus: response.status,
        latencyMs: Date.now() - started,
        checkedAt,
        docsUrl: CATALOGUE_PROVIDER.docsUrl,
        aiConfigured: Boolean(process.env.VLY_INTEGRATION_KEY),
      };
    } catch (error) {
      return {
        provider: CATALOGUE_PROVIDER.name,
        endpoint: CDSE_STAC_LANDING_URL,
        reachable: false,
        httpStatus: null,
        latencyMs: Date.now() - started,
        checkedAt,
        docsUrl: CATALOGUE_PROVIDER.docsUrl,
        error:
          error instanceof Error && error.name === "AbortError"
            ? "Connectivity check timed out after 8 seconds."
            : "Connectivity check failed at the network level.",
        aiConfigured: Boolean(process.env.VLY_INTEGRATION_KEY),
      };
    } finally {
      clearTimeout(timer);
    }
  },
});
