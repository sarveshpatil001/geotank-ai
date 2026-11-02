import { v } from "convex/values";

/**
 * Shared validators so the schema and the functions cannot drift apart.
 * `schemaValidation` is enabled in schema.ts, and these validators produce
 * accurate generated TypeScript types.
 */

export const volumeValidator = v.object({
  cubicMeters: v.number(),
  liters: v.number(),
  usGallons: v.number(),
  oilBarrels: v.number(),
});

export const checkValidator = v.object({
  id: v.string(),
  // Optional for records written before the evidence/scope-limit split.
  kind: v.optional(
    v.union(v.literal("evidence"), v.literal("scope-limit")),
  ),
  label: v.string(),
  status: v.union(
    v.literal("PASS"),
    v.literal("WARN"),
    v.literal("FAIL"),
    v.literal("NOT MEASURABLE"),
    v.literal("NOT VERIFIED"),
    v.literal("NOT APPLICABLE"),
  ),
  detail: v.string(),
  basis: v.string(),
  rule: v.string(),
});

export const locationValidator = v.object({
  label: v.string(),
  lat: v.number(),
  lon: v.number(),
  bbox: v.array(v.number()),
  source: v.string(),
  attribution: v.string(),
  clamped: v.boolean(),
});

export const assetValidator = v.object({
  key: v.string(),
  title: v.string(),
  type: v.union(v.string(), v.null()),
  href: v.string(),
  roles: v.array(v.string()),
  requiresAuth: v.boolean(),
  gsdM: v.union(v.number(), v.null()),
});

export const sceneStatisticValidator = v.object({
  label: v.string(),
  value: v.number(),
});

// Only bounded GeoJSON shapes are stored. Coordinate/ring/polygon counts and
// string lengths are additionally capped by normalizeStacItem before insert.
const positionValidator = v.array(v.number());
const ringValidator = v.array(positionValidator);
const polygonCoordinatesValidator = v.array(ringValidator);
const multiPolygonCoordinatesValidator = v.array(polygonCoordinatesValidator);

export const geometryValidator = v.union(
  v.object({
    type: v.literal("Polygon"),
    coordinates: polygonCoordinatesValidator,
  }),
  v.object({
    type: v.literal("MultiPolygon"),
    coordinates: multiPolygonCoordinatesValidator,
  }),
);

export const sceneValidator = v.object({
  providerId: v.string(),
  providerName: v.string(),
  collectionId: v.string(),
  collectionName: v.string(),
  itemId: v.string(),
  acquiredAt: v.string(),
  publishedAt: v.union(v.string(), v.null()),
  updatedAt: v.union(v.string(), v.null()),
  platform: v.union(v.string(), v.null()),
  gridCode: v.union(v.string(), v.null()),
  orbitState: v.union(v.string(), v.null()),
  resolutionM: v.union(v.number(), v.null()),
  cloudCoverPct: v.union(v.number(), v.null()),
  bbox: v.union(v.array(v.number()), v.null()),
  geometry: v.union(geometryValidator, v.null()),
  thumbnailUrl: v.union(v.string(), v.null()),
  selfUrl: v.union(v.string(), v.null()),
  licenseUrl: v.string(),
  attribution: v.string(),
  assets: v.array(assetValidator),
  statistics: v.array(sceneStatisticValidator),
});

export const imageMetricsValidator = v.object({
  width: v.number(),
  height: v.number(),
  sampleWidth: v.number(),
  sampleHeight: v.number(),
  meanLuma: v.number(),
  stdDevLuma: v.number(),
  darkPixelFraction: v.number(),
  brightPixelFraction: v.number(),
  laplacianVariance: v.number(),
});

export const uploadValidator = v.object({
  storageId: v.string(),
  filename: v.string(),
  contentType: v.string(),
  sizeBytes: v.number(),
  width: v.union(v.number(), v.null()),
  height: v.union(v.number(), v.null()),
  sha256: v.union(v.string(), v.null()),
  signatureOk: v.boolean(),
  exifStatus: v.union(
    v.literal("present"),
    v.literal("absent"),
    v.literal("unreadable"),
  ),
  exifDateOriginal: v.union(v.string(), v.null()),
  exifHasGps: v.boolean(),
  exifMake: v.union(v.string(), v.null()),
  exifModel: v.union(v.string(), v.null()),
  declaredCaptureDate: v.string(),
  clientMetrics: v.union(imageMetricsValidator, v.null()),
});

export const analysisValidator = v.object({
  status: v.union(
    v.literal("succeeded"),
    v.literal("failed"),
    v.literal("unavailable"),
  ),
  model: v.string(),
  ranAt: v.number(),
  summary: v.string(),
  sections: v.array(
    v.object({
      title: v.string(),
      body: v.string(),
    }),
  ),
  limitations: v.array(v.string()),
  credits: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
});

export const researchProjectFields = {
  userId: v.id("users"),
  uploadStorageId: v.optional(v.union(v.string(), v.null())),
  title: v.string(),
  source: v.union(v.literal("catalogue"), v.literal("upload")),
  location: v.union(locationValidator, v.null()),
  requestedDate: v.string(),
  dateMatch: v.union(
    v.literal("exact"),
    v.literal("window"),
    v.literal("upload"),
  ),
  scene: v.union(sceneValidator, v.null()),
  upload: v.union(uploadValidator, v.null()),
  checks: v.array(checkValidator),
  analysis: v.union(analysisValidator, v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const calculationFields = {
  userId: v.id("users"),
  projectId: v.union(v.id("researchProjects"), v.null()),
  geometry: v.union(
    v.literal("vertical-cylinder"),
    v.literal("horizontal-cylinder"),
  ),
  geometryLabel: v.string(),
  formula: v.string(),
  unit: v.union(
    v.literal("m"),
    v.literal("cm"),
    v.literal("mm"),
    v.literal("ft"),
    v.literal("in"),
  ),
  diameterInput: v.number(),
  secondInput: v.number(),
  diameterM: v.number(),
  radiusM: v.number(),
  heightM: v.union(v.number(), v.null()),
  lengthM: v.union(v.number(), v.null()),
  volume: volumeValidator,
  engineVersion: v.string(),
  createdAt: v.number(),
};
