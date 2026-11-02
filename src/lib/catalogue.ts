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
    note: "10 m, 20 m and 60 m pixels. Usually too coarse to measure a small tank.",
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
export type GeoPosition = [number, number];
export type SceneGeometry =
  | { type: "Polygon"; coordinates: GeoPosition[][] }
  | { type: "MultiPolygon"; coordinates: GeoPosition[][][] };

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
  geometry: SceneGeometry | null;
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
  | {
      ok: false;
      code:
        | "REQUIRED"
        | "FORMAT"
        | "INVALID_DATE"
        | "FUTURE_DATE"
        | "BEFORE_SUPPORTED";
      message: string;
    };

/** Sentinel-2A launch; catalogue searches for an earlier date cannot return
 *  this app's supported collection. */
export const SENTINEL2_FIRST_CAPTURE_DATE = "2015-06-23";

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
      message: "Use the date format YYYY-MM-DD, for example 2024-06-28.",
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
      message: "That date does not exist.",
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
        "The capture date cannot be in the future. Choose today or earlier.",
    };
  }
  const firstSupported = Date.UTC(2015, 5, 23);
  if (utc < firstSupported) {
    return {
      ok: false,
      code: "BEFORE_SUPPORTED",
      message: `Sentinel-2 has no images before ${SENTINEL2_FIRST_CAPTURE_DATE}. Choose a later date.`,
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
export function normalizeWindowDays(windowDays: number): number | null {
  if (!Number.isFinite(windowDays)) return null;
  return Math.min(Math.max(Math.trunc(windowDays), 1), 15);
}

export function windowInterval(
  date: string,
  windowDays: number,
): WindowInterval | null {
  const days = normalizeWindowDays(windowDays);
  if (days === null) return null;
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
    const match = token.match(/^([+-]?)(\d+(?:\.\d+)?)([NSEWnsew])?$/);
    if (!match) return null;
    const explicitSign = match[1];
    const value = Number(match[2]);
    if (!Number.isFinite(value)) return null;
    const hemisphere = match[3]?.toUpperCase();
    // Do not mix a numeric sign with a hemisphere: "-33.9S" and "33.9N" are
    // unambiguous only if one convention is used. Reject the ambiguity.
    if (hemisphere && explicitSign) return null;
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
    return { ok: false, message: "A search box needs four numbers." };
  }
  if (bbox.some((value) => !Number.isFinite(value))) {
    return { ok: false, message: "Every search box value must be a normal number." };
  }
  const [west, south, east, north] = bbox;
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    return {
      ok: false,
      message: "A search box coordinate is outside the valid latitude or longitude range.",
    };
  }
  if (west >= east || south >= north) {
    return {
      ok: false,
      message:
        "The search box must run west to east and south to north. The app does not support boxes that cross the date line.",
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

const STORED_URL_SUFFIX_HOSTS = [
  "dataspace.copernicus.eu",
  "sentinels.copernicus.eu",
] as const;

// CDSE returns its rendered quicklook from this exact data hub. No subdomain
// is accepted, so a lookalike host cannot inherit the allowlist entry.
const STORED_URL_EXACT_HOSTS = new Set(["datahub.creodias.eu"]);

/** Stored external URLs are HTTPS-only and limited to Copernicus hosts. */
export function isAllowedStoredUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (STORED_URL_EXACT_HOSTS.has(host)) return true;
    return STORED_URL_SUFFIX_HOSTS.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

function readStoredUrl(value: unknown): string | null {
  const raw = readString(value);
  if (!raw || raw.length > 1_000) return null;
  return isAllowedStoredUrl(raw) ? raw : null;
}

const MAX_GEOMETRY_POINTS = 5_000;
const MAX_GEOMETRY_RINGS = 40;
const MAX_RING_POINTS = 400;

function normalizePosition(value: unknown): GeoPosition | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  return [lon, lat];
}

function normalizeRing(
  value: unknown,
  budget: { points: number },
): GeoPosition[] | null {
  if (!Array.isArray(value) || value.length < 4 || value.length > MAX_RING_POINTS) {
    return null;
  }
  const ring: GeoPosition[] = [];
  for (const entry of value) {
    const position = normalizePosition(entry);
    if (!position) return null;
    ring.push(position);
    budget.points += 1;
    if (budget.points > MAX_GEOMETRY_POINTS) return null;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return null;
  return ring;
}

/** Bounded GeoJSON geometry: Polygon/MultiPolygon only, finite coordinates,
 *  closed rings, max 5,000 points total. Other shapes are not stored. */
export function normalizeGeometry(value: unknown): SceneGeometry | null {
  const geometry = asRecord(value);
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  const budget = { points: 0 };

  if (geometry.type === "Polygon") {
    if (geometry.coordinates.length > MAX_GEOMETRY_RINGS) return null;
    const rings: GeoPosition[][] = [];
    for (const entry of geometry.coordinates) {
      const ring = normalizeRing(entry, budget);
      if (!ring) return null;
      rings.push(ring);
    }
    return rings.length > 0 ? { type: "Polygon", coordinates: rings } : null;
  }

  if (geometry.type === "MultiPolygon") {
    if (geometry.coordinates.length > MAX_GEOMETRY_RINGS) return null;
    const polygons: GeoPosition[][][] = [];
    for (const polygon of geometry.coordinates) {
      if (!Array.isArray(polygon) || polygon.length > MAX_GEOMETRY_RINGS) {
        return null;
      }
      const rings: GeoPosition[][] = [];
      for (const entry of polygon) {
        const ring = normalizeRing(entry, budget);
        if (!ring) return null;
        rings.push(ring);
      }
      if (rings.length === 0) return null;
      polygons.push(rings);
    }
    return polygons.length > 0
      ? { type: "MultiPolygon", coordinates: polygons }
      : null;
  }

  return null;
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
    .slice(0, 40)
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
  if (!itemId || itemId.length > 400 || !properties) return null;

  const acquiredAt = toUtcIso(properties.datetime);
  if (!acquiredAt) return null;

  const assetsRaw = asRecord(item.assets) ?? {};
  const assets: CatalogueAsset[] = [];
  for (const [key, value] of Object.entries(assetsRaw).slice(0, 80)) {
    const asset = asRecord(value);
    if (!asset) continue;
    const href = readStoredUrl(asset.href);
    if (!href) continue;
    const roles = Array.isArray(asset.roles)
      ? asset.roles
          .filter((role): role is string => typeof role === "string")
          .slice(0, 10)
          .map((role) => role.slice(0, 60))
      : [];
    const authRefs = Array.isArray(asset["auth:refs"])
      ? asset["auth:refs"].slice(0, 10)
      : [];
    assets.push({
      key: key.slice(0, 80),
      title: (readString(asset.title) ?? key).slice(0, 120),
      type: readString(asset.type)?.slice(0, 80) ?? null,
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
        .slice(0, 14)
        .map(([label, value]) => ({
          label: label.slice(0, 60),
          value: readNumber(value),
        }))
        .filter(
          (entry): entry is SceneStatistic => entry.value !== null,
        )
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
    geometry: normalizeGeometry(item.geometry),
    thumbnailUrl: readStoredUrl(thumbnailAsset?.href),
    selfUrl: selfLink ? readStoredUrl(selfLink.href) : null,
    licenseUrl: readStoredUrl(licenseLink?.href) ?? SENTINEL_LEGAL_NOTICE_URL,
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
      title: "Copernicus sign-in problem",
      detail:
        "Copernicus rejected the search. This search should not need a login, so Copernicus may have changed something.",
    };
  }
  if (status === 429) {
    return {
      status: "error",
      kind: "rate_limited",
      httpStatus: status,
      title: "Copernicus is busy",
      detail:
        "Copernicus asked the app to slow down. Wait a moment and try again. No results were hidden.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      status: "error",
      kind: "invalid_query",
      httpStatus: status,
      title: "Copernicus rejected the search",
      detail:
        "Copernicus did not accept the place or date. Change them and try again.",
    };
  }
  if (typeof status === "number" && status >= 500) {
    return {
      status: "error",
      kind: "upstream",
      httpStatus: status,
      title: "Copernicus server error",
      detail:
        "Copernicus returned an error. This is not an empty result. The search did not finish.",
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
      title: "Copernicus took too long",
      detail:
        "Copernicus did not answer in time. No image data was received.",
    };
  }
  if (name === "SyntaxError") {
    return {
      status: "error",
      kind: "malformed",
      title: "Copernicus sent an unreadable reply",
      detail:
        "The reply was not valid STAC data. Nothing from it was used.",
    };
  }
  if (name === "TypeError") {
    return {
      status: "error",
      kind: "network",
      title: "Could not reach Copernicus",
      detail:
        "A network problem stopped the request. Check your connection and try again.",
    };
  }
  return {
    status: "error",
    kind: "unknown",
    title: "Image search failed",
    detail:
      message.trim() ||
      "The search did not finish and returned no usable data.",
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
