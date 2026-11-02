/**
 * Independent verification script for the deterministic layers.
 * Run with: bun run scripts/verify-math.ts
 *
 * Reference values are literals written in this file (not computed by the
 * engine under test) or derived with independent constants, so a broken engine
 * cannot make its own test pass.
 */

import assert from "node:assert/strict";

import {
  bboxAroundPoint,
  buildSearchBody,
  classifyCatalogueFailure,
  dayInterval,
  normalizeSearchResponse,
  normalizeStacItem,
  parseCoordinateInput,
  SENTINEL_LEGAL_NOTICE_URL,
  validateBbox,
  validateCaptureDate,
  windowInterval,
} from "../src/lib/catalogue";
import { parseJpegExif } from "../src/lib/exif";
import { detectImageSignature } from "../src/lib/image-quality";
import {
  buildCalculationChecks,
  buildSceneChecks,
  buildUploadChecks,
  summarizeChecks,
} from "../src/lib/scientific-validation";
import { buildResearchReport, reportToMarkdown } from "../src/lib/report";
import {
  computeCapacity,
  estimateMassFromDensity,
  formatDecimal,
  formatVolume,
  LENGTH_UNITS,
  parseLength,
  type LengthUnit,
} from "../src/lib/tank-geometry";
import type { ResearchProjectRecord } from "../src/lib/research-types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, run: () => void) {
  try {
    run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`✗ ${name}\n    ${message}`);
  }
}

function close(actual: number, expected: number, tolerance = 1e-12) {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= tolerance * scale,
    `expected ${expected}, received ${actual}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Tank geometry                                                              */
/* -------------------------------------------------------------------------- */

const vertical = computeCapacity({
  geometry: "vertical-cylinder",
  unit: "m",
  diameter: 4,
  height: 5,
});

const horizontal = computeCapacity({
  geometry: "horizontal-cylinder",
  unit: "m",
  diameter: 3,
  length: 8,
});

test("vertical cylinder matches the independent reference volume", () => {
  assert.equal(vertical.ok, true);
  if (!vertical.ok) return;
  // π × 2² × 5 = 20π = 62.83185307179586 m³
  close(vertical.calculation.volume.cubicMeters, 62.83185307179586);
  close(vertical.calculation.volume.liters, 62831.85307179586);
  assert.equal(vertical.calculation.radiusM, 2);
});

test("horizontal cylinder matches the independent reference volume", () => {
  assert.equal(horizontal.ok, true);
  if (!horizontal.ok) return;
  // π × 1.5² × 8 = 18π = 56.548667764616276 m³
  close(horizontal.calculation.volume.cubicMeters, 56.54866776461628);
  close(horizontal.calculation.volume.liters, 56548.66776461628);
});

test("barrel conversion agrees with the independent 158.987294928 L definition", () => {
  if (!vertical.ok) throw new Error("reference calculation failed");
  const liters = vertical.calculation.volume.liters;
  const independentBarrels = liters / 158.987294928;
  close(vertical.calculation.volume.oilBarrels, independentBarrels, 1e-12);
  close(vertical.calculation.volume.usGallons, liters / 3.785411784, 1e-12);
});

test("unit conversion is invariant across m, cm, mm, ft and in", () => {
  const units: { unit: LengthUnit; diameter: number; height: number }[] = [
    { unit: "m", diameter: 4, height: 5 },
    { unit: "cm", diameter: 400, height: 500 },
    { unit: "mm", diameter: 4000, height: 5000 },
    { unit: "ft", diameter: 13.123359580052492, height: 16.404199475065617 },
    { unit: "in", diameter: 157.4803149606299, height: 196.8503937007874 },
  ];
  const reference = vertical.ok ? vertical.calculation.volume.cubicMeters : NaN;
  for (const entry of units) {
    const outcome = computeCapacity({
      geometry: "vertical-cylinder",
      unit: entry.unit,
      diameter: entry.diameter,
      height: entry.height,
    });
    assert.equal(outcome.ok, true, `${entry.unit} rejected`);
    if (!outcome.ok) continue;
    close(outcome.calculation.volume.cubicMeters, reference, 1e-11);
  }
  assert.equal(LENGTH_UNITS.m.metersPerUnit, 1);
  assert.equal(LENGTH_UNITS.ft.metersPerUnit, 0.3048);
});

test("invalid dimensions are rejected with explicit codes", () => {
  const cases: { input: string | number; code: string }[] = [
    { input: "", code: "REQUIRED" },
    { input: "abc", code: "NOT_A_NUMBER" },
    { input: "0x10", code: "NOT_A_NUMBER" },
    { input: "1,5", code: "NOT_A_NUMBER" },
    { input: 0, code: "NON_POSITIVE" },
    { input: -2, code: "NON_POSITIVE" },
    { input: Number.NaN, code: "NOT_A_NUMBER" },
    { input: Number.POSITIVE_INFINITY, code: "NOT_FINITE" },
    { input: 201, code: "OUT_OF_RANGE" },
    { input: 0.001, code: "OUT_OF_RANGE" },
  ];
  for (const entry of cases) {
    const outcome = parseLength(entry.input as never, "m", "diameter");
    assert.equal(outcome.ok, false, `accepted ${String(entry.input)}`);
    if (!outcome.ok) assert.equal(outcome.problem.code, entry.code);
  }
});

test("a missing second dimension is reported, not defaulted", () => {
  const outcome = computeCapacity({
    geometry: "vertical-cylinder",
    unit: "m",
    diameter: 4,
    height: "",
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.ok(outcome.problems.some((problem) => problem.field === "height"));
  }
});

test("zero dimensions and unsupported geometry do not produce a number", () => {
  const zero = computeCapacity({
    geometry: "horizontal-cylinder",
    unit: "m",
    diameter: 3,
    length: 0,
  });
  assert.equal(zero.ok, false);
  const unsupported = computeCapacity({
    geometry: "sphere" as never,
    unit: "m",
    diameter: 3,
    length: 4,
  });
  assert.equal(unsupported.ok, false);
});

test("calculation is reproducible and does not round intermediates", () => {
  if (!vertical.ok) throw new Error("reference calculation failed");
  const again = computeCapacity({
    geometry: "vertical-cylinder",
    unit: "m",
    diameter: 4,
    height: 5,
  });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(
    again.calculation.volume.cubicMeters,
    vertical.calculation.volume.cubicMeters,
  );
  assert.notEqual(
    vertical.calculation.volume.cubicMeters,
    Math.round(vertical.calculation.volume.cubicMeters * 100) / 100,
  );
});

test("mass estimate is explicitly density-based and validated", () => {
  if (!vertical.ok) throw new Error("reference calculation failed");
  const mass = estimateMassFromDensity(
    vertical.calculation.volume.cubicMeters,
    1000,
  );
  assert.equal(mass.ok, true);
  if (!mass.ok) return;
  close(mass.tonnes, 62.83185307179586);
  assert.equal(estimateMassFromDensity(1, 0).ok, false);
  assert.equal(estimateMassFromDensity(1, Number.NaN).ok, false);
  assert.equal(estimateMassFromDensity(1, 3000).ok, false);
});

test("presentation rounding is applied only by the formatter", () => {
  assert.equal(formatDecimal(62.83185307179586, 3), "62.832");
  assert.equal(formatVolume(62831.85307179586, 1), "62,831.9");
  assert.equal(formatDecimal(Number.NaN), "—");
});

/* -------------------------------------------------------------------------- */
/* Catalogue and dates                                                        */
/* -------------------------------------------------------------------------- */

const fixedNow = new Date("2026-11-01T12:00:00Z");

test("capture date validation rejects impossible and future dates", () => {
  assert.equal(validateCaptureDate("2024-06-28", fixedNow).ok, true);
  assert.equal(validateCaptureDate("2024-02-29", fixedNow).ok, true);
  assert.equal(validateCaptureDate("2023-02-29", fixedNow).ok, false);
  assert.equal(validateCaptureDate("28-06-2024", fixedNow).ok, false);
  assert.equal(validateCaptureDate("", fixedNow).ok, false);
  assert.equal(validateCaptureDate("2027-01-01", fixedNow).ok, false);
});

test("exact-date search uses a closed UTC day interval", () => {
  assert.equal(
    dayInterval("2024-06-28"),
    "2024-06-28T00:00:00Z/2024-06-28T23:59:59Z",
  );
});

test("nearby-date windows are explicit and bounded", () => {
  const window = windowInterval("2024-06-28", 3);
  assert.equal(window.startDate, "2024-06-25");
  assert.equal(window.endDate, "2024-07-01");
  assert.equal(window.windowDays, 3);
  assert.equal(windowInterval("2024-06-28", 90).windowDays, 15);
});

test("coordinate input parsing covers common formats and rejects names", () => {
  assert.deepEqual(parseCoordinateInput("51.95, 4.14"), {
    lat: 51.95,
    lon: 4.14,
    source: "user-coordinates",
  });
  assert.equal(parseCoordinateInput("51.95N 4.14E")?.lat, 51.95);
  assert.equal(parseCoordinateInput("33.9S 18.4E")?.lat, -33.9);
  assert.equal(parseCoordinateInput("33.9 S 18.4 W")?.lon, -18.4);
  assert.equal(parseCoordinateInput("Rotterdam"), null);
  assert.equal(parseCoordinateInput("91, 4"), null);
});

test("bounding boxes are ordered, validated and capped, never expanded", () => {
  const point = bboxAroundPoint(51.95, 4.14);
  assert.ok(point[0] < point[2] && point[1] < point[3]);
  assert.ok(point[0] <= 4.14 && point[2] >= 4.14);
  const invalid = validateBbox([4, 52, 3, 51]);
  assert.equal(invalid.ok, false);
  const huge = validateBbox([-10, 40, 10, 60]);
  assert.equal(huge.ok, true);
  if (huge.ok) {
    assert.equal(huge.clamped, true);
    assert.ok(huge.bbox[2] - huge.bbox[0] <= 0.6 + 1e-9);
    assert.ok(huge.bbox[0] > -10);
  }
});

test("STAC search body uses collections, bbox and a one-day datetime", () => {
  const body = buildSearchBody({
    bbox: [4, 51.8, 4.5, 52],
    interval: dayInterval("2024-06-28"),
    collectionId: "sentinel-2-l2a",
    limit: 20,
  });
  assert.deepEqual(body.collections, ["sentinel-2-l2a"]);
  assert.equal(body.datetime, "2024-06-28T00:00:00Z/2024-06-28T23:59:59Z");
  assert.equal(body.filter, undefined);
  const withCloud = buildSearchBody({
    bbox: [4, 51.8, 4.5, 52],
    interval: dayInterval("2024-06-28"),
    collectionId: "sentinel-2-l2a",
    maxCloudPct: 20,
  });
  assert.ok(withCloud.filter);
});

const fixtureFeature = {
  type: "Feature",
  id: "S2A_MSIL2A_20240628T105031_N0510_R051_T31UFT_20240628T165157",
  bbox: [3.9, 51.7, 5.0, 52.5],
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [3.9, 51.7],
        [5.0, 51.7],
        [5.0, 52.5],
        [3.9, 52.5],
        [3.9, 51.7],
      ],
    ],
  },
  links: [
    { rel: "self", href: "https://stac.example/items/1" },
    { rel: "license", href: "https://sentinels.copernicus.eu/legal" },
  ],
  properties: {
    datetime: "2024-06-28T10:50:31.024000Z",
    published: "2024-06-28T14:09:32.588472Z",
    platform: "sentinel-2a",
    gsd: 10,
    "eo:cloud_cover": 18.66,
    "grid:code": "MGRS-31UFT",
    "sat:orbit_state": "descending",
    statistics: { water: 12.5, cloud_shadow: 1.2 },
  },
  assets: {
    TCI_10m: {
      href: "s3://eodata/TCI.jp2",
      type: "image/jp2",
      roles: ["visual"],
      "auth:refs": ["s3"],
      gsd: 10,
    },
    thumbnail: {
      href: "https://example.invalid/quicklook.jpg",
      type: "image/jpeg",
      roles: ["thumbnail", "overview"],
    },
  },
} as const;

test("STAC items map only provider-returned fields", () => {
  const scene = normalizeStacItem(fixtureFeature, "sentinel-2-l2a");
  assert.ok(scene);
  if (!scene) return;
  assert.equal(scene.itemId, fixtureFeature.id);
  assert.equal(scene.acquiredAt, "2024-06-28T10:50:31.024Z");
  assert.equal(scene.publishedAt, "2024-06-28T14:09:32.588Z");
  assert.equal(scene.cloudCoverPct, 18.66);
  assert.equal(scene.resolutionM, 10);
  assert.equal(scene.gridCode, "MGRS-31UFT");
  assert.equal(scene.thumbnailUrl, "https://example.invalid/quicklook.jpg");
  assert.equal(scene.licenseUrl, "https://sentinels.copernicus.eu/legal");
  assert.match(scene.attribution, /Copernicus Sentinel data 2024/);
  const tci = scene.assets.find((asset) => asset.key === "TCI_10m");
  assert.equal(tci?.requiresAuth, true);
  assert.equal(scene.statistics.find((s) => s.label === "water")?.value, 12.5);
});

test("provider URLs are restricted to http(s)", () => {
  const unsafe = structuredClone(fixtureFeature) as unknown as {
    assets: Record<string, { href: string }>;
    links: { rel: string; href: string }[];
  };
  unsafe.assets.thumbnail.href = "javascript:alert(1)";
  unsafe.links = [{ rel: "license", href: "javascript:alert(1)" }];
  const unsafeScene = normalizeStacItem(unsafe, "sentinel-2-l2a");
  assert.ok(unsafeScene);
  assert.equal(unsafeScene?.thumbnailUrl, null);
  assert.equal(unsafeScene?.licenseUrl, SENTINEL_LEGAL_NOTICE_URL);
});

test("items missing an acquisition timestamp are rejected, not invented", () => {
  const broken = structuredClone(fixtureFeature) as Record<string, unknown>;
  (broken.properties as Record<string, unknown>).datetime = "not-a-date";
  assert.equal(normalizeStacItem(broken, "sentinel-2-l2a"), null);
  assert.equal(normalizeStacItem({ id: "x" }, "sentinel-2-l2a"), null);
  assert.equal(normalizeStacItem(null, "sentinel-2-l2a"), null);
});

test("exact-date normalization drops differing dates and reports the count", () => {
  const otherDate = structuredClone(fixtureFeature) as Record<string, unknown>;
  (otherDate.properties as Record<string, unknown>).datetime =
    "2024-06-25T10:50:31.000Z";
  otherDate.id = "OTHER_DATE";

  const normalized = normalizeSearchResponse(
    {
      type: "FeatureCollection",
      features: [fixtureFeature, otherDate, { id: "malformed" }],
    },
    {
      requestedDate: "2024-06-28",
      collectionId: "sentinel-2-l2a",
      mode: "exact",
    },
  );

  assert.equal(normalized.scenes.length, 1);
  assert.equal(normalized.scenes[0].itemId, fixtureFeature.id);
  assert.equal(normalized.differentDateFeatures, 1);
  assert.equal(normalized.malformedFeatures, 1);
  assert.equal(normalized.returnedFeatures, 3);
});

test("cloud filtering counts exclusions instead of hiding them", () => {
  const normalized = normalizeSearchResponse(
    { features: [fixtureFeature] },
    {
      requestedDate: "2024-06-28",
      collectionId: "sentinel-2-l2a",
      mode: "exact",
      maxCloudPct: 10,
    },
  );
  assert.equal(normalized.scenes.length, 0);
  assert.equal(normalized.filteredByCloud, 1);
});

test("catalogue failures are classified distinctly", () => {
  assert.equal(classifyCatalogueFailure({ httpStatus: 401 }).kind, "auth");
  assert.equal(classifyCatalogueFailure({ httpStatus: 429 }).kind, "rate_limited");
  assert.equal(classifyCatalogueFailure({ httpStatus: 503 }).kind, "upstream");
  assert.equal(classifyCatalogueFailure({ httpStatus: 400 }).kind, "invalid_query");
  assert.equal(
    classifyCatalogueFailure({ errorName: "AbortError" }).kind,
    "timeout",
  );
  assert.equal(classifyCatalogueFailure({ errorName: "TypeError" }).kind, "network");
  assert.equal(
    classifyCatalogueFailure({ errorName: "SyntaxError" }).kind,
    "malformed",
  );
});

/* -------------------------------------------------------------------------- */
/* Scientific validation                                                      */
/* -------------------------------------------------------------------------- */

const scene = normalizeStacItem(fixtureFeature, "sentinel-2-l2a");
if (!scene) throw new Error("fixture scene failed to normalise");

test("scene checks never claim a measurable tank dimension or liquid level", () => {
  const checks = buildSceneChecks({
    requestedDate: "2024-06-28",
    scene,
    dateMatch: "exact",
  });
  const tank = checks.find((check) => check.id === "tank-scale-measurement");
  assert.equal(tank?.status, "NOT MEASURABLE");
  const level = checks.find((check) => check.id === "internal-liquid-level");
  assert.equal(level?.status, "NOT MEASURABLE");
  const inventory = checks.find((check) => check.id === "liquid-inventory");
  assert.equal(inventory?.status, "NOT APPLICABLE");
  const date = checks.find((check) => check.id === "acquisition-date");
  assert.equal(date?.status, "PASS");
});

test("cloud cover thresholds and missing values are distinct", () => {
  const high = buildSceneChecks({
    requestedDate: "2024-06-28",
    scene: { ...scene, cloudCoverPct: 55 },
    dateMatch: "exact",
  });
  assert.equal(
    high.find((check) => check.id === "cloud-cover")?.status,
    "FAIL",
  );
  const missing = buildSceneChecks({
    requestedDate: "2024-06-28",
    scene: { ...scene, cloudCoverPct: null },
    dateMatch: "exact",
  });
  assert.equal(
    missing.find((check) => check.id === "cloud-cover")?.status,
    "NOT MEASURABLE",
  );
});

test("a user-selected nearby date is warned about, not hidden", () => {
  const checks = buildSceneChecks({
    requestedDate: "2024-07-01",
    scene,
    dateMatch: "window",
  });
  const date = checks.find((check) => check.id === "acquisition-date");
  assert.equal(date?.status, "WARN");
  assert.match(date?.detail ?? "", /no image was substituted/i);
});

test("upload checks fail on a declared-date conflict and unverified provenance", () => {
  const checks = buildUploadChecks({
    requestedDate: "2024-06-28",
    summary: {
      filename: "photo.jpg",
      contentType: "image/jpeg",
      sizeBytes: 2_000_000,
      signatureOk: true,
      sha256: "abc",
      exifStatus: "present",
      exifDateOriginal: "2024-06-20T08:00:00",
      exifHasGps: false,
      width: 4000,
      height: 3000,
    },
    quality: {
      width: 4000,
      height: 3000,
      sampleWidth: 512,
      sampleHeight: 384,
      meanLuma: 120,
      stdDevLuma: 40,
      darkPixelFraction: 0.05,
      brightPixelFraction: 0.02,
      laplacianVariance: 300,
    },
  });
  assert.equal(
    checks.find((check) => check.id === "upload-capture-date")?.status,
    "FAIL",
  );
  assert.equal(
    checks.find((check) => check.id === "upload-provenance")?.status,
    "NOT VERIFIED",
  );
  assert.equal(
    checks.find((check) => check.id === "upload-tank-measurement")?.status,
    "NOT MEASURABLE",
  );
});

test("validation summary counts every status", () => {
  const checks = buildSceneChecks({
    requestedDate: "2024-06-28",
    scene,
    dateMatch: "exact",
  });
  const summary = summarizeChecks(checks);
  assert.equal(summary.total, checks.length);
  assert.ok(summary.notMeasurable >= 2);
  assert.equal(summary.headline.length > 0, true);
});

test("calculation linkage marks dimensions unverified even when the maths passes", () => {
  const none = buildCalculationChecks(null);
  assert.equal(none[0].status, "NOT APPLICABLE");
  const linked = buildCalculationChecks({
    geometryLabel: "Vertical cylinder",
    volumeM3: 62.83185307179586,
    engineVersion: "tank-math/1.0.0",
    createdAt: Date.now(),
  });
  assert.equal(linked[0].status, "PASS");
  assert.equal(linked[1].status, "NOT VERIFIED");
  assert.equal(linked[2].status, "NOT MEASURABLE");
});

/* -------------------------------------------------------------------------- */
/* EXIF and file signatures                                                   */
/* -------------------------------------------------------------------------- */

function buildSyntheticExifJpeg(): ArrayBuffer {
  const ascii = (text: string) => {
    const bytes: number[] = [];
    for (const character of text) bytes.push(character.charCodeAt(0));
    bytes.push(0);
    return bytes;
  };

  const make = ascii("TestCam");
  const date = ascii("2024:06:28 10:50:31");

  const tiffLength = 92;
  const buffer = new ArrayBuffer(tiffLength);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // TIFF header: little-endian, magic 42, IFD0 at 8
  view.setUint16(0, 0x4949, false);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  // IFD0 with two entries: Make (ASCII) and ExifIFD pointer
  view.setUint16(8, 2, true);
  const entry1 = 10;
  view.setUint16(entry1, 0x010f, true);
  view.setUint16(entry1 + 2, 2, true);
  view.setUint32(entry1 + 4, make.length, true);
  view.setUint32(entry1 + 8, 38, true);
  const entry2 = entry1 + 12;
  view.setUint16(entry2, 0x8769, true);
  view.setUint16(entry2 + 2, 4, true);
  view.setUint32(entry2 + 4, 1, true);
  view.setUint32(entry2 + 8, 46, true);
  view.setUint32(entry2 + 12, 0, true); // next IFD

  u8.set(make, 38);
  // Exif IFD at 46
  view.setUint16(46, 1, true);
  const exifEntry = 48;
  view.setUint16(exifEntry, 0x9003, true);
  view.setUint16(exifEntry + 2, 2, true);
  view.setUint32(exifEntry + 4, date.length, true);
  view.setUint32(exifEntry + 8, 66, true);
  view.setUint32(exifEntry + 12, 0, true);
  u8.set(date, 66);

  // Wrap in APP1
  const app1PayloadLength = 6 + tiffLength;
  const jpeg = new Uint8Array(2 + 2 + 2 + app1PayloadLength + 2);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg[2] = 0xff;
  jpeg[3] = 0xe1;
  jpeg[4] = (app1PayloadLength + 2) >> 8;
  jpeg[5] = (app1PayloadLength + 2) & 0xff;
  jpeg.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6);
  jpeg.set(new Uint8Array(buffer), 12);
  jpeg[jpeg.length - 2] = 0xff;
  jpeg[jpeg.length - 1] = 0xd9;
  return jpeg.buffer;
}

test("EXIF parser reads DateTimeOriginal and Make from a synthetic JPEG", () => {
  const parsed = parseJpegExif(buildSyntheticExifJpeg());
  assert.equal(parsed.status, "present");
  assert.equal(parsed.dateTimeOriginal, "2024-06-28T10:50:31");
  assert.equal(parsed.make, "TestCam");
});

test("EXIF parser fails safely on non-JPEG and truncated input", () => {
  const notJpeg = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
  assert.equal(parseJpegExif(notJpeg).status, "unreadable");
  const truncated = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00]).buffer;
  assert.equal(parseJpegExif(truncated).status, "unreadable");
});

test("file signatures are detected from magic bytes, not extensions", () => {
  assert.equal(
    detectImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
    "image/jpeg",
  );
  assert.equal(
    detectImageSignature(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "image/png",
  );
  assert.equal(
    detectImageSignature(
      new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]),
    ),
    "image/webp",
  );
  assert.equal(detectImageSignature(new Uint8Array([1, 2, 3, 4])), null);
});

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

test("report contains the required sections and never promotes estimates", () => {
  const checks = buildSceneChecks({
    requestedDate: "2024-06-28",
    scene,
    dateMatch: "exact",
  });
  const project: ResearchProjectRecord = {
    _id: "project1",
    _creationTime: Date.now(),
    title: "Test project",
    source: "catalogue",
    location: {
      label: "Rotterdam, Netherlands",
      lat: 51.92,
      lon: 4.47,
      bbox: [4.0, 51.8, 4.5, 52.0],
      source: "OpenStreetMap Nominatim",
      attribution: "© OpenStreetMap contributors",
      clamped: false,
    },
    requestedDate: "2024-06-28",
    dateMatch: "exact",
    scene,
    upload: null,
    checks,
    analysis: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const report = buildResearchReport(project, [], new Date("2026-11-01T00:00:00Z"));
  assert.ok(report.sections.length >= 16);
  const markdown = reportToMarkdown(report);
  assert.match(markdown, /internal liquid level/i);
  assert.match(markdown, /2024-06-28T10:50:31.024Z/);
  assert.match(markdown, /Generated 2026-11-01/);
  assert.match(markdown, /NOT MEASURABLE/);
  assert.match(markdown, /Contain[s]? modified Copernicus Sentinel data 2024/);
  assert.doesNotMatch(markdown, /\d+% accuracy/i);
});

/* -------------------------------------------------------------------------- */

console.log(
  `\n${passed} passed, ${failed} failed, ${passed + failed} total checks`,
);
if (failed > 0) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
