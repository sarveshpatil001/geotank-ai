/**
 * Pure satellite catalogue logic: request validation, STAC response
 * normalisation and failure classification.
 *
 * Nothing here invents metadata. Every field is either taken from the provider
 * response, derived arithmetically from returned values, or explicitly null.
 * Provider: Copernicus Data Space Ecosystem (CDSE) STAC API.
 * Documented at https://documentation.dataspace.copernicus.eu/APIs/STAC.html
 */

export const CDSE_STAC_BASE = "https://stac.dataspace.copernicus.eu/v1" as const;
export const CDSE_STAC_SEARCH_URL = `${CDSE_STAC_BASE}/search` as const;
export const CDSE_STAC_LANDING_URL = `${CDSE_STAC_BASE}/` as const;
export const CDSE_STAC_DOCS_URL =
  "https://documentation.dataspace.copernicus.eu/APIs/STAC.html" as const;
export const SENTINEL_LEGAL_NOTICE_URL =
  "https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice" as const;
export const SENTINEL_ATTRIBUTION_NOTE =
  "Copernicus Sentinel data are provided free of charge under the Sentinel Data Legal Notice." as const;

export const CATALOGUE_PROVIDER = {
  id: "cdse-stac",
  name: "Copernicus Data Space Ecosystem",
  service: "STAC API v1",
  landingUrl: CDSE_STAC_LANDING_URL,
  docsUrl: CDSE_STAC_DOCS_URL,
} as const;

export const SUPPORTED_COLLECTIONS = [
  {
    id: "sentinel-2-l2a",
    name: "Sentinel-2 Level-2A",
    note: "Surface reflectance, 10 m / 20 m / 60 m bands. Generally too coarse for individual small-tank geometry.",
  },
] as const;

export const SEARCH_LIMIT = 24;
export const MAX_BBOX_SPAN_DEGREES = 0.6;
export const DEFAULT_POINT_RADIUS_KM = 2.5;

export type CatalogueAsset = {
  key: string;
  title: string;
  type: string | null;
  href: string;
  roles: string[];
  requiresAuth: boolean;
  gsdM: number | null;
};

export type SceneStatistic = { label: string; value: number };

export type CatalogueScene = {
  providerId: string;
  providerName: string;
  collectionId: string;
  collectionName: string;
  itemId: string;
  acquiredAt: string;
  publishedAt: string | null;
  updatedAt: string | null;
  platform: string | null;
  gridCode: string | null;
  orbitState: string | null;
  resolutionM: number | null;
  cloudCoverPct: number | null;
  bbox: [number, number, number, number] | null;
  geometry: unknown | null;
  thumbnailUrl: string | null;
  selfUrl: string | null;
  licenseUrl: string;
  attribution: string;
  assets: CatalogueAsset[];
  statistics: SceneStatistic[];
};

export type GeoBbox = [number, number, number, number];

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

export type DateResult =
  | { ok: true; date: string }
  | { ok: false; code: "REQUIRED" | "FORMAT" | "INVALID_DATE" | "FUTURE_DATE"; message: string };

export function validateCaptureDate(
  input: string,
  now: Date = new Date(),
): DateResult {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "REQUIRED",
      message: "Enter the image capture date (YYYY-MM-DD).",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return {
      ok: false,
      code: "FORMAT",
      message: "Use the format YYYY-MM-DD, for example 2024-06-28.",
    };
  }
  const [year, month, day] = trimmed.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(utc);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return {
      ok: false,
      code: "INVALID_DATE",
      message: "That calendar date does not exist.",
    };
  }
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (utc > todayUtc) {
    return {
      ok: false,
      code: "FUTURE_DATE",
      message:
        "A capture date in the future cannot have acquired imagery. Choose today or earlier.",
    };
  }
  return { ok: true, date: trimmed };
}

/** A closed UTC day interval. A bare instant would otherwise only match items
 *  intersecting that exact moment. */
export function dayInterval(date: string): string {
  return `${date}T00:00:00Z/${date}T23:59:59Z`;
}

export type WindowInterval = {
  interval: string;
  startDate: string;
  endDate: string;
  windowDays: number;
};

/** Explicitly user-chosen nearby-date window. Never used silently. */
export function windowInterval(date: string, windowDays: number): WindowInterval {
  const days = Math.min(Math.max(Math.trunc(windowDays), 1), 15);
  const center = Date.parse(`${date}T12:00:00Z`);
  const start = new Date(center - days * 86_400_000);
  const end = new Date(center + days * 86_400_000);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  return {
    interval: `${startDate}T00:00:00Z/${endDate}T23:59:59Z`,
    startDate,
    endDate,
    windowDays: days,
  };
}

export function toUtcIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function datePartOf(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Coordinates and areas                                                      */
/* -------------------------------------------------------------------------- */

export type CoordinateResult = {
  lat: number;
  lon: number;
  source: "user-coordinates";
};

/**
 * Accepts "51.95, 4.14", "51.95 4.14", "51.95N, 4.14E", "33.9S 18.4E".
 * Returns null when the text is not a coordinate pair, so the caller can fall
 * back to a documented geocoder instead of guessing.
 */
export function parseCoordinateInput(input: string): CoordinateResult | null {
  const cleaned = String(input ?? "")
    .replace(/\u00b0/g, "")
    .replace(/\s*,\s*/g, " ")
    .replace(/(\d)\s+([NSEWnsew])(?=\s|$)/g, "$1$2")
    .trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(/\s+/);
  if (tokens.length !== 2) return null;

  const parseToken = (token: string, axis: "lat" | "lon") => {
    const match = token.match(/^([+-]?\d+(?:\.\d+)?)([NSEWnsew])?$/);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;
    const hemisphere = match[2]?.toUpperCase();
    if (axis === "lat" && hemisphere && !"NS".includes(hemisphere)) return null;
    if (axis === "lon" && hemisphere && !"EW".includes(hemisphere)) return null;
    const signed =
      hemisphere === "S" || hemisphere === "W" ? -Math.abs(value) : value;
    return signed;
  };

  const lat = parseToken(tokens[0], "lat");
  const lon = parseToken(tokens[1], "lon");
  if (lat === null || lon === null) return null;

  // Out-of-range values are rejected rather than silently swapped: resolving
  // to a different place than the user typed would be a silent substitution.
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, source: "user-coordinates" };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function bboxAroundPoint(
  lat: number,
  lon: number,
  radiusKm: number = DEFAULT_POINT_RADIUS_KM,
): GeoBbox {
  const latDelta = radiusKm / 111.32;
  const lonDelta =
    radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.0001));
  const west = clamp(lon - lonDelta, -180, 180);
  const east = clamp(lon + lonDelta, -180, 180);
  const south = clamp(lat - latDelta, -90, 90);
  const north = clamp(lat + latDelta, -90, 90);
  return [west, south, east, north];
}

export type BboxResult =
  | { ok: true; bbox: GeoBbox; spanDegrees: number; clamped: boolean }
  | { ok: false; message: string };

export function validateBbox(
  bbox: number[],
  maxSpanDegrees: number = MAX_BBOX_SPAN_DEGREES,
): BboxResult {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return { ok: false, message: "A bounding box needs four numbers." };
  }
  if (bbox.some((value) => !Number.isFinite(value))) {
    return { ok: false, message: "Bounding box values must be finite numbers." };
  }
  const [west, south, east, north] = bbox;
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    return {
      ok: false,
      message: "Bounding box coordinates are outside the valid longitude/latitude range.",
    };
  }
  if (west >= east || south >= north) {
    return {
      ok: false,
      message:
        "Bounding box must be ordered west < east and south < north. Antimeridian-crossing boxes are not supported.",
    };
  }

  const centerLon = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const lonSpan = east - west;
  const latSpan = north - south;
  const spanDegrees = Math.max(lonSpan, latSpan);

  if (spanDegrees <= maxSpanDegrees) {
    return {
      ok: true,
      bbox: [west, south, east, north],
      spanDegrees,
      clamped: false,
    };
  }

  const half = maxSpanDegrees / 2;
  const clipped: GeoBbox = [
    clamp(centerLon - half, -180, 180),
    clamp(centerLat - half, -90, 90),
    clamp(centerLon + half, -180, 180),
    clamp(centerLat + half, -90, 90),
  ];
  return {
    ok: true,
    bbox: clipped,
    spanDegrees: maxSpanDegrees,
    clamped: true,
  };
}

/* -------------------------------------------------------------------------- */
/* STAC request and response handling                                         */
/* -------------------------------------------------------------------------- */

export type SearchRequest = {
  bbox: GeoBbox;
  interval: string;
  collectionId: string;
  maxCloudPct?: number;
  limit?: number;
};

export function buildSearchBody(request: SearchRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    collections: [request.collectionId],
    bbox: request.bbox,
    datetime: request.interval,
    limit: Math.min(Math.max(request.limit ?? SEARCH_LIMIT, 1), 100),
  };
  if (
    typeof request.maxCloudPct === "number" &&
    Number.isFinite(request.maxCloudPct) &&
    request.maxCloudPct >= 0 &&
    request.maxCloudPct <= 100
  ) {
    body.filter = {
      op: "<=",
      args: [{ property: "eo:cloud_cover" }, request.maxCloudPct],
    };
    body["filter-lang"] = "cql2-json";
  }
  return body;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Only http(s) URLs are allowed into an href/src attribute. */
function readHttpUrl(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readLinks(raw: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(raw.links)) return [];
  return raw.links
    .map((link) => asRecord(link))
    .filter((link): link is Record<string, unknown> => link !== null);
}

function readBbox(value: unknown): GeoBbox | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const numbers = value.slice(0, 4).map((entry) => Number(entry));
  if (numbers.some((entry) => !Number.isFinite(entry))) return null;
  return numbers as GeoBbox;
}

/** Convert one STAC feature into the app's scene shape. Returns null when the
 *  feature lacks the minimum fields required to cite it honestly. */
export function normalizeStacItem(
  raw: unknown,
  collectionId: string,
): CatalogueScene | null {
  const item = asRecord(raw);
  if (!item) return null;
  const itemId = readString(item.id);
  const properties = asRecord(item.properties);
  if (!itemId || !properties) return null;

  const acquiredAt = toUtcIso(properties.datetime);
  if (!acquiredAt) return null;

  const assetsRaw = asRecord(item.assets) ?? {};
  const assets: CatalogueAsset[] = [];
  for (const [key, value] of Object.entries(assetsRaw)) {
    const asset = asRecord(value);
    if (!asset) continue;
    const href = readString(asset.href);
    if (!href) continue;
    const roles = Array.isArray(asset.roles)
      ? asset.roles.filter((role): role is string => typeof role === "string")
      : [];
    const authRefs = Array.isArray(asset["auth:refs"])
      ? asset["auth:refs"]
      : [];
    assets.push({
      key,
      title: readString(asset.title) ?? key,
      type: readString(asset.type),
      href,
      roles,
      requiresAuth: authRefs.length > 0,
      gsdM: readNumber(asset.gsd),
    });
  }

  const thumbnailAsset = assets.find(
    (asset) =>
      asset.key === "thumbnail" ||
      asset.roles.includes("thumbnail") ||
      asset.roles.includes("overview"),
  );

  const links = readLinks(item);
  const selfLink =
    links.find((link) => link.rel === "self") ??
    links.find((link) => link.rel === "item");
  const licenseLink = links.find((link) => link.rel === "license");

  const statisticsRaw = asRecord(properties.statistics);
  const statistics: SceneStatistic[] = statisticsRaw
    ? Object.entries(statisticsRaw)
        .map(([label, value]) => ({ label, value: readNumber(value) }))
        .filter(
          (entry): entry is SceneStatistic => entry.value !== null,
        )
        .slice(0, 14)
    : [];

  const collection = SUPPORTED_COLLECTIONS.find(
    (entry) => entry.id === collectionId,
  );
  const acquisitionYear = acquiredAt.slice(0, 4);

  return {
    providerId: CATALOGUE_PROVIDER.id,
    providerName: CATALOGUE_PROVIDER.name,
    collectionId,
    collectionName: collection?.name ?? collectionId,
    itemId,
    acquiredAt,
    publishedAt: toUtcIso(properties.published),
    updatedAt: toUtcIso(properties.updated),
    platform: readString(properties.platform),
    gridCode: readString(properties["grid:code"]),
    orbitState: readString(properties["sat:orbit_state"]),
    resolutionM: readNumber(properties.gsd),
    cloudCoverPct: readNumber(properties["eo:cloud_cover"]),
    bbox: readBbox(item.bbox),
    geometry: item.geometry ?? null,
    thumbnailUrl: readHttpUrl(thumbnailAsset?.href),
    selfUrl: selfLink ? readHttpUrl(selfLink.href) : null,
    licenseUrl: readHttpUrl(licenseLink?.href) ?? SENTINEL_LEGAL_NOTICE_URL,
    attribution: `Contains modified Copernicus Sentinel data ${acquisitionYear}`,
    assets,
    statistics,
  };
}

export type NormalizedSearch = {
  scenes: CatalogueScene[];
  returnedFeatures: number;
  exactDateMatches: number;
  differentDateFeatures: number;
  filteredByCloud: number;
  malformedFeatures: number;
};

/**
 * Normalise a STAC FeatureCollection and, for exact-date searches, drop any
 * feature whose acquisition date is not the requested date. Those features are
 * counted so the UI can state that provider filtering was defensive rather
 * than silent.
 */
export function normalizeSearchResponse(
  payload: unknown,
  options: {
    requestedDate: string;
    collectionId: string;
    mode: "exact" | "window";
    maxCloudPct?: number;
  },
): NormalizedSearch {
  const root = asRecord(payload);
  const features = Array.isArray(root?.features) ? root.features : [];
  const scenes: CatalogueScene[] = [];
  let malformedFeatures = 0;
  let differentDateFeatures = 0;
  let filteredByCloud = 0;

  for (const feature of features) {
    const scene = normalizeStacItem(feature, options.collectionId);
    if (!scene) {
      malformedFeatures += 1;
      continue;
    }
    if (options.mode === "exact" && datePartOf(scene.acquiredAt) !== options.requestedDate) {
      differentDateFeatures += 1;
      continue;
    }
    if (
      typeof options.maxCloudPct === "number" &&
      scene.cloudCoverPct !== null &&
      scene.cloudCoverPct > options.maxCloudPct
    ) {
      filteredByCloud += 1;
      continue;
    }
    scenes.push(scene);
  }

  scenes.sort((a, b) => {
    if (a.cloudCoverPct === null && b.cloudCoverPct === null) {
      return a.acquiredAt.localeCompare(b.acquiredAt);
    }
    if (a.cloudCoverPct === null) return 1;
    if (b.cloudCoverPct === null) return -1;
    if (a.cloudCoverPct !== b.cloudCoverPct) {
      return a.cloudCoverPct - b.cloudCoverPct;
    }
    return a.acquiredAt.localeCompare(b.acquiredAt);
  });

  return {
    scenes,
    returnedFeatures: features.length,
    exactDateMatches: scenes.length,
    differentDateFeatures,
    filteredByCloud,
    malformedFeatures,
  };
}

/* -------------------------------------------------------------------------- */
/* Failure classification                                                     */
/* -------------------------------------------------------------------------- */

export type CatalogueFailureKind =
  | "timeout"
  | "auth"
  | "rate_limited"
  | "invalid_query"
  | "upstream"
  | "network"
  | "malformed"
  | "unknown";

export type CatalogueFailure = {
  status: "error";
  kind: CatalogueFailureKind;
  title: string;
  detail: string;
  httpStatus?: number;
};

export function classifyCatalogueFailure(input: {
  httpStatus?: number;
  errorName?: string;
  message?: string;
}): CatalogueFailure {
  const status = input.httpStatus;
  const name = input.errorName ?? "";
  const message = input.message ?? "";

  if (status === 401 || status === 403) {
    return {
      status: "error",
      kind: "auth",
      httpStatus: status,
      title: "Catalogue authentication problem",
      detail:
        "The catalogue rejected the request with an authentication or authorisation response. Search for this provider is expected to be anonymous; this may be a provider-side change.",
    };
  }
  if (status === 429) {
    return {
      status: "error",
      kind: "rate_limited",
      httpStatus: status,
      title: "Catalogue rate limit reached",
      detail:
        "Copernicus asked us to slow down. Wait a moment and retry; no results were hidden.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      status: "error",
      kind: "invalid_query",
      httpStatus: status,
      title: "Catalogue rejected the query",
      detail:
        "The catalogue considered the search parameters invalid. Adjust the area or date and retry.",
    };
  }
  if (typeof status === "number" && status >= 500) {
    return {
      status: "error",
      kind: "upstream",
      httpStatus: status,
      title: "Catalogue server error",
      detail:
        "Copernicus returned a server error. This is not an empty result: the search did not complete.",
    };
  }
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    /timed? ?out|timeout/i.test(message)
  ) {
    return {
      status: "error",
      kind: "timeout",
      title: "Catalogue request timed out",
      detail:
        "The catalogue did not answer within the request budget. No imagery metadata was retrieved.",
    };
  }
  if (name === "SyntaxError") {
    return {
      status: "error",
      kind: "malformed",
      title: "Unreadable catalogue response",
      detail:
        "The catalogue response was not valid STAC JSON. Nothing from it has been used.",
    };
  }
  if (name === "TypeError") {
    return {
      status: "error",
      kind: "network",
      title: "Could not reach the catalogue",
      detail:
        "A network-level failure prevented the request from completing. Check connectivity and retry.",
    };
  }
  return {
    status: "error",
    kind: "unknown",
    title: "Catalogue search failed",
    detail:
      message.trim() ||
      "The search did not complete and produced no usable catalogue metadata.",
  };
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                       */
/* -------------------------------------------------------------------------- */

export function formatCloudCover(value: number | null): string {
  if (value === null) return "Not reported";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatResolution(value: number | null): string {
  if (value === null) return "Not reported";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} m / pixel`;
}

export function formatCoordinate(lat: number, lon: number): string {
  const latLabel = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
  const lonLabel = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
  return `${latLabel}, ${lonLabel}`;
}

export function platformLabel(platform: string | null): string {
  if (!platform) return "Not reported";
  const normalized = platform.toLowerCase();
  if (normalized === "sentinel-2a") return "Sentinel-2A";
  if (normalized === "sentinel-2b") return "Sentinel-2B";
  if (normalized === "sentinel-2c") return "Sentinel-2C";
  return platform;
}
