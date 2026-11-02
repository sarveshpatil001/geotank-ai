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
    meaning: "The check met its rule.",
  },
  {
    status: "WARN",
    meaning: "The check passed, but there is a limit to keep in mind.",
  },
  {
    status: "FAIL",
    meaning: "The check did not pass. Do not rely on this input.",
  },
  {
    status: "NOT MEASURABLE",
    meaning: "The data cannot support this measurement. The app will not guess.",
  },
  {
    status: "NOT VERIFIED",
    meaning:
      "A value exists, but no independent source has confirmed it.",
  },
  {
    status: "NOT APPLICABLE",
    meaning: "This check does not apply to this record.",
  },
];

const CLOUD_RULE =
  "Cloud cover from Copernicus: 10% or less passes, 10–30% is a warning, over 30% is a warning with a tile limit, missing is cannot measure";

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
          label: "Capture date matches the date you asked for",
          status: "PASS",
          detail: `You asked for ${requestedDate}. Copernicus gives ${scene.acquiredAt} (UTC), which is ${acquiredDate}. The processing date is not used as the capture date.`,
          basis: "provider metadata",
          rule: "Capture date in UTC equals the date you asked for",
        }
      : {
          id: "acquisition-date",
          kind: "evidence",
          label: "Capture date is different from the date you asked for",
          status: "WARN",
          detail: `You asked for ${requestedDate} and chose a nearby-date result. Copernicus gives ${scene.acquiredAt} (UTC). No image was substituted without your choice.`,
          basis: "provider metadata",
          rule: "You chose a nearby date; no silent replacement",
        },
  );

  checks.push({
    id: "catalogue-provenance",
    kind: "evidence",
    label: "Copernicus source is recorded",
    status: "PASS",
    detail: `${scene.providerName} (${scene.collectionName}) returned image ${scene.itemId}. The data below is the response from Copernicus, not a rebuild.`,
    basis: "provider metadata",
    rule: "Image ID and collection returned by Copernicus",
  });

  checks.push(
    scene.resolutionM !== null
      ? {
          id: "resolution-recorded",
          kind: "evidence",
          label: "Copernicus reports a pixel size",
          status: "PASS",
          detail: `The pixel size from Copernicus is ${formatResolution(scene.resolutionM)}.`,
          basis: "provider metadata",
          rule: "Pixel size returned by Copernicus",
        }
      : {
          id: "resolution-recorded",
          kind: "evidence",
          label: "No pixel size reported",
          status: "NOT MEASURABLE",
          detail:
            "Copernicus did not return a pixel size for this image, so feature scale cannot be checked.",
          basis: "provider metadata",
          rule: "Pixel size returned by Copernicus",
        },
  );

  const gsd = scene.resolutionM;
  checks.push({
    id: "tank-scale-measurement",
    kind: "scope-limit",
    label: "Measuring a tank from the image",
    status: "NOT MEASURABLE",
    detail:
      gsd !== null
        ? `Each pixel covers ${gsd} m. A 20–40 m tank is only ${Math.max(1, Math.floor(20 / gsd))}–${Math.max(1, Math.floor(40 / gsd))} pixels wide. Roof edges, wall thickness and inside parts cannot be measured to engineering accuracy. The app also measures no independent ground control points.`
        : "Without a pixel size from Copernicus, the app cannot justify a tank size from the image.",
    basis: "independent verification absent",
    rule:
      "A tank size from an image needs a pixel size and ground control points; neither is enough here",
  });

  if (scene.cloudCoverPct === null) {
    checks.push({
      id: "cloud-cover",
      kind: "evidence",
      label: "Cloud cover check",
      status: "NOT MEASURABLE",
      detail:
        "Copernicus did not report cloud cover for this image. The app cannot measure visual blockage from the saved data.",
      basis: "provider metadata",
      rule: CLOUD_RULE,
    });
  } else if (scene.cloudCoverPct > 30) {
    checks.push({
      id: "cloud-cover",
      kind: "evidence",
      label: "Cloud cover is high",
      status: "WARN",
      detail: `Copernicus reports tile-level cloud cover of ${formatCloudCover(scene.cloudCoverPct)}, above the 30% limit. This is a tile number, not a measurement over your target. Check the preview before you rely on this image.`,
      basis: "provider metadata",
      rule: CLOUD_RULE,
    });
  } else if (scene.cloudCoverPct > 10) {
    checks.push({
      id: "cloud-cover",
      kind: "evidence",
      label: "Some cloud cover",
      status: "WARN",
      detail: `Copernicus reports tile-level cloud cover of ${formatCloudCover(scene.cloudCoverPct)}. Some of the tile may be cloudy or shadowed. This is not a measurement of your target.`,
      basis: "provider metadata",
      rule: CLOUD_RULE,
    });
  } else {
    checks.push({
      id: "cloud-cover",
      kind: "evidence",
      label: "Cloud cover is low",
      status: "PASS",
      detail: `Copernicus reports tile-level cloud cover of ${formatCloudCover(scene.cloudCoverPct)}. This is for the whole tile, not your target.`,
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
          label: "Copernicus maps cloud shadow",
          status: shadowStat.value > 2 ? "WARN" : "PASS",
          detail: `Copernicus reports ${shadowStat.value}% cloud shadow over the tile. This is a tile number, not a check of your target.`,
          basis: "provider metadata",
          rule: "Cloud shadow from Copernicus is 2% or less",
        }
      : {
          id: "cloud-shadow",
          kind: "evidence",
          label: "Cloud shadow check",
          status: "NOT MEASURABLE",
          detail:
            "Copernicus did not include cloud shadow data, and the app does not estimate it.",
          basis: "provider metadata",
          rule: "Cloud shadow data returned by Copernicus",
        },
  );

  checks.push({
    id: "georeferencing",
    kind: "scope-limit",
    label: "Map position and ground control",
    status: "WARN",
    detail:
      "Copernicus supplies the outline and coordinate system. The app measures no independent ground control points. Do not treat a good fit on the map as proof of accuracy.",
    basis: "independent verification absent",
    rule: "No independent ground control points measured",
  });

  checks.push({
    id: "internal-liquid-level",
    kind: "scope-limit",
    label: "Liquid level inside the tank",
    status: "NOT MEASURABLE",
    detail:
      "Satellite images show the outside of a tank. A roof, floating roof or shadow does not show the liquid level, and the app will not guess.",
    basis: "independent verification absent",
    rule: "An outside image cannot show the level inside a tank",
  });

  checks.push({
    id: "liquid-inventory",
    kind: "scope-limit",
    label: "Liquid inventory",
    status: "NOT APPLICABLE",
    detail:
      "Inventory needs approved measurements, tank calibration and product data. This research tool does not estimate it from images.",
    basis: "deterministic rule",
    rule: "Inventory needs independent measurement and calibration data",
  });

  checks.push(
    scene.thumbnailUrl
      ? {
          id: "preview-availability",
          kind: "evidence",
          label: "Preview image from Copernicus",
          status: "PASS",
          detail:
            "Copernicus returned a preview. It is for orientation only. It is not measurement data and does not show surface condition.",
          basis: "provider metadata",
          rule: "Preview file returned by Copernicus",
        }
      : {
          id: "preview-availability",
          kind: "evidence",
          label: "No preview image",
          status: "NOT APPLICABLE",
          detail:
            "Copernicus returned no preview for this image. The metadata is still usable. The app does not make up an image.",
          basis: "provider metadata",
          rule: "Preview file returned by Copernicus",
        },
  );

  checks.push({
    id: "licence",
    kind: "evidence",
    label: "Licence and credit",
    status: "PASS",
    detail: `${scene.attribution}. ${scene.licenseUrl}`,
    basis: "provider metadata",
    rule: "Licence link or Sentinel Data Legal Notice recorded",
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
    label: "File type is allowed",
    status: summary.signatureOk ? "PASS" : "FAIL",
    detail: summary.signatureOk
      ? `The server matched the file bytes to ${summary.contentType}.`
      : "The file bytes do not match the stated image type. Do not use this file.",
    basis: "deterministic rule",
    rule: "JPEG, PNG or WebP file check",
  });

  checks.push({
    id: "upload-size",
    kind: "evidence",
label: "File size is within the limit",
    status:
      summary.sizeBytes > 0 && summary.sizeBytes <= UPLOAD_LIMITS.maxBytes
        ? "PASS"
        : "FAIL",
    detail: `${(summary.sizeBytes / (1024 * 1024)).toFixed(2)} MB received. Limit is ${UPLOAD_LIMITS.maxBytes / (1024 * 1024)} MB.`,
    basis: "deterministic rule",
    rule: "File is larger than 0 bytes and no more than 12 MiB",
  });

  const width = summary.width ?? quality?.width ?? null;
  const height = summary.height ?? quality?.height ?? null;
  const minPixels = UPLOAD_LIMITS.minPixels;
  checks.push(
    width !== null && height !== null
      ? {
          id: "upload-dimensions",
          kind: "evidence",
          label: "Image is large enough to view",
          status:
            Math.min(width, height) >= minPixels ? "PASS" : "WARN",
          detail: `The server read ${width} × ${height} px. The short edge is ${Math.min(width, height)} px. The minimum is ${minPixels} px.`,
          basis: "deterministic rule",
          rule: `Short edge is at least ${minPixels} px`,
        }
      : {
          id: "upload-dimensions",
          kind: "evidence",
label: "Image size could not be read",
          status: "FAIL",
          detail: "The image could not be decoded, so its size is unknown.",
          basis: "deterministic rule",
          rule: `Short edge is at least ${minPixels} px`,
        },
  );

  checks.push({
    id: "upload-provenance",
    kind: "evidence",
    label: "Where the image came from",
    status: "NOT VERIFIED",
    detail:
      "You supplied this file. It is not a checked satellite product. It has no Copernicus record or signed source.",
    basis: "independent verification absent",
    rule: "Uploaded files are never treated as checked satellite products",
  });

  const exifMatch =
    summary.exifDateOriginal !== null &&
    summary.exifDateOriginal.slice(0, 10) === requestedDate;

  checks.push(
    summary.exifStatus === "present" && summary.exifDateOriginal
      ? {
          id: "upload-capture-date",
          kind: "evidence",
          label: "Entered date matches the photo's EXIF date",
          status: exifMatch ? "PASS" : "FAIL",
          detail: exifMatch
            ? `The EXIF date is ${summary.exifDateOriginal}. It matches the date you entered. EXIF is data inside the file and can be edited, so it supports your date but does not prove it.`
            : `The EXIF date is ${summary.exifDateOriginal}. It does not match the date you entered (${requestedDate}). The file does not support your date.`,
          basis: "deterministic rule",
          rule: "EXIF capture date equals the date you entered",
        }
      : {
          id: "upload-capture-date",
          kind: "evidence",
          label: "You entered the capture date",
          status: "NOT VERIFIED",
          detail:
            summary.exifStatus === "unreadable"
              ? "EXIF data was present but could not be read. Nothing independent supports the date you entered."
              : "No EXIF capture date was found. The date you entered is not checked.",
          basis: "user-supplied input",
          rule: "EXIF capture date is present and readable",
        },
  );

  checks.push(
    summary.exifHasGps
      ? {
          id: "upload-geolocation",
          kind: "evidence",
          label: "GPS position in the file",
          status: "WARN",
          detail:
            "The file contains EXIF GPS coordinates. They are saved for transparency but are not used to place the search. EXIF can be edited.",
          basis: "deterministic rule",
          rule: "EXIF GPS data is present",
        }
      : {
          id: "upload-geolocation",
          kind: "evidence",
          label: "Image location",
          status: "NOT VERIFIED",
          detail:
            "No GPS position was found in the file. Any location for this image would come from you.",
          basis: "user-supplied input",
          rule: "EXIF GPS data is present",
        },
  );

  checks.push({
    id: "upload-ground-scale",
    kind: "scope-limit",
    label: "Ground scale",
    status: "NOT MEASURABLE",
    detail:
      "The ground size of each pixel is unknown without camera position, height and an independent scale reference. Pixel count is not ground distance.",
    basis: "independent verification absent",
    rule: "Ground scale needs capture position and camera data",
  });

  checks.push({
    id: "upload-tank-measurement",
    kind: "scope-limit",
    label: "Tank measurement from the image",
    status: "NOT MEASURABLE",
    detail:
      "An uploaded photo or screenshot has no calibrated scale, camera model or ground control. The app will not turn pixels into engineering sizes.",
    basis: "independent verification absent",
    rule: "No calibrated scale is present",
  });

  checks.push({
    id: "upload-quality",
    kind: "evidence",
    label: "Image statistics from this browser",
    status: quality ? "PASS" : "NOT MEASURABLE",
    detail: quality
      ? `Mean brightness ${quality.meanLuma.toFixed(1)} / 255, contrast ${quality.stdDevLuma.toFixed(1)}, dark pixels ${(quality.darkPixelFraction * 100).toFixed(1)}%, near-white pixels ${(quality.brightPixelFraction * 100).toFixed(1)}%, focus ${quality.laplacianVariance.toFixed(1)}. These are rough numbers from the browser, not a scientific image check.`
      : "Pixel statistics were not available for this upload.",
    basis: "client-computed image statistic",
    rule: "Rough brightness check on an image no larger than 512 px",
  });

  checks.push({
    id: "internal-liquid-level",
    kind: "scope-limit",
    label: "Liquid level inside the tank",
    status: "NOT MEASURABLE",
    detail:
      "An outside image does not show the inside of a tank. The app cannot infer a liquid level from a roof or shadow.",
    basis: "independent verification absent",
    rule: "An outside image cannot show the level inside a tank",
  });

  checks.push({
    id: "liquid-inventory",
    kind: "scope-limit",
    label: "Liquid inventory",
    status: "NOT APPLICABLE",
    detail:
      "Inventory needs approved measurements and calibration data. This tool does not estimate it from an uploaded file.",
    basis: "deterministic rule",
    rule: "Inventory needs independent measurement",
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
        label: "Tank capacity",
        status: "NOT APPLICABLE",
        detail:
          "No tank calculation is attached. The calculator works out perfect-cylinder capacity from sizes you enter.",
        basis: "deterministic rule",
        rule: "A calculation is attached to the record",
      },
    ];
  }
  return [
    {
      id: "capacity-calculation",
      kind: "evidence",
      label: "Capacity calculated by the fixed engine",
      status: "PASS",
      detail: `${calculation.geometryLabel}: ${calculation.volumeM3.toFixed(6)} m³ from ${calculation.engineVersion}. The test script checks reference values.`,
      basis: "deterministic rule",
      rule: "V = π r² H for an upright tank, V = π r² L for a tank on its side; engine version fixed",
    },
    {
      id: "capacity-dimensions",
      kind: "scope-limit",
      label: "Physical sizes are independently checked",
      status: "NOT VERIFIED",
      detail:
        "You entered the sizes. The maths is exact for a perfect cylinder, but no one has checked the real sizes, wall thickness, inside fittings or dead stock.",
      basis: "user-supplied input",
      rule: "No independent size survey",
    },
    {
      id: "capacity-vs-inventory",
      kind: "scope-limit",
      label: "Measured liquid inventory",
      status: "NOT MEASURABLE",
      detail:
        "Full capacity is not rated capacity, usable capacity or measured inventory. Converting between them needs tank tables, a liquid-level reading, temperature and product data.",
      basis: "deterministic rule",
      rule: "Full capacity is not usable capacity or inventory",
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
