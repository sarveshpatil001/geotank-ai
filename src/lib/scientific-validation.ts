/**
 * Scientific validation engine.
 *
 * Deterministic rules only. AI output is never allowed to create, upgrade or
 * remove a check. Every check carries the basis of its evidence so the UI can
 * show why a result has its status.
 */

import type { CatalogueScene } from "./catalogue";
import { datePartOf, formatCloudCover, formatResolution } from "./catalogue";

export type CheckStatus =
  | "PASS"
  | "WARN"
  | "FAIL"
  | "NOT MEASURABLE"
  | "NOT VERIFIED"
  | "NOT APPLICABLE";

export type EvidenceBasis =
  | "provider metadata"
  | "deterministic rule"
  | "user-supplied input"
  | "client-computed image statistic"
  | "independent verification absent";

export type CheckKind = "evidence" | "scope-limit";

export type ValidationCheck = {
  id: string;
  kind: CheckKind;
  label: string;
  status: CheckStatus;
  detail: string;
  basis: EvidenceBasis;
  rule: string;
};

export type ValidationSummary = {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  notMeasurable: number;
  notVerified: number;
  notApplicable: number;
  headline: string;
};

export const CHECK_STATUS_STYLES: Record<
  CheckStatus,
  { label: string; className: string }
> = {
  PASS: {
    label: "PASS",
    className: "border-emerald/40 bg-emerald/10 text-emerald",
  },
  WARN: {
    label: "WARN",
    className: "border-warn/40 bg-warn/10 text-warn",
  },
  FAIL: {
    label: "FAIL",
    className: "border-danger/40 bg-danger/10 text-danger",
  },
  "NOT MEASURABLE": {
    label: "NOT MEASURABLE",
    className: "border-edge bg-deepgreen/60 text-mist",
  },
  "NOT VERIFIED": {
    label: "NOT VERIFIED",
    className: "border-warn/30 bg-warn/5 text-warn",
  },
  "NOT APPLICABLE": {
    label: "NOT APPLICABLE",
    className: "border-edge bg-abyss text-mist",
  },
};

export const STATUS_GLOSSARY: { status: CheckStatus; meaning: string }[] = [
  {
    status: "PASS",
    meaning:
      "A deterministic rule or provider field satisfied the stated condition.",
  },
  {
    status: "WARN",
    meaning:
      "The evidence is usable for research but has a material limitation you must carry into any conclusion.",
  },
  {
    status: "FAIL",
    meaning:
      "A required condition was not met. Do not treat this input as suitable evidence.",
  },
  {
    status: "NOT MEASURABLE",
    meaning:
      "The available data cannot support this measurement at all. The app will not estimate it.",
  },
  {
    status: "NOT VERIFIED",
    meaning:
      "A value exists but its truth has not been independently established.",
  },
  {
    status: "NOT APPLICABLE",
    meaning: "The check does not apply to this kind of record.",
  },
];

const CLOUD_RULE =
  "provider eo:cloud_cover tile statistic: ≤ 10% pass, ≤ 30% warn, > 30% warn with a tile-level limitation, missing not measurable";

/* -------------------------------------------------------------------------- */
/* Catalogue-backed records                                                    */
/* -------------------------------------------------------------------------- */

export type SceneValidationInput = {
  requestedDate: string;
  scene: CatalogueScene;
  dateMatch: "exact" | "window";
};

export function buildSceneChecks({
  requestedDate,
  scene,
  dateMatch,
}: SceneValidationInput): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const acquiredDate = datePartOf(scene.acquiredAt);

  checks.push(
    dateMatch === "exact"
      ? {
          id: "acquisition-date",
          kind: "evidence",
          label: "Acquisition date matches the requested capture date",
          status: "PASS",
          detail: `Requested ${requestedDate}. Provider acquisition timestamp is ${scene.acquiredAt} (UTC), which falls on ${acquiredDate}. The processing date is not used as the capture date.`,
          basis: "provider metadata",
          rule: "acquisition datetime (UTC) date == requested date",
        }
      : {
          id: "acquisition-date",
          kind: "evidence",
          label: "Acquisition date differs from the requested date",
          status: "WARN",
          detail: `You requested ${requestedDate} and selected a nearby-date result. Provider acquisition timestamp is ${scene.acquiredAt} (UTC). No image was substituted without your selection.`,
          basis: "provider metadata",
          rule: "user-selected nearby-date window; no silent substitution",
        },
  );

  checks.push({
    id: "catalogue-provenance",
    kind: "evidence",
    label: "Catalogue provenance is recorded",
    status: "PASS",
    detail: `${scene.providerName} (${scene.collectionName}) returned item ${scene.itemId}. The metadata below is the provider's response, not reconstructed.`,
    basis: "provider metadata",
    rule: "provider item identifier + collection present in STAC response",
  });

  checks.push(
    scene.resolutionM !== null
      ? {
          id: "resolution-recorded",
          kind: "evidence",
          label: "Spatial resolution is reported by the provider",
          status: "PASS",
          detail: `Provider-declared resolution: ${formatResolution(scene.resolutionM)}.`,
          basis: "provider metadata",
          rule: "provider properties.gsd present",
        }
      : {
          id: "resolution-recorded",
          kind: "evidence",
          label: "Spatial resolution is absent",
          status: "NOT MEASURABLE",
          detail:
            "The provider did not return a resolution for this item, so feature scale cannot be assessed.",
          basis: "provider metadata",
          rule: "provider properties.gsd present",
        },
  );

  const gsd = scene.resolutionM;
  checks.push({
    id: "tank-scale-measurement",
    kind: "scope-limit",
    label: "Tank-level dimensional measurement",
    status: "NOT MEASURABLE",
    detail:
      gsd !== null
        ? `At ${gsd} m per pixel, a typical 20–40 m diameter tank spans only ${Math.max(1, Math.floor(20 / gsd))}–${Math.max(1, Math.floor(40 / gsd))} pixels. Roof edges, shell thickness and any internal configuration cannot be resolved to engineering tolerance, and no independent ground control points are measured in this app.`
        : "Without a provider-declared ground sample distance, no image-derived tank dimension can be justified.",
    basis: "independent verification absent",
    rule:
      "image-derived geometry requires ground sample distance and independent ground control; neither is sufficient here",
  });

  if (scene.cloudCoverPct === null) {
    checks.push({
      id: "cloud-cover",
      kind: "evidence",
      label: "Cloud cover assessment",
      status: "NOT MEASURABLE",
      detail:
        "The provider did not report cloud cover for this item. Visual obstruction cannot be quantified from the available metadata.",
      basis: "provider metadata",
      rule: CLOUD_RULE,
    });
  } else if (scene.cloudCoverPct > 30) {
    checks.push({
      id: "cloud-cover",
      kind: "evidence",
      label: "Tile-level cloud cover is high",
      status: "WARN",
      detail: `Provider-reported tile-level cloud cover is ${formatCloudCover(scene.cloudCoverPct)}, above the 30% suitability threshold. This is a scene-tile statistic, not a measurement over your target; inspect the quicklook before relying on this item.`,
      basis: "provider metadata",
      rule: CLOUD_RULE,
    });
  } else if (scene.cloudCoverPct > 10) {
    checks.push({
      id: "cloud-cover",
      kind: "evidence",
      label: "Partial tile-level cloud cover",
      status: "WARN",
      detail: `Provider-reported tile-level cloud cover is ${formatCloudCover(scene.cloudCoverPct)}. Parts of the scene tile may be obscured or shadowed; this is not a target-specific measurement.`,
      basis: "provider metadata",
      rule: CLOUD_RULE,
    });
  } else {
    checks.push({
      id: "cloud-cover",
      kind: "evidence",
      label: "Tile-level cloud cover within the usable threshold",
      status: "PASS",
      detail: `Provider-reported tile-level cloud cover is ${formatCloudCover(scene.cloudCoverPct)}. It describes the scene tile, not your specific target.`,
      basis: "provider metadata",
      rule: CLOUD_RULE,
    });
  }

  const shadowStat = scene.statistics.find(
    (entry) => entry.label === "cloud_shadow",
  );
  checks.push(
    shadowStat
      ? {
          id: "cloud-shadow",
          kind: "evidence",
          label: "Cloud shadow classified by the provider",
          status: shadowStat.value > 2 ? "WARN" : "PASS",
          detail: `Provider scene classification reports ${shadowStat.value}% cloud shadow over the scene tile. This is a tile-level statistic, not an assessment of your target.`,
          basis: "provider metadata",
          rule: "provider statistics.cloud_shadow ≤ 2%",
        }
      : {
          id: "cloud-shadow",
          kind: "evidence",
          label: "Cloud shadow assessment",
          status: "NOT MEASURABLE",
          detail:
            "The provider did not include scene classification statistics, and shadow is not derived in this app.",
          basis: "provider metadata",
          rule: "provider statistics.cloud_shadow present",
        },
  );

  checks.push({
    id: "georeferencing",
    kind: "scope-limit",
    label: "Georeferencing and measurement control",
    status: "WARN",
    detail:
      "The provider footprint and coordinate reference system are recorded, but this app does not measure independent ground control points. Do not treat map overlay alignment as proof of geometric accuracy.",
    basis: "independent verification absent",
    rule: "ground control point comparison not implemented",
  });

  checks.push({
    id: "internal-liquid-level",
    kind: "scope-limit",
    label: "Internal liquid level",
    status: "NOT MEASURABLE",
    detail:
      "Optical satellite imagery observes the outside of a tank. A visible roof, floating roof or shadow does not reveal the internal liquid level, and the app will not infer one.",
    basis: "independent verification absent",
    rule: "optical imagery cannot observe internal liquid level",
  });

  checks.push({
    id: "liquid-inventory",
    kind: "scope-limit",
    label: "Liquid inventory",
    status: "NOT APPLICABLE",
    detail:
      "Inventory is a physical quantity requiring authorised measurements, tank calibration and product data. It is outside the scope of this research tool and is never inferred from imagery.",
    basis: "deterministic rule",
    rule: "inventory requires independent measurement and calibration data",
  });

  checks.push(
    scene.thumbnailUrl
      ? {
          id: "preview-availability",
          kind: "evidence",
          label: "Provider preview available",
          status: "PASS",
          detail:
            "The catalogue returned a quicklook asset. It is a rendered preview for orientation, not radiometric data and not evidence of surface condition.",
          basis: "provider metadata",
          rule: "provider asset with thumbnail/overview role present",
        }
      : {
          id: "preview-availability",
          kind: "evidence",
          label: "Provider preview unavailable",
          status: "NOT APPLICABLE",
          detail:
            "No quicklook asset was returned for this item. Metadata remains usable; no preview is fabricated.",
          basis: "provider metadata",
          rule: "provider asset with thumbnail/overview role present",
        },
  );

  checks.push({
    id: "licence",
    kind: "evidence",
    label: "Licence and attribution",
    status: "PASS",
    detail: `${scene.attribution}. ${scene.licenseUrl}`,
    basis: "provider metadata",
    rule: "provider license link or Sentinel Data Legal Notice recorded",
  });

  return checks;
}

/* -------------------------------------------------------------------------- */
/* Uploaded image records                                                      */
/* -------------------------------------------------------------------------- */

export type UploadQualityMetrics = {
  width: number;
  height: number;
  sampleWidth: number;
  sampleHeight: number;
  meanLuma: number;
  stdDevLuma: number;
  darkPixelFraction: number;
  brightPixelFraction: number;
  laplacianVariance: number;
};

export type UploadValidationInput = {
  requestedDate: string;
  summary: {
    filename: string;
    contentType: string;
    sizeBytes: number;
    signatureOk: boolean;
    sha256: string | null;
    exifStatus: "present" | "absent" | "unreadable";
    exifDateOriginal: string | null;
    exifHasGps: boolean;
    width: number | null;
    height: number | null;
  };
  quality: UploadQualityMetrics | null;
};

export const UPLOAD_LIMITS = {
  maxBytes: 12 * 1024 * 1024,
  minPixels: 256,
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
} as const;

export function buildUploadChecks({
  requestedDate,
  summary,
  quality,
}: UploadValidationInput): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  checks.push({
    id: "upload-signature",
    kind: "evidence",
    label: "File signature matches an allowed image format",
    status: summary.signatureOk ? "PASS" : "FAIL",
    detail: summary.signatureOk
      ? `The server matched the file's magic bytes to ${summary.contentType}.`
      : "The file signature did not match the declared image type. The file should not be analysed.",
    basis: "deterministic rule",
    rule: "JPEG / PNG / WebP magic-byte check",
  });

  checks.push({
    id: "upload-size",
    kind: "evidence",
    label: "File size within the configured limit",
    status:
      summary.sizeBytes > 0 && summary.sizeBytes <= UPLOAD_LIMITS.maxBytes
        ? "PASS"
        : "FAIL",
    detail: `${(summary.sizeBytes / (1024 * 1024)).toFixed(2)} MB received. Limit is ${UPLOAD_LIMITS.maxBytes / (1024 * 1024)} MB.`,
    basis: "deterministic rule",
    rule: "0 < bytes ≤ 12 MiB",
  });

  const width = summary.width ?? quality?.width ?? null;
  const height = summary.height ?? quality?.height ?? null;
  const minPixels = UPLOAD_LIMITS.minPixels;
  checks.push(
    width !== null && height !== null
      ? {
          id: "upload-dimensions",
          kind: "evidence",
          label: "Pixel dimensions are sufficient for visual review",
          status:
            Math.min(width, height) >= minPixels ? "PASS" : "WARN",
          detail: `Server-read header dimensions: ${width} × ${height} px (short edge ${Math.min(width, height)} px, threshold ${minPixels} px).`,
          basis: "deterministic rule",
          rule: `min(width, height) ≥ ${minPixels} px`,
        }
      : {
          id: "upload-dimensions",
          kind: "evidence",
          label: "Pixel dimensions could not be decoded",
          status: "FAIL",
          detail: "The image could not be decoded, so its size is unknown.",
          basis: "deterministic rule",
          rule: `min(width, height) ≥ ${minPixels} px`,
        },
  );

  checks.push({
    id: "upload-provenance",
    kind: "evidence",
    label: "Imagery source and provenance",
    status: "NOT VERIFIED",
    detail:
      "This file was supplied by you. It is not an authenticated satellite product, and no signature chain, provider identifier or acquisition record exists for it.",
    basis: "independent verification absent",
    rule: "uploaded files are never treated as authenticated catalogue products",
  });

  const exifMatch =
    summary.exifDateOriginal !== null &&
    summary.exifDateOriginal.slice(0, 10) === requestedDate;

  checks.push(
    summary.exifStatus === "present" && summary.exifDateOriginal
      ? {
          id: "upload-capture-date",
          kind: "evidence",
          label: "Entered date agrees with embedded EXIF DateTimeOriginal",
          status: exifMatch ? "PASS" : "FAIL",
          detail: exifMatch
            ? `Embedded DateTimeOriginal ${summary.exifDateOriginal} agrees with the date you entered. EXIF is metadata inside the file and can be edited, so this is corroboration, not proof.`
            : `Embedded DateTimeOriginal ${summary.exifDateOriginal} conflicts with the date you entered (${requestedDate}). The declared capture date is not supported by the file.`,
          basis: "deterministic rule",
          rule: "EXIF DateTimeOriginal date == user-entered capture date",
        }
      : {
          id: "upload-capture-date",
          kind: "evidence",
          label: "Capture date is declared by the user",
          status: "NOT VERIFIED",
          detail:
            summary.exifStatus === "unreadable"
              ? "EXIF metadata was present but could not be parsed, and the capture date you entered has no independent support."
              : "No EXIF DateTimeOriginal was found. The capture date you entered is an unverified declaration.",
          basis: "user-supplied input",
          rule: "EXIF DateTimeOriginal present and parseable",
        },
  );

  checks.push(
    summary.exifHasGps
      ? {
          id: "upload-geolocation",
          kind: "evidence",
          label: "Embedded GPS position",
          status: "WARN",
          detail:
            "The file contains EXIF GPS coordinates. They are recorded for transparency but are not used to place the research request, and they are editable metadata.",
          basis: "deterministic rule",
          rule: "EXIF GPS IFD present",
        }
      : {
          id: "upload-geolocation",
          kind: "evidence",
          label: "Image position",
          status: "NOT VERIFIED",
          detail:
            "No embedded GPS position was found. Any location for this image would be your declaration.",
          basis: "user-supplied input",
          rule: "EXIF GPS IFD present",
        },
  );

  checks.push({
    id: "upload-ground-scale",
    kind: "scope-limit",
    label: "Ground sample distance",
    status: "NOT MEASURABLE",
    detail:
      "Pixel size on the ground is unknown without camera geometry, altitude and an independent reference. Resolution in pixels is not a ground resolution.",
    basis: "independent verification absent",
    rule: "ground sample distance requires acquisition geometry",
  });

  checks.push({
    id: "upload-tank-measurement",
    kind: "scope-limit",
    label: "Image-derived tank measurement",
    status: "NOT MEASURABLE",
    detail:
      "No calibrated scale, camera model or ground control is available for an uploaded photograph or screenshot. The app will not convert pixels into engineering dimensions.",
    basis: "independent verification absent",
    rule: "no calibrated scale present",
  });

  checks.push({
    id: "upload-quality",
    kind: "evidence",
    label: "Client-computed image statistics",
    status: quality ? "PASS" : "NOT MEASURABLE",
    detail: quality
      ? `Mean luminance ${quality.meanLuma.toFixed(1)} / 255, contrast (σ) ${quality.stdDevLuma.toFixed(1)}, dark pixels ${(quality.darkPixelFraction * 100).toFixed(1)}%, near-white pixels ${(quality.brightPixelFraction * 100).toFixed(1)}%, focus proxy ${quality.laplacianVariance.toFixed(1)}. These are heuristic browser-side statistics, not a radiometric assessment.`
      : "Pixel statistics were not available for this upload.",
    basis: "client-computed image statistic",
    rule: "canvas luma statistics on a ≤512 px downscale (heuristic)",
  });

  checks.push({
    id: "internal-liquid-level",
    kind: "scope-limit",
    label: "Internal liquid level",
    status: "NOT MEASURABLE",
    detail:
      "An external image does not observe the inside of a tank. No liquid level can be inferred, whatever the visible roof or shadow pattern.",
    basis: "independent verification absent",
    rule: "external imagery cannot observe internal liquid level",
  });

  checks.push({
    id: "liquid-inventory",
    kind: "scope-limit",
    label: "Liquid inventory",
    status: "NOT APPLICABLE",
    detail:
      "Inventory requires authorised measurements and calibration data. It is outside this tool's scope and is never inferred from an uploaded file.",
    basis: "deterministic rule",
    rule: "inventory requires independent measurement",
  });

  return checks;
}

/* -------------------------------------------------------------------------- */
/* Tank calculation linkage                                                    */
/* -------------------------------------------------------------------------- */

export type CalculationEvidence = {
  geometryLabel: string;
  volumeM3: number;
  engineVersion: string;
  createdAt: number;
};

export function buildCalculationChecks(
  calculation: CalculationEvidence | null,
): ValidationCheck[] {
  if (!calculation) {
    return [
      {
        id: "capacity-calculation",
        kind: "evidence",
        label: "Theoretical capacity",
        status: "NOT APPLICABLE",
        detail:
          "No tank calculation is attached to this record. The calculator produces ideal-cylinder capacity from your own internal dimensions.",
        basis: "deterministic rule",
        rule: "calculation attached to record",
      },
    ];
  }
  return [
    {
      id: "capacity-calculation",
      kind: "evidence",
      label: "Calculation executed by the deterministic engine",
      status: "PASS",
      detail: `${calculation.geometryLabel}: ${calculation.volumeM3.toFixed(6)} m³ computed by ${calculation.engineVersion}. IEEE-754 double precision; reference values are checked by the repository test script.`,
      basis: "deterministic rule",
      rule: "V = π r² H (vertical) / V = π r² L (horizontal), engine version pinned",
    },
    {
      id: "capacity-dimensions",
      kind: "scope-limit",
      label: "Physical dimensions are independently verified",
      status: "NOT VERIFIED",
      detail:
        "The dimensions were entered by the user. The arithmetic is exact for ideal cylinder geometry but the physical truth of the inputs, wall thickness, internal fittings and dead stock are not verified.",
      basis: "user-supplied input",
      rule: "independent dimensional survey absent",
    },
    {
      id: "capacity-vs-inventory",
      kind: "scope-limit",
      label: "Measured liquid inventory",
      status: "NOT MEASURABLE",
      detail:
        "Theoretical capacity is not nominal capacity, usable capacity or measured inventory. Converting one into another requires tank calibration tables, liquid-level measurement, temperature and product data.",
      basis: "deterministic rule",
      rule: "capacity ≠ usable capacity ≠ inventory",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                     */
/* -------------------------------------------------------------------------- */

export function summarizeChecks(checks: ValidationCheck[]): ValidationSummary {
  const counts = {
    PASS: 0,
    WARN: 0,
    FAIL: 0,
    "NOT MEASURABLE": 0,
    "NOT VERIFIED": 0,
    "NOT APPLICABLE": 0,
  };
  for (const check of checks) {
    counts[check.status] += 1;
  }
  const parts: string[] = [];
  if (counts.PASS) parts.push(`${counts.PASS} passed`);
  if (counts.WARN) parts.push(`${counts.WARN} warning${counts.WARN === 1 ? "" : "s"}`);
  if (counts.FAIL) parts.push(`${counts.FAIL} failed`);
  if (counts["NOT MEASURABLE"])
    parts.push(`${counts["NOT MEASURABLE"]} not measurable`);
  if (counts["NOT VERIFIED"]) parts.push(`${counts["NOT VERIFIED"]} not verified`);
  if (counts["NOT APPLICABLE"])
    parts.push(`${counts["NOT APPLICABLE"]} not applicable`);

  return {
    total: checks.length,
    pass: counts.PASS,
    warn: counts.WARN,
    fail: counts.FAIL,
    notMeasurable: counts["NOT MEASURABLE"],
    notVerified: counts["NOT VERIFIED"],
    notApplicable: counts["NOT APPLICABLE"],
    headline: parts.join(" · ") || "No checks recorded",
  };
}

export function overallStatus(checks: ValidationCheck[]): CheckStatus {
  // Scope limits describe what the tool cannot conclude; they must not make an
  // otherwise supported record look failed or unmeasurable.
  const evidence = checks.filter((check) => check.kind !== "scope-limit");
  if (evidence.some((check) => check.status === "FAIL")) return "FAIL";
  if (evidence.some((check) => check.status === "WARN")) return "WARN";
  if (evidence.some((check) => check.status === "NOT MEASURABLE"))
    return "NOT MEASURABLE";
  return "PASS";
}
