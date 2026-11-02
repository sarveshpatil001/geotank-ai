import type { Doc } from "../_generated/dataModel";

export const WITHHELD_COORDINATES_LABEL =
  "user-entered coordinates (withheld)";

const COORDINATE_LABEL =
  /^\s*[-+]?\d{1,3}(?:\.\d+)?\s*°?\s*[NS]?\s*[,;]\s*[-+]?\d{1,3}(?:\.\d+)?\s*°?\s*[EW]?\s*$/i;

function isCoordinateSource(source: string): boolean {
  return /coordinates/i.test(source);
}

/**
 * The model gets context, not a location fix. Coordinate values are replaced;
 * geocoder display names are reduced to the last two administrative components
 * (for example "South Holland, Netherlands").
 */
export function privateLocationLabel(location: {
  label: string;
  source: string;
}): string {
  if (isCoordinateSource(location.source) || COORDINATE_LABEL.test(location.label)) {
    return WITHHELD_COORDINATES_LABEL;
  }

  const parts = location.label
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) return "location label not reported";
  return parts.slice(-2).join(", ");
}

/**
 * Builds the complete object sent to the model. Keep this function as the only
 * place where project metadata becomes prompt input: filenames, coordinates
 * and free-text titles must never be added here.
 */
export function buildAiPayload(project: Doc<"researchProjects">) {
  const scene = project.scene;
  const upload = project.upload;
  const location = project.location;

  return {
    recordType: project.source,
    requestedCaptureDate: project.requestedDate,
    dateMatchSemantics: project.dateMatch,
    location: location
      ? {
          label: privateLocationLabel(location),
          source: isCoordinateSource(location.source)
            ? "user-provided coordinates (values withheld)"
            : location.source,
          attribution: location.attribution,
          searchAreaClamped: location.clamped,
        }
      : null,
    catalogue: scene
      ? {
          provider: scene.providerName,
          collection: scene.collectionName,
          collectionId: scene.collectionId,
          itemId: scene.itemId,
          acquiredAtUtc: scene.acquiredAt,
          publishedAtUtc: scene.publishedAt,
          platform: scene.platform,
          orbitState: scene.orbitState,
          gridCode: scene.gridCode,
          declaredResolutionMetres: scene.resolutionM,
          cloudCoverPercent: scene.cloudCoverPct,
          licenceUrl: scene.licenseUrl,
          providerSceneStatistics: scene.statistics,
          quicklookPreviewAvailable: Boolean(scene.thumbnailUrl),
        }
      : null,
    upload: upload
      ? {
          // Filenames can contain addresses, equipment names or personal names.
          declaredMimeType: upload.contentType,
          sizeBytes: upload.sizeBytes,
          exifStatus: upload.exifStatus,
          exifHasGps: upload.exifHasGps,
          provenance:
            "user-supplied file, not an authenticated satellite product",
          clientImageStatistics: upload.clientMetrics,
        }
      : null,
    deterministicChecks: project.checks.map((check) => ({
      label: check.label,
      status: check.status,
      basis: check.basis,
    })),
    factsYouMustNotChange: [
      "Validation statuses above are fixed.",
      "No volume, dimension or liquid level value is supplied to you; do not produce one.",
    ],
  };
}
