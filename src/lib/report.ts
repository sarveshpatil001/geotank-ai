/**
 * Deterministic research report generator.
 *
 * The report is assembled from stored records only. It never upgrades the
 * status of an observation: an unverified estimate is labelled as such in the
 * report exactly as it is in the app.
 */

import { datePartOf, formatCloudCover, formatResolution, platformLabel } from "./catalogue";
import { formatCoordinate } from "./catalogue";
import { formatDecimal, formatVolume } from "./tank-geometry";
import type { CalculationRecord, ResearchProjectRecord } from "./research-types";
import { summarizeChecks } from "./scientific-validation";

export type ReportSection = {
  heading: string;
  lines: string[];
};

export type ResearchReport = {
  title: string;
  generatedAt: string;
  sections: ReportSection[];
};

const NOT_AVAILABLE = "Not available";

function statusLine(project: ResearchProjectRecord): string {
  const summary = summarizeChecks(project.checks);
  return `${summary.headline} (${summary.total} checks recorded)`;
}

export function buildResearchReport(
  project: ResearchProjectRecord,
  calculations: CalculationRecord[],
  generatedAt: Date = new Date(),
): ResearchReport {
  const scene = project.scene;
  const upload = project.upload;
  const acquiredDate = scene ? datePartOf(scene.acquiredAt) : null;

  const sections: ReportSection[] = [];

  sections.push({
    heading: "1. Research objective",
    lines: [
      `Record: ${project.title}`,
      `Record type: ${
        project.source === "catalogue"
          ? "Catalogue imagery search (provider metadata record)"
          : "User-supplied image upload (provenance unverified)"
      }`,
      "Objective: identify whether satellite imagery exists for the requested location and capture date, record the provider metadata and its limitations, and compute theoretical tank capacity from user-supplied internal dimensions where applicable.",
      "This report does not contain, and never infers, internal liquid level or liquid inventory.",
    ],
  });

  sections.push({
    heading: "2. User-entered location",
    lines: project.location
      ? [
          `Location label: ${project.location.label}`,
          `Coordinates: ${formatCoordinate(project.location.lat, project.location.lon)}`,
          `Search bounding box (west, south, east, north): ${project.location.bbox
            .map((value) => value.toFixed(5))
            .join(", ")}`,
          `Location source: ${project.location.source}`,
          `Area adjustment: ${
            project.location.clamped
              ? "The area was capped by the app's maximum search span. The requested place was not silently expanded or substituted."
              : "No span capping was applied."
          }`,
          `Geocoding attribution: ${project.location.attribution}`,
        ]
      : [
          "No location was supplied for this upload.",
          "No area search was performed: this record is a user-supplied file with a declared capture date only.",
        ],
  });

  sections.push({
    heading: "3. Requested capture date",
    lines: [
      `User-entered capture date: ${project.requestedDate}`,
      `Selection mode: ${
        project.dateMatch === "exact"
          ? "Exact-date search as entered by the user"
          : project.dateMatch === "window"
            ? "User-selected nearby-date window (the user explicitly chose this)"
            : "Upload record — date declared by the user"
      }`,
      "Semantics: the requested date is the acquisition date asked for. It is not a processing date and not a catalogue ingestion date.",
    ],
  });

  sections.push({
    heading: "4. Actual acquisition date and time",
    lines: scene
      ? [
          `Provider acquisition timestamp (UTC): ${scene.acquiredAt}`,
          `Acquisition calendar date: ${acquiredDate ?? NOT_AVAILABLE}`,
          `Processed/published timestamp returned by the provider: ${scene.publishedAt ?? "Not reported"}`,
          `Catalogue record updated at: ${scene.updatedAt ?? "Not reported"}`,
          `Date agreement with the request: ${
            project.dateMatch === "exact" && acquiredDate === project.requestedDate
              ? "Exact match"
              : "The acquisition date differs from the requested date. This record is flagged and was not substituted silently."
          }`,
        ]
      : upload
        ? [
            `Declared capture date: ${upload.declaredCaptureDate}`,
            `Embedded EXIF DateTimeOriginal: ${upload.exifDateOriginal ?? "Not present"}`,
            "No provider acquisition timestamp exists for an uploaded file, so no acquisition time can be stated.",
          ]
        : ["No imagery record is attached to this project."],
  });

  sections.push({
    heading: "5. Data source and product identifier",
    lines: scene
      ? [
          `Provider: ${scene.providerName}`,
          `Service: STAC API v1 (https://stac.dataspace.copernicus.eu/v1/)`,
          `Collection: ${scene.collectionName} (${scene.collectionId})`,
          `Product / scene identifier: ${scene.itemId}`,
          `Platform: ${platformLabel(scene.platform)}`,
          `Orbit: ${scene.orbitState ?? "Not reported"}`,
          `MGRS grid code: ${scene.gridCode ?? "Not reported"}`,
          `Provider record link: ${scene.selfUrl ?? "Not returned by the provider"}`,
          `Scene footprint bbox: ${scene.bbox ? scene.bbox.map((value) => value.toFixed(4)).join(", ") : "Not returned"}`,
        ]
      : upload
        ? [
            "Source: user upload stored in this project's private storage. Not an authenticated satellite product.",
            `Filename: ${upload.filename}`,
            `Declared MIME type: ${upload.contentType}`,
            `Size: ${(upload.sizeBytes / (1024 * 1024)).toFixed(2)} MiB`,
            `SHA-256 of the stored file: ${upload.sha256 ?? "Not computed"}`,
            `EXIF metadata: ${upload.exifStatus}`,
            `Camera make/model from EXIF: ${upload.exifMake ?? "—"} / ${upload.exifModel ?? "—"}`,
          ]
        : ["No source record."],
  });

  sections.push({
    heading: "6. Available spatial resolution",
    lines: scene
      ? [
          `Provider-declared resolution: ${formatResolution(scene.resolutionM)}`,
          scene.resolutionM !== null
            ? `Pixel ground scale limits measurement: a 20–40 m diameter tank spans approximately ${Math.max(1, Math.floor(20 / scene.resolutionM))}–${Math.max(1, Math.floor(40 / scene.resolutionM))} pixels.`
            : "Without a declared ground sample distance, feature scale cannot be assessed.",
        ]
      : [
          "Ground sample distance for an uploaded image: NOT MEASURABLE without acquisition geometry and an independent scale reference.",
        ],
  });

  sections.push({
    heading: "7. Image quality",
    lines: [
      `Provider cloud cover: ${scene ? formatCloudCover(scene.cloudCoverPct) : "Not applicable to uploads"}`,
      scene && scene.statistics.length
        ? `Provider scene classification: ${scene.statistics
            .map((entry) => `${entry.label} ${entry.value}%`)
            .join(", ")}`
        : "Provider scene classification: not returned",
      upload?.clientMetrics
        ? `Client-computed upload statistics (heuristic): mean luminance ${formatDecimal(upload.clientMetrics.meanLuma, 1)}, contrast σ ${formatDecimal(upload.clientMetrics.stdDevLuma, 1)}, focus proxy ${formatDecimal(upload.clientMetrics.laplacianVariance, 1)} on a ${upload.clientMetrics.sampleWidth}×${upload.clientMetrics.sampleHeight} downscale.`
        : "No pixel statistics were computed for this record.",
      `Preview availability: ${scene?.thumbnailUrl ? "Provider quicklook available (rendered preview, not radiometric data)" : "No preview asset"}`,
    ],
  });

  sections.push({
    heading: "8. Processing methodology",
    lines: [
      "1. Location validated and resolved to a bounded search area (user coordinates parsed directly, or OpenStreetMap Nominatim geocoding).",
      "2. Capture date validated as a real, non-future calendar date and converted to a closed UTC one-day interval.",
      "3. Catalogue query executed against the Copernicus Data Space Ecosystem STAC API (anonymous read-only search).",
      "4. Provider response normalised; only fields returned by the provider are retained, absent fields stay empty.",
      "5. Defensive exact-date filter applied; differing dates are reported, never silently substituted.",
      "6. Deterministic validation rules executed and recorded with their evidence basis.",
      "7. Any tank calculation re-executed by the pinned deterministic engine (tank-math/1.0.0) at save time.",
      "8. AI, when used, produces commentary on the recorded metadata only. It never supplies or alters a number.",
    ],
  });

  sections.push({
    heading: "9. Observations",
    lines: scene
      ? [
          `Catalogue metadata was returned by the provider for the requested area and date.`,
          `Provider-reported cloud cover: ${formatCloudCover(scene.cloudCoverPct)}.`,
          "No surface feature, tank geometry or liquid level is claimed from this image. The record is metadata-supported observation only.",
        ]
      : [
          "Uploaded image received and validated for format, size and decodability.",
          "No calibrated observation is claimed from an unverified image.",
        ],
  });

  sections.push({
    heading: "10. Calculation formulas and inputs",
    lines: calculations.length
      ? calculations.map(
          (calculation) =>
            `${calculation.geometryLabel}: ${calculation.formula} — internal diameter ${formatVolume(calculation.diameterM, 4)} m, ${
              calculation.heightM !== null ? "internal height" : "internal length"
            } ${formatVolume(calculation.heightM ?? calculation.lengthM ?? 0, 4)} m (entered in ${calculation.unit}), radius ${formatVolume(calculation.radiusM, 6)} m.`,
        )
      : [
          "No tank calculation is attached to this record.",
          "Reference formulas: vertical cylinder V = π × r² × H; horizontal cylinder full capacity V = π × r² × L.",
        ],
  });

  sections.push({
    heading: "11. Results and units",
    lines: calculations.length
      ? calculations.flatMap((calculation) => [
          `${calculation.geometryLabel} theoretical geometric capacity: ${formatVolume(calculation.volume.cubicMeters, 6)} m³ = ${formatVolume(calculation.volume.liters, 3)} L = ${formatVolume(calculation.volume.usGallons, 3)} US gal = ${formatVolume(calculation.volume.oilBarrels, 4)} bbl (oil barrel, 42 US gal).`,
        ])
      : ["No numerical result is attached to this record."],
  });

  sections.push({
    heading: "12. Validation status",
    lines: [
      `Summary: ${statusLine(project)}`,
      ...project.checks.map(
        (check) =>
          `[${check.status}] ${check.label} — ${check.detail} (basis: ${check.basis}; rule: ${check.rule})`,
      ),
    ],
  });

  sections.push({
    heading: "13. Uncertainty",
    lines: [
      "Catalogue metadata uncertainty: cloud cover, footprint and cloud-shadow values are provider-reported tile statistics, not target-specific measurements.",
      "Capacity arithmetic uncertainty: the calculation is exact for ideal cylinder geometry at IEEE-754 double precision; the physical dimensions are user-supplied and unverified, which dominates any real-world error.",
      calculations.length
        ? "No measurement uncertainty is reported for image-derived dimensions, because no image-derived dimension is produced."
        : "No measurement uncertainty is applicable: no measurement was performed.",
      "No accuracy percentage is claimed anywhere in this report.",
    ],
  });

  sections.push({
    heading: "14. Limitations",
    lines: [
      "Optical satellite imagery observes only the exterior of a tank. Internal liquid level and inventory are not observable.",
      "Sentinel-2 at 10 m is generally too coarse for accurate small-tank geometry.",
      "Clouds, shadows and viewing geometry can obscure or distort surface features.",
      "Georeferencing is provider-declared; no independent ground control points are measured in this app.",
      "An uploaded file is not an authenticated product; embedded EXIF is editable metadata.",
      "Theoretical geometric capacity is not nominal capacity, usable capacity or measured inventory.",
    ],
  });

  sections.push({
    heading: "15. References and attribution",
    lines: [
      scene ? scene.attribution : "No Copernicus data is referenced by this record.",
      "Copernicus Data Space Ecosystem STAC API: https://documentation.dataspace.copernicus.eu/APIs/STAC.html",
      "Sentinel Data Legal Notice: https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice",
      "Geocoding: OpenStreetMap Nominatim, data © OpenStreetMap contributors, ODbL 1.0.",
      "Catalogue metadata is used under the provider's terms; catalogue portal content is not redistributed.",
    ],
  });

  sections.push({
    heading: "16. Processing timestamp",
    lines: [
      `Report generated: ${generatedAt.toISOString()}`,
      `Project created: ${new Date(project.createdAt).toISOString()}`,
      `Project last updated: ${new Date(project.updatedAt).toISOString()}`,
      `Calculation engine: tank-math/1.0.0 (deterministic, independently tested).`,
      `AI analysis: ${
        project.analysis
          ? `${project.analysis.status} using ${project.analysis.model} at ${new Date(project.analysis.ranAt).toISOString()} — commentary only, no numerical authority`
          : "not run for this record"
      }`,
    ],
  });

  return {
    title: `Tank Calculator AI — research report: ${project.title}`,
    generatedAt: generatedAt.toISOString(),
    sections,
  };
}

export function reportToMarkdown(report: ResearchReport): string {
  const parts = [
    `# ${report.title}`,
    "",
    `_Generated ${report.generatedAt} by Tank Calculator AI. Statuses are reproduced exactly as recorded; unverified estimates are not presented as facts._`,
    "",
  ];
  for (const section of report.sections) {
    parts.push(`## ${section.heading}`, "");
    for (const line of section.lines) {
      parts.push(`- ${line}`);
    }
    parts.push("");
  }
  return parts.join("\n");
}

export function downloadTextFile(
  filename: string,
  contents: string,
  mimeType = "text/markdown;charset=utf-8",
): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportFilename(project: ResearchProjectRecord): string {
  const safeTitle = project.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  return `tank-calculator-ai-report-${safeTitle || "record"}-${date}.md`;
}
