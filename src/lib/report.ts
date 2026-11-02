/**
 * Deterministic research report generator.
 *
 * The report is assembled from stored records only. It never upgrades the
 * status of an observation: an unverified estimate is labelled as such in the
 * report exactly as it is in the app.
 */

import { datePartOf, formatCloudCover, formatResolution, platformLabel } from "./catalogue";
import { formatCoordinate } from "./catalogue";
import { ENGINE_VERSION, formatDecimal, formatVolume } from "./tank-geometry";
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
    heading: "1. What this report covers",
    lines: [
      `Record: ${project.title}`,
      `Record type: ${
        project.source === "catalogue"
          ? "Copernicus image record"
          : "Your uploaded image (source not checked)"
      }`,
      "Goal: check whether a satellite image exists for the place and UTC date you asked for. Save what Copernicus returned and its limits. Work out full tank capacity from the inside sizes you entered, when you add a calculation.",
      "This report never states an internal liquid level or a liquid inventory.",
    ],
  });

  sections.push({
    heading: "2. Place you entered",
    lines: project.location
      ? [
          `Place label: ${project.location.label}`,
          `Coordinates: ${formatCoordinate(project.location.lat, project.location.lon)}`,
          `Search box (west, south, east, north): ${project.location.bbox
            .map((value) => value.toFixed(5))
            .join(", ")}`,
          `Place lookup: ${project.location.source}`,
          `Area change: ${
            project.location.clamped
              ? "The place was larger than the allowed search area, so the box was capped around its centre. The place was not changed."
              : "The search box was not capped."
          }`,
          `Lookup credit: ${project.location.attribution}`,
        ]
      : [
          "You gave no place for this upload.",
          "No area search was run. This record is an uploaded file with a UTC date you entered.",
        ],
  });

  sections.push({
    heading: "3. UTC date you asked for",
    lines: [
      `UTC date you entered: ${project.requestedDate}`,
      `How it was chosen: ${
        project.dateMatch === "exact"
          ? "Exact UTC date search"
          : project.dateMatch === "window"
            ? "UTC date range you chose (nearby dates allowed)"
            : "Upload UTC date you entered"
      }`,
      "This is the UTC date the image was taken. The match uses the UTC day of the satellite pass. It is not the processing date or the upload date.",
    ],
  });

  sections.push({
    heading: "4. When the image was captured (UTC)",
    lines: scene
      ? [
          `Capture time from Copernicus (UTC): ${scene.acquiredAt}`,
          `Capture date (UTC): ${acquiredDate ?? NOT_AVAILABLE}`,
          `Published: ${scene.publishedAt ?? "Not reported"}`,
          `Record updated: ${scene.updatedAt ?? "Not reported"}`,
          `Date match: ${
            project.dateMatch === "exact" && acquiredDate === project.requestedDate
              ? "The UTC capture date matches the UTC date you asked for"
              : "The UTC capture date is not the UTC date you asked for. This record flags the difference and no image was substituted silently."
          }`,
        ]
      : upload
        ? [
            `UTC date you entered: ${upload.declaredCaptureDate}`,
            `EXIF capture time: ${upload.exifDateOriginal ?? "Not present"}`,
            "An uploaded file has no Copernicus capture time.",
          ]
        : ["No image record is attached to this project."],
  });

  sections.push({
    heading: "5. Source and image ID",
    lines: scene
      ? [
          `Source: ${scene.providerName}`,
          `Service: Copernicus image service (STAC API v1, https://stac.dataspace.copernicus.eu/v1/)`,
          `Collection: ${scene.collectionName} (${scene.collectionId})`,
          `Image ID: ${scene.itemId}`,
          `Satellite: ${platformLabel(scene.platform)}`,
          `Orbit: ${scene.orbitState ?? "Not reported"}`,
          `Map square: ${scene.gridCode ?? "Not reported"}`,
          `Copernicus record: ${scene.selfUrl ?? "Not returned by Copernicus"}`,
          `Image box: ${scene.bbox ? scene.bbox.map((value) => value.toFixed(4)).join(", ") : "Not returned"}`,
        ]
      : upload
        ? [
            "Source: your upload, stored in this project's private storage. This is not a checked satellite product.",
            `File name: ${upload.filename}`,
            `File type: ${upload.contentType}`,
            `Size: ${(upload.sizeBytes / (1024 * 1024)).toFixed(2)} MiB`,
            `File fingerprint (SHA-256): ${upload.sha256 ?? "Not computed"}`,
            `EXIF data: ${upload.exifStatus}`,
            `Camera from EXIF: ${upload.exifMake ?? "—"} / ${upload.exifModel ?? "—"}`,
          ]
        : ["No source record."],
  });

  sections.push({
    heading: "6. Pixel size",
    lines: scene
      ? [
          `Pixel size from Copernicus: ${formatResolution(scene.resolutionM)}`,
          scene.resolutionM !== null
            ? `At this pixel size, a 20–40 m tank is only about ${Math.max(1, Math.floor(20 / scene.resolutionM))}–${Math.max(1, Math.floor(40 / scene.resolutionM))} pixels wide.`
            : "Copernicus reported no pixel size, so feature scale cannot be checked.",
        ]
      : [
          "Ground scale for an uploaded image: NOT MEASURABLE without capture position and a scale reference.",
        ],
  });

  sections.push({
    heading: "7. Image quality",
    lines: [
      `Cloud cover from Copernicus: ${scene ? formatCloudCover(scene.cloudCoverPct) : "Not applicable to an upload"}`,
      scene && scene.statistics.length
        ? `Copernicus tile breakdown: ${scene.statistics
            .map((entry) => `${entry.label} ${entry.value}%`)
            .join(", ")}`
        : "Copernicus tile breakdown: not returned",
      upload?.clientMetrics
        ? `Basic numbers from your browser: mean brightness ${formatDecimal(upload.clientMetrics.meanLuma, 1)}, contrast ${formatDecimal(upload.clientMetrics.stdDevLuma, 1)}, focus ${formatDecimal(upload.clientMetrics.laplacianVariance, 1)} on a ${upload.clientMetrics.sampleWidth}×${upload.clientMetrics.sampleHeight} downscale.`
        : "No image statistics were computed for this record.",
      `Preview: ${scene?.thumbnailUrl ? "Copernicus preview available (for orientation only, not measurement data)" : "No preview available"}`,
    ],
  });

  sections.push({
    heading: "8. How the record was made",
    lines: [
      "1. The place was checked and turned into a capped search box. You either entered coordinates or chose an OpenStreetMap result.",
      "2. The UTC capture date was checked as a real date that is not in the future. It was turned into one full UTC day.",
      "3. The app sent a public, read-only search to Copernicus.",
      "4. Only fields returned by Copernicus were saved. Missing fields stay empty.",
      "5. A UTC date check was applied. Different dates are reported, never swapped in silently.",
      "6. Fixed rules ran and each result kept a note of where its evidence came from.",
      `7. Any tank calculation was run again by the fixed engine (${ENGINE_VERSION}) when saved.`,
      "8. AI, when used, comments on the saved data only. It cannot change a number or a check status.",
    ],
  });

  sections.push({
    heading: "9. What was observed",
    lines: scene
      ? [
          project.dateMatch === "window"
            ? acquiredDate === project.requestedDate
              ? "Copernicus returned image data inside the nearby-date window you chose. The UTC capture date happens to match the UTC date you asked for."
              : "Copernicus returned image data inside the nearby-date window you chose. The UTC capture date is not the UTC date you asked for. The report flags this and no image was substituted silently."
            : "Copernicus returned image data for your search box and exact UTC date.",
          `Cloud cover from Copernicus: ${formatCloudCover(scene.cloudCoverPct)}.`,
          "The app does not claim a surface feature, tank size or liquid level from this image. This record is saved image data only.",
        ]
      : [
          "The uploaded image passed the format, size and image-opening checks.",
          "The app does not claim a checked measurement from an unchecked image.",
        ],
  });

  sections.push({
    heading: "10. Tank formulas and inputs",
    lines: calculations.length
      ? calculations.map(
          (calculation) =>
            `${calculation.geometryLabel}: ${calculation.formula}. You entered diameter ${calculation.diameterInput} ${calculation.unit} and ${
              calculation.heightM !== null ? "height" : "length"
            } ${calculation.secondInput} ${calculation.unit}. Converted inside diameter: ${formatVolume(calculation.diameterM, 4)} m. Inside ${
              calculation.heightM !== null ? "height" : "length"
            }: ${formatVolume(calculation.heightM ?? calculation.lengthM ?? 0, 4)} m. Radius: ${formatVolume(calculation.radiusM, 6)} m. Engine: ${calculation.engineVersion}.`,
        )
      : [
          "No tank calculation is attached to this record.",
          "Formulas: upright cylinder V = π × r² × H. Horizontal cylinder full capacity V = π × r² × L.",
        ],
  });

  sections.push({
    heading: "11. Results and units",
    lines: calculations.length
      ? calculations.flatMap((calculation) => [
          `${calculation.geometryLabel} full capacity: ${formatVolume(calculation.volume.cubicMeters, 6)} m³ = ${formatVolume(calculation.volume.liters, 3)} L = ${formatVolume(calculation.volume.usGallons, 3)} US gal = ${formatVolume(calculation.volume.oilBarrels, 4)} bbl (oil barrel, 42 US gal).`,
        ])
      : ["No number is attached to this record."],
  });

  sections.push({
    heading: "12. Check results",
    lines: [
      `Summary: ${statusLine(project)}`,
      ...project.checks.map(
        (check) =>
          `[${check.status}] ${check.label} — ${check.detail} (source: ${check.basis}; rule: ${check.rule})`,
      ),
    ],
  });

  sections.push({
    heading: "13. Uncertainty",
    lines: [
      "Image data: cloud cover, outline and cloud-shadow values are Copernicus tile numbers, not measurements of your target.",
      "Tank capacity: the maths is exact for a perfect cylinder. The sizes came from you and are not checked, and that is the largest source of error.",
      calculations.length
        ? "No measurement error is given for image-based sizes, because the app does not produce any."
        : "No measurement error applies, because no measurement was made.",
      "No accuracy percentage is claimed anywhere in this report.",
    ],
  });

  sections.push({
    heading: "14. Limits",
    lines: [
      "Satellite images show only the outside of a tank. They cannot show the internal liquid level or inventory.",
      "Sentinel-2 at 10 m is too coarse to measure a small tank accurately.",
      "Cloud, shadow and view angle can hide or distort surface features.",
      "Map position comes from Copernicus. The app measures no independent ground control points.",
      "An uploaded file is not a checked product. EXIF inside the file can be edited.",
      "Full capacity from a formula is not rated capacity, usable capacity or measured inventory.",
    ],
  });

  sections.push({
    heading: "15. Credit and references",
    lines: [
      scene ? scene.attribution : "This record does not use Copernicus data.",
      "Copernicus Data Space Ecosystem STAC API: https://documentation.dataspace.copernicus.eu/APIs/STAC.html",
      "Sentinel Data Legal Notice: https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice",
      "Place lookup: OpenStreetMap Nominatim, data © OpenStreetMap contributors, ODbL 1.0.",
      "Copernicus image data is used under its terms. The app does not redistribute Copernicus portal content.",
    ],
  });

  sections.push({
    heading: "16. Processing timestamp",
    lines: [
      `Report generated: ${generatedAt.toISOString()}`,
      `Record created: ${new Date(project.createdAt).toISOString()}`,
      `Record last updated: ${new Date(project.updatedAt).toISOString()}`,
      `Calculation engine: ${ENGINE_VERSION} (fixed rules, independently tested).`,
      calculations.length > 0
        ? `Stored calculation engine version(s): ${[...new Set(calculations.map((calculation) => calculation.engineVersion))].join(", ")}.`
        : "No stored calculation engine version applies to this record.",
      `AI commentary: ${
        project.analysis
          ? `${project.analysis.status} using ${project.analysis.model} at ${new Date(project.analysis.ranAt).toISOString()}. Commentary only. It has no authority over numbers or check statuses.`
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
    `_Generated ${report.generatedAt} by Tank Calculator AI. Statuses are copied as recorded. Estimates are not shown as facts._`,
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
