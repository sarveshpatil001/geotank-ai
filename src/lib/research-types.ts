/** Shared record shapes used by the Convex backend, the report generator and
 *  the UI. Field names mirror the schema in src/convex/schema.ts. */

import type { CatalogueScene } from "./catalogue";
import type { LengthUnit, TankGeometry } from "./tank-geometry";
import type { VolumeSet } from "./tank-geometry";
import type { ImageQualityReport } from "./image-quality";
import type { ValidationCheck } from "./scientific-validation";

export type ResearchLocation = {
  label: string;
  lat: number;
  lon: number;
  bbox: [number, number, number, number];
  source: string;
  attribution: string;
  clamped: boolean;
};

export type UploadRecord = {
  storageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  sha256: string | null;
  signatureOk: boolean;
  exifStatus: "present" | "absent" | "unreadable";
  exifDateOriginal: string | null;
  exifHasGps: boolean;
  exifMake: string | null;
  exifModel: string | null;
  declaredCaptureDate: string;
  clientMetrics: ImageQualityReport | null;
};

export type AnalysisSection = { title: string; body: string };

export type AnalysisRecord = {
  status: "succeeded" | "failed" | "unavailable";
  model: string;
  ranAt: number;
  summary: string;
  sections: AnalysisSection[];
  limitations: string[];
  credits: number | null;
  error: string | null;
};

export type ArchivedCalculation = {
  geometry: TankGeometry;
  geometryLabel: string;
  formula: string;
  unit: LengthUnit;
  diameterM: number;
  secondM: number;
  volume: VolumeSet;
  engineVersion: string;
};

export type ResearchProjectRecord = {
  _id: string;
  _creationTime: number;
  title: string;
  source: "catalogue" | "upload";
  location: ResearchLocation | null;
  requestedDate: string;
  dateMatch: "exact" | "window" | "upload";
  scene: CatalogueScene | null;
  upload: UploadRecord | null;
  checks: ValidationCheck[];
  analysis: AnalysisRecord | null;
  createdAt: number;
  updatedAt: number;
  imageUrl?: string | null;
};

export type CalculationRecord = {
  _id: string;
  _creationTime: number;
  projectId: string | null;
  geometry: TankGeometry;
  geometryLabel: string;
  formula: string;
  unit: LengthUnit;
  diameterInput: number;
  secondInput: number;
  diameterM: number;
  radiusM: number;
  heightM: number | null;
  lengthM: number | null;
  volume: VolumeSet;
  engineVersion: string;
  createdAt: number;
};
