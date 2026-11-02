import { describe, expect, it } from "vitest";

import {
  buildAiPayload,
  privateLocationLabel,
  WITHHELD_COORDINATES_LABEL,
} from "../src/convex/lib/aiPayload";

describe("AI metadata minimisation", () => {
  it("withholds user-entered coordinate values", () => {
    expect(
      privateLocationLabel({
        label: "51.9500, 4.1400",
        source: "User-provided coordinates",
      }),
    ).toBe(WITHHELD_COORDINATES_LABEL);

    expect(
      privateLocationLabel({
        label: "51.95, 4.14",
        source: "OpenStreetMap Nominatim",
      }),
    ).toBe(WITHHELD_COORDINATES_LABEL);
  });

  it("keeps only the last two place-label components", () => {
    expect(
      privateLocationLabel({
        label:
          "Stadhuis, Coolsingel 40, Rotterdam, South Holland, Netherlands",
        source: "OpenStreetMap Nominatim",
      }),
    ).toBe("South Holland, Netherlands");
  });

  it("never includes a filename or exact coordinates in the model payload", () => {
    const payload = buildAiPayload({
      _id: "project-id",
      _creationTime: 1,
      userId: "user-id",
      title: "secret site",
      source: "upload",
      location: {
        label: "51.9500, 4.1400",
        lat: 51.95,
        lon: 4.14,
        bbox: [4.13, 51.94, 4.15, 51.96],
        source: "User-provided coordinates",
        attribution: "user",
        clamped: false,
      },
      requestedDate: "2024-06-28",
      dateMatch: "upload",
      scene: null,
      upload: {
        storageId: "storage-id",
        filename: "private-tank-photo.jpg",
        contentType: "image/jpeg",
        sizeBytes: 2048,
        width: 640,
        height: 480,
        sha256: "abc",
        signatureOk: true,
        exifStatus: "absent",
        exifDateOriginal: null,
        exifHasGps: false,
        exifMake: null,
        exifModel: null,
        declaredCaptureDate: "2024-06-28",
        clientMetrics: null,
      },
      checks: [],
      analysis: null,
      createdAt: 1,
      updatedAt: 1,
    } as never);

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("51.95");
    expect(serialized).not.toContain("4.14");
    expect(serialized).not.toContain("private-tank-photo.jpg");
    expect(payload.location?.label).toBe(WITHHELD_COORDINATES_LABEL);
    expect(payload.upload).not.toHaveProperty("filename");
  });
});
